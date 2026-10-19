import fcntl
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest


LAUNCHER = Path(__file__).with_name("run-p3-dev.sh")


class DevLauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="novgorod-launcher-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in ["runtime/data/gfx", "runtime/gfx", "fixture/save/novgorod-dev", "run"]:
            (self.root / relative).mkdir(parents=True)
        self.binary = self.root / "runtime/cataclysm"
        self.binary.write_text("#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > ../argv.txt\n")
        self.binary.chmod(0o755)
        (self.root / "fixture/save/novgorod-dev/seed.txt").write_text("seed")
        config = self.root / "fixture/config"
        config.mkdir()
        (config / "options.json").write_text(json.dumps([
            {"name": "AUTOSAVE", "value": "true"},
            {"name": "AUTOSAVE_TURNS", "value": "3600"},
            {"name": "AUTOSAVE_MINUTES", "value": "5"}]))

    def launch(self, *args):
        return subprocess.run(["bash", str(LAUNCHER), "--runtime-root", str(self.root),
                               "--native-only", *args], capture_output=True, text=True)

    def test_first_launch_and_restart_keep_saved_changes(self):
        first = self.launch()
        self.assertEqual(first.returncode, 0, first.stderr)
        saved = self.root / "userdir/save/novgorod-dev/seed.txt"
        self.assertEqual(saved.read_text(), "seed")
        saved.write_text("saved gameplay")
        second = self.launch()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(saved.read_text(), "saved gameplay")
        self.assertEqual((self.root / "argv.txt").read_text().splitlines(),
                         ["--datadir", str(self.root / "runtime/data") + "/", "--userdir",
                          str(self.root / "userdir") + "/", "--world", "novgorod-dev"])

    def test_explicit_reset_preserves_previous_userdir(self):
        self.assertEqual(self.launch().returncode, 0)
        (self.root / "userdir/save/novgorod-dev/seed.txt").write_text("saved gameplay")
        result = self.launch("--reset")
        self.assertEqual(result.returncode, 0, result.stderr)
        backups = list(self.root.glob("userdir-before-reset-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "save/novgorod-dev/seed.txt").read_text(), "saved gameplay")
        self.assertEqual((self.root / "userdir/save/novgorod-dev/seed.txt").read_text(), "seed")

    def test_autosave_profile_is_checked_without_overwriting(self):
        self.assertEqual(self.launch().returncode, 0)
        options = self.root / "userdir/config/options.json"
        options.write_text('[{"name":"AUTOSAVE","value":"false"}]')
        before = options.read_bytes()
        self.assertNotEqual(self.launch().returncode, 0)
        self.assertEqual(options.read_bytes(), before)

    def test_semantic_keybinding_uses_native_default_mode(self):
        self.assertEqual(self.launch().returncode, 0)
        keybindings = self.root / "userdir/config/keybindings.json"
        binding = json.loads(keybindings.read_text())[0]
        self.assertEqual(binding["id"], "NOVGOROD_SEMANTIC")
        self.assertEqual(binding["category"], "DEFAULTMODE")
        self.assertEqual(binding["bindings"][0]["key"], ["F12"])
        keybindings.write_text("[]")
        self.assertEqual(self.launch().returncode, 0)
        self.assertEqual(keybindings.read_text(), "[]")

    def test_lock_blocks_second_launcher_without_seeding(self):
        with (self.root / "run/session.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.launch()
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.root / "userdir").exists())

    def test_broken_userdir_is_never_reset_implicitly(self):
        (self.root / "userdir").mkdir()
        marker = self.root / "userdir/keep.txt"
        marker.write_text("keep")
        self.assertNotEqual(self.launch().returncode, 0)
        self.assertEqual(marker.read_text(), "keep")

    def test_external_data_symlink_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "runtime/data/link").symlink_to(outside, target_is_directory=True)
        self.assertNotEqual(self.launch().returncode, 0)
        self.assertFalse((self.root / "userdir").exists())

    def coordinator_launch(self):
        task_home = self.root / "home"
        node = task_home / ".local/share/novgorod/node-v22.23.3-linux-x64/bin/node"
        node.parent.mkdir(parents=True)
        node.write_text("""#!/usr/bin/env python3
import os
from pathlib import Path
import socket
import sys
path = Path(sys.argv[-1])
path.with_suffix('.pid').write_text(str(os.getpid()))
server = socket.socket(socket.AF_UNIX)
server.bind(str(path))
server.listen()
while True:
    connection, _ = server.accept()
    connection.close()
""")
        node.chmod(0o755)
        settings = self.root / "settings.json"
        settings.write_text("{}")
        return subprocess.run(["bash", str(LAUNCHER), "--runtime-root", str(self.root)],
                              env=os.environ | {"HOME": str(task_home),
                                                "RUS_LLM_SETTINGS_PATH": str(settings)},
                              capture_output=True, text=True, timeout=30)

    def test_readiness_and_cleanup_own_coordinator(self):
        result = self.coordinator_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        pid = int((self.root / "run/p3.pid").read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        self.assertFalse((self.root / "run/p3.sock").exists())

    def test_stale_socket_is_replaced(self):
        path = self.root / "run/p3.sock"
        with socket.socket(socket.AF_UNIX) as stale:
            stale.bind(str(path))
        result = self.coordinator_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(path.exists())

    def test_live_or_unknown_socket_path_is_not_removed(self):
        path = self.root / "run/p3.sock"
        with socket.socket(socket.AF_UNIX) as live:
            live.bind(str(path))
            live.listen()
            self.assertNotEqual(self.coordinator_launch().returncode, 0)
            self.assertTrue(path.exists())

    def test_unknown_socket_file_is_preserved(self):
        path = self.root / "run/p3.sock"
        path.write_text("unrelated")
        self.assertNotEqual(self.coordinator_launch().returncode, 0)
        self.assertEqual(path.read_text(), "unrelated")

    def test_termination_stops_owned_game_and_releases_lock(self):
        self.binary.write_text("#!/usr/bin/env python3\nimport os,time\nfrom pathlib import Path\n"
                               "Path('../game.pid').write_text(str(os.getpid()))\ntime.sleep(30)\n")
        process = subprocess.Popen(["bash", str(LAUNCHER), "--runtime-root", str(self.root),
                                    "--native-only"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while not (self.root / "game.pid").exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue((self.root / "game.pid").exists())
            game_pid = int((self.root / "game.pid").read_text())
            process.terminate()
            process.communicate(timeout=5)
            with self.assertRaises(ProcessLookupError):
                os.kill(game_pid, 0)
            with (self.root / "run/session.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()


if __name__ == "__main__":
    unittest.main()
