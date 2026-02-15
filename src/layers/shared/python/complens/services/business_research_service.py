"""Multi-step business research service.

Gathers content about a business from multiple sources — domain pages,
subpages, and web search — then uses AI to extract a comprehensive
business profile. Much richer than a single-page fetch.
"""

import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import structlog

logger = structlog.get_logger()

# Common subpages where businesses put their best content
SUBPAGES = [
    "/about",
    "/about-us",
    "/products",
    "/services",
    "/features",
    "/pricing",
    "/solutions",
    "/faq",
]

JINA_TIMEOUT = 12


def research_business(domain: str) -> str:
    """Gather comprehensive business content from a domain.

    Multi-step pipeline:
    1. Fetch homepage via Jina Reader (JS-rendered)
    2. Fetch key subpages in parallel (/about, /products, /pricing, etc.)
    3. If still thin, search the web for more info about the business
    4. Return combined content for AI analysis

    Args:
        domain: Domain name (e.g. "prioriwise.ai"). Can include https://.

    Returns:
        Combined content string from all sources, labeled by section.
    """
    # Normalize domain
    if domain.startswith("http"):
        base_url = domain.rstrip("/")
        # Extract bare domain for search
        bare_domain = urllib.parse.urlparse(domain).hostname or domain
    else:
        base_url = f"https://{domain}"
        bare_domain = domain

    contents: list[tuple[str, str]] = []

    # Step 1: Homepage
    logger.info("Research: fetching homepage", domain=bare_domain)
    homepage = _fetch_jina(base_url)
    if homepage:
        contents.append(("Homepage", homepage))

    # Step 2: Subpages in parallel
    logger.info("Research: fetching subpages", domain=bare_domain, count=len(SUBPAGES))
    subpage_results = _fetch_subpages_parallel(base_url, SUBPAGES)
    for path, content in subpage_results:
        contents.append((path, content))

    # Step 3: Web search if content is thin
    total_len = sum(len(c) for _, c in contents)
    logger.info(
        "Research: content gathered from domain",
        domain=bare_domain,
        sections=len(contents),
        total_chars=total_len,
    )

    if total_len < 500:
        logger.info("Research: content thin, searching the web", domain=bare_domain)
        search_content = _search_web(bare_domain)
        if search_content:
            contents.append(("Web Search Results", search_content))

    if not contents:
        return ""

    # Combine with section labels
    parts: list[str] = []
    for label, content in contents:
        # Truncate individual sections to keep total manageable
        truncated = content[:8000]
        parts.append(f"=== {label.upper()} ===\n{truncated}")

    combined = "\n\n".join(parts)

    # Hard cap at 25k chars for AI token limits
    combined = combined[:25000]

    logger.info(
        "Research complete",
        domain=bare_domain,
        sections=len(contents),
        total_chars=len(combined),
    )

    return combined


def _fetch_jina(url: str) -> str:
    """Fetch a URL via Jina Reader API (renders JavaScript).

    Args:
        url: Full URL to fetch.

    Returns:
        Markdown content, or empty string on failure.
    """
    try:
        jina_url = f"https://r.jina.ai/{url}"
        req = urllib.request.Request(
            jina_url,
            headers={
                "Accept": "text/markdown",
                "User-Agent": "complens-ai/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=JINA_TIMEOUT) as response:
            md = response.read().decode("utf-8", errors="replace")
        md = re.sub(r"\n{3,}", "\n\n", md)
        return md.strip()
    except Exception as e:
        logger.debug("Jina fetch failed", url=url, error=str(e))
        return ""


def _fetch_subpages_parallel(
    base_url: str,
    paths: list[str],
) -> list[tuple[str, str]]:
    """Fetch multiple subpages in parallel via Jina Reader.

    Args:
        base_url: Base URL (e.g. "https://example.com").
        paths: List of paths to try (e.g. ["/about", "/pricing"]).

    Returns:
        List of (path, content) tuples for pages with meaningful content.
    """
    results: list[tuple[str, str]] = []

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_fetch_jina, f"{base_url}{path}"): path
            for path in paths
        }
        for future in as_completed(futures, timeout=30):
            path = futures[future]
            try:
                content = future.result()
                # Only keep pages with real content (not 404 pages, redirects to home, etc.)
                if content and len(content.strip()) > 200:
                    results.append((path, content))
            except Exception:
                pass

    return results


def _search_web(domain: str) -> str:
    """Search the web for information about a business via Jina Search.

    Args:
        domain: Business domain name.

    Returns:
        Search results as markdown, or empty string on failure.
    """
    try:
        query = f'"{domain}" company about products services'
        encoded = urllib.parse.quote(query)
        jina_url = f"https://s.jina.ai/{encoded}"
        req = urllib.request.Request(
            jina_url,
            headers={
                "Accept": "text/markdown",
                "User-Agent": "complens-ai/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            md = response.read().decode("utf-8", errors="replace")
        md = re.sub(r"\n{3,}", "\n\n", md)
        return md.strip()
    except Exception as e:
        logger.debug("Jina search failed", domain=domain, error=str(e))
        return ""
