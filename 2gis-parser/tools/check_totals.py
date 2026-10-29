#!/usr/bin/env python3
"""Сколько всего результатов обещает 2GIS по запросу и докуда пускает пагинация.

Нужно, чтобы понимать реальную полноту: сравниваем "total" из разметки выдачи
с числом страниц, доступных для обхода. Кликов по карточкам не делаем - быстро.
"""
from __future__ import annotations

import logging
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.browser import BrowserOptions, BrowserSession  # noqa: E402
from venues2gis.logging_setup import setup_logging  # noqa: E402

setup_logging(ROOT / "logs", logging.WARNING, name="totals")

QUERIES = sys.argv[1:] or ["тойхана", "Банкетные залы", "Кафе", "Рестораны", "Гостиницы"]
REGION = "almaty"

with BrowserSession(BrowserOptions()) as s:
    page = s.page
    print(f"{'запрос':28} {'total':>8} {'страниц в DOM':>14} {'12*макс.стр':>12}")
    for query in QUERIES:
        url = f"https://2gis.kz/{REGION}/search/{urllib.parse.quote(query)}"
        page.goto(url, referer="https://www.google.com/", timeout=60_000)
        s.wait_network_idle(20)
        html = page.content()

        totals = re.findall(r'"total"\s*:\s*(\d+)', html)
        total = max((int(t) for t in totals), default=None)

        pages = page.evaluate(
            """() => Array.from(document.querySelectorAll('a[href*="/page/"]'))
                    .map(a => { const m = (a.getAttribute('href')||'').match(/\\/page\\/(\\d+)/);
                                return m ? +m[1] : 0; })"""
        )
        max_page = max(pages) if pages else 1
        print(f"{query:28} {str(total):>8} {max_page:>14} {max_page * 12:>12}")
