"""Shared PDF utilities for scrapers.

Downloads PDFs from URLs and extracts text using pdfplumber.
Used by faculty_scraper and course_schedule_scraper as a fallback
when institutions publish schedules/directories as PDFs.
"""

import io
import logging
import re
import tempfile
from typing import Optional
from urllib.parse import unquote

import requests

logger = logging.getLogger(__name__)

try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    logger.warning("pdfplumber not installed — PDF parsing disabled")


def download_and_extract_text(
    url: str,
    session: Optional[requests.Session] = None,
    timeout: int = 30,
    max_pages: int = 50,
    max_size_mb: int = 20,
) -> Optional[str]:
    """Download a PDF from a URL and extract its text content.

    Returns the full text of the PDF, or None on failure.
    """
    if not PDF_SUPPORT:
        return None

    try:
        s = session or requests.Session()
        resp = s.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "pdf" not in content_type.lower() and not url.lower().endswith(".pdf"):
            logger.debug(f"Not a PDF (Content-Type: {content_type}): {url}")
            return None

        # Read into memory with size cap
        content = resp.content
        if len(content) > max_size_mb * 1024 * 1024:
            logger.warning(f"PDF too large ({len(content) / 1024 / 1024:.1f}MB): {url}")
            return None

        pages_text = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= max_pages:
                    logger.info(f"Reached max page limit ({max_pages}) for {url}")
                    break
                text = page.extract_text()
                if text:
                    pages_text.append(text)

        if not pages_text:
            logger.debug(f"No text extracted from PDF: {url}")
            return None

        full_text = "\n\n".join(pages_text)
        logger.info(f"Extracted {len(pages_text)} pages ({len(full_text)} chars) from {url}")
        return full_text

    except Exception as e:
        logger.debug(f"PDF extraction failed for {url}: {e}")
        return None


def extract_tables_as_text(
    url: str,
    session: Optional[requests.Session] = None,
    timeout: int = 30,
    max_pages: int = 50,
    max_size_mb: int = 20,
) -> Optional[list[list[list[str]]]]:
    """Download a PDF and extract tables as lists of rows.

    Returns a list of tables, where each table is a list of rows,
    and each row is a list of cell strings. Returns None on failure.
    """
    if not PDF_SUPPORT:
        return None

    try:
        s = session or requests.Session()
        resp = s.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()

        content = resp.content
        if len(content) > max_size_mb * 1024 * 1024:
            return None

        all_tables = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= max_pages:
                    break
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        cleaned = []
                        for row in table:
                            cleaned.append([cell.strip() if cell else "" for cell in row])
                        all_tables.append(cleaned)

        return all_tables if all_tables else None

    except Exception as e:
        logger.debug(f"PDF table extraction failed for {url}: {e}")
        return None


def find_pdf_urls_via_search(
    domain: str,
    search_terms: str,
    session: Optional[requests.Session] = None,
    max_results: int = 10,
) -> list[str]:
    """Search DuckDuckGo for PDFs on a specific domain.

    Args:
        domain: The university domain (e.g. "iastate.edu")
        search_terms: Additional search terms (e.g. "course schedule fall 2025")
        session: Optional requests session with headers
        max_results: Max number of PDF URLs to return

    Returns:
        List of PDF URLs found.
    """
    s = session or requests.Session()
    query = f"site:{domain} filetype:pdf {search_terms}"
    search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"

    try:
        logger.info(f"PDF search: {query}")
        resp = s.get(search_url, timeout=20)
        if resp.status_code != 200:
            return []

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")

        pdf_urls: list[str] = []

        # Extract links from anchor tags
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                href = href.split("/url?q=")[1].split("&")[0]
            href = unquote(href).rstrip(".,;:").split("#")[0]
            if domain in href and href.lower().endswith(".pdf"):
                if href not in pdf_urls:
                    pdf_urls.append(href)

        # Also scan raw HTML for PDF URLs
        for u in re.findall(r'https?://[^\s\)\]"\'<>]+\.pdf', resp.text, re.IGNORECASE):
            u = unquote(u).rstrip(".,;:")
            if domain in u and u not in pdf_urls:
                pdf_urls.append(u)

        logger.info(f"Found {len(pdf_urls)} PDF URLs for {domain}")
        return pdf_urls[:max_results]

    except Exception as e:
        logger.debug(f"PDF search failed: {e}")
        return []
