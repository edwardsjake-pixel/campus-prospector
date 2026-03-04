"""Headless browser utilities for scraping JavaScript-rendered pages.

Many university websites use React/Angular/Vue frameworks that render content
client-side. requests+BeautifulSoup only gets the empty HTML shell.
This module provides a Playwright-based fallback that executes JavaScript
and returns the fully-rendered page.

Usage:
    from browser_utils import fetch_rendered_page, BROWSER_SUPPORT

    if BROWSER_SUPPORT:
        html = fetch_rendered_page("https://example.edu/faculty")
        soup = BeautifulSoup(html, "html.parser")
"""

import logging
import sys

logger = logging.getLogger(__name__)

try:
    from playwright.sync_api import sync_playwright
    BROWSER_SUPPORT = True
except ImportError:
    BROWSER_SUPPORT = False
    logger.info("Playwright not installed — browser rendering disabled")


def fetch_rendered_page(
    url: str,
    wait_selector: str | None = None,
    wait_timeout: int = 15000,
    extra_wait_ms: int = 2000,
) -> str | None:
    """Fetch a URL using a headless browser and return the fully-rendered HTML.

    Args:
        url: The URL to fetch.
        wait_selector: Optional CSS selector to wait for before capturing HTML.
        wait_timeout: Max ms to wait for the selector (default 15s).
        extra_wait_ms: Extra ms to wait after page load for dynamic content.

    Returns:
        The rendered HTML string, or None on failure.
    """
    if not BROWSER_SUPPORT:
        logger.warning("Browser rendering requested but Playwright not installed")
        return None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process",
                ],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 720},
            )
            page = context.new_page()

            # Block heavy resources to speed things up
            page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot}", lambda route: route.abort())
            page.route("**/*google-analytics*", lambda route: route.abort())
            page.route("**/*googletagmanager*", lambda route: route.abort())

            page.goto(url, wait_until="networkidle", timeout=30000)

            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=wait_timeout)
                except Exception:
                    logger.debug(f"Selector '{wait_selector}' not found, continuing anyway")

            if extra_wait_ms > 0:
                page.wait_for_timeout(extra_wait_ms)

            html = page.content()

            context.close()
            browser.close()

            return html

    except Exception as e:
        logger.error(f"Browser fetch failed for {url}: {e}")
        return None


def is_js_rendered_page(soup) -> bool:
    """Heuristic: detect if a page is JS-rendered and has little real content.

    Returns True if the page looks like an empty JS shell that needs browser rendering.
    Must have BOTH low content AND JS framework indicators to trigger.
    """
    if soup is None:
        return False

    body = soup.find("body")
    body_text = body.get_text(" ", strip=True) if body else soup.get_text(" ", strip=True)

    # If the page has substantial text content, it's not a JS shell
    if len(body_text) > 500:
        return False

    scripts = soup.find_all("script")
    has_js_framework = False

    # Check for noscript tag suggesting JS is required
    noscript = soup.find("noscript")
    if noscript:
        noscript_text = noscript.get_text(" ", strip=True).lower()
        if "javascript" in noscript_text or "enable" in noscript_text:
            has_js_framework = True

    # Check for React/Angular/Vue/Next.js root elements with empty content
    for marker_id in ["root", "app", "__next", "__nuxt", "app-root"]:
        el = soup.find(id=marker_id)
        if el and len(el.get_text(" ", strip=True)) < 50:
            has_js_framework = True
            break

    # Check for data-reactroot or ng-app attributes
    if soup.find(attrs={"data-reactroot": True}) or soup.find(attrs={"ng-app": True}):
        has_js_framework = True

    # Many scripts with little content
    if len(scripts) > 5 and len(body_text) < 200:
        has_js_framework = True

    # Body has just 1-2 empty wrapper divs (SPA shell)
    if body and not has_js_framework:
        children = [c for c in body.children if hasattr(c, 'name') and c.name]
        if len(children) <= 2 and len(body_text) < 100 and len(scripts) > 0:
            has_js_framework = True

    return has_js_framework
