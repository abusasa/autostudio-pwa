"""Дедупликация и слияние записей.

Приоритет ключей:
  1. branch_id  - точный идентификатор филиала из API (разные филиалы сети
                  остаются отдельными записями, как и требуется);
  2. firm_id + округлённые координаты - на случай смены хеша филиала;
  3. нормализованное имя + адрес;
  4. нормализованное имя + телефон (ловит переезды).

Похожие по координатам и имени записи автоматически НЕ сливаются: в одном ТРЦ
легко стоят два разных зала. Такие пары уходят в отчёт на ручную проверку.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Iterable, Optional

from .logging_setup import logger
from .normalize import norm_phone, norm_text

MULTI_FIELDS = ("phone", "email", "website", "category", "rubric_ids", "source_queries_all")


def _merge_multi(a: Optional[str], b: Optional[str]) -> Optional[str]:
    """Объединяет значения через '; ' без дублей и без потери данных."""
    values: list[str] = []
    for source in (a, b):
        if not source:
            continue
        for part in str(source).split(";"):
            part = part.strip()
            if part and part not in values:
                values.append(part)
    return "; ".join(values) or None


def _merge_socials(a: Optional[str], b: Optional[str]) -> Optional[str]:
    if not a:
        return b
    if not b:
        return a
    try:
        da, db = json.loads(a), json.loads(b)
    except json.JSONDecodeError:
        return a
    for key, links in db.items():
        bucket = da.setdefault(key, [])
        for link in links:
            if link not in bucket:
                bucket.append(link)
    return json.dumps(da, ensure_ascii=False)


def merge_records(base: dict[str, Any], other: dict[str, Any]) -> dict[str, Any]:
    """Сливает две записи одного заведения. Данные объединяются, а не затираются."""
    result = dict(base)
    for field in MULTI_FIELDS:
        result[field] = _merge_multi(base.get(field), other.get(field))
    result["social_links"] = _merge_socials(base.get("social_links"), other.get("social_links"))

    # Структурированная вместимость важнее вытащенной из текста.
    if base.get("capacity_source") != "attributes" and other.get("capacity_source") == "attributes":
        for field in ("capacity", "capacity_raw", "capacity_source"):
            result[field] = other.get(field)
    elif base.get("capacity") is None and other.get("capacity") is not None:
        for field in ("capacity", "capacity_raw", "capacity_source"):
            result[field] = other.get(field)

    # Остальные поля - берём непустое.
    for field, value in other.items():
        if field in MULTI_FIELDS or field == "social_links":
            continue
        if result.get(field) in (None, "", False) and value not in (None, ""):
            result[field] = value

    result["event_score"] = max(base.get("event_score") or 0, other.get("event_score") or 0)
    result["is_event_venue"] = bool(base.get("is_event_venue") or other.get("is_event_venue"))
    return result


def _coord_key(record: dict[str, Any]) -> Optional[str]:
    lat, lon = record.get("latitude"), record.get("longitude")
    if lat is None or lon is None:
        return None
    return f"{float(lat):.5f},{float(lon):.5f}"


def dedupe(records: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Схлопывает дубли. Возвращает (записи, статистика по сработавшим ключам)."""
    by_branch: dict[str, dict[str, Any]] = {}
    stats: dict[str, int] = defaultdict(int)

    for record in records:
        branch_id = record.get("branch_id") or record.get("id")
        if not branch_id:
            stats["без_id"] += 1
            continue
        if branch_id in by_branch:
            by_branch[branch_id] = merge_records(by_branch[branch_id], record)
            stats["branch_id"] += 1
        else:
            by_branch[branch_id] = record

    # Вторичные ключи - на случай, если 2GIS сменил хеш филиала.
    secondary: dict[str, str] = {}
    result: dict[str, dict[str, Any]] = {}
    for branch_id, record in by_branch.items():
        keys: list[str] = []
        coord = _coord_key(record)
        if record.get("firm_id") and coord:
            keys.append(f"fc:{record['firm_id']}|{coord}")
        name = norm_text(record.get("name"))
        address = norm_text(record.get("address"))
        if name and address:
            keys.append(f"na:{name}|{address}")
        phone = norm_phone((record.get("phone") or "").split(";")[0])
        if name and phone:
            keys.append(f"np:{name}|{phone}")

        target = next((secondary[k] for k in keys if k in secondary), None)
        if target is not None:
            result[target] = merge_records(result[target], record)
            stats["вторичный_ключ"] += 1
        else:
            result[branch_id] = record
            target = branch_id
        for key in keys:
            secondary.setdefault(key, target)

    records_out = list(result.values())
    logger.info(
        "Дедупликация: на входе уникальных филиалов %d, на выходе %d (%s)",
        len(by_branch), len(records_out), dict(stats),
    )
    return records_out, dict(stats)


def find_suspicious_pairs(
    records: list[dict[str, Any]], max_pairs: int = 500
) -> list[dict[str, Any]]:
    """Похожие записи рядом (<~50 м) - кандидаты на ручную проверку, не сливаем."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        logger.info("rapidfuzz не установлен - отчёт о похожих записях пропущен.")
        return []

    buckets: dict[tuple[float, float], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        lat, lon = record.get("latitude"), record.get("longitude")
        if lat is None or lon is None:
            continue
        buckets[(round(float(lat), 3), round(float(lon), 3))].append(record)

    pairs: list[dict[str, Any]] = []
    for group in buckets.values():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                ratio = fuzz.token_set_ratio(norm_text(a.get("name")), norm_text(b.get("name")))
                if ratio >= 90:
                    pairs.append({
                        "similarity": ratio,
                        "id_a": a.get("branch_id"), "name_a": a.get("name"),
                        "address_a": a.get("address"), "url_a": a.get("2gis_url"),
                        "id_b": b.get("branch_id"), "name_b": b.get("name"),
                        "address_b": b.get("address"), "url_b": b.get("2gis_url"),
                    })
                    if len(pairs) >= max_pairs:
                        return pairs
    return pairs
