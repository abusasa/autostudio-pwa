"""Состояние прогона: очередь задач, реестр увиденных карточек, сырые ответы.

Два хранилища:
  * SQLite - задачи и дедуп-реестр (переживает перезапуск);
  * JSONL   - сырые ответы API, append-only, ничего не теряем и не переписываем.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

from .logging_setup import logger

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    region       TEXT NOT NULL,
    domain       TEXT NOT NULL,
    query        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',   -- pending|running|done|failed|empty
    pages_done   INTEGER NOT NULL DEFAULT 0,
    cards_seen   INTEGER NOT NULL DEFAULT 0,
    cards_new    INTEGER NOT NULL DEFAULT 0,
    attempts     INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    reported_total INTEGER,
    updated_at   TEXT,
    UNIQUE (region, query)
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS seen (
    branch_id    TEXT PRIMARY KEY,
    firm_id      TEXT,
    region       TEXT,
    first_query  TEXT,
    queries      TEXT,          -- JSON-массив всех запросов, по которым нашли
    has_phone    INTEGER DEFAULT 0,
    collected_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_seen_firm ON seen(firm_id);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Очередь второй фазы: заведения, найденные при обходе, но ещё не открытые.
-- Обход (фаза A) только складывает сюда firm_id, карточки берёт фаза B.
-- Так каждое заведение открывается ровно один раз за весь прогон, сколько бы
-- рубрик и запросов его ни нашло.
CREATE TABLE IF NOT EXISTS firms (
    firm_id      TEXT PRIMARY KEY,
    region       TEXT NOT NULL,
    domain       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
    found_by     TEXT,          -- первый источник: rubric:10803 или слово запроса
    attempts     INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_firms_status ON firms(status, region);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, db_path: Path, raw_dir: Path, worker: str = "") -> None:
        self.db_path = Path(db_path)
        self.raw_dir = Path(raw_dir)
        # Метка воркера: у каждого процесса свой файл сырых данных, иначе
        # параллельная дозапись в один JSONL перемешает строки.
        self.worker = worker
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        # isolation_level=None: транзакциями управляем сами, чтобы захват задачи
        # шёл через BEGIN IMMEDIATE - иначе два процесса выберут одну и ту же.
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False,
                                     timeout=30.0, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        # Без этого конкурирующая запись падает с 'database is locked' сразу.
        self._conn.execute("PRAGMA busy_timeout=30000")
        self._conn.executescript(SCHEMA)
        self._migrate()
        self._raw_files: dict[str, Any] = {}

    def _migrate(self) -> None:
        """Добавляет колонки, появившиеся после создания старых баз."""
        existing = {r[1] for r in self._conn.execute("PRAGMA table_info(tasks)")}
        if "reported_total" not in existing:
            self._conn.execute("ALTER TABLE tasks ADD COLUMN reported_total INTEGER")
        if "kind" not in existing:
            # rubric | query - чтобы в отчётах было видно, чем именно нашли.
            self._conn.execute("ALTER TABLE tasks ADD COLUMN kind TEXT DEFAULT 'query'")

    def close(self) -> None:
        with self._lock:
            for f in self._raw_files.values():
                try:
                    f.close()
                except Exception:  # noqa: BLE001
                    pass
            self._raw_files.clear()
            self._conn.commit()
            self._conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    @contextmanager
    def _tx(self, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        """Транзакция. immediate=True берёт блокировку записи сразу.

        Это важно для захвата задачи: при обычном BEGIN sqlite читает вне
        транзакции, и два процесса успевают выбрать одну и ту же строку до
        того, как первый её пометит.
        """
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            try:
                yield self._conn
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    # --- задачи ---------------------------------------------------------

    def enqueue_tasks(self, tasks: Iterable[tuple[str, str, str]]) -> int:
        """tasks: (region, domain, query). Уже существующие не трогаем."""
        added = 0
        with self._tx() as conn:
            for region, domain, query in tasks:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO tasks (region, domain, query, updated_at) "
                    "VALUES (?, ?, ?, ?)",
                    (region, domain, query, utcnow()),
                )
                added += cur.rowcount
        if added:
            logger.info("Добавлено новых задач: %d", added)
        return added

    def next_task(self, max_attempts: int = 3) -> Optional[sqlite3.Row]:
        """Забирает следующую задачу и помечает её running (атомарно)."""
        with self._tx(immediate=True) as conn:
            row = conn.execute(
                "SELECT * FROM tasks "
                "WHERE status = 'pending' OR (status = 'failed' AND attempts < ?) "
                "ORDER BY (status = 'failed'), id LIMIT 1",
                (max_attempts,),
            ).fetchone()
            if row is None:
                return None
            conn.execute(
                "UPDATE tasks SET status='running', attempts=attempts+1, updated_at=? WHERE id=?",
                (utcnow(), row["id"]),
            )
            return row

    def finish_task(
        self,
        task_id: int,
        status: str,
        pages_done: int = 0,
        cards_seen: int = 0,
        cards_new: int = 0,
        error: Optional[str] = None,
        reported_total: Optional[int] = None,
    ) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE tasks SET status=?, pages_done=?, cards_seen=?, cards_new=?, "
                "error=?, reported_total=?, updated_at=? WHERE id=?",
                (status, pages_done, cards_seen, cards_new, error, reported_total,
                 utcnow(), task_id),
            )

    def coverage_rows(self) -> list[tuple]:
        """Полнота по задачам: сколько 2GIS обещал против того, что мы просмотрели."""
        with self._lock:
            return [
                tuple(r) for r in self._conn.execute(
                    "SELECT region, query, reported_total, cards_seen, pages_done, status "
                    "FROM tasks WHERE reported_total IS NOT NULL "
                    "ORDER BY (cards_seen * 1.0 / NULLIF(reported_total, 0))"
                )
            ]

    def release_running(self) -> int:
        """После аварийного завершения возвращаем зависшие задачи в очередь."""
        with self._tx() as conn:
            cur = conn.execute(
                "UPDATE tasks SET status='pending', updated_at=? WHERE status='running'",
                (utcnow(),),
            )
        if cur.rowcount:
            logger.info("Возвращено в очередь незавершённых задач: %d", cur.rowcount)
        return cur.rowcount

    def task_stats(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) c FROM tasks GROUP BY status"
            ).fetchall()
        return {r["status"]: r["c"] for r in rows}

    # --- реестр карточек -------------------------------------------------

    def is_seen(self, branch_id: str) -> bool:
        with self._lock:
            return (
                self._conn.execute(
                    "SELECT 1 FROM seen WHERE branch_id=?", (branch_id,)
                ).fetchone()
                is not None
            )

    def seen_ids(self) -> set[str]:
        with self._lock:
            return {r[0] for r in self._conn.execute("SELECT branch_id FROM seen")}

    def mark_seen(
        self, branch_id: str, firm_id: str, region: str, query: str, has_phone: bool
    ) -> bool:
        """Возвращает True, если карточка новая."""
        with self._tx() as conn:
            row = conn.execute(
                "SELECT queries FROM seen WHERE branch_id=?", (branch_id,)
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO seen (branch_id, firm_id, region, first_query, queries, "
                    "has_phone, collected_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        branch_id,
                        firm_id,
                        region,
                        query,
                        json.dumps([query], ensure_ascii=False),
                        int(has_phone),
                        utcnow(),
                    ),
                )
                return True
            queries = json.loads(row["queries"] or "[]")
            if query not in queries:
                queries.append(query)
                conn.execute(
                    "UPDATE seen SET queries=? WHERE branch_id=?",
                    (json.dumps(queries, ensure_ascii=False), branch_id),
                )
            return False

    def firm_seen_ids(self) -> set[str]:
        """Все firm_id, карточки которых уже собраны (для пропуска повторных кликов)."""
        with self._lock:
            return {
                r[0] for r in self._conn.execute("SELECT firm_id FROM seen") if r[0]
            }

    def add_query_to_firm(self, firm_id: str, query: str) -> None:
        """Отмечает, что заведение найдено ещё и этим запросом (без повторного клика)."""
        with self._tx() as conn:
            rows = conn.execute(
                "SELECT branch_id, queries FROM seen WHERE firm_id=?", (firm_id,)
            ).fetchall()
            for row in rows:
                queries = json.loads(row["queries"] or "[]")
                if query in queries:
                    continue
                queries.append(query)
                conn.execute(
                    "UPDATE seen SET queries=? WHERE branch_id=?",
                    (json.dumps(queries, ensure_ascii=False), row["branch_id"]),
                )

    def queries_for(self, branch_id: str) -> list[str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT queries FROM seen WHERE branch_id=?", (branch_id,)
            ).fetchone()
        return json.loads(row["queries"]) if row and row["queries"] else []

    def all_queries_map(self) -> dict[str, list[str]]:
        with self._lock:
            rows = self._conn.execute("SELECT branch_id, queries FROM seen").fetchall()
        return {r["branch_id"]: json.loads(r["queries"] or "[]") for r in rows}

    # --- очередь заведений (фаза B) --------------------------------------

    def enqueue_firms(self, region: str, domain: str, firm_ids: Iterable[str],
                      found_by: str) -> int:
        """Складывает найденные при обходе firm_id. Уже известные не трогает.

        Возвращает число действительно новых - это и есть вклад источника.
        """
        added = 0
        with self._tx() as conn:
            for fid in firm_ids:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO firms (firm_id, region, domain, found_by, "
                    "updated_at) VALUES (?, ?, ?, ?, ?)",
                    (str(fid), region, domain, found_by, utcnow()),
                )
                added += cur.rowcount
        return added

    def next_firms(self, limit: int = 20, max_attempts: int = 3,
                   region: Optional[str] = None) -> list[sqlite3.Row]:
        """Забирает пачку заведений на обработку, помечая их running."""
        where = "(status = 'pending' OR (status = 'failed' AND attempts < ?))"
        params: list[Any] = [max_attempts]
        if region:
            where += " AND region = ?"
            params.append(region)
        with self._tx(immediate=True) as conn:
            rows = conn.execute(
                f"SELECT * FROM firms WHERE {where} ORDER BY (status = 'failed'), rowid "
                f"LIMIT ?", (*params, limit),
            ).fetchall()
            if rows:
                conn.executemany(
                    "UPDATE firms SET status='running', attempts=attempts+1, "
                    "updated_at=? WHERE firm_id=?",
                    [(utcnow(), r["firm_id"]) for r in rows],
                )
            return rows

    def finish_firm(self, firm_id: str, status: str, error: Optional[str] = None) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE firms SET status=?, error=?, updated_at=? WHERE firm_id=?",
                (status, error, utcnow(), firm_id),
            )

    def finish_firms(self, results: Iterable[tuple[str, str, Optional[str]]]) -> None:
        """Пачкой: (firm_id, status, error)."""
        with self._tx() as conn:
            conn.executemany(
                "UPDATE firms SET status=?, error=?, updated_at=? WHERE firm_id=?",
                [(st, err, utcnow(), fid) for fid, st, err in results],
            )

    def firm_stats(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) c FROM firms GROUP BY status"
            ).fetchall()
        return {r["status"]: r["c"] for r in rows}

    def release_running_firms(self) -> int:
        """Возвращает в очередь заведения, зависшие после аварийного выхода."""
        with self._tx() as conn:
            cur = conn.execute(
                "UPDATE firms SET status='pending', updated_at=? WHERE status='running'",
                (utcnow(),),
            )
        if cur.rowcount:
            logger.info("Возвращено в очередь заведений: %d", cur.rowcount)
        return cur.rowcount

    # --- сырые ответы ----------------------------------------------------

    def write_raw(self, region: str, payload: dict[str, Any]) -> None:
        """Дописывает сырой ответ API в JSONL региона.

        При параллельном прогоне у каждого воркера свой файл: дозапись в общий
        из нескольких процессов на Windows перемешивает строки.
        """
        with self._lock:
            f = self._raw_files.get(region)
            if f is None:
                suffix = f".w{self.worker}" if self.worker else ""
                path = self.raw_dir / f"{region}{suffix}.jsonl"
                f = path.open("a", encoding="utf-8")
                self._raw_files[region] = f
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
            f.flush()

    def iter_raw(self) -> Iterator[dict[str, Any]]:
        for path in sorted(self.raw_dir.glob("*.jsonl")):
            with path.open(encoding="utf-8") as f:
                for line_no, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning("Битая строка %s:%d - пропуск", path.name, line_no)
