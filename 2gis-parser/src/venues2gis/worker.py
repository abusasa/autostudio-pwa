"""Один воркер: свой браузер, общая очередь.

Работу воркер ищет сам и не простаивает: пока в очереди есть задачи обхода
(фаза A) - берёт их, кончились - переходит на заведения (фаза B). Никакой
нарезки на равные части заранее: задачи очень разного размера (рубрика
"Быстрое питание" - 231 страница, "Театры" - 3), и балансировка по факту
всегда точнее балансировки по плану.

Каждый воркер обязан иметь свой профиль браузера. Chrome - single-instance на
профиль, а kill_browsers_using_profile() убивает процессы по совпадению пути:
с общим профилем воркеры расстреливают друг друга при каждом перезапуске.
"""
from __future__ import annotations

import signal
import time
from pathlib import Path
from typing import Optional

from .browser import BrowserOptions, BrowserSession
from .cards import AntibotBlocked as CardsAntibot
from .cards import CardFetcher
from .config import Config
from .discover import AntibotBlocked as DiscoverAntibot
from .discover import Discoverer
from .logging_setup import logger
from .store import Store


class StopFlag:
    """Ctrl+C не должен ронять прогон - доигрываем текущее и выходим."""

    def __init__(self) -> None:
        self.stop = False
        try:
            self._prev = signal.signal(signal.SIGINT, self._handle)
        except ValueError:  # не главный поток
            self._prev = None

    def _handle(self, *_args) -> None:
        if self.stop:
            raise KeyboardInterrupt
        self.stop = True
        logger.warning("Получен Ctrl+C. Завершаем текущую работу и сохраняем прогресс...")

    def __call__(self) -> bool:
        return self.stop

    def release(self) -> None:
        if self._prev is not None:
            try:
                signal.signal(signal.SIGINT, self._prev)
            except (ValueError, TypeError):
                pass


def worker_browser_options(cfg: Config, worker_id: int) -> BrowserOptions:
    """Профиль на воркер - иначе они убивают браузеры друг друга."""
    base = Path(cfg.browser.profile_dir)
    profile = base if worker_id == 0 and cfg.collect.workers == 1 else Path(
        str(base) + f"-w{worker_id}")
    return BrowserOptions(
        binary_path=cfg.browser.binary_path,
        headless=cfg.browser.headless,
        profile_dir=profile,
        block_resources=cfg.browser.block_resources,
        window_size=cfg.browser.window_size,
    )


def run_worker(cfg: Config, worker_id: int = 0, max_seconds: Optional[float] = None,
               own_signals: bool = True) -> dict:
    """Крутит цикл «взять работу - сделать» до опустошения очередей."""
    store = Store(Path(cfg.paths.db_path), Path(cfg.paths.raw_dir), worker=str(worker_id))
    stop = StopFlag() if own_signals else None
    should_stop = stop if stop is not None else (lambda: False)
    deadline = time.monotonic() + max_seconds if max_seconds else None

    session: Optional[BrowserSession] = None
    stats = {"воркер": worker_id, "задач_обхода": 0, "страниц": 0,
             "найдено_заведений": 0, "карточек": 0, "неудач": 0}
    tasks_done = 0

    def restart() -> BrowserSession:
        nonlocal session
        if session is not None:
            session.stop()
            time.sleep(1.5)
        session = BrowserSession(worker_browser_options(cfg, worker_id)).start()
        return session

    try:
        session = restart()
        discoverer = Discoverer(session, store, cfg.collect, should_stop=should_stop)
        fetcher = CardFetcher(session, store, cfg.collect, should_stop=should_stop)

        while not should_stop():
            if deadline and time.monotonic() > deadline:
                logger.info("[w%d] лимит времени исчерпан", worker_id)
                break

            # --- фаза A: пока есть задачи обхода, делаем их ---------------
            task = store.next_task(cfg.collect.max_attempts)
            if task is not None:
                try:
                    res = discoverer.run_task(task["region"], task["domain"], task["query"])
                except DiscoverAntibot as e:
                    store.finish_task(task["id"], "failed", error=str(e))
                    logger.error("[w%d] %s", worker_id, e)
                    break
                except Exception as e:  # noqa: BLE001 - одна задача не роняет прогон
                    logger.exception("[w%d] задача %s/%s упала",
                                     worker_id, task["region"], task["query"])
                    store.finish_task(task["id"], "failed",
                                      error=f"{type(e).__name__}: {e}")
                    session = restart()
                    discoverer = Discoverer(session, store, cfg.collect, should_stop=should_stop)
                    fetcher = CardFetcher(session, store, cfg.collect, should_stop=should_stop)
                    continue
                store.finish_task(task["id"], res.status, res.pages_done, res.ids_seen,
                                  res.ids_new, res.error, res.reported_total)
                stats["задач_обхода"] += 1
                stats["страниц"] += res.pages_done
                stats["найдено_заведений"] += res.ids_new
                tasks_done += 1
            else:
                # --- фаза B: очередь обхода пуста, берём заведения --------
                rows = store.next_firms(cfg.collect.firm_batch, cfg.collect.max_attempts)
                if not rows:
                    logger.info("[w%d] очереди пусты - работа закончена", worker_id)
                    break
                try:
                    res = fetcher.run_batch(rows)
                except CardsAntibot as e:
                    store.finish_firms([(r["firm_id"], "pending", None) for r in rows])
                    logger.error("[w%d] %s", worker_id, e)
                    break
                except Exception as e:  # noqa: BLE001
                    logger.exception("[w%d] пачка карточек упала", worker_id)
                    store.finish_firms([(r["firm_id"], "pending", None) for r in rows])
                    session = restart()
                    discoverer = Discoverer(session, store, cfg.collect, should_stop=should_stop)
                    fetcher = CardFetcher(session, store, cfg.collect, should_stop=should_stop)
                    continue
                stats["карточек"] += res.done
                stats["неудач"] += res.failed
                tasks_done += 1
                if res.stopped:
                    break

            if (cfg.browser.restart_every_tasks
                    and tasks_done % cfg.browser.restart_every_tasks == 0
                    and not should_stop()):
                logger.info("[w%d] плановый перезапуск браузера", worker_id)
                session = restart()
                discoverer = Discoverer(session, store, cfg.collect, should_stop=should_stop)
                fetcher = CardFetcher(session, store, cfg.collect, should_stop=should_stop)

    except KeyboardInterrupt:
        logger.warning("[w%d] прервано пользователем", worker_id)
    finally:
        if session is not None:
            session.stop()
        store.close()
        if stop is not None:
            stop.release()
    logger.info("[w%d] итог: %s", worker_id, stats)
    return stats
