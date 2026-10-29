#!/usr/bin/env python3
"""Шаг 2. Полный обход каталога рубрик 2GIS по городу.

Каталог лежит в состоянии страницы: initialState.data.rubricator, где
items - словарь id -> узел, а lists - связи раздел -> его содержимое.
Верхний уровень - 21 metarubric. Спускаемся по разделам, пока появляются новые.

На выходе:
  data/recon/rubricator_<region>.json - все узлы и связи
  out/rubric_catalog.csv               - плоский список: id, название, тип, путь
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.browser import BrowserOptions, BrowserSession  # noqa: E402
from venues2gis.logging_setup import logger, setup_logging  # noqa: E402

OUT = ROOT / "data" / "recon"
REGION, HOST = "almaty", "2gis.kz"

GRAB_JS = "() => (((window.initialState || {}).data || {}).rubricator || {})"


def urls_for(node_id: str) -> list[str]:
    """Возможные адреса раздела - какой сработает, тем и пойдём."""
    base = "https://" + HOST + "/" + REGION
    return [
        base + "/rubrics/subrubrics/" + node_id,
        base + "/rubrics/" + node_id,
    ]


def main() -> None:
    setup_logging(ROOT / "logs", name="rubcrawl")
    OUT.mkdir(parents=True, exist_ok=True)

    items: dict[str, dict] = {}      # id -> узел
    lists: dict[str, object] = {}    # связи, как их отдаёт сайт
    parents: dict[str, str] = {}     # id потомка -> id родителя
    visited: set[str] = set()

    opts = BrowserOptions(headless=False, profile_dir=ROOT / ".chrome-profile-recon",
                          block_resources=True, window_size="1400,1000")
    with BrowserSession(opts) as s:
        page = s.page

        def grab(parent_id: str = "") -> int:
            """Забирает рубрикатор из состояния, возвращает число новых узлов."""
            rub = page.evaluate(GRAB_JS) or {}
            before = len(items)
            for k, v in (rub.get("items") or {}).items():
                if k not in items:
                    items[k] = v
                    if parent_id:
                        parents[k] = parent_id
            for k, v in (rub.get("lists") or {}).items():
                lists.setdefault(k, v)
            return len(items) - before

        logger.info("--- корень каталога ---")
        page.goto("https://" + HOST + "/" + REGION + "/rubrics",
                  referer="https://www.google.com/", timeout=60_000)
        s.wait_network_idle(20)
        time.sleep(1.0)
        grab()
        roots = list(items)
        logger.info("Разделов верхнего уровня: %d", len(roots))
        logger.info("Структура lists: %s", json.dumps(
            {k: (v if not isinstance(v, (list, dict)) else type(v).__name__ + "/" + str(len(v)))
             for k, v in list(lists.items())[:10]}, ensure_ascii=False)[:400])

        # Обходим вширь: раздел -> его подрубрики -> и так пока появляются новые.
        queue = list(roots)
        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
            visited.add(node_id)
            node = items.get(node_id) or {}
            opened = False
            for url in urls_for(node_id):
                try:
                    page.goto(url, referer="https://www.google.com/",
                              wait_until="domcontentloaded", timeout=30_000)
                    s.wait_network_idle(12)
                    time.sleep(0.4)
                    if "/museum" in (page.url or ""):
                        logger.warning("антибот на %s", url)
                        time.sleep(20)
                        continue
                    opened = True
                    break
                except Exception as e:  # noqa: BLE001
                    logger.info("  не открылось (%s): %s", type(e).__name__, url[:90])
            if not opened:
                continue
            added = grab(node_id)
            # Новые узлы этого раздела - в очередь, если они сами разделы.
            if added:
                for k, v in items.items():
                    if k not in visited and k not in queue and parents.get(k) == node_id:
                        if str(v.get("type", "")) in ("metarubric", "rubric_group", "group"):
                            queue.append(k)
            logger.info("  %-28s %-14s новых узлов %3d | всего %4d | очередь %d",
                        str(node.get("name"))[:28], str(node.get("type"))[:14],
                        added, len(items), len(queue))

    # --- сохраняем ---------------------------------------------------------
    (OUT / ("rubricator_" + REGION + ".json")).write_text(
        json.dumps({"items": items, "lists": lists, "parents": parents},
                   ensure_ascii=False, indent=2), encoding="utf-8")

    by_type: dict[str, int] = {}
    for v in items.values():
        by_type[str(v.get("type"))] = by_type.get(str(v.get("type")), 0) + 1
    logger.info("Всего узлов: %d. По типам: %s", len(items),
                json.dumps(by_type, ensure_ascii=False))

    out_csv = ROOT / "out" / "rubric_catalog.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "type", "tag", "parent_id", "parent_name", "search_query"])
        for k, v in sorted(items.items(), key=lambda kv: str(kv[1].get("name", ""))):
            pid = parents.get(k, "")
            w.writerow([k, v.get("name"), v.get("type"), v.get("tag", ""), pid,
                        (items.get(pid) or {}).get("name", ""), v.get("search_query", "")])
    logger.info("Каталог: %s", out_csv)


if __name__ == "__main__":
    main()
