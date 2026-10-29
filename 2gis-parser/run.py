#!/usr/bin/env python3
"""Сбор базы площадок для мероприятий по Казахстану из 2GIS.

Команды:
  doctor  - проверить машину и получить рекомендацию по числу окон
  regions - список регионов Казахстана с кодами и прогрессом
  collect - основной сбор: регионы x рубрики и поисковые запросы
  export  - пересборка CSV/JSONL/XLSX из уже собранных сырых данных
  status  - состояние очереди и объём базы
  pack    - упаковать свои результаты в zip для отправки координатору
  merge   - влить в свою базу zip-архивы, присланные коллегами
  probe   - техническая разведка (что и как отдаёт 2GIS)
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

# Консоль Windows по умолчанию не в UTF-8, а весь вывод здесь русский.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

from venues2gis.config import Config  # noqa: E402
from venues2gis.logging_setup import setup_logging  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="run.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default="config.yaml", help="Путь к config.yaml")
    parser.add_argument("--verbose", action="store_true", help="Подробный вывод в консоль")
    sub = parser.add_subparsers(dest="command", required=True)

    p_probe = sub.add_parser("probe", help="Этап 0: техническая разведка 2GIS")
    p_probe.add_argument("--domain", default="2gis.kz")
    p_probe.add_argument("--region", default="almaty")
    p_probe.add_argument("--query", action="append", dest="queries", default=None)
    p_probe.add_argument("--max-cards", type=int, default=12)
    p_probe.add_argument("--pagination-limit", type=int, default=30)
    p_probe.add_argument("--headless", action="store_true")
    p_probe.add_argument("--browser-path", default=None)
    p_probe.add_argument("--out-dir", default="data/probe")

    p_collect = sub.add_parser("collect", help="Основной сбор данных")
    p_collect.add_argument("--region", action="append", dest="regions", default=None,
                           help="Код региона; можно повторять. По умолчанию - все")
    p_collect.add_argument("--layer", action="append", dest="layers", default=None,
                           help="Слой запросов: rubric|ru|kz|en|extra")
    p_collect.add_argument("--max-tasks", type=int, default=None,
                           help="Ограничить число задач за этот запуск")
    p_collect.add_argument("--max-pages", type=int, default=None,
                           help="Ограничить число страниц выдачи на задачу")
    p_collect.add_argument("--refresh-regions", action="store_true",
                           help="Обновить список регионов с data.2gis.com")
    p_collect.add_argument("--headless", action="store_true")
    p_collect.add_argument("--workers", type=int, default=None,
                           help="Сколько параллельных воркеров (по умолчанию из конфига)")
    p_collect.add_argument("--rubric-set", action="append", dest="rubric_sets", default=None,
                           help="Набор рубрик: core|food; можно повторять")
    p_collect.add_argument("--rubric", action="append", dest="rubrics", default=None,
                           help="ID рубрики 2GIS; можно повторять. Заменяет наборы рубрик")
    p_collect.add_argument("--query", action="append", dest="queries", default=None,
                           help="Поисковое слово; можно повторять. Заменяет слои запросов")
    p_collect.add_argument("--max-seconds", type=float, default=None,
                           help="Ограничить время работы каждого воркера, секунд")
    p_collect.add_argument("--plan-only", action="store_true",
                           help="Только составить очередь, не запускать сбор")

    p_worker = sub.add_parser("worker", help="Один воркер пула (запускается оркестратором)")
    p_worker.add_argument("--id", type=int, required=True)
    p_worker.add_argument("--max-seconds", type=float, default=None)

    p_export = sub.add_parser("export", help="Пересобрать выгрузку из сырых данных")
    p_export.add_argument("--events-only", action="store_true",
                          help="Только заведения, помеченные как площадки")
    p_export.add_argument("--min-score", type=int, default=0)

    sub.add_parser("status", help="Состояние очереди и объём базы")

    sub.add_parser("doctor", help="Проверить машину и подобрать число окон")

    sub.add_parser("regions", help="Регионы Казахстана: коды, размер, прогресс")

    p_pack = sub.add_parser("pack", help="Упаковать свои результаты в zip")
    p_pack.add_argument("--out", default=None, help="Путь к создаваемому архиву")
    p_pack.add_argument("--author", default="", help="Кто собирал - попадёт в манифест")

    p_merge = sub.add_parser("merge", help="Влить архивы коллег в свою базу")
    p_merge.add_argument("sources", nargs="+",
                         help="Пути к zip-архивам или распакованным папкам")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    cfg = Config.load(ROOT / args.config).resolve(ROOT)
    # У каждого воркера свой файл лога: ротация одного файла из нескольких
    # процессов на Windows приводит к отказу переименования и потере записей.
    log_name = f"worker{args.id}" if args.command == "worker" else args.command
    setup_logging(
        Path(cfg.paths.log_dir),
        logging.DEBUG if args.verbose else logging.INFO,
        name=log_name,
    )

    if args.command == "probe":
        from venues2gis.probe import run_probe

        run_probe(
            domain=args.domain,
            region=args.region,
            queries=args.queries,
            max_cards=args.max_cards,
            pagination_limit=args.pagination_limit,
            out_dir=ROOT / args.out_dir,
            headless=args.headless,
            binary_path=args.browser_path,
        )
        return 0

    if args.command == "collect":
        from venues2gis.orchestrator import prepare, run_pool

        if args.regions:
            cfg.collect.regions = args.regions
        if args.layers:
            cfg.collect.layers = args.layers
        if args.rubric_sets:
            cfg.collect.rubric_sets = args.rubric_sets
        if args.rubrics:
            cfg.collect.rubrics = args.rubrics
        if args.queries:
            cfg.collect.queries = args.queries
        if args.max_pages:
            cfg.collect.max_pages_per_task = args.max_pages
        if args.headless:
            cfg.browser.headless = True
        if args.workers:
            cfg.collect.workers = args.workers

        prepare(cfg, refresh_regions=args.refresh_regions)
        if args.plan_only:
            return 0
        failed = run_pool(cfg, cfg.collect.workers, ROOT / args.config,
                          max_seconds=args.max_seconds)
        return 1 if failed else 0

    if args.command == "worker":
        from venues2gis.worker import run_worker

        run_worker(cfg, worker_id=args.id, max_seconds=args.max_seconds)
        return 0

    if args.command == "export":
        from venues2gis.export import run_export

        run_export(
            db_path=Path(cfg.paths.db_path),
            raw_dir=Path(cfg.paths.raw_dir),
            out_dir=Path(cfg.paths.out_dir),
            events_only=args.events_only,
            min_score=args.min_score,
        )
        return 0

    if args.command == "status":
        from venues2gis.store import Store

        with Store(Path(cfg.paths.db_path), Path(cfg.paths.raw_dir)) as store:
            tasks = store.task_stats()
            firms = store.firm_stats()
            seen = len(store.seen_ids())
        print("Очередь обхода (фаза A):", tasks or "пусто")
        print("Очередь заведений (фаза B):", firms or "пусто")
        print("Собрано карточек:", seen)
        return 0

    if args.command == "doctor":
        from venues2gis.doctor import run_doctor

        return run_doctor(ROOT, cfg.browser.binary_path, cfg.collect.workers)

    if args.command == "regions":
        from venues2gis.report_regions import print_regions

        print_regions(cfg)
        return 0

    if args.command == "pack":
        from venues2gis.transfer import pack

        dest = pack(
            raw_dir=Path(cfg.paths.raw_dir),
            db_path=Path(cfg.paths.db_path),
            out_dir=Path(cfg.paths.out_dir),
            dest=Path(args.out) if args.out else None,
            author=args.author,
        )
        print(f"Архив готов: {dest}")
        print("Отправьте этот файл координатору проекта.")
        return 0

    if args.command == "merge":
        from venues2gis.transfer import merge

        result = merge([Path(s) for s in args.sources],
                       raw_dir=Path(cfg.paths.raw_dir),
                       db_path=Path(cfg.paths.db_path))
        print("Влито:", result)
        print("Теперь пересоберите выгрузку:  python run.py export")
        return 0

    parser.error(f"Неизвестная команда: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
