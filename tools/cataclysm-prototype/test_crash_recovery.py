import copy
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("crash_recovery",
    Path(__file__).with_name("crash_recovery.py"))
assert SPEC and SPEC.loader
crash = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crash)


def state():
    return {"native_snapshot": {
        "position": [60, 60, 0], "moves": 100, "turn": 100,
        "clock": {"native_turn": 100, "seconds_since_world_start": 100},
        "activity": "", "activity_moves_left": 0, "world_signature": "ground:rock",
        "inventory_items": [], "ground_items": [{"uid": 7, "type": "rock"}],
        "visible_npcs": [{"actor_id": "42", "position": [60, 62, 0]}]},
        "player_messages": [["BASE_PLAYER", 1]],
        "npcs": [{"actor_id": "42", "records": [
            {"kind": "heard", "speaker_ref": "avatar", "listener_ref": "npc:42",
             "text": "BASE_PLAYER", "turn": 100},
            {"kind": "said", "speaker_ref": "npc:42", "listener_ref": "avatar",
             "text": "BASE_NPC", "turn": 100}]}]}


def idle_from(loaded):
    idle = copy.deepcopy(loaded)
    idle["native_snapshot"]["turn"] += 1
    idle["native_snapshot"]["clock"]["native_turn"] += 1
    idle["native_snapshot"]["clock"]["seconds_since_world_start"] += 1
    return idle


class CrashRecoveryComparisonTests(unittest.TestCase):
    def setUp(self):
        self.baseline = state()
        self.loaded = copy.deepcopy(self.baseline)
        self.idle = idle_from(self.loaded)

    def check_failure(self, substring):
        errors = crash.compare_recovery(self.baseline, self.loaded, self.idle)
        self.assertTrue(any(substring in error for error in errors), errors)

    def test_matching_recovery(self):
        self.assertEqual(crash.compare_recovery(
            self.baseline, self.loaded, self.idle), [])

    def test_extra_heard_record(self):
        self.loaded["npcs"][0]["records"].append({
            "kind": "heard", "speaker_ref": "avatar", "listener_ref": "npc:42",
            "text": "UNSAVED_PLAYER", "turn": 101})
        self.check_failure("NPC records")

    def test_extra_said_record(self):
        self.loaded["npcs"][0]["records"].append({
            "kind": "said", "speaker_ref": "npc:42", "listener_ref": "avatar",
            "text": "UNSAVED_NPC", "turn": 101})
        self.check_failure("NPC records")

    def test_extra_player_message(self):
        self.loaded["player_messages"].append(["UNSAVED_NPC", 1])
        self.check_failure("player messages")

    def test_idle_allows_new_unrelated_messages(self):
        self.idle["player_messages"].append(["A nearby NPC reloads.", 1])
        self.assertEqual(crash.compare_recovery(
            self.baseline, self.loaded, self.idle), [])

    def test_idle_rejects_domain_change(self):
        self.idle["native_snapshot"]["position"] = [61, 60, 0]
        self.check_failure("idle world.position")

    def test_idle_rejects_duplicate_baseline_speech(self):
        self.idle["player_messages"].append(["BASE_PLAYER", 1])
        self.check_failure("idle duplicated BASE_PLAYER")

    def test_mixed_sav_master_generation(self):
        self.loaded["native_snapshot"]["position"] = [61, 60, 0]
        self.loaded["native_snapshot"]["turn"] = 101
        self.loaded["player_messages"].append(["UNSAVED_PLAYER", 1])
        self.assertEqual(self.loaded["npcs"], self.baseline["npcs"])
        self.check_failure("loaded world.position")
        self.check_failure("loaded world.turn")
        self.check_failure("loaded player messages")

    def test_missing_time_after_idle(self):
        self.idle["native_snapshot"]["turn"] = 100
        self.check_failure("idle turn did not advance")

    def test_stale_request_uses_coordinator_resolved_envelope(self):
        other = {"actor_id": "10", "records": []}
        self.baseline["npcs"].insert(0, other)
        observation = {"revision": 100, "turn": 100,
                       "actors": [{"actor_ref": "avatar", "actor_id": "1"},
                                  {"actor_ref": "npc:42", "actor_id": "42"}]}
        request = crash.stale_operation(observation, self.baseline)
        self.assertEqual(request["actor_id"], "42")
        resolved = [{"ref": "avatar", "id": "1"}]
        self.assertEqual(request["references"]["actors"], resolved)
        self.assertEqual(request["expected_native_observation"]["references"]["actors"],
                         resolved)
        self.assertNotEqual(request["references"]["actors"], ["avatar"])

    def test_stale_npc_response(self):
        self.loaded["npcs"][0]["records"][1]["text"] = "STALE_NPC_RESPONSE"
        self.check_failure("STALE_NPC_RESPONSE")


if __name__ == "__main__":
    unittest.main()
