#!/usr/bin/env python3
"""Сводка по собранной базе: группы заведений, заполненность, вместимость.

Читает out/venues.jsonl (результат run.py export) и пишет markdown-таблицы
в out/summary.md + машиночитаемый out/category_stats.csv.

Запуск:  python tools/summary.py [--jsonl out/venues.jsonl] [--city Алматы]
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent.parent

# Укрупнённые группы поверх рубрик 2GIS. Порядок важен: заведение попадает
# в первую подошедшую группу, поэтому специфичное стоит выше общего.
GROUPS: list[tuple[str, set[str]]] = [
    ("Банкетные залы и тойханы", {"10803"}),
    ("Аренда площадок и лофтов", {"111506", "110748", "571", "110308", "112792", "110305"}),
    ("Конференц- и концертные залы", {"17379", "51001"}),
    ("Дома культуры, театры, кино", {"13787", "199", "192", "13786", "14967"}),
    ("Организация праздников и кейтеринг", {"630", "22215", "9786"}),
    ("Рестораны", {"164", "165"}),
    ("Кафе, столовые, чайханы", {"161", "166", "162", "72370", "112430", "1203"}),
    ("Гостиницы и базы отдыха", {"269", "547", "214", "23469", "111005", "52681", "112877", "9965"}),
    ("Развлечения (клубы, караоке, боулинг)", {"173", "21387", "170", "16743"}),
    ("Бизнес-центры", {"13796"}),
    ("Парки и открытые площадки", {"168"}),
]


def group_of(rubric_ids: str) -> str:
    ids = {p.strip() for p in (rubric_ids or "").split(";") if p.strip()}
    for name, members in GROUPS:
        if ids & members:
            return name
    return "Прочее"


def pct(part: int, whole: int) -> str:
    return f"{part * 100 // whole}%" if whole else "—"


def load(path: Path, city: str | None) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if city and (r.get("city") or "") != city:
                continue
            rows.append(r)
    return rows


def block(rows: list[dict], title: str, key) -> tuple[list[str], list[dict]]:
    """Таблица «группа -> объём, телефоны, вместимость»."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        buckets[key(r)].append(r)

    lines = [f"## {title}", "",
             "| категория | всего | площадок | с телефоном | с вместимостью | медиана мест |",
             "|---|---:|---:|---:|---:|---:|"]
    stats = []
    for name, items in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        venues = [r for r in items if r.get("is_event_venue")]
        phones = [r for r in items if r.get("phone")]
        caps = [r.get("capacity") for r in items if isinstance(r.get("capacity"), (int, float))]
        lines.append(
            f"| {name} | {len(items)} | {len(venues)} | {len(phones)} ({pct(len(phones), len(items))}) "
            f"| {len(caps)} ({pct(len(caps), len(items))}) | {int(median(caps)) if caps else '—'} |"
        )
        stats.append({"category": name, "total": len(items), "event_venues": len(venues),
                      "with_phone": len(phones), "with_capacity": len(caps),
                      "median_capacity": int(median(caps)) if caps else ""})
    lines.append("")
    return lines, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", default="out/venues.jsonl")
    ap.add_argument("--city", default=None, help="Оставить только один город")
    ap.add_argument("--top-rubrics", type=int, default=25)
    args = ap.parse_args()

    rows = load(ROOT / args.jsonl, args.city)
    if not rows:
        print("Нет данных — сначала запустите run.py export")
        return 1

    venues = [r for r in rows if r.get("is_event_venue")]
    caps = [r.get("capacity") for r in venues if isinstance(r.get("capacity"), (int, float))]

    out = [f"# Сводка по базе{f' — {args.city}' if args.city else ''}", "",
           f"- всего организаций: **{len(rows)}**",
           f"- из них площадки для мероприятий (event_score >= 3): **{len(venues)}**",
           f"- с телефоном: {sum(1 for r in rows if r.get('phone'))} ({pct(sum(1 for r in rows if r.get('phone')), len(rows))})",
           f"- с вместимостью среди площадок: {len(caps)} ({pct(len(caps), len(venues))})", ""]

    grp, stats = block(rows, "По укрупнённым группам", lambda r: group_of(r.get("rubric_ids", "")))
    out += grp

    ev, _ = block(venues, "Только площадки — по группам",
                  lambda r: group_of(r.get("rubric_ids", "")))
    out += ev

    # Распределение по баллу пригодности
    score = Counter(r.get("event_score") or 0 for r in rows)
    out += ["## Балл пригодности (event_score)", "", "| балл | заведений |", "|---:|---:|"]
    out += [f"| {s} | {n} |" for s, n in sorted(score.items(), reverse=True)]
    out.append("")

    # Топ конкретных рубрик 2GIS
    rub = Counter()
    for r in rows:
        ids = (r.get("rubric_ids") or "").split(";")
        names = (r.get("category") or "").split(";")
        for rid, nm in zip(ids, names):
            if rid.strip() and nm.strip():
                rub[nm.strip()] += 1
    out += [f"## Топ-{args.top_rubrics} рубрик 2GIS", "", "| рубрика | заведений |", "|---|---:|"]
    out += [f"| {n} | {c} |" for n, c in rub.most_common(args.top_rubrics)]
    out.append("")

    # Районы
    districts = Counter(r.get("district") or "—" for r in venues)
    out += ["## Площадки по районам", "", "| район | площадок |", "|---|---:|"]
    out += [f"| {d} | {c} |" for d, c in districts.most_common()]

    text = "\n".join(out) + "\n"
    (ROOT / "out" / "summary.md").write_text(text, encoding="utf-8")
    with (ROOT / "out" / "category_stats.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(stats[0].keys()))
        w.writeheader()
        w.writerows(stats)
    print(text)
    print("Записано: out/summary.md, out/category_stats.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
