"""Syllabus hunter.

Uses Google site-search to find syllabi for courses at a given institution.
Extracts:
  - textbook titles/ISBNs
  - courseware/EdTech tools mentioned (Packback, Top Hat, McGraw-Hill, etc.)
  - LMS platform hints (Canvas, Blackboard, D2L/Desire2Learn, Moodle)

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/syllabus_hunter.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/syllabus_hunter.py --url "https://purdue.edu/syllabi/cs101.pdf"
"""

import asyncio
import json
import logging
import re
import sys
import os
import argparse
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse, unquote

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

# EdTech courseware keywords → normalized name
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

# Textbook title heuristics
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

    def _build_search_queries(self) -> list[str]:
        if not self.domain:
            return []
        return [
            f"site:{self.domain} syllabus filetype:pdf",
            f"site:{self.domain} syllabus course",
            f"site:{self.domain} required textbook syllabus",
        ]

    async def scrape(self) -> dict:
        browser_config = BrowserConfig(headless=True, verbose=False, text_mode=True)
        all_findings: list[dict] = []
        urls_scraped: list[str] = []

        async with AsyncWebCrawler(config=browser_config) as crawler:
            if self.custom_url:
                findings = await self._analyze_syllabus_url(crawler, self.custom_url)
                all_findings.extend(findings)
                urls_scraped.append(self.custom_url)
            else:
                syllabus_urls = await self._find_syllabus_urls(crawler)
                for url in syllabus_urls[:25]:
                    try:
                        findings = await self._analyze_syllabus_url(crawler, url)
                        all_findings.extend(findings)
                        urls_scraped.append(url)
                        await asyncio.sleep(self.request_delay)
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

    async def _find_syllabus_urls(self, crawler) -> list[str]:
        urls: list[str] = []
        run_config = CrawlerRunConfig(wait_for="css:body")

        for query in self._build_search_queries():
            try:
                # Try DuckDuckGo first (less aggressive bot blocking), fall back to Google
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"DuckDuckGo search: {query}")
                result = await crawler.arun(url=search_url, config=run_config)
                await asyncio.sleep(self.request_delay)
                # Fall back to Google if DDG returned nothing useful
                if not result.success or len(result.markdown or "") < 500:
                    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=20"
                    logger.info(f"Falling back to Google: {query}")
                    result = await crawler.arun(url=search_url, config=run_config)
                    await asyncio.sleep(self.request_delay)

                if not result.success:
                    continue

                md = result.markdown if isinstance(result.markdown, str) else str(result.markdown)
                found = re.findall(r'https?://[^\s\)\]"\']+', md)
                for u in found:
                    u = u.rstrip(".,;:")
                    if self.domain in u and u not in urls:
                        if self._is_syllabus_url(u):
                            urls.append(u)

            except Exception as e:
                logger.error(f"Search failed for '{query}': {e}")

        return urls

    def _is_syllabus_url(self, url: str) -> bool:
        url_lower = url.lower()
        syllabus_hints = ["syllabus", "syllab", "course", "schedule"]
        return any(hint in url_lower for hint in syllabus_hints)

    async def _analyze_syllabus_url(self, crawler, url: str) -> list[dict]:
        run_config = CrawlerRunConfig(wait_for="css:body")
        result = await crawler.arun(url=url, config=run_config)
        if not result.success:
            logger.debug(f"Could not fetch {url}: {result.error_message}")
            return []

        text = result.markdown if isinstance(result.markdown, str) else str(result.markdown)

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
            # Store raw HTML snapshot path hint (actual writing done by caller)
            "raw_snapshot_key": self._url_to_snapshot_key(url),
        }]

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
        # Try URL path first
        path = urlparse(unquote(url)).path
        m = re.search(r'([A-Z]{2,5}[\s_-]?\d{3,5})', path, re.IGNORECASE)
        if m:
            return m.group(1).replace("_", " ").replace("-", " ").upper()
        # Try text body
        m2 = re.search(r'\b([A-Z]{2,5})\s+(\d{3,5})\b', text)
        if m2:
            return f"{m2.group(1)} {m2.group(2)}"
        return None

    def _url_to_snapshot_key(self, url: str) -> str:
        safe = re.sub(r'[^a-zA-Z0-9]', '_', url)
        return safe[:120]

    def _deduplicate_findings(self, findings: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result = []
        for f in findings:
            key = f.get("source_url", "")
            if key not in seen:
                seen.add(key)
                result.append(f)
        return result


async def main():
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
    results = await hunter.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
