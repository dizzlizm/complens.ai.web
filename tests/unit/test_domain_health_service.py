"""Tests for DomainHealthService."""

from unittest.mock import MagicMock, patch

import pytest

from complens.services.domain_health_service import DomainHealthService


class TestCheckDns:
    """Tests for DomainHealthService.check_dns."""

    @patch("complens.services.domain_health_service.DomainHealthService._check_blacklists")
    @patch("complens.services.domain_health_service.DomainHealthService._check_spf_dmarc")
    def test_healthy_domain(self, mock_spf_dmarc, mock_blacklists):
        """Test check_dns with a fully healthy domain."""
        mock_spf_dmarc.return_value = {
            "spf_valid": True,
            "spf_record": "v=spf1 include:amazonses.com ~all",
            "dmarc_valid": True,
            "dmarc_record": "v=DMARC1; p=reject;",
            "dmarc_policy": "reject",
            "mx_valid": True,
            "mx_hosts": ["mail.example.com"],
        }
        mock_blacklists.return_value = {
            "blacklisted": False,
            "listings": [],
        }

        service = DomainHealthService()
        result = service.check_dns("example.com")

        assert result["spf_valid"] is True
        assert result["dmarc_valid"] is True
        assert result["dmarc_policy"] == "reject"
        assert result["mx_valid"] is True
        assert result["blacklisted"] is False
        assert result["errors"] == []

    @patch("complens.services.domain_health_service.DomainHealthService._check_blacklists")
    @patch("complens.services.domain_health_service.DomainHealthService._check_spf_dmarc")
    def test_checkdmarc_failure_returns_partial(self, mock_spf_dmarc, mock_blacklists):
        """Test that checkdmarc failure returns partial results with error."""
        mock_spf_dmarc.return_value = {
            "spf_valid": False,
            "spf_record": None,
            "dmarc_valid": False,
            "dmarc_record": None,
            "dmarc_policy": None,
            "mx_valid": False,
            "mx_hosts": [],
            "error": "DNS check failed: timeout",
        }
        mock_blacklists.return_value = {
            "blacklisted": False,
            "listings": [],
        }

        service = DomainHealthService()
        result = service.check_dns("example.com")

        assert result["spf_valid"] is False
        assert result["blacklisted"] is False
        assert len(result["errors"]) == 1
        assert "DNS check failed" in result["errors"][0]

    @patch("complens.services.domain_health_service.DomainHealthService._check_blacklists")
    @patch("complens.services.domain_health_service.DomainHealthService._check_spf_dmarc")
    def test_pydnsbl_failure_returns_partial(self, mock_spf_dmarc, mock_blacklists):
        """Test that pydnsbl failure returns partial results with error."""
        mock_spf_dmarc.return_value = {
            "spf_valid": True,
            "spf_record": "v=spf1 ~all",
            "dmarc_valid": True,
            "dmarc_record": "v=DMARC1; p=none;",
            "dmarc_policy": "none",
            "mx_valid": True,
            "mx_hosts": ["mail.example.com"],
        }
        mock_blacklists.return_value = {
            "blacklisted": False,
            "listings": [],
            "error": "Blacklist check failed: network error",
        }

        service = DomainHealthService()
        result = service.check_dns("example.com")

        assert result["spf_valid"] is True
        assert result["dmarc_valid"] is True
        assert len(result["errors"]) == 1
        assert "Blacklist check failed" in result["errors"][0]

    @patch("complens.services.domain_health_service.DomainHealthService._check_blacklists")
    @patch("complens.services.domain_health_service.DomainHealthService._check_spf_dmarc")
    def test_both_fail_returns_empty_with_errors(self, mock_spf_dmarc, mock_blacklists):
        """Test that both failures return empty results with two errors."""
        mock_spf_dmarc.return_value = {
            "spf_valid": False,
            "spf_record": None,
            "dmarc_valid": False,
            "dmarc_record": None,
            "dmarc_policy": None,
            "mx_valid": False,
            "mx_hosts": [],
            "error": "DNS check failed: timeout",
        }
        mock_blacklists.return_value = {
            "blacklisted": False,
            "listings": [],
            "error": "Blacklist check failed: network error",
        }

        service = DomainHealthService()
        result = service.check_dns("example.com")

        assert result["spf_valid"] is False
        assert result["dmarc_valid"] is False
        assert result["blacklisted"] is False
        assert len(result["errors"]) == 2


class TestComputeHealthScore:
    """Tests for DomainHealthService.compute_health_score."""

    def test_perfect_score(self):
        """Test perfect health score of 100."""
        score, breakdown = DomainHealthService.compute_health_score(
            spf_valid=True,
            dkim_enabled=True,
            dmarc_valid=True,
            dmarc_policy="reject",
            blacklist_count=0,
            bounce_rate=0.5,
            complaint_rate=0.01,
            open_rate=25.0,
        )

        assert score == 100
        assert breakdown["spf"] == 15
        assert breakdown["dkim"] == 15
        assert breakdown["dmarc"] == 10
        assert breakdown["dmarc_enforce"] == 5
        assert breakdown["blacklist"] == 20
        assert breakdown["bounce"] == 15
        assert breakdown["complaint"] == 10
        assert breakdown["open_rate"] == 10

    def test_no_auth_blacklisted_critical(self):
        """Test no auth + blacklisted = critical score."""
        score, breakdown = DomainHealthService.compute_health_score(
            spf_valid=False,
            dkim_enabled=False,
            dmarc_valid=False,
            dmarc_policy=None,
            blacklist_count=3,
            bounce_rate=10.0,
            complaint_rate=0.5,
            open_rate=3.0,
        )

        assert score < 50
        assert DomainHealthService.score_to_status(score) == "critical"
        assert breakdown["spf"] == 0
        assert breakdown["dkim"] == 0
        assert breakdown["dmarc"] == 0
        assert breakdown["blacklist"] == 0  # 3 listings = 20 - 30 = 0

    def test_warning_range(self):
        """Test score in warning range (50-79)."""
        score, breakdown = DomainHealthService.compute_health_score(
            spf_valid=True,
            dkim_enabled=True,
            dmarc_valid=False,
            dmarc_policy=None,
            blacklist_count=0,
            bounce_rate=3.0,
            complaint_rate=0.07,
            open_rate=8.0,
        )

        assert 50 <= score < 80
        assert DomainHealthService.score_to_status(score) == "warning"

    def test_blacklist_deduction(self):
        """Test blacklist score deducts 10 per listing."""
        # No listings
        score1, breakdown1 = DomainHealthService.compute_health_score(blacklist_count=0)
        assert breakdown1["blacklist"] == 20

        # 1 listing
        score2, breakdown2 = DomainHealthService.compute_health_score(blacklist_count=1)
        assert breakdown2["blacklist"] == 10

        # 2 listings
        score3, breakdown3 = DomainHealthService.compute_health_score(blacklist_count=2)
        assert breakdown3["blacklist"] == 0

        # 5 listings (capped at 0)
        score4, breakdown4 = DomainHealthService.compute_health_score(blacklist_count=5)
        assert breakdown4["blacklist"] == 0

    def test_dmarc_policy_bonus(self):
        """Test DMARC enforcement bonus only for quarantine/reject."""
        _, b1 = DomainHealthService.compute_health_score(dmarc_valid=True, dmarc_policy="reject")
        assert b1["dmarc_enforce"] == 5

        _, b2 = DomainHealthService.compute_health_score(dmarc_valid=True, dmarc_policy="quarantine")
        assert b2["dmarc_enforce"] == 5

        _, b3 = DomainHealthService.compute_health_score(dmarc_valid=True, dmarc_policy="none")
        assert b3["dmarc_enforce"] == 0

        _, b4 = DomainHealthService.compute_health_score(dmarc_valid=True, dmarc_policy=None)
        assert b4["dmarc_enforce"] == 0

    def test_bounce_rate_tiers(self):
        """Test bounce rate scoring tiers."""
        _, b1 = DomainHealthService.compute_health_score(bounce_rate=1.0)
        assert b1["bounce"] == 15

        _, b2 = DomainHealthService.compute_health_score(bounce_rate=3.0)
        assert b2["bounce"] == 10

        _, b3 = DomainHealthService.compute_health_score(bounce_rate=6.0)
        assert b3["bounce"] == 0

    def test_complaint_rate_tiers(self):
        """Test complaint rate scoring tiers."""
        _, b1 = DomainHealthService.compute_health_score(complaint_rate=0.02)
        assert b1["complaint"] == 10

        _, b2 = DomainHealthService.compute_health_score(complaint_rate=0.07)
        assert b2["complaint"] == 5

        _, b3 = DomainHealthService.compute_health_score(complaint_rate=0.2)
        assert b3["complaint"] == 0

    def test_open_rate_tiers(self):
        """Test open rate scoring tiers."""
        _, b1 = DomainHealthService.compute_health_score(open_rate=25.0)
        assert b1["open_rate"] == 10

        _, b2 = DomainHealthService.compute_health_score(open_rate=15.0)
        assert b2["open_rate"] == 5

        _, b3 = DomainHealthService.compute_health_score(open_rate=5.0)
        assert b3["open_rate"] == 0


class TestScoreToStatus:
    """Tests for DomainHealthService.score_to_status."""

    def test_good(self):
        """Test good status for scores >= 80."""
        assert DomainHealthService.score_to_status(80) == "good"
        assert DomainHealthService.score_to_status(100) == "good"

    def test_warning(self):
        """Test warning status for scores 50-79."""
        assert DomainHealthService.score_to_status(50) == "warning"
        assert DomainHealthService.score_to_status(79) == "warning"

    def test_critical(self):
        """Test critical status for scores < 50."""
        assert DomainHealthService.score_to_status(0) == "critical"
        assert DomainHealthService.score_to_status(49) == "critical"
