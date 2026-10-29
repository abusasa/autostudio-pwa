"""Запуск настоящего браузера (Chrome/Edge) с CDP и подключение к нему через Playwright.

Почему именно так, а не playwright.chromium.launch():
launch() поднимает Playwright-сборку Chromium с флагами автоматизации, которые
антибот 2GIS видит. Подключение к обычному браузеру, запущенному с
--remote-debugging-port, ведёт себя как обычный пользовательский браузер.
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import sys
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import psutil
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from .logging_setup import logger

# Ресурсы, которые не нужны для сбора данных.
BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}

# Внешняя аналитика, реклама и тайлы карты - самый жирный бесполезный трафик.
BLOCKED_HOST_MARKERS = (
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "mc.yandex.ru",
    "metrika",
    "facebook.net",
    "criteo",
    "adfox",
    "sentry.io",
    "tile0.maps.2gis.com",
    "tile1.maps.2gis.com",
    "tile2.maps.2gis.com",
    "tile3.maps.2gis.com",
    "tile.maps.2gis.com",
    "styles.api.2gis.io",
)

_BROWSER_CANDIDATES = (
    # --- Windows ---
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    # --- macOS ---
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    # --- Linux ---
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
)


def find_browser_binary(explicit: Optional[str] = None) -> str:
    """Ищет исполняемый файл браузера. Chrome предпочтительнее, Edge - рабочая замена."""
    if explicit:
        if not Path(explicit).exists():
            raise FileNotFoundError(f"Указанный браузер не найден: {explicit}")
        return explicit
    for path in _BROWSER_CANDIDATES:
        if path and Path(path).exists():
            return path
    for name in ("google-chrome", "google-chrome-stable", "chromium",
                 "chromium-browser", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    hint = {
        "nt": r"скачайте с https://www.google.com/chrome/ и установите как обычно",
        "darwin": "скачайте с https://www.google.com/chrome/ и перетащите в /Applications",
    }.get("darwin" if sys.platform == "darwin" else os.name,
          "sudo apt install google-chrome-stable (или chromium)")
    raise FileNotFoundError(
        "Не найден Chrome, Chromium или Edge. " + hint + ". "
        "Если браузер стоит в нестандартном месте - укажите путь "
        "в config.yaml -> browser.binary_path"
    )


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_devtools(port: int, timeout: float = 60.0) -> str:
    """Ждёт, пока CDP-эндпоинт браузера начнёт отвечать."""
    deadline = time.monotonic() + timeout
    url = f"http://127.0.0.1:{port}/json/version"
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                logger.info("Браузер поднят: %s", data.get("Browser", "?"))
                return f"http://127.0.0.1:{port}"
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            last_err = e
            time.sleep(0.4)
    raise TimeoutError(f"CDP-порт {port} не ответил за {timeout} c: {last_err}")


def kill_browsers_using_profile(profile_dir: Path) -> int:
    """Убивает процессы браузера, держащие наш профиль.

    Chrome - single-instance на профиль: если с прошлого прогона остался живой
    процесс, новый запуск просто передаст ему URL и молча завершится, а CDP-порт
    так и не откроется. Playwright-овский browser.close() при connect_over_cdp
    рвёт только соединение, сам браузер остаётся жить.
    """
    needle = str(Path(profile_dir).absolute())
    killed = 0
    for proc in psutil.process_iter(["name", "cmdline"]):
        try:
            name = (proc.info.get("name") or "").lower()
            if not any(b in name for b in ("chrome", "chromium", "msedge")):
                continue
            cmdline = " ".join(proc.info.get("cmdline") or [])
            if needle not in cmdline:
                continue
            proc.kill()
            killed += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    if killed:
        logger.info("Убито процессов браузера, занимавших профиль: %d", killed)
        time.sleep(1.0)
    return killed


@dataclass
class BrowserOptions:
    binary_path: Optional[str] = None
    headless: bool = False
    profile_dir: Path = field(default_factory=lambda: Path(".chrome-profile"))
    block_resources: bool = True
    window_size: str = "1280,900"


class BrowserSession:
    """Владеет процессом браузера и Playwright-подключением к нему."""

    def __init__(self, options: BrowserOptions) -> None:
        self.options = options
        self._proc: Optional[subprocess.Popen] = None
        self._pw = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.port: int = 0

    # --- жизненный цикл -------------------------------------------------

    def start(self) -> "BrowserSession":
        binary = find_browser_binary(self.options.binary_path)
        self.port = _free_port()
        profile = Path(self.options.profile_dir).absolute()
        profile.mkdir(parents=True, exist_ok=True)
        kill_browsers_using_profile(profile)

        args = [
            binary,
            f"--remote-debugging-port={self.port}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-features=Translate,OptimizationHints,MediaRouter",
            "--disable-popup-blocking",
            "--mute-audio",
            f"--window-size={self.options.window_size}",
            "about:blank",
        ]
        if self.options.headless:
            args.insert(1, "--headless=new")

        logger.info("Запуск браузера: %s (CDP-порт %s)", binary, self.port)
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        self._proc = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )

        endpoint = _wait_devtools(self.port)
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.connect_over_cdp(endpoint)
        self.context = (
            self.browser.contexts[0] if self.browser.contexts else self.browser.new_context()
        )
        self.context.set_default_timeout(30_000)
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()

        self._install_xhr_counter()
        if self.options.block_resources:
            self._install_resource_blocking()
        return self

    def stop(self) -> None:
        try:
            if self.browser:
                self.browser.close()
        except Exception as e:  # noqa: BLE001 - закрытие не должно ронять пайплайн
            logger.debug("Ошибка закрытия Playwright-браузера: %s", e)
        try:
            if self._pw:
                self._pw.stop()
        except Exception as e:  # noqa: BLE001
            logger.debug("Ошибка остановки Playwright: %s", e)
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                try:
                    self._proc.kill()
                except Exception:  # noqa: BLE001
                    pass
        # Chrome форкает дочерние процессы; terminate() на лаунчер их не забирает.
        kill_browsers_using_profile(Path(self.options.profile_dir))
        logger.info("Браузер остановлен.")

    def __enter__(self) -> "BrowserSession":
        return self.start()

    def __exit__(self, *exc_info) -> None:
        self.stop()

    # --- настройка страницы ---------------------------------------------

    def _install_resource_blocking(self) -> None:
        def handler(route):
            try:
                request = route.request
                url = request.url
                if request.resource_type in BLOCKED_RESOURCE_TYPES or any(
                    m in url for m in BLOCKED_HOST_MARKERS
                ):
                    route.abort()
                    return
                route.continue_()
            except Exception:  # noqa: BLE001 - гонки при навигации это норма
                pass

        assert self.context is not None
        self.context.route("**/*", handler)
        logger.debug("Блокировка картинок/шрифтов/аналитики/тайлов включена.")

    def _install_xhr_counter(self) -> None:
        """Счётчик незавершённых запросов к 2GIS - приём из parser-2gis."""
        script = r"""
            (function() {
                if (window.__2gisXhrPatched) { return; }
                window.__2gisXhrPatched = true;
                window.openHTTPs = 0;
                var re = /^https?:\/\/[^\/]*2gis\.[a-z]+/i;
                var oldOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    if (re.test(String(url))) {
                        window.openHTTPs++;
                        this.addEventListener('readystatechange', function() {
                            if (this.readyState === 4) { window.openHTTPs--; }
                        }, false);
                    }
                    return oldOpen.apply(this, arguments);
                };
                var oldFetch = window.fetch;
                if (oldFetch) {
                    window.fetch = function(input) {
                        var u = (typeof input === 'string') ? input : ((input && input.url) || '');
                        var tracked = re.test(u);
                        if (tracked) { window.openHTTPs++; }
                        return oldFetch.apply(this, arguments).finally(function() {
                            if (tracked) { window.openHTTPs--; }
                        });
                    };
                }
            })();
        """
        assert self.context is not None
        self.context.add_init_script(script)

    # --- утилиты --------------------------------------------------------

    def wait_network_idle(self, timeout: float = 20.0) -> bool:
        """Ждёт, пока все XHR к 2GIS завершатся."""
        assert self.page is not None
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if self.page.evaluate(
                    "window.openHTTPs === 0 || window.openHTTPs === undefined"
                ):
                    return True
            except Exception:  # noqa: BLE001 - страница могла перезагрузиться
                pass
            time.sleep(0.2)
        return False

    def is_antibot_page(self) -> bool:
        """2GIS редиректит подозрительный трафик на /museum (JS-челлендж)."""
        assert self.page is not None
        try:
            return "/museum" in (self.page.url or "")
        except Exception:  # noqa: BLE001
            return False
