"""Syllabus hunter.

Uses DuckDuckGo/Google site-search to find syllabi for courses at a given institution.
Extracts:
  - textbook titles/ISBNs
  - courseware/EdTech tools mentioned (Packback, Top Hat, McGraw-Hill, etc.)
  - LMS platform hints (Canvas, Blackboard, D2L/Desire2Learn, Moodle)

Uses requests + BeautifulSoup (no browser dependency).

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/syllabus_hunter.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/syllabus_hunter.py --url "https://purdue.edu/syllabi/cs101.html"
"""

import json
import logging
import re
import sys
import os
import argparse
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse, unquote

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

SESSION_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# EdTech courseware keywords -> normalized name
COURSEWARE_PATTERNS: dict[str, str] = {
    r'packback': "Packback",
    r'top\s*hat': "Top Hat",
    r'mcgraw[\s\-]*hill\s*connect': "McGraw-Hill Connect",
    r'pearson\s*(?:my\w+|mastering\w+)?': "Pearson",
    r'cengage\s*(?:mindtap|webassign)?': "Cengage",
    r'chegg': "Chegg",
    r'wileyplus': "WileyPLUS",
    r'achieve\s*(?:by\s*macmillan)?': "Macmillan Achieve",
    r'webassign': "WebAssign",
    r'zybooks?': "zyBook",
    r'perusall': "Perusall",
    r'gradescope': "Gradescope",
    r'turnitin': "Turnitin",
}

LMS_PATTERNS: dict[str, str] = {
    r'canvas': "canvas",
    r'blackboard': "blackboard",
    r'desire2learn|d2l\b|brightspace': "d2l",
    r'moodle': "moodle",
}

ISBN_PATTERN = re.compile(r'ISBN[:\s-]*(?:13[:\s]*)?(97[89][\d\-]{10,17}|\d[\d\-]{8,15}[\dX])', re.IGNORECASE)
TEXTBOOK_PATTERN = re.compile(
    r'(?:required\s+text(?:book)?|course\s+text|text(?:book)?(?:\s+required)?)[:\s]+([^\n\.]{10,120})',
    re.IGNORECASE,
)


class SyllabusHunter:
    def __init__(
        self,
        domain: Optional[str] = None,
        institution_name: Optional[str] = None,
        custom_url: Optional[str] = None,
        request_delay: float = 2.0,
    ):
        self.domain = domain or ""
        self.institution_name = institution_name or domain or ""
        self.custom_url = custom_url
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(SESSION_HEADERS)

    def _build_search_queries(self) -> list[str]:
        if not self.domain:
            return []
        return [
            f"site:{self.domain} syllabus filetype:pdf",
            f"site:{self.domain} syllabus course",
            f"site:{self.domain} required textbook syllabus",
        ]

    def _fetch(self, url: str, timeout: int = 20) -> Optional[str]:
        """Fetch URL and return text content, or None on failure."""
        try:
            resp = self.session.get(url, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            logger.debug(f"Fetch failed for {url}: {e}")
            return None

    def scrape(self) -> dict:
        all_findings: list[dict] = []
        urls_scraped: list[str] = []

        if self.custom_url:
            findings = self._analyze_syllabus_url(self.custom_url)
            all_findings.extend(findings)
            urls_scraped.append(self.custom_url)
        else:
            syllabus_urls = self._find_syllabus_urls()
            for url in syllabus_urls[:25]:
                try:
                    findings = self._analyze_syllabus_url(url)
                    all_findings.extend(findings)
                    urls_scraped.append(url)
                    time.sleep(self.request_delay)
                except Exception as e:
                    logger.debug(f"Failed to analyze {url}: {e}")

        deduped = self._deduplicate_findings(all_findings)

        return {
            "syllabi": deduped,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": urls_scraped,
            "total_found": len(deduped),
            "records_added": len(deduped),
        }

    def _find_syllabus_urls(self) -> list[str]:
        urls: list[str] = []

        for query in self._build_search_queries():
            try:
                # Try DuckDuckGo first (less aggressive bot blocking)
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"DuckDuckGo search: {query}")
                html = self._fetch(search_url)

                if not html or len(html) < 500:
                    # Fall back to Google
                    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=20"
                    logger.info(f"Falling back to Google: {query}")
                    html = self._fetch(search_url)

                if not html:
                    continue

                soup = BeautifulSoup(html, "html.parser")
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    # Extract URLs from Google redirect links
                    if "/url?q=" in href:
                        href = href.split("/url?q=")[1].split("&")[0]
                    href = unquote(href).rstrip(".,;:")
                    if self.domain in href and href not in urls:
                        if self._is_syllabus_url(href):
                            urls.append(href)

                # Also scan raw text for URLs
                found = re.findall(r'https?://[^\s\)\]"\'<>]+', html)
                for u in found:
                    u = unquote(u).rstrip(".,;:")
                    if self.domain in u and u not in urls:
                        if self._is_syllabus_url(u):
                            urls.append(u)

                time.sleep(self.request_delay)

            except Exception as e:
                logger.error(f"Search failed for '{query}': {e}")

        return urls

    def _is_syllabus_url(self, url: str) -> bool:
        url_lower = url.lower()
        syllabus_hints = ["syllabus", "syllab", "course", "schedule"]
        return any(hint in url_lower for hint in syllabus_hints)

    def _analyze_syllabus_url(self, url: str) -> list[dict]:
        # Try to parse PDFs using pdfplumber
        if url.lower().endswith(".pdf"):
            return self._analyze_pdf_syllabus(url)

        html = self._fetch(url)
        if not html:
            return []

        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(" ", strip=True)

        courseware = self._detect_courseware(text)
        lms = self._detect_lms(text)
        textbooks = self._extract_textbooks(text)
        isbns = ISBN_PATTERN.findall(text)
        course_code = self._extract_course_code(url, text)

        if not (courseware or lms or textbooks):
            return []

        return [{
            "source_url": url,
            "course_code": course_code,
            "textbook": textbooks[0] if textbooks else None,
            "textbook_isbn": isbns[0] if isbns else None,
            "courseware": ", ".join(courseware) if courseware else None,
            "lms_platform": lms,
            "institution": self.institution_name,
            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
        }]

    def _analyze_pdf_syllabus(self, url: str) -> list[dict]:
        """Extract syllabus data from a PDF file."""
        download_and_extract_text = None
        try:
            from server.scraper.pdf_utils import download_and_extract_text
        except ImportError:
            try:
                from pdf_utils import download_and_extract_text
            except ImportError:
                pass

        if download_and_extract_text is not None:
            text = download_and_extract_text(url, session=self.session, max_pages=20)
            if text:
                courseware = self._detect_courseware(text)
                lms = self._detect_lms(text)
                textbooks = self._extract_textbooks(text)
                isbns = ISBN_PATTERN.findall(text)
                course_code = self._extract_course_code(url, text)

                if courseware or lms or textbooks:
                    return [{
                        "source_url": url,
                        "course_code": course_code,
                        "textbook": textbooks[0] if textbooks else None,
                        "textbook_isbn": isbns[0] if isbns else None,
                        "courseware": ", ".join(courseware) if courseware else None,
                        "lms_platform": lms,
                        "institution": self.institution_name,
                        "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                    }]

        # Fallback: extract what we can from the URL path
        course_code = self._extract_course_code(url, "")
        if course_code:
            return [{
                "source_url": url,
                "course_code": course_code,
                "textbook": None,
                "textbook_isbn": None,
                "courseware": None,
                "lms_platform": None,
                "institution": self.institution_name,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
            }]
        return []

    def _detect_courseware(self, text: str) -> list[str]:
        found = []
        for pattern, name in COURSEWARE_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                found.append(name)
        return found

    def _detect_lms(self, text: str) -> Optional[str]:
        for pattern, lms_name in LMS_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                return lms_name
        return None

    def _extract_textbooks(self, text: str) -> list[str]:
        titles = []
        for m in TEXTBOOK_PATTERN.finditer(text):
            title = m.group(1).strip().rstrip(".,;:")
            if len(title) > 8 and title not in titles:
                titles.append(title)
        return titles[:3]

    def _extract_course_code(self, url: str, text: str) -> Optional[str]:
        path = urlparse(unquote(url)).path
        m = re.search(r'([A-Z]{2,5}[\s_-]?\d{3,5})', path, re.IGNORECASE)
        if m:
            return m.group(1).replace("_", " ").replace("-", " ").upper()
        m2 = re.search(r'\b([A-Z]{2,5})\s+(\d{3,5})\b', text)
        if m2:
            return f"{m2.group(1)} {m2.group(2)}"
        return None

    def _deduplicate_findings(self, findings: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result = []
        for f in findings:
            key = f.get("source_url", "")
            if key not in seen:
                seen.add(key)
                result.append(f)
        return result


def main():
    parser = argparse.ArgumentParser(description="Hunt syllabi for textbook and courseware signals")
    parser.add_argument("--domain", type=str, default=None)
    parser.add_argument("--institution-name", type=str, default=None)
    parser.add_argument("--url", type=str, default=None, help="Direct syllabus URL to analyze")
    parser.add_argument("--delay", type=float, default=2.0)
    args = parser.parse_args()

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    hunter = SyllabusHunter(
        domain=args.domain,
        institution_name=args.institution_name,
        custom_url=args.url,
        request_delay=args.delay,
    )
    results = hunter.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
