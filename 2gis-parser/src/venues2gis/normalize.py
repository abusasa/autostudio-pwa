"""Нормализация сырого ответа items/byid в плоскую запись.

Структура полей проверена на реальных ответах 2GIS (этап 0), а не предположена.
Ничего не додумываем: чего нет в ответе - остаётся None.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from .capacity import extract_capacity
from .classify import is_event_venue, score_item

DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAY_RU = {
    "Mon": "Пн", "Tue": "Вт", "Wed": "Ср", "Thu": "Чт",
    "Fri": "Пт", "Sat": "Сб", "Sun": "Вс",
}

SOCIAL_TYPES = (
    "instagram", "facebook", "vkontakte", "telegram", "whatsapp",
    "youtube", "twitter", "odnoklassniki", "tiktok", "viber", "linkedin",
)

CSV_COLUMNS = [
    "id", "firm_id", "branch_id", "name", "name_full", "category", "rubric_ids",
    "city", "district", "region", "address", "address_comment", "postcode",
    "phone", "email", "website", "social_links",
    "capacity", "capacity_raw", "capacity_source",
    "working_hours", "working_hours_json",
    "latitude", "longitude", "rating", "reviews_count",
    "2gis_url", "is_event_venue", "event_score", "event_reasons",
    "source_city", "source_query", "source_queries_all", "collected_at",
]


def _adm(item: dict[str, Any], kind: str) -> Optional[str]:
    for div in item.get("adm_div") or []:
        if div.get("type") == kind:
            return (div.get("name") or "").replace(" ", " ").strip() or None
    return None


def _place_name(item: dict[str, Any]) -> Optional[str]:
    """Населённый пункт: город, а для пригородов - село/посёлок.

    В пригородных карточках adm_div типа 'city' нет вообще (проверено на реальных
    данных), поэтому спускаемся до settlement, иначе город остался бы кодом региона.
    """
    for kind in ("city", "settlement"):
        name = _adm(item, kind)
        if name:
            return name
    return item.get("city_alias")


def format_schedule(schedule: Optional[dict[str, Any]]) -> Optional[str]:
    """Человекочитаемые часы работы: 'Пн 11:00-24:00; Вт-Вс 11:00-22:00'."""
    if not schedule:
        return None
    if schedule.get("is_24x7") is True:
        return "круглосуточно"

    per_day: dict[str, str] = {}
    for day in DAY_ORDER:
        entry = schedule.get(day)
        if not isinstance(entry, dict):
            continue
        hours = entry.get("working_hours") or []
        if not hours:
            continue
        per_day[day] = ", ".join(
            f"{h.get('from', '?')}-{h.get('to', '?')}" for h in hours
        )

    if not per_day:
        # Бывают нестандартные ключи (например Everyday) - отдаём как есть.
        other = {
            k: v for k, v in schedule.items()
            if isinstance(v, dict) and v.get("working_hours")
        }
        if not other:
            return None
        return "; ".join(
            f"{k} " + ", ".join(
                f"{h.get('from', '?')}-{h.get('to', '?')}" for h in v["working_hours"]
            )
            for k, v in other.items()
        )

    # Схлопываем подряд идущие дни с одинаковым расписанием.
    parts: list[str] = []
    days = [d for d in DAY_ORDER if d in per_day]
    start = prev = days[0]
    for day in days[1:] + [None]:
        if day is not None and per_day[day] == per_day[prev] and DAY_ORDER.index(day) == DAY_ORDER.index(prev) + 1:
            prev = day
            continue
        label = DAY_RU[start] if start == prev else f"{DAY_RU[start]}-{DAY_RU[prev]}"
        parts.append(f"{label} {per_day[start]}")
        if day is not None:
            start = prev = day
    return "; ".join(parts)


def collect_contacts(item: dict[str, Any]) -> dict[str, list[str]]:
    """Контакты по типам, без потери повторов между группами."""
    out: dict[str, list[str]] = {}
    for group in item.get("contact_groups") or []:
        for contact in group.get("contacts") or []:
            ctype = contact.get("type")
            if not ctype:
                continue
            value = contact.get("url") or contact.get("value") or contact.get("text")
            if not value:
                continue
            value = _clean_contact(ctype, value)
            bucket = out.setdefault(ctype, [])
            if value not in bucket:
                bucket.append(value)
    return out


def _clean_contact(ctype: str, value: str) -> str:
    """Убирает служебный хвост ?text=... из ссылок мессенджеров."""
    if ctype in ("whatsapp", "viber", "telegram") and "?" in value:
        return value.split("?", 1)[0]
    return value


def firm_url(item: dict[str, Any], host: str = "2gis.kz") -> str:
    branch_id = str(item.get("id") or "")
    firm_id = branch_id.split("_")[0]
    city = item.get("city_alias") or ""
    return f"https://{host}/{city}/firm/{firm_id}" if city else f"https://{host}/firm/{firm_id}"


def normalize_item(
    item: dict[str, Any],
    source_region: str = "",
    source_query: str = "",
    collected_at: str = "",
    host: str = "2gis.kz",
) -> dict[str, Any]:
    branch_id = str(item.get("id") or "")
    firm_id = branch_id.split("_")[0] if branch_id else ""
    contacts = collect_contacts(item)
    capacity, capacity_raw, capacity_source = extract_capacity(item)
    score, reasons = score_item(item, capacity_source)

    address_parts = [item.get("address_name"), item.get("address_comment")]
    point = item.get("point") or {}
    reviews = item.get("reviews") or {}
    name_ex = item.get("name_ex") or {}
    socials = {t: contacts[t] for t in SOCIAL_TYPES if t in contacts}

    return {
        "id": branch_id,
        "firm_id": firm_id,
        "branch_id": branch_id,
        "name": name_ex.get("primary") or item.get("name"),
        "name_full": item.get("name"),
        "category": "; ".join(
            r.get("name", "") for r in item.get("rubrics") or [] if r.get("name")
        ) or None,
        "rubric_ids": "; ".join(
            str(r.get("id")) for r in item.get("rubrics") or [] if r.get("id")
        ) or None,
        "city": _place_name(item),
        "district": _adm(item, "district"),
        "region": _adm(item, "region"),
        "address": ", ".join(p for p in address_parts if p) or None,
        "address_comment": item.get("address_comment"),
        "postcode": (item.get("address") or {}).get("postcode"),
        "phone": "; ".join(contacts.get("phone", [])) or None,
        "email": "; ".join(contacts.get("email", [])) or None,
        "website": "; ".join(contacts.get("website", [])) or None,
        "social_links": json.dumps(socials, ensure_ascii=False) if socials else None,
        "capacity": capacity,
        "capacity_raw": capacity_raw,
        "capacity_source": capacity_source,
        "working_hours": format_schedule(item.get("schedule")),
        "working_hours_json": (
            json.dumps(item["schedule"], ensure_ascii=False) if item.get("schedule") else None
        ),
        "latitude": point.get("lat"),
        "longitude": point.get("lon"),
        "rating": reviews.get("general_rating") or reviews.get("org_rating"),
        "reviews_count": reviews.get("general_review_count"),
        "2gis_url": firm_url(item, host),
        "is_event_venue": is_event_venue(score),
        "event_score": score,
        "event_reasons": "; ".join(reasons) or None,
        "source_city": source_region,
        "source_query": source_query,
        "source_queries_all": source_query,
        "collected_at": collected_at,
    }


# --- нормализация для дедупликации ---------------------------------------

_ORG_NOISE = re.compile(
    r"\b(тоо|ип|ооо|ао|зао|оао|чп|тов|llc|ltd|inc|kz)\b|[\"«»'`]",
    re.I,
)
_NON_WORD = re.compile(r"[^0-9a-zа-яё]+", re.I)


def norm_text(value: Optional[str]) -> str:
    if not value:
        return ""
    text = value.casefold().replace("ё", "е")
    text = _ORG_NOISE.sub(" ", text)
    return _NON_WORD.sub(" ", text).strip()


def norm_phone(value: Optional[str]) -> str:
    """Последние 10 цифр - устойчиво к записи через +7 / 8 / пробелы."""
    if not value:
        return ""
    digits = re.sub(r"\D", "", value)
    return digits[-10:] if len(digits) >= 10 else digits
