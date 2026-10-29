"""Проверка машины перед прогоном: чего не хватает и сколько воркеров поднимать.

Число воркеров - главный параметр прогона, и подбирать его вручную не нужно:
упирается всё в CPU и оперативную память, а не в антибот 2GIS (за все замеры
он не сработал ни разу). Замер на 8 ядрах / 32 ГБ (tools/bench_workers.py):

    2 воркера -> 0,78 карточек/с    8  -> 2,07
    4         -> 1,23               12 -> 2,05
    6         -> 1,66               16 -> 1,95

То есть скорость упирается в число физических ядер, а дальше идёт плато и спад
из-за конкуренции за CPU. Отсюда правило: воркеров не больше, чем физических
ядер, и не больше, чем позволяет память (каждое окно Chrome ест ~1,2 ГБ).
"""
from __future__ import annotations

import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Chrome с заблокированными картинками под нагрузкой держит примерно столько.
RAM_PER_WORKER_GB = 1.2
# Сколько памяти оставляем системе и всему остальному.
RAM_RESERVE_GB = 4.0
# Больше 12 окон смысла не имеет ни на какой машине: упирается в сеть и диск.
MAX_WORKERS = 12
# Сырые данные плюс профили браузера на один регион масштаба Алматы.
DISK_NEEDED_GB = 10.0

REQUIRED_PACKAGES = [
    ("playwright", "playwright"),
    ("pydantic", "pydantic"),
    ("yaml", "PyYAML"),
    ("psutil", "psutil"),
    ("rapidfuzz", "rapidfuzz"),
    ("openpyxl", "openpyxl"),
]

OK, WARN, FAIL = "OK", "ВНИМАНИЕ", "ОШИБКА"


@dataclass
class Check:
    name: str
    status: str
    detail: str


def _python_check() -> Check:
    v = sys.version_info
    text = f"{v.major}.{v.minor}.{v.micro} ({platform.python_implementation()})"
    if v < (3, 10):
        return Check("Python", FAIL, f"{text} - нужен 3.10 или новее")
    return Check("Python", OK, text)


def _packages_check() -> list[Check]:
    out = []
    for module, package in REQUIRED_PACKAGES:
        if importlib.util.find_spec(module) is None:
            out.append(Check(f"Пакет {package}", FAIL,
                             "не установлен - выполните: pip install -r requirements.txt"))
        else:
            out.append(Check(f"Пакет {package}", OK, "установлен"))
    return out


def _browser_version(binary: str) -> str:
    """Версия браузера.

    На Windows chrome.exe --version ничего не печатает, а если браузер уже запущен,
    то ещё и отвечает служебным сообщением про открытие вкладки. Поэтому там сразу
    смотрим свойства файла, а --version оставляем для macOS и Linux.
    """
    if os.name == "nt":
        try:
            cmd = "(Get-Item \"" + binary + "\").VersionInfo.ProductVersion"
            res = subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                                 capture_output=True, text=True, timeout=25)
            version = (res.stdout or "").strip()
            if version:
                return "версия " + version
        except (OSError, subprocess.SubprocessError):
            pass
    else:
        try:
            res = subprocess.run([binary, "--version"], capture_output=True,
                                 text=True, timeout=15)
            lines = (res.stdout or res.stderr or "").strip().splitlines()
            if lines and lines[0].strip():
                return lines[0].strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return "версию определить не удалось"


def _browser_check(explicit: Optional[str] = None) -> Check:
    from .browser import find_browser_binary
    try:
        binary = find_browser_binary(explicit)
    except FileNotFoundError as e:
        return Check("Браузер", FAIL, str(e))
    return Check("Браузер", OK, f"{binary} - {_browser_version(binary)}")


def hardware() -> tuple[int, int, float, float]:
    """Возвращает (физические ядра, логические, всего ГБ ОЗУ, свободно ГБ ОЗУ)."""
    import psutil
    physical = psutil.cpu_count(logical=False) or 0
    logical = psutil.cpu_count(logical=True) or 1
    if not physical:
        # На части виртуальных машин физические ядра не определяются.
        physical = max(1, logical // 2)
    mem = psutil.virtual_memory()
    return physical, logical, mem.total / 1024 ** 3, mem.available / 1024 ** 3


def recommend_workers(physical: int, ram_total_gb: float) -> tuple[int, str]:
    """Сколько окон браузера поднимать на этой машине."""
    by_cpu = max(1, physical)
    by_ram = max(1, int((ram_total_gb - RAM_RESERVE_GB) / RAM_PER_WORKER_GB))
    workers = max(1, min(by_cpu, by_ram, MAX_WORKERS))
    if by_ram < by_cpu:
        why = (f"ограничение по памяти: {ram_total_gb:.0f} ГБ минус {RAM_RESERVE_GB:.0f} ГБ "
               f"системе, по {RAM_PER_WORKER_GB} ГБ на окно")
    elif by_cpu >= MAX_WORKERS:
        why = f"потолок {MAX_WORKERS}: дальше упирается в сеть и диск, а не в процессор"
    else:
        why = f"по числу физических ядер ({physical}) - на них скорость выходит на плато"
    return workers, why


def _disk_check(root: Path) -> Check:
    try:
        free_gb = shutil.disk_usage(root).free / 1024 ** 3
    except OSError as e:
        return Check("Место на диске", WARN, f"не удалось проверить: {e}")
    if free_gb < DISK_NEEDED_GB:
        return Check("Место на диске", WARN,
                     f"свободно {free_gb:.1f} ГБ, желательно от {DISK_NEEDED_GB:.0f} ГБ "
                     "(сырые данные плюс профили браузера)")
    return Check("Место на диске", OK, f"свободно {free_gb:.1f} ГБ")


def _write_check(root: Path) -> Check:
    probe = root / "data" / ".write-test"
    try:
        probe.parent.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as e:
        return Check("Запись в папку проекта", FAIL, f"нет прав на запись: {e}")
    return Check("Запись в папку проекта", OK, str(root))


def _network_check() -> Check:
    """Важно не содержимое ответа, а что хост 2GIS вообще отвечает с этой машины."""
    import socket
    try:
        with socket.create_connection(("2gis.kz", 443), timeout=10):
            return Check("Сеть до 2gis.kz", OK, "соединение устанавливается")
    except OSError as e:
        return Check("Сеть до 2gis.kz", FAIL,
                     f"нет соединения ({e}). Проверьте интернет, VPN или прокси")


def collect_checks(root: Path, binary_path: Optional[str] = None) -> list[Check]:
    checks: list[Check] = [_python_check()]
    checks += _packages_check()
    if not any(c.status == FAIL and c.name.startswith("Пакет") for c in checks):
        checks.append(_browser_check(binary_path))
    checks.append(_write_check(root))
    checks.append(_disk_check(root))
    checks.append(_network_check())
    return checks


def run_doctor(root: Path, binary_path: Optional[str] = None,
               configured_workers: Optional[int] = None) -> int:
    """Печатает отчёт о готовности машины. Возвращает 0, если можно запускать."""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    checks = collect_checks(root, binary_path)

    print("=" * 70)
    print(f"  Проверка машины: {platform.system()} {platform.release()} ({platform.machine()})")
    print("=" * 70)
    for c in checks:
        mark = {OK: "  [ ok ] ", WARN: "  [ !! ] ", FAIL: "  [ХХХХ] "}[c.status]
        print(f"{mark}{c.name}: {c.detail}")

    if any(c.status == FAIL and c.name.startswith("Пакет") for c in checks):
        print("\n  Сначала установите зависимости:  pip install -r requirements.txt")
        return 1

    physical, logical, ram_total, ram_free = hardware()
    workers, why = recommend_workers(physical, ram_total)
    print("-" * 70)
    print(f"  Процессор: {physical} физических ядер / {logical} потоков")
    print(f"  Память: {ram_total:.1f} ГБ всего, {ram_free:.1f} ГБ свободно сейчас")
    print("-" * 70)
    print(f"  РЕКОМЕНДУЕМОЕ ЧИСЛО ОКОН (воркеров): {workers}")
    print(f"  Почему: {why}")
    if configured_workers and configured_workers != workers:
        print(f"  В config.yaml сейчас стоит {configured_workers}. "
              f"Запуск с рекомендуемым: python run.py collect --workers {workers}")
    if ram_free < workers * RAM_PER_WORKER_GB:
        print(f"  ВНИМАНИЕ: свободной памяти сейчас {ram_free:.1f} ГБ - "
              "закройте лишние программы или возьмите меньше окон.")
    print("-" * 70)

    if any(c.status == FAIL for c in checks):
        print("  Запускать пока нельзя - исправьте пункты, отмеченные ХХХХ.")
        return 1
    print("  Всё готово. Дальше:  python start.py")
    print("=" * 70)
    return 0
