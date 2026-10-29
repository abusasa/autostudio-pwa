#!/usr/bin/env python3
"""Офлайн-проверка нормализации на сырых данных этапа 0 (браузер не нужен)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.dedupe import dedupe  # noqa: E402
from venues2gis.normalize import normalize_item  # noqa: E402

src = ROOT / "data/probe"
files = sorted(src.glob("cards__*.json"))
if not files:
    print("Нет данных этапа 0 в", src)
    raise SystemExit(1)

records = []
for path in files:
    docs = json.loads(path.read_text(encoding="utf-8"))
    for doc in docs:
        for item in doc.get("result", {}).get("items", []):
            records.append(normalize_item(item, "almaty", "тойхана", "2026-08-21T00:00:00Z"))

print(f"Записей: {len(records)}\n")
for r in records:
    print(f"{r['name']} | {r['city']} | тел: {r['phone']}")
    print(f"    вместимость: {r['capacity']} ({r['capacity_source']}) <- {r['capacity_raw']}")
    print(f"    часы: {r['working_hours']}")
    print(f"    адрес: {r['address']} | {r['latitude']},{r['longitude']}")
    print(f"    рубрики: {r['category']}")
    print(f"    score={r['event_score']} event={r['is_event_venue']} ({r['event_reasons']})")
    print(f"    соцсети: {r['social_links']}")
    print(f"    url: {r['2gis_url']}")
    print()

# Дедупликация: скармливаем те же записи дважды - должно остаться исходное число.
doubled, stats = dedupe(records + records)
print(f"Дедуп: {len(records)} x2 -> {len(doubled)} (ожидается {len(records)}), ключи: {stats}")

filled = lambda f: sum(1 for r in records if r.get(f) not in (None, ""))
for field in ("city", "name", "phone", "capacity", "working_hours", "latitude"):
    print(f"  {field:15} заполнено {filled(field)}/{len(records)}")
