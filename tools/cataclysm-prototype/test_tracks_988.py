import copy
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

import check_wild_surroundings as checker


ALLOWLIST = Path(__file__).resolve().with_name("wild-surroundings-allowlist.tsv")
TRACK_FIELD_IDS = (
    "fd_human_footprint_n",
    "fd_human_footprint_w",
    "fd_human_footprint_s",
    "fd_human_footprint_e",
    "fd_bird_footprint_n",
    "fd_bird_footprint_w",
    "fd_bird_footprint_s",
    "fd_bird_footprint_e",
    "fd_animal_footprint_n",
    "fd_animal_footprint_w",
    "fd_animal_footprint_s",
    "fd_animal_footprint_e",
)
KNOWN_FIELD_ID = "fd_dust"
OUT_OF_ALLOWLIST_FIELD_ID = "fd_nuke_gas"
UNKNOWN_TRACK_ID = "fd_unknown_track"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def saved_submap(field_ids):
    fields = []
    for x, identifier in enumerate(field_ids):
        fields.extend((x, 0, [identifier, 1, 0, {}]))
    return {
        "version": 40,
        "coordinates": [0, 0, 0],
        "turn_last_touched": 0,
        "temperature": 0,
        "terrain": [["t_dirt", 144]],
        "radiation": [0, 144],
        "furniture": [],
        "items": [],
        "traps": [],
        "fields": fields,
        "cosmetics": [],
        "phase_reverts": [],
        "spawns": [],
        "vehicles": [],
        "partial_constructions": [],
        "computers": [],
    }


def perception_packet(field_id):
    frame = {
        "journal": {"player_messages": {"messages": [], "curmes": 0}},
        "sounds": [],
        "place": {
            "name": "поле",
            "overmap_position": [0, 0, 0],
            "outside": True,
            "roofed": False,
            "z": 0,
        },
        "position": [0, 0, 0],
        "light": {
            "ambient": 1.0,
            "label": "дневной свет",
            "sight_range": 60,
            "unimpaired_range": 60,
            "vision_threshold": 1.0,
        },
        "sky_diagnostic": {
            "sun_light": 0.0,
            "moon_light": 0.0,
            "sun_moon_light": 0.0,
            "moon_phase": 0,
            "natural_light_cached": 0.0,
            "sun_light_at_tile_cached": 0.0,
            "weather_light_multiplier": 1.0,
            "weather_light_modifier": 0.0,
            "weather_sun_multiplier": 1.0,
            "weather_sight_penalty": 0.0,
            "weather_sound_attenuation": 0.0,
        },
        "clock": {
            "date_time": "tuesday 12:00",
            "time": "12:00",
            "time_of_day": "day",
            "hour": 12,
            "night": False,
        },
        "weather": {
            "type": "tracks_test_clear",
            "name": "ясно",
            "temperature_c": 5.0,
            "local_temperature_c": 5.0,
            "wind_speed_mph": 0.0,
            "wind_direction_degrees": 0.0,
            "wind_label": "штиль",
            "wind_direction_label": "север",
            "precipitation": 0,
            "rains": False,
        },
        "visible_terrain": [],
        "visible_furniture": [],
        "objects": [
            {
                "kind": "field",
                "position": [0, 0, 0],
                "distance": 0,
                "direction": "здесь",
                "type": field_id,
                "name": "пыль",
                "intensity": 1,
            }
        ],
        "creatures": [],
        "inventory": [],
        "player_state": {
            "name": "путник",
            "male": True,
            "bmi_fat": 0.0,
            "pain_label": "нет боли",
            "hunger_label": "сыт",
            "thirst_label": "не хочет пить",
            "sleepiness_label": "не хочет спать",
            "weariness_label": "отдохнул",
            "warmth_label": "комфортно",
            "activity_label": "ничего не делает",
            "weight_label": "обычный",
            "pain": 0,
            "carried_weight_grams": None,
            "carry_capacity_grams": 0,
            "stamina": 0,
            "wetness_label": None,
            "body_parts": [],
            "wielded": None,
            "activity_id": "",
        },
    }
    return {
        "sequence": 1,
        "native_turn": 0,
        "reason": "tracks-988 fixture",
        "input_number": 1,
        "kind": "full",
        "frame": frame,
    }


class TrackAllowlistTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="tracks-988-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = self.root / "data"
        self.mod = self.data / "mods" / "tracks_test_mod"
        self.run = self.root / "capture"
        self.world = self.root / "world"
        for directory in (self.data / "core", self.data / "json", self.mod, self.run, self.world):
            directory.mkdir(parents=True, exist_ok=True)

        write_json(self.mod / "weather.json", {
            "type": "weather_type",
            "id": "tracks_test_clear",
            "name": "ясно",
        })
        (self.mod / "mtype_taxon_crosswalk.csv").write_text(
            "mtype_id,decision\n", encoding="utf-8"
        )
        write_json(self.world / "o.0.0", {
            "layers": [[ ["field", 32400] ] for _ in range(21)],
        })
        (self.run / "inputs.log").write_text("", encoding="utf-8")
        (self.run / "perception.jsonl").write_text("", encoding="utf-8")

    def checked_context(self):
        context = checker.Context(Namespace(
            mode="day",
            run=self.run,
            reference_inputs=None,
            world=self.world,
            mod=self.mod,
            allowlist=ALLOWLIST,
        ))
        self.assertEqual(context.errors, [], "inline checker inputs must parse cleanly")
        checker.check_permissions(context)
        return context

    def check_saved_submap(self, submap):
        self.run.joinpath("perception.jsonl").write_text("", encoding="utf-8")
        write_json(self.world / "maps" / "0.0.0.map", [submap])
        context = self.checked_context()
        checker.check_submaps(context)
        return context

    def check_perception(self, packet):
        self.run.joinpath("perception.jsonl").write_text(
            json.dumps(packet, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        context = self.checked_context()
        checker.check_frames(context)
        return context

    def assert_only_field_rejection(self, context, identifier, source_kind):
        self.assertEqual(
            [(issue[0], issue[2], issue[3]) for issue in context.violations],
            [("поле", source_kind, identifier)],
            f"expected only a field rejection for {identifier}: {context.violations!r}",
        )

    def test_native_save_accepts_all_twelve_track_ids(self):
        for field_id in TRACK_FIELD_IDS:
            with self.subTest(field_id=field_id):
                context = self.check_saved_submap(saved_submap([field_id]))
                self.assertEqual(
                    context.violations,
                    [],
                    f"native save rejected allowlisted {field_id}: {context.violations!r}",
                )

    def test_perception_capture_accepts_all_twelve_track_ids(self):
        for field_id in TRACK_FIELD_IDS:
            with self.subTest(field_id=field_id):
                context = self.check_perception(perception_packet(field_id))
                self.assertEqual(
                    context.violations,
                    [],
                    f"perception capture rejected allowlisted {field_id}: {context.violations!r}",
                )

    def test_native_save_accepts_existing_fd_dust(self):
        context = self.check_saved_submap(saved_submap([KNOWN_FIELD_ID]))
        self.assertEqual(context.violations, [])

    def test_perception_capture_accepts_existing_fd_dust(self):
        context = self.check_perception(perception_packet(KNOWN_FIELD_ID))
        self.assertEqual(context.violations, [])

    def test_a15_native_save_rejects_fd_nuke_gas(self):
        known = saved_submap([KNOWN_FIELD_ID])
        outside_allowlist = copy.deepcopy(known)
        outside_allowlist["fields"][2][0] = OUT_OF_ALLOWLIST_FIELD_ID
        self.assertEqual(self.check_saved_submap(known).violations, [])
        self.assert_only_field_rejection(
            self.check_saved_submap(outside_allowlist), OUT_OF_ALLOWLIST_FIELD_ID, "field"
        )

    def test_a15_perception_capture_rejects_fd_nuke_gas(self):
        known = perception_packet(KNOWN_FIELD_ID)
        outside_allowlist = copy.deepcopy(known)
        outside_allowlist["frame"]["objects"][0]["type"] = OUT_OF_ALLOWLIST_FIELD_ID
        self.assertEqual(self.check_perception(known).violations, [])
        self.assert_only_field_rejection(
            self.check_perception(outside_allowlist), OUT_OF_ALLOWLIST_FIELD_ID, "objects"
        )

    def test_a16_native_save_rejects_fd_unknown_track(self):
        known = saved_submap([KNOWN_FIELD_ID])
        unknown = copy.deepcopy(known)
        unknown["fields"][2][0] = UNKNOWN_TRACK_ID
        self.assertEqual(self.check_saved_submap(known).violations, [])
        self.assert_only_field_rejection(
            self.check_saved_submap(unknown), UNKNOWN_TRACK_ID, "field"
        )

    def test_a16_perception_capture_rejects_fd_unknown_track(self):
        known = perception_packet(KNOWN_FIELD_ID)
        unknown = copy.deepcopy(known)
        unknown["frame"]["objects"][0]["type"] = UNKNOWN_TRACK_ID
        self.assertEqual(self.check_perception(known).violations, [])
        self.assert_only_field_rejection(
            self.check_perception(unknown), UNKNOWN_TRACK_ID, "objects"
        )

    def test_a17_native_save_accepts_all_twelve_ids_in_flat_fields(self):
        submap = saved_submap(TRACK_FIELD_IDS)
        context = self.check_saved_submap(submap)
        for field_id in TRACK_FIELD_IDS:
            with self.subTest(field_id=field_id):
                self.assertEqual(
                    [issue for issue in context.violations if issue[3] == field_id],
                    [],
                    f"flat native save rejected allowlisted {field_id}: {context.violations!r}",
                )
        self.assertEqual(
            [issue for issue in context.violations if issue[3] not in TRACK_FIELD_IDS],
            [],
            f"flat native save has non-track violations: {context.violations!r}",
        )


if __name__ == "__main__":
    unittest.main()
