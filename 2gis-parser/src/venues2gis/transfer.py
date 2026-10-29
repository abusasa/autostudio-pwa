"""Передача результатов между машинами: упаковать своё, влить чужое.

Регионы собираются параллельно на разных компьютерах, поэтому нужен способ
свести результаты в одну базу. Сводится всё через сырые JSONL: они append-only
и самодостаточны - выгрузка (`run.py export`) целиком строится из них.

State-база переносится вместе с ними, но только как дополнение: из неё берутся
реестр увиденных карточек и журнал задач, чтобы в отчёте о покрытии было видно,
кто что уже прошёл. Конфликтующие строки игнорируются, ничего не перетирается.
"""
from __future__ import annotations

import json
import platform
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .logging_setup import logger

MANIFEST_NAME = "manifest.json"


def _regions_in_db(db_path: Path) -> list[str]:
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT region, COUNT(*) FROM tasks WHERE status='done' GROUP BY region"
            ).fetchall()
            return [r[0] for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _stats(db_path: Path) -> dict:
    if not db_path.exists():
        return {}
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            out = {}
            for table in ("tasks", "firms"):
                rows = conn.execute(
                    f"SELECT status, COUNT(*) FROM {table} GROUP BY status"  # noqa: S608
                ).fetchall()
                out[table] = {r[0]: r[1] for r in rows}
            out["seen"] = conn.execute("SELECT COUNT(*) FROM seen").fetchone()[0]
            return out
        finally:
            conn.close()
    except sqlite3.Error:
        return {}


def pack(raw_dir: Path, db_path: Path, out_dir: Path, dest: Optional[Path] = None,
         author: str = "") -> Path:
    """Складывает результаты этой машины в один zip - его и отправляют координатору."""
    raw_dir, db_path, out_dir = Path(raw_dir), Path(db_path), Path(out_dir)
    raw_files = sorted(raw_dir.glob("*.jsonl"))
    if not raw_files:
        raise FileNotFoundError(
            f"В {raw_dir} нет ни одного .jsonl - собирать нечего. "
            "Сначала выполните: python run.py collect --region <код>"
        )

    regions = _regions_in_db(db_path)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    tag = "-".join(regions[:3]) if regions else "data"
    if dest is None:
        dest = Path.cwd() / f"2gis-{tag}-{stamp}.zip"
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "author": author or platform.node(),
        "machine": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "regions": regions,
        "raw_files": [f.name for f in raw_files],
        "raw_bytes": sum(f.stat().st_size for f in raw_files),
        "stats": _stats(db_path),
    }

    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr(MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2))
        for f in raw_files:
            z.write(f, f"raw/{f.name}")
        if db_path.exists():
            z.write(db_path, "state.sqlite")
        for name in ("report.md", "summary.md"):
            candidate = out_dir / name
            if candidate.exists():
                z.write(candidate, f"out/{name}")

    size_mb = dest.stat().st_size / 1024 ** 2
    logger.info("Архив собран: %s (%.1f МБ, регионы: %s)", dest, size_mb,
                ", ".join(regions) or "не определены")
    return dest


def _merge_db(target_db: Path, source_db: Path) -> dict:
    """Вливает чужие seen/tasks/firms в свою базу, ничего не перетирая."""
    conn = sqlite3.connect(target_db, timeout=60.0)
    added = {}
    try:
        conn.execute("PRAGMA busy_timeout=60000")
        conn.execute("ATTACH DATABASE ? AS src", (str(source_db),))
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM src.sqlite_master WHERE type='table'")}
        for table in ("seen", "tasks", "firms"):
            if table not in tables:
                continue
            before = conn.execute(f"SELECT COUNT(*) FROM main.{table}").fetchone()[0]  # noqa: S608
            # Колонки берём по пересечению: у донора может быть старая схема.
            target_cols = [r[1] for r in conn.execute(f"PRAGMA main.table_info({table})")]
            source_cols = {r[1] for r in conn.execute(f"PRAGMA src.table_info({table})")}
            shared = [c for c in target_cols if c in source_cols and c != "id"]
            if not shared:
                continue
            cols = ", ".join(shared)
            conn.execute(
                f"INSERT OR IGNORE INTO main.{table} ({cols}) SELECT {cols} FROM src.{table}"  # noqa: S608,E501
            )
            after = conn.execute(f"SELECT COUNT(*) FROM main.{table}").fetchone()[0]  # noqa: S608
            added[table] = after - before
        conn.commit()
    finally:
        try:
            conn.execute("DETACH DATABASE src")
        except sqlite3.Error:
            pass
        conn.close()
    return added


def merge(sources: Iterable[Path], raw_dir: Path, db_path: Path) -> dict:
    """Принимает zip-архивы (или распакованные папки) от коллег и вливает их сюда."""
    raw_dir, db_path = Path(raw_dir), Path(db_path)
    raw_dir.mkdir(parents=True, exist_ok=True)
    summary = {"архивов": 0, "файлов_сырых": 0, "мегабайт": 0.0, "база": {}, "регионы": []}
    temp_root = raw_dir.parent / ".merge-tmp"

    for src in sources:
        src = Path(src)
        if not src.exists():
            logger.warning("Пропущено, нет такого пути: %s", src)
            continue

        if src.is_file() and src.suffix.lower() == ".zip":
            work = temp_root / src.stem
            if work.exists():
                shutil.rmtree(work, ignore_errors=True)
            work.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(src) as z:
                z.extractall(work)
            donor = src.stem
        elif src.is_dir():
            work, donor = src, src.name
        else:
            logger.warning("Пропущено, это не zip и не папка: %s", src)
            continue

        manifest_path = work / MANIFEST_NAME
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                summary["регионы"] += manifest.get("regions") or []
                logger.info("Архив от %s, регионы: %s", manifest.get("author", "?"),
                            ", ".join(manifest.get("regions") or []) or "не указаны")
            except json.JSONDecodeError:
                pass

        # Имена вида almaty.w0.jsonl совпадают у всех - префиксуем донором.
        found = sorted((work / "raw").glob("*.jsonl")) or sorted(work.glob("*.jsonl"))
        for f in found:
            target = raw_dir / f"{donor}__{f.name}"
            if target.exists() and target.stat().st_size == f.stat().st_size:
                logger.info("Уже влит, пропуск: %s", target.name)
                continue
            shutil.copy2(f, target)
            summary["файлов_сырых"] += 1
            summary["мегабайт"] += f.stat().st_size / 1024 ** 2

        donor_db = work / "state.sqlite"
        if donor_db.exists() and db_path.exists():
            added = _merge_db(db_path, donor_db)
            for k, v in added.items():
                summary["база"][k] = summary["база"].get(k, 0) + v
        summary["архивов"] += 1

    shutil.rmtree(temp_root, ignore_errors=True)
    summary["мегабайт"] = round(summary["мегабайт"], 1)
    summary["регионы"] = sorted(set(summary["регионы"]))
    logger.info("Влито: %s", summary)
    return summary
