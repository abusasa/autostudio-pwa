#!/usr/bin/env python3
"""Шаг 4. Сколько воркеров реально тянет машина.

Меряем фазу B (карточки): работа однородная, ~1,9 с на карточку, поэтому
скорость прямо сравнима между конфигурациями. Фаза A для замера не годится -
задачи там от 3 до 231 страницы, разброс съел бы сигнал.

Считаем не по времени работы пула, а по числу карточек, закрытых на устоявшемся
участке: первые WARMUP секунд отбрасываем, там ещё поднимаются браузеры
(старты разнесены на 2 с, при 16 воркерах это полминуты).

Смотрим три вещи:
  * растёт ли скорость линейно с числом воркеров;
  * не начинает ли расти доля неудач (признак, что 2GIS перестаёт успевать);
  * хватает ли машине CPU и памяти.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import sys
import threading
import time
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from venues2gis.config import Config  # noqa: E402
from venues2gis.logging_setup import logger, setup_logging  # noqa: E402
from venues2gis.orchestrator import run_pool  # noqa: E402

WARMUP = 35.0  # секунд на подъём браузеров, в зачёт не идут


class ResourceWatch:
    """Фоновый замер CPU и памяти во время прогона."""

    def __init__(self) -> None:
        self.cpu: list[float] = []
        self.ram_used: list[float] = []
        self.chrome_rss: list[float] = []
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._loop, daemon=True)

    def _loop(self) -> None:
        while not self._stop.is_set():
            self.cpu.append(psutil.cpu_percent(interval=1.0))
            vm = psutil.virtual_memory()
            self.ram_used.append((vm.total - vm.available) / 2 ** 30)
            rss = 0
            for p in psutil.process_iter(["name", "memory_info"]):
                try:
                    if "chrome" in (p.info.get("name") or "").lower():
                        rss += (p.info.get("memory_info").rss if p.info.get("memory_info") else 0)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            self.chrome_rss.append(rss / 2 ** 30)

    def __enter__(self):
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._t.join(timeout=3)

    def summary(self) -> dict:
        def avg(xs):
            return round(statistics.mean(xs), 1) if xs else None

        def mx(xs):
            return round(max(xs), 1) if xs else None

        return {"cpu_сред_%": avg(self.cpu), "cpu_макс_%": mx(self.cpu),
                "ram_занято_ГБ": mx(self.ram_used), "chrome_ГБ": mx(self.chrome_rss)}


def db_counts(db: Path) -> dict:
    c = sqlite3.connect(str(db))
    try:
        out = {}
        for st, n in c.execute("SELECT status, COUNT(*) FROM firms GROUP BY status"):
            out[st] = n
        return out
    finally:
        c.close()


def done_between(db: Path, t_from: str, t_to: str) -> int:
    """Сколько заведений закрыто в заданном окне времени."""
    c = sqlite3.connect(str(db))
    try:
        return c.execute(
            "SELECT COUNT(*) FROM firms WHERE status='done' AND updated_at > ? "
            "AND updated_at <= ?", (t_from, t_to)).fetchone()[0]
    finally:
        c.close()


def reset_running(db: Path) -> None:
    c = sqlite3.connect(str(db))
    try:
        c.execute("UPDATE firms SET status='pending' WHERE status='running'")
        c.commit()
    finally:
        c.close()


def utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def bench(cfg: Config, config_path: Path, workers: int, seconds: float) -> dict:
    db = Path(cfg.paths.db_path)
    reset_running(db)
    before = db_counts(db)
    pending = before.get("pending", 0)
    if pending < workers * 15:
        logger.warning("В очереди всего %d заведений - для %d воркеров маловато",
                       pending, workers)

    t_start = utcnow()
    t0 = time.monotonic()
    with ResourceWatch() as watch:
        run_pool(cfg, workers, config_path, max_seconds=seconds)
        elapsed = time.monotonic() - t0
        res = watch.summary()
    t_end = utcnow()
    reset_running(db)
    after = db_counts(db)

    # Устоявшийся участок: отбрасываем время подъёма браузеров.
    from datetime import datetime, timedelta
    warm_from = (datetime.fromisoformat(t_start) + timedelta(seconds=WARMUP)).isoformat(
        timespec="seconds")
    steady_done = done_between(db, warm_from, t_end)
    steady_seconds = max(1.0, elapsed - WARMUP)

    total_done = after.get("done", 0) - before.get("done", 0)
    failed = after.get("failed", 0) - before.get("failed", 0)
    speed = steady_done / steady_seconds
    return {
        "воркеров": workers,
        "секунд": round(elapsed, 1),
        "карточек_всего": total_done,
        "карточек_устоявш": steady_done,
        "карточек_в_сек": round(speed, 2),
        "на_воркера_в_сек": round(speed / workers, 3),
        "сек_на_карточку": round(workers / speed, 2) if speed else None,
        "неудач": failed,
        "доля_неудач_%": round(100 * failed / max(1, total_done + failed), 1),
        **res,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--workers", default="2,4,6,8",
                    help="через запятую, например 2,4,6,8")
    ap.add_argument("--seconds", type=float, default=110.0)
    ap.add_argument("--out", default="data/recon/bench_workers.json")
    args = ap.parse_args()

    setup_logging(ROOT / "logs", name="bench")
    config_path = Path(args.config)
    cfg = Config.load(config_path).resolve(ROOT)
    counts = db_counts(Path(cfg.paths.db_path))
    logger.info("Очередь заведений перед замером: %s", counts)

    results = []
    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for w in [int(x) for x in args.workers.split(",")]:
        left = db_counts(Path(cfg.paths.db_path)).get("pending", 0)
        if left < w * 10:
            logger.warning("Осталось %d заведений - замер на %d воркерах пропущен", left, w)
            break
        logger.info("=== замер: %d воркеров, %.0f с ===", w, args.seconds)
        row = bench(cfg, config_path, w, args.seconds)
        results.append(row)
        logger.info("%s", json.dumps(row, ensure_ascii=False))
        out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2),
                            encoding="utf-8")
        time.sleep(5)

    if results:
        base = results[0]["на_воркера_в_сек"] or 1
        logger.info("--- итог ---")
        logger.info("%-9s %-11s %-13s %-11s %-9s %-8s %s", "воркеров", "карт/сек",
                    "на воркера", "эффект-ть", "неудач%", "cpu%", "chrome ГБ")
        for r in results:
            eff = round(100 * (r["на_воркера_в_сек"] or 0) / base)
            logger.info("%-9d %-11.2f %-13.3f %-11s %-9s %-8s %s",
                        r["воркеров"], r["карточек_в_сек"], r["на_воркера_в_сек"],
                        f"{eff}%", r["доля_неудач_%"], r["cpu_сред_%"], r["chrome_ГБ"])
    logger.info("Файл: %s", out_path)


if __name__ == "__main__":
    main()
