"""Small stdlib checks for coordinator invariants; not P4/native evidence."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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

    def test_metrics_cannot_overwrite_an_earlier_evidence_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report = root / "metrics.json"
            report.write_text("previous result", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                generations.run_metrics(MODULE_PATH, root, root / "unused", root, preload=True)
            self.assertEqual(report.read_text(encoding="utf-8"), "previous result")

    def test_failed_preload_metrics_keep_native_inputs_for_diagnosis(self) -> None:
        """A failing native adapter must not erase the world needed to reproduce it."""
        class FailingCoordinator:
            def __init__(self, root, *args, **kwargs):
                self.root = root
                root.mkdir(parents=True, exist_ok=True)
                self._lock_stream = (root / ".lock").open("a+")

            def init(self):
                world = self.root / "generations/accepted/userdir"
                world.mkdir(parents=True)
                (world / "native-save").write_bytes(b"original native input")
                return {"generation_id": "accepted", "native": {"after": {"rng_state": "17"}}}

            def apply(self, *args):
                (self.root / "failed-native-input").write_bytes(b"partial native input")
                raise RuntimeError("native validation failed")

            def close(self):
                pass

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(generations, "Coordinator", FailingCoordinator), \
                    patch.object(generations, "_profile_base", return_value=("data", "binary")), \
                    patch.object(generations, "_profile_key", return_value="profile"), \
                    patch.object(generations, "NativeHost") as host_type:
                host = host_type.return_value
                host.request.return_value = ({"after": {"rng_state": "17"}}, 1.0)
                with self.assertRaisesRegex(RuntimeError, "native validation failed"):
                    generations._run_preload_metrics(MODULE_PATH, root, root / "unused", root,
                                                     20, "pickup_rock")
                host.close.assert_called_once()
            self.assertEqual((root / "metrics-warmup/failed-native-input").read_bytes(),
                             b"partial native input")
            self.assertEqual((root / "metrics-profile-userdir/native-save").read_bytes(),
                             b"original native input")

    def test_profile_key_changes_when_definition_options_change(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            user_dir = root / "profile"
            options = user_dir / "config" / "options.json"
            options.parent.mkdir(parents=True)
            options.write_text(json.dumps({"WORLD_END": False}), encoding="utf-8")
            with patch.object(generations, "_profile_base", return_value=("data", "binary")):
                before = generations._profile_key(coordinator.binary, coordinator.native_root,
                                                  user_dir, "unit_world")
                options.write_text(json.dumps({"WORLD_END": True}), encoding="utf-8")
                after = generations._profile_key(coordinator.binary, coordinator.native_root,
                                                 user_dir, "unit_world")
            self.assertNotEqual(before, after)

    def test_profile_key_changes_when_same_custom_definition_path_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            user_dir = root / "profile"
            custom = user_dir / "save/unit_world/mods/example/items.json"
            custom.parent.mkdir(parents=True)
            custom.write_text('{"id":"first"}', encoding="utf-8")
            profile_base = ("data", "binary")
            before = generations._profile_key(coordinator.binary, coordinator.native_root,
                                              user_dir, "unit_world", profile_base)
            custom.write_text('{"id":"changed"}', encoding="utf-8")
            after = generations._profile_key(coordinator.binary, coordinator.native_root,
                                             user_dir, "unit_world", profile_base)
            self.assertNotEqual(before, after)

    def test_profile_key_rejects_custom_definition_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            user_dir = root / "profile"
            target = root / "outside.json"
            target.write_text('{"id":"outside"}', encoding="utf-8")
            custom = user_dir / "save/unit_world/mods/mod_interactions/link.json"
            custom.parent.mkdir(parents=True)
            custom.symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlink"):
                generations._profile_key(coordinator.binary, coordinator.native_root,
                                         user_dir, "unit_world", ("data", "binary"))

    def test_preload_json_line_protocol_relays_child_result_and_closes_host(self) -> None:
        """Protocol fake only: this does not count as a native P4 result."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            coordinator = self.make_coordinator(root)
            self.addCleanup(coordinator._lock_stream.close)
            fake = coordinator.binary
            fake.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "world = os.environ['NOVGOROD_P4_WORLD']\n"
                "key = os.environ['NOVGOROD_P4_PROFILE_KEY']\n"
                "print('NOVGOROD_PRELOAD_READY\\t' + json.dumps({'parent_pid': os.getpid(), 'profile_key': key}), flush=True)\n"
                "for line in sys.stdin:\n"
                "  if line.strip() == 'QUIT': break\n"
                "  request = json.loads(line)\n"
                "  print('NOVGOROD_PRELOAD_CHILD\\t' + str(os.getpid()) + '\\t' + request['mode'] + '\\t' + request['op'], flush=True)\n"
                "  payload = json.dumps({'p4': True, 'mode': request['mode'], 'world': world, 'after': {'rng_state': 'unit'}}) + '\\n'\n"
                "  print('NOVGOROD_PRELOAD_OUTPUT\\t' + payload.encode().hex(), flush=True)\n"
                "  print('NOVGOROD_PRELOAD_DONE\\t' + str(os.getpid()) + '\\texit\\t0', flush=True)\n",
                encoding="utf-8")
            fake.chmod(0o700)
            user_dir = root / "profile"
            user_dir.mkdir()
            (user_dir / "save/unit_world/master.gsav").parent.mkdir(parents=True)
            (user_dir / "save/unit_world/master.gsav").write_bytes(b"save")
            with patch.object(generations, "_profile_base", return_value=("data", "binary")):
                profile_base = generations._profile_base(str(fake), str(coordinator.native_root))
                key = generations._profile_key(fake, coordinator.native_root, user_dir,
                                               "unit_world", profile_base)
                host = generations.NativeHost(fake, coordinator.native_root, "unit_world", user_dir,
                                              key, profile_base)
            try:
                result, elapsed = host.request("read", user_dir)
                self.assertEqual(result["after"]["rng_state"], "unit")
                self.assertGreaterEqual(elapsed, 0)
            finally:
                host.close()
            self.assertIsNotNone(host.process.poll())

    def test_init_rejects_missing_rng_before_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            coordinator = self.make_coordinator(Path(temporary))
            self.addCleanup(coordinator._lock_stream.close)

            def native_without_rng(mode: str, user_dir: Path):
                if mode == "create":
                    world = user_dir / "save/unit_world"
                    world.mkdir(parents=True)
                    (world / "master.gsav").write_bytes(b"native-save")
                return {"after": {"rng_state": "1"}}, 0.0

            with patch.object(coordinator, "_native", side_effect=native_without_rng):
                with self.assertRaisesRegex(ValueError, "novgorod_rng_state"):
                    coordinator.init()
            self.assertIsNone(coordinator._pointer_value())

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
