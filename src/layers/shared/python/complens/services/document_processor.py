"""Document processor that converts uploaded files to markdown."""

import csv
import io
import os
from html.parser import HTMLParser

import boto3
import structlog

logger = structlog.get_logger()


class _HTMLTextExtractor(HTMLParser):
    """Simple HTML to text extractor."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(tag[1])
            self._parts.append("\n" + "#" * level + " ")
        elif tag in ("p", "div", "br"):
            self._parts.append("\n")
        elif tag == "li":
            self._parts.append("\n- ")
        elif tag == "a":
            href = dict(attrs).get("href", "")
            self._parts.append(f"[")
            self._href = href

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False
        elif tag == "a" and hasattr(self, "_href"):
            self._parts.append(f"]({self._href})")
            del self._href

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def get_text(self) -> str:
        return "".join(self._parts).strip()


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
    """Convert HTML to markdown-like text."""
    extractor = _HTMLTextExtractor()
    extractor.feed(html)
    return extractor.get_text()


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
