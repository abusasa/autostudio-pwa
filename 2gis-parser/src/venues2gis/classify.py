"""Оценка пригодности заведения для проведения мероприятий.

2GIS не помечает "площадки для мероприятий" отдельным флагом, поэтому считаем
прозрачный балл по рубрикам, атрибутам и названию. Ничего не выбрасываем -
в выгрузку попадает всё собранное, а event_score позволяет отфильтровать.
"""
from __future__ import annotations

import re
from typing import Any

# Рубрики, которые почти всегда означают площадку под мероприятие.
CORE_RUBRICS: dict[str, int] = {
    "10803": 4,   # Банкетные залы
    "111506": 4,  # Аренда площадок для культурно-массовых мероприятий
    "110748": 4,  # Аренда лофтов
    "17379": 3,   # Конференц-залы / Переговорные комнаты
    "51001": 3,   # Концертные залы
    "21387": 3,   # Караоке-залы
    "630": 3,     # Организация и проведение праздников
    "22215": 3,   # Услуги по организации праздников / досуга
    "13787": 3,   # Дома / дворцы культуры
    "112792": 3,  # Аренда детских пространств для праздников
    "110308": 3,  # Аренда шатров / сценических конструкций
}

# Рубрики, где мероприятия проводят часто, но не всегда.
LIKELY_RUBRICS: dict[str, int] = {
    "164": 2,     # Рестораны
    "269": 2,     # Гостиницы
    "547": 2,     # Базы отдыха
    "214": 2,     # Санатории / Профилактории
    "23469": 2,   # Аренда коттеджей
    "111005": 2,  # Аренда коттеджей / гостевых домов
    "110305": 2,  # Аренда беседок
    "571": 2,     # Аренда помещений
    "13786": 2,   # Центры творчества и досуга
    "14967": 2,   # Культурно-досуговые центры
    "112430": 2,  # Чайхана
    "9786": 2,    # Кейтеринг
    "170": 2,     # Боулинг
    "173": 2,     # Ночные клубы
    "199": 2,     # Театры
    "9965": 2,    # Яхт-клубы
    "112877": 2,  # Лыжные базы
    "13796": 1,   # Бизнес-центры
    "161": 1,     # Кафе
    "166": 1,     # Столовые
    "72370": 1,   # Антикафе
    "192": 1,     # Кинотеатры
    "168": 1,     # Парки культуры и отдыха
    "52681": 1,   # Хостелы
    "16743": 1,   # Детские игровые залы
}

NAME_MARKERS = re.compile(
    r"(той\s*хана|тойхан|той\s*үй|банкет|торжеств|свадеб|wedding|banquet|event|"
    r"конференц|concert|концерт|лофт|loft|мерек|сарай|дворец|зал\b|hall|"
    r"ресторан|restaurant|комплекс|усадьб|resort|глэмпинг)",
    re.I,
)

# Теги атрибутов, прямо указывающие на банкетную функцию.
ATTR_MARKERS = re.compile(
    r"(banquet|banquetroom|conference|celebration|wedding|event|capacity|"
    r"food_funeral_feast|karaoke)",
    re.I,
)


def score_item(item: dict[str, Any], capacity_source: str | None = None) -> tuple[int, list[str]]:
    """Балл пригодности + список сработавших признаков (для прозрачности)."""
    score = 0
    reasons: list[str] = []

    rubric_ids = {str(r.get("id")) for r in item.get("rubrics") or []}
    for rid in rubric_ids:
        if rid in CORE_RUBRICS:
            score += CORE_RUBRICS[rid]
            reasons.append(f"rubric:{rid}")
        elif rid in LIKELY_RUBRICS:
            score += LIKELY_RUBRICS[rid]
            reasons.append(f"rubric:{rid}")

    attr_tags = [
        (attr.get("tag") or "")
        for group in item.get("attribute_groups") or []
        for attr in group.get("attributes") or []
    ]
    if any(ATTR_MARKERS.search(t) for t in attr_tags):
        score += 2
        reasons.append("attrs")

    if capacity_source == "attributes":
        score += 3
        reasons.append("capacity")

    name_ex = item.get("name_ex") or {}
    name_blob = " ".join(
        filter(None, [item.get("name"), name_ex.get("extension"), name_ex.get("primary")])
    )
    if NAME_MARKERS.search(name_blob):
        score += 1
        reasons.append("name")

    return score, reasons


def is_event_venue(score: int) -> bool:
    """Порог 3 балла: одной слабой рубрики недостаточно, нужен ещё признак."""
    return score >= 3
