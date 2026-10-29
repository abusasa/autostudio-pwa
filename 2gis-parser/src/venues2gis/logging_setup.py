"""Настройка логирования: консоль + ротируемый файл."""
from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

logger = logging.getLogger("venues2gis")

_FMT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"


def setup_logging(log_dir: Path, level: int = logging.INFO, name: str = "run") -> logging.Logger:
    log_dir.mkdir(parents=True, exist_ok=True)
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    # Консоль Windows по умолчанию не в UTF-8: без этого русские сообщения
    # роняют вывод с UnicodeEncodeError. На macOS/Linux вызов безвреден.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(level)
    console.setFormatter(logging.Formatter(_FMT, datefmt="%H:%M:%S"))
    logger.addHandler(console)

    file_handler = RotatingFileHandler(
        log_dir / f"{name}.log", maxBytes=20 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(_FMT))
    logger.addHandler(file_handler)

    # Playwright очень болтлив на DEBUG - глушим.
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    return logger
