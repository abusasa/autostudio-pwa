#!/usr/bin/env python3
"""Докуда реально пускает пагинация на широком запросе.

Карточки не открываем - только переключаем страницы. Отвечает на вопрос,
можно ли выбрать всю рубрику целиком или выдача упирается в потолок.
"""
from __future__ import annotations

import logging
import re
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.browser import BrowserOptions, BrowserSession  # noqa: E402
from venues2gis.logging_setup import setup_logging  # noqa: E402

setup_logging(ROOT / "logs", logging.WARNING, name="depth")

query = sys.argv[1] if len(sys.argv) > 1 else "Кафе"
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 250
region = sys.argv[3] if len(sys.argv) > 3 else "almaty"
url = f"https://2gis.kz/{region}/search/{urllib.parse.quote(query)}"

CLICK_PAGE = """n => {
    const re = new RegExp('/page/' + n + '(?![0-9])');
    const els = Array.from(document.querySelectorAll('a[href*="/page/"]'))
                     .filter(a => re.test(a.getAttribute('href') || ''));
    const el = els.find(e => e.offsetWidth || e.offsetHeight) || els[0];
    if (!el) return false;
    el.scrollIntoView({block: 'center'});
    el.click();
    return true;
}"""

with BrowserSession(BrowserOptions()) as s:
    page = s.page
    page.goto(url, referer="https://www.google.com/", timeout=60_000)
    s.wait_network_idle(20)

    totals = re.findall(r'"total"\s*:\s*(\d+)', page.content())
    total = max((int(t) for t in totals), default=None)
    print(f"Запрос: {query!r}, регион: {region}, total по данным 2GIS: {total}")

    reached, cards = 1, 0
    started = time.monotonic()
    while reached < limit:
        target = reached + 1
        if not page.evaluate(CLICK_PAGE, target):
            print(f"Ссылки на страницу {target} в DOM нет - конец обхода.")
            break
        time.sleep(0.8)
        s.wait_network_idle(15)
        if "/museum" in page.url:
            print(f"Антибот на странице {target}.")
            break
        m = re.search(r"/page/(\d+)", page.url)
        current = int(m.group(1)) if m else 1
        if current != target:
            print(f"Отбросило на страницу {current} вместо {target} - предел пагинации.")
            break
        reached = target
        n = page.evaluate(
            """() => new Set(Array.from(document.querySelectorAll('a[href*="/firm/"]'))
                  .map(a => (a.getAttribute('href')||'').match(/\\/firm\\/(\\d+)/))
                  .filter(Boolean).map(m => m[1])).size"""
        )
        cards += n
        if reached % 20 == 0:
            print(f"  страница {reached}: карточек на ней {n}, накопительно {cards}, "
                  f"{time.monotonic() - started:.0f} c")

    print(f"\nМаксимальная страница: {reached}")
    print(f"Доступно карточек по пагинации: ~{reached * 12}")
    if total:
        print(f"Покрытие относительно total: {min(reached * 12, total) * 100 // total}%")
