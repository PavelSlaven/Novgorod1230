"""Small stdlib checks for coordinator invariants; not P4/native evidence."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("generations.py")
SPEC = importlib.util.spec_from_file_location("p4_generations", MODULE_PATH)
assert SPEC and SPEC.loader
generations = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generations)


class GenerationInvariantTests(unittest.TestCase):
    def make_coordinator(self, root: Path) -> generations.Coordinator:
        native = root / "native"
        native.mkdir()
        binary = native / "cata_test"
        binary.write_text("placeholder", encoding="utf-8")
        return generations.Coordinator(root / "experiment", native, binary, "unit_world")

    def test_snapshot_comparison_reports_uid_changes(self) -> None:
        left = {"items": [{"uid": 3589023, "type": "rock"}]}
        right = {"items": [{"uid": 3591375, "type": "rock"}]}
        self.assertEqual(
            generations._first_difference(left, right),
            "snapshot.items[0].uid: apply=3589023, reload=3591375",
        )

    def test_nearest_rank_p95_uses_rank_19_for_twenty_samples(self) -> None:
        self.assertEqual(generations._nearest_rank(list(map(float, range(1, 21))), 0.95), 19.0)

    def test_pointer_replacement_keeps_current_and_previous_together(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            # Publish pointer metadata directly; generation validation is deliberately
            # outside this atomic-replacement unit check.
            coordinator._publish("generation-new", "generation-old")
            self.assertEqual(
                json.loads(coordinator.pointer.read_text(encoding="utf-8")),
                {"schema": 1, "world": "unit_world", "current": "generation-new",
                 "previous": "generation-old"},
            )
            self.assertFalse(list(coordinator.root.glob("pointer-*.tmp")))

    def test_unknown_current_generation_fails_closed_without_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            coordinator.pointer.write_text(json.dumps({
                "schema": 1, "world": "unit_world",
                "current": "missing-current", "previous": "missing-previous",
            }), encoding="utf-8")
            before = coordinator.pointer.read_bytes()
            with self.assertRaises(generations.UncertainState):
                coordinator._pointer_value()
            self.assertEqual(coordinator.pointer.read_bytes(), before)

    def test_cleanup_removes_orphan_but_keeps_current_and_previous_read_only_generations(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            required = ["save/unit_world/master.gsav"]
            for generation_id in ("current", "previous", "orphan"):
                directory = coordinator.generations / generation_id
                user_dir = directory / "userdir"
                save = user_dir / required[0]
                save.parent.mkdir(parents=True)
                save.write_bytes(generation_id.encode())
                semantic = {"generation_id": generation_id, "world": "unit_world",
                            "required_native_files": required, "native_files": required,
                            "operation_ids": []}
                directory.mkdir(exist_ok=True)
                (directory / "semantic.json").write_text(json.dumps(semantic), encoding="utf-8")
                for path in (save, save.parent, user_dir, directory / "semantic.json", directory):
                    path.chmod(path.stat().st_mode & ~0o222)
            coordinator.pointer.write_text(json.dumps({
                "schema": 1, "world": "unit_world", "current": "current", "previous": "previous",
            }), encoding="utf-8")
            coordinator._cleanup_work()
            self.assertTrue((coordinator.generations / "current").is_dir())
            self.assertTrue((coordinator.generations / "previous").is_dir())
            self.assertFalse((coordinator.generations / "orphan").exists())

    def test_ephemeral_cache_file_is_in_manifest_but_not_required_file_set(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            generation_id = "cache-fixture"
            directory = coordinator.generations / generation_id
            user_dir = directory / "userdir"
            required = "save/unit_world/master.gsav"
            (user_dir / "save/unit_world").mkdir(parents=True)
            (user_dir / required).write_bytes(b"native-save")
            (user_dir / "cache/config/lastworld.json.123.fb").parent.mkdir(parents=True)
            (user_dir / "cache/config/lastworld.json.123.fb").write_bytes(b"ephemeral")
            files = ["cache/config/lastworld.json.123.fb", required]
            directory.mkdir(exist_ok=True)
            (directory / "semantic.json").write_text(json.dumps({
                "generation_id": generation_id, "world": "unit_world",
                "required_native_files": [required], "native_files": files,
                "operation_ids": [],
            }), encoding="utf-8")
            self.assertEqual(coordinator._validate_generation(generation_id)["native_files"], files)


if __name__ == "__main__":
    unittest.main()
