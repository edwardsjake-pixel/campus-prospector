"""Crawl4AI-powered scraper for university faculty directories and course catalogs.

Uses Crawl4AI's async browser-based crawler to handle JavaScript-rendered pages,
infinite scroll, and other dynamic content that requests+BeautifulSoup can't reach.

Setup:
    pip install crawl4ai
    crawl4ai-setup
"""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Optional

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

from src.models.faculty import Faculty
from src.models.course import Course
from src.models.institution import Institution

logger = logging.getLogger(__name__)


class Crawl4AIScraper:
    """University scraper powered by Crawl4AI.

    Supports two modes:
    1. CSS extraction: Uses JsonCssExtractionStrategy with configured selectors
    2. Markdown extraction: Crawls pages and parses the LLM-friendly markdown output

    Config structure:
    {
        "request_delay": 2.0,
        "faculty": {
            "urls": ["https://..."],           // one or more directory page URLs
            "schema": { ... },                 // JsonCssExtractionStrategy schema
            "js_commands": ["..."],            // optional JS to run before extraction
            "wait_for": "css:div.faculty",     // optional wait-for selector
            "pagination": {
                "type": "scroll" | "click" | "url_param",
                "selector": "button.load-more",  // for click-based
                "param": "page",                  // for url_param-based
                "max_pages": 20
            }
        },
        "courses": {
            "urls": ["https://..."],
            "schema": { ... },
            "js_commands": ["..."],
            "wait_for": "css:table.courses",
            "pagination": { ... }
        }
    }
    """

    def __init__(self, institution: Institution, config: dict):
        self.institution = institution
        self.config = config
        self.request_delay = config.get("request_delay", 2.0)

    async def scrape_faculty(self) -> list[Faculty]:
        """Scrape faculty directory pages using Crawl4AI."""
        faculty_config = self.config.get("faculty", {})
        urls = faculty_config.get("urls", [])
        if not urls:
            logger.warning(f"No faculty URLs configured for {self.institution.name}")
            return []

        schema = faculty_config.get("schema")
        faculty_list = []

        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            for url in urls:
                page_faculty = await self._scrape_faculty_url(
                    crawler, url, faculty_config, schema
                )
                faculty_list.extend(page_faculty)

                # Handle pagination
                pagination = faculty_config.get("pagination", {})
                if pagination:
                    more = await self._paginate_faculty(
                        crawler, url, faculty_config, schema, pagination
                    )
                    faculty_list.extend(more)

        logger.info(f"Scraped {len(faculty_list)} faculty from {self.institution.name}")
        return faculty_list

    async def _scrape_faculty_url(
        self, crawler, url: str, faculty_config: dict, schema: Optional[dict]
    ) -> list[Faculty]:
        """Scrape a single faculty directory URL."""
        run_config = CrawlerRunConfig(
            wait_for=faculty_config.get("wait_for", ""),
            js_code=faculty_config.get("js_commands"),
            extraction_strategy=JsonCssExtractionStrategy(schema) if schema else None,
        )

        result = await crawler.arun(url=url, config=run_config)

        if not result.success:
            logger.error(f"Failed to crawl {url}: {result.error_message}")
            return []

        if schema and result.extracted_content:
            return self._parse_faculty_extracted(result.extracted_content)
        elif result.markdown:
            return self._parse_faculty_markdown(
                result.markdown if isinstance(result.markdown, str) else str(result.markdown),
                faculty_config
            )

        return []

    async def _paginate_faculty(
        self, crawler, base_url: str, faculty_config: dict,
        schema: Optional[dict], pagination: dict
    ) -> list[Faculty]:
        """Handle paginated faculty directories."""
        faculty_list = []
        max_pages = pagination.get("max_pages", 20)
        pag_type = pagination.get("type", "url_param")

        for page in range(2, max_pages + 1):
            await asyncio.sleep(self.request_delay)

            if pag_type == "url_param":
                param = pagination.get("param", "page")
                sep = "&" if "?" in base_url else "?"
                url = f"{base_url}{sep}{param}={page}"
            elif pag_type == "scroll":
                # Infinite scroll: use JS to scroll down
                run_config = CrawlerRunConfig(
                    wait_for=faculty_config.get("wait_for", ""),
                    js_code=[
                        "window.scrollTo(0, document.body.scrollHeight);",
                        "await new Promise(r => setTimeout(r, 2000));",
                    ],
                    extraction_strategy=(
                        JsonCssExtractionStrategy(schema) if schema else None
                    ),
                )
                result = await crawler.arun(url=base_url, config=run_config)
                if result.success and result.extracted_content:
                    page_faculty = self._parse_faculty_extracted(result.extracted_content)
                    if not page_faculty:
                        break
                    faculty_list.extend(page_faculty)
                continue
            elif pag_type == "click":
                # Click a "next" or "load more" button
                selector = pagination.get("selector", "a.next")
                run_config = CrawlerRunConfig(
                    wait_for=faculty_config.get("wait_for", ""),
                    js_code=[
                        f"document.querySelector('{selector}')?.click();",
                        "await new Promise(r => setTimeout(r, 2000));",
                    ],
                    extraction_strategy=(
                        JsonCssExtractionStrategy(schema) if schema else None
                    ),
                )
                result = await crawler.arun(url=base_url, config=run_config)
                if result.success and result.extracted_content:
                    page_faculty = self._parse_faculty_extracted(result.extracted_content)
                    if not page_faculty:
                        break
                    faculty_list.extend(page_faculty)
                continue
            else:
                break

            page_faculty = await self._scrape_faculty_url(
                crawler, url, faculty_config, schema
            )
            if not page_faculty:
                break
            faculty_list.extend(page_faculty)

        return faculty_list

    def _parse_faculty_extracted(self, extracted_content: str) -> list[Faculty]:
        """Parse faculty from Crawl4AI JSON extraction results."""
        try:
            records = json.loads(extracted_content)
        except (json.JSONDecodeError, TypeError):
            return []

        if not isinstance(records, list):
            records = [records]

        faculty_list = []
        for rec in records:
            name = rec.get("name", "").strip()
            if not name:
                continue

            faculty_list.append(Faculty(
                name=name,
                institution_name=self.institution.name,
                department=rec.get("department", ""),
                email=rec.get("email", ""),
                title=rec.get("title", ""),
                rank=rec.get("rank", ""),
                phone=rec.get("phone", ""),
                office_location=rec.get("office", ""),
                profile_url=rec.get("profile_url", ""),
                research_areas=[
                    a.strip() for a in rec.get("research_areas", "").split(",")
                    if a.strip()
                ] if isinstance(rec.get("research_areas"), str) else rec.get("research_areas", []),
                scraped_date=datetime.now().strftime("%Y-%m-%d"),
                source_urls=[rec.get("source_url", "")],
            ))

        return faculty_list

    def _parse_faculty_markdown(self, markdown: str, config: dict) -> list[Faculty]:
        """Parse faculty info from markdown output (fallback when no CSS schema)."""
        faculty_list = []
        # Split by common patterns for faculty entries
        # Look for patterns like "## Name" or "### Name" or "**Name**"
        blocks = re.split(r'\n(?=##\s|###\s|\*\*[A-Z])', markdown)

        for block in blocks:
            name_match = re.search(r'(?:##\s+|###\s+|\*\*)(.+?)(?:\*\*|\n)', block)
            if not name_match:
                continue

            name = name_match.group(1).strip()
            if len(name) < 3 or len(name) > 80:
                continue

            email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', block)
            title_match = re.search(
                r'(?:Professor|Associate|Assistant|Lecturer|Instructor|Chair|Dean)'
                r'[^\n]*',
                block, re.IGNORECASE
            )

            faculty_list.append(Faculty(
                name=name,
                institution_name=self.institution.name,
                department=config.get("default_department", ""),
                email=email_match.group(0) if email_match else "",
                title=title_match.group(0).strip() if title_match else "",
                scraped_date=datetime.now().strftime("%Y-%m-%d"),
            ))

        return faculty_list

    async def scrape_courses(self) -> list[Course]:
        """Scrape course catalog pages using Crawl4AI."""
        courses_config = self.config.get("courses", {})
        urls = courses_config.get("urls", [])
        if not urls:
            logger.warning(f"No course URLs configured for {self.institution.name}")
            return []

        schema = courses_config.get("schema")
        courses = []

        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            for url in urls:
                run_config = CrawlerRunConfig(
                    wait_for=courses_config.get("wait_for", ""),
                    js_code=courses_config.get("js_commands"),
                    extraction_strategy=(
                        JsonCssExtractionStrategy(schema) if schema else None
                    ),
                )
                result = await crawler.arun(url=url, config=run_config)

                if not result.success:
                    logger.error(f"Failed to crawl courses from {url}")
                    continue

                if schema and result.extracted_content:
                    page_courses = self._parse_courses_extracted(
                        result.extracted_content
                    )
                else:
                    page_courses = self._parse_courses_markdown(
                        result.markdown if isinstance(result.markdown, str) else str(result.markdown),
                        courses_config,
                    )

                courses.extend(page_courses)

                # Handle pagination
                pagination = courses_config.get("pagination", {})
                if pagination.get("type") == "url_param":
                    max_pages = pagination.get("max_pages", 50)
                    param = pagination.get("param", "page")
                    for page in range(2, max_pages + 1):
                        await asyncio.sleep(self.request_delay)
                        sep = "&" if "?" in url else "?"
                        page_url = f"{url}{sep}{param}={page}"
                        result = await crawler.arun(url=page_url, config=run_config)
                        if not result.success:
                            break
                        if schema and result.extracted_content:
                            pc = self._parse_courses_extracted(result.extracted_content)
                        else:
                            pc = self._parse_courses_markdown(
                                result.markdown if isinstance(result.markdown, str) else str(result.markdown),
                                courses_config,
                            )
                        if not pc:
                            break
                        courses.extend(pc)

        logger.info(f"Scraped {len(courses)} courses from {self.institution.name}")
        return courses

    def _parse_courses_extracted(self, extracted_content: str) -> list[Course]:
        """Parse courses from Crawl4AI JSON extraction results."""
        try:
            records = json.loads(extracted_content)
        except (json.JSONDecodeError, TypeError):
            return []

        if not isinstance(records, list):
            records = [records]

        courses_config = self.config.get("courses", {})
        default_term = courses_config.get("default_term", "")

        courses = []
        for rec in records:
            course_id = rec.get("course_id", "").strip()
            course_name = rec.get("course_name", "").strip()
            if not course_id and not course_name:
                continue

            enrollment = self._parse_int(rec.get("enrollment"))
            capacity = self._parse_int(rec.get("capacity"))

            courses.append(Course(
                course_id=course_id,
                course_name=course_name,
                department=rec.get("department", ""),
                institution_name=self.institution.name,
                term=rec.get("term", "") or default_term,
                enrollment=enrollment,
                capacity=capacity,
                instructor_name=rec.get("instructor", ""),
                instructor_email=rec.get("instructor_email", ""),
                instructor_title=rec.get("instructor_title", ""),
                modality=rec.get("modality", ""),
                meeting_days=rec.get("meeting_days", ""),
                meeting_times=rec.get("meeting_times", ""),
                location=rec.get("location", ""),
                section_number=rec.get("section_number", ""),
                catalog_description=rec.get("catalog_description", ""),
                scraped_date=datetime.now().strftime("%Y-%m-%d"),
                source_url=rec.get("source_url", ""),
            ))

        return courses

    def _parse_courses_markdown(self, markdown: str, config: dict) -> list[Course]:
        """Parse course info from markdown (fallback)."""
        courses = []

        # Look for table rows or structured course listings
        # Common pattern: "| CS 101 | Intro to CS | Smith | 350 |"
        table_rows = re.findall(
            r'\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|', markdown
        )

        for row in table_rows:
            cells = [c.strip() for c in row]
            if len(cells) >= 4:
                course_id = cells[0]
                course_name = cells[1]
                instructor = cells[2]
                enrollment = self._parse_int(cells[3])

                # Skip header rows
                if any(h in course_id.lower() for h in ["course", "---", "id", "number"]):
                    continue

                courses.append(Course(
                    course_id=course_id,
                    course_name=course_name,
                    department=config.get("default_department", ""),
                    institution_name=self.institution.name,
                    term=config.get("default_term", ""),
                    enrollment=enrollment,
                    instructor_name=instructor,
                    scraped_date=datetime.now().strftime("%Y-%m-%d"),
                ))

        return courses

    async def run(self) -> dict:
        """Run full scrape: faculty + courses."""
        logger.info(f"Starting Crawl4AI scrape for {self.institution.name}")

        faculty = await self.scrape_faculty()
        courses = await self.scrape_courses()

        # Cross-reference: mark faculty who teach large courses
        large_instructors = set()
        for c in courses:
            if c.is_large and c.instructor_name:
                large_instructors.add(c.instructor_name.lower().strip())

        for fac in faculty:
            if fac.name.lower().strip() in large_instructors:
                fac.teaches_large_course = True
                # Find their largest course
                matching = [
                    c.enrollment for c in courses
                    if c.instructor_name.lower().strip() == fac.name.lower().strip()
                    and c.enrollment is not None
                ]
                if matching:
                    fac.largest_course_enrollment = max(matching)

        logger.info(
            f"Crawl4AI scraped {len(faculty)} faculty and {len(courses)} courses "
            f"from {self.institution.name}"
        )

        return {"faculty": faculty, "courses": courses}

    @staticmethod
    def _parse_int(value) -> Optional[int]:
        if value is None:
            return None
        if isinstance(value, int):
            return value
        cleaned = re.sub(r"[^\d]", "", str(value))
        return int(cleaned) if cleaned else None


def run_scraper(institution: Institution, config: dict) -> dict:
    """Synchronous wrapper to run the Crawl4AI scraper."""
    scraper = Crawl4AIScraper(institution, config)
    return asyncio.run(scraper.run())
