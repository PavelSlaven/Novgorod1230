import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile


ARCHIVE = {
    "dir": "cdda-experimental-2026-10-18-0359/graphics",
    "name": "cdda-linux-with-graphics-x64-2026-10-18-0359.tar.gz",
    "url": "https://github.com/CleverRaven/Cataclysm-DDA/releases/download/"
           "cdda-experimental-2026-10-18-0359/cdda-linux-with-graphics-x64-2026-10-18-0359.tar.gz",
    "sha256": "06304efcdb41d4664c37683f0b2818bf19bc1731a41f8d845ec211626b426ab8",
}
TRANSLATION = "lang/mo/ru/LC_MESSAGES/cataclysm-dda.mo"
TILESET = "gfx/UltimateCataclysm"
# keycode: under a Russian layout keychar delivers Cyrillic letters that miss every hotkey binding,
# while text prompts such as F12 switch to text input themselves and still receive Cyrillic.
OPTIONS = {"USE_LANG": "ru", "USE_TILES": "true", "TILES": "UltimateCataclysm",
           "SDL_KEYBOARD_MODE": "keycode", "USE_METRIC_WEIGHTS": "kg",
           "VOLUME_UNITS": "l", "USE_METRIC_SPEEDS": "km/h",
           "DISTANCE_UNITS": "metric", "USE_CELSIUS": "celsius", "24_HOUR": "24h"}
MOD = Path(__file__).with_name("dev-world")


def verified_archive(assets):
    path = assets / ARCHIVE["dir"] / ARCHIVE["name"]
    if not path.is_file():
        raise SystemExit(f"Нет архива {path}. Скачайте его в новый пустой каталог:\n"
                         f"mkdir -p '{path.parent}' && curl -fL -o '{path}' '{ARCHIVE['url']}'\n"
                         f"Ожидаемый sha256: {ARCHIVE['sha256']}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    if digest.hexdigest() != ARCHIVE["sha256"]:
        raise SystemExit(f"sha256 архива {path} не совпадает с закреплённым {ARCHIVE['sha256']}.")
    return path


def wanted_members(archive):
    members = archive.getmembers()
    prefixes = {m.name[:-len(TRANSLATION)] for m in members
                if m.name == TRANSLATION or m.name.endswith("/" + TRANSLATION)}
    if len(prefixes) != 1:
        raise SystemExit(f"В архиве нет единственного {TRANSLATION}.")
    prefix = prefixes.pop()
    wanted = [m for m in members if m.name == prefix + TRANSLATION
              or m.name == prefix + TILESET or m.name.startswith(prefix + TILESET + "/")]
    for member in wanted:
        if not (member.isfile() or member.isdir()) or ".." in PurePosixPath(member.name).parts:
            raise SystemExit(f"Недопустимый элемент архива: {member.name}")
    if not any(m.isfile() and m.name.startswith(prefix + TILESET + "/") for m in wanted):
        raise SystemExit(f"В архиве нет тайлсета {TILESET}.")
    return prefix, wanted


def set_options(path):
    entries = json.loads(path.read_text())
    present = {entry.get("name") for entry in entries}
    entries = [dict(entry, value=OPTIONS[entry["name"]]) if entry.get("name") in OPTIONS else entry
               for entry in entries]
    entries += [{"name": name, "value": value} for name, value in OPTIONS.items() if name not in present]
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")


def check_build(build):
    cache = build / "CMakeCache.txt"
    lines = cache.read_text().splitlines() if cache.is_file() else []
    for required in ("CMAKE_BUILD_TYPE:STRING=Release", "USE_PREFIX_DATA_DIR:BOOL=OFF"):
        if required not in lines:
            raise SystemExit(f"Сборка {build}: в {cache} нет строки {required}.")


def take_session_lock(root):
    root.mkdir(parents=True, exist_ok=True)
    (root / "run").mkdir(exist_ok=True)
    lock = (root / "run/session.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        raise SystemExit("Этот dev-мир запущен: run/session.lock занят; runtime не изменён.")
    return lock


def build_runtime(staging, args, archive, prefix, members):
    for build in filter(None, (args.text_build, args.tiles_build)):
        subprocess.run(["cmake", "--install", str(build), "--prefix", str(staging)], check=True)
    with tempfile.TemporaryDirectory(prefix="novgorod-assets-") as extracted:
        archive.extractall(extracted, members=members, filter="data")
        (staging / TRANSLATION).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(Path(extracted, prefix, TRANSLATION), staging / TRANSLATION)
        shutil.copytree(MOD, staging / "data/mods/novgorod_dev_world")
        shutil.copytree(Path(extracted, prefix, TILESET), staging / TILESET, dirs_exist_ok=True)
    shutil.copytree(staging / "gfx", staging / "data/gfx", dirs_exist_ok=True)


def swap_runtime(root, staging):
    runtime = root / "runtime"
    if not runtime.exists():
        os.rename(staging, runtime)
        return
    # A running game reads runtime, and a half-built runtime must never become visible.
    old = root / f"runtime.old-{os.getpid()}"
    os.rename(runtime, old)
    try:
        os.rename(staging, runtime)
    except BaseException:
        os.rename(old, runtime)
        shutil.rmtree(staging, ignore_errors=True)
        raise
    shutil.rmtree(old)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Готовит runtime root для run-p3-dev: "
                                     "cmake --install, мод, официальный перевод и тайлсет, опции fixture.")
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True, help="исходник CDDA с патчами прототипа")
    parser.add_argument("--assets-dir", type=Path, default=Path.home() / "cdda-assets")
    parser.add_argument("--text-build", type=Path, help="каталог сборки CMake текстовой версии")
    parser.add_argument("--tiles-build", type=Path, help="каталог сборки CMake версии с тайлами")
    parser.add_argument("--fixture", type=Path, help="каталог с save/ и config/ для нового runtime root")
    args = parser.parse_args(argv)
    if not (args.text_build or args.tiles_build):
        raise SystemExit("Нужен хотя бы один из ключей --text-build и --tiles-build.")
    root = args.runtime_root
    fixture = root / "fixture"
    if args.fixture and fixture.exists():
        raise SystemExit(f"{fixture} уже есть; прежний fixture не заменяется.")
    seed = args.fixture or fixture
    if not (seed / "save").is_dir() or not (seed / "config/options.json").is_file():
        raise SystemExit(f"Нужен fixture с save/ и config/options.json: {seed}")
    for directory in (args.source / "data", args.source / "gfx"):
        if not directory.is_dir():
            raise SystemExit(f"Нет каталога исходника {directory}")
    for build in filter(None, (args.text_build, args.tiles_build)):
        check_build(build)
    with tarfile.open(verified_archive(args.assets_dir)) as archive:
        prefix, members = wanted_members(archive)
        lock = take_session_lock(root)
        try:
            help_dir = args.source / "data/help"
            if not help_dir.exists():
                help_dir.mkdir()
                print(f"Создан пустой {help_dir}: его перечисляет data/CMakeLists.txt CDDA, "
                      "без него cmake --install падает.")
            staging = Path(tempfile.mkdtemp(prefix="runtime.new-", dir=root))
            try:
                build_runtime(staging, args, archive, prefix, members)
            except BaseException:
                shutil.rmtree(staging, ignore_errors=True)
                raise
            swap_runtime(root, staging)
            if args.fixture:
                shutil.copytree(args.fixture / "save", fixture / "save")
                shutil.copytree(args.fixture / "config", fixture / "config")
            set_options(fixture / "config/options.json")
        finally:
            lock.close()


if __name__ == "__main__":
    main()
