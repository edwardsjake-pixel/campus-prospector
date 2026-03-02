"""Rate My Professors scraper.

Uses the RMP GraphQL API (unofficial, publicly accessible) to fetch instructor
ratings, difficulty scores, and student review counts.

No crawling required — RMP exposes a public GraphQL endpoint.

Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 server/scraper/rmp_scraper.py --name "Jane Smith" --school "Purdue University"
    python3 server/scraper/rmp_scraper.py --domain purdue.edu --institution-name "Purdue University"
"""

import warnings
warnings.filterwarnings("ignore")

import json
import logging
import re
import sys
import os
import argparse
import time
from typing import Optional
from datetime import datetime

import requests

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
RMP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
    "Referer": "https://www.ratemyprofessors.com/",
    "Origin": "https://www.ratemyprofessors.com",
    "Authorization": "Basic dGVzdDp0ZXN0",  # public anonymous token accepted by RMP
}

SCHOOL_SEARCH_QUERY = """
query SchoolSearchQuery($query: String!) {
  newSearch {
    schools(query: $query) {
      edges {
        node {
          id
          name
          city
          state
        }
      }
    }
  }
}
"""

TEACHER_SEARCH_QUERY = """
query TeacherSearchQuery($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: $text, schoolID: $schoolID) {
      edges {
        node {
          id
          firstName
          lastName
          department
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
          school {
            name
          }
        }
      }
    }
  }
}
"""

SCHOOL_TEACHERS_QUERY = """
query SchoolTeachersQuery($schoolID: ID!, $count: Int!) {
  school(id: $schoolID) {
    teachers(first: $count) {
      edges {
        node {
          id
          firstName
          lastName
          department
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  }
}
"""

SCHOOL_TEACHERS_QUERY_PAGINATED = """
query SchoolTeachersQuery($schoolID: ID!, $count: Int!, $cursor: String) {
  school(id: $schoolID) {
    teachers(first: $count, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          firstName
          lastName
          department
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  }
}
"""


class RMPScraper:
    def __init__(
        self,
        institution_name: Optional[str] = None,
        target_name: Optional[str] = None,
        request_delay: float = 1.0,
    ):
        self.institution_name = institution_name or ""
        self.target_name = target_name
        self.request_delay = request_delay
        self.session = requests.Session()
        self.session.headers.update(RMP_HEADERS)

    def _graphql(self, query: str, variables: dict, retries: int = 3) -> Optional[dict]:
        for attempt in range(retries):
            try:
                resp = self.session.post(
                    RMP_GRAPHQL_URL,
                    json={"query": query, "variables": variables},
                    timeout=20,
                )
                resp.raise_for_status()
                data = resp.json()
                if "errors" in data:
                    logger.warning(f"RMP GraphQL errors: {data['errors']}")
                return data
            except Exception as e:
                logger.error(f"RMP GraphQL error (attempt {attempt+1}/{retries}): {e}")
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
        return None

    def _find_school_id(self, school_name: str) -> Optional[str]:
        data = self._graphql(SCHOOL_SEARCH_QUERY, {"query": school_name})
        if not data:
            return None
        edges = data.get("data", {}).get("newSearch", {}).get("schools", {}).get("edges", [])
        if not edges:
            logger.warning(f"No RMP school found for: {school_name}")
            return None
        # Pick the best match (first result)
        return edges[0]["node"]["id"]

    def scrape(self) -> dict:
        if not self.institution_name:
            return {"faculty": [], "records_added": 0, "scraped_at": datetime.now().isoformat()}

        school_id = self._find_school_id(self.institution_name)
        if not school_id:
            return {"faculty": [], "records_added": 0, "scraped_at": datetime.now().isoformat(),
                    "error": f"School '{self.institution_name}' not found on RMP"}

        if self.target_name:
            return self._scrape_single(school_id, self.target_name)
        else:
            return self._scrape_all(school_id)

    def _scrape_single(self, school_id: str, name: str) -> dict:
        time.sleep(self.request_delay)
        data = self._graphql(TEACHER_SEARCH_QUERY, {"text": name, "schoolID": school_id})
        if not data:
            return {"faculty": [], "records_added": 0, "scraped_at": datetime.now().isoformat()}

        edges = data.get("data", {}).get("newSearch", {}).get("teachers", {}).get("edges", [])
        faculty = [self._node_to_record(e["node"]) for e in edges if e.get("node")]
        # Try to find exact match
        match = next(
            (f for f in faculty if name.lower() in f["name"].lower()),
            faculty[0] if faculty else None,
        )
        return {
            "instructor": match,
            "faculty": faculty,
            "records_added": 1 if match else 0,
            "scraped_at": datetime.now().isoformat(),
        }

    def _scrape_all(self, school_id: str, count: int = 20) -> dict:
        """Paginate through all teachers for a school using cursor-based pagination."""
        all_faculty = []
        cursor = None
        page = 0
        max_pages = 50  # safety cap (~1000 instructors)

        while page < max_pages:
            time.sleep(self.request_delay)
            variables = {"schoolID": school_id, "count": count}
            if cursor:
                variables["cursor"] = cursor

            data = self._graphql(SCHOOL_TEACHERS_QUERY_PAGINATED, variables)
            if not data:
                break

            teachers_data = (
                data.get("data", {})
                .get("school", {})
                .get("teachers", {})
            )
            if not teachers_data:
                break

            edges = teachers_data.get("edges", [])
            if not edges:
                break

            batch = [self._node_to_record(e["node"]) for e in edges if e.get("node")]
            all_faculty.extend(batch)
            logger.info(f"RMP page {page+1}: {len(batch)} instructors (total={len(all_faculty)})")

            page_info = teachers_data.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            cursor = page_info.get("endCursor")
            if not cursor:
                break
            page += 1

        logger.info(f"RMP total: {len(all_faculty)} instructors for school_id={school_id}")
        return {
            "faculty": all_faculty,
            "records_added": len(all_faculty),
            "scraped_at": datetime.now().isoformat(),
        }

    def _node_to_record(self, node: dict) -> dict:
        first = node.get("firstName", "")
        last = node.get("lastName", "")
        name = f"{first} {last}".strip()
        return {
            "name": name,
            "rmp_id": node.get("id"),
            "department": node.get("department"),
            "avg_rating": node.get("avgRating"),
            "avg_difficulty": node.get("avgDifficulty"),
            "num_ratings": node.get("numRatings"),
            "would_take_again_percent": node.get("wouldTakeAgainPercent"),
            "institution": self.institution_name,
            "scraped_date": datetime.now().strftime("%Y-%m-%d"),
        }


def main():
    parser = argparse.ArgumentParser(description="Scrape Rate My Professors data")
    parser.add_argument("--domain", type=str, default=None)
    parser.add_argument("--institution-name", type=str, default=None)
    parser.add_argument("--name", type=str, default=None, help="Single instructor name to look up")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    institution_name = args.institution_name
    if not institution_name and args.domain:
        # Derive a human-readable name from domain as best effort
        institution_name = args.domain.replace(".edu", "").replace(".", " ").title()

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    scraper = RMPScraper(
        institution_name=institution_name,
        target_name=args.name,
        request_delay=args.delay,
    )
    results = scraper.scrape()

    sys.stdout.close()
    sys.stdout = old_stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
