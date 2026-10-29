"""Конфигурация пайплайна."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

from .queries import DEFAULT_LAYERS
from .rubrics import DEFAULT_RUBRIC_SETS


class BrowserConfig(BaseModel):
    binary_path: Optional[str] = None
    headless: bool = False
    profile_dir: str = ".chrome-profile"
    block_resources: bool = True
    window_size: str = "1400,1000"
    # Перезапуск браузера каждые N задач - лечит утечки памяти на длинных прогонах.
    restart_every_tasks: int = 25


class CollectConfig(BaseModel):
    country: str = "kz"
    layers: list[str] = Field(default_factory=lambda: list(DEFAULT_LAYERS))
    regions: Optional[list[str]] = None  # None = все регионы страны
    # Наборы рубрик каталога: core (заведомо площадки), food (общепит и жильё).
    # Рубрики дают гарантированное покрытие, слои layers - добор расширенных.
    rubric_sets: list[str] = Field(default_factory=lambda: list(DEFAULT_RUBRIC_SETS))
    # Свой список ID рубрик 2GIS. Задан - полностью заменяет rubric_sets.
    # Так проект переводится на любую другую тему без правки кода.
    rubrics: Optional[list[str]] = None
    # Свой список поисковых слов. Задан - полностью заменяет layers.
    queries: Optional[list[str]] = None
    # Сколько параллельных воркеров поднимать. Упирается не в память, а в CPU
    # и в терпение антибота, поэтому наращивать стоит ступенями с замером.
    workers: int = 1
    # Сколько заведений воркер забирает из очереди за раз (фаза B).
    firm_batch: int = 25
    # Потолка у 2GIS нет (проверено: 210 страниц на "Кафе"), лимит нужен лишь
    # как страховка от бесконечного цикла.
    max_pages_per_task: int = 500
    max_cards_per_task: int = 6000
    click_delay_ms: tuple[int, int] = (350, 850)
    page_delay_ms: tuple[int, int] = (400, 900)
    card_response_timeout_ms: int = 12_000
    # Сколько карточек подряд без данных терпим перед перезагрузкой выдачи.
    max_consecutive_misses: int = 4
    nav_timeout_ms: int = 60_000
    max_attempts: int = 3
    # Пауза, если 2GIS показал антибот-страницу.
    antibot_pause_s: int = 60
    antibot_max_hits: int = 10


class PathsConfig(BaseModel):
    data_dir: str = "data"
    raw_dir: str = "data/raw"
    db_path: str = "data/state.sqlite"
    regions_cache: str = "data/regions.json"
    out_dir: str = "out"
    log_dir: str = "logs"


class Config(BaseModel):
    browser: BrowserConfig = Field(default_factory=BrowserConfig)
    collect: CollectConfig = Field(default_factory=CollectConfig)
    paths: PathsConfig = Field(default_factory=PathsConfig)

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Config":
        if path is None or not Path(path).exists():
            return cls()
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        return cls.model_validate(data)

    def resolve(self, root: Path) -> "Config":
        """Делает пути абсолютными относительно корня проекта."""
        p = self.paths
        for field in ("data_dir", "raw_dir", "db_path", "regions_cache", "out_dir", "log_dir"):
            value = getattr(p, field)
            if not Path(value).is_absolute():
                setattr(p, field, str(root / value))
        if not Path(self.browser.profile_dir).is_absolute():
            self.browser.profile_dir = str(root / self.browser.profile_dir)
        return self
