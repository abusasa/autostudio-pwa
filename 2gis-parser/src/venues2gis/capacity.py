"""Извлечение вместимости.

Проверено на этапе 0: в ответе items/byid вместимость лежит структурированно -
attribute_groups[].attributes[] с тегом, оканчивающимся на _capacity
(например banquet_rooms_banquetroom_capacity), значение вида "До 350 человек".

Если структурированного атрибута нет, ищем в свободном тексте карточки.
Если не нашли - оставляем None. Ничего не оцениваем и не додумываем.
"""
from __future__ import annotations

import re
from typing import Any, Optional

CAPACITY_TAG = re.compile(r"capacity", re.I)

# "До 350 человек", "до 250 мест", "на 120 гостей", "от 50 до 200 человек"
_RANGE = re.compile(
    r"от\s*(?P<lo>\d{1,5})\s*(?:до|-|–)\s*(?P<hi>\d{1,5})\s*(?:чел|мест|гост|адам|орын)",
    re.I,
)
_UPTO = re.compile(
    r"(?:до|на|вместимость(?:ю)?|вмещает|рассчитан[а-я]*\s*на)\s*(?P<n>\d{1,5})\s*"
    r"(?:чел|мест|гост|посадочн|адам|орын|persons?|people|pax)",
    re.I,
)
_TAIL = re.compile(
    r"(?P<n>\d{1,5})\s*(?:чел(?:овек)?|мест|гост(?:ей|я)|посадочных мест|адам|орын|pax)",
    re.I,
)


def parse_capacity_text(text: str) -> Optional[int]:
    """Достаёт число вместимости из строки. None, если числа нет."""
    if not text:
        return None
    m = _RANGE.search(text)
    if m:
        return int(m.group("hi"))
    m = _UPTO.search(text)
    if m:
        return int(m.group("n"))
    m = _TAIL.search(text)
    if m:
        value = int(m.group("n"))
        # Отсекаем явный мусор вроде года или номера дома.
        return value if 1 <= value <= 20000 else None
    return None


def capacity_attributes(item: dict[str, Any]) -> list[str]:
    """Все структурированные атрибуты вместимости карточки."""
    found: list[str] = []
    for group in item.get("attribute_groups") or []:
        for attr in group.get("attributes") or []:
            tag = attr.get("tag") or ""
            if CAPACITY_TAG.search(tag):
                name = (attr.get("name") or "").strip()
                if name:
                    found.append(name)
    return found


def extract_capacity(item: dict[str, Any]) -> tuple[Optional[int], Optional[str], Optional[str]]:
    """Возвращает (вместимость, исходная строка, источник).

    Источник: 'attributes' - структурированное поле 2GIS (надёжно),
              'text'       - вытащено из описания/названия (проверять вручную),
              None         - данных нет, поле остаётся пустым.
    """
    attrs = capacity_attributes(item)
    if attrs:
        values = [v for v in (parse_capacity_text(a) for a in attrs) if v]
        raw = "; ".join(attrs)
        return (max(values) if values else None), raw, "attributes"

    for text in _free_text_sources(item):
        value = parse_capacity_text(text)
        if value:
            return value, text.strip()[:300], "text"

    return None, None, None


def _free_text_sources(item: dict[str, Any]):
    name_ex = item.get("name_ex") or {}
    yield item.get("description") or ""
    yield name_ex.get("extension") or ""
    yield item.get("name") or ""
    for group in item.get("attribute_groups") or []:
        for attr in group.get("attributes") or []:
            yield attr.get("name") or ""
