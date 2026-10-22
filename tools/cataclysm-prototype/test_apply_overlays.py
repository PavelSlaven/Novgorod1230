import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


HERE = Path(__file__).parent
SCRIPT = HERE / "apply-overlays.sh"
FAKE_GIT = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
if [[ $3 == apply && $4 == --check && -n ${FAKE_FAIL:-} && $(basename -- "$5") == "$FAKE_FAIL.patch" ]]; then
    exit 1
fi
"""


class ApplyOverlaysTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="novgorod-apply-overlays-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.tool = self.root / "tool"
        self.tool.mkdir()
        shutil.copy(SCRIPT, self.tool / SCRIPT.name)
        for name in ["a", "b", "c"]:
            (self.tool / f"{name}.patch").write_text(name)
        for name in ["novgorod_semantic.cpp", "novgorod_semantic.h"]:
            (self.tool / name).write_text(name)
        self.source = self.root / "cdda"
        (self.source / "src").mkdir(parents=True)
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (bin_dir / "git").write_text(FAKE_GIT)
        (bin_dir / "git").chmod(0o755)
        self.log = self.root / "git.txt"
        self.env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}", "FAKE_LOG": str(self.log)}

    def run_script(self, overlays, **env):
        (self.tool / "native-overlays.txt").write_bytes(overlays.encode())
        return subprocess.run(["bash", str(self.tool / SCRIPT.name), "--source", str(self.source)],
                              capture_output=True, text=True, env={**self.env, **env})

    def patch_calls(self):
        return [line.split()[-1].rsplit("/", 1)[-1] + (" check" if "--check" in line else "")
                for line in self.log.read_text().splitlines()]

    def test_patches_follow_file_order_then_semantic_sources_are_copied(self):
        result = self.run_script("b\r\na\nc\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.patch_calls(), ["b.patch check", "b.patch", "a.patch check", "a.patch",
                                              "c.patch check", "c.patch"])
        for name in ["novgorod_semantic.cpp", "novgorod_semantic.h"]:
            self.assertEqual((self.source / "src" / name).read_text(), name)

    def test_reordering_the_file_reorders_application(self):
        result = self.run_script("c\nb\na\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.patch_calls()[1::2], ["c.patch", "b.patch", "a.patch"])

    def test_failed_check_stops_before_the_patch_the_rest_and_the_copy(self):
        result = self.run_script("b\na\nc\n", FAKE_FAIL="a")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("a.patch", result.stderr)
        self.assertEqual(self.patch_calls(), ["b.patch check", "b.patch", "a.patch check"])
        self.assertFalse((self.source / "src" / "novgorod_semantic.cpp").exists())

    def test_shipped_list_names_every_native_patch_in_module_order(self):
        names = (HERE / "native-overlays.txt").read_text().split()
        self.assertEqual(names, ["native-input", "native-persistence", "native-item-identity", "native-rng-state",
                                 "native-preload", "native-semantic-input", "native-control-tests",
                                 "native-live-input", "native-autosave-options",
                                 "native-camp-exact-lookup"])
        self.assertEqual(sorted(names), sorted(path.stem for path in HERE.glob("native-*.patch")))


if __name__ == "__main__":
    unittest.main()
