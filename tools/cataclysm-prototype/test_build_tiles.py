import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("build-tiles.sh")
PINS = {
    "SDL": "8e37db5e797b6167f3a00d697d816a684bd259c7",
    "SDL_image": "bec9134a26c7d0f31b36d6083c25296e04cabff5",
    "SDL_ttf": "a1ce3670aec736ecbf0936c43f2f0cc53aa61e5b",
}
FAKE_GIT = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG/git.txt"
if [[ $1 == clone ]]; then
    dir=${@: -1}
    name=$(basename -- "${@: -2:1}" .git)
    mkdir -p -- "$dir"
    var="FAKE_HEAD_${name}"
    printf '%s\\n' "${!var}" > "$dir/.fake-head"
elif [[ $1 == -C && $3 == rev-parse ]]; then
    cat -- "$2/.fake-head"
fi
"""
FAKE_CMAKE = """#!/usr/bin/env bash
printf '%s|CMAKE_PREFIX_PATH=%s|PKG_CONFIG_PATH=%s\\n' "$*" "${CMAKE_PREFIX_PATH:-}" "${PKG_CONFIG_PATH:-}" >> "$FAKE_LOG/cmake.txt"
"""


class BuildTilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="novgorod-build-tiles-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name, body in [("git", FAKE_GIT), ("cmake", FAKE_CMAKE)]:
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(0o755)
        self.log = self.root / "log"
        self.log.mkdir()
        self.source = self.root / "cdda"
        self.source.mkdir()
        self.prefix = self.root / "prefix"
        self.sdl_src = self.root / "sdl-src"
        self.build = self.root / "build-tiles"
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "FAKE_LOG": str(self.log),
                    **{f"FAKE_HEAD_{name}": sha for name, sha in PINS.items()}}

    def run_script(self, env=None):
        return subprocess.run(["bash", str(SCRIPT), "--source", str(self.source), "--build-dir", str(self.build),
                               "--prefix", str(self.prefix), "--sdl-src", str(self.sdl_src)],
                              capture_output=True, text=True, env=env or self.env)

    def cmake_calls(self):
        path = self.log / "cmake.txt"
        return path.read_text().splitlines() if path.exists() else []

    def test_pinned_clones_build_sdl_stack_then_tiles_without_prefix_data_dir(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        git = (self.log / "git.txt").read_text()
        for repo, tag in [("SDL", "release-3.4.10"), ("SDL_image", "release-3.4.4"), ("SDL_ttf", "release-3.2.2")]:
            self.assertIn(f"clone --depth 1 --branch {tag} https://github.com/libsdl-org/{repo}.git", git)
        configures = [call for call in self.cmake_calls() if call.startswith("-S ")]
        self.assertEqual([call.split()[1] for call in configures],
                         [str(self.sdl_src / "SDL"), str(self.sdl_src / "SDL_image"),
                          str(self.sdl_src / "SDL_ttf"), str(self.source)])
        for call in configures[:3]:
            self.assertIn(f"-DCMAKE_INSTALL_PREFIX={self.prefix}", call)
        self.assertIn("-DSDLIMAGE_VENDORED=OFF", configures[1])
        self.assertIn("-DSDLTTF_VENDORED=OFF", configures[2])
        cdda = configures[3]
        for flag in ["-DTILES=ON", "-DSOUND=OFF", "-DUSE_PREFIX_DATA_DIR=OFF", "-DCMAKE_BUILD_TYPE=Release",
                     f"-B {self.build}"]:
            self.assertIn(flag, cdda)
        self.assertIn(f"CMAKE_PREFIX_PATH={self.prefix}|", cdda)
        self.assertIn(f"PKG_CONFIG_PATH={self.prefix}/lib/pkgconfig", cdda)
        self.assertIn(f"--build {self.build} --target cataclysm-tiles", self.cmake_calls()[-1])

    def test_commit_mismatch_stops_before_any_build(self):
        env = {**self.env, "FAKE_HEAD_SDL_ttf": "0" * 40}
        result = self.run_script(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SDL_ttf", result.stderr)
        self.assertIn(PINS["SDL_ttf"], result.stderr)
        self.assertEqual(self.cmake_calls(), [])

    def test_existing_pinned_clones_are_reused(self):
        self.assertEqual(self.run_script().returncode, 0)
        (self.log / "git.txt").unlink()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("clone", (self.log / "git.txt").read_text())

    def test_existing_clone_at_other_commit_is_refused(self):
        self.assertEqual(self.run_script().returncode, 0)
        (self.sdl_src / "SDL/.fake-head").write_text("1" * 40 + "\n")
        (self.log / "cmake.txt").unlink()
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(PINS["SDL"], result.stderr)
        self.assertEqual(self.cmake_calls(), [])


if __name__ == "__main__":
    unittest.main()
