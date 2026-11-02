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
        self.text_make_build = self.root / "build-make-text"
        self.text_make_build.mkdir()
        (self.text_make_build / "cataclysm").write_text("#!/bin/sh\n")
        (self.text_make_build / "cataclysm").chmod(0o755)
        self.make_log = self.root / "make-calls.log"
        make = self.bin / "make"
        make.write_text("#!/bin/sh\n"
                        "{\n"
                        "printf 'BEGIN\\n'\n"
                        "for arg in \"$@\"; do printf 'ARG=%s\\n' \"$arg\"; done\n"
                        "printf 'PREFIX_ENV=%s\\n' \"${PREFIX-<unset>}\"\n"
                        "printf 'LANGUAGES_ENV=%s\\n' \"${LANGUAGES-<unset>}\"\n"
                        "printf 'END\\n'\n"
                        "} >> \"$NOVGOROD_TEST_MAKE_LOG\"\n"
                        "source_dir=''\n"
                        "destdir=''\n"
                        "next_is_source=0\n"
                        "for arg in \"$@\"; do\n"
                        "    if [ \"$next_is_source\" = 1 ]; then source_dir=$arg; next_is_source=0; fi\n"
                        "    case \"$arg\" in\n"
                        "        -C) next_is_source=1 ;;\n"
                        "        DESTDIR=*) destdir=${arg#DESTDIR=} ;;\n"
                        "    esac\n"
                        "done\n"
                        "if [ -n \"$destdir\" ]; then\n"
                        "    mkdir -p \"$destdir/usr/bin\" \"$destdir/usr/share/cataclysm-dda\"\n"
                        "    printf '#!/bin/sh\\n' > \"$destdir/usr/bin/cataclysm\"\n"
                        "    chmod +x \"$destdir/usr/bin/cataclysm\"\n"
                        "    cp -a \"$source_dir/data/.\" \"$destdir/usr/share/cataclysm-dda/\"\n"
                        "fi\n")
        make.chmod(0o755)
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

    def run_prepare_make(self, digest, *extra, build=None):
        self.make_log.unlink(missing_ok=True)
        argv = ["--runtime-root", str(self.runtime_root), "--source", str(self.source),
                "--assets-dir", str(self.assets), "--text-make-build",
                str(build or self.text_make_build), "--fixture", str(self.fixture), *extra]
        with mock.patch.dict(prepare.ARCHIVE, {"sha256": digest}), \
                mock.patch.dict(os.environ, {"NOVGOROD_TEST_MAKE_LOG": str(self.make_log)}):
            prepare.main(argv)

    def make_calls(self):
        if not self.make_log.exists():
            return []
        calls = []
        current = None
        for line in self.make_log.read_text().splitlines():
            if line == "BEGIN":
                current = {"args": []}
            elif line == "END":
                calls.append(current)
                current = None
            elif current is not None and line.startswith("ARG="):
                current["args"].append(line[4:])
            elif current is not None and line.startswith("PREFIX_ENV="):
                current["prefix"] = line.split("=", 1)[1]
            elif current is not None and line.startswith("LANGUAGES_ENV="):
                current["languages"] = line.split("=", 1)[1]
        return calls

    def write_capture_build_command_fixtures(self):
        git = self.bin / "git"
        git.write_text("#!/bin/sh\n"
                       "[ \"$1\" = \"-C\" ] || exit 2\n"
                       "shift 2\n"
                       "case \"$1\" in\n"
                       "    rev-parse)\n"
                       "        case \"$2\" in\n"
                       "            --show-toplevel) printf '%s\\n' \"$NOVGOROD_TEST_REPO_ROOT\" ;;\n"
                       "            --is-inside-work-tree) printf 'true\\n' ;;\n"
                       "            HEAD) printf '0d8843f1c500052c3e026e3da6f8edaf5e00b626\\n' ;;\n"
                       "            *) exit 2 ;;\n"
                       "        esac ;;\n"
                       "    status|apply) exit 0 ;;\n"
                       "    *) exit 2 ;;\n"
                       "esac\n")
        git.chmod(0o755)
        for name in ("gcc-13", "g++-13"):
            compiler = self.bin / name
            compiler.write_text("#!/bin/sh\nprintf '13.2.0\\n'\n")
            compiler.chmod(0o755)

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
        installed_mod = runtime / "data/mods/novgorod_dev_world"
        self.assertEqual(
            {path.relative_to(installed_mod): path.read_bytes()
             for path in installed_mod.rglob("*") if path.is_file()},
            {**{path.relative_to(MOD): path.read_bytes()
                for path in MOD.rglob("*") if path.is_file()},
             Path("mtype_taxon_crosswalk.csv"):
                 (Path(__file__).resolve().parents[2] / "data/world-catalogs/novgorod/game-base-v1/"
                  "mtype_taxon_crosswalk.csv").read_bytes()})
        for name in ("cataclysm", "cataclysm-tiles"):
            self.assertEqual((runtime / name).read_text(), "#!/bin/sh\n")
            self.assertTrue((runtime / name).stat().st_mode & 0o100)
        self.assertEqual((self.runtime_root / "fixture/save/novgorod-dev/seed.txt").read_text(), "seed")
        self.assertEqual(self.options(), {"AUTOSAVE": "true", "AUTOSAVE_TURNS": "3600",
                                          "AUTOSAVE_MINUTES": "5", "USE_LANG": "ru",
                                          "USE_TILES": "true", "TILES": "UltimateCataclysm",
                                          "SDL_KEYBOARD_MODE": "keycode",
                                          "USE_METRIC_WEIGHTS": "kg", "VOLUME_UNITS": "l",
                                          "USE_METRIC_SPEEDS": "km/h", "DISTANCE_UNITS": "metric",
                                          "USE_CELSIUS": "celsius", "24_HOUR": "24h"})

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

    def test_text_make_build_cannot_be_combined_with_text_build(self):
        with self.assertRaises(SystemExit):
            self.run_prepare_make(self.write_archive(), "--text-build", str(self.text_build))
        self.assertEqual(self.make_calls(), [])
        self.assertFalse(self.runtime_root.exists())

    def test_text_make_build_rejects_cmake_directory_and_missing_binary(self):
        digest = self.write_archive()
        empty_build = self.root / "build-make-empty"
        empty_build.mkdir()
        for build in (self.text_build, empty_build):
            with self.subTest(build=build), self.assertRaises(SystemExit):
                self.run_prepare_make(digest, build=build)
            self.assertEqual(self.make_calls(), [])
            self.assertFalse(self.runtime_root.exists())

    def test_text_make_runtime_copies_existing_build_source_and_translation(self):
        digest = self.write_archive()
        with mock.patch.dict(os.environ, {"PREFIX": "/must-not-leak", "LANGUAGES": "de"}):
            self.run_prepare_make(digest)
        runtime = self.runtime_root / "runtime"
        self.assertEqual((runtime / "cataclysm").read_bytes(),
                         (self.text_make_build / "cataclysm").read_bytes())
        self.assertTrue((runtime / "cataclysm").stat().st_mode & 0o100)
        for source_file in (self.source / "data").rglob("*"):
            if source_file.is_file():
                relative = source_file.relative_to(self.source / "data")
                self.assertEqual((runtime / "data" / relative).read_bytes(), source_file.read_bytes())
        self.assertEqual((runtime / prepare.TRANSLATION).read_bytes(), b"ru-mo")
        self.assertEqual(self.make_calls(), [])

    def test_capture_make_wrapper_omits_prefix_languages_and_install(self):
        self.write_capture_build_command_fixtures()
        source = self.root / "capture-source"
        (source / "src").mkdir(parents=True)
        build = self.root / "capture-build"
        build.mkdir()
        self.make_log.unlink(missing_ok=True)
        repo_root = Path(__file__).resolve().parents[2]
        environment = os.environ.copy()
        environment.update({"PATH": f"{self.bin}:{environment['PATH']}",
                            "NOVGOROD_TEST_REPO_ROOT": str(repo_root),
                            "NOVGOROD_TEST_MAKE_LOG": str(self.make_log),
                            "PREFIX": str(self.root / "inherited-prefix"),
                            "LANGUAGES": "ru"})
        script = Path(__file__).with_name("build-native-capture-text.sh")
        subprocess.run(["bash", str(script), "--source", str(source), "--build-dir", str(build),
                        "--jobs", "2"], check=True, env=environment, capture_output=True, text=True)
        calls = self.make_calls()
        self.assertGreater(len(calls), 0)
        build_target = str(build.resolve() / "cataclysm")
        target_calls = [call for call in calls if build_target in call["args"]]
        self.assertEqual(len(target_calls), 1)
        for call in calls:
            self.assertFalse(any(arg.startswith("PREFIX=") for arg in call["args"]))
            self.assertFalse(any(arg.startswith("LANGUAGES=") for arg in call["args"]))
            self.assertFalse(any(arg.startswith("DESTDIR=") for arg in call["args"]))
            self.assertNotIn("install", call["args"])
            self.assertEqual(call["prefix"], "<unset>")
            self.assertEqual(call["languages"], "<unset>")
        self.assertIn(f"BUILD_PREFIX={build.resolve()}/", target_calls[0]["args"])

    def test_runtime_copies_canonical_mtype_taxon_crosswalk_unchanged(self):
        repo_root = Path(__file__).resolve().parents[2]
        source_crosswalk = (repo_root / "data/world-catalogs/novgorod/game-base-v1/"
                            "mtype_taxon_crosswalk.csv")
        self.assertTrue(source_crosswalk.is_file())
        self.run_prepare(self.write_archive(), "--fixture", str(self.fixture))
        runtime_crosswalk = (self.runtime_root / "runtime/data/mods/novgorod_dev_world/"
                             "mtype_taxon_crosswalk.csv")
        self.assertTrue(runtime_crosswalk.is_file())
        self.assertEqual(runtime_crosswalk.read_bytes(), source_crosswalk.read_bytes())


if __name__ == "__main__":
    unittest.main()
