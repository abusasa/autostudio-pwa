"""Фаза A: обход выдачи и складывание найденных firm_id в очередь.

Здесь мы ничего не открываем и никуда не кликаем внутрь карточек - только
листаем и записываем идентификаторы. Карточки берёт фаза B (cards.py), по
одному разу на заведение, сколько бы источников его ни нашло.

Источник задачи - либо рубрика каталога (rubric:10803), либо поисковое слово.
Рубрика даёт гарантированное покрытие по классификации самого 2GIS,
слово добирает "расширенные" результаты, которые в рубрику не попали.
"""
from __future__ import annotations

import random
import re
import time
import urllib.parse
from dataclasses import dataclass
from typing import Callable, Optional

from playwright.sync_api import Error as PWError
from playwright.sync_api import TimeoutError as PWTimeout

from .browser import BrowserSession
from .config import CollectConfig
from .logging_setup import logger
from .store import Store

FIRM_HREF = re.compile(r"/(?:firm|station|branches)/(?P<fid>\d+)", re.I)
RUBRIC_PREFIX = "rubric:"


class AntibotBlocked(Exception):
    """2GIS слишком часто отдаёт страницу-челлендж - продолжать нельзя."""


@dataclass
class DiscoverResult:
    status: str
    pages_done: int = 0
    ids_seen: int = 0
    ids_new: int = 0
    error: Optional[str] = None
    reported_total: Optional[int] = None


def source_url(host: str, region: str, source: str) -> str:
    """rubric:10803 -> /almaty/rubric/10803, слово -> /almaty/search/слово."""
    if source.startswith(RUBRIC_PREFIX):
        return f"https://{host}/{region}/rubric/{source[len(RUBRIC_PREFIX):]}"
    return f"https://{host}/{region}/search/{urllib.parse.quote(source)}"


class Discoverer:
    def __init__(self, session: BrowserSession, store: Store, cfg: CollectConfig,
                 should_stop: Optional[Callable[[], bool]] = None) -> None:
        self.s = session
        self.store = store
        self.cfg = cfg
        self.should_stop = should_stop or (lambda: False)
        self.antibot_hits = 0

    @property
    def page(self):
        assert self.s.page is not None
        return self.s.page

    def _sleep(self, bounds) -> None:
        lo, hi = bounds
        time.sleep(random.uniform(lo / 1000, hi / 1000))

    def _handle_antibot(self) -> None:
        self.antibot_hits += 1
        logger.warning("Антибот-страница (%d раз). Пауза %d c.",
                       self.antibot_hits, self.cfg.antibot_pause_s)
        if self.antibot_hits >= self.cfg.antibot_max_hits:
            raise AntibotBlocked(
                f"2GIS показал защитную страницу {self.antibot_hits} раз. "
                "Сбор остановлен. Уменьшите число воркеров или увеличьте задержки."
            )
        time.sleep(self.cfg.antibot_pause_s)

    def _goto(self, url: str) -> bool:
        try:
            self.page.goto(url, referer="https://www.google.com/",
                           timeout=self.cfg.nav_timeout_ms)
        except PWTimeout:
            logger.warning("Таймаут навигации: %s", url)
            return False
        except PWError as e:
            logger.warning("Ошибка навигации %s: %s", url, e)
            return False
        self.s.wait_network_idle(20)
        if self.s.is_antibot_page():
            self._handle_antibot()
            return False
        return True

    def firm_ids(self) -> list[str]:
        """firm_id со страницы выдачи, в порядке выдачи, без повторов."""
        try:
            raw = self.page.evaluate(
                """() => Array.from(document.querySelectorAll('a[href*="/firm/"]'))
                        .map(a => a.getAttribute('href'))"""
            )
        except PWError:
            return []
        out, seen = [], set()
        for href in raw or []:
            m = FIRM_HREF.search(href or "")
            if m and m.group("fid") not in seen:
                seen.add(m.group("fid"))
                out.append(m.group("fid"))
        return out

    def _read_total(self) -> Optional[int]:
        """Сколько результатов обещает 2GIS - мера полноты обхода."""
        try:
            values = self.page.evaluate(
                r"""() => (document.documentElement.innerHTML.match(/"total"\s*:\s*\d+/g) || [])
                         .map(s => parseInt(s.split(':').pop(), 10))"""
            )
        except PWError:
            return None
        return max(values) if values else None

    def _click_page(self, number: int) -> bool:
        """Пагинация только кликом: переход по /page/N через URL антибот сбрасывает.

        Селектор по подстроке не годится: '/page/1' совпал бы и с '/page/12'.
        """
        try:
            return bool(self.page.evaluate(
                """n => {
                     const re = new RegExp('/page/' + n + '(?![0-9])');
                     const els = Array.from(document.querySelectorAll('a[href*="/page/"]'))
                                      .filter(a => re.test(a.getAttribute('href') || ''));
                     const el = els.find(e => e.offsetWidth || e.offsetHeight) || els[0];
                     if (!el) return false;
                     el.scrollIntoView({block: 'center'});
                     el.click();
                     return true;
                   }""", number))
        except PWError:
            return False

    def _has_page_link(self, number: int) -> bool:
        try:
            return bool(self.page.evaluate(
                """n => {
                     const re = new RegExp('/page/' + n + '(?![0-9])');
                     return Array.from(document.querySelectorAll('a[href*="/page/"]'))
                                 .some(a => re.test(a.getAttribute('href') || ''));
                   }""", number))
        except PWError:
            return False

    def run_task(self, region: str, host: str, source: str) -> DiscoverResult:
        url = source_url(host, region, source)
        logger.info("[%s] %s -> %s", region, source, url)

        if not self._goto(url):
            return DiscoverResult("failed", error="не удалось открыть выдачу")

        reported_total = self._read_total()
        ids_seen = ids_new = 0
        pages_done = 0
        page_number = 1

        while page_number <= self.cfg.max_pages_per_task:
            if self.should_stop():
                return DiscoverResult("pending", pages_done, ids_seen, ids_new,
                                      "остановлено", reported_total)

            ids = self.firm_ids()
            if not ids:
                logger.info("[%s/%s] страница %d: пусто - конец", region, source, page_number)
                break

            ids_seen += len(ids)
            ids_new += self.store.enqueue_firms(region, host, ids, source)
            pages_done = page_number

            next_page = page_number + 1
            if not self._has_page_link(next_page):
                logger.info("[%s/%s] страницы %d нет - выдача кончилась (просмотрено %d)",
                            region, source, next_page, ids_seen)
                break
            if not self._click_page(next_page):
                logger.warning("[%s/%s] не удалось перейти на страницу %d",
                               region, source, next_page)
                break

            self._sleep(self.cfg.page_delay_ms)
            self.s.wait_network_idle(20)
            if self.s.is_antibot_page():
                self._handle_antibot()
                return DiscoverResult("failed", pages_done, ids_seen, ids_new,
                                      "антибот", reported_total)

            current = re.search(r"/page/(\d+)", self.page.url)
            current_n = int(current.group(1)) if current else 1
            if current_n != next_page:
                logger.info("[%s/%s] после клика оказались на странице %d вместо %d - стоп",
                            region, source, current_n, next_page)
                break
            page_number = next_page

        status = "empty" if not ids_seen else "done"
        coverage = ""
        if reported_total:
            coverage = (f", покрытие {min(ids_seen, reported_total) * 100 // reported_total}% "
                        f"из {reported_total}")
        logger.info("[%s/%s] %s: страниц %d, найдено %d, новых заведений %d%s",
                    region, source, status, pages_done, ids_seen, ids_new, coverage)
        return DiscoverResult(status, pages_done, ids_seen, ids_new, None, reported_total)
