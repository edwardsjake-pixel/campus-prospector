"""Scraper for finding faculty who use Packback.

Searches university websites via DuckDuckGo/Google site-search to find syllabi,
course pages, and department pages that mention Packback. Extracts instructor
names, courses, and departments from both search result snippets and crawled pages.

Uses requests + BeautifulSoup (no browser dependency).

Outputs JSON to stdout for consumption by the Node.js backend.

Usage:
    python3 server/scraper/packback_scraper.py [--urls URL1 URL2 ...] [--domain purdue.edu] [--institution-name "Purdue University"]
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


class PackbackScraper:
    """Scrapes university websites to find faculty whose courses use Packback."""

    def __init__(
        self,
        urls: Optional[list[str]] = None,
        domain: Optional[str] = None,
        institution_name: Optional[str] = None,
        request_delay: float = 1.5,
    ):
        self.custom_urls = urls or []
        self.domain = domain
        self.institution_name = institution_name or ""
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(SESSION_HEADERS)

    def _get_search_queries(self) -> list[str]:
        if self.domain:
            return [
                f"site:{self.domain} packback syllabus",
                f"site:{self.domain} packback course",
            ]
        return [
            "site:purdue.edu packback syllabus",
            "site:purdue.edu packback course",
            "site:indiana.edu packback syllabus",
            "site:indiana.edu packback course",
        ]

    def _detect_institution_from_url(self, url: str) -> str:
        if not url:
            return self.institution_name or ""
        url_lower = url.lower()
        if self.domain and self.domain in url_lower:
            return self.institution_name or self.domain
        known = {
            "purdue.edu": "Purdue University",
            "indiana.edu": "Indiana University Bloomington",
            "iu.edu": "Indiana University Bloomington",
        }
        for d, name in known.items():
            if d in url_lower:
                return name
        return self.institution_name or ""

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
        all_faculty: list[dict] = []
        all_urls_scraped: list[str] = []

        if self.custom_urls:
            html_urls = [u for u in self.custom_urls if not u.lower().endswith('.pdf')]
            for url in html_urls:
                try:
                    logger.info(f"Scraping custom URL: {url}")
                    faculty = self._scrape_html_page(url)
                    all_faculty.extend(faculty)
                    all_urls_scraped.append(url)
                    time.sleep(self.request_delay)
                except Exception as e:
                    logger.error(f"Error scraping {url}: {e}")

            pdf_urls = [u for u in self.custom_urls if u.lower().endswith('.pdf')]
            for url in pdf_urls:
                faculty = self._extract_from_url_path(url)
                all_faculty.extend(faculty)
                all_urls_scraped.append(url)
        else:
            search_faculty, search_urls = self._search_and_extract()
            all_faculty.extend(search_faculty)
            all_urls_scraped.extend(search_urls)

            html_urls = [u for u in search_urls if not u.lower().endswith('.pdf')]
            html_urls = [u for u in html_urls if self._is_worth_crawling(u)][:25]

            for url in html_urls:
                try:
                    logger.info(f"Crawling page: {url}")
                    faculty = self._scrape_html_page(url)
                    all_faculty.extend(faculty)
                    time.sleep(self.request_delay)
                except Exception as e:
                    logger.error(f"Error scraping {url}: {e}")

        all_faculty = self._deduplicate(all_faculty)

        return {
            "faculty": all_faculty,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": all_urls_scraped,
            "total_found": len(all_faculty),
        }

    def _search_and_extract(self) -> tuple[list[dict], list[str]]:
        queries = self._get_search_queries()
        all_faculty: list[dict] = []
        all_urls: list[str] = []

        for query in queries:
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"DuckDuckGo search: {query}")

                html = self._fetch(search_url)

                if not html or len(html) < 500:
                    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}&num=20"
                    logger.info(f"Falling back to Google: {query}")
                    html = self._fetch(search_url)

                if not html:
                    continue

                soup = BeautifulSoup(html, "html.parser")
                page_text = soup.get_text(" ", strip=True)

                links = self._extract_university_links(soup, html)
                all_urls.extend(links)
                logger.info(f"Found {len(links)} university links")

                search_faculty = self._extract_from_search_results(page_text, links)
                all_faculty.extend(search_faculty)
                logger.info(f"Extracted {len(search_faculty)} faculty from search snippets")

                for link in links:
                    if link.lower().endswith('.pdf'):
                        url_faculty = self._extract_from_url_path(link)
                        all_faculty.extend(url_faculty)

                time.sleep(self.request_delay)

            except Exception as e:
                logger.error(f"Error in search '{query}': {e}")

        return all_faculty, list(dict.fromkeys(all_urls))

    def _extract_from_search_results(self, text: str, links: list[str]) -> list[dict]:
        faculty = []

        # Check if text mentions packback at all
        if "packback" not in text.lower():
            return []

        for link in links:
            institution = self._detect_institution_from_url(link)
            names = self._extract_instructor_names(text)
            courses = self._extract_courses(text)
            department = self._extract_department(text)

            for name in names:
                faculty.append({
                    "name": name,
                    "email": "",
                    "institution": institution,
                    "department": department,
                    "course": ", ".join(courses[:3]),
                    "source_url": link,
                    "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                    "notes": f"Uses Packback. {'; '.join(courses[:3])}".strip().rstrip('.'),
                })
            # Only extract from first few links to avoid noise
            if len(faculty) >= 10:
                break

        return faculty

    def _extract_from_url_path(self, url: str) -> list[dict]:
        if not url:
            return []

        decoded = unquote(url)
        path = urlparse(decoded).path
        institution = self._detect_institution_from_url(url)

        faculty = []

        tilde_match = re.search(r'~(\w+)', path)
        username = ""
        if tilde_match:
            username = tilde_match.group(1)

        filename = path.split('/')[-1]
        name_parts = re.findall(r'([A-Z][a-z]{2,})', filename)

        instructor_name = ""
        if name_parts:
            skip = {"Syllabus", "Course", "Class", "Phil", "Hist", "Intro",
                    "Spring", "Fall", "Summer", "Winter", "Final", "Exam"}
            real_parts = [p for p in name_parts if p not in skip]
            if real_parts:
                instructor_name = real_parts[0]

        if not instructor_name and username:
            clean = re.sub(r'^(?:dr|prof)', '', username, flags=re.IGNORECASE)
            if len(clean) >= 3:
                instructor_name = clean.capitalize()

        full_path_text = decoded.replace('/', ' ').replace('_', ' ').replace('%20', ' ')
        courses = self._extract_courses(full_path_text)

        camelcase_courses = re.findall(r'([A-Z]{2,5})(\d{3,5})', filename)
        for prefix, num in camelcase_courses:
            skip_prefixes = {"HTTP", "HTML", "ISBN", "ZOOM", "PAGE", "FALL"}
            code = f"{prefix} {num}"
            if prefix not in skip_prefixes and code not in courses:
                courses.append(code)

        department = ""
        dept_hints = {
            "phil": "Philosophy", "hist": "History", "clcs": "Classics",
            "eaps": "Earth & Atmospheric Sciences", "engl": "English",
            "psych": "Psychology", "soc": "Sociology", "bio": "Biology",
            "chem": "Chemistry", "phys": "Physics", "cs": "Computer Science",
            "econ": "Economics", "comm": "Communications", "educ": "Education",
            "mgmt": "Management", "mkt": "Marketing",
        }
        for hint, dept in dept_hints.items():
            if hint in path.lower():
                department = dept
                break

        if instructor_name:
            faculty.append({
                "name": instructor_name,
                "email": "",
                "institution": institution,
                "department": department,
                "course": ", ".join(courses[:3]),
                "source_url": url,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                "notes": f"Uses Packback. {'; '.join(courses[:3])}".strip().rstrip('.'),
            })

        return faculty

    def _extract_university_links(self, soup: BeautifulSoup, raw_html: str) -> list[str]:
        links = []
        target_domains = []
        if self.domain:
            target_domains.append(self.domain)
        else:
            target_domains.extend(["purdue.edu", "indiana.edu", "iu.edu"])

        # From anchor tags
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                href = href.split("/url?q=")[1].split("&")[0]
            href = unquote(href).rstrip(".,;:").split("#")[0]
            if "google" in urlparse(href).netloc:
                continue
            if any(domain in href for domain in target_domains):
                if href not in links:
                    links.append(href)

        # Also scan raw text for URLs
        all_urls = re.findall(r'https?://[^\s\)\]"\'<>]+', raw_html)
        for url in all_urls:
            url = unquote(url).rstrip(".,;:").split("#")[0]
            if "google" in urlparse(url).netloc:
                continue
            if any(domain in url for domain in target_domains):
                if url not in links:
                    links.append(url)

        return links

    def _is_worth_crawling(self, url: str) -> bool:
        parsed = urlparse(url)
        path = parsed.path.rstrip('/')
        if not path or path == '/':
            return False
        if url.lower().endswith(('.pdf', '.docx', '.doc', '.pptx', '.xlsx')):
            return False
        return True

    def _scrape_html_page(self, url: str) -> list[dict]:
        html = self._fetch(url)
        if not html:
            return []

        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(" ", strip=True)

        if "packback" not in text.lower():
            logger.info(f"No Packback mention on {url}")
            return []

        institution = self._detect_institution_from_url(url)
        names = self._extract_instructor_names(text)
        courses = self._extract_courses(text)
        department = self._extract_department(text)
        emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', text)

        faculty = []
        for i, name in enumerate(names):
            faculty.append({
                "name": name,
                "email": emails[i] if i < len(emails) else "",
                "institution": institution,
                "department": department,
                "course": ", ".join(courses[:3]),
                "source_url": url,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                "notes": f"Uses Packback. {'; '.join(courses[:3])}".strip().rstrip('.'),
            })

        logger.info(f"Found {len(faculty)} faculty on {url}")
        return faculty

    def _extract_instructor_names(self, text: str) -> list[str]:
        names = []
        seen = set()

        patterns = [
            re.compile(
                r'(?:instructor|professor|taught\s+by|faculty|lecturer)\s*[:\-]?\s*'
                r'((?:Dr\.\s+|Prof(?:essor)?\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
                re.IGNORECASE,
            ),
            re.compile(
                r'(?:PROFESSOR|PROF\.?)\s+([A-Z]\.?\s*[A-Z][A-Za-z]+)',
            ),
            re.compile(
                r'((?:Dr\.\s+|Prof(?:essor)?\.?\s+)[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)',
            ),
        ]

        for pattern in patterns:
            for match in pattern.finditer(text):
                raw = match.group(1).strip()
                name = re.sub(r'^(?:Dr\.\s*|Prof(?:essor)?\.?\s*)', '', raw).strip()
                if self._is_valid_name(name) and name.lower() not in seen:
                    seen.add(name.lower())
                    names.append(name)

        return names

    def _is_valid_name(self, name: str) -> bool:
        if len(name) < 3 or len(name) > 60:
            return False
        parts = name.split()
        if len(parts) < 1 or len(parts) > 5:
            return False
        skip_words = [
            "university", "college", "department", "school", "course",
            "section", "class", "spring", "fall", "summer", "winter",
            "packback", "textbook", "syllabus", "discussion", "lecture",
            "monday", "tuesday", "wednesday", "thursday", "friday",
            "online", "campus", "building", "hall", "room",
            "required", "optional", "materials", "assignment",
            "key", "takeaway", "grading", "overview", "introduction",
            "the", "and", "for", "with", "from", "about",
            "questions", "requirements", "homework", "exam",
            "learning", "innovative", "tool", "resource",
        ]
        for part in parts:
            if part.lower() in skip_words:
                return False
        return True

    def _extract_courses(self, text: str) -> list[str]:
        pattern = re.compile(r'\b([A-Z]{2,5})\s*(\d{3,5}[A-Z]?)\b')
        courses = []
        seen = set()
        skip_prefixes = {"HTTP", "HTML", "ISBN", "ZOOM", "PAGE", "FALL", "SPRING"}
        for match in pattern.finditer(text):
            prefix = match.group(1)
            if prefix in skip_prefixes:
                continue
            code = f"{prefix} {match.group(2)}"
            if code not in seen:
                seen.add(code)
                courses.append(code)
        return courses

    def _extract_department(self, text: str) -> str:
        dept_pattern = re.compile(
            r'(?:Department\s+of\s+\w+(?:\s+\w+)*|'
            r'(?:Biology|Chemistry|Physics|Mathematics|English|History|'
            r'Psychology|Sociology|Economics|Business|Engineering|'
            r'Computer\s+Science|Political\s+Science|Philosophy|'
            r'Communications?|Education|Nursing|Marketing|Management|'
            r'Accounting|Finance|Statistics|Anthropology|Classics|'
            r'Earth.*Science|Atmospheric)\s*(?:Department)?)',
            re.IGNORECASE,
        )
        match = dept_pattern.search(text)
        return match.group(0).strip() if match else ""

    def _deduplicate(self, contacts: list[dict]) -> list[dict]:
        seen = {}
        unique = []
        for contact in contacts:
            key = contact["name"].lower().strip()
            if key not in seen:
                seen[key] = contact
                seen[key]["_extra_urls"] = set()
                seen[key]["_extra_courses"] = set()
                unique.append(contact)
            else:
                existing = seen[key]
                for field in ["email", "institution", "department"]:
                    if not existing.get(field) and contact.get(field):
                        existing[field] = contact[field]
                if contact.get("course"):
                    existing["_extra_courses"].update(
                        c.strip() for c in contact["course"].split(",") if c.strip()
                    )
                if contact.get("source_url") and contact["source_url"] != existing.get("source_url"):
                    existing["_extra_urls"].add(contact["source_url"])

        for entry in unique:
            extra_courses = entry.pop("_extra_courses", set())
            extra_urls = entry.pop("_extra_urls", set())

            if extra_courses:
                existing_courses = set(
                    c.strip() for c in entry.get("course", "").split(",") if c.strip()
                )
                all_courses = existing_courses | extra_courses
                entry["course"] = ", ".join(sorted(all_courses))

            if extra_urls:
                url_count = len(extra_urls)
                entry["notes"] = f"{entry.get('notes', '')}. Found in {url_count + 1} syllabi/pages".strip().lstrip('.')

        return unique


def main():
    parser = argparse.ArgumentParser(
        description="Scrape university sites for faculty who use Packback"
    )
    parser.add_argument(
        "--urls", nargs="*", default=None,
        help="Custom university URLs to scrape (skips search)",
    )
    parser.add_argument(
        "--domain", type=str, default=None,
        help="University domain to search (e.g. purdue.edu, osu.edu)",
    )
    parser.add_argument(
        "--institution-name", type=str, default=None,
        help="Full institution name (e.g. 'Purdue University')",
    )
    parser.add_argument(
        "--institution", type=str, default=None,
        help="Legacy shorthand: purdue, indiana, or all",
    )
    parser.add_argument(
        "--delay", type=float, default=1.5,
        help="Delay between requests in seconds",
    )
    args = parser.parse_args()

    domain = args.domain
    institution_name = args.institution_name

    if not domain and args.institution:
        legacy_map = {
            "purdue": ("purdue.edu", "Purdue University"),
            "indiana": ("indiana.edu", "Indiana University Bloomington"),
        }
        if args.institution in legacy_map:
            domain, institution_name = legacy_map[args.institution]

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    scraper = PackbackScraper(
        urls=args.urls,
        domain=domain,
        institution_name=institution_name or "",
        request_delay=args.delay,
    )

    results = scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
