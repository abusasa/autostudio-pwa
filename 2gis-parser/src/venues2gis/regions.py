"""Регионы 2GIS по Казахстану.

Регион в 2GIS - это проект (город + пригороды), а не населённый пункт.
Живой список берём перехватом region/list на data.2gis.com; результат кэшируем,
чтобы не дёргать браузер на каждом запуске.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from playwright.sync_api import Error as PWError
from playwright.sync_api import TimeoutError as PWTimeout

from .browser import BrowserSession
from .logging_setup import logger

REGION_LIST_PATTERN = re.compile(r"https://catalog\.api\.2gis\.[^/]+/.*/region/list", re.I)

# Снимок от 2026-08-21 (проверен запуском probe). Используется, если браузер
# недоступен или data.2gis.com не ответил.
FALLBACK_KZ_REGIONS: list[dict[str, str]] = [
    {"code": "almaty", "id": "67", "name": "Алматы", "domain": "kz"},
    {"code": "nur_sultan", "id": "68", "name": "Астана", "domain": "kz"},
    {"code": "shymkent", "id": "161", "name": "Шымкент", "domain": "kz"},
    {"code": "karaganda", "id": "84", "name": "Караганда", "domain": "kz"},
    {"code": "aktobe", "id": "167", "name": "Актобе", "domain": "kz"},
    {"code": "taraz", "id": "221", "name": "Тараз", "domain": "kz"},
    {"code": "pavlodar", "id": "111", "name": "Павлодар", "domain": "kz"},
    {"code": "ustkam", "id": "91", "name": "Усть-Каменогорск", "domain": "kz"},
    {"code": "semey", "id": "169", "name": "Семей", "domain": "kz"},
    {"code": "atyrau", "id": "168", "name": "Атырау", "domain": "kz"},
    {"code": "kostanay", "id": "203", "name": "Костанай", "domain": "kz"},
    {"code": "kyzylorda", "id": "240", "name": "Кызылорда", "domain": "ru"},
    {"code": "uralsk", "id": "162", "name": "Уральск", "domain": "kz"},
    {"code": "petropavlovsk", "id": "170", "name": "Петропавловск", "domain": "kz"},
    {"code": "aktau", "id": "196", "name": "Актау", "domain": "kz"},
    {"code": "turkestan", "id": "232", "name": "Туркестан", "domain": "kz"},
    {"code": "kokshetau", "id": "201", "name": "Кокшетау", "domain": "kz"},
    {"code": "zhezkazgan", "id": "242", "name": "Жезказган", "domain": "kz"},
    {"code": "ekibastuz", "id": "252", "name": "Экибастуз", "domain": "kz"},
]


@dataclass
class Region:
    code: str
    id: str
    name: str
    domain: str  # 'kz' или 'ru' - у Кызылорды домен 2gis.ru

    @property
    def host(self) -> str:
        return f"2gis.{self.domain}"

    @classmethod
    def from_api(cls, item: dict[str, Any]) -> "Region":
        return cls(
            code=item["code"],
            id=str(item.get("id", "")),
            name=(item.get("name") or "").strip("_"),
            domain=item.get("domain") or "kz",
        )


def fetch_regions(session: BrowserSession, timeout: int = 60_000) -> list[dict[str, Any]]:
    """Живой region/list через перехват запроса на data.2gis.com."""
    assert session.page is not None
    page = session.page
    try:
        with page.expect_response(
            lambda r: bool(REGION_LIST_PATTERN.match(r.url)), timeout=timeout
        ) as info:
            page.goto("https://data.2gis.com", timeout=timeout)
        return info.value.json().get("result", {}).get("items", [])
    except (PWTimeout, PWError) as e:
        logger.warning("region/list не получен (%s), используем кэш/фолбэк", type(e).__name__)
        return []


def load_regions(
    cache_path: Path,
    session: Optional[BrowserSession] = None,
    country: str = "kz",
    refresh: bool = False,
) -> list[Region]:
    """Регионы страны: живой запрос -> кэш -> вшитый фолбэк."""
    cache_path = Path(cache_path)

    if refresh and session is not None:
        items = fetch_regions(session)
        if items:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(
                json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            logger.info("Список регионов обновлён и закэширован: %s", cache_path)

    if cache_path.exists():
        try:
            items = json.loads(cache_path.read_text(encoding="utf-8"))
            regions = [
                Region.from_api(i) for i in items if i.get("country_code") == country
            ]
            if regions:
                logger.info("Регионов из кэша (%s): %d", country, len(regions))
                return regions
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Кэш регионов повреждён (%s), берём фолбэк", e)

    logger.info("Используется вшитый список регионов: %d", len(FALLBACK_KZ_REGIONS))
    return [Region(**r) for r in FALLBACK_KZ_REGIONS]
