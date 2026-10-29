#!/usr/bin/env python3
"""Оценка объёма работы по региону без сбора данных.

Открывает выдачу по каждому запросу и читает заявленный 2GIS "total".
Даёт верхнюю границу: сколько страниц придётся пролистать и сколько
карточек максимум встретится (без учёта пересечений между запросами).

Использование:  python tools/estimate_region.py almaty
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
from venues2gis.queries import build_queries  # noqa: E402
from venues2gis.regions import load_regions  # noqa: E402

setup_logging(ROOT / "logs", logging.WARNING, name="estimate")

region_code = sys.argv[1] if len(sys.argv) > 1 else "almaty"
regions = {r.code: r for r in load_regions(ROOT / "data/regions.json")}
region = regions.get(region_code)
if region is None:
    print(f"Неизвестный регион: {region_code}. Доступны: {', '.join(sorted(regions))}")
    raise SystemExit(1)

queries = build_queries()
print(f"Регион: {region.name} ({region.code}), запросов: {len(queries)}\n")

# Секунды на страницу листания и на открытие новой карточки - замеры этого проекта.
SEC_PER_PAGE = 3.9
SEC_PER_CARD = 1.2

rows: list[tuple[str, int]] = []
with BrowserSession(BrowserOptions()) as s:
    page = s.page
    for i, query in enumerate(queries, 1):
        url = f"https://{region.host}/{region.code}/search/{urllib.parse.quote(query)}"
        try:
            page.goto(url, referer="https://www.google.com/", timeout=60_000)
            s.wait_network_idle(15)
            totals = page.evaluate(
                r"""() => (document.documentElement.innerHTML.match(/"total"\s*:\s*\d+/g) || [])
                         .map(s => parseInt(s.split(':').pop(), 10))"""
            )
            total = max(totals) if totals else 0
        except Exception as e:  # noqa: BLE001
            print(f"  {query}: ошибка ({type(e).__name__})")
            total = 0
        rows.append((query, total))
        print(f"{i:3}/{len(queries)}  {query:42} {total:>7}")

rows.sort(key=lambda r: -r[1])
grand = sum(t for _, t in rows)
pages = sum((t + 11) // 12 for _, t in rows)

print(f"\n{'-' * 60}")
print(f"Сумма total по всем запросам (с пересечениями): {grand}")
print(f"Страниц пролистать:                            {pages}")
print(f"Время листания:                                {pages * SEC_PER_PAGE / 3600:.1f} ч")
print("\nСамые объёмные запросы:")
for query, total in rows[:12]:
    print(f"  {query:42} {total:>7}")
print("\nВремя кликов зависит от доли уникальных заведений:")
for share in (0.2, 0.3, 0.4):
    uniq = int(grand * share)
    print(f"  если уникальных {share:.0%} ({uniq:>6} шт.) -> "
          f"{uniq * SEC_PER_CARD / 3600:.1f} ч кликов, "
          f"итого ~{(pages * SEC_PER_PAGE + uniq * SEC_PER_CARD) / 3600:.1f} ч")
