"""Сборка итоговой базы из сырых JSONL: нормализация -> дедупликация -> CSV/JSONL/XLSX.

Работает без браузера, поэтому выгрузку можно пересобирать сколько угодно раз,
меняя правила нормализации и не трогая уже собранные данные.
"""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .dedupe import dedupe, find_suspicious_pairs
from .logging_setup import logger
from .normalize import CSV_COLUMNS, normalize_item
from .store import Store


def build_records(store: Store) -> list[dict[str, Any]]:
    """Разворачивает сырые ответы в плоские записи."""
    queries_map = store.all_queries_map()
    records: list[dict[str, Any]] = []
    raw_lines = 0

    for entry in store.iter_raw():
        raw_lines += 1
        response = entry.get("response") or {}
        for item in response.get("result", {}).get("items", []) or []:
            record = normalize_item(
                item,
                source_region=entry.get("source_region", ""),
                source_query=entry.get("source_query", ""),
                collected_at=entry.get("collected_at", ""),
                host=entry.get("source_host") or "2gis.kz",
            )
            all_queries = queries_map.get(record["branch_id"])
            if all_queries:
                record["source_queries_all"] = "; ".join(all_queries)
            records.append(record)

    logger.info("Прочитано сырых ответов: %d, извлечено записей: %d", raw_lines, len(records))
    return records


def write_csv(records: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(record)
    logger.info("CSV: %s (%d строк)", path, len(records))


def write_jsonl(records: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    logger.info("JSONL: %s (%d строк)", path, len(records))


def write_xlsx(records: list[dict[str, Any]], path: Path) -> None:
    try:
        from openpyxl import Workbook
    except ImportError:
        logger.info("openpyxl не установлен - XLSX пропущен.")
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "venues"
    ws.append(CSV_COLUMNS)
    for record in records:
        ws.append([record.get(col) for col in CSV_COLUMNS])
    ws.freeze_panes = "A2"
    wb.save(path)
    logger.info("XLSX: %s", path)


def write_pairs_csv(pairs: list[dict[str, Any]], path: Path) -> None:
    if not pairs:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(pairs[0].keys()))
        writer.writeheader()
        writer.writerows(pairs)
    logger.info("Похожие записи на ручную проверку: %s (%d пар)", path, len(pairs))


def write_rubrics_csv(records: list[dict[str, Any]], path: Path) -> Counter:
    """Все встреченные рубрики - источник новых поисковых запросов для 2-й итерации."""
    counter: Counter = Counter()
    for record in records:
        ids = (record.get("rubric_ids") or "").split(";")
        names = (record.get("category") or "").split(";")
        for rid, name in zip(ids, names):
            rid, name = rid.strip(), name.strip()
            if rid and name:
                counter[(rid, name)] += 1
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["rubric_id", "rubric_name", "venues"])
        for (rid, name), count in counter.most_common():
            writer.writerow([rid, name, count])
    logger.info("Справочник встреченных рубрик: %s (%d шт.)", path, len(counter))
    return counter


def write_report(
    records: list[dict[str, Any]],
    stats: dict[str, int],
    store: Store,
    path: Path,
) -> None:
    total = len(records)
    events = [r for r in records if r.get("is_event_venue")]

    def filled(field: str, subset: Optional[list[dict[str, Any]]] = None) -> str:
        data = subset if subset is not None else records
        if not data:
            return "0 (0%)"
        n = sum(1 for r in data if r.get(field) not in (None, ""))
        return f"{n} ({n * 100 // len(data)}%)"

    by_city = Counter(r.get("city") or "?" for r in events)
    cap_sources = Counter(r.get("capacity_source") or "нет" for r in events)

    lines = [
        "# Отчёт по собранной базе",
        "",
        f"Сформирован: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        "",
        "## Объём",
        f"- всего заведений после дедупликации: **{total}**",
        f"- из них помечены как площадки для мероприятий: **{len(events)}**",
        f"- сработавшие ключи дедупликации: {stats}",
        f"- состояние очереди задач: {store.task_stats()}",
        "",
        "## Заполненность критичных полей (все заведения)",
        f"- city: {filled('city')}",
        f"- name: {filled('name')}",
        f"- phone: {filled('phone')}",
        f"- capacity: {filled('capacity')}",
        f"- working_hours: {filled('working_hours')}",
        f"- координаты: {filled('latitude')}",
        "",
        "## Заполненность по площадкам для мероприятий",
        f"- phone: {filled('phone', events)}",
        f"- capacity: {filled('capacity', events)}",
        f"- working_hours: {filled('working_hours', events)}",
        f"- website: {filled('website', events)}",
        f"- social_links: {filled('social_links', events)}",
        "",
        f"## Источник вместимости: {dict(cap_sources)}",
        "",
        "## Площадки по городам",
    ]
    lines += [f"- {city}: {count}" for city, count in by_city.most_common()]
    lines += _coverage_section(store)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info("Отчёт: %s", path)


def _coverage_section(store: Store) -> list[str]:
    """Полнота: 2GIS сам сообщает, сколько результатов у запроса - сверяем с собранным."""
    rows = store.coverage_rows()
    done = [r for r in rows if r[2]]
    if not done:
        return []

    promised = sum(r[2] for r in done)
    walked = sum(min(r[3], r[2]) for r in done)
    lines = [
        "",
        "## Полнота обхода",
        f"- 2GIS заявил результатов по выполненным запросам: **{promised}**",
        f"- из них просмотрено: **{walked}** ({walked * 100 // promised if promised else 0}%)",
        "",
        "Недобранные запросы (просмотрено меньше заявленного):",
        "",
        "| регион | запрос | заявлено | просмотрено | страниц | статус |",
        "|---|---|---:|---:|---:|---|",
    ]
    shown = 0
    for region, query, total, seen, pages, status in done:
        if seen >= total * 0.95:
            continue
        lines.append(f"| {region} | {query} | {total} | {seen} | {pages} | {status} |")
        shown += 1
        if shown >= 40:
            lines.append("| ... | (показаны 40 худших) | | | | |")
            break
    if shown == 0:
        lines.append("| — | все запросы выбраны полностью | | | | |")
    return lines


def run_export(
    db_path: Path,
    raw_dir: Path,
    out_dir: Path,
    events_only: bool = False,
    min_score: int = 0,
) -> dict[str, Any]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with Store(db_path, raw_dir) as store:
        records = build_records(store)
        if not records:
            logger.warning("Сырых данных нет - сначала запустите сбор (run.py collect).")
            return {"total": 0}

        records, stats = dedupe(records)
        records.sort(key=lambda r: (-(r.get("event_score") or 0), r.get("city") or "", r.get("name") or ""))

        selected = records
        if events_only:
            selected = [r for r in records if r.get("is_event_venue")]
        if min_score:
            selected = [r for r in selected if (r.get("event_score") or 0) >= min_score]

        write_csv(selected, out_dir / "venues.csv")
        write_jsonl(selected, out_dir / "venues.jsonl")
        write_xlsx(selected, out_dir / "venues.xlsx")
        if selected is not records:
            write_csv(records, out_dir / "venues_all.csv")
        write_rubrics_csv(records, out_dir / "discovered_rubrics.csv")
        write_pairs_csv(find_suspicious_pairs(records), out_dir / "possible_duplicates.csv")
        write_report(records, stats, store, out_dir / "report.md")

    return {"total": len(records), "exported": len(selected), "dedupe_stats": stats}
