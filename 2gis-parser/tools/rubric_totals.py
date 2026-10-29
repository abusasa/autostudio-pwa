#!/usr/bin/env python3
"""Шаг 2. Объём каждой рубрики: сколько организаций 2GIS обещает по ней в городе.

Открываем /<region>/rubric/<id> и читаем счётчик. Это даёт точную смету
прогона по рубрикам и основание для отбора: что брать, а что не трогать.

Аргументы:
  --limit N      сколько рубрик проверить (по умолчанию все кандидаты)
  --region CODE  город (по умолчанию almaty)
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.browser import BrowserOptions, BrowserSession  # noqa: E402
from venues2gis.logging_setup import logger, setup_logging  # noqa: E402

OUT = ROOT / "data" / "recon"
HOST = "2gis.kz"

# Разделы, которые берём целиком: там площадки лежат гуще всего.
FULL_SECTIONS = {"110539": "Поесть", "110545": "Развлечения",
                 "110574": "Туризм", "112890": "Недвижимость"}

# Плюс всё, что похоже на площадку по названию, из любого раздела.
KW = (r"зал|банкет|той|мероприят|праздн|свадьб|торжеств|аренд|лофт|коворк|конференц|"
      r"концерт|отдых|база|кемпинг|глэмпинг|усадьб|коттедж|гостиниц|отель|хостел|"
      r"санатор|пансионат|дом культуры|клуб|ресторан|кафе|столов|чайхан|антикафе|"
      r"кейтеринг|шатр|беседк|юрт|парк|комплекс|центр|студи|театр|цирк|музе|боулинг|"
      r"караоке|бильярд|дворец|выстав|форум|конгресс|спорт|фитнес")

# Счётчик результатов ищем и в состоянии страницы, и в разметке - что найдётся.
TOTAL_JS = r"""
() => {
  const out = {state: null, html: null};
  try {
    const d = ((window.initialState || {}).data) || {};
    const stack = [d];
    let best = null, depth = 0;
    while (stack.length && depth < 4000) {
      depth++;
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (typeof n.total === 'number' && (best === null || n.total > best)) best = n.total;
      for (const k in n) { try { stack.push(n[k]); } catch (e) {} }
    }
    out.state = best;
  } catch (e) {}
  try {
    const m = document.documentElement.innerHTML.match(/"total"\s*:\s*(\d+)/g) || [];
    const nums = m.map(s => parseInt(s.split(':').pop(), 10));
    out.html = nums.length ? Math.max.apply(null, nums) : null;
  } catch (e) {}
  return out;
}
"""


def load_catalog(region: str):
    path = OUT / ("rubricator_" + region + ".json")
    d = json.loads(path.read_text(encoding="utf-8"))
    items, parents = d["items"], d["parents"]

    def root_of(k):
        seen = set()
        while k in parents and k not in seen:
            seen.add(k)
            k = parents[k]
        return k

    picked = {}
    for k, v in items.items():
        if v.get("type") != "rubric":
            continue
        root = root_of(k)
        if root in FULL_SECTIONS or re.search(KW, str(v.get("name", "")), re.I):
            picked[k] = {"name": v.get("name"), "раздел": (items.get(root) or {}).get("name", "?")}
    return picked


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="almaty")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    setup_logging(ROOT / "logs", name="rubtotals")
    picked = load_catalog(args.region)
    ids = list(picked)
    if args.limit:
        ids = ids[:args.limit]
    logger.info("Рубрик к замеру: %d", len(ids))

    rows = []
    opts = BrowserOptions(headless=False, profile_dir=ROOT / ".chrome-profile-recon",
                          block_resources=True, window_size="1400,1000")
    with BrowserSession(opts) as s:
        page = s.page
        for i, rid in enumerate(ids, 1):
            info = picked[rid]
            t0 = time.monotonic()
            total, err = None, None
            try:
                page.goto("https://" + HOST + "/" + args.region + "/rubric/" + rid,
                          referer="https://www.google.com/",
                          wait_until="domcontentloaded", timeout=30_000)
                for _ in range(30):
                    res = page.evaluate(TOTAL_JS) or {}
                    total = res.get("state") or res.get("html")
                    if total:
                        break
                    time.sleep(0.15)
            except Exception as e:  # noqa: BLE001
                err = type(e).__name__
            rows.append({
                "rubric_id": rid, "name": info["name"], "раздел": info["раздел"],
                "total": total, "сек": round(time.monotonic() - t0, 2),
                "антибот": s.is_antibot_page(), "ошибка": err,
            })
            if i % 10 == 0 or i == len(ids):
                logger.info("%3d/%d  %-34s раздел=%-14s total=%s",
                            i, len(ids), str(info["name"])[:34], info["раздел"][:14], total)
            if s.is_antibot_page():
                logger.warning("антибот - пауза 30 c")
                time.sleep(30)

    rows.sort(key=lambda r: -(r["total"] or 0))
    out_csv = ROOT / "out" / ("rubric_totals_" + args.region + ".csv")
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["rubric_id", "name", "раздел", "total", "сек",
                                          "антибот", "ошибка"])
        w.writeheader()
        w.writerows(rows)

    got = [r for r in rows if r["total"]]
    total_sum = sum(r["total"] for r in got)
    by_section = defaultdict(int)
    for r in got:
        by_section[r["раздел"]] += r["total"]
    logger.info("Замерено: %d из %d, суммарно организаций: %d, страниц: %d",
                len(got), len(rows), total_sum, (total_sum + 11) // 12)
    for sec, n in sorted(by_section.items(), key=lambda kv: -kv[1]):
        logger.info("   %-16s %7d", sec, n)
    logger.info("Файл: %s", out_csv)


if __name__ == "__main__":
    main()
