import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import termios
import time


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_game(binary, data, userdir, world, log, exercise):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 120, 0, 0))
    started = time.monotonic()
    process = subprocess.Popen(
        [str(binary), "--datadir", str(data) + "/", "--userdir", str(userdir) + "/", "--world", world],
        cwd=binary.parent, stdin=slave, stdout=slave, stderr=slave,
        start_new_session=True, env=os.environ | {"TERM": "xterm-256color"})
    os.close(slave)
    output = bytearray()
    cursor = 0

    def wait_for(tokens, timeout=120):
        nonlocal cursor
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    chunk = b""
                output.extend(chunk)
                with log.open("ab") as stream:
                    stream.write(chunk)
            recent = bytes(output[cursor:]).lower()
            if b"failed to read from" in recent or b"an error has occurred" in recent:
                raise RuntimeError("Native error dialog; see PTY log")
            if any(token.lower() in recent for token in tokens):
                cursor = len(output)
                return
            if process.poll() is not None:
                raise RuntimeError(f"Game exited before {tokens!r}: {process.returncode}")
        raise TimeoutError(f"No native UI state {tokens!r}; see {log}")

    def key(value, pause=0):
        os.write(master, value)
        if pause:
            time.sleep(pause)

    try:
        loaded_tokens = [b"Wield"]
        wait_for([b"[MOTD]", b"New Game", b"Language", *loaded_tokens], 180)
        if b"language" in bytes(output).lower() and b"[motd]" not in bytes(output).lower():
            key(b"1\n")
            wait_for([b"[MOTD]", b"New Game"])
        menu_seconds = None
        if not any(token.lower() in bytes(output).lower() for token in loaded_tokens):
            menu_seconds = time.monotonic() - started
            key(b"l", 0.3)
            key(b"\n")
            wait_for(loaded_tokens, 180)
        loaded_seconds = time.monotonic() - started
        inputs = []
        if exercise:
            for value, name in [(b".", "wait"), (b"4", "move west"), (b"6", "move east")]:
                key(value, 0.5)
                inputs.append(name)
            key(b"i")
            wait_for([b"Inventory", b"backpack", b"firestarter"])
            key(b"\x1b", 0.5)
            inputs.append("inspect carried native item")
        key(b"\x1b", 1)
        key(b"S", 1)
        key(b"Y")
        wait_for([b"Tip of the day", b"[MOTD]"], 120)
        key(b"Q")
        wait_for([b"Really"], 20)
        key(b"Y")
        deadline = time.monotonic() + 30
        while process.poll() is None and time.monotonic() < deadline:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    chunk = b""
                with log.open("ab") as stream:
                    stream.write(chunk)
        if process.poll() is None:
            raise TimeoutError("Game did not exit after native quit")
        if process.returncode != 0:
            raise RuntimeError(f"Native exit {process.returncode}")
        return {"menu_seconds": menu_seconds, "loaded_seconds": loaded_seconds,
                "inputs": inputs, "exit_code": process.returncode}
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        os.close(master)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    root, evidence = args.runtime_root.resolve(strict=True), args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    seed = root / "userdir"
    if not seed.exists():
        seed = root / "fixture"
    userdir = evidence / "userdir"
    shutil.copytree(seed, userdir)
    config = userdir / "config"
    config.mkdir(exist_ok=True)
    (config / "options.json").write_text(json.dumps([{"name": "USE_LANG", "value": "en"}]))
    worlds = [path for path in (userdir / "save").iterdir() if path.is_dir()]
    if len(worlds) != 1:
        raise RuntimeError("Probe requires exactly one copied world")
    binary, data = root / "runtime/cataclysm", root / "runtime/data"
    saves = list(worlds[0].glob("*.sav.zzip"))
    if len(saves) != 1:
        raise RuntimeError("Probe requires exactly one avatar")
    report = {"binary_sha256": sha256(binary), "world": worlds[0].name,
              "copied_from": str(seed), "cache_before": (data / "cache").exists(), "runs": []}
    try:
        for index in range(2):
            before = sha256(saves[0])
            row = run_game(binary, data, userdir, worlds[0].name,
                           evidence / f"run-{index + 1}.pty", exercise=True)
            row |= {"save_before": before, "save_after": sha256(saves[0])}
            if row["save_before"] == row["save_after"]:
                raise RuntimeError("Native save did not update avatar save")
            report["runs"].append(row)
            (evidence / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        report["result"] = "PASS"
        print(json.dumps(report, indent=2))
    except Exception as error:
        report["result"] = "FAIL"
        report["error"] = str(error)
        raise
    finally:
        (evidence / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        shutil.rmtree(userdir)


if __name__ == "__main__":
    main()
