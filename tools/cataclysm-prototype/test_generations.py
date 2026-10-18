"""Small stdlib checks for coordinator invariants; not P4/native evidence."""

import importlib.util
import json
import copy
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

    def p3_request(self, operation_id: str = "speech-1") -> dict:
        return {"schema": "p3_p4_semantic_request_v1", "operation_id": operation_id,
            "intent": "Скажи это", "state_version": 1, "listener_ids": ["npc:1"],
            "statement": {"utterance": "Скажи это"}, "observation_revision": 1,
            "validated_semantic_input": {"validated_plan": {"speech": "Скажи это"},
                "owner_context": {"conversation_id": "conversation-1"},
                "working_state": {"statements": []}},
            "native_operation": {"schema": "p3_native_operation_request_v1",
                "operation_id": operation_id, "primitive": "speak",
                "expected_native_observation": {"revision": 1}}}

    def make_join_fixture(self, root: Path, mismatch_reload: bool = False):
        native = root / "native"
        native.mkdir()
        binary = native / "cata_test"
        binary.write_text("placeholder", encoding="utf-8")

        class FakeP3Adapter:
            def __init__(self):
                self.applies = 0
                self.reads = 0
                self.mismatch_reload = mismatch_reload

            def observation(self, user_dir: Path):
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                self.reads += 1
                if self.mismatch_reload:
                    snapshot = {**snapshot, "turn": snapshot["turn"] + 1}
                return {"revision": snapshot["turn"], "native_snapshot": snapshot}

            def create(self, user_dir: Path):
                user_dir.mkdir(parents=True, exist_ok=True)
                (user_dir / "save/unit_world").mkdir(parents=True, exist_ok=True)
                (user_dir / "save/unit_world/master.gsav").write_bytes(b"save")
                (user_dir / "save/unit_world/novgorod_rng_state").write_bytes(b"rng")
                snapshot = {"turn": 1, "position": [0, 0, 0], "heard": []}
                (user_dir / "snapshot.json").write_text(json.dumps(snapshot), encoding="utf-8")
                return {"observation": self.observation(user_dir)}

            def read(self, user_dir: Path):
                return {"observation": self.observation(user_dir)}

            def apply(self, user_dir: Path, request: dict):
                self.applies += 1
                before = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                after = {**before, "turn": before["turn"] + 3, "heard": ["npc-native"]}
                (user_dir / "snapshot.json").write_text(json.dumps(after), encoding="utf-8")
                readback = {"operation_id": request["operation_id"], "status": "applied",
                    "before": before, "after": after}
                return {"before_observation": {"revision": before["turn"],
                        "native_snapshot": before},
                    "after_observation": {"revision": after["turn"], "native_snapshot": after},
                    "native_readback": readback,
                    "conversation_outcome": {"owner_result": "committed"}}

        return generations.Coordinator(root / "experiment", native, binary, "unit_world",
            p3_adapter=FakeP3Adapter())

    def test_snapshot_comparison_reports_uid_changes(self) -> None:
        left = {"items": [{"uid": 3589023, "type": "rock"}]}
        right = {"items": [{"uid": 3591375, "type": "rock"}]}
        self.assertEqual(
            generations._first_difference(left, right),
            "snapshot.items[0].uid: apply=3589023, reload=3591375",
        )

    def test_nearest_rank_p95_uses_rank_19_for_twenty_samples(self) -> None:
        self.assertEqual(generations._nearest_rank(list(map(float, range(1, 21))), 0.95), 19.0)

    def test_p3_join_replay_returns_stored_owner_outcome_without_adapter_calls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            coordinator = self.make_join_fixture(root)

            def native_read(self, mode, user_dir, *args, **kwargs):
                if mode != "read":
                    raise AssertionError(f"unexpected P4 operation: {mode}")
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                return {"after": snapshot, "read_copy_ms": 0.1}, 0.1

            try:
                with patch.object(generations.Coordinator, "_native", native_read):
                    coordinator.init()
                    request = self.p3_request()
                    first = coordinator.apply("speech-1", "p3_speech", semantic_request=request)
                    calls = (coordinator.p3_adapter.applies, coordinator.p3_adapter.reads)
                    replay = coordinator.apply("speech-1", "p3_speech", semantic_request=request)
                    self.assertEqual(replay["status"], "already_applied")
                    self.assertFalse(replay["native_apply_invoked"])
                    self.assertEqual(replay["native_readback"], first["native_readback"])
                    self.assertEqual(replay["conversation_outcome"], first["conversation_outcome"])
                    self.assertEqual((coordinator.p3_adapter.applies, coordinator.p3_adapter.reads), calls)
                    changed = self.p3_request()
                    changed["intent"] = "Скажи другое"
                    with self.assertRaisesRegex(ValueError, "different request"):
                        coordinator.apply("speech-1", "p3_speech", semantic_request=changed)
                    self.assertEqual((coordinator.p3_adapter.applies, coordinator.p3_adapter.reads), calls)
            finally:
                coordinator.close()

    def test_p3_candidate_reload_mismatch_does_not_move_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            coordinator = self.make_join_fixture(root)

            def native_read(self, mode, user_dir, *args, **kwargs):
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                return {"after": snapshot, "read_copy_ms": 0.1}, 0.1

            try:
                with patch.object(generations.Coordinator, "_native", native_read):
                    coordinator.init()
                    accepted = coordinator._pointer_value()["current"]
                    coordinator.p3_adapter.mismatch_reload = True
                    with self.assertRaisesRegex(RuntimeError, "candidate native P3 reload/readback mismatch"):
                        coordinator.apply("speech-1", "p3_speech", semantic_request=self.p3_request())
                    self.assertEqual(coordinator._pointer_value()["current"], accepted)
                    self.assertEqual(coordinator.p3_adapter.applies, 1)
            finally:
                coordinator.close()

    def test_p3_adapter_exception_leaves_pointer_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            coordinator = self.make_join_fixture(Path(directory))
            def native_read(self, mode, user_dir, *args, **kwargs):
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                return {"after": snapshot, "read_copy_ms": 0.1}, 0.1
            try:
                with patch.object(generations.Coordinator, "_native", native_read):
                    coordinator.init()
                    accepted = coordinator._pointer_value()["current"]
                    with patch.object(coordinator.p3_adapter, "apply", side_effect=RuntimeError("owner failed")):
                        with self.assertRaisesRegex(RuntimeError, "owner failed"):
                            coordinator.apply("speech-1", "p3_speech", semantic_request=self.p3_request())
                    self.assertEqual(coordinator._pointer_value()["current"], accepted)
            finally:
                lock = coordinator._lock_stream
                coordinator.close()
                self.assertTrue(lock.closed)

    def test_p3_prepublication_failpoints_leave_pointer_unchanged(self) -> None:
        for failpoint in ("after_native_save_before_semantic", "after_generation_rename_before_publish"):
            with self.subTest(failpoint=failpoint), tempfile.TemporaryDirectory() as directory:
                coordinator = self.make_join_fixture(Path(directory))
                def native_read(self, mode, user_dir, *args, **kwargs):
                    snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                    return {"after": snapshot, "read_copy_ms": 0.1}, 0.1
                try:
                    with patch.object(generations.Coordinator, "_native", native_read):
                        coordinator.init()
                        accepted = coordinator._pointer_value()["current"]
                        with patch.object(generations, "_kill_self", side_effect=KeyboardInterrupt):
                            with self.assertRaises(KeyboardInterrupt):
                                coordinator.apply("speech-1", "p3_speech", semantic_request=self.p3_request(),
                                                  failpoint=failpoint)
                        self.assertEqual(coordinator._pointer_value()["current"], accepted)
                        self.assertEqual(coordinator.p3_adapter.applies, 1)
                finally:
                    coordinator.close()

    def test_p3_postpublication_failpoint_replays_stored_outcome_without_apply(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            coordinator = self.make_join_fixture(Path(directory))
            def native_read(self, mode, user_dir, *args, **kwargs):
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                return {"after": snapshot, "read_copy_ms": 0.1}, 0.1
            try:
                with patch.object(generations.Coordinator, "_native", native_read):
                    coordinator.init()
                    request = self.p3_request()
                    with patch.object(generations, "_kill_self", side_effect=KeyboardInterrupt):
                        with self.assertRaises(KeyboardInterrupt):
                            coordinator.apply("speech-1", "p3_speech", semantic_request=request,
                                              failpoint="after_atomic_before_receipt")
                    applies = coordinator.p3_adapter.applies
                    replay = coordinator.apply("speech-1", "p3_speech", semantic_request=request)
                    self.assertEqual(replay["status"], "already_applied")
                    self.assertFalse(replay["native_apply_invoked"])
                    self.assertEqual(replay["conversation_outcome"], {"owner_result": "committed"})
                    self.assertEqual(coordinator.p3_adapter.applies, applies)
            finally:
                coordinator.close()

    def test_p3_keeps_prior_semantic_entries_and_rejects_changed_payload_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            coordinator = self.make_join_fixture(Path(directory))
            def native_read(self, mode, user_dir, *args, **kwargs):
                snapshot = json.loads((user_dir / "snapshot.json").read_text(encoding="utf-8"))
                return {"after": snapshot, "read_copy_ms": 0.1}, 0.1
            try:
                with patch.object(generations.Coordinator, "_native", native_read):
                    coordinator.init()
                    first = self.p3_request("speech-1")
                    coordinator.apply("speech-1", "p3_speech", semantic_request=first)
                    second = self.p3_request("speech-2")
                    second["observation_revision"] = 4
                    second["native_operation"]["expected_native_observation"]["revision"] = 4
                    coordinator.apply("speech-2", "p3_speech", semantic_request=second)
                    third = self.p3_request("speech-3")
                    third["observation_revision"] = 7
                    third["native_operation"]["expected_native_observation"]["revision"] = 7
                    coordinator.apply("speech-3", "p3_speech", semantic_request=third)
                    entries = coordinator._validate_generation(coordinator._pointer_value()["current"])["operation_ids"]
                    self.assertEqual([entry["id"] for entry in entries], ["speech-1", "speech-2", "speech-3"])
                    variations = []
                    changed = copy.deepcopy(first)
                    changed["statement"]["utterance"] = "другое"
                    variations.append(changed)
                    changed = copy.deepcopy(first)
                    changed["validated_semantic_input"]["validated_plan"]["speech"] = "другое"
                    variations.append(changed)
                    changed = copy.deepcopy(first)
                    changed["observation_revision"] = 2
                    changed["native_operation"]["expected_native_observation"]["revision"] = 2
                    variations.append(changed)
                    for changed in variations:
                        with self.assertRaisesRegex(ValueError, "different request"):
                            coordinator.apply("speech-1", "p3_speech", semantic_request=changed)
            finally:
                coordinator.close()

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
