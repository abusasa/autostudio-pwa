"""Этап 0 - техническая разведка 2GIS.

Ничего не предполагаем: открываем реальную выдачу и фиксируем, что именно работает.
Проверяем:
  V1 - глубину пагинации веб-выдачи;
  V2 - есть ли в ответе items/byid данные о вместимости;
  V3 - реагирует ли выдача на гео-параметры в URL;
  V4 - как часто прилетает антибот /museum;
  V5 - живой список регионов Казахстана.
"""
from __future__ import annotations

import json
import random
import re
import time
import urllib.parse
from collections import Counter
from pathlib import Path
from typing import Any, Optional

from playwright.sync_api import Error as PWError
from playwright.sync_api import TimeoutError as PWTimeout

from .browser import BrowserOptions, BrowserSession
from .logging_setup import logger

BYID_PATTERN = re.compile(r"https://catalog\.api\.2gis\.[^/]+/.*/items/byid", re.I)
FIRM_HREF = re.compile(r"/(?:firm|station|branches)/(?P<fid>\d+)", re.I)


def search_url(domain: str, region: str, query: str, page: int = 1) -> str:
    quoted = urllib.parse.quote(query)
    url = f"https://{domain}/{region}/search/{quoted}"
    if page > 1:
        url += f"/page/{page}"
    return url


class Probe:
    def __init__(self, session: BrowserSession, out_dir: Path) -> None:
        self.s = session
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.antibot_hits = 0

    # --- низкоуровневое ---------------------------------------------------

    @property
    def page(self):
        assert self.s.page is not None
        return self.s.page

    def goto(self, url: str, timeout: int = 60_000) -> bool:
        logger.info("GET %s", url)
        try:
            self.page.goto(url, referer="https://www.google.com/", timeout=timeout)
        except PWTimeout:
            logger.warning("Таймаут навигации: %s", url)
            return False
        self.s.wait_network_idle(20)
        if self.s.is_antibot_page():
            self.antibot_hits += 1
            logger.warning("Антибот /museum. Ждём и пробуем ещё раз.")
            time.sleep(8)
            try:
                self.page.goto(url, referer="https://www.google.com/", timeout=timeout)
                self.s.wait_network_idle(20)
            except PWTimeout:
                return False
            return not self.s.is_antibot_page()
        return True

    def card_links(self) -> list[dict[str, str]]:
        """Все ссылки на карточки организаций в текущем DOM (в порядке выдачи)."""
        raw = self.page.evaluate(
            """() => Array.from(document.querySelectorAll('a[href*="/firm/"]'))
                    .map(a => a.getAttribute('href'))"""
        )
        seen: set[str] = set()
        result: list[dict[str, str]] = []
        for href in raw:
            if not href:
                continue
            m = FIRM_HREF.search(href)
            if not m:
                continue
            fid = m.group("fid")
            if fid in seen:
                continue
            seen.add(fid)
            result.append({"firm_id": fid, "href": href})
        return result

    def page_links(self) -> dict[int, str]:
        raw = self.page.evaluate(
            """() => Array.from(document.querySelectorAll('a[href*="/page/"]'))
                    .map(a => a.getAttribute('href'))"""
        )
        pages: dict[int, str] = {}
        for href in raw or []:
            m = re.search(r"/page/(\d+)", href or "")
            if m:
                pages[int(m.group(1))] = href
        return pages

    def click_card(self, href: str, timeout: int = 20_000) -> Optional[dict[str, Any]]:
        """Кликает карточку в списке и перехватывает ответ items/byid."""
        selector = f'a[href="{href}"]'
        try:
            with self.page.expect_response(
                lambda r: bool(BYID_PATTERN.match(r.url)), timeout=timeout
            ) as info:
                self.page.eval_on_selector(
                    selector,
                    "el => { el.scrollIntoView({block:'center'}); el.click(); }",
                )
            return info.value.json()
        except (PWTimeout, PWError) as e:
            logger.debug("Клик по %s не дал ответа: %s", href, type(e).__name__)
            return None

    def open_firm(self, domain: str, region: str, firm_id: str, timeout: int = 30_000):
        """Резервный путь: прямая навигация на карточку."""
        url = f"https://{domain}/{region}/firm/{firm_id}"
        try:
            with self.page.expect_response(
                lambda r: bool(BYID_PATTERN.match(r.url)), timeout=timeout
            ) as info:
                self.page.goto(url, referer=f"https://{domain}/{region}", timeout=timeout)
            return info.value.json()
        except (PWTimeout, PWError) as e:
            logger.debug("Навигация на firm/%s не дала ответа: %s", firm_id, type(e).__name__)
            return None


# --- сценарии разведки ----------------------------------------------------


def probe_regions(p: Probe) -> list[dict[str, Any]]:
    """V5: живой список регионов через перехват region/list на data.2gis.com."""
    logger.info("=== V5: список регионов ===")
    pattern = re.compile(r"https://catalog\.api\.2gis\.[^/]+/.*/region/list", re.I)
    try:
        with p.page.expect_response(lambda r: bool(pattern.match(r.url)), timeout=60_000) as info:
            p.page.goto("https://data.2gis.com", timeout=60_000)
        doc = info.value.json()
    except (PWTimeout, PWError) as e:
        logger.error("Не удалось получить region/list: %s", e)
        return []

    items = doc.get("result", {}).get("items", [])
    (p.out_dir / "region_list.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    kz = [i for i in items if i.get("country_code") == "kz"]
    logger.info("Всего регионов: %d, из них KZ: %d", len(items), len(kz))
    for i in kz:
        logger.info(
            "  %-16s %-24s домен=%s id=%s",
            i.get("code"),
            (i.get("name") or "").strip("_"),
            i.get("domain"),
            i.get("id"),
        )
    return kz


def probe_search(p: Probe, domain: str, region: str, query: str, max_cards: int) -> dict[str, Any]:
    """V1/V2/V4: выдача, пагинация, состав карточки."""
    logger.info("=== Выдача: %s / %s ===", region, query)
    report: dict[str, Any] = {"region": region, "query": query}

    if not p.goto(search_url(domain, region, query)):
        report["error"] = "не удалось открыть выдачу"
        return report

    cards = p.card_links()
    pages = p.page_links()
    logger.info("Карточек на странице 1: %d; ссылки на страницы: %s", len(cards), sorted(pages))
    report["cards_page1"] = len(cards)
    report["page_links_page1"] = sorted(pages)

    # Проверяем, переживает ли список открытие карточки (можно ли кликать подряд).
    docs: list[dict[str, Any]] = []
    survived_list = None
    for idx, card in enumerate(cards[:max_cards]):
        doc = p.click_card(card["href"])
        if doc is None:
            logger.info("Клик не сработал, пробуем прямую навигацию на карточку.")
            doc = p.open_firm(domain, region, card["firm_id"])
            if doc is not None and survived_list is None:
                survived_list = False
        if doc is not None:
            docs.append(doc)
        if idx == 0:
            after = p.card_links()
            survived_list = len(after) > 1 if survived_list is None else survived_list
            logger.info(
                "После открытия первой карточки ссылок в DOM: %d (список %s)",
                len(after),
                "жив" if len(after) > 1 else "пропал",
            )
        time.sleep(random.uniform(0.4, 0.9))

    report["cards_collected"] = len(docs)
    report["list_survives_click"] = survived_list

    dump = p.out_dir / f"cards__{region}__{re.sub(r'[^a-zA-Zа-яА-Я0-9]+', '_', query)}.json"
    dump.write_text(json.dumps(docs, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Сырые карточки: %s", dump)

    report.update(analyze_docs(docs))
    return report


def analyze_docs(docs: list[dict[str, Any]]) -> dict[str, Any]:
    """V2: какие ключи вообще есть и где может лежать вместимость."""
    key_counter: Counter[str] = Counter()
    rubrics: Counter[str] = Counter()
    have_phone = have_schedule = have_point = 0
    capacity_hits: list[dict[str, Any]] = []
    cap_re = re.compile(r"(вместим|посадочн|мест[оа]?\b|человек|гост(ей|я)|persons|capacity|отыр)", re.I)
    num_re = re.compile(r"\d")

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(node, list):
            for v in node[:20]:
                walk(v, f"{path}[]")
        else:
            key_counter[path] += 1
            if isinstance(node, str) and cap_re.search(node) and num_re.search(node):
                capacity_hits.append({"path": path, "value": node[:300]})

    for doc in docs:
        for item in doc.get("result", {}).get("items", []):
            walk(item, "")
            if any(
                c.get("type") == "phone"
                for g in item.get("contact_groups", [])
                for c in g.get("contacts", [])
            ):
                have_phone += 1
            if item.get("schedule"):
                have_schedule += 1
            if item.get("point"):
                have_point += 1
            for r in item.get("rubrics", []):
                rubrics[f"{r.get('id')} | {r.get('name')}"] += 1

    total = sum(len(d.get("result", {}).get("items", [])) for d in docs) or 1
    logger.info(
        "Из %d карточек: телефон у %d, часы работы у %d, координаты у %d",
        total,
        have_phone,
        have_schedule,
        have_point,
    )
    logger.info("Найдено потенциальных упоминаний вместимости: %d", len(capacity_hits))
    for hit in capacity_hits[:15]:
        logger.info("  %s -> %s", hit["path"], hit["value"][:160])
    logger.info("Топ рубрик: %s", rubrics.most_common(15))

    return {
        "items_total": total,
        "with_phone": have_phone,
        "with_schedule": have_schedule,
        "with_point": have_point,
        "capacity_candidates": capacity_hits[:50],
        "rubrics": rubrics.most_common(),
        "top_keys": key_counter.most_common(80),
    }


def probe_search_api(p: Probe, domain: str, region: str, query: str) -> dict[str, Any]:
    """Главная проверка: что отдаёт сам поисковый запрос выдачи (/3.0/items?q=...).

    Если он уже содержит телефоны и вместимость - кликать каждую карточку не нужно,
    и скорость сбора вырастет примерно на порядок.
    """
    logger.info("=== Поисковый API выдачи ===")
    search_pattern = re.compile(r"https://catalog\.api\.2gis\.[^/]+/\d\.\d/items\?", re.I)
    try:
        with p.page.expect_response(
            lambda r: bool(search_pattern.match(r.url)), timeout=60_000
        ) as info:
            p.page.goto(
                search_url(domain, region, query),
                referer="https://www.google.com/",
                timeout=60_000,
            )
        resp = info.value
        doc = resp.json()
    except (PWTimeout, PWError) as e:
        logger.error("Поисковый запрос не перехвачен: %s", e)
        return {"error": str(e)}

    (p.out_dir / f"search_api__{region}.json").write_text(
        json.dumps({"url": resp.url, "body": doc}, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    items = doc.get("result", {}).get("items", [])
    total = doc.get("result", {}).get("total")
    logger.info("URL запроса: %s", resp.url)
    logger.info("result.total = %s, items в ответе = %d", total, len(items))
    if items:
        logger.info("Ключи item: %s", sorted(items[0].keys()))
    with_phone = sum(
        1
        for i in items
        if any(
            c.get("type") == "phone"
            for g in i.get("contact_groups", [])
            for c in g.get("contacts", [])
        )
    )
    with_attrs = sum(1 for i in items if i.get("attribute_groups"))
    with_schedule = sum(1 for i in items if i.get("schedule"))
    logger.info(
        "Из %d items выдачи: с телефоном %d, с attribute_groups %d, с расписанием %d",
        len(items),
        with_phone,
        with_attrs,
        with_schedule,
    )
    return {
        "request_url": resp.url,
        "total": total,
        "items_in_response": len(items),
        "with_phone": with_phone,
        "with_attribute_groups": with_attrs,
        "with_schedule": with_schedule,
        "item_keys": sorted(items[0].keys()) if items else [],
    }


def probe_pagination(p: Probe, domain: str, region: str, query: str, limit: int = 30) -> dict[str, Any]:
    """V1: докуда реально доходит пагинация при переходах кликом."""
    logger.info("=== V1: глубина пагинации (%s / %s) ===", region, query)
    if not p.goto(search_url(domain, region, query)):
        return {"error": "не удалось открыть выдачу"}

    reached = 1
    per_page: list[int] = [len(p.card_links())]
    while reached < limit:
        pages = p.page_links()
        target = reached + 1
        if target not in pages:
            logger.info("Ссылки на страницу %d в DOM нет. Доступны: %s", target, sorted(pages))
            break
        try:
            p.page.eval_on_selector(
                f'a[href="{pages[target]}"]',
                "el => { el.scrollIntoView({block:'center'}); el.click(); }",
            )
        except PWError as e:
            logger.warning("Не удалось кликнуть страницу %d: %s", target, e)
            break
        time.sleep(1.2)
        p.s.wait_network_idle(20)
        if p.s.is_antibot_page():
            p.antibot_hits += 1
            logger.warning("Антибот на странице %d.", target)
            break
        current = re.search(r"/page/(\d+)", p.page.url)
        current_n = int(current.group(1)) if current else 1
        if current_n != target:
            logger.info("Нас отбросило на страницу %d вместо %d - предел пагинации.", current_n, target)
            break
        reached = target
        per_page.append(len(p.card_links()))
        logger.info("Страница %d: карточек %d", reached, per_page[-1])

    logger.info("Максимально достигнутая страница: %d; карточек по страницам: %s", reached, per_page)
    return {"max_page": reached, "cards_per_page": per_page}


def probe_geo(p: Probe, domain: str, region: str, query: str) -> dict[str, Any]:
    """V3: меняется ли выдача от гео-параметров в URL."""
    logger.info("=== V3: гео-сужение выдачи ===")
    base = search_url(domain, region, query)
    variants = {
        "base": base,
        "center_zoom": f"{base}/center/76.889/43.238/zoom/14",
        "tab_list_center": f"{base}?m=76.889%2C43.238%2F14",
    }
    result: dict[str, Any] = {}
    for name, url in variants.items():
        ok = p.goto(url)
        cards = p.card_links() if ok else []
        result[name] = {
            "url": url,
            "final_url": p.page.url if ok else None,
            "cards": len(cards),
            "first_ids": [c["firm_id"] for c in cards[:5]],
        }
        logger.info("%-16s карточек=%-3d итоговый URL=%s", name, len(cards), p.page.url if ok else "-")
        time.sleep(1.0)
    return result


def run_probe(
    domain: str = "2gis.kz",
    region: str = "almaty",
    queries: Optional[list[str]] = None,
    max_cards: int = 12,
    pagination_limit: int = 30,
    out_dir: Path = Path("data/probe"),
    headless: bool = False,
    binary_path: Optional[str] = None,
) -> dict[str, Any]:
    queries = queries or ["тойхана", "банкетные залы", "конференц-зал"]
    report: dict[str, Any] = {"domain": domain, "region": region}

    opts = BrowserOptions(binary_path=binary_path, headless=headless)
    with BrowserSession(opts) as session:
        p = Probe(session, out_dir)
        report["search_api"] = probe_search_api(p, domain, region, queries[0])
        report["regions_kz"] = probe_regions(p)
        report["searches"] = [probe_search(p, domain, region, q, max_cards) for q in queries]
        report["pagination"] = probe_pagination(p, domain, region, queries[0], limit=pagination_limit)
        report["geo"] = probe_geo(p, domain, region, queries[0])
        report["antibot_hits"] = p.antibot_hits

    path = out_dir / "probe_report.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Отчёт разведки: %s", path)
    return report
