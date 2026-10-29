"""Планирование очереди и запуск пула воркеров.

Задачи в очередь кладёт только оркестратор, один раз перед стартом - иначе
воркеры гонялись бы за право их создать. Дальше каждый воркер разбирает
очередь сам: закончил одну задачу - берёт следующую, независимо от региона.

Воркеры - отдельные процессы, а не потоки: sync-API Playwright не переживает
обращения из нескольких потоков, а Chrome всё равно держит свой процесс.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import yaml

from .config import Config
from .logging_setup import logger
from .queries import build_queries
from .regions import Region, load_regions
from .rubrics import build_rubric_sources, rubric_titles
from .store import Store


def plan_tasks(cfg: Config, store: Store, regions: list[Region]) -> int:
    """Кладёт в очередь задачи обхода: рубрики, затем поисковые слова.

    Рубрики идут первыми осознанно: они дают скелет покрытия, и к моменту,
    когда дойдут слова, большинство заведений уже будет в очереди фазы B -
    слова добавят только то, чего рубрики не поймали.
    """
    rubric_sources = build_rubric_sources(cfg.collect.rubric_sets, cfg.collect.rubrics)
    query_sources = build_queries(cfg.collect.layers, cfg.collect.queries)
    sources = rubric_sources + query_sources
    if not sources:
        logger.error("Не задано ни одного источника: проверьте collect.rubrics / "
                     "collect.queries / rubric_sets / layers в config.yaml")
        return 0
    logger.info("План: %d регионов x %d источников (%d рубрик + %d слов) = %d задач",
                len(regions), len(sources), len(rubric_sources), len(query_sources),
                len(regions) * len(sources))
    return store.enqueue_tasks((r.code, r.host, s) for r in regions for s in sources)


def select_regions(cfg: Config, regions: list[Region]) -> list[Region]:
    wanted = cfg.collect.regions
    if not wanted:
        return regions
    by_code = {r.code: r for r in regions}
    missing = [c for c in wanted if c not in by_code]
    if missing:
        logger.warning("Неизвестные коды регионов пропущены: %s", ", ".join(missing))
    return [by_code[c] for c in wanted if c in by_code]


def prepare(cfg: Config, refresh_regions: bool = False) -> tuple[int, dict]:
    """Готовит очередь. Возвращает (сколько задач добавлено, состояние очереди)."""
    from .browser import BrowserOptions, BrowserSession

    store = Store(Path(cfg.paths.db_path), Path(cfg.paths.raw_dir))
    try:
        store.release_running()
        store.release_running_firms()
        regions_path = Path(cfg.paths.regions_cache)
        session = None
        try:
            # Браузер нужен только чтобы обновить список регионов: без --refresh
            # берётся кэш, а при его отсутствии - вшитый список.
            if refresh_regions:
                session = BrowserSession(BrowserOptions(
                    binary_path=cfg.browser.binary_path,
                    headless=cfg.browser.headless,
                    profile_dir=Path(str(cfg.browser.profile_dir) + "-plan"),
                    block_resources=cfg.browser.block_resources,
                )).start()
            all_regions = load_regions(regions_path, session=session,
                                       country=cfg.collect.country,
                                       refresh=refresh_regions)
        finally:
            if session is not None:
                session.stop()

        regions = select_regions(cfg, all_regions)
        if not regions:
            logger.error("Не выбрано ни одного региона.")
            return 0, {}
        added = plan_tasks(cfg, store, regions)
        stats = {"задачи": store.task_stats(), "заведения": store.firm_stats()}
        logger.info("Очередь: %s", stats)
        return added, stats
    finally:
        store.close()


def dump_effective_config(cfg: Config, data_dir: Path) -> Path:
    """Сохраняет конфиг вместе с флагами командной строки для воркеров.

    Воркеры - отдельные процессы и читают конфиг с диска. Если отдать им
    исходный config.yaml, то --headless, --max-pages и прочие флаги запуска до
    них не доедут и молча ничего не сделают. Поэтому пишем итоговый конфиг.
    """
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / ".effective-config.yaml"
    path.write_text(
        yaml.safe_dump(cfg.model_dump(mode="json"), allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    return path


def run_pool(cfg: Config, workers: int, config_path: Path,
             max_seconds: Optional[float] = None) -> int:
    """Поднимает N процессов-воркеров и ждёт их завершения."""
    root = Path(__file__).resolve().parent.parent.parent
    effective = dump_effective_config(cfg, Path(cfg.paths.data_dir))
    procs: list[tuple[int, subprocess.Popen]] = []
    logger.info("Запускаем воркеров: %d", workers)
    for i in range(workers):
        cmd = [sys.executable, str(root / "run.py"), "--config", str(effective),
               "worker", "--id", str(i)]
        if max_seconds:
            cmd += ["--max-seconds", str(max_seconds)]
        # Воркеры пишут в свои логи; здесь нужен только код возврата.
        p = subprocess.Popen(cmd, cwd=str(root))
        procs.append((i, p))
        # Разносим старты: одновременный запуск N Chrome даёт всплеск нагрузки
        # и синхронные запросы к 2GIS с одного адреса.
        time.sleep(2.0)

    failed = 0
    try:
        for i, p in procs:
            code = p.wait()
            if code != 0:
                failed += 1
                logger.warning("Воркер %d завершился с кодом %d", i, code)
    except KeyboardInterrupt:
        logger.warning("Останавливаем воркеров...")
        for _i, p in procs:
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass
        for _i, p in procs:
            try:
                p.wait(timeout=30)
            except Exception:  # noqa: BLE001
                pass
    return failed


def status(cfg: Config) -> dict:
    store = Store(Path(cfg.paths.db_path), Path(cfg.paths.raw_dir))
    try:
        titles = rubric_titles()
        rows = store.coverage_rows()
        weak = []
        for region, query, total, seen, pages, st in rows:
            if total and seen < total:
                name = query
                if query.startswith("rubric:"):
                    rid = query.split(":", 1)[1]
                    name = f"{titles.get(rid, rid)} (рубрика {rid})"
                weak.append({"регион": region, "источник": name, "заявлено": total,
                             "просмотрено": seen, "страниц": pages, "статус": st})
        return {"задачи": store.task_stats(), "заведения": store.firm_stats(),
                "недобранные": weak[:20]}
    finally:
        store.close()
