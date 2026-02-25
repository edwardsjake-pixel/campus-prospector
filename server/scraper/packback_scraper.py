"""Crawl4AI-powered scraper for finding faculty who use Packback.

Adapted from crawl4ai_scraper for CampusAlly. Runs as a standalone script,
outputs JSON to stdout for consumption by the Node.js backend.

Usage:
    python3 server/scraper/packback_scraper.py [--urls URL1 URL2 ...] [--institution FILTER]
"""

import asyncio
import json
import logging
import re
import sys
import argparse
from datetime import datetime
from typing import Optional

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

DEFAULT_PACKBACK_URLS = [
    "https://www.packback.co/case-studies",
]

PACKBACK_KEYWORDS = [
    "packback", "ai discussion", "curiosity-driven",
    "discussion board", "ai-powered discussion",
]

INSTITUTION_ALIASES = {
    "purdue": ["purdue university", "purdue"],
    "indiana": [
        "indiana university", "indiana university bloomington",
        "iu bloomington", "iu", "iub",
    ],
}


class PackbackScraper:
    """Scrapes publicly available pages to find faculty using Packback."""

    def __init__(self, urls: list[str], institution_filter: Optional[str] = None,
                 request_delay: float = 2.0):
        self.urls = urls or DEFAULT_PACKBACK_URLS
        self.institution_filter = institution_filter
        self.request_delay = request_delay

    async def scrape(self) -> dict:
        """Run the scrape and return results as a dict."""
        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            text_mode=True,
        )

        all_contacts = []
        all_urls_scraped = list(self.urls)

        async with AsyncWebCrawler(config=browser_config) as crawler:
            discovered_links = []
            for url in self.urls:
                try:
                    contacts, sub_links = await self._scrape_url_with_links(
                        crawler, url
                    )
                    all_contacts.extend(contacts)
                    discovered_links.extend(sub_links)
                    await asyncio.sleep(self.request_delay)
                except Exception as e:
                    logger.error(f"Error scraping {url}: {e}")

            max_sub_pages = 5
            seen = set(self.urls)
            followed = 0
            for link in discovered_links:
                if followed >= max_sub_pages:
                    break
                if link in seen:
                    continue
                seen.add(link)
                try:
                    logger.info(f"Following sub-page ({followed + 1}/{max_sub_pages}): {link}")
                    contacts = await self._scrape_url(crawler, link)
                    all_contacts.extend(contacts)
                    all_urls_scraped.append(link)
                    followed += 1
                    await asyncio.sleep(self.request_delay)
                except Exception as e:
                    logger.error(f"Error scraping sub-page {link}: {e}")

        all_contacts = self._deduplicate(all_contacts)

        if self.institution_filter:
            all_contacts = self._filter_by_institution(all_contacts)

        return {
            "faculty": all_contacts,
            "scraped_at": datetime.now().isoformat(),
            "urls_scraped": all_urls_scraped,
            "total_found": len(all_contacts),
        }

    async def _scrape_url_with_links(
        self, crawler, url: str
    ) -> tuple[list[dict], list[str]]:
        """Scrape a URL and also discover case study sub-page links."""
        contacts = await self._scrape_url(crawler, url)

        run_config = CrawlerRunConfig(wait_for="css:body")
        result = await crawler.arun(url=url, config=run_config)
        sub_links = []
        if result.success:
            markdown = result.markdown if isinstance(result.markdown, str) else str(result.markdown)
            found = re.findall(
                r'https?://(?:www\.)?packback\.co/case-stud(?:ies|y)/[^\s\)\]"\']+',
                markdown,
            )
            sub_links = list(dict.fromkeys(found))

        return contacts, sub_links

    async def _scrape_url(self, crawler, url: str) -> list[dict]:
        """Scrape a single URL for Packback-related faculty contacts."""
        logger.info(f"Scraping: {url}")

        run_config = CrawlerRunConfig(
            wait_for="css:body",
            js_code=[
                "window.scrollTo(0, document.body.scrollHeight);",
                "await new Promise(r => setTimeout(r, 2000));",
            ],
        )

        result = await crawler.arun(url=url, config=run_config)

        if not result.success:
            logger.error(f"Failed to crawl {url}: {result.error_message}")
            return []

        markdown = result.markdown if isinstance(result.markdown, str) else str(result.markdown)

        contacts = self._extract_contacts_from_markdown(markdown, url)

        if result.extracted_content:
            try:
                extracted = json.loads(result.extracted_content)
                if isinstance(extracted, list):
                    for item in extracted:
                        contact = self._parse_extracted_item(item, url)
                        if contact:
                            contacts.append(contact)
            except (json.JSONDecodeError, TypeError):
                pass

        return contacts

    def _extract_contacts_from_markdown(self, markdown: str, source_url: str) -> list[dict]:
        """Extract faculty contacts from markdown content."""
        contacts = []

        is_packback_page = "packback.co" in source_url.lower()
        page_has_packback = any(kw in markdown.lower() for kw in PACKBACK_KEYWORDS)

        sections = re.split(r'\n(?=#{1,3}\s)', markdown)

        for section in sections:
            section_relevant = is_packback_page or page_has_packback or any(
                kw in section.lower() for kw in PACKBACK_KEYWORDS
            )
            if not section_relevant:
                continue

            names_and_titles = self._extract_names_and_titles(section)
            emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', section)
            institution = self._extract_institution(section)
            if not institution:
                institution = self._extract_institution(markdown)
            department = self._extract_department(section)

            for i, (name, title) in enumerate(names_and_titles):
                contact = {
                    "name": name,
                    "title": title,
                    "email": emails[i] if i < len(emails) else "",
                    "institution": institution,
                    "department": department,
                    "source_url": source_url,
                    "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                    "notes": "Found via Packback web scrape",
                }
                contacts.append(contact)

        quote_patterns = [
            re.compile(
                r'["\u201c](.+?)["\u201d]\s*[-\u2014\u2013]\s*'
                r'((?:Dr\.\s+|Prof(?:essor)?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)',
                re.DOTALL,
            ),
            re.compile(
                r'(?:—|--)\s*((?:Dr\.\s+|Prof(?:essor)?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)'
                r'(?:,\s*(.+?))?(?:\n|$)',
            ),
        ]

        for pattern in quote_patterns:
            for match in pattern.finditer(markdown):
                name = match.group(2) if len(match.groups()) >= 2 else match.group(1)
                name = name.strip()
                if 3 <= len(name) <= 80 and not any(
                    skip in name.lower() for skip in [
                        "packback", "click", "read more", "learn more",
                        "sign up", "get started", "contact us",
                    ]
                ):
                    institution = self._extract_institution(
                        markdown[max(0, match.start() - 200):match.end() + 200]
                    )
                    already_found = any(
                        c["name"].lower() == name.lower() for c in contacts
                    )
                    if not already_found:
                        contacts.append({
                            "name": name,
                            "title": "",
                            "email": "",
                            "institution": institution,
                            "department": "",
                            "source_url": source_url,
                            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
                            "notes": "Found via Packback web scrape (testimonial)",
                        })

        return contacts

    def _extract_names_and_titles(self, text: str) -> list[tuple[str, str]]:
        """Extract faculty names and academic titles from text."""
        results = []

        title_name_pattern = re.compile(
            r'((?:Dr\.\s+|Prof(?:essor)?\s+|Associate\s+Professor\s+|'
            r'Assistant\s+Professor\s+|Lecturer\s+|Instructor\s+)'
            r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)',
            re.IGNORECASE,
        )
        for match in title_name_pattern.finditer(text):
            full = match.group(1).strip()
            title_match = re.match(
                r'(Dr\.|Prof(?:essor)?|Associate\s+Professor|'
                r'Assistant\s+Professor|Lecturer|Instructor)\s+',
                full, re.IGNORECASE,
            )
            if title_match:
                title = title_match.group(1)
                name = full[title_match.end():].strip()
            else:
                title = ""
                name = full
            if 3 <= len(name) <= 80:
                results.append((name, title))

        bold_name_pattern = re.compile(r'\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\*\*')
        for match in bold_name_pattern.finditer(text):
            name = match.group(1).strip()
            if (
                3 <= len(name) <= 80
                and not any(n[0].lower() == name.lower() for n in results)
                and not any(
                    skip in name.lower() for skip in [
                        "university", "college", "department", "school",
                        "packback", "read more",
                    ]
                )
            ):
                surrounding = text[max(0, match.start() - 100):match.end() + 100]
                title_match = re.search(
                    r'(Professor|Associate|Assistant|Lecturer|Instructor|Chair|Dean)',
                    surrounding, re.IGNORECASE,
                )
                title = title_match.group(1) if title_match else ""
                results.append((name, title))

        return results

    def _extract_institution(self, text: str) -> str:
        """Extract university/institution name from text."""
        uni_pattern = re.compile(
            r'(?:University\s+of\s+\w+(?:\s+\w+)?|'
            r'\w+(?:\s+\w+)?\s+University|'
            r'\w+(?:\s+\w+)?\s+College|'
            r'(?:Purdue|Indiana|IU|MIT|Stanford|Harvard|Yale|Duke|'
            r'Cornell|Berkeley|UCLA|USC|NYU|Georgetown|'
            r'Michigan|Ohio\s+State|Penn\s+State|Texas\s+A&M))',
            re.IGNORECASE,
        )
        match = uni_pattern.search(text)
        return match.group(0).strip() if match else ""

    def _extract_department(self, text: str) -> str:
        """Extract department from text."""
        dept_pattern = re.compile(
            r'(?:Department\s+of\s+\w+(?:\s+\w+)*|'
            r'(?:Biology|Chemistry|Physics|Mathematics|English|History|'
            r'Psychology|Sociology|Economics|Business|Engineering|'
            r'Computer\s+Science|Political\s+Science|Philosophy|'
            r'Communications?|Education|Nursing|'
            r'Marketing|Management|Accounting)\s*(?:Department)?)',
            re.IGNORECASE,
        )
        match = dept_pattern.search(text)
        return match.group(0).strip() if match else ""

    def _parse_extracted_item(self, item: dict, source_url: str) -> Optional[dict]:
        """Parse a single extracted JSON item into a contact dict."""
        name = item.get("name", "").strip()
        if not name or len(name) < 3:
            return None

        text_content = json.dumps(item).lower()
        if not any(kw in text_content for kw in PACKBACK_KEYWORDS):
            return None

        return {
            "name": name,
            "title": item.get("title", ""),
            "email": item.get("email", ""),
            "institution": item.get("institution", "") or item.get("university", ""),
            "department": item.get("department", ""),
            "source_url": source_url,
            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Found via Packback web scrape",
        }

    def _deduplicate(self, contacts: list[dict]) -> list[dict]:
        """Remove duplicate contacts by name."""
        seen = {}
        unique = []
        for contact in contacts:
            key = contact["name"].lower().strip()
            if key not in seen:
                seen[key] = contact
                unique.append(contact)
            else:
                existing = seen[key]
                for field in ["email", "institution", "department", "title"]:
                    if not existing.get(field) and contact.get(field):
                        existing[field] = contact[field]
        return unique

    def _filter_by_institution(self, contacts: list[dict]) -> list[dict]:
        """Filter contacts by institution if a filter is set."""
        filter_key = self.institution_filter.lower().strip()

        aliases = INSTITUTION_ALIASES.get(filter_key, [filter_key])

        filtered = []
        for contact in contacts:
            inst = contact.get("institution", "").lower()
            if not inst:
                filtered.append(contact)
                continue
            if any(alias in inst for alias in aliases):
                filtered.append(contact)

        return filtered


async def main():
    parser = argparse.ArgumentParser(description="Scrape Packback faculty contacts")
    parser.add_argument(
        "--urls", nargs="*", default=None,
        help="URLs to scrape (defaults to Packback website)",
    )
    parser.add_argument(
        "--institution", type=str, default=None,
        help="Filter by institution (e.g., 'purdue', 'indiana')",
    )
    parser.add_argument(
        "--delay", type=float, default=1.0,
        help="Delay between requests in seconds",
    )
    args = parser.parse_args()

    import os
    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    scraper = PackbackScraper(
        urls=args.urls,
        institution_filter=args.institution,
        request_delay=args.delay,
    )

    results = await scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
