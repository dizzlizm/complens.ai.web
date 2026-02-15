"""Document processor that converts uploaded files to markdown."""

import csv
import io
import re
import urllib.request

import boto3
import structlog

logger = structlog.get_logger()


def _strip_boilerplate(html: str) -> str:
    """Remove non-content elements from HTML before markdown conversion.

    Strips navigation, footers, cookie banners, ads, and other boilerplate
    so the resulting markdown is clean business content.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    # Remove elements that are never useful content
    for tag_name in ("script", "style", "noscript", "iframe", "svg"):
        for el in soup.find_all(tag_name):
            el.decompose()

    # Remove boilerplate sections by tag
    for tag_name in ("nav", "footer", "header"):
        for el in soup.find_all(tag_name):
            el.decompose()

    # Remove common boilerplate by role, class, or id patterns
    boilerplate_patterns = re.compile(
        r"cookie|consent|banner|popup|modal|sidebar|breadcrumb|"
        r"social[-_]?share|share[-_]?button|newsletter[-_]?signup|"
        r"advertisement|ad[-_]?container|skip[-_]?nav",
        re.IGNORECASE,
    )
    for el in soup.find_all(attrs={"class": boilerplate_patterns}):
        el.decompose()
    for el in soup.find_all(attrs={"id": boilerplate_patterns}):
        el.decompose()
    for el in soup.find_all(attrs={"role": re.compile(r"^(navigation|banner|contentinfo)$")}):
        el.decompose()

    # Prefer main/article content if available
    main = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"})
    if main:
        return str(main)

    # Fall back to body or full soup
    body = soup.find("body")
    return str(body) if body else str(soup)


def process_document(bucket: str, file_key: str, content_type: str, name: str) -> str:
    """Read a document from S3, convert to markdown, and store the processed version.

    Args:
        bucket: S3 bucket name.
        file_key: Original file S3 key.
        content_type: MIME type of the original file.
        name: Original file name.

    Returns:
        S3 key of the processed markdown file.
    """
    s3 = boto3.client("s3")

    obj = s3.get_object(Bucket=bucket, Key=file_key)
    raw_bytes = obj["Body"].read()

    markdown = _convert_to_markdown(raw_bytes, content_type, name)

    # Store processed markdown alongside original
    processed_key = file_key.rsplit("/", 1)[0] + "/processed.md"

    s3.put_object(
        Bucket=bucket,
        Key=processed_key,
        Body=markdown.encode("utf-8"),
        ContentType="text/markdown",
    )

    logger.info(
        "Document processed to markdown",
        original_key=file_key,
        processed_key=processed_key,
        original_size=len(raw_bytes),
        markdown_size=len(markdown),
    )

    return processed_key


def _convert_to_markdown(raw_bytes: bytes, content_type: str, name: str) -> str:
    """Convert raw file bytes to markdown text.

    Args:
        raw_bytes: File content.
        content_type: MIME type.
        name: File name (used for extension-based fallback).

    Returns:
        Markdown text.
    """
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    # PDF
    if content_type == "application/pdf" or ext == "pdf":
        return _pdf_to_markdown(raw_bytes)

    # DOCX
    if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or ext == "docx":
        return _docx_to_markdown(raw_bytes)

    # HTML
    if content_type == "text/html" or ext == "html" or ext == "htm":
        return _html_to_markdown(raw_bytes.decode("utf-8", errors="replace"))

    # CSV
    if content_type == "text/csv" or ext == "csv":
        return _csv_to_markdown(raw_bytes.decode("utf-8", errors="replace"))

    # Plain text / markdown / JSON — pass through
    return raw_bytes.decode("utf-8", errors="replace")


def _pdf_to_markdown(raw_bytes: bytes) -> str:
    """Extract text from PDF and format as markdown."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw_bytes))
        pages = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text.strip())

        return "\n\n---\n\n".join(pages)
    except Exception as e:
        logger.error("PDF extraction failed", error=str(e))
        return f"[PDF extraction failed: {e}]"


def _docx_to_markdown(raw_bytes: bytes) -> str:
    """Extract text from DOCX and format as markdown."""
    try:
        from docx import Document

        doc = Document(io.BytesIO(raw_bytes))
        parts = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            style = para.style.name.lower() if para.style else ""
            if "heading 1" in style:
                parts.append(f"# {text}")
            elif "heading 2" in style:
                parts.append(f"## {text}")
            elif "heading 3" in style:
                parts.append(f"### {text}")
            elif "list" in style:
                parts.append(f"- {text}")
            else:
                parts.append(text)

        return "\n\n".join(parts)
    except Exception as e:
        logger.error("DOCX extraction failed", error=str(e))
        return f"[DOCX extraction failed: {e}]"


def _html_to_markdown(html: str) -> str:
    """Convert HTML to clean markdown using boilerplate stripping + markdownify."""
    from markdownify import markdownify

    clean_html = _strip_boilerplate(html)
    md = markdownify(clean_html, heading_style="ATX", strip=["img"])

    # Collapse excessive blank lines (3+ → 2)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip()


def extract_from_url(url: str) -> str:
    """Fetch a web page and extract its content as markdown.

    Uses Jina Reader API (r.jina.ai) for JS-rendered content extraction.
    Falls back to direct fetch + HTML-to-markdown if Jina is unavailable.

    Args:
        url: HTTP or HTTPS URL to fetch.

    Returns:
        Extracted markdown text from the page.
    """
    # Try Jina Reader first — renders JS, returns clean markdown
    jina_md = _fetch_via_jina(url)
    if jina_md and len(jina_md.strip()) >= 50:
        logger.info("URL extracted via Jina Reader", url=url, length=len(jina_md))
        return jina_md

    # Fall back to direct fetch for static pages
    logger.info("Jina Reader insufficient, falling back to direct fetch", url=url)
    return _fetch_direct(url)


def _fetch_via_jina(url: str) -> str:
    """Fetch rendered page content via Jina Reader API.

    Jina Reader (r.jina.ai) renders JavaScript and returns clean markdown.
    Free tier, no API key needed.

    Args:
        url: URL to fetch.

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
        with urllib.request.urlopen(req, timeout=20) as response:
            md = response.read().decode("utf-8", errors="replace")
        # Clean up excessive whitespace
        md = re.sub(r"\n{3,}", "\n\n", md)
        return md.strip()
    except Exception as e:
        logger.warning("Jina Reader fetch failed", url=url, error=str(e))
        return ""


def _fetch_direct(url: str) -> str:
    """Fetch a URL directly and convert HTML to markdown.

    Falls back to meta tag extraction for SPA pages with empty bodies.

    Args:
        url: URL to fetch.

    Returns:
        Markdown content.
    """
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        content_type = response.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=")[-1].split(";")[0].strip()
        html = response.read().decode(charset, errors="replace")

    md = _html_to_markdown(html)

    # If body was empty (SPA / JS-rendered), extract what we can from meta tags
    if len(md.strip()) < 50:
        meta_md = _extract_meta_content(html, url)
        if meta_md:
            return meta_md

    return md


def _extract_meta_content(html: str, url: str) -> str:
    """Extract content from HTML meta tags as a markdown fallback.

    Used when the page body is empty (SPA / JS-rendered sites).
    Pulls title, description, Open Graph, and other meta tags.

    Args:
        html: Raw HTML string.
        url: Source URL for attribution.

    Returns:
        Markdown string from meta tags, or empty string if nothing useful.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    parts: list[str] = []

    # Title
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    og_title = _get_meta(soup, "og:title")
    name = og_title or title
    if name:
        parts.append(f"# {name}")

    parts.append(f"Source: {url}")

    # Description
    desc = _get_meta(soup, "description") or _get_meta(soup, "og:description")
    if desc:
        parts.append(f"\n{desc}")

    # Keywords
    keywords = _get_meta(soup, "keywords")
    if keywords:
        parts.append(f"\nKeywords: {keywords}")

    # Author
    author = _get_meta(soup, "author")
    if author:
        parts.append(f"\nBy {author}")

    # Any other og: or twitter: meta with content
    seen = {"og:title", "og:description", "description", "keywords", "author", "viewport", "charset"}
    for meta in soup.find_all("meta"):
        prop = meta.get("property", "") or meta.get("name", "")
        content = meta.get("content", "")
        if prop and content and prop.lower() not in seen:
            seen.add(prop.lower())
            # Skip technical meta tags
            if any(skip in prop.lower() for skip in ("twitter:card", "twitter:site", "viewport", "theme-color", "robots")):
                continue
            label = prop.replace("og:", "").replace("twitter:", "").replace(":", " ").replace("_", " ").title()
            parts.append(f"**{label}:** {content}")

    if len(parts) <= 2:
        return ""

    return "\n\n".join(parts)


def _get_meta(soup, name: str) -> str:
    """Get meta tag content by name or property."""
    tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
    return tag.get("content", "").strip() if tag else ""


def _csv_to_markdown(text: str) -> str:
    """Convert CSV to a markdown table."""
    try:
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        if not rows:
            return text

        # Header
        header = rows[0]
        lines = ["| " + " | ".join(header) + " |"]
        lines.append("| " + " | ".join("---" for _ in header) + " |")

        # Rows
        for row in rows[1:]:
            # Pad row if shorter than header
            padded = row + [""] * (len(header) - len(row))
            lines.append("| " + " | ".join(padded[:len(header)]) + " |")

        return "\n".join(lines)
    except Exception:
        return text
