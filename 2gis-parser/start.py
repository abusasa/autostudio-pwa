#!/usr/bin/env python3
"""Мастер запуска: проверяет машину, спрашивает регион и число окон, запускает сбор.

Это точка входа для тех, кто просто гоняет сбор на своей машине и не хочет
разбираться с флагами. Всё, что он делает, доступно и вручную:

    python run.py doctor
    python run.py collect --region shymkent --workers 6
    python run.py export
    python run.py pack

После сбора мастер сам пересобирает выгрузку и предлагает упаковать результат
в архив для отправки координатору.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

from venues2gis.config import Config  # noqa: E402
from venues2gis.doctor import (  # noqa: E402
    FAIL, RAM_PER_WORKER_GB, collect_checks, hardware, recommend_workers,
)
from venues2gis.regions import load_regions  # noqa: E402
from venues2gis.report_regions import MEASURED_TOTALS, SIZE_GROUP, _hours, _progress  # noqa: E402


def line(char: str = "=") -> None:
    print(char * 74)


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{prompt}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nОтменено.")
        raise SystemExit(1)
    return answer or default


def step_check(cfg: Config) -> None:
    print()
    line()
    print("  ШАГ 1 из 4. Проверка машины")
    line()
    checks = collect_checks(ROOT, cfg.browser.binary_path)
    for c in checks:
        mark = {"OK": "  [ ok ] ", "ВНИМАНИЕ": "  [ !! ] ", "ОШИБКА": "  [ХХХХ] "}[c.status]
        print(f"{mark}{c.name}: {c.detail}")
    if any(c.status == FAIL for c in checks):
        print()
        print("  Так запускать нельзя. Исправьте пункты, отмеченные ХХХХ, и повторите.")
        print("  Если не хватает пакетов:  pip install -r requirements.txt")
        raise SystemExit(1)


def step_region(cfg: Config) -> list[str]:
    print()
    line()
    print("  ШАГ 2 из 4. Какой регион собираем")
    line()
    regions = load_regions(Path(cfg.paths.regions_cache), session=None,
                           country=cfg.collect.country, refresh=False)
    regions = sorted(regions, key=lambda x: -MEASURED_TOTALS.get(x.code, 0))
    progress = _progress(Path(cfg.paths.db_path))

    for i, r in enumerate(regions, 1):
        total = MEASURED_TOTALS.get(r.code)
        volume = f"{total:,}".replace(",", " ") if total else SIZE_GROUP.get(r.code, "средний")
        state = ""
        if progress.get(r.code, {}).get("собрано"):
            state = f"  <- уже есть {progress[r.code]['собрано']} записей"
        print(f"  {i:>2}. {r.code:<15} {r.name:<20} {volume:<12} "
              f"{_hours(r.code, 8):<10}{state}")
    print()
    print("  Введите номера через пробел (например: 4 7) или коды регионов.")
    answer = ask("  Регионы", "")
    if not answer:
        print("  Регион не выбран.")
        raise SystemExit(1)

    by_code = {r.code: r for r in regions}
    chosen: list[str] = []
    for token in answer.replace(",", " ").split():
        if token.isdigit() and 1 <= int(token) <= len(regions):
            chosen.append(regions[int(token) - 1].code)
        elif token in by_code:
            chosen.append(token)
        else:
            print(f"  Не понял «{token}» - пропускаю.")
    chosen = list(dict.fromkeys(chosen))
    if not chosen:
        print("  Ни один регион не распознан.")
        raise SystemExit(1)
    print("  Выбрано:", ", ".join(f"{c} ({by_code[c].name})" for c in chosen))
    return chosen


def step_workers() -> int:
    print()
    line()
    print("  ШАГ 3 из 4. Сколько окон браузера открывать")
    line()
    physical, logical, ram_total, ram_free = hardware()
    recommended, why = recommend_workers(physical, ram_total)
    print(f"  Процессор: {physical} физических ядер / {logical} потоков")
    print(f"  Память: {ram_total:.1f} ГБ всего, {ram_free:.1f} ГБ свободно")
    print(f"  Рекомендация: {recommended} окон ({why})")
    print("  Каждое окно - отдельный Chrome, работать на машине во время прогона можно,")
    print("  но она будет заметно загружена. Лучше запускать на ночь.")
    print()
    answer = ask("  Сколько окон", str(recommended))
    try:
        workers = max(1, int(answer))
    except ValueError:
        workers = recommended
    if workers * RAM_PER_WORKER_GB > ram_free:
        print(f"  ВНИМАНИЕ: {workers} окон потребуют около "
              f"{workers * RAM_PER_WORKER_GB:.1f} ГБ, свободно {ram_free:.1f} ГБ.")
        if ask("  Всё равно продолжить? (да/нет)", "нет").lower() not in ("да", "y", "yes"):
            raise SystemExit(1)
    return workers


def step_run(regions: list[str], workers: int) -> int:
    print()
    line()
    print("  ШАГ 4 из 4. Запуск")
    line()
    cmd = [sys.executable, str(ROOT / "run.py"), "collect", "--workers", str(workers)]
    for r in regions:
        cmd += ["--region", r]

    limit = ask("  Ограничить время прогона, часов (пусто = до конца)", "")
    if limit:
        try:
            cmd += ["--max-seconds", str(float(limit.replace(",", ".")) * 3600)]
        except ValueError:
            print("  Не разобрал число часов - ограничение не ставлю.")

    print()
    print("  Команда:", " ".join(cmd[1:]))
    print("  Остановить в любой момент: Ctrl+C - прогресс сохранится,")
    print("  повторный запуск продолжит с того же места.")
    if ask("  Запускаем? (да/нет)", "да").lower() not in ("да", "y", "yes", ""):
        print("  Отменено.")
        return 1
    print()
    return subprocess.call(cmd, cwd=str(ROOT))


def step_finish(regions: list[str]) -> None:
    print()
    line()
    print("  Сбор завершён. Собираю выгрузку в out/")
    line()
    subprocess.call([sys.executable, str(ROOT / "run.py"), "export"], cwd=str(ROOT))
    print()
    if ask("  Упаковать результат в архив для отправки? (да/нет)", "да").lower() in (
            "да", "y", "yes", ""):
        author = ask("  Ваше имя (попадёт в манифест архива)", "")
        cmd = [sys.executable, str(ROOT / "run.py"), "pack"]
        if author:
            cmd += ["--author", author]
        subprocess.call(cmd, cwd=str(ROOT))
    print()
    print("  Готовые файлы лежат в папке out/ - venues.csv, venues.xlsx, report.md")
    line()


def main() -> int:
    print()
    line()
    print("  Сбор площадок Казахстана из 2GIS")
    line()
    cfg = Config.load(ROOT / "config.yaml").resolve(ROOT)

    step_check(cfg)
    regions = step_region(cfg)
    workers = step_workers()
    code = step_run(regions, workers)
    if code == 0:
        step_finish(regions)
    else:
        print()
        print("  Сбор завершился с ошибкой или был прерван.")
        print("  Прогресс сохранён: повторный запуск продолжит с того же места.")
        print("  Что уже собрано:  python run.py status")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
