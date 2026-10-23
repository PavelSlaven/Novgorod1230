#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import selectors
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

WINDOWS = ("after_player_speech", "after_npc_reply", "mid_save")
FILTER = "[novgorod_crash]"
STABLE_WORLD = ("position", "activity", "activity_moves_left", "world_signature",
                "inventory_items", "ground_items", "visible_npcs")
NPC_FIELDS = ("kind", "speaker_ref", "listener_ref", "text", "turn")
CRASH_TOKENS = ("UNSAVED_PLAYER", "UNSAVED_NPC", "STALE_NPC_RESPONSE")


def utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot_files(user_dir: Path) -> dict[str, str]:
    save = user_dir / "save"
    return {p.relative_to(user_dir).as_posix(): digest(p) for p in sorted(save.rglob("*"))
            if p.is_file()}


def canonical_npcs(state: dict) -> list[dict]:
    rows = state.get("npcs")
    if not isinstance(rows, list) or not rows:
        raise ValueError("missing NPC records")
    normalized = []
    for npc in rows:
        if not isinstance(npc, dict) or not isinstance(npc.get("records"), list):
            raise ValueError("invalid NPC records")
        records = [{key: record[key] for key in NPC_FIELDS} for record in npc["records"]]
        normalized.append({"actor_id": npc["actor_id"], "records": records})
    return sorted(normalized, key=lambda row: row["actor_id"])


def projection(state: dict) -> dict:
    world = state["native_snapshot"]
    for field in STABLE_WORLD + ("turn", "clock"):
        if field not in world:
            raise ValueError("missing world field: " + field)
    if "player_messages" not in state:
        raise ValueError("missing player_messages")
    return {"world": world, "npcs": canonical_npcs(state),
            "player_messages": state["player_messages"]}


def compare_recovery(baseline: dict, loaded: dict, idle: dict) -> list[str]:
    errors = []
    try:
        base, got, after = map(projection, (baseline, loaded, idle))
    except (KeyError, TypeError, ValueError) as error:
        return ["invalid snapshot: " + str(error)]
    for field, expected in base["world"].items():
        if got["world"].get(field) != expected:
            errors.append("loaded world." + field + " differs from T0")
    if not isinstance(after["world"].get("turn"), int) or after["world"]["turn"] <= got["world"]["turn"]:
        errors.append("idle turn did not advance")
    for field in STABLE_WORLD + ("moves",):
        if after["world"].get(field) != base["world"].get(field):
            errors.append("idle world." + field + " differs from T0")
    for label, state in (("loaded", got), ("idle", after)):
        if state["npcs"] != base["npcs"]:
            errors.append(label + " NPC records differ from T0")
        if label == "loaded" and state["player_messages"] != base["player_messages"]:
            errors.append(label + " player messages differ from T0")
        if label == "idle":
            idle_messages = json.dumps(state["player_messages"], ensure_ascii=False)
            base_messages = json.dumps(base["player_messages"], ensure_ascii=False)
            for token in ("BASE_PLAYER", "BASE_NPC"):
                if idle_messages.count(token) > base_messages.count(token):
                    errors.append("idle duplicated " + token)
        encoded = json.dumps(state, ensure_ascii=False)
        for token in CRASH_TOKENS:
            if token in encoded:
                errors.append(label + " contains " + token)
    return errors


def run_native(binary: Path, native_root: Path, user_dir: Path, world: str,
               mode: str, failpoint: str | None = None) -> dict:
    env = os.environ.copy()
    env.update(NOVGOROD_P4_MODE=mode, NOVGOROD_P4_WORLD=world)
    env.pop("NOVGOROD_P4_FAILPOINT", None)
    if failpoint:
        env["NOVGOROD_P4_FAILPOINT"] = failpoint
    args = [str(binary), "--rng-seed", "17", f"--user-dir={user_dir}",
            "--mods=novgorod_dev_world", "--reporter", "junit", "--out=/dev/null", FILTER]
    started = utc()
    process = subprocess.Popen(args, cwd=native_root, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT)
    chunks = []
    marker = "NOVGOROD_P4_FAILPOINT_REACHED:" + failpoint if failpoint else None
    reached = False
    deadline = time.monotonic() + (180 if failpoint else 600)
    try:
        assert process.stdout is not None
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while time.monotonic() < deadline:
                ready = selector.select(min(1, max(0, deadline - time.monotonic())))
                if ready:
                    chunk = os.read(process.stdout.fileno(), 65536)
                    if chunk:
                        chunks.append(chunk)
                        if marker and marker in b"".join(chunks[-3:]).decode("utf-8", "replace"):
                            reached = True
                            os.kill(process.pid, signal.SIGKILL)
                            break
                if process.poll() is not None:
                    break
        if process.poll() is None:
            if not reached:
                process.terminate()
            process.wait(timeout=30)
        else:
            process.wait(timeout=30)
        tail = process.stdout.read()
        if tail:
            chunks.append(tail)
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=30)
    output = b"".join(chunks).decode("utf-8", "replace")
    evidence = {"command": args, "cwd": str(native_root), "stdout": output,
                "mode": mode, "failpoint": failpoint, "start_utc": started,
                "end_utc": utc(), "pid": process.pid, "exit": process.returncode,
                "marker": marker, "marker_seen": reached}
    if failpoint:
        if not reached or process.returncode != -signal.SIGKILL:
            evidence["error"] = "D216 marker/kill failure"
    elif process.returncode != 0:
        evidence["error"] = "native process failed"
    return evidence


def read_state(user_dir: Path, name: str) -> dict:
    path = user_dir / name
    return json.loads(path.read_text(encoding="utf-8"))


def stale_operation(observation: dict, baseline: dict) -> dict:
    npc = next((row["actor_id"] for row in canonical_npcs(baseline)
                if any(record["kind"] == "said" and record["text"] == "BASE_NPC"
                       for record in row["records"])), None)
    if npc is None:
        raise ValueError("BASE_NPC speaker record missing")
    payload = {"observation": observation, "actor_id": npc,
               "operation_id": "stale-crash-replay", "utterance": "STALE_NPC_RESPONSE"}
    result = subprocess.run(["node", str(Path(__file__).with_name("crash_envelope.mjs"))],
                            input=json.dumps(payload), text=True, capture_output=True,
                            check=True, timeout=30)
    envelope = json.loads(result.stdout)
    references = envelope["references"]["actors"]
    if not all(isinstance(row, dict) and row.get("ref") == "avatar"
               and isinstance(row.get("id"), str) for row in references):
        raise ValueError("coordinator did not resolve stale avatar reference")
    return envelope


def run_window(binary: Path, native_root: Path, evidence_root: Path,
               world: str, failpoint: str) -> dict:
    directory = evidence_root / failpoint
    directory.mkdir()
    user_dir = directory / "user"
    user_dir.mkdir()
    report = {"window": failpoint, "verdict": "FAIL", "steps": [],
              "d216_recovery_moment": {
                  "verdict": "NOT_OBSERVED",
                  "basis": "Messages::serialize has no observable UI popup timestamp"}}
    def step(mode: str, fault: str | None = None) -> None:
        result = run_native(binary, native_root, user_dir, world, mode, fault)
        log = directory / f"{len(report['steps']):02d}-{mode}-{fault or 'normal'}.log"
        log.write_text(result.pop("stdout"), encoding="utf-8")
        result["stdout_log"] = log.name
        result["stdout_sha256"] = digest(log)
        report["steps"].append(result)
        if result.get("error"):
            raise RuntimeError(result["error"] + ": " + log.name)
    try:
        step("create")
        report["create_snapshot"] = projection(read_state(user_dir, "novgorod-crash-baseline.json"))
        report["save_after_create_sha256"] = snapshot_files(user_dir)
        step("read")
        baseline = read_state(user_dir, "novgorod-crash-loaded.json")
        report["T0"] = projection(baseline)
        report["save_T0_sha256"] = snapshot_files(user_dir)
        if report["save_T0_sha256"] != report["save_after_create_sha256"]:
            raise RuntimeError("baseline read changed .sav/master files")
        step("apply", failpoint)
        report["save_after_crash_sha256"] = snapshot_files(user_dir)
        if failpoint != "mid_save":
            path = user_dir / "novgorod-p3-operation.json"
            path.write_text(json.dumps(stale_operation(read_state(user_dir, "novgorod-p3-observation.json"), baseline)), encoding="utf-8")
            report["stale_before_sha256"] = digest(path)
        step("read")
        loaded = read_state(user_dir, "novgorod-crash-loaded.json")
        idle = read_state(user_dir, "novgorod-crash-idle.json")
        report["loaded"] = projection(loaded)
        report["idle"] = projection(idle)
        report["save_after_read_sha256"] = snapshot_files(user_dir)
        errors = compare_recovery(baseline, loaded, idle)
        if failpoint != "mid_save":
            path = user_dir / "novgorod-p3-operation.json"
            report["stale_after_sha256"] = digest(path) if path.is_file() else None
            if report["stale_before_sha256"] != report["stale_after_sha256"]:
                errors.append("stale operation file changed during read")
        if report["save_after_read_sha256"] != report["save_after_crash_sha256"]:
            errors.append("read changed .sav/master files")
        if not errors:
            step("apply")
            step("read")
            post = read_state(user_dir, "novgorod-crash-loaded.json")
            encoded = json.dumps(projection(post), ensure_ascii=False)
            for token in ("POST_RECOVERY_PLAYER", "POST_RECOVERY_NPC"):
                if token not in encoded:
                    errors.append("post-recovery missing " + token)
            for token in CRASH_TOKENS:
                if token in encoded:
                    errors.append("post-recovery contains " + token)
            report["post_recovery"] = projection(post)
        errors.append("D216 recovery moment is not observable in this automated run")
        report["errors"] = errors
        if not errors:
            report["verdict"] = "PASS"
    except Exception as error:
        report["errors"] = [str(error),
                            "D216 recovery moment is not observable in this automated run"]
    (directory / "d216-verdict.json").write_text(json.dumps(report, indent=2, ensure_ascii=False),
                                                  encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка восстановления разговора NPC после аварии CDDA.")
    parser.add_argument("--native-root", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--world", default="novgorod_crash")
    args = parser.parse_args()
    args.evidence_root = args.evidence_root.resolve()
    if args.evidence_root.exists():
        parser.error("evidence root must be new")
    if not args.binary.is_file():
        parser.error("native binary missing")
    args.evidence_root.mkdir(parents=True)
    reports = [run_window(args.binary.resolve(), args.native_root.resolve(),
                          args.evidence_root, args.world, window) for window in WINDOWS]
    summary = {"utc": utc(), "binary_sha256": digest(args.binary),
               "windows": {row["window"]: row["verdict"] for row in reports},
               "verdict": "PASS" if all(row["verdict"] == "PASS" for row in reports) else "FAIL",
               "time_visibility": "Messages::serialize only; inspect UI popup in smoke test"}
    (args.evidence_root / "d216-summary.json").write_text(json.dumps(summary, indent=2),
                                                           encoding="utf-8")
    for name, verdict in summary["windows"].items():
        print(f"D216 {name}: {verdict}", flush=True)
    return 0 if summary["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
