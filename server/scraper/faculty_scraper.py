"""Faculty directory scraper.

Crawls a university's faculty/staff directory pages to extract:
  name, email, phone, office, bio, photo_url, research interests, tenure status.

Uses requests + BeautifulSoup (no browser dependency).

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/faculty_scraper.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/faculty_scraper.py --name "Jane Smith"  # single-instructor lookup
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
from urllib.parse import urlparse, urljoin, unquote

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

# Common paths universities use for their faculty directories
DIRECTORY_PATH_HINTS = [
    "/faculty", "/faculty-staff", "/faculty-directory", "/people",
    "/directory", "/staff", "/about/faculty", "/academics/faculty",
    "/about/people", "/about/directory", "/our-faculty", "/our-people",
    "/about-us/faculty", "/departments", "/faculty-and-staff",
    "/people/faculty", "/directory/faculty",
]

# Institution-specific directory URLs that don't follow generic patterns.
KNOWN_INSTITUTIONS: dict[str, dict] = {
    "purdue.edu": {
        "directory_url": "https://www.purdue.edu/directory/",
        "search_mode": "purdue_ldap",
    },
}

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
        self.target_name = target_name
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(SESSION_HEADERS)

    def _candidate_urls(self) -> list[str]:
        if not self.domain:
            return []
        urls = []
        for prefix in [f"https://www.{self.domain}", f"https://{self.domain}"]:
            for path in DIRECTORY_PATH_HINTS:
                urls.append(f"{prefix}{path}")
        return urls

    def _fetch(self, url: str, timeout: int = 20) -> Optional[BeautifulSoup]:
        """Fetch a URL and return parsed soup, or None on failure."""
        try:
            resp = self.session.get(url, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            logger.debug(f"Fetch failed for {url}: {e}")
            return None

    def scrape(self) -> dict:
        faculty: list[dict] = []
        urls_scraped: list[str] = []

        if self.target_name:
            result = self._search_single_instructor(self.target_name)
            return {
                "instructor": result,
                "scraped_at": datetime.now().isoformat(),
                "records_added": 1 if result else 0,
            }

        known = KNOWN_INSTITUTIONS.get(self.domain, {})
        if known:
            search_mode = known.get("search_mode")
            dir_url = known.get("directory_url")
            if search_mode == "purdue_ldap":
                people, scraped = self._scrape_purdue_directory(dir_url)
                faculty.extend(people)
                urls_scraped.extend(scraped)
            elif dir_url:
                people, scraped = self._crawl_directory(dir_url)
                faculty.extend(people)
                urls_scraped.extend(scraped)
        else:
            found_dir_url = self._find_directory_url()
            if found_dir_url:
                logger.info(f"Found directory at: {found_dir_url}")
                people, scraped = self._crawl_directory(found_dir_url)
                faculty.extend(people)
                urls_scraped.extend(scraped)

            if not faculty:
                # Last resort: scrape faculty pages found via search engine
                logger.info(f"Trying search engine scrape for {self.domain}")
                search_faculty, search_urls = self._scrape_via_search_engine()
                faculty.extend(search_faculty)
                urls_scraped.extend(search_urls)

            if not faculty:
                # Final fallback: search for faculty directory PDFs
                logger.info(f"Trying PDF faculty directory discovery for {self.domain}")
                pdf_faculty, pdf_urls = self._scrape_pdf_directories()
                faculty.extend(pdf_faculty)
                urls_scraped.extend(pdf_urls)

            if not faculty:
                logger.warning(f"No faculty directory found for {self.domain}")

        return {
            "faculty": faculty,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": urls_scraped,
            "total_found": len(faculty),
            "records_added": len(faculty),
        }

    def _find_directory_url(self) -> Optional[str]:
        """Try candidate URLs; return the first that looks like a faculty directory."""
        for url in self._candidate_urls():
            soup = self._fetch(url)
            if not soup:
                time.sleep(self.request_delay)
                continue
            text = soup.get_text(" ", strip=True).lower()
            if any(kw in text for kw in ["professor", "faculty", "ph.d", "department"]):
                return url
            time.sleep(self.request_delay)

        # Fallback: use search engine to discover the directory URL
        logger.info(f"Candidate URLs failed for {self.domain}, trying search engine discovery")
        return self._search_engine_discover_directory()

    def _search_engine_discover_directory(self) -> Optional[str]:
        """Use DuckDuckGo to find faculty directory pages for the institution."""
        queries = [
            f"site:{self.domain} faculty directory",
            f"site:{self.domain} people faculty staff",
            f"{self.institution_name} faculty directory site:{self.domain}",
        ]
        for query in queries:
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"Search engine discovery: {query}")
                resp = self.session.get(search_url, timeout=20)
                if resp.status_code != 200:
                    time.sleep(self.request_delay)
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                candidate_urls = self._extract_edu_links_from_search(soup, resp.text)

                for candidate in candidate_urls[:5]:
                    time.sleep(self.request_delay)
                    page_soup = self._fetch(candidate)
                    if not page_soup:
                        continue
                    text = page_soup.get_text(" ", strip=True).lower()
                    if any(kw in text for kw in ["professor", "faculty", "ph.d", "department", "staff"]):
                        logger.info(f"Search engine found directory: {candidate}")
                        return candidate

                time.sleep(self.request_delay)
            except Exception as e:
                logger.debug(f"Search engine discovery failed for query '{query}': {e}")

        return None

    def _extract_edu_links_from_search(self, soup: BeautifulSoup, raw_html: str) -> list[str]:
        """Extract .edu links from search result pages."""
        links: list[str] = []
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                href = href.split("/url?q=")[1].split("&")[0]
            href = unquote(href).rstrip(".,;:").split("#")[0]
            if self.domain and self.domain in href and href.startswith("http"):
                if href not in links and "duckduckgo" not in href and "google" not in href:
                    links.append(href)

        # Also scan raw HTML for URLs
        for u in re.findall(r'https?://[^\s\)\]"\'<>]+', raw_html):
            u = unquote(u).rstrip(".,;:").split("#")[0]
            if self.domain and self.domain in u and u not in links:
                if "duckduckgo" not in u and "google" not in u:
                    links.append(u)

        return links

    def _scrape_via_search_engine(self) -> tuple[list[dict], list[str]]:
        """Scrape faculty from individual pages found via search engine queries."""
        queries = [
            f"site:{self.domain} professor email department",
            f"site:{self.domain} faculty profile",
        ]
        people: list[dict] = []
        urls_scraped: list[str] = []

        for query in queries:
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"Search engine scrape: {query}")
                resp = self.session.get(search_url, timeout=20)
                if resp.status_code != 200:
                    time.sleep(self.request_delay)
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                candidate_urls = self._extract_edu_links_from_search(soup, resp.text)

                for url in candidate_urls[:10]:
                    if url in urls_scraped:
                        continue
                    time.sleep(self.request_delay)
                    page_soup = self._fetch(url)
                    if not page_soup:
                        continue
                    extracted = self._parse_html_cards(page_soup, url)
                    if not extracted:
                        extracted = self._parse_from_soup(page_soup, url)
                    if extracted:
                        people.extend(extracted)
                        urls_scraped.append(url)
                        logger.info(f"Search engine scrape: {len(extracted)} people from {url}")

                time.sleep(self.request_delay)
            except Exception as e:
                logger.debug(f"Search engine scrape failed: {e}")

        return self._deduplicate(people), urls_scraped

    def _scrape_pdf_directories(self) -> tuple[list[dict], list[str]]:
        """Search for and parse PDF faculty directories."""
        try:
            from server.scraper.pdf_utils import find_pdf_urls_via_search, download_and_extract_text
        except ImportError:
            from pdf_utils import find_pdf_urls_via_search, download_and_extract_text

        search_terms_list = [
            "faculty directory",
            "faculty staff directory",
            "department faculty list",
        ]
        people: list[dict] = []
        urls_scraped: list[str] = []

        for search_terms in search_terms_list:
            pdf_urls = find_pdf_urls_via_search(
                self.domain, search_terms, session=self.session, max_results=5
            )

            for pdf_url in pdf_urls:
                if pdf_url in urls_scraped:
                    continue
                time.sleep(self.request_delay)
                text = download_and_extract_text(pdf_url, session=self.session)
                if not text:
                    continue

                # Check this PDF actually contains faculty info
                text_lower = text.lower()
                if not any(kw in text_lower for kw in ["professor", "faculty", "ph.d", "department"]):
                    continue

                extracted = self._parse_from_soup(
                    BeautifulSoup(f"<pre>{text}</pre>", "html.parser"), pdf_url
                )
                if extracted:
                    people.extend(extracted)
                    urls_scraped.append(pdf_url)
                    logger.info(f"PDF scrape: {len(extracted)} faculty from {pdf_url}")

            if people:
                break

        return self._deduplicate(people), urls_scraped

    def _crawl_directory(self, directory_url: str) -> tuple[list[dict], list[str]]:
        """Crawl a directory page and extract person cards."""
        soup = self._fetch(directory_url)
        if not soup:
            logger.error(f"Failed to crawl {directory_url}")
            return [], []

        people = self._parse_html_cards(soup, directory_url)
        if not people:
            people = self._parse_from_soup(soup, directory_url)

        sub_urls = self._extract_sub_directory_links(soup, directory_url)
        urls_scraped = [directory_url]

        for sub_url in sub_urls[:30]:
            time.sleep(self.request_delay)
            sub_soup = self._fetch(sub_url)
            if not sub_soup:
                continue
            sub_people = self._parse_from_soup(sub_soup, sub_url)
            people.extend(sub_people)
            urls_scraped.append(sub_url)

        return self._deduplicate(people), urls_scraped

    def _parse_html_cards(self, soup: BeautifulSoup, source_url: str) -> list[dict]:
        """Extract people from structured HTML card layouts (modern university sites)."""
        people = []

        card_selectors = [
            "[class*='faculty']", "[class*='person']", "[class*='people']",
            "[class*='profile']", "[class*='staff']", "[class*='directory']",
            "[class*='card']", "[class*='member']", "article",
            "li[class*='faculty']", "li[class*='person']", "li[class*='profile']",
            "div[itemtype*='Person']",
        ]

        candidates = []
        for selector in card_selectors:
            try:
                found = soup.select(selector)
                if found:
                    candidates.extend(found)
            except Exception:
                continue

        seen_ids = set()
        unique_candidates = []
        for el in candidates:
            el_id = id(el)
            if el_id not in seen_ids:
                seen_ids.add(el_id)
                unique_candidates.append(el)

        for card in unique_candidates:
            text = card.get_text(" ", strip=True)
            if len(text) < 15:
                continue

            name = None
            for name_sel in ["h2", "h3", "h4", "[class*='name']", "[class*='title'] a", "strong", "b"]:
                try:
                    el = card.select_one(name_sel)
                    if el:
                        candidate = el.get_text(" ", strip=True)
                        if self._is_valid_name(candidate):
                            name = candidate
                            break
                except Exception:
                    continue

            if not name:
                name = self._extract_name(text)
            if not name:
                continue

            email = self._extract_email(text)
            phone = self._extract_phone(text)
            title = self._extract_title(text)
            tenure_status = self._infer_tenure_status(title, text)
            bio_snippet = self._extract_bio(text)
            office = self._extract_office(text)

            img = card.find("img")
            photo_url = None
            if img:
                src = img.get("src") or img.get("data-src")
                if src:
                    photo_url = urljoin(source_url, src) if not src.startswith("http") else src

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

        logger.info(f"HTML card extraction: {len(people)} people from {source_url}")
        return people

    def _parse_from_soup(self, soup: BeautifulSoup, source_url: str) -> list[dict]:
        """Extract person records from page content using text analysis."""
        people = []
        text = soup.get_text("\n", strip=True)
        blocks = re.split(r'\n{2,}', text)

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
            office = self._extract_office(block)

            people.append({
                "name": name,
                "email": email,
                "phone": phone,
                "title": title,
                "tenure_status": tenure_status,
                "bio": bio_snippet,
                "photo_url": None,
                "office_location": office,
                "institution": self.institution_name,
                "source_url": source_url,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
            })

        return people

    def _extract_name(self, block: str) -> Optional[str]:
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
        paras = [p.strip() for p in text.split("\n") if len(p.strip()) > 50]
        return paras[0][:500] if paras else None

    def _extract_office(self, text: str) -> Optional[str]:
        m = re.search(
            r'(?:office|room|building|hall)[:\s]+([A-Za-z0-9\s\-\.]+)',
            text, re.IGNORECASE
        )
        if m:
            return m.group(1).strip()[:80]
        return None

    def _extract_sub_directory_links(self, soup: BeautifulSoup, base_url: str) -> list[str]:
        parsed = urlparse(base_url)
        base_path = parsed.path.rstrip("/")
        result = []

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
                continue

            if href.startswith("http"):
                h_parsed = urlparse(href)
                if h_parsed.netloc != parsed.netloc:
                    continue
                full = href.split("#")[0].split("?")[0]
            else:
                full = urljoin(base_url, href.split("#")[0])

            if full == base_url or full in result:
                continue

            path = urlparse(full).path
            is_subpath = path.startswith(base_path + "/") if base_path else False
            is_hint = any(hint in path for hint in DIRECTORY_PATH_HINTS)
            has_faculty_keywords = any(kw in path.lower() for kw in ["faculty", "people", "staff", "directory", "department", "dept"])

            if is_hint or is_subpath or has_faculty_keywords:
                result.append(full)

        return result[:40]

    def _search_single_instructor(self, name: str) -> Optional[dict]:
        """Search for a specific instructor using DuckDuckGo."""
        query = f'"{name}" professor site:edu'
        search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
        try:
            resp = self.session.get(search_url, timeout=20)
            if resp.status_code != 200:
                return None
            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract .edu links from search results
            edu_links = []
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"]
                if ".edu" in href and "duckduckgo" not in href:
                    edu_links.append(href)

            for link in edu_links[:5]:
                time.sleep(self.request_delay)
                page_soup = self._fetch(link)
                if not page_soup:
                    continue
                page_text = page_soup.get_text(" ", strip=True)
                if name.split()[-1].lower() in page_text.lower():
                    people = self._parse_from_soup(page_soup, link)
                    match = next((p for p in people if name.split()[-1].lower() in p["name"].lower()), None)
                    if match:
                        return match
        except Exception as e:
            logger.error(f"Single instructor search failed: {e}")
        return None

    def _scrape_purdue_directory(self, base_url: str) -> tuple[list[dict], list[str]]:
        """
        Purdue's directory at https://www.purdue.edu/directory/ is a search form.
        We query by last-name initial A-Z to enumerate faculty records.
        """
        people: list[dict] = []
        urls_scraped: list[str] = []

        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            search_url = f"{base_url}?search_by=name&query={letter}&submit=Search"
            try:
                logger.info(f"Purdue directory search: letter={letter}")
                soup = self._fetch(search_url)
                time.sleep(self.request_delay)
                if not soup:
                    continue

                text = soup.get_text(" ", strip=True).lower()
                if "no results" in text or "no records" in text:
                    continue

                extracted = self._parse_purdue_results(soup, search_url)
                if extracted:
                    people.extend(extracted)
                    urls_scraped.append(search_url)
                    logger.info(f"Purdue letter={letter}: {len(extracted)} records")

            except Exception as e:
                logger.debug(f"Purdue directory letter={letter} failed: {e}")

        return self._deduplicate(people), urls_scraped

    def _parse_purdue_results(self, soup: BeautifulSoup, source_url: str) -> list[dict]:
        """Parse Purdue LDAP directory result page."""
        people: list[dict] = []

        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue
                cell_texts = [c.get_text(" ", strip=True) for c in cells]
                row_text = " ".join(cell_texts)
                email = self._extract_email(row_text)
                name = None
                for ct in cell_texts:
                    candidate = ct.strip()
                    if self._is_valid_name(candidate):
                        name = candidate
                        break
                if not name:
                    continue
                phone = self._extract_phone(row_text)
                title = self._extract_title(row_text)
                tenure_status = self._infer_tenure_status(title, row_text)
                people.append({
                    "name": name,
                    "email": email,
                    "phone": phone,
                    "title": title,
                    "tenure_status": tenure_status,
                    "bio": None,
                    "photo_url": None,
                    "office_location": self._extract_office(row_text),
                    "institution": self.institution_name,
                    "source_url": source_url,
                    "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                })

        if not people:
            people = self._parse_from_soup(soup, source_url)

        return people

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


def main():
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
    results = scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
