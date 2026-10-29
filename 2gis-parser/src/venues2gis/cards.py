"""Фаза B: забор карточек заведений прямым переходом на /firm/<id>.

Проверено разведкой (tools/recon_*.py):
  * страница карточки отдаётся server-side - XHR items/byid ждать не нужно,
    данные лежат в состоянии страницы уже к domcontentloaded;
  * телефон, вместимость и часы работы там есть (в разметке выдачи телефонов нет);
  * на 23 карточках подряд разбор сработал 23 раза, антибот не сработал ни разу;
  * средняя стоимость карточки - 1,9 с.

Что это даёт: карточка перестала зависеть от состояния выдачи. Не нужен ни клик
по DOM (где два списка с одинаковыми href и клик уходил в пустоту), ни возврат
на страницу, ни счётчик промахов. Задача стала атомарной - её можно раздать
любому воркеру.

Пакетный добор невозможен: хвост _<хэш> в id заведения - это токен доступа,
выданный сервером под конкретную сессию. Любая подмена id даёт 403.
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from playwright.sync_api import Error as PWError
from playwright.sync_api import TimeoutError as PWTimeout

from .browser import BrowserSession
from .config import CollectConfig
from .logging_setup import logger
from .store import Store, utcnow

# Ищем в состоянии страницы объект заведения: у него есть строковый id, имя
# и хотя бы одна из групп - контакты, атрибуты или расписание.
EXTRACT_JS = r"""
() => {
  const out = [];
  const seen = new Set();
  const roots = [window.__REACT_QUERY_STATE__, window.initialState, window.__INITIAL_STATE__];
  const walk = (node, depth) => {
    if (!node || depth > 9 || out.length > 20) return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (typeof node.id === 'string' && node.name &&
        (node.contact_groups || node.attribute_groups || node.schedule)) {
      out.push(node);
    }
    for (const k in node) { try { walk(node[k], depth + 1); } catch (e) {} }
  };
  roots.forEach(r => walk(r, 0));
  return out;
}
"""


class AntibotBlocked(Exception):
    """2GIS слишком часто отдаёт страницу-челлендж."""


@dataclass
class CardResult:
    done: int = 0
    failed: int = 0
    stopped: bool = False


def firm_url(host: str, region: str, firm_id: str) -> str:
    return f"https://{host}/{region}/firm/{firm_id}"


def pick_card(found: list[dict], firm_id: str) -> Optional[dict]:
    """Из найденных объектов берём тот, что относится к запрошенной фирме."""
    for item in found or []:
        if str(item.get("id", "")).split("_")[0] == firm_id:
            return item
    return None


class CardFetcher:
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

    def _sleep(self) -> None:
        lo, hi = self.cfg.click_delay_ms
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

    def fetch_one(self, region: str, host: str, firm_id: str) -> Optional[dict[str, Any]]:
        """Открывает карточку и возвращает объект заведения, либо None."""
        try:
            self.page.goto(firm_url(host, region, firm_id),
                           referer="https://www.google.com/",
                           wait_until="domcontentloaded",
                           timeout=self.cfg.nav_timeout_ms)
        except (PWTimeout, PWError) as e:
            logger.debug("навигация к %s не удалась: %s", firm_id, type(e).__name__)
            return None

        if self.s.is_antibot_page():
            self._handle_antibot()
            return None

        # Данные обычно готовы сразу; запас - на медленный ответ сервера.
        deadline = time.monotonic() + self.cfg.card_response_timeout_ms / 1000
        while time.monotonic() < deadline:
            try:
                item = pick_card(self.page.evaluate(EXTRACT_JS), firm_id)
            except PWError:
                item = None
            if item:
                return item
            time.sleep(0.15)
        return None

    def run_batch(self, rows) -> CardResult:
        """Обрабатывает пачку заведений из очереди."""
        res = CardResult()
        finished: list[tuple[str, str, Optional[str]]] = []
        for row in rows:
            if self.should_stop():
                res.stopped = True
                break
            firm_id, region, host = row["firm_id"], row["region"], row["domain"]
            item = self.fetch_one(region, host, firm_id)
            if item is None:
                finished.append((firm_id, "failed", "карточка не получена"))
                res.failed += 1
            else:
                self._save(item, region, host, row["found_by"] or "")
                finished.append((firm_id, "done", None))
                res.done += 1
            self._sleep()
        if finished:
            self.store.finish_firms(finished)
        return res

    def _save(self, item: dict[str, Any], region: str, host: str, found_by: str) -> None:
        """Пишет карточку в сырые данные и в реестр.

        Формат совместим с прежним (ответ items/byid), чтобы export и normalize
        работали без изменений.
        """
        branch_id = str(item.get("id") or "")
        firm_id = branch_id.split("_")[0]
        if branch_id:
            has_phone = any(
                c.get("type") == "phone"
                for g in item.get("contact_groups") or []
                for c in g.get("contacts") or []
            )
            self.store.mark_seen(branch_id, firm_id, region, found_by, has_phone)
        self.store.write_raw(region, {
            "source_region": region,
            "source_host": host,
            "source_query": found_by,
            "collected_at": utcnow(),
            "response": {"result": {"items": [item]}},
        })
