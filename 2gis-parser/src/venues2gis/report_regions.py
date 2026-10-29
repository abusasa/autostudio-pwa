"""Список регионов с кодами, ожидаемым объёмом и прогрессом по локальной базе.

Кодом региона выбирается город для сбора: `run.py collect --region shymkent`.
Числа в колонке «организаций» - это то, что 2GIS сам показывает по региону
(поле `total` в выдаче), замеренное скриптом tools/estimate_region.py. Там,
где замера не было, стоит группа размера - грубый ориентир, а не измерение.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from .config import Config
from .regions import FALLBACK_KZ_REGIONS, load_regions

# Замерено на живой выдаче 2GIS 21 августа 2026 (tools/estimate_region.py).
MEASURED_TOTALS: dict[str, int] = {
    "almaty": 43_744,
    "nur_sultan": 26_139,
    "shymkent": 26_194,
    "kokshetau": 6_855,
}

# Факт: Алматы целиком (140 задач, 12 931 организация) собран за 3 ч 2 мин
# на 8 воркерах. Остальные оценки - пропорция от этого прогона.
ALMATY_HOURS_AT_8_WORKERS = 3.0

# Группы размера для регионов, где замера объёма не делали.
SIZE_GROUP: dict[str, str] = {
    "almaty": "крупный", "nur_sultan": "крупный", "shymkent": "крупный",
    "karaganda": "средний", "aktobe": "средний", "taraz": "средний",
    "pavlodar": "средний", "ustkam": "средний", "semey": "средний",
    "atyrau": "средний", "kostanay": "средний", "kyzylorda": "средний",
    "uralsk": "средний", "aktau": "средний",
    "petropavlovsk": "небольшой", "turkestan": "небольшой",
    "kokshetau": "небольшой", "zhezkazgan": "небольшой", "ekibastuz": "небольшой",
}

# Ориентир по времени на 8 окнах, часы. Для замеренных считается из объёма.
GROUP_HOURS: dict[str, str] = {
    "крупный": "2-3 ч",
    "средний": "1-2 ч",
    "небольшой": "0,5-1 ч",
}


def _hours(code: str, workers: int) -> str:
    total = MEASURED_TOTALS.get(code)
    group = SIZE_GROUP.get(code, "средний")
    if total is None:
        base = GROUP_HOURS[group]
    else:
        h = ALMATY_HOURS_AT_8_WORKERS * total / MEASURED_TOTALS["almaty"]
        base = f"~{h:.1f} ч".replace(".", ",")
    if workers and workers != 8:
        # Скорость почти линейна до числа физических ядер, дальше плато.
        return base + f" (при 8 окнах; у вас {workers})"
    return base


def _progress(db_path: Path) -> dict[str, dict]:
    """Что уже собрано в локальной базе, по регионам."""
    if not Path(db_path).exists():
        return {}
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return {}
    try:
        out: dict[str, dict] = {}
        for region, status, count in conn.execute(
            "SELECT region, status, COUNT(*) FROM tasks GROUP BY region, status"
        ):
            out.setdefault(region, {})[status] = count
        for region, count in conn.execute(
            "SELECT region, COUNT(*) FROM seen GROUP BY region"
        ):
            out.setdefault(region, {})["собрано"] = count
        return out
    except sqlite3.Error:
        return {}
    finally:
        conn.close()


def print_regions(cfg: Config, db_path: Optional[Path] = None) -> None:
    regions = load_regions(Path(cfg.paths.regions_cache), session=None,
                           country=cfg.collect.country, refresh=False)
    if not regions:
        regions = [type("R", (), r)() for r in FALLBACK_KZ_REGIONS]
    progress = _progress(Path(db_path or cfg.paths.db_path))
    workers = cfg.collect.workers

    print()
    print(f"{'КОД РЕГИОНА':<16} {'ГОРОД':<20} {'ОРГАНИЗАЦИЙ В 2GIS':<20} "
          f"{'ВРЕМЯ':<12} {'СОСТОЯНИЕ'}")
    print("-" * 96)
    for r in sorted(regions, key=lambda x: -MEASURED_TOTALS.get(x.code, 0)):
        total = MEASURED_TOTALS.get(r.code)
        volume = f"{total:,}".replace(",", " ") if total else SIZE_GROUP.get(r.code, "средний")
        st = progress.get(r.code, {})
        if st.get("собрано"):
            done, pending = st.get("done", 0), st.get("pending", 0)
            state = f"собрано {st['собрано']} шт., задач done {done}"
            if pending:
                state += f", осталось {pending}"
        else:
            state = "не начат"
        print(f"{r.code:<16} {r.name:<20} {volume:<20} {_hours(r.code, workers):<12} {state}")
    print("-" * 96)
    print("Запуск региона:   python run.py collect --region <КОД РЕГИОНА>")
    print("Сразу несколько:  python run.py collect --region taraz --region atyrau")
    print("Точный замер объёма региона:  python tools/estimate_region.py --region <КОД>")
    print()
