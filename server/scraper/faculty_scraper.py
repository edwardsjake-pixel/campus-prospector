"""Faculty directory scraper.

Crawls a university's faculty/staff directory pages to extract:
  name, email, phone, office, bio, photo_url, research interests, tenure status.

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/faculty_scraper.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/faculty_scraper.py --name "Jane Smith"  # single-instructor lookup
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
from urllib.parse import urlparse, urljoin

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

# Common paths universities use for their faculty directories
DIRECTORY_PATH_HINTS = [
    "/faculty", "/faculty-staff", "/faculty-directory", "/people",
    "/directory", "/staff", "/about/faculty", "/academics/faculty",
]

TENURE_KEYWORDS = {
    "tenured": ["tenured professor", "full professor", "professor of "],
    "tenure_track": ["assistant professor", "associate professor", "tenure-track"],
    "adjunct": ["adjunct", "lecturer", "senior lecturer", "part-time"],
    "visiting": ["visiting professor", "visiting scholar", "visiting faculty"],
}


class FacultyScraper:
    def __init__(
        self,
        domain: Optional[str] = None,
        institution_name: Optional[str] = None,
        target_name: Optional[str] = None,
        request_delay: float = 1.5,
    ):
        self.domain = domain or ""
        self.institution_name = institution_name or domain or ""
        self.target_name = target_name  # single-instructor lookup mode
        self.request_delay = request_delay

    def _candidate_urls(self) -> list[str]:
        if not self.domain:
            return []
        base = f"https://www.{self.domain}"
        urls = []
        for path in DIRECTORY_PATH_HINTS:
            urls.append(f"{base}{path}")
        # Also try without www
        base2 = f"https://{self.domain}"
        for path in DIRECTORY_PATH_HINTS[:3]:
            urls.append(f"{base2}{path}")
        return urls

    async def scrape(self) -> dict:
        browser_config = BrowserConfig(headless=True, verbose=False, text_mode=False)
        faculty = []
        urls_scraped = []

        async with AsyncWebCrawler(config=browser_config) as crawler:
            if self.target_name:
                # Single-instructor mode: search for the person by name
                result = await self._search_single_instructor(crawler, self.target_name)
                return {
                    "instructor": result,
                    "scraped_at": datetime.now().isoformat(),
                    "records_added": 1 if result else 0,
                }

            # Full directory mode
            found_dir_url = await self._find_directory_url(crawler)
            if found_dir_url:
                logger.info(f"Found directory at: {found_dir_url}")
                people, scraped = await self._crawl_directory(crawler, found_dir_url)
                faculty.extend(people)
                urls_scraped.extend(scraped)
            else:
                logger.warning(f"No faculty directory found for {self.domain}")

        return {
            "faculty": faculty,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": urls_scraped,
            "total_found": len(faculty),
            "records_added": len(faculty),
        }

    async def _find_directory_url(self, crawler) -> Optional[str]:
        """Try candidate URLs; return the first that looks like a faculty directory."""
        for url in self._candidate_urls():
            try:
                run_config = CrawlerRunConfig(wait_for="css:body")
                result = await crawler.arun(url=url, config=run_config)
                await asyncio.sleep(self.request_delay)
                if not result.success:
                    continue
                md = result.markdown if isinstance(result.markdown, str) else str(result.markdown)
                # Check for directory-like content
                if any(kw in md.lower() for kw in ["professor", "faculty", "ph.d", "department"]):
                    return url
            except Exception as e:
                logger.debug(f"Candidate {url} failed: {e}")
        return None

    async def _crawl_directory(self, crawler, directory_url: str) -> tuple[list[dict], list[str]]:
        """Crawl a directory page and extract person cards."""
        run_config = CrawlerRunConfig(
            wait_for="css:body",
            js_code=["window.scrollTo(0, document.body.scrollHeight);",
                     "await new Promise(r => setTimeout(r, 1500));"],
        )
        result = await crawler.arun(url=directory_url, config=run_config)
        if not result.success:
            logger.error(f"Failed to crawl {directory_url}: {result.error_message}")
            return [], []

        html = result.html or ""
        md = result.markdown if isinstance(result.markdown, str) else str(result.markdown)

        people = self._parse_directory_content(md, html, directory_url)

        # Follow sub-pages (paginated dirs, sub-department pages)
        sub_urls = self._extract_sub_directory_links(md, directory_url)
        urls_scraped = [directory_url]

        for sub_url in sub_urls[:5]:  # cap at 5 sub-pages
            try:
                await asyncio.sleep(self.request_delay)
                sub_result = await crawler.arun(url=sub_url, config=run_config)
                if sub_result.success:
                    sub_md = sub_result.markdown if isinstance(sub_result.markdown, str) else str(sub_result.markdown)
                    sub_people = self._parse_directory_content(sub_md, sub_result.html or "", sub_url)
                    people.extend(sub_people)
                    urls_scraped.append(sub_url)
            except Exception as e:
                logger.debug(f"Sub-page {sub_url} failed: {e}")

        return self._deduplicate(people), urls_scraped

    def _parse_directory_content(self, markdown: str, html: str, source_url: str) -> list[dict]:
        """Extract person records from page content."""
        people = []
        # Split into blocks by common separators (headings, horizontal rules)
        blocks = re.split(r'\n#{1,3}\s+', markdown)

        for block in blocks:
            if len(block) < 20:
                continue
            name = self._extract_name(block)
            if not name:
                continue
            email = self._extract_email(block)
            phone = self._extract_phone(block)
            title = self._extract_title(block)
            tenure_status = self._infer_tenure_status(title, block)
            bio_snippet = self._extract_bio(block)
            photo_url = self._extract_photo_url(html, name)
            office = self._extract_office(block)

            people.append({
                "name": name,
                "email": email,
                "phone": phone,
                "title": title,
                "tenure_status": tenure_status,
                "bio": bio_snippet,
                "photo_url": photo_url,
                "office_location": office,
                "institution": self.institution_name,
                "source_url": source_url,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
            })

        return people

    def _extract_name(self, block: str) -> Optional[str]:
        # Look for "Dr./Prof./Mr./Ms. FirstName LastName" or plain "FirstName LastName"
        patterns = [
            re.compile(r'(?:Dr\.|Prof(?:essor)?\.?|Mr\.|Ms\.|Mrs\.)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'),
            re.compile(r'\*\*([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\*\*'),
            re.compile(r'^([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$', re.MULTILINE),
        ]
        for pat in patterns:
            m = pat.search(block)
            if m:
                candidate = m.group(1).strip()
                if self._is_valid_name(candidate):
                    return candidate
        return None

    def _is_valid_name(self, name: str) -> bool:
        if len(name) < 4 or len(name) > 60:
            return False
        parts = name.split()
        if len(parts) < 2 or len(parts) > 5:
            return False
        skip = {"university", "college", "department", "contact", "office", "email",
                "professor", "faculty", "staff", "research", "the", "and", "for"}
        for p in parts:
            if p.lower() in skip:
                return False
        return True

    def _extract_email(self, text: str) -> Optional[str]:
        m = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', text)
        if m:
            email = m.group(0).lower()
            if not email.endswith((".png", ".jpg", ".gif")):
                return email
        return None

    def _extract_phone(self, text: str) -> Optional[str]:
        m = re.search(r'\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}', text)
        return m.group(0).strip() if m else None

    def _extract_title(self, text: str) -> Optional[str]:
        title_pat = re.compile(
            r'((?:Assistant|Associate|Full|Visiting|Adjunct|Clinical|Research|Emeritus)?\s*'
            r'(?:Professor|Lecturer|Instructor|Researcher|Scientist|Fellow|Scholar)(?:\s+of\s+\w+(?:\s+\w+)*)?)',
            re.IGNORECASE,
        )
        m = title_pat.search(text)
        return m.group(1).strip() if m else None

    def _infer_tenure_status(self, title: Optional[str], text: str) -> str:
        combined = (title or "") + " " + text[:300]
        combined_lower = combined.lower()
        for status, keywords in TENURE_KEYWORDS.items():
            if any(kw in combined_lower for kw in keywords):
                return status
        return "unknown"

    def _extract_bio(self, text: str) -> Optional[str]:
        # Take first substantive paragraph (>80 chars) as bio snippet
        paras = [p.strip() for p in text.split("\n") if len(p.strip()) > 80]
        return paras[0][:500] if paras else None

    def _extract_office(self, text: str) -> Optional[str]:
        m = re.search(
            r'(?:office|room|building|hall)[:\s]+([A-Za-z0-9\s\-\.]+)',
            text, re.IGNORECASE
        )
        if m:
            return m.group(1).strip()[:80]
        return None

    def _extract_photo_url(self, html: str, name: str) -> Optional[str]:
        if not html or not name:
            return None
        # Look for img tags near the person's name
        first_last = name.split()
        if len(first_last) < 2:
            return None
        last = first_last[-1].lower()
        # Simple heuristic: find img src that contains the last name
        img_pat = re.compile(r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
        for m in img_pat.finditer(html):
            src = m.group(1)
            if last in src.lower() or "faculty" in src.lower() or "people" in src.lower():
                return src
        return None

    def _extract_sub_directory_links(self, markdown: str, base_url: str) -> list[str]:
        parsed = urlparse(base_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        links = re.findall(r'\[([^\]]+)\]\((/[^\)]+)\)', markdown)
        result = []
        for _text, path in links:
            if any(hint in path for hint in DIRECTORY_PATH_HINTS):
                full = urljoin(base, path)
                if full != base_url and full not in result:
                    result.append(full)
        return result[:10]

    async def _search_single_instructor(self, crawler, name: str) -> Optional[dict]:
        """Google-search for a specific instructor's profile page."""
        query = f'"{name}" professor site:edu'
        search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=5"
        run_config = CrawlerRunConfig(wait_for="css:body")
        try:
            result = await crawler.arun(url=search_url, config=run_config)
            if not result.success:
                return None
            md = result.markdown if isinstance(result.markdown, str) else str(result.markdown)
            edu_links = re.findall(r'https?://[^\s\)\]"\']*\.edu[^\s\)\]"\']*', md)
            for link in edu_links[:3]:
                await asyncio.sleep(self.request_delay)
                page = await crawler.arun(url=link, config=run_config)
                if not page.success:
                    continue
                page_md = page.markdown if isinstance(page.markdown, str) else str(page.markdown)
                if name.split()[-1].lower() in page_md.lower():
                    people = self._parse_directory_content(page_md, page.html or "", link)
                    match = next((p for p in people if name.split()[-1].lower() in p["name"].lower()), None)
                    if match:
                        return match
        except Exception as e:
            logger.error(f"Single instructor search failed: {e}")
        return None

    def _deduplicate(self, people: list[dict]) -> list[dict]:
        seen: dict[str, dict] = {}
        for p in people:
            key = p["name"].lower().strip()
            if key not in seen:
                seen[key] = p
            else:
                for field in ["email", "phone", "bio", "photo_url", "office_location", "title"]:
                    if not seen[key].get(field) and p.get(field):
                        seen[key][field] = p[field]
        return list(seen.values())


async def main():
    parser = argparse.ArgumentParser(description="Scrape faculty directory for a university")
    parser.add_argument("--domain", type=str, default=None)
    parser.add_argument("--institution-name", type=str, default=None)
    parser.add_argument("--name", type=str, default=None, help="Single instructor name to look up")
    parser.add_argument("--delay", type=float, default=1.5)
    args = parser.parse_args()

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    scraper = FacultyScraper(
        domain=args.domain,
        institution_name=args.institution_name,
        target_name=args.name,
        request_delay=args.delay,
    )
    results = await scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
