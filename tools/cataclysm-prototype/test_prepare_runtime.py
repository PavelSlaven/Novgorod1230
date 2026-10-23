import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

import prepare_p3_runtime as prepare


MOD = Path(__file__).with_name("dev-world")


class PrepareRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="novgorod-prepare-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        for relative, text in [("data/json/items.json", "[]"), ("data/mods/dda/modinfo.json", "[]"),
                               ("gfx/ASCIITileset/tile_config.json", "{}")]:
            (self.source / relative).parent.mkdir(parents=True, exist_ok=True)
            (self.source / relative).write_text(text)
        self.help_dir = self.source / "data/help"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        cmake = self.bin / "cmake"
        cmake.write_text('#!/bin/sh\n[ -e "$2/fail" ] && exit 1\n'
                         'mkdir -p "$4" && cp -a "$2/install-tree/." "$4/"\n')
        cmake.chmod(0o755)
        patcher = mock.patch.dict(os.environ, {"PATH": f"{self.bin}:{os.environ['PATH']}"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.text_build = self.make_build("build-text", {
            "cataclysm": "#!/bin/sh\n", "data/json/items.json": "[]", "data/mods/dda/modinfo.json": "[]"})
        self.tiles_build = self.make_build("build-tiles", {
            "cataclysm-tiles": "#!/bin/sh\n", "data/json/items.json": "[]",
            "data/mods/dda/modinfo.json": "[]", "gfx/ASCIITileset/tile_config.json": "{}"})
        self.fixture = self.root / "seed"
        (self.fixture / "save/novgorod-dev").mkdir(parents=True)
        (self.fixture / "save/novgorod-dev/seed.txt").write_text("seed")
        (self.fixture / "config").mkdir()
        (self.fixture / "config/options.json").write_text(json.dumps([
            {"name": "AUTOSAVE", "value": "true"},
            {"name": "AUTOSAVE_TURNS", "value": "3600"},
            {"name": "AUTOSAVE_MINUTES", "value": "5"},
            {"info": "language", "default": "", "name": "USE_LANG", "value": "en"}]))
        self.assets = self.root / "assets"
        self.runtime_root = self.root / "runtime-root"

    def make_build(self, name, files):
        build = self.root / name
        build.mkdir()
        (build / "CMakeCache.txt").write_text("CMAKE_BUILD_TYPE:STRING=Release\n"
                                              "USE_PREFIX_DATA_DIR:BOOL=OFF\n")
        for relative, text in files.items():
            path = build / "install-tree" / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            if "/" not in relative:
                path.chmod(0o755)
        return build

    def write_archive(self, extra=()):
        path = self.assets / prepare.ARCHIVE["dir"] / prepare.ARCHIVE["name"]
        path.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(path, "w:gz") as archive:
            for name, data in [("cdda/lang/mo/ru/LC_MESSAGES/cataclysm-dda.mo", b"ru-mo"),
                               ("cdda/lang/mo/de/LC_MESSAGES/cataclysm-dda.mo", b"de-mo"),
                               ("cdda/gfx/UltimateCataclysm/tile_config.json", b"{}"),
                               ("cdda/gfx/UltimateCataclysm/normal.png", b"png"),
                               ("cdda/gfx/Other/tile_config.json", b"{}"),
                               ("cdda/cataclysm-tiles", b"binary")]:
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            for member in extra:
                archive.addfile(member)
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def run_prepare(self, digest, *extra):
        argv = ["--runtime-root", str(self.runtime_root), "--source", str(self.source),
                "--assets-dir", str(self.assets), "--text-build", str(self.text_build),
                "--tiles-build", str(self.tiles_build), *extra]
        with mock.patch.dict(prepare.ARCHIVE, {"sha256": digest}):
            prepare.main(argv)

    def options(self):
        entries = json.loads((self.runtime_root / "fixture/config/options.json").read_text())
        return {entry["name"]: entry["value"] for entry in entries}

    def snapshot(self):
        runtime = self.runtime_root / "runtime"
        return {str(path.relative_to(runtime)): path.read_bytes()
                for path in sorted(runtime.rglob("*")) if path.is_file()}

    def assert_no_leftovers(self):
        self.assertEqual(sorted(self.runtime_root.glob("runtime.new-*")), [])
        self.assertEqual(sorted(self.runtime_root.glob("runtime.old-*")), [])

    def test_installs_translation_tileset_binaries_mod_and_options(self):
        self.run_prepare(self.write_archive(), "--fixture", str(self.fixture))
        runtime = self.runtime_root / "runtime"
        self.assertEqual((runtime / "lang/mo/ru/LC_MESSAGES/cataclysm-dda.mo").read_bytes(), b"ru-mo")
        self.assertFalse((runtime / "lang/mo/de").exists())
        self.assertEqual((runtime / "data/gfx/UltimateCataclysm/normal.png").read_bytes(), b"png")
        self.assertEqual((runtime / "gfx/UltimateCataclysm/normal.png").read_bytes(), b"png")
        self.assertFalse((runtime / "data/gfx/Other").exists())
        self.assertTrue((runtime / "data/gfx/ASCIITileset/tile_config.json").is_file())
        self.assertTrue((runtime / "gfx/ASCIITileset/tile_config.json").is_file())
        self.assertTrue((runtime / "data/json/items.json").is_file())
        self.assertEqual((runtime / "data/mods/novgorod_dev_world/modinfo.json").read_bytes(),
                         (MOD / "modinfo.json").read_bytes())
        self.assertEqual((runtime / "data/mods/novgorod_dev_world/fauna-policy.json").read_bytes(),
                         (MOD / "fauna-policy.json").read_bytes())
        self.assertEqual((runtime / "data/mods/novgorod_dev_world/fauna-zombify-option.json").read_bytes(),
                         (MOD / "fauna-zombify-option.json").read_bytes())
        for name in ("cataclysm", "cataclysm-tiles"):
            self.assertEqual((runtime / name).read_text(), "#!/bin/sh\n")
            self.assertTrue((runtime / name).stat().st_mode & 0o100)
        self.assertEqual((self.runtime_root / "fixture/save/novgorod-dev/seed.txt").read_text(), "seed")
        self.assertEqual(self.options(), {"AUTOSAVE": "true", "AUTOSAVE_TURNS": "3600",
                                          "AUTOSAVE_MINUTES": "5", "USE_LANG": "ru",
                                          "USE_TILES": "true", "TILES": "UltimateCataclysm",
                                          "SDL_KEYBOARD_MODE": "keycode"})

    def test_rerun_is_idempotent_and_never_touches_userdir(self):
        digest = self.write_archive()
        self.run_prepare(digest, "--fixture", str(self.fixture))
        userdir = self.runtime_root / "userdir/config"
        userdir.mkdir(parents=True)
        (userdir / "options.json").write_text('[{"name":"USE_LANG","value":"en"}]')
        before = (self.runtime_root / "fixture/config/options.json").read_bytes()
        self.run_prepare(digest)
        self.assertEqual((self.runtime_root / "fixture/config/options.json").read_bytes(), before)
        self.assertEqual((userdir / "options.json").read_text(), '[{"name":"USE_LANG","value":"en"}]')

    def test_existing_fixture_is_not_replaced(self):
        digest = self.write_archive()
        self.run_prepare(digest, "--fixture", str(self.fixture))
        with self.assertRaises(SystemExit):
            self.run_prepare(digest, "--fixture", str(self.fixture))

    def test_wrong_digest_changes_nothing(self):
        self.write_archive()
        with self.assertRaises(SystemExit):
            self.run_prepare("0" * 64, "--fixture", str(self.fixture))
        self.assertFalse(self.runtime_root.exists())

    def test_missing_archive_names_pinned_download(self):
        with self.assertRaises(SystemExit) as raised:
            self.run_prepare(prepare.ARCHIVE["sha256"], "--fixture", str(self.fixture))
        self.assertIn(prepare.ARCHIVE["url"], str(raised.exception.code))
        self.assertIn(prepare.ARCHIVE["sha256"], str(raised.exception.code))
        self.assertFalse(self.runtime_root.exists())

    def test_link_inside_wanted_paths_is_refused(self):
        link = tarfile.TarInfo("cdda/gfx/UltimateCataclysm/escape")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        with self.assertRaises(SystemExit):
            self.run_prepare(self.write_archive([link]), "--fixture", str(self.fixture))
        self.assertFalse(self.runtime_root.exists())

    def test_archive_without_russian_translation_is_refused(self):
        path = self.assets / prepare.ARCHIVE["dir"] / prepare.ARCHIVE["name"]
        path.parent.mkdir(parents=True)
        with tarfile.open(path, "w:gz") as archive:
            member = tarfile.TarInfo("cdda/gfx/UltimateCataclysm/tile_config.json")
            archive.addfile(member, io.BytesIO(b""))
        with self.assertRaises(SystemExit):
            self.run_prepare(hashlib.sha256(path.read_bytes()).hexdigest(), "--fixture", str(self.fixture))
        self.assertFalse(self.runtime_root.exists())

    def test_busy_session_lock_refuses_and_keeps_runtime(self):
        digest = self.write_archive()
        self.run_prepare(digest, "--fixture", str(self.fixture))
        before = self.snapshot()
        with (self.runtime_root / "run/session.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(SystemExit):
                self.run_prepare(digest)
        self.assertEqual(self.snapshot(), before)
        self.assert_no_leftovers()

    def test_failure_mid_build_keeps_previous_runtime(self):
        digest = self.write_archive()
        self.run_prepare(digest, "--fixture", str(self.fixture))
        before = self.snapshot()
        (self.tiles_build / "fail").write_text("")
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_prepare(digest)
        self.assertEqual(self.snapshot(), before)
        self.assert_no_leftovers()

    def test_build_must_be_release_without_prefix_data_dir(self):
        digest = self.write_archive()
        cache = self.text_build / "CMakeCache.txt"
        for wrong in ("CMAKE_BUILD_TYPE:STRING=Debug\nUSE_PREFIX_DATA_DIR:BOOL=OFF\n",
                      "CMAKE_BUILD_TYPE:STRING=Release\nUSE_PREFIX_DATA_DIR:BOOL=ON\n"):
            with self.subTest(cache=wrong):
                cache.write_text(wrong)
                with self.assertRaises(SystemExit):
                    self.run_prepare(digest, "--fixture", str(self.fixture))
                self.assertFalse(self.runtime_root.exists())

    def test_missing_help_dir_is_created_in_source(self):
        self.assertFalse(self.help_dir.exists())
        self.run_prepare(self.write_archive(), "--fixture", str(self.fixture))
        self.assertTrue(self.help_dir.is_dir())
        self.assertEqual(list(self.help_dir.iterdir()), [])

    def test_rerun_without_fixture_updates_fixture_options(self):
        digest = self.write_archive()
        self.run_prepare(digest, "--fixture", str(self.fixture))
        path = self.runtime_root / "fixture/config/options.json"
        path.write_text(json.dumps([{"name": "USE_LANG", "value": "en"}]))
        self.run_prepare(digest)
        self.assertEqual(self.options(), prepare.OPTIONS)

    def test_one_build_is_required(self):
        digest = self.write_archive()
        argv = ["--runtime-root", str(self.runtime_root), "--source", str(self.source),
                "--assets-dir", str(self.assets), "--fixture", str(self.fixture)]
        with mock.patch.dict(prepare.ARCHIVE, {"sha256": digest}), self.assertRaises(SystemExit):
            prepare.main(argv)
        self.assertFalse(self.runtime_root.exists())


if __name__ == "__main__":
    unittest.main()
