"""Site crawler for bulk KB import.

Discovers pages on a domain via sitemap.xml and internal link extraction,
fetches them in parallel via Jina Reader, and returns page content ready
for KB storage. Designed to run within a 25-second Lambda budget.
"""

import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

import structlog

logger = structlog.get_logger()

JINA_TIMEOUT = 12

# URL patterns that are never useful KB content
SKIP_PATTERNS = re.compile(
    r"/(login|logout|signin|signup|register|auth|oauth|callback|"
    r"privacy|terms|tos|cookie|legal|disclaimer|"
    r"admin|dashboard|settings|account|profile|"
    r"cart|checkout|order|payment|billing|"
    r"search|tag|category|archive|page/\d+|"
    r"wp-admin|wp-content|wp-includes|wp-json|"
    r"api/|\.json|\.xml|\.pdf|\.zip|\.png|\.jpg|\.css|\.js|"
    r"cdn-cgi|assets/|static/|images/|img/|fonts/|"
    r"feed|rss|sitemap|robots\.txt|favicon)"
    r"(/|$)",
    re.IGNORECASE,
)

# Minimum content length to consider a page worth importing
MIN_CONTENT_LENGTH = 200


def crawl_site(
    base_url: str,
    max_pages: int = 20,
) -> list[dict]:
    """Discover and fetch pages from a website for KB import.

    Pipeline:
    1. Try sitemap.xml for URL discovery (fastest, most complete)
    2. Fall back to homepage link extraction if no sitemap
    3. Fetch discovered pages in parallel via Jina Reader
    4. Return list of page content dicts

    Args:
        base_url: Website URL (e.g. "https://example.com" or "example.com").
        max_pages: Maximum pages to crawl (default 20, max 50).

    Returns:
        List of dicts with 'url', 'title', 'content' (markdown) for each page.
    """
    max_pages = min(max_pages, 50)

    # Normalize URL
    if not base_url.startswith("http"):
        base_url = f"https://{base_url}"
    base_url = base_url.rstrip("/")

    parsed = urllib.parse.urlparse(base_url)
    base_domain = parsed.hostname or ""

    logger.info("Site crawl started", base_url=base_url, max_pages=max_pages)

    # Step 1: Discover URLs
    urls = _discover_urls(base_url, base_domain, max_pages)

    if not urls:
        logger.warning("No pages discovered", base_url=base_url)
        return []

    logger.info(
        "Pages discovered",
        base_url=base_url,
        count=len(urls),
    )

    # Step 2: Fetch pages in parallel via Jina Reader
    pages = _fetch_pages_parallel(urls)

    logger.info(
        "Site crawl complete",
        base_url=base_url,
        discovered=len(urls),
        fetched=len(pages),
    )

    return pages


def _discover_urls(
    base_url: str,
    base_domain: str,
    max_pages: int,
) -> list[str]:
    """Discover content URLs from a website.

    Tries sitemap.xml first, then falls back to extracting links from
    the homepage content.

    Args:
        base_url: Base URL of the site.
        base_domain: Domain name for filtering.
        max_pages: Maximum URLs to return.

    Returns:
        Deduplicated list of content page URLs.
    """
    urls: list[str] = []

    # Try sitemap.xml
    sitemap_urls = _fetch_sitemap(base_url)
    if sitemap_urls:
        logger.info("Sitemap found", base_url=base_url, urls=len(sitemap_urls))
        urls = sitemap_urls
    else:
        # Fall back to link extraction from homepage + key subpages
        logger.info("No sitemap, extracting links from homepage", base_url=base_url)
        homepage_md = _fetch_jina(base_url)
        if homepage_md:
            urls = _extract_links(homepage_md, base_url, base_domain)

        # Also try /blog listing page if it exists
        if len(urls) < max_pages:
            blog_md = _fetch_jina(f"{base_url}/blog")
            if blog_md and len(blog_md.strip()) >= MIN_CONTENT_LENGTH:
                blog_links = _extract_links(blog_md, base_url, base_domain)
                urls.extend(blog_links)

    # Always include the homepage itself
    if base_url not in urls:
        urls.insert(0, base_url)

    # Filter and deduplicate
    seen: set[str] = set()
    filtered: list[str] = []
    for url in urls:
        normalized = _normalize_url(url)
        if normalized in seen:
            continue
        if not _is_content_page(normalized, base_domain):
            continue
        seen.add(normalized)
        filtered.append(url)
        if len(filtered) >= max_pages:
            break

    return filtered


def _fetch_sitemap(base_url: str) -> list[str]:
    """Fetch and parse sitemap.xml for page URLs.

    Handles both regular sitemaps and sitemap index files.

    Args:
        base_url: Base URL of the site.

    Returns:
        List of URLs from sitemap, empty list if no sitemap found.
    """
    sitemap_url = f"{base_url}/sitemap.xml"
    try:
        req = urllib.request.Request(
            sitemap_url,
            headers={"User-Agent": "complens-ai/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            xml_bytes = response.read()

        root = ET.fromstring(xml_bytes)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        urls: list[str] = []

        # Check if this is a sitemap index (contains <sitemap> elements)
        sitemap_entries = root.findall(".//sm:sitemap/sm:loc", ns)
        if sitemap_entries:
            # Fetch the first sub-sitemap (usually the main content one)
            for entry in sitemap_entries[:3]:
                sub_url = entry.text.strip() if entry.text else ""
                if sub_url:
                    sub_urls = _fetch_sub_sitemap(sub_url)
                    urls.extend(sub_urls)
        else:
            # Regular sitemap — extract <url><loc> entries
            for loc in root.findall(".//sm:url/sm:loc", ns):
                url = loc.text.strip() if loc.text else ""
                if url:
                    urls.append(url)

        # Also try without namespace (some sitemaps don't use it)
        if not urls:
            for loc in root.iter("loc"):
                url = loc.text.strip() if loc.text else ""
                if url:
                    urls.append(url)

        return urls

    except Exception as e:
        logger.debug("Sitemap fetch failed", url=sitemap_url, error=str(e))
        return []


def _fetch_sub_sitemap(url: str) -> list[str]:
    """Fetch a sub-sitemap from a sitemap index.

    Args:
        url: URL of the sub-sitemap.

    Returns:
        List of page URLs from the sub-sitemap.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "complens-ai/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            xml_bytes = response.read()

        root = ET.fromstring(xml_bytes)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        urls: list[str] = []
        for loc in root.findall(".//sm:url/sm:loc", ns):
            page_url = loc.text.strip() if loc.text else ""
            if page_url:
                urls.append(page_url)

        # Try without namespace
        if not urls:
            for loc in root.iter("loc"):
                page_url = loc.text.strip() if loc.text else ""
                if page_url:
                    urls.append(page_url)

        return urls

    except Exception:
        return []


def _extract_links(markdown: str, base_url: str, base_domain: str) -> list[str]:
    """Extract internal page links from markdown content.

    Finds markdown-style links [text](url) and extracts those pointing
    to the same domain.

    Args:
        markdown: Page content in markdown format.
        base_url: Base URL for resolving relative links.
        base_domain: Domain name for filtering internal links.

    Returns:
        List of internal URLs found in the content.
    """
    # Match markdown links: [text](url)
    link_pattern = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
    urls: list[str] = []

    for _text, href in link_pattern.findall(markdown):
        href = href.strip()

        # Skip anchors, mailto, tel, javascript
        if href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue

        # Resolve relative URLs
        if href.startswith("/"):
            href = f"{base_url}{href}"
        elif not href.startswith("http"):
            href = f"{base_url}/{href}"

        # Only keep same-domain links
        parsed = urllib.parse.urlparse(href)
        if parsed.hostname and base_domain in parsed.hostname:
            urls.append(href)

    return urls


def _normalize_url(url: str) -> str:
    """Normalize a URL for deduplication.

    Strips trailing slashes, fragments, and common tracking parameters.

    Args:
        url: URL to normalize.

    Returns:
        Normalized URL string.
    """
    parsed = urllib.parse.urlparse(url)

    # Remove fragment
    path = parsed.path.rstrip("/") or "/"

    # Remove tracking query params
    if parsed.query:
        params = urllib.parse.parse_qs(parsed.query)
        # Keep non-tracking params
        clean_params = {
            k: v for k, v in params.items()
            if not k.startswith(("utm_", "ref", "fbclid", "gclid", "mc_"))
        }
        query = urllib.parse.urlencode(clean_params, doseq=True)
    else:
        query = ""

    return urllib.parse.urlunparse((
        parsed.scheme,
        parsed.netloc,
        path,
        "",
        query,
        "",
    ))


def _is_content_page(url: str, base_domain: str) -> bool:
    """Check if a URL is likely a content page worth importing.

    Filters out login pages, admin pages, assets, API endpoints, etc.

    Args:
        url: URL to check.
        base_domain: Expected domain.

    Returns:
        True if the URL looks like content worth importing.
    """
    parsed = urllib.parse.urlparse(url)

    # Must be same domain
    if parsed.hostname and base_domain not in parsed.hostname:
        return False

    # Must be http(s)
    if parsed.scheme not in ("http", "https"):
        return False

    # Check path against skip patterns
    if SKIP_PATTERNS.search(parsed.path):
        return False

    return True


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
        # Strip image markdown (![alt](url)) — we only want text content
        md = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", md)
        # Strip standalone image URLs
        md = re.sub(r"^\s*https?://\S+\.(png|jpg|jpeg|gif|svg|webp|ico)\S*\s*$", "", md, flags=re.MULTILINE | re.IGNORECASE)
        # Collapse excessive blank lines
        md = re.sub(r"\n{3,}", "\n\n", md)
        return md.strip()
    except Exception as e:
        logger.debug("Jina fetch failed", url=url, error=str(e))
        return ""


def _fetch_pages_parallel(urls: list[str]) -> list[dict]:
    """Fetch multiple pages in parallel via Jina Reader.

    Args:
        urls: List of URLs to fetch.

    Returns:
        List of dicts with 'url', 'title', 'content' for successful fetches.
    """
    pages: list[dict] = []

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_fetch_jina, url): url
            for url in urls
        }
        for future in as_completed(futures, timeout=60):
            url = futures[future]
            try:
                content = future.result()
                if content and len(content.strip()) >= MIN_CONTENT_LENGTH:
                    title = _extract_title(content, url)
                    pages.append({
                        "url": url,
                        "title": title,
                        "content": content,
                    })
            except Exception:
                logger.debug("Page fetch failed", url=url)

    return pages


def _extract_title(markdown: str, url: str) -> str:
    """Extract a page title from markdown content or URL.

    Looks for the first H1 heading, then falls back to the URL path.

    Args:
        markdown: Page content in markdown.
        url: Page URL for fallback.

    Returns:
        Page title string.
    """
    # Look for first H1
    match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    if match:
        title = match.group(1).strip()
        # Clean up markdown formatting from title
        title = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", title)
        title = re.sub(r"[*_`]", "", title)
        if len(title) > 5:
            return title[:120]

    # Fall back to URL path
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.strip("/")
    if path:
        return path.replace("/", " - ").replace("-", " ").replace("_", " ").title()[:120]

    return parsed.hostname or "Untitled"
