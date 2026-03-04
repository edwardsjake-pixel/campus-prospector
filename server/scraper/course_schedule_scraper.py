"""Course schedule scraper.

Scrapes a university's course catalog or schedule-of-classes page to extract:
  lecture days/times, building, room, enrollment counts.

Uses requests + BeautifulSoup (no browser dependency).

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/course_schedule_scraper.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/course_schedule_scraper.py --url "https://catalog.purdue.edu/courses"
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

# Browser rendering fallback for JS-heavy sites
try:
    from server.scraper.browser_utils import fetch_rendered_page, is_js_rendered_page, BROWSER_SUPPORT
except ImportError:
    try:
        from browser_utils import fetch_rendered_page, is_js_rendered_page, BROWSER_SUPPORT
    except ImportError:
        BROWSER_SUPPORT = False
        fetch_rendered_page = None
        is_js_rendered_page = None

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

SESSION_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

SCHEDULE_PATH_HINTS = [
    "/schedule", "/course-schedule", "/class-schedule", "/courses",
    "/catalog", "/course-catalog", "/academics/courses", "/registrar/schedule",
    "/registrar/courses", "/class-search", "/schedule-of-classes",
    "/classes", "/academics/catalog", "/academics/schedule",
    "/registrar/catalog", "/registrar/class-schedule",
    "/course-offerings", "/academics", "/academics/course-catalog",
]

KNOWN_INSTITUTIONS: dict[str, dict] = {
    "purdue.edu": {
        "schedule_url": "https://selfservice.mypurdue.purdue.edu/prod/bwckschd.p_disp_dyn_sched",
        "schedule_mode": "banner",
        "sample_subjects": ["CS", "MA", "PHYS", "ENGL", "ECON", "MGMT", "IE"],
    },
    "asu.edu": {
        "schedule_url": "https://eadvs-cscc-catalog-api.apps.asu.edu/catalog-microservices/api/v1/search/classes",
        "schedule_mode": "asu_api",
        "sample_subjects": ["CSE", "MAT", "PHY", "ENG", "ECN", "MGT", "EEE", "BME", "CHM", "BIO"],
    },
}

DAY_MAP = {
    "monday": "mon", "mon": "mon", "m": "mon",
    "tuesday": "tue", "tue": "tue", "t": "tue",
    "wednesday": "wed", "wed": "wed", "w": "wed",
    "thursday": "thu", "thu": "thu", "r": "thu", "th": "thu",
    "friday": "fri", "fri": "fri", "f": "fri",
}


class CourseScheduleScraper:
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

    def _candidate_urls(self) -> list[str]:
        if not self.domain:
            return []
        urls = []
        for host_prefix in [f"https://www.{self.domain}", f"https://{self.domain}",
                             f"https://catalog.{self.domain}", f"https://registrar.{self.domain}",
                             f"https://classes.{self.domain}", f"https://schedule.{self.domain}"]:
            for path in SCHEDULE_PATH_HINTS[:6]:
                urls.append(f"{host_prefix}{path}")
        return urls

    def _fetch(self, url: str, timeout: int = 20) -> Optional[BeautifulSoup]:
        try:
            resp = self.session.get(url, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # Detect JS-rendered pages and retry with headless browser
            if BROWSER_SUPPORT and is_js_rendered_page and is_js_rendered_page(soup):
                logger.info(f"JS-rendered page detected, retrying with browser: {url}")
                rendered_html = fetch_rendered_page(url)
                if rendered_html:
                    return BeautifulSoup(rendered_html, "html.parser")

            return soup
        except Exception as e:
            logger.debug(f"Fetch failed for {url}: {e}")
            return None

    def _fetch_with_browser(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch a URL using headless browser (for JS-heavy sites)."""
        if not BROWSER_SUPPORT or not fetch_rendered_page:
            return None
        logger.info(f"Browser fetch: {url}")
        html = fetch_rendered_page(url)
        if html:
            return BeautifulSoup(html, "html.parser")
        return None

    def scrape(self) -> dict:
        courses: list[dict] = []
        urls_scraped: list[str] = []

        known = KNOWN_INSTITUTIONS.get(self.domain, {}) if not self.custom_url else {}
        if known and known.get("schedule_mode") == "asu_api":
            courses, urls_scraped = self._scrape_asu_api(known)
        elif known and known.get("schedule_mode") == "banner":
            courses, urls_scraped = self._scrape_banner(known)
        else:
            start_urls = [self.custom_url] if self.custom_url else self._candidate_urls()

            for url in start_urls[:8]:
                soup = self._fetch(url)
                time.sleep(self.request_delay)
                if not soup:
                    continue

                text = soup.get_text(" ", strip=True).lower()
                if not any(kw in text for kw in ["credit", "lecture", "section", "enrollment", "semester"]):
                    continue

                extracted = self._extract_courses(soup, url)
                if extracted:
                    courses.extend(extracted)
                    urls_scraped.append(url)
                    logger.info(f"Extracted {len(extracted)} course sections from {url}")

            # Fallback: try browser rendering for JS-heavy sites
            if not courses and not self.custom_url and BROWSER_SUPPORT:
                logger.info(f"Trying browser-rendered scrape for {self.domain}")
                browser_courses, browser_urls = self._scrape_with_browser()
                courses.extend(browser_courses)
                urls_scraped.extend(browser_urls)

            # Fallback: use search engine to discover schedule pages
            if not courses and not self.custom_url:
                logger.info(f"Candidate URLs failed for {self.domain}, trying search engine discovery")
                search_courses, search_urls = self._scrape_via_search_engine()
                courses.extend(search_courses)
                urls_scraped.extend(search_urls)

            # Fallback: search for schedule PDFs (many schools publish full-semester PDFs)
            if not courses and not self.custom_url:
                logger.info(f"Trying PDF schedule discovery for {self.domain}")
                pdf_courses, pdf_urls = self._scrape_pdf_schedules()
                courses.extend(pdf_courses)
                urls_scraped.extend(pdf_urls)

        deduped = self._deduplicate(courses)

        return {
            "courses": deduped,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": urls_scraped,
            "total_found": len(deduped),
            "records_added": len(deduped),
        }

    def _extract_courses(self, soup: BeautifulSoup, source_url: str) -> list[dict]:
        courses = []

        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            if len(rows) < 3:
                continue
            header_cells = [th.get_text(strip=True).lower() for th in rows[0].find_all(["th", "td"])]
            if not any(h in header_cells for h in ["course", "section", "days", "time", "instructor"]):
                continue

            col_map = {h: i for i, h in enumerate(header_cells)}
            for row in rows[1:]:
                cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                if len(cells) < 3:
                    continue
                course = self._parse_table_row(cells, col_map, source_url)
                if course:
                    courses.append(course)

        if not courses:
            text = soup.get_text("\n", strip=True)
            courses = self._extract_from_text(text, source_url)

        return courses

    def _parse_table_row(self, cells: list[str], col_map: dict, source_url: str) -> Optional[dict]:
        def get(keys):
            for k in keys:
                for col_key, idx in col_map.items():
                    if k in col_key and idx < len(cells):
                        return cells[idx]
            return None

        code = get(["course", "crse", "subject"]) or ""
        name = get(["title", "name", "description"]) or ""
        days_raw = get(["days", "day", "mtwr"]) or ""
        time_raw = get(["time", "hour"]) or ""
        building = get(["building", "bldg", "location", "room"]) or ""
        room = get(["room", "rm"]) or ""
        enrollment = get(["enroll", "enrolled", "actual"]) or ""
        max_enroll = get(["cap", "capacity", "max"]) or ""
        instructor = get(["instructor", "faculty", "professor", "teacher"]) or ""

        if not (code or name):
            return None

        days = self._parse_days(days_raw)
        start_time, end_time = self._parse_time_range(time_raw)

        return {
            "code": code[:30],
            "name": name[:120],
            "days_of_week": days,
            "start_time": start_time,
            "end_time": end_time,
            "building": building[:80],
            "room_number": room[:20],
            "enrollment_count": self._safe_int(enrollment),
            "max_enrollment": self._safe_int(max_enroll),
            "instructor_name": instructor[:80],
            "source_url": source_url,
            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
        }

    def _extract_from_text(self, text: str, source_url: str) -> list[dict]:
        """Regex-based fallback extraction from page text."""
        courses = []
        pattern = re.compile(
            r'([A-Z]{2,5}\s+\d{3,5}[A-Z]?)'
            r'[^\n]{0,60}'
            r'((?:M|T|W|R|F|Mon|Tue|Wed|Thu|Fri)+)'
            r'\s+'
            r'(\d{1,2}:\d{2}\s*(?:AM|PM)?)'
            r'\s*[-–]\s*'
            r'(\d{1,2}:\d{2}\s*(?:AM|PM)?)',
            re.IGNORECASE,
        )
        for m in pattern.finditer(text):
            days = self._parse_days(m.group(2))
            start_time, _ = self._parse_time_range(m.group(3))
            _, end_time = self._parse_time_range(m.group(4))
            courses.append({
                "code": m.group(1).strip(),
                "name": "",
                "days_of_week": days,
                "start_time": start_time,
                "end_time": end_time,
                "building": None,
                "room_number": None,
                "enrollment_count": None,
                "max_enrollment": None,
                "instructor_name": None,
                "source_url": source_url,
                "scraped_date": datetime.now().strftime("%Y-%m-%d"),
            })
        return courses

    def _parse_days(self, raw: str) -> Optional[str]:
        if not raw:
            return None
        raw = raw.strip()
        compound = {
            "mwf": "mon,wed,fri", "mw": "mon,wed", "tr": "tue,thu",
            "tuth": "tue,thu", "tth": "tue,thu", "mtwr": "mon,tue,wed,thu",
            "mtwrf": "mon,tue,wed,thu,fri",
        }
        if raw.lower() in compound:
            return compound[raw.lower()]
        char_map = {"m": "mon", "t": "tue", "w": "wed", "r": "thu", "f": "fri"}
        if re.match(r'^[mtwrf]+$', raw.lower()):
            return ",".join(char_map[c] for c in raw.lower() if c in char_map)
        parts = re.split(r'[,/\s]+', raw.lower())
        days = [DAY_MAP.get(p) for p in parts if DAY_MAP.get(p)]
        return ",".join(days) if days else raw.lower()[:20]

    def _parse_time_range(self, raw: str) -> tuple[Optional[str], Optional[str]]:
        if not raw:
            return None, None
        m = re.match(r'(\d{1,2}:\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)?', raw, re.IGNORECASE)
        if m:
            return self._normalize_time(m.group(1), m.group(2)), self._normalize_time(m.group(3), m.group(4) or m.group(2))
        m2 = re.match(r'(\d{1,2}:\d{2})\s*(AM|PM)?', raw, re.IGNORECASE)
        if m2:
            return self._normalize_time(m2.group(1), m2.group(2)), None
        return None, None

    def _normalize_time(self, time_str: str, ampm: Optional[str]) -> str:
        parts = time_str.split(":")
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        if ampm:
            if ampm.upper() == "PM" and h < 12:
                h += 12
            elif ampm.upper() == "AM" and h == 12:
                h = 0
        return f"{h:02d}:{m:02d}:00"

    def _safe_int(self, val: str) -> Optional[int]:
        try:
            return int(re.sub(r'[^\d]', '', val))
        except (ValueError, TypeError):
            return None

    def _scrape_with_browser(self) -> tuple[list[dict], list[str]]:
        """Use headless browser to scrape course schedules on JS-heavy sites."""
        if not BROWSER_SUPPORT or not fetch_rendered_page:
            return [], []

        courses: list[dict] = []
        urls_scraped: list[str] = []

        # Try candidate URLs with browser rendering
        candidate_urls = self._candidate_urls()[:10]

        for url in candidate_urls:
            if url in urls_scraped:
                continue
            soup = self._fetch_with_browser(url)
            if not soup:
                continue

            text = soup.get_text(" ", strip=True).lower()
            if not any(kw in text for kw in ["credit", "lecture", "section", "enrollment", "semester", "course"]):
                continue

            extracted = self._extract_courses(soup, url)
            if extracted:
                courses.extend(extracted)
                urls_scraped.append(url)
                logger.info(f"Browser scrape: {len(extracted)} courses from {url}")
                break  # Found courses, stop trying candidates

        return courses, urls_scraped

    def _scrape_via_search_engine(self) -> tuple[list[dict], list[str]]:
        """Use search engine to find and scrape course schedule pages."""
        queries = [
            f"site:{self.domain} course schedule classes",
            f"site:{self.domain} class schedule semester",
            f"{self.institution_name} course catalog site:{self.domain}",
        ]
        courses: list[dict] = []
        urls_scraped: list[str] = []

        for query in queries:
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                logger.info(f"Search engine discovery: {query}")
                resp = self.session.get(search_url, timeout=20)
                if resp.status_code != 200:
                    time.sleep(self.request_delay)
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                candidate_urls = self._extract_domain_links_from_search(soup, resp.text)

                for url in candidate_urls[:8]:
                    if url in urls_scraped:
                        continue
                    time.sleep(self.request_delay)
                    page_soup = self._fetch(url)
                    if not page_soup:
                        continue

                    text = page_soup.get_text(" ", strip=True).lower()
                    if not any(kw in text for kw in ["credit", "lecture", "section", "enrollment", "semester", "course", "schedule"]):
                        continue

                    extracted = self._extract_courses(page_soup, url)
                    if extracted:
                        courses.extend(extracted)
                        urls_scraped.append(url)
                        logger.info(f"Search engine scrape: {len(extracted)} courses from {url}")

                time.sleep(self.request_delay)
            except Exception as e:
                logger.debug(f"Search engine discovery failed: {e}")

        return courses, urls_scraped

    def _extract_domain_links_from_search(self, soup: BeautifulSoup, raw_html: str) -> list[str]:
        """Extract links matching self.domain from search result pages."""
        links: list[str] = []
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                href = href.split("/url?q=")[1].split("&")[0]
            href = unquote(href).rstrip(".,;:").split("#")[0]
            if self.domain and self.domain in href and href.startswith("http"):
                if href not in links and "duckduckgo" not in href and "google" not in href:
                    links.append(href)

        for u in re.findall(r'https?://[^\s\)\]"\'<>]+', raw_html):
            u = unquote(u).rstrip(".,;:").split("#")[0]
            if self.domain and self.domain in u and u not in links:
                if "duckduckgo" not in u and "google" not in u:
                    links.append(u)

        return links

    def _scrape_pdf_schedules(self) -> tuple[list[dict], list[str]]:
        """Search for and parse PDF schedule documents."""
        try:
            from server.scraper.pdf_utils import find_pdf_urls_via_search, download_and_extract_text
        except ImportError:
            from pdf_utils import find_pdf_urls_via_search, download_and_extract_text

        search_terms_list = [
            "course schedule",
            "class schedule semester",
            "schedule of classes",
        ]
        courses: list[dict] = []
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

                extracted = self._extract_from_text(text, pdf_url)
                if extracted:
                    courses.extend(extracted)
                    urls_scraped.append(pdf_url)
                    logger.info(f"PDF scrape: {len(extracted)} courses from {pdf_url}")

            if courses:
                break  # Found courses in a PDF, no need to keep searching

        return courses, urls_scraped

    def _scrape_banner(self, config: dict) -> tuple[list[dict], list[str]]:
        """Scrape a Banner Self-Service schedule system."""
        base_url = config["schedule_url"]
        subjects = config.get("sample_subjects", [])
        courses: list[dict] = []
        urls_scraped: list[str] = []

        try:
            logger.info(f"Banner: fetching term list from {base_url}")
            resp = self.session.get(base_url, timeout=20)
            soup = BeautifulSoup(resp.text, "html.parser")

            term_select = soup.find("select", {"name": "p_term"})
            if not term_select:
                logger.warning("Banner: could not find term selector on initial page")
                return [], []

            term_value = None
            for opt in term_select.find_all("option"):
                val = opt.get("value", "").strip()
                if val and val != "%":
                    term_value = val
                    break

            if not term_value:
                logger.warning("Banner: no valid term found")
                return [], []

            logger.info(f"Banner: selected term {term_value}")

            post_url = base_url.replace("p_disp_dyn_sched", "p_proc_term_date")
            time.sleep(self.request_delay)
            self.session.post(post_url, data={"p_calling_proc": "bwckschd.p_disp_dyn_sched", "p_term": term_value}, timeout=20)

            sections_url = base_url.replace("p_disp_dyn_sched", "p_get_crse_unsec")
            for subj in subjects:
                try:
                    time.sleep(self.request_delay)
                    form_data = {
                        "term_in": term_value,
                        "sel_subj": ["dummy", subj],
                        "sel_day": "dummy",
                        "sel_schd": "%",
                        "sel_insm": "%",
                        "sel_camp": "%",
                        "sel_levl": "%",
                        "sel_sess": "%",
                        "sel_instr": "%",
                        "sel_ptrm": "%",
                        "sel_attr": "%",
                        "sel_crse": "",
                        "sel_title": "",
                        "sel_from_cred": "",
                        "sel_to_cred": "",
                        "begin_hh": "0",
                        "begin_mi": "0",
                        "begin_ap": "a",
                        "end_hh": "0",
                        "end_mi": "0",
                        "end_ap": "a",
                    }
                    logger.info(f"Banner: fetching sections for {subj} term={term_value}")
                    resp3 = self.session.post(sections_url, data=form_data, timeout=30)
                    resp3.raise_for_status()

                    extracted = self._extract_banner_sections(resp3.text, sections_url, subj)
                    if extracted:
                        courses.extend(extracted)
                        urls_scraped.append(f"{sections_url}?subj={subj}")
                        logger.info(f"Banner {subj}: {len(extracted)} sections")

                except Exception as e:
                    logger.debug(f"Banner subject {subj} failed: {e}")

        except Exception as e:
            logger.error(f"Banner scrape failed: {e}")

        return courses, urls_scraped

    def _extract_banner_sections(self, html: str, source_url: str, subject: str) -> list[dict]:
        """Parse Banner Self-Service section listing HTML."""
        courses = []
        soup = BeautifulSoup(html, "html.parser")

        for title_th in soup.find_all("th", class_="ddtitle"):
            course_title_text = title_th.get_text(" ", strip=True)
            code_match = re.search(r'([A-Z]{2,5})\s+(\d{3,5})', course_title_text)
            course_code = f"{code_match.group(1)} {code_match.group(2)}" if code_match else subject
            course_name_match = re.match(r'^([^-]+)', course_title_text)
            course_name = course_name_match.group(1).strip() if course_name_match else course_title_text[:80]

            parent_tr = title_th.find_parent("tr")
            if not parent_tr:
                continue
            parent_table = parent_tr.find_parent("table")
            if not parent_table:
                continue
            next_table = parent_table.find_next_sibling("table")
            if not next_table:
                continue

            for row in next_table.find_all("tr")[1:]:
                cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
                if len(cells) < 5:
                    continue

                time_raw = cells[1] if len(cells) > 1 else ""
                days_raw = cells[2] if len(cells) > 2 else ""
                location = cells[3] if len(cells) > 3 else ""
                instructor = cells[6] if len(cells) > 6 else ""

                if time_raw.lower() == "tba" or not time_raw:
                    start_time, end_time = None, None
                else:
                    start_time, end_time = self._parse_time_range(time_raw)

                days = self._parse_days(days_raw) if days_raw.upper() != "TBA" else None

                loc_parts = location.split() if location else []
                room = loc_parts[-1] if loc_parts else None
                building = " ".join(loc_parts[:-1]) if len(loc_parts) > 1 else location

                courses.append({
                    "code": course_code[:30],
                    "name": course_name[:120],
                    "days_of_week": days,
                    "start_time": start_time,
                    "end_time": end_time,
                    "building": building[:80],
                    "room_number": room[:20] if room else None,
                    "enrollment_count": None,
                    "max_enrollment": None,
                    "instructor_name": instructor[:80],
                    "source_url": source_url,
                    "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                })

        return courses

    def _scrape_asu_api(self, config: dict) -> tuple[list[dict], list[str]]:
        """Scrape Arizona State University using their public catalog API."""
        api_url = config["schedule_url"]
        subjects = config.get("sample_subjects", [])
        courses: list[dict] = []
        urls_scraped: list[str] = []

        # Determine current term code: ASU uses YYNN format (e.g., 2251 = Spring 2025)
        now = datetime.now()
        year_prefix = str(now.year)[:3]  # e.g., "225" for 2025
        month = now.month
        if month <= 5:
            term_suffix = "1"  # Spring
        elif month <= 7:
            term_suffix = "7"  # Summer
        else:
            term_suffix = "4"  # Fall (use next year's prefix for fall)
            year_prefix = str(now.year + 1)[:3] if month >= 10 else str(now.year)[:3]
        term_code = f"{year_prefix}{term_suffix}"

        logger.info(f"ASU API: using term code {term_code}")

        for subj in subjects:
            try:
                time.sleep(self.request_delay)
                params = {
                    "refine": "Y",
                    "campusOrOnlineSelection": "A",
                    "term": term_code,
                    "subject": subj,
                    "catalogNbr": "",
                    "searchType": "all",
                    "honors": "F",
                }
                headers = {
                    **SESSION_HEADERS,
                    "Accept": "application/json",
                    "Authorization": "Bearer null",
                }
                logger.info(f"ASU API: fetching {subj} for term {term_code}")
                resp = self.session.get(api_url, params=params, headers=headers, timeout=30)

                if resp.status_code != 200:
                    logger.debug(f"ASU API {subj}: HTTP {resp.status_code}")
                    continue

                data = resp.json()
                class_list = data.get("classes", [])
                logger.info(f"ASU API {subj}: {len(class_list)} classes returned")

                for cls in class_list:
                    course = self._parse_asu_class(cls, api_url)
                    if course:
                        courses.append(course)

                if class_list:
                    urls_scraped.append(f"{api_url}?subject={subj}&term={term_code}")

            except Exception as e:
                logger.debug(f"ASU API subject {subj} failed: {e}")

        # Fallback: try browser-based scraping if API fails
        if not courses and BROWSER_SUPPORT:
            logger.info("ASU API returned no results, trying browser fallback")
            asu_urls = [
                "https://catalog.apps.asu.edu/catalog/classes",
                "https://webapp4.asu.edu/catalog/",
                "https://catalog.asu.edu/",
            ]
            for url in asu_urls:
                soup = self._fetch_with_browser(url)
                if not soup:
                    continue
                text = soup.get_text(" ", strip=True).lower()
                if any(kw in text for kw in ["course", "class", "schedule", "credit"]):
                    extracted = self._extract_courses(soup, url)
                    if extracted:
                        courses.extend(extracted)
                        urls_scraped.append(url)
                        logger.info(f"ASU browser fallback: {len(extracted)} courses from {url}")
                        break

        return courses, urls_scraped

    def _parse_asu_class(self, cls: dict, source_url: str) -> Optional[dict]:
        """Parse a single class record from ASU's catalog API response."""
        subject = cls.get("SUBJECT", "")
        catalog_nbr = cls.get("CATALOGNBR", "")
        code = f"{subject} {catalog_nbr}".strip()
        if not code:
            return None

        title = cls.get("TITLE", "") or cls.get("COURSETITLELONG", "") or ""
        instructor = cls.get("INSTRUCTORSLIST", "") or ""
        if isinstance(instructor, list):
            instructor = ", ".join(instructor)

        # Parse meeting times from MEETINGDAYS and MEETINGTIMESTART/END
        days_raw = cls.get("DAYSTIMELOCATIONS", "")
        days = None
        start_time = None
        end_time = None
        building = None
        room = None

        if isinstance(days_raw, str) and days_raw:
            # Format is often like "MWF 10:00-10:50 AM, COOR 170"
            days_match = re.search(r'([MTWRFSU]+)', days_raw)
            if days_match:
                days = self._parse_days(days_match.group(1))
            time_match = re.search(r'(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)?', days_raw, re.IGNORECASE)
            if time_match:
                start_time = self._normalize_time(time_match.group(1), time_match.group(3))
                end_time = self._normalize_time(time_match.group(2), time_match.group(3))
            loc_match = re.search(r',\s*([A-Z]+)\s+(\d+)', days_raw)
            if loc_match:
                building = loc_match.group(1)
                room = loc_match.group(2)
        elif isinstance(days_raw, list):
            # Sometimes it's a list of meeting objects
            for meeting in days_raw:
                if isinstance(meeting, dict):
                    d = meeting.get("days", "")
                    if d:
                        days = self._parse_days(d)
                    st = meeting.get("startTime", "") or meeting.get("start_time", "")
                    et = meeting.get("endTime", "") or meeting.get("end_time", "")
                    if st:
                        start_time, _ = self._parse_time_range(st)
                    if et:
                        _, end_time = self._parse_time_range(et)
                    building = meeting.get("building", building)
                    room = meeting.get("room", room)
                    break

        enrollment = self._safe_int(str(cls.get("ENRLTOT", ""))) if cls.get("ENRLTOT") is not None else None
        max_enrollment = self._safe_int(str(cls.get("ENRLCAP", ""))) if cls.get("ENRLCAP") is not None else None

        return {
            "code": code[:30],
            "name": title[:120],
            "days_of_week": days,
            "start_time": start_time,
            "end_time": end_time,
            "building": (building or "")[:80] or None,
            "room_number": (room or "")[:20] or None,
            "enrollment_count": enrollment,
            "max_enrollment": max_enrollment,
            "instructor_name": instructor[:80] if instructor else None,
            "source_url": source_url,
            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
        }

    def _deduplicate(self, courses: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result = []
        for c in courses:
            key = f"{c.get('code', '')}|{c.get('days_of_week', '')}|{c.get('start_time', '')}"
            if key not in seen:
                seen.add(key)
                result.append(c)
        return result


def main():
    parser = argparse.ArgumentParser(description="Scrape course schedule for a university")
    parser.add_argument("--domain", type=str, default=None)
    parser.add_argument("--institution-name", type=str, default=None)
    parser.add_argument("--url", type=str, default=None, help="Direct URL to schedule page")
    parser.add_argument("--delay", type=float, default=2.0)
    args = parser.parse_args()

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    scraper = CourseScheduleScraper(
        domain=args.domain,
        institution_name=args.institution_name,
        custom_url=args.url,
        request_delay=args.delay,
    )
    results = scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
