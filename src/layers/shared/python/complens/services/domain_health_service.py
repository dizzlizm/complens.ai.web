"""Domain health check service.

Performs DNS authentication checks (SPF, DKIM, DMARC), blacklist lookups,
and computes a 0-100 health score combining auth, reputation, and engagement.
"""

from typing import Any

import structlog

logger = structlog.get_logger()


class DomainHealthService:
    """Service for checking domain DNS health and computing reputation scores.

    Uses checkdmarc for SPF/DMARC/MX validation and pydnsbl for blacklist
    lookups. Libraries are lazy-imported to avoid cold-start penalty on
    endpoints that don't need them.
    """

    def check_dns(self, domain: str) -> dict[str, Any]:
        """Run DNS checks for a domain (SPF, DMARC, MX, blacklists).

        Each sub-check is wrapped in try/except so partial results are
        returned if one check fails.

        Args:
            domain: The email sending domain to check.

        Returns:
            Dict with spf, dmarc, mx, blacklist results, and errors list.
        """
        result: dict[str, Any] = {
            "spf_valid": False,
            "spf_record": None,
            "dmarc_valid": False,
            "dmarc_record": None,
            "dmarc_policy": None,
            "mx_valid": False,
            "mx_hosts": [],
            "blacklisted": False,
            "blacklist_listings": [],
            "errors": [],
        }

        # SPF / DMARC / MX via checkdmarc
        spf_dmarc = self._check_spf_dmarc(domain)
        result.update({
            "spf_valid": spf_dmarc.get("spf_valid", False),
            "spf_record": spf_dmarc.get("spf_record"),
            "dmarc_valid": spf_dmarc.get("dmarc_valid", False),
            "dmarc_record": spf_dmarc.get("dmarc_record"),
            "dmarc_policy": spf_dmarc.get("dmarc_policy"),
            "mx_valid": spf_dmarc.get("mx_valid", False),
            "mx_hosts": spf_dmarc.get("mx_hosts", []),
        })
        if spf_dmarc.get("error"):
            result["errors"].append(spf_dmarc["error"])

        # Blacklist check via pydnsbl
        bl = self._check_blacklists(domain)
        result["blacklisted"] = bl.get("blacklisted", False)
        result["blacklist_listings"] = bl.get("listings", [])
        if bl.get("error"):
            result["errors"].append(bl["error"])

        return result

    def _check_spf_dmarc(self, domain: str) -> dict[str, Any]:
        """Check SPF, DMARC, and MX records via checkdmarc.

        Args:
            domain: Domain to check.

        Returns:
            Dict with spf_valid, spf_record, dmarc_valid, dmarc_record,
            dmarc_policy, mx_valid, mx_hosts, and optional error.
        """
        result: dict[str, Any] = {
            "spf_valid": False,
            "spf_record": None,
            "dmarc_valid": False,
            "dmarc_record": None,
            "dmarc_policy": None,
            "mx_valid": False,
            "mx_hosts": [],
        }

        try:
            import checkdmarc

            results = checkdmarc.check_domains([domain])
            # checkdmarc returns a dict when given a single domain
            if isinstance(results, list):
                data = results[0] if results else {}
            else:
                data = results

            # SPF
            spf = data.get("spf", {})
            result["spf_valid"] = spf.get("valid", False)
            result["spf_record"] = spf.get("record")

            # DMARC
            dmarc = data.get("dmarc", {})
            record = dmarc.get("record")
            result["dmarc_valid"] = record is not None and not dmarc.get("error")
            result["dmarc_record"] = record
            # Extract policy from tags
            tags = dmarc.get("tags", {})
            if tags and isinstance(tags, dict):
                p_tag = tags.get("p", {})
                result["dmarc_policy"] = p_tag.get("value") if isinstance(p_tag, dict) else None

            # MX
            mx = data.get("mx", {})
            hosts = mx.get("hosts", [])
            if hosts:
                result["mx_valid"] = True
                result["mx_hosts"] = [
                    h.get("hostname", str(h)) if isinstance(h, dict) else str(h)
                    for h in hosts
                ]

        except Exception as e:
            logger.warning("checkdmarc failed", domain=domain, error=str(e))
            result["error"] = f"DNS check failed: {e}"

        return result

    def _check_blacklists(self, domain: str) -> dict[str, Any]:
        """Check if domain is on any DNS blacklists via pydnsbl.

        Args:
            domain: Domain to check.

        Returns:
            Dict with blacklisted bool, listings list, and optional error.
        """
        result: dict[str, Any] = {
            "blacklisted": False,
            "listings": [],
        }

        try:
            from pydnsbl import DNSBLDomainChecker

            checker = DNSBLDomainChecker()
            bl_result = checker.check(domain)
            result["blacklisted"] = bl_result.blacklisted
            result["listings"] = [
                str(provider) for provider in (bl_result.detected_by or {})
            ]
        except Exception as e:
            logger.warning("pydnsbl check failed", domain=domain, error=str(e))
            result["error"] = f"Blacklist check failed: {e}"

        return result

    @staticmethod
    def compute_health_score(
        *,
        spf_valid: bool = False,
        dkim_enabled: bool = False,
        dmarc_valid: bool = False,
        dmarc_policy: str | None = None,
        blacklist_count: int = 0,
        bounce_rate: float = 0.0,
        complaint_rate: float = 0.0,
        open_rate: float = 0.0,
    ) -> tuple[int, dict[str, int]]:
        """Compute a 0-100 health score with category breakdown.

        Args:
            spf_valid: Whether SPF record exists and is valid.
            dkim_enabled: Whether DKIM is configured in SES.
            dmarc_valid: Whether DMARC record exists and is valid.
            dmarc_policy: DMARC policy value (none, quarantine, reject).
            blacklist_count: Number of blacklists the domain appears on.
            bounce_rate: Bounce rate percentage.
            complaint_rate: Complaint rate percentage.
            open_rate: Open rate percentage.

        Returns:
            Tuple of (total_score, breakdown_dict).
        """
        breakdown: dict[str, int] = {}

        # SPF (15 points)
        breakdown["spf"] = 15 if spf_valid else 0

        # DKIM (15 points)
        breakdown["dkim"] = 15 if dkim_enabled else 0

        # DMARC valid (10 points)
        breakdown["dmarc"] = 10 if dmarc_valid else 0

        # DMARC enforcement bonus (5 points)
        enforcing = dmarc_policy in ("quarantine", "reject") if dmarc_policy else False
        breakdown["dmarc_enforce"] = 5 if enforcing else 0

        # Blacklist (20 points, deduct 10 per listing, min 0)
        bl_score = max(0, 20 - (blacklist_count * 10))
        breakdown["blacklist"] = bl_score

        # Bounce rate (15 points)
        if bounce_rate < 2.0:
            breakdown["bounce"] = 15
        elif bounce_rate < 5.0:
            breakdown["bounce"] = 10
        else:
            breakdown["bounce"] = 0

        # Complaint rate (10 points)
        if complaint_rate < 0.05:
            breakdown["complaint"] = 10
        elif complaint_rate < 0.1:
            breakdown["complaint"] = 5
        else:
            breakdown["complaint"] = 0

        # Open rate (10 points)
        if open_rate > 20.0:
            breakdown["open_rate"] = 10
        elif open_rate > 10.0:
            breakdown["open_rate"] = 5
        else:
            breakdown["open_rate"] = 0

        total = sum(breakdown.values())
        return total, breakdown

    @staticmethod
    def score_to_status(score: int) -> str:
        """Map a health score to a status label.

        Args:
            score: Health score 0-100.

        Returns:
            One of 'good', 'warning', 'critical'.
        """
        if score >= 80:
            return "good"
        elif score >= 50:
            return "warning"
        return "critical"
