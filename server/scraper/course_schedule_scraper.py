"""Course schedule scraper.

Scrapes a university's course catalog or schedule-of-classes page to extract:
  lecture days/times, building, room, enrollment counts.

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/course_schedule_scraper.py --domain purdue.edu --institution-name "Purdue University"
    python3 server/scraper/course_schedule_scraper.py --url "https://catalog.purdue.edu/courses"
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

import requests
from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

# Common schedule/catalog URL patterns
SCHEDULE_PATH_HINTS = [
    "/schedule", "/course-schedule", "/class-schedule", "/courses",
    "/catalog", "/course-catalog", "/academics/courses", "/registrar/schedule",
    "/registrar/courses", "/class-search",
]

# Institution-specific schedule URLs that need custom handling.
# "schedule_mode" controls which scrape strategy is used.
KNOWN_INSTITUTIONS: dict[str, dict] = {
    "purdue.edu": {
        # Banner Self-Service: requires a term-selection POST then a section-listing GET
        "schedule_url": "https://selfservice.mypurdue.purdue.edu/prod/bwckschd.p_disp_dyn_sched",
        "schedule_mode": "banner",
        # Subjects to sample — full run would enumerate all Banner subjects
        "sample_subjects": ["CS", "MA", "PHYS", "ENGL", "ECON", "MGMT", "IE"],
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

    def _candidate_urls(self) -> list[str]:
        if not self.domain:
            return []
        urls = []
        for host_prefix in [f"https://www.{self.domain}", f"https://{self.domain}",
                             f"https://catalog.{self.domain}", f"https://registrar.{self.domain}"]:
            for path in SCHEDULE_PATH_HINTS[:4]:
                urls.append(f"{host_prefix}{path}")
        return urls

    async def scrape(self) -> dict:
        browser_config = BrowserConfig(headless=True, verbose=False, text_mode=False)
        courses = []
        urls_scraped = []

        # Institution-specific handling takes priority over generic probing
        known = KNOWN_INSTITUTIONS.get(self.domain, {}) if not self.custom_url else {}
        if known and known.get("schedule_mode") == "banner":
            courses, urls_scraped = await self._scrape_banner(known)
        else:
            start_urls = [self.custom_url] if self.custom_url else self._candidate_urls()

            async with AsyncWebCrawler(config=browser_config) as crawler:
                for url in start_urls[:6]:
                    try:
                        run_config = CrawlerRunConfig(
                            wait_for="css:body",
                            js_code=["window.scrollTo(0, document.body.scrollHeight);",
                                     "await new Promise(r => setTimeout(r, 1000));"],
                        )
                        result = await crawler.arun(url=url, config=run_config)
                        await asyncio.sleep(self.request_delay)

                        if not result.success:
                            continue

                        md = result.markdown if isinstance(result.markdown, str) else str(result.markdown)
                        html = result.html or ""

                        if not any(kw in md.lower() for kw in ["credit", "lecture", "section", "enrollment", "semester"]):
                            continue

                        extracted = self._extract_courses(md, html, url)
                        if extracted:
                            courses.extend(extracted)
                            urls_scraped.append(url)
                            logger.info(f"Extracted {len(extracted)} course sections from {url}")

                    except Exception as e:
                        logger.debug(f"URL {url} failed: {e}")

        deduped = self._deduplicate(courses)

        return {
            "courses": deduped,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": urls_scraped,
            "total_found": len(deduped),
            "records_added": len(deduped),
        }

    def _extract_courses(self, markdown: str, html: str, source_url: str) -> list[dict]:
        courses = []

        # Try structured HTML table extraction first
        if html:
            soup = BeautifulSoup(html, "html.parser")
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

        # Fallback: regex extraction from markdown
        if not courses:
            courses = self._extract_from_markdown(markdown, source_url)

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

    def _extract_from_markdown(self, markdown: str, source_url: str) -> list[dict]:
        """Regex-based fallback extraction from markdown text."""
        courses = []
        # Pattern: "CS 101  Intro to CS  MWF 9:00-10:00 AM  BRNG 1234"
        pattern = re.compile(
            r'([A-Z]{2,5}\s+\d{3,5}[A-Z]?)'       # course code
            r'[^\n]{0,60}'                          # anything
            r'((?:M|T|W|R|F|Mon|Tue|Wed|Thu|Fri)+)'  # days
            r'\s+'
            r'(\d{1,2}:\d{2}\s*(?:AM|PM)?)'        # start time
            r'\s*[-–]\s*'
            r'(\d{1,2}:\d{2}\s*(?:AM|PM)?)',        # end time
            re.IGNORECASE,
        )
        for m in pattern.finditer(markdown):
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
        # Handle compound abbrevs like "MWF", "TTh", "TR"
        compound = {
            "mwf": "mon,wed,fri", "mw": "mon,wed", "tr": "tue,thu",
            "tuth": "tue,thu", "tth": "tue,thu", "mtwr": "mon,tue,wed,thu",
            "mtwrf": "mon,tue,wed,thu,fri",
        }
        if raw.lower() in compound:
            return compound[raw.lower()]
        # Individual char mapping
        char_map = {"m": "mon", "t": "tue", "w": "wed", "r": "thu", "f": "fri"}
        if re.match(r'^[mtwrf]+$', raw.lower()):
            return ",".join(char_map[c] for c in raw.lower() if c in char_map)
        # Full day names
        parts = re.split(r'[,/\s]+', raw.lower())
        days = [DAY_MAP.get(p) for p in parts if DAY_MAP.get(p)]
        return ",".join(days) if days else raw.lower()[:20]

    def _parse_time_range(self, raw: str) -> tuple[Optional[str], Optional[str]]:
        if not raw:
            return None, None
        # Try "9:00 AM - 10:15 AM"
        m = re.match(r'(\d{1,2}:\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)?', raw, re.IGNORECASE)
        if m:
            return self._normalize_time(m.group(1), m.group(2)), self._normalize_time(m.group(3), m.group(4) or m.group(2))
        # Single time
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

    async def _scrape_banner(self, config: dict) -> tuple[list[dict], list[str]]:
        """
        Scrape a Banner Self-Service schedule system.

        Flow:
          1. GET the dynamic schedule page to retrieve the current term options.
          2. POST with the selected term to get the subject list.
          3. For each sample subject, POST to retrieve section listings.
          4. Parse the resulting HTML tables.
        """
        base_url = config["schedule_url"]
        subjects = config.get("sample_subjects", [])
        courses: list[dict] = []
        urls_scraped: list[str] = []

        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; CampusAlly/1.0)",
        })

        try:
            # Step 1: GET the initial page to discover available terms
            logger.info(f"Banner: fetching term list from {base_url}")
            resp = session.get(base_url, timeout=20)
            soup = BeautifulSoup(resp.text, "html.parser")

            term_select = soup.find("select", {"name": "p_term"})
            if not term_select:
                logger.warning("Banner: could not find term selector on initial page")
                return [], []

            # Pick the first non-empty term option (most recent term)
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

            # Step 2: POST to get subject list for the selected term
            post_url = base_url.replace("p_disp_dyn_sched", "p_proc_term_date")
            await asyncio.sleep(self.request_delay)
            resp2 = session.post(post_url, data={"p_calling_proc": "bwckschd.p_disp_dyn_sched", "p_term": term_value}, timeout=20)

            # Step 3: For each sample subject, retrieve sections
            sections_url = base_url.replace("p_disp_dyn_sched", "p_get_crse_unsec")
            for subj in subjects:
                try:
                    await asyncio.sleep(self.request_delay)
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
                    resp3 = session.post(sections_url, data=form_data, timeout=30)
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

        # Banner wraps each course in a <th class="ddtitle"> followed by a <table> of sections
        for title_th in soup.find_all("th", class_="ddtitle"):
            course_title_text = title_th.get_text(" ", strip=True)
            # Extract course code from title like "Introduction to CS - 12345 - CS 101 - 001"
            code_match = re.search(r'([A-Z]{2,5})\s+(\d{3,5})', course_title_text)
            course_code = f"{code_match.group(1)} {code_match.group(2)}" if code_match else subject
            course_name_match = re.match(r'^([^-]+)', course_title_text)
            course_name = course_name_match.group(1).strip() if course_name_match else course_title_text[:80]

            # Find the sibling table with meeting time details
            parent_tr = title_th.find_parent("tr")
            if not parent_tr:
                continue
            parent_table = parent_tr.find_parent("table")
            if not parent_table:
                continue
            next_table = parent_table.find_next_sibling("table")
            if not next_table:
                continue

            for row in next_table.find_all("tr")[1:]:  # skip header row
                cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
                if len(cells) < 5:
                    continue

                # Banner columns: Type | Time | Days | Where | Date Range | Schedule Type | Instructors
                time_raw = cells[1] if len(cells) > 1 else ""
                days_raw = cells[2] if len(cells) > 2 else ""
                location = cells[3] if len(cells) > 3 else ""
                instructor = cells[6] if len(cells) > 6 else ""

                if time_raw.lower() == "tba" or not time_raw:
                    start_time, end_time = None, None
                else:
                    start_time, end_time = self._parse_time_range(time_raw)

                days = self._parse_days(days_raw) if days_raw.upper() != "TBA" else None

                # Split location into building + room
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

    def _deduplicate(self, courses: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result = []
        for c in courses:
            key = f"{c.get('code', '')}|{c.get('days_of_week', '')}|{c.get('start_time', '')}"
            if key not in seen:
                seen.add(key)
                result.append(c)
        return result


async def main():
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
    results = await scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
