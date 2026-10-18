#!/usr/bin/env python3
"""Disposable P4 coordinator: native save plus technical facts as one generation.

Run inside the pinned WSL checkout. Accepted generations are never opened by
Cataclysm; each read uses a disposable copy and a fresh native process.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import json
import math
import os
import selectors
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any


MAX_BYTES = 512 * 1024 * 1024
NATIVE_FILTER = "[novgorod_persistence]"
OPERATIONS = {"pickup_rock", "pickup_stick", "move_east", "partial_hacksaw"}
FAILPOINTS = {"before_effect", "after_native_save_before_semantic", "after_atomic_before_receipt",
              "mid_generation_copy", "after_generation_rename_before_publish"}


class UncertainState(RuntimeError):
    """Accepted pointer or its referenced generation cannot be trusted."""


def _fsync_file(path: Path) -> None:
    with path.open("rb") as stream:
        os.fsync(stream.fileno())


def _fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _sync_tree(root: Path) -> None:
    for path in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if path.is_symlink():
            raise ValueError(f"native userdir contains symlink: {path.relative_to(root)}")
        if path.is_file():
            _fsync_file(path)
        elif path.is_dir():
            _fsync_dir(path)
    _fsync_dir(root)


def _size_and_files(root: Path) -> tuple[int, list[str]]:
    if not root.is_dir() or root.is_symlink():
        raise ValueError("native userdir is missing or not a directory")
    total = 0
    files: list[str] = []
    for path in sorted(root.rglob("*"), key=lambda p: p.relative_to(root).as_posix()):
        if path.is_symlink():
            raise ValueError(f"native userdir contains symlink: {path.relative_to(root)}")
        if path.is_file():
            total += path.stat().st_size
            files.append(path.relative_to(root).as_posix())
    if not files:
        raise ValueError("native userdir contains no files")
    if total > MAX_BYTES:
        raise ValueError(f"native generation exceeds {MAX_BYTES} bytes: {total}")
    return total, files


def _first_difference(left: Any, right: Any, path: str = "snapshot") -> str | None:
    if type(left) is not type(right):
        return f"{path}: apply={left!r}, reload={right!r}"
    if isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            if key not in left or key not in right:
                side = "apply" if key in left else "reload"
                return f"{path}.{key}: present only in {side}"
            difference = _first_difference(left[key], right[key], f"{path}.{key}")
            if difference:
                return difference
        return None
    if isinstance(left, list):
        if len(left) != len(right):
            return f"{path}: apply count={len(left)}, reload count={len(right)}"
        for index, (a, b) in enumerate(zip(left, right)):
            difference = _first_difference(a, b, f"{path}[{index}]")
            if difference:
                return difference
        return None
    if left != right:
        return f"{path}: apply={left!r}, reload={right!r}"
    return None


def _nearest_rank(values: list[float], percentile: float) -> float:
    if not values or not 0 < percentile <= 1:
        raise ValueError("nearest-rank percentile requires values and 0 < p <= 1")
    rank = math.ceil(percentile * len(values))
    return sorted(values)[rank - 1]


def _make_writable(root: Path) -> None:
    for path in [root, *root.rglob("*")]:
        if path.is_dir():
            path.chmod(path.stat().st_mode | 0o700)
        elif path.is_file():
            path.chmod(path.stat().st_mode | 0o600)


def _remove_writable_tree(root: Path) -> None:
    if root.is_symlink():
        raise ValueError(f"refusing recursive cleanup of symlink: {root}")
    if not root.exists():
        return
    for path in [*root.rglob("*"), root]:
        if path.is_symlink():
            path.unlink()
        elif path.is_dir():
            path.chmod(path.stat().st_mode | 0o700)
        elif path.is_file():
            path.chmod(path.stat().st_mode | 0o600)
    shutil.rmtree(root)


def _copy_tree(source: Path, destination: Path) -> tuple[int, float]:
    start = time.perf_counter()
    shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)
    byte_count, _ = _size_and_files(destination)
    _sync_tree(destination)
    return byte_count, (time.perf_counter() - start) * 1000


def _kill_self() -> None:
    marker = os.environ.get("NOVGOROD_P4_COORDINATOR_FAILPOINT")
    if marker:
        print(f"P4_COORDINATOR_FAILPOINT_REACHED:{marker}", flush=True)
    os.kill(os.getpid(), signal.SIGKILL)
    raise AssertionError("SIGKILL unexpectedly returned")


class Coordinator:
    def __init__(self, experiment_root: Path, native_root: Path, binary: Path, world: str):
        self.root = experiment_root.resolve()
        self.native_root = native_root.resolve()
        self.binary = binary.resolve()
        self.world = world
        if not self.root.is_absolute() or not self.native_root.is_dir() or not self.binary.is_file():
            raise ValueError("experiment/native paths must exist and be absolute")
        if self.native_root in self.root.parents or self.root in self.native_root.parents:
            raise ValueError("experiment root cannot overlap the native checkout")
        try:
            self.binary.relative_to(self.native_root)
        except ValueError as exc:
            raise ValueError("native test binary must be inside the pinned native checkout") from exc
        if not self.world or len(self.world) > 64 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in self.world):
            raise ValueError("world name must contain only ASCII letters, digits, hyphen and underscore")
        self.generations = self.root / "generations"
        self.pointer = self.root / "current.json"
        self.work = self.root / "working"
        self.root.mkdir(parents=True, exist_ok=True)
        self.generations.mkdir(exist_ok=True)
        self.work.mkdir(exist_ok=True)
        self._lock_stream = (self.root / ".coordinator.lock").open("a+")
        fcntl.flock(self._lock_stream.fileno(), fcntl.LOCK_EX)

    def _native(self, mode: str, user_dir: Path, operation: str | None = None,
                failpoint: str | None = None, wait_kill: bool = False) -> tuple[dict[str, Any], float]:
        env = os.environ.copy()
        env["NOVGOROD_P4_MODE"] = mode
        env["NOVGOROD_P4_WORLD"] = self.world
        env.pop("NOVGOROD_P4_OPERATION", None)
        env.pop("NOVGOROD_P4_FAILPOINT", None)
        if operation:
            env["NOVGOROD_P4_OPERATION"] = operation
        if failpoint:
            env["NOVGOROD_P4_FAILPOINT"] = failpoint
        command = [str(self.binary), "--rng-seed", "17", f"--user-dir={user_dir}",
                   "--reporter", "junit", "--out=/dev/null", NATIVE_FILTER]
        started = time.perf_counter()
        process = subprocess.Popen(command, cwd=self.native_root, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1)
        output: list[str] = []
        marker = f"NOVGOROD_P4_FAILPOINT_REACHED:{failpoint}"
        try:
            assert process.stdout is not None
            if wait_kill:
                deadline = time.monotonic() + 120
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    while process.poll() is None:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            break
                        for _, _ in selector.select(min(1.0, remaining)):
                            chunk = os.read(process.stdout.fileno(), 8192).decode("utf-8", errors="replace")
                            output.append(chunk)
                            if marker in chunk or marker in "".join(output[-3:]):
                                process.kill()
                                process.wait(timeout=30)
                                raise RuntimeError(f"native process killed at {failpoint}")
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=30)
                    raise TimeoutError(f"native failpoint not reached: {failpoint}")
            tail, _ = process.communicate(timeout=600)
            output.append(tail)
        except BaseException:
            if process.poll() is None:
                process.kill()
            process.wait()
            raise
        elapsed = (time.perf_counter() - started) * 1000
        text = "".join(output)
        if process.returncode != 0:
            raise RuntimeError(f"native {mode} exited {process.returncode}: {text[-1200:]}")
        result = None
        for line in reversed(text.splitlines()):
            try:
                candidate = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(candidate, dict) and candidate.get("p4") is True:
                result = candidate
                break
        if result is None or result.get("mode") != mode or result.get("world") != self.world:
            raise RuntimeError(f"native {mode} did not return valid P4 JSON: {text[-1200:]}")
        return result, elapsed

    def _pointer_value(self) -> dict[str, Any] | None:
        if not self.pointer.exists():
            return None
        try:
            pointer = json.loads(self.pointer.read_text(encoding="utf-8"))
            current, previous = pointer["current"], pointer["previous"]
            if pointer.get("schema") != 1 or not isinstance(current, str):
                raise ValueError("invalid pointer schema")
            if pointer.get("world") != self.world:
                raise ValueError("accepted pointer belongs to another world")
            if previous is not None and not isinstance(previous, str):
                raise ValueError("invalid previous generation")
            for generation_id in (current, previous):
                if generation_id is not None:
                    self._validate_generation(generation_id)
            return pointer
        except Exception as exc:
            raise UncertainState(f"accepted pointer/generation is unknown: {exc}") from exc

    def _generation_path(self, generation_id: str) -> Path:
        if not generation_id or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in generation_id):
            raise ValueError("invalid generation id")
        path = (self.generations / generation_id).resolve()
        if path.parent != self.generations.resolve():
            raise ValueError("generation path escaped experiment root")
        return path

    def _validate_generation(self, generation_id: str) -> dict[str, Any]:
        directory = self._generation_path(generation_id)
        semantic_path = directory / "semantic.json"
        user_dir = directory / "userdir"
        if not directory.is_dir() or not semantic_path.is_file():
            raise ValueError(f"generation {generation_id} is missing")
        semantic = json.loads(semantic_path.read_text(encoding="utf-8"))
        if semantic.get("generation_id") != generation_id or semantic.get("world") != self.world:
            raise ValueError("generation identity/world mismatch")
        _, actual_files = _size_and_files(user_dir)
        if actual_files != semantic.get("native_files"):
            raise ValueError("native file list differs from semantic manifest")
        required = semantic.get("required_native_files")
        missing_required = sorted(set(required) - set(actual_files)) if isinstance(required, list) else []
        if not isinstance(required, list) or missing_required:
            raise ValueError(f"required native files missing: {missing_required[:8]}")
        ids = semantic.get("operation_ids")
        if not isinstance(ids, list):
            raise ValueError("generation has no executed operation IDs")
        seen: set[str] = set()
        for entry in ids:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or entry["id"] in seen:
                raise ValueError("invalid or duplicate executed operation ID")
            seen.add(entry["id"])
        return semantic

    def _publish(self, generation_id: str, previous_id: str | None) -> float:
        pointer = {"schema": 1, "world": self.world, "current": generation_id, "previous": previous_id}
        temp = self.root / f"pointer-{uuid.uuid4().hex}.tmp"
        start = time.perf_counter()
        with temp.open("x", encoding="utf-8") as stream:
            json.dump(pointer, stream, sort_keys=True, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, self.pointer)
        _fsync_dir(self.root)
        return (time.perf_counter() - start) * 1000

    def _copy_generation_userdir(self, generation_id: str, target: Path) -> tuple[int, float]:
        self._validate_generation(generation_id)
        started = time.perf_counter()
        shutil.copytree(self._generation_path(generation_id) / "userdir", target, symlinks=True,
                        copy_function=shutil.copy2)
        _make_writable(target)
        size, _ = _size_and_files(target)
        return size, (time.perf_counter() - started) * 1000

    def _write_candidate(self, candidate_id: str, user_dir: Path,
                         semantic: dict[str, Any], fault: str | None = None,
                         failpoint: str | None = None) -> tuple[Path, int, float]:
        tmp = self.generations / f".candidate-{candidate_id}-{uuid.uuid4().hex}"
        target = tmp / "userdir"
        tmp.mkdir()
        start = time.perf_counter()
        target.mkdir()
        if fault == "full":
            source_file = user_dir / f"save/{self.world}/master.gsav"
            if not source_file.is_file():
                source_file = next((path for path in user_dir.rglob("*") if path.is_file()), None)
            if source_file is None:
                raise ValueError("candidate has no file to exercise ENOSPC")
            try:
                with source_file.open("rb") as source, open("/dev/full", "wb") as full:
                    shutil.copyfileobj(source, full)
                    full.flush()
                    os.fsync(full.fileno())
            except OSError as exc:
                if exc.errno != errno.ENOSPC:
                    raise
                raise OSError(errno.ENOSPC, f"copy candidate file {source_file.name} to /dev/full") from exc
            raise AssertionError("/dev/full did not report ENOSPC")
        for source in sorted(user_dir.rglob("*"), key=lambda p: (not p.is_dir(), p.as_posix())):
            relative = source.relative_to(user_dir)
            destination = target / relative
            if source.is_symlink():
                raise ValueError(f"native userdir contains symlink: {relative}")
            if source.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            elif source.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                if failpoint == "mid_generation_copy":
                    _kill_self()
        _, native_files = _size_and_files(target)
        if fault == "missing":
            missing = f"save/{self.world}/master.gsav"
            if missing not in native_files:
                raise ValueError("candidate does not contain required world master save")
            (target / missing).unlink()
        elif fault == "malformed":
            malformed = f"save/{self.world}/master.gsav"
            if malformed not in native_files:
                raise ValueError("candidate does not contain required world master save")
            (target / malformed).write_bytes(b"not a Cataclysm save\n")
        semantic["native_files"] = sorted(p.relative_to(target).as_posix() for p in target.rglob("*") if p.is_file())
        with (tmp / "semantic.json").open("x", encoding="utf-8") as stream:
            json.dump(semantic, stream, sort_keys=True, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        _sync_tree(target)
        _fsync_file(tmp / "semantic.json")
        _fsync_dir(tmp)
        byte_count, _ = _size_and_files(target)
        generation_bytes = byte_count + (tmp / "semantic.json").stat().st_size
        if generation_bytes > MAX_BYTES:
            raise ValueError(f"native generation exceeds {MAX_BYTES} bytes: {generation_bytes}")
        for path in [target, *target.rglob("*")]:
            path.chmod(path.stat().st_mode & ~0o222)
        (tmp / "semantic.json").chmod(0o444)
        tmp.chmod(0o555)
        final = self._generation_path(candidate_id)
        if final.exists():
            raise FileExistsError(f"generation already exists: {candidate_id}")
        os.replace(tmp, final)
        _fsync_dir(self.generations)
        if failpoint == "after_generation_rename_before_publish":
            _kill_self()
        return final, generation_bytes, (time.perf_counter() - start) * 1000

    def _remove_unaccepted_generation(self, generation_id: str) -> None:
        pointer = self._pointer_value()
        accepted = set() if pointer is None else {pointer["current"], pointer["previous"]}
        if generation_id in accepted:
            raise UncertainState("refusing to remove a generation referenced by accepted pointer")
        path = self._generation_path(generation_id)
        if not path.exists():
            return
        _remove_writable_tree(path)
        _fsync_dir(self.generations)

    def _cleanup_work(self, fail: bool = False) -> None:
        if fail:
            raise OSError("injected scratch cleanup failure")
        for child in list(self.work.iterdir()):
            if child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
            elif child.is_file() and not child.is_symlink():
                child.unlink()
        for child in self.generations.glob(".candidate-*"):
            if child.is_dir() and not child.is_symlink():
                _remove_writable_tree(child)
            elif child.is_file() and not child.is_symlink():
                child.unlink()
        pointer = self._pointer_value()
        accepted = set() if pointer is None else {pointer["current"], pointer["previous"]}
        for child in self.generations.iterdir():
            if child.is_dir() and not child.is_symlink() and not child.name.startswith(".") and child.name not in accepted:
                _remove_writable_tree(child)
        for child in self.root.glob("pointer-*.tmp"):
            if child.is_file() and not child.is_symlink():
                child.unlink()

    def _read_generation(self, generation_id: str) -> tuple[dict[str, Any], dict[str, Any], float]:
        semantic = self._validate_generation(generation_id)
        scratch = self.work / f"read-{uuid.uuid4().hex}"
        scratch.mkdir()
        user_dir = scratch / "userdir"
        copy_bytes, copy_ms = self._copy_generation_userdir(generation_id, user_dir)
        try:
            result, wall_ms = self._native("read", user_dir)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
        result["read_copy_bytes"] = copy_bytes
        result["read_copy_ms"] = copy_ms
        return semantic, result, wall_ms

    def read(self) -> dict[str, Any]:
        pointer = self._pointer_value()
        if pointer is None:
            raise UncertainState("no accepted generation")
        semantic, result, wall_ms = self._read_generation(pointer["current"])
        return {"status": "accepted", "generation_id": pointer["current"],
                "previous_generation_id": pointer["previous"], "snapshot": result["after"],
                "operation_ids": semantic["operation_ids"], "native_read_wall_ms": wall_ms,
                "native_read_copy_ms": result["read_copy_ms"],
                "bootstrap_ms": result.get("bootstrap_ms"), "load_ms": result.get("load_ms"),
                "core_data_ms": result.get("core_data_ms")}

    def init(self, fault: str | None = None) -> dict[str, Any]:
        if self.pointer.exists():
            self._pointer_value()
            raise ValueError("experiment already initialized")
        stage = self.work / f"stage-{uuid.uuid4().hex}"
        stage.mkdir()
        user_dir = stage / "userdir"
        try:
            result, create_wall_ms = self._native("create", user_dir)
            readback, read_wall_ms = self._native("read", user_dir)
            if result.get("after") != readback.get("after"):
                raise RuntimeError("native create/read snapshots differ")
            total, native_files = _size_and_files(user_dir)
            required_files = [f"save/{self.world}/master.gsav"]
            if not set(required_files).issubset(native_files):
                raise ValueError(f"native create omitted required persistence files: {required_files}")
            generation_id = uuid.uuid4().hex
            semantic = {"schema": 1, "generation_id": generation_id, "world": self.world,
                        "technical_facts": [], "operation_ids": [],
                        "required_native_files": required_files, "native_files": sorted(native_files)}
            _, copied_bytes, copy_ms = self._write_candidate(generation_id, user_dir, semantic, fault=fault)
            try:
                _, candidate_readback, candidate_read_wall_ms = self._read_generation(generation_id)
                if candidate_readback.get("after") != result.get("after"):
                    difference = _first_difference(result.get("after"), candidate_readback.get("after"))
                    raise RuntimeError(f"initial candidate native reload/readback mismatch: {difference}")
            except BaseException:
                self._remove_unaccepted_generation(generation_id)
                raise
            publication_ms = self._publish(generation_id, None)
            return {"status": "initialized", "generation_id": generation_id,
                    "native_files": native_files, "native_bytes": total,
                    "copy_bytes": copied_bytes, "create_wall_ms": create_wall_ms,
                    "readback_wall_ms": read_wall_ms, "candidate_readback_wall_ms": candidate_read_wall_ms,
                    "copy_fsync_ms": copy_ms, "publication_ms": publication_ms,
                    "native": candidate_readback}
        finally:
            shutil.rmtree(stage, ignore_errors=True)

    def apply(self, operation_id: str, operation: str, fault: str | None = None,
              failpoint: str | None = None, native_failpoint: str | None = None) -> dict[str, Any]:
        if not operation_id or len(operation_id) > 200:
            raise ValueError("operation id must be 1..200 characters")
        if operation not in OPERATIONS:
            raise ValueError(f"unsupported native operation: {operation}")
        if failpoint and failpoint not in FAILPOINTS:
            raise ValueError(f"unsupported coordinator failpoint: {failpoint}")
        if failpoint == "before_effect":
            _kill_self()
        pointer = self._pointer_value()
        if pointer is None:
            raise UncertainState("no accepted generation")
        previous_id = pointer["current"]
        old = self._validate_generation(previous_id)
        request = {"operation": operation}
        for entry in old["operation_ids"]:
            if entry["id"] == operation_id:
                if entry["request"] != request:
                    raise ValueError("operation ID reused with a different request")
                _, accepted_readback, _ = self._read_generation(previous_id)
                return {"status": "already_applied", "operation_id": operation_id,
                        "generation_id": previous_id, "native_apply_invoked": False,
                        "snapshot": accepted_readback["after"]}
        stage = self.work / f"stage-{uuid.uuid4().hex}"
        stage.mkdir()
        stage_user_dir = stage / "userdir"
        try:
            stage_copy_bytes, stage_copy_ms = self._copy_generation_userdir(previous_id, stage_user_dir)
            native_apply, apply_wall_ms = self._native("apply", stage_user_dir, operation,
                                                       failpoint=native_failpoint,
                                                       wait_kill=bool(native_failpoint))
            if failpoint == "after_native_save_before_semantic":
                _kill_self()
            before = native_apply.get("before")
            actual = native_apply.get("after")
            if not isinstance(actual, dict):
                raise RuntimeError("native apply has no physical snapshot")
            candidate_id = uuid.uuid4().hex
            operations = [*old["operation_ids"], {"id": operation_id, "request": request,
                                                    "status": "applied"}]
            facts = [*old["technical_facts"], {"operation_id": operation_id,
                                                "operation": operation, "status": "applied"}]
            semantic = {"schema": 1, "generation_id": candidate_id, "world": self.world,
                        "technical_facts": facts, "operation_ids": operations,
                        "required_native_files": old["required_native_files"],
                        "native_files": []}
            final, copied_bytes, copy_fsync_ms = self._write_candidate(
                candidate_id, stage_user_dir, semantic, fault=fault, failpoint=failpoint)
            try:
                read_start = time.perf_counter()
                _, native_read, native_read_wall_ms = self._read_generation(candidate_id)
                read_validation_ms = (time.perf_counter() - read_start) * 1000
                if native_read.get("after") != actual:
                    difference = _first_difference(actual, native_read.get("after"))
                    raise RuntimeError(f"candidate native reload/readback mismatch: {difference}")
            except BaseException:
                self._remove_unaccepted_generation(candidate_id)
                raise
            publication_ms = self._publish(candidate_id, previous_id)
            if failpoint == "after_atomic_before_receipt":
                _kill_self()
            # The candidate is accepted before this receipt; callers may safely retry its ID.
            bootstrap_excluded_ms = float(native_read.get("bootstrap_ms", 0))
            core_data_excluded_ms = float(native_read.get("core_data_ms", 0))
            candidate_reload_budget_ms = max(0.0, read_validation_ms - bootstrap_excluded_ms - core_data_excluded_ms)
            apply_load_budget_ms = max(0.0, float(native_apply.get("load_ms", 0)) -
                                       float(native_apply.get("core_data_ms", 0)))
            budget_ms = (apply_load_budget_ms + float(native_apply.get("save_ms", 0)) +
                         stage_copy_ms + copy_fsync_ms +
                         publication_ms + candidate_reload_budget_ms)
            return {"status": "applied", "operation_id": operation_id, "generation_id": candidate_id,
                    "native_apply_invoked": True, "before": before, "snapshot": actual,
                    "native_save_ms": native_apply.get("save_ms"), "native_apply_load_ms": native_apply.get("load_ms"),
                    "native_readback_load_ms": native_read.get("load_ms"),
                    "native_apply_bootstrap_ms": native_apply.get("bootstrap_ms"),
                    "native_readback_bootstrap_ms": native_read.get("bootstrap_ms"),
                    "native_apply_core_data_ms": native_apply.get("core_data_ms"),
                    "native_readback_core_data_ms": native_read.get("core_data_ms"),
                    "apply_load_budget_ms": apply_load_budget_ms,
                    "native_apply_wall_ms": apply_wall_ms, "native_readback_wall_ms": native_read_wall_ms,
                    "candidate_read_copy_ms": native_read.get("read_copy_ms"),
                    "staging_copy_ms": stage_copy_ms, "staging_copy_bytes": stage_copy_bytes,
                    "candidate_reload_budget_ms": candidate_reload_budget_ms,
                    "bootstrap_excluded_ms": bootstrap_excluded_ms,
                    "core_data_excluded_ms": core_data_excluded_ms,
                    "copy_fsync_ms": copy_fsync_ms, "publication_ms": publication_ms,
                    "read_validation_wall_ms": read_validation_ms, "p4_budget_ms": budget_ms,
                    "copy_bytes": copied_bytes, "native_operation": operation}
        finally:
            shutil.rmtree(stage, ignore_errors=True)


def _run_child(script: Path, args: list[str], env: dict[str, str] | None = None,
               kill_marker: str | None = None) -> tuple[int, str, float]:
    started = time.perf_counter()
    process = subprocess.Popen([sys.executable, str(script), *args], stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, env=env, bufsize=1)
    lines: list[str] = []
    try:
        assert process.stdout is not None
        if kill_marker:
            deadline = time.monotonic() + 900
            while time.monotonic() < deadline:
                line = process.stdout.readline()
                if line:
                    lines.append(line)
                    if kill_marker in line:
                        process.kill()
                        process.wait(timeout=30)
                        return process.returncode or -signal.SIGKILL, "".join(lines), (time.perf_counter()-started)*1000
                elif process.poll() is not None:
                    break
            raise TimeoutError(f"coordinator failpoint was not reached: {kill_marker}")
        tail, _ = process.communicate(timeout=1800)
        lines.append(tail)
        return process.returncode, "".join(lines), (time.perf_counter() - started) * 1000
    except BaseException:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise


def _run_cli(script: Path, experiment: Path, native_root: Path, binary: Path, world: str,
             command: str, *args: str, extra_env: dict[str, str] | None = None,
             kill_marker: str | None = None) -> tuple[int, dict[str, Any] | None, str, float]:
    argv = ["--experiment-root", str(experiment), "--native-root", str(native_root),
            "--binary", str(binary), "--world", world, command, *args]
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    rc, output, elapsed = _run_child(script, argv, env, kill_marker)
    result = None
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            result = value
            break
    return rc, result, output, elapsed


def run_fault_suite(script: Path, native_root: Path, binary: Path, evidence_root: Path) -> dict[str, Any]:
    """Actual process/native faults; every recovery is a new coordinator/native process."""
    evidence_root.mkdir(parents=True, exist_ok=True)
    scenarios = [
        ("before_effect", "before_effect", None, None, "old", "move_east"),
        ("after_effect", None, "after_effect", None, "old", "move_east"),
        ("mid_native_save", None, "mid_save", None, "old", "move_east"),
        ("after_native_save_before_semantic", "after_native_save_before_semantic", None, None, "old", "move_east"),
        ("after_generation_rename_before_publish", "after_generation_rename_before_publish", None, "orphan", "old", "move_east"),
        ("after_atomic_before_receipt", "after_atomic_before_receipt", None, None, "new", "move_east"),
        ("after_receipt_narrator_failure", None, None, None, "new", "move_east"),
        ("partial_activity", None, None, "partial_hacksaw", "new", "partial_hacksaw"),
        ("write_missing_malformed", None, None, "faults", "old", "move_east"),
        ("midcopy_and_cleanup_failure", "mid_generation_copy", None, None, "old", "move_east"),
    ]
    rows: list[dict[str, Any]] = []
    for name, coordinator_fault, native_fault, special, expected, operation in scenarios:
        case_root = evidence_root / f"fault-{name}"
        case_root.mkdir(parents=True, exist_ok=True)
        world = f"p4_{name}"
        rc, created, output, _ = _run_cli(script, case_root, native_root, binary, world, "init")
        if rc or not created or created.get("status") != "initialized":
            raise RuntimeError(f"fault suite {name}: native init failed: {output[-1200:]}")
        if name == "midcopy_and_cleanup_failure":
            rc, setup, output, _ = _run_cli(script, case_root, native_root, binary, world, "apply",
                                            "--operation-id", "cleanup-preservation-setup",
                                            "--operation", "move_east")
            if rc or not setup:
                raise RuntimeError(f"cleanup preservation setup failed: {output[-900:]}")
        original = _run_cli(script, case_root, native_root, binary, world, "read")
        if original[0] or not original[1]:
            raise RuntimeError(f"fault suite {name}: initial native read failed")
        old_snapshot = original[1]["snapshot"]
        pointer_before = json.loads((case_root / "current.json").read_text(encoding="utf-8"))
        operation_id = f"fault-{name}-operation"
        extra: dict[str, str] = {}
        if coordinator_fault:
            extra["NOVGOROD_P4_COORDINATOR_FAILPOINT"] = coordinator_fault
        if special == "faults":
            # Each candidate fault is a separate native operation attempt against the same accepted generation.
            for candidate_fault in ("full", "missing", "malformed"):
                rc, result, output, _ = _run_cli(script, case_root, native_root, binary, world, "apply",
                                                  "--operation-id", operation_id + "-" + candidate_fault,
                                                  "--operation", "move_east",
                                                  extra_env={"NOVGOROD_P4_CANDIDATE_FAULT": candidate_fault})
                expected_reason = {"full": "/dev/full", "missing": "required native files missing",
                                   "malformed": "native read exited"}[candidate_fault]
                if rc == 0 or not result or expected_reason not in result.get("error", ""):
                    raise RuntimeError(f"fault injection {candidate_fault} did not abort: {output[-900:]}")
            read = _run_cli(script, case_root, native_root, binary, world, "read")
            if read[0] or read[1]["snapshot"] != old_snapshot:
                raise RuntimeError("write/missing/malformed candidate fault changed accepted state")
            cleanup = _run_cli(script, case_root, native_root, binary, world, "cleanup")
            if cleanup[0]:
                raise RuntimeError(f"failed candidate scratch cleanup: {cleanup[2][-900:]}")
            rows.append({"scenario": name, "result": "old", "faults": ["dev_full_ENOSPC", "missing_required_file", "malformed_native_file"], "native_apply_calls": 3})
            continue
        if native_fault:
            extra["NOVGOROD_P4_NATIVE_FAILPOINT"] = native_fault
        if coordinator_fault:
            marker = "P4_COORDINATOR_FAILPOINT_REACHED:" + coordinator_fault
            extra["NOVGOROD_P4_COORDINATOR_FAILPOINT"] = coordinator_fault
        else:
            marker = None
        apply_result: dict[str, Any] | None = None
        if special != "faults":
            args = ["--operation-id", operation_id, "--operation", operation]
            rc, apply_result, output, _ = _run_cli(script, case_root, native_root, binary, world, "apply",
                                                    *args, extra_env=extra, kill_marker=marker)
            if name == "after_receipt_narrator_failure" and rc == 0:
                # Technical delivery failure occurs after durable receipt; no LLM/provider is invoked.
                extra["NOVGOROD_P4_DELIVERY_FAIL"] = "1"
                rc, _, _, _ = _run_cli(script, case_root, native_root, binary, world, "deliver-failure",
                                        extra_env=extra)
                if rc != 0:
                    raise RuntimeError("simulated technical receipt-delivery failure did not occur")
            elif expected == "old" and rc == 0:
                raise RuntimeError(f"{name}: expected abrupt/faulted process, got success")
            elif expected == "new" and rc != 0:
                stopped_after_publish = name == "after_atomic_before_receipt" and marker in output
                native_mismatch = apply_result and "candidate native reload/readback mismatch" in apply_result.get("error", "")
                if not stopped_after_publish and not native_mismatch:
                    raise RuntimeError(f"{name}: expected candidate accepted or a diagnosed native mismatch: {output[-900:]}")
        if name == "midcopy_and_cleanup_failure":
            cleanup = _run_cli(script, case_root, native_root, binary, world, "cleanup",
                               extra_env={"NOVGOROD_P4_CLEANUP_FAIL": "1"})
            if cleanup[0] == 0 or "cleanup failure" not in cleanup[2]:
                raise RuntimeError("injected scratch cleanup failure did not occur")
            pointer = json.loads((case_root / "current.json").read_text(encoding="utf-8"))
            accepted_before = {pointer["current"], pointer["previous"]}
            if not all((case_root / "generations" / item).is_dir() for item in accepted_before if item):
                raise RuntimeError("cleanup failure removed current/previous accepted generation")
            cleanup = _run_cli(script, case_root, native_root, binary, world, "cleanup")
            if cleanup[0] or not cleanup[1] or cleanup[1].get("status") != "scratch_cleaned":
                raise RuntimeError("scratch cleanup retry failed")
        if special == "orphan":
            accepted = {pointer_before["current"], pointer_before["previous"]}
            orphan_before = [p.name for p in (case_root / "generations").iterdir()
                             if p.is_dir() and not p.name.startswith(".") and p.name not in accepted]
            if len(orphan_before) != 1:
                raise RuntimeError(f"generation-rename crash did not leave exactly one unaccepted generation: {orphan_before}")
            cleanup = _run_cli(script, case_root, native_root, binary, world, "cleanup")
            if cleanup[0] or not cleanup[1] or cleanup[1].get("status") != "scratch_cleaned":
                raise RuntimeError(f"orphan generation cleanup failed: {cleanup[2][-900:]}")
            orphan_after = [p.name for p in (case_root / "generations").iterdir()
                            if p.is_dir() and not p.name.startswith(".") and p.name not in accepted]
            if orphan_after:
                raise RuntimeError(f"orphan generation survived cleanup: {orphan_after}")
        state = _run_cli(script, case_root, native_root, binary, world, "read")
        if state[0] or not state[1]:
            raise RuntimeError(f"{name}: recovery could not read accepted state: {state[2][-900:]}")
        actual_expected = old_snapshot if expected == "old" else None
        if actual_expected is not None and state[1]["snapshot"] != actual_expected:
            raise RuntimeError(f"{name}: accepted state is neither expected old state")
        ids = [entry["id"] for entry in state[1]["operation_ids"]]
        if expected == "new" and ids.count(operation_id) != 1:
            if not apply_result or "candidate native reload/readback mismatch" not in apply_result.get("error", ""):
                raise RuntimeError(f"{name}: new accepted operation ID missing or duplicated")
            if state[1]["generation_id"] != pointer_before["current"] or state[1]["snapshot"] != old_snapshot:
                raise RuntimeError(f"{name}: rejected generation changed accepted physical state")
            rows.append({"scenario": name, "result": "BLOCKED", "expected": "new",
                         "reason": apply_result["error"], "current_generation_unchanged": True,
                         "fresh_process_recovery_read_latency_ms": state[3]})
            continue
        if name == "partial_activity":
            snapshot = state[1]["snapshot"]
            activity = snapshot.get("activity")
            if not activity or activity == "ACT_NULL" or snapshot.get("activity_moves_left", 0) <= 0:
                raise RuntimeError("partial hacksaw activity did not resume after native reload")
        retry = _run_cli(script, case_root, native_root, binary, world, "apply",
                         "--operation-id", operation_id, "--operation", operation)
        expected_retry = "already_applied" if expected == "new" else "applied"
        retry_blocked = bool(retry[0] and retry[1] and "candidate native reload/readback mismatch" in retry[1].get("error", ""))
        if not retry_blocked and (retry[0] or retry[1] is None or retry[1].get("status") != expected_retry):
            raise RuntimeError(f"{name}: idempotent recovery retry failed: {retry[2][-900:]}")
        if expected == "new" and not retry_blocked and retry[1].get("native_apply_invoked") is not False:
            raise RuntimeError(f"{name}: idempotent retry invoked native apply again")
        if retry_blocked:
            after_retry = _run_cli(script, case_root, native_root, binary, world, "read")
            if after_retry[0] or after_retry[1]["generation_id"] != state[1]["generation_id"]:
                raise RuntimeError(f"{name}: failed candidate retry changed accepted generation")
            rows.append({"scenario": name, "result": "BLOCKED", "expected": expected,
                         "reason": retry[1]["error"], "pre_retry_state": expected,
                         "current_generation_unchanged": True,
                         "fresh_process_recovery_read_latency_ms": state[3],
                         "retry_operation_latency_ms": retry[3]})
            continue
        rows.append({"scenario": name, "result": expected, "operation_ids": state[1]["operation_ids"],
                     "generation_id": state[1]["generation_id"], "snapshot": state[1]["snapshot"],
                     "orphan_generation_pruned": special == "orphan",
                     "cleanup_failure_preserved_current_previous": name == "midcopy_and_cleanup_failure",
                     "native_retry_apply_invoked": None if retry_blocked else retry[1].get("native_apply_invoked"),
                     "retry_blocked_by_native_readback": retry_blocked,
                     "fresh_process_recovery_read_latency_ms": state[3],
                     "retry_operation_latency_ms": retry[3]})
    for operation in ("pickup_rock", "pickup_stick"):
        case_root = evidence_root / f"fault-{operation}-strict-uid"
        case_root.mkdir(parents=True, exist_ok=True)
        world = f"p4_{operation}_strict_uid"
        rc, created, output, _ = _run_cli(script, case_root, native_root, binary, world, "init")
        if rc or not created:
            raise RuntimeError(f"{operation} fixture init failed: {output[-900:]}")
        before = _run_cli(script, case_root, native_root, binary, world, "read")
        if before[0] or not before[1]:
            raise RuntimeError(f"{operation} fixture read failed: {before[2][-900:]}")
        pointer_before = json.loads((case_root / "current.json").read_text(encoding="utf-8"))
        operation_id = f"strict-{operation}-1"
        rc, applied, output, apply_wall = _run_cli(script, case_root, native_root, binary, world, "apply",
                                                   "--operation-id", operation_id, "--operation", operation)
        error = applied.get("error", "") if applied else output[-900:]
        if rc and "candidate native reload/readback mismatch" in error and ".uid:" in error:
            after = _run_cli(script, case_root, native_root, binary, world, "read")
            pointer_after = json.loads((case_root / "current.json").read_text(encoding="utf-8"))
            if after[0] or pointer_after != pointer_before or after[1]["snapshot"] != before[1]["snapshot"]:
                raise RuntimeError(f"{operation} UID mismatch changed accepted generation")
            rows.append({"scenario": operation, "result": "BLOCKED", "reason": error,
                         "native_apply_invoked": True, "current_generation_unchanged": True,
                         "snapshot_before": before[1]["snapshot"], "snapshot_after": after[1]["snapshot"],
                         "apply_latency_ms": apply_wall, "recovery_read_latency_ms": after[3]})
        elif rc == 0 and applied and applied.get("status") == "applied":
            retry = _run_cli(script, case_root, native_root, binary, world, "apply",
                             "--operation-id", operation_id, "--operation", operation)
            if retry[0] or not retry[1] or retry[1].get("status") != "already_applied" or retry[1].get("native_apply_invoked"):
                raise RuntimeError(f"{operation} idempotent retry failed")
            rows.append({"scenario": operation, "result": "roundtrip_validated",
                         "native_apply_invoked": True, "retry_native_apply_invoked": False,
                         "generation_id": applied["generation_id"]})
        else:
            raise RuntimeError(f"{operation} did not produce strict UID mismatch or valid roundtrip: {output[-900:]}")
    init_root = evidence_root / "fault-init-candidate-validation"
    init_root.mkdir(parents=True, exist_ok=True)
    init_world = "p4_init_candidate_validation"
    rc, rejected_init, output, _ = _run_cli(script, init_root, native_root, binary, init_world, "init",
                                            extra_env={"NOVGOROD_P4_CANDIDATE_FAULT": "malformed"})
    if rc == 0 or not rejected_init or "native read exited" not in rejected_init.get("error", ""):
        raise RuntimeError(f"malformed initial candidate was not rejected: {output[-900:]}")
    if (init_root / "current.json").exists() or any(p.is_dir() and not p.name.startswith(".")
                                                       for p in (init_root / "generations").iterdir()):
        raise RuntimeError("rejected initial candidate published a pointer or generation")
    rc, accepted_init, output, _ = _run_cli(script, init_root, native_root, binary, init_world, "init")
    if rc or not accepted_init or accepted_init.get("status") != "initialized":
        raise RuntimeError(f"valid initial candidate failed after rejected attempt: {output[-900:]}")
    rows.append({"scenario": "initial_candidate_validation", "result": "old_then_valid_init",
                 "malformed_candidate_published": False, "valid_generation_id": accepted_init["generation_id"],
                 "candidate_readback_wall_ms": accepted_init["candidate_readback_wall_ms"]})
    unknown_root = evidence_root / "fault-unknown-accepted-generation"
    unknown_root.mkdir(parents=True, exist_ok=True)
    unknown_world = "p4_unknown_generation"
    rc, created, output, _ = _run_cli(script, unknown_root, native_root, binary, unknown_world, "init")
    if rc or not created:
        raise RuntimeError(f"unknown-generation fixture init failed: {output[-900:]}")
    pointer = json.loads((unknown_root / "current.json").read_text(encoding="utf-8"))
    pointer["current"] = "generation-missing-on-disk"
    (unknown_root / "current.json").write_text(json.dumps(pointer), encoding="utf-8")
    rejected = _run_cli(script, unknown_root, native_root, binary, unknown_world, "apply",
                        "--operation-id", "unknown-generation-op", "--operation", "pickup_rock")
    if rejected[0] == 0 or not rejected[1] or "accepted pointer/generation is unknown" not in rejected[1].get("error", ""):
        raise RuntimeError("unknown accepted generation was not rejected fail-closed")
    if pointer["current"] != json.loads((unknown_root / "current.json").read_text(encoding="utf-8"))["current"]:
        raise RuntimeError("unknown accepted pointer was silently rolled back")
    rows.append({"scenario": "unknown_accepted_generation", "result": "uncertain_stop",
                 "native_apply_invoked": False})
    report = {"schema": 1, "native": str(binary),
              "native_root": str(native_root),
              "purpose": "coordinator fault recovery on strictly validated move_east; pickup/stick UID cases remain independent blockers",
              "status": "BLOCKED" if any(row.get("result") == "BLOCKED" or row.get("blocked_by_native_readback") or row.get("retry_blocked_by_native_readback") for row in rows) else "passed",
              "scenarios": rows}
    report_path = evidence_root / "fault-suite.json"
    report_path.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (evidence_root / "commands.json").write_text(json.dumps({
        "native_root": str(native_root), "binary": str(binary), "script": str(script),
        "command_template": "python3 generations.py --experiment-root <unused-required-path> --native-root <native> --binary <cata_test> suite --evidence-root <evidence>",
        "seed": 17, "reporter": "junit", "filter": NATIVE_FILTER,
        "general_crash_operation": "move_east", "pickup_stick_strict_uid_cases": ["pickup_rock", "pickup_stick"],
        "failpoints": sorted(FAILPOINTS | {"after_effect", "mid_save"}),
    }, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    for child in evidence_root.glob("fault-*"):
        if child.is_dir() and not child.is_symlink():
            _remove_writable_tree(child)
    return report


def run_metrics(script: Path, native_root: Path, binary: Path, evidence_root: Path,
                samples: int = 20, operation: str = "pickup_rock") -> dict[str, Any]:
    if operation not in OPERATIONS:
        raise ValueError(f"unsupported native operation: {operation}")
    evidence_root.mkdir(parents=True, exist_ok=True)
    measurements = []
    for index in range(samples + 1):
        name = "warmup" if index == 0 else f"sample-{index:02d}"
        root = evidence_root / f"metrics-{name}"
        root.mkdir(parents=True, exist_ok=True)
        world = f"p4_{name.replace('-', '_')}"
        rc, init_result, output, _ = _run_cli(script, root, native_root, binary, world, "init")
        if rc or not init_result:
            raise RuntimeError(f"metrics init failed {name}: {output[-1000:]}")
        rc, result, output, total_ms = _run_cli(script, root, native_root, binary, world, "apply",
                                                "--operation-id", f"metrics-{name}-{operation}",
                                                "--operation", operation)
        if rc or not result or result.get("status") != "applied":
            raise RuntimeError(f"metrics apply failed {name}: {output[-1000:]}")
        row = {"name": name, "operation_latency_ms": total_ms,
               "p4_budget_ms": result["p4_budget_ms"],
               "native_save_ms": result["native_save_ms"],
               "native_apply_load_ms": result["native_apply_load_ms"],
               "native_readback_load_ms": result["native_readback_load_ms"],
               "native_apply_bootstrap_ms": result["native_apply_bootstrap_ms"],
               "native_readback_bootstrap_ms": result["native_readback_bootstrap_ms"],
               "native_apply_core_data_ms": result["native_apply_core_data_ms"],
               "native_readback_core_data_ms": result["native_readback_core_data_ms"],
               "apply_load_budget_ms": result["apply_load_budget_ms"],
               "native_apply_wall_ms": result["native_apply_wall_ms"],
               "native_readback_wall_ms": result["native_readback_wall_ms"],
               "staging_copy_ms": result["staging_copy_ms"],
               "candidate_read_copy_ms": result["candidate_read_copy_ms"],
               "candidate_reload_budget_ms": result["candidate_reload_budget_ms"],
               "bootstrap_excluded_ms": result["bootstrap_excluded_ms"],
               "core_data_excluded_ms": result["core_data_excluded_ms"],
               "copy_fsync_ms": result["copy_fsync_ms"],
               "publication_ms": result["publication_ms"],
               "copy_bytes": result["copy_bytes"]}
        if index:
            measurements.append(row)
    values = [row["p4_budget_ms"] for row in measurements]
    p95 = _nearest_rank(values, 0.95)
    report = {"schema": 1, "warmup_samples_excluded": 1, "samples": measurements,
              "operation": operation,
              "purpose": "diagnostic_only" if operation != "pickup_rock" else "persistence_acceptance_candidate",
              "p95_method": "nearest_rank", "p95_rank": math.ceil(0.95 * len(values)),
              "measured_sample_count": len(measurements),
              "p4_budget_p95_ms": p95, "max_generation_bytes": max(r["copy_bytes"] for r in measurements),
              "p4_budget_limit_ms": 5000, "generation_limit_bytes": MAX_BYTES,
              "meets_limits": p95 <= 5000 and max(r["copy_bytes"] for r in measurements) <= MAX_BYTES,
              "full_operation_latency_ms": [r["operation_latency_ms"] for r in measurements]}
    (evidence_root / "metrics.json").write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (evidence_root / "commands.json").write_text(json.dumps({
        "native_root": str(native_root), "binary": str(binary), "script": str(script),
        "operation": operation, "samples_argument": samples,
        "command_template": "python3 generations.py --experiment-root <unused-required-path> --native-root <native> --binary <cata_test> metrics --evidence-root <evidence> --samples 20 --operation move_east",
        "seed": 17, "reporter": "junit", "filter": NATIVE_FILTER,
    }, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    for child in evidence_root.glob("metrics-*"):
        if child.is_dir() and not child.is_symlink():
            _remove_writable_tree(child)
    return report


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-root", type=Path, required=True)
    parser.add_argument("--native-root", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--world", default="novgorod_p4")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("read")
    apply = sub.add_parser("apply")
    apply.add_argument("--operation-id", required=True)
    apply.add_argument("--operation", required=True, choices=sorted(OPERATIONS))
    sub.add_parser("deliver-failure")
    sub.add_parser("cleanup")
    suite = sub.add_parser("suite")
    suite.add_argument("--evidence-root", type=Path, required=True)
    metrics = sub.add_parser("metrics")
    metrics.add_argument("--evidence-root", type=Path, required=True)
    metrics.add_argument("--samples", type=int, default=20)
    metrics.add_argument("--operation", choices=sorted(OPERATIONS), default="pickup_rock")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        if args.command == "suite":
            report = run_fault_suite(Path(__file__).resolve(), args.native_root.resolve(),
                                     args.binary.resolve(), args.evidence_root.resolve())
            print(json.dumps(report, sort_keys=True))
            return 0 if report["status"] == "passed" else 2
        if args.command == "metrics":
            if args.samples != 20:
                raise ValueError("P4 acceptance requires exactly 20 measured samples")
            report = run_metrics(Path(__file__).resolve(), args.native_root.resolve(),
                                 args.binary.resolve(), args.evidence_root.resolve(), args.samples,
                                 args.operation)
            print(json.dumps(report, sort_keys=True))
            return 0 if report["meets_limits"] else 2
        coordinator = Coordinator(args.experiment_root, args.native_root, args.binary, args.world)
        if args.command == "init":
            result = coordinator.init(fault=os.environ.get("NOVGOROD_P4_CANDIDATE_FAULT"))
        elif args.command == "read":
            result = coordinator.read()
        elif args.command == "apply":
            result = coordinator.apply(args.operation_id, args.operation,
                                       fault=os.environ.get("NOVGOROD_P4_CANDIDATE_FAULT"),
                                       failpoint=os.environ.get("NOVGOROD_P4_COORDINATOR_FAILPOINT"),
                                       native_failpoint=os.environ.get("NOVGOROD_P4_NATIVE_FAILPOINT"))
        elif args.command == "cleanup":
            coordinator._pointer_value()
            coordinator._cleanup_work(fail=os.environ.get("NOVGOROD_P4_CLEANUP_FAIL") == "1")
            result = {"status": "scratch_cleaned"}
        else:
            if os.environ.get("NOVGOROD_P4_DELIVERY_FAIL") != "1":
                raise ValueError("deliver-failure is a test-only technical delivery simulation")
            result = {"status": "technical_delivery_failed_after_receipt"}
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
