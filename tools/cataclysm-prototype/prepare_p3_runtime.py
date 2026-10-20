import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
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
OPTIONS = {"USE_LANG": "ru", "USE_TILES": "true", "TILES": "UltimateCataclysm"}
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


def main(argv=None):
    parser = argparse.ArgumentParser(description="Готовит runtime root для run-p3-dev: "
                                     "data, мод, бинари, официальный перевод и тайлсет, опции fixture.")
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True, help="исходник CDDA с патчами прототипа")
    parser.add_argument("--assets-dir", type=Path, default=Path.home() / "cdda-assets")
    parser.add_argument("--text-binary", type=Path)
    parser.add_argument("--tiles-binary", type=Path)
    parser.add_argument("--fixture", type=Path, help="каталог с save/ и config/ для нового runtime root")
    args = parser.parse_args(argv)
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
    binaries = {"cataclysm": args.text_binary, "cataclysm-tiles": args.tiles_binary}
    for binary in filter(None, binaries.values()):
        if not (binary.is_file() and os.access(binary, os.X_OK)):
            raise SystemExit(f"Нет исполняемого файла {binary}")
    with tarfile.open(verified_archive(args.assets_dir)) as archive, \
            tempfile.TemporaryDirectory(prefix="novgorod-assets-") as staging:
        prefix, members = wanted_members(archive)
        archive.extractall(staging, members=members, filter="data")
        runtime = root / "runtime"
        runtime.mkdir(parents=True, exist_ok=True)
        data = runtime / "data"
        if data.exists():
            shutil.rmtree(data)
        shutil.copytree(args.source / "data", data)
        for gfx in (runtime / "gfx", data / "gfx"):
            shutil.copytree(args.source / "gfx", gfx, dirs_exist_ok=True)
        shutil.copytree(MOD, data / "mods/novgorod_dev_world")
        shutil.copytree(Path(staging, prefix, TILESET), data / TILESET)
        (runtime / TRANSLATION).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(Path(staging, prefix, TRANSLATION), runtime / TRANSLATION)
    for name, binary in binaries.items():
        if binary:
            shutil.copy2(binary, runtime / name)
    if args.fixture:
        shutil.copytree(args.fixture / "save", fixture / "save")
        shutil.copytree(args.fixture / "config", fixture / "config")
    set_options(fixture / "config/options.json")


if __name__ == "__main__":
    main()
