import copy
import csv
import itertools
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("check_wild_surroundings.py")
HERO_TYPES = {"tunic", "pants", "leather_belt", "footrags_wool", "mocassins", "leather_pouch"}
MASTER_TYPES = (HERO_TYPES - {"leather_pouch"}) | {"chisel", "ax"}
COURT_TERRAIN = {"t_dirt", "t_wall_wood", "t_floor", "t_door_c", "t_door_o", "t_open_air", "t_wood_treated_roof"}
COURT_FURNITURE = {"f_table", "f_clay_oven"}
COURT_ITEMS = {"flint_steel", "tinder", "firewood", "stick", "straw_basket", "stick_common", "log"}


def read_json(path):
    text = Path(path).read_text(encoding="utf-8-sig")
    if text.startswith("#"):
        text = text.split("\n", 1)[1]
    return json.loads(text)


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def set_oter(overmap, x, y, z, identifier):
    cells = [kind for kind, count in overmap["layers"][z + 10] for _ in range(count)]
    cells[y * 180 + x] = identifier
    overmap["layers"][z + 10] = [[kind, sum(1 for _ in group)] for kind, group in itertools.groupby(cells)]


def keep_items(value, allowed):
    if isinstance(value, list):
        return [keep_items(child, allowed) for child in value if not isinstance(child, dict) or "typeid" not in child or child["typeid"] in allowed]
    if isinstance(value, dict):
        return {key: keep_items(child, allowed) for key, child in value.items()}
    return value


class WildFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="wild-surroundings-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        required = ("NOVGOROD_WILD_REFERENCE_CAPTURE", "NOVGOROD_WILD_REFERENCE_WORLD", "NOVGOROD_WILD_MOD")
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError("Отсутствуют данные настоящей записи: " + ", ".join(missing))
        self.reference_run = Path(os.environ[required[0]])
        self.reference_world = Path(os.environ[required[1]])
        self.source_mod = Path(os.environ[required[2]])
        self.reference_inputs = self.reference_run / "inputs.log"
        self.run = self.root / "run"
        self.world = self.root / "world"
        self.mod = self.root / "runtime/data/mods/novgorod_dev_world"
        self.run.mkdir()
        self.world.mkdir()
        shutil.copytree(self.source_mod, self.mod)
        data = self.source_mod.parent.parent
        for name in ("core", "json"):
            (self.mod.parent.parent / name).symlink_to(data / name, target_is_directory=True)
        self.allowlist = self.root / "allowlist.tsv"
        shutil.copyfile(os.environ.get("NOVGOROD_WILD_ALLOWLIST", SCRIPT.with_name("wild-surroundings-allowlist.tsv")), self.allowlist)
        originals = [json.loads(line) for line in (self.reference_run / "perception.jsonl").read_text(encoding="utf-8").splitlines()]
        self.original_packets = originals
        source_frame = next(packet["frame"] for packet in originals if packet.get("kind") == "full")
        self.court = tuple(source_frame["place"]["overmap_position"])
        self.court_section = (self.court[0] // 180, self.court[1] // 180)
        self.inputs = [json.loads(line) for line in self.reference_inputs.read_text(encoding="utf-8").splitlines()]
        self.original_inputs = copy.deepcopy(self.inputs)
        self.inputs = [row for row in self.inputs if row["number"] != 16]
        for index, row in enumerate(self.inputs, 1):
            row["number"] = index
        self.packets = []
        state = None
        for packet in originals:
            if packet["kind"] == "full":
                state = copy.deepcopy(packet["frame"])
            else:
                state.update(copy.deepcopy(packet["changes"]))
            if packet["input_number"] == 16:
                continue
            cleaned = copy.deepcopy(packet)
            cleaned["kind"] = "full"
            cleaned.pop("changes", None)
            cleaned["frame"] = self.clean_frame(copy.deepcopy(state))
            if cleaned["input_number"] > 16:
                cleaned["input_number"] -= 1
            self.packets.append(cleaned)
        self.frame = next(packet["frame"] for packet in self.packets if any(c.get("kind") == "npc" for c in packet["frame"]["creatures"]))
        self.packet = next(packet for packet in self.packets if packet["frame"] is self.frame)
        section_name = f"o.{self.court_section[0]}.{self.court_section[1]}"
        original_overmap = read_json(self.reference_world / section_name)
        self.master = copy.deepcopy(next(npc for npc in original_overmap["npcs"] if npc.get("unique_id") == "novgorod_dev_master"))
        self.master = keep_items(self.master, MASTER_TYPES)
        if self.master.get("weapon", {}).get("typeid") not in MASTER_TYPES:
            self.master.pop("weapon", None)
        self.overmap = copy.deepcopy(original_overmap)
        self.overmap["layers"] = [[["deep_rock" if z < 0 else "field" if z == 0 else "open_air", 32400]] for z in range(-10, 11)]
        local = (self.court[0] % 180, self.court[1] % 180)
        set_oter(self.overmap, *local, 0, "novgorod_dev_courtyard_north")
        set_oter(self.overmap, *local, 1, "novgorod_dev_courtyard_roof_north")
        for key in ("monster_groups", "horde_map", "cities", "city_tiles", "radios", "tracked_vehicles", "camps"):
            self.overmap[key] = []
        self.overmap["npcs"] = [self.master]
        self.save_name = next(self.reference_world.glob("*.sav")).name
        self.save = read_json(self.reference_world / self.save_name)
        self.save["active_monsters"] = []
        self.save["player"] = keep_items(self.save["player"], HERO_TYPES)
        if self.save["player"].get("weapon", {}).get("typeid") not in HERO_TYPES:
            self.save["player"].pop("weapon", None)
        map_path = next(self.reference_world.glob(f"maps/**/{self.court[0]}.{self.court[1]}.0.map"))
        self.map_relative = map_path.relative_to(self.reference_world)
        self.submaps = copy.deepcopy(read_json(map_path))
        for submap in self.submaps:
            submap["terrain"] = [["t_dirt", 144]]
            submap["radiation"] = [0, 144]
            for key in ("furniture", "items", "fields", "traps", "cosmetics", "phase_reverts", "spawns", "vehicles", "partial_constructions", "computers"):
                submap[key] = []
        self.world_files = {section_name: self.overmap, self.save_name: self.save, str(self.map_relative): self.submaps, "mods.json": ["dda", "novgorod_dev_world"]}
        self.flush()

    def in_court(self, position):
        return len(position) == 3 and (position[0] // 24, position[1] // 24, position[2]) == self.court

    def clean_frame(self, frame):
        frame["sounds"] = []
        frame["journal"]["player_messages"]["messages"] = []
        frame["journal"]["player_messages"]["curmes"] = 0
        for key, allowed in (("visible_terrain", COURT_TERRAIN), ("visible_furniture", COURT_FURNITURE)):
            rows = []
            for row in frame[key]:
                row["positions"] = [position for position in row["positions"] if self.in_court(position)]
                if row["type"] in allowed and row["positions"]:
                    row["count"] = len(row["positions"])
                    rows.append(row)
            frame[key] = rows
        objects = []
        for obj in frame["objects"]:
            if not self.in_court(obj["position"]):
                continue
            kind = obj["kind"]
            if kind in ("door", "window") and obj.get("type") in COURT_TERRAIN or kind == "furniture" and obj.get("type") in COURT_FURNITURE or kind == "ground_item" and obj["item"]["type"] in COURT_ITEMS:
                objects.append(obj)
        frame["objects"] = objects
        frame["creatures"] = [creature for creature in frame["creatures"] if creature.get("kind") == "npc" and creature.get("type") == "novgorod_dev_master"]
        for creature in frame["creatures"]:
            creature["worn"] = [item for item in creature["worn"] if item["type"] in MASTER_TYPES]
            if creature["wielded"] is not None and creature["wielded"]["type"] not in MASTER_TYPES:
                creature["wielded"] = None
        frame["inventory"] = [item for item in frame["inventory"] if item["type"] in HERO_TYPES]
        if frame["player_state"]["wielded"] is not None and frame["player_state"]["wielded"]["type"] not in HERO_TYPES:
            frame["player_state"]["wielded"] = None
        frame["place"]["name"] = "двор плотника"
        return frame

    def flush(self):
        self.run.joinpath("perception.jsonl").write_text("".join(json.dumps(packet, ensure_ascii=False) + "\n" for packet in self.packets), encoding="utf-8")
        self.run.joinpath("inputs.log").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in self.inputs), encoding="utf-8")
        for name, value in self.world_files.items():
            write_json(self.world / name, value)

    def invoke(self, flush=True, extra=()):
        if flush:
            self.flush()
        return subprocess.run([sys.executable, str(SCRIPT), "--run", str(self.run), "--reference-inputs", str(self.reference_inputs), "--world", str(self.world), "--mod", str(self.mod), "--allowlist", str(self.allowlist), *extra], text=True, capture_output=True, encoding="utf-8")

    def assert_bad(self, rule, flush=True):
        result = self.invoke(flush=flush)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(rule + " — ", result.stdout)
        return result

    def assert_clean(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def add_allowance(self, kind, identifier, name="образец", reason="Природное событие образца настоящего кадра"):
        with self.allowlist.open("a", encoding="utf-8", newline="") as stream:
            csv.writer(stream, delimiter="\t").writerow([kind, identifier, name, "keep", "perception.jsonl:1", reason, "", ""])


class PermissionTests(WildFixture):
    def test_invalid_mod_json_is_reported_as_unknown_input(self):
        (self.mod / "broken.json").write_text("{", encoding="utf-8")
        result = self.invoke()
        marker = f"неизвестный вход — {self.mod / 'broken.json'} — json — "
        self.assertTrue(marker in result.stdout, f"missing malformed JSON issue; stdout chars={len(result.stdout)}")
        self.assertEqual(result.returncode, 1, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_crosswalk_deny_overrides_whitelist_for_mon_bat(self):
        policy = read_json(self.mod / "fauna-policy.json")
        whitelist = next(row["monsters"] for row in policy if row.get("type") == "MONSTER_WHITELIST")
        self.assertIn("mon_bat", whitelist)
        state = None
        creature = None
        for packet in self.original_packets:
            if packet["kind"] == "full":
                state = copy.deepcopy(packet["frame"])
            else:
                state.update(copy.deepcopy(packet["changes"]))
            creature = next((
                copy.deepcopy(row)
                for row in state.get("creatures", [])
                if row.get("kind") == "creature" and row.get("type") == "mon_zombie"
            ), None)
            if creature is not None:
                break
        self.assertIsNotNone(creature, "В настоящих кадрах не найден образец creatures: mon_zombie (creature)")
        creature["type"] = "mon_bat"
        creature["name"] = "bat"
        self.frame["creatures"].append(creature)

        baseline = self.invoke()
        frame_marker = f"кадров проверено — {len(self.packets)}"
        self.assertTrue(
            frame_marker in baseline.stdout,
            f"missing Z2 frame marker; CLI exit={baseline.returncode}; stdout chars={len(baseline.stdout)}",
        )
        self.assertEqual(
            baseline.returncode,
            0,
            f"Z2 mon_bat baseline must be clean; CLI exit={baseline.returncode}; stdout chars={len(baseline.stdout)}",
        )

        path = self.mod / "mtype_taxon_crosswalk.csv"
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            columns = reader.fieldnames
            rows = list(reader)
        bat = next(row for row in rows if row["mtype_id"] == "mon_bat")
        self.assertEqual(bat["decision"], "allow")
        bat["decision"] = "deny"
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)

        result = self.invoke()
        rejected_bat = any(
            line.startswith("существо — ") and " — mon_bat — " in line
            for line in result.stdout.splitlines()
        )
        self.assertTrue(
            rejected_bat,
            f"missing denied mon_bat issue; CLI exit={result.returncode}; stdout chars={len(result.stdout)}",
        )
        self.assertEqual(result.returncode, 1, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_null_monster_whitelist_is_rejected_as_unknown_input(self):
        path = self.mod / "fauna-policy.json"
        policy = read_json(path)
        whitelist = next(entry for entry in policy if entry.get("type") == "MONSTER_WHITELIST")
        whitelist["monsters"] = None
        write_json(path, policy)
        result = self.invoke()
        marker = f"неизвестный вход — {path} — fauna — MONSTER_WHITELIST — monsters"
        self.assertTrue(
            marker in result.stdout,
            f"missing malformed whitelist issue; CLI exit={result.returncode}; "
            f"stdout chars={len(result.stdout)} stderr tail={result.stderr[-500:]}",
        )
        self.assertEqual(result.returncode, 1, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_keep_rename_terrain_allowance_is_global(self):
        with self.allowlist.open(encoding="utf-8-sig", newline="") as stream:
            expected_rows = sum(1 for _ in csv.DictReader(stream, delimiter="\t"))
        position = [
            (self.court[0] + 1) * 24,
            self.court[1] * 24,
            self.court[2],
        ]
        self.frame["visible_terrain"].append({
            "type": "t_shrub_huckleberry",
            "name": "голубика",
            "count": 1,
            "nearest_distance": 0,
            "nearest_direction": "здесь",
            "positions": [position],
        })
        result = self.invoke()
        marker = f"строк допусков проверено — {expected_rows}"
        self.assertIn(marker, result.stdout, f"missing marker; stdout chars={len(result.stdout)}")
        self.assertEqual(result.returncode, 0, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_keep_field_allowance_is_counted(self):
        self.frame["objects"].append({
            "kind": "field",
            "position": self.frame["position"],
            "distance": 0,
            "direction": "здесь",
            "type": "fd_dust",
            "name": "пыль",
            "intensity": 1,
        })
        result = self.assert_clean()
        self.assertIn("fd_dust — 1", result.stdout)

    def test_remove_terrain_row_does_not_grant_permission(self):
        position = self.frame["position"]
        self.frame["visible_terrain"].append({
            "type": "t_fungus",
            "name": "грибная местность",
            "count": 1,
            "nearest_distance": 0,
            "nearest_direction": "здесь",
            "positions": [position],
        })
        self.assert_bad("местность")

    def test_terrain_permission_does_not_allow_same_id_as_item(self):
        position = self.frame["position"]
        self.frame["objects"].append({
            "kind": "ground_item",
            "position": position,
            "distance": 0,
            "direction": "здесь",
            "item": {
                "uid": "permission-test",
                "type": "t_dirt",
                "name": "земля",
                "owner": "",
            },
        })
        self.assert_bad("вещь")

    def test_courtyard_mapgen_furniture_is_not_allowed_outside_courtyard(self):
        position = [
            (self.court[0] + 1) * 24,
            self.court[1] * 24,
            self.court[2],
        ]
        self.frame["visible_furniture"].append({
            "type": "f_table",
            "name": "стол",
            "count": 1,
            "nearest_distance": 0,
            "nearest_direction": "здесь",
            "positions": [position],
        })
        self.assert_bad("мебель вне двора")

    def test_unlisted_field_observed_in_recording_does_not_grant_permission(self):
        self.frame["objects"].append({
            "kind": "field",
            "position": self.frame["position"],
            "distance": 0,
            "direction": "здесь",
            "type": "fd_fire",
            "name": "огонь",
            "intensity": 1,
        })
        self.assert_bad("поле")


class OvermapTests(WildFixture):
    _reference_road_id = None

    def adjacent_local(self):
        return ((self.court[0] % 180 + 1) % 180, self.court[1] % 180)

    def road_id_from_reference(self):
        if self.__class__._reference_road_id is None:
            with self.allowlist.open(encoding="utf-8-sig", newline="") as stream:
                allowed = {row["id"] for row in csv.DictReader(stream, delimiter="\t") if row["list"] == "oter" and row["decision"] in ("keep", "keep_rename")}
            for path in sorted(self.reference_world.glob("o.*.*")):
                overmap = read_json(path)
                for layer in overmap["layers"]:
                    for identifier, _ in layer:
                        if identifier not in allowed and (identifier == "road" or identifier.startswith("road_")):
                            self.__class__._reference_road_id = identifier
                            return identifier
            self.fail("В сохранённых участках задания 25 не найден запрещённый OTER дороги")
        return self.__class__._reference_road_id

    def route_group_record(self, group_id):
        route_world = Path(os.environ["NOVGOROD_WILD_WORLD30"])
        for path in sorted(route_world.glob("o.*.*")):
            overmap = read_json(path)
            for record in overmap.get("monster_groups", []):
                if (
                    isinstance(record, list)
                    and len(record) == 2
                    and isinstance(record[0], dict)
                    and isinstance(record[1], list)
                    and record[0].get("type") == group_id
                    and type(record[0].get("population")) is int
                    and record[0]["population"] > 0
                    and not record[0].get("monsters")
                ):
                    return path.name, copy.deepcopy(record)
        self.fail(f"В сохранении маршрута не найден native {group_id} с population > 0")

    def reference_horde_record(self, object_variant=False):
        for path in sorted(self.reference_world.glob("o.*.*")):
            overmap = read_json(path)
            horde = overmap.get("horde_map", [])
            for index in range(0, len(horde) - len(horde) % 6, 6):
                record = copy.deepcopy(horde[index:index + 6])
                monster = record[1]
                monster_id = monster.get("typeid") if isinstance(monster, dict) else monster
                if isinstance(monster_id, str) and monster_id.startswith("mon_zombie") and isinstance(monster, dict) == object_variant:
                    if isinstance(monster, dict):
                        record[1]["typeid"] = "mon_zombie"
                    else:
                        record[1] = "mon_zombie"
                    return path.name, record
        self.fail("В сохранении задания 25 не найден реальный zombie horde member")

    def assert_horde_zombie_rejected(self, object_variant):
        source, record = self.reference_horde_record(object_variant)
        self.overmap["horde_map"] = record

        position = record[0]
        x, y, z = position[0] // 24, position[1] // 24, position[2]
        expected = f"существо — {x},{y},{z} — creature — mon_zombie —"
        result = self.invoke()
        diagnostics = [line for line in result.stdout.splitlines() if "mon_zombie" in line]
        self.assertTrue(any(line.startswith(expected) for line in diagnostics), f"expected {expected!r} from saved horde {source}; got {diagnostics}")
        self.assertEqual(result.returncode, 1, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def assert_oter_rejected(self, x, y, z, identifier):
        result = self.assert_bad("карта")
        location = f"{self.court_section[0] * 180 + x},{self.court_section[1] * 180 + y},{z} (run=1)"
        expected = f"карта — {location} — oter — {identifier} —"
        self.assertTrue(any(line.startswith(expected) for line in result.stdout.splitlines()), f"missing exact OTER diagnostic {expected!r}")
        return result

    def assert_overmaps_verified(self):
        result = self.invoke()
        count = sum(name.startswith("o.") for name in self.world_files)
        self.assertIn(f"участков overmap проверено — {count}", result.stdout, f"missing marker; stdout chars={len(result.stdout)}")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def test_k19_road_in_current_overmap(self):
        x, y = self.adjacent_local()
        road = self.road_id_from_reference()
        set_oter(self.overmap, x, y, 0, road)

        result = self.assert_bad("карта")
        self.assertIn(road, result.stdout)

    def test_k20_road_in_neighboring_overmap(self):
        road = self.road_id_from_reference()
        neighbor = copy.deepcopy(self.overmap)
        neighbor["layers"] = [[['deep_rock' if z < 0 else 'field' if z == 0 else 'open_air', 32400]] for z in range(-10, 11)]
        neighbor["npcs"] = []
        set_oter(neighbor, 0, 0, 0, road)
        self.world_files[f"o.{self.court_section[0] + 1}.{self.court_section[1]}"] = neighbor

        result = self.assert_bad("карта")
        self.assertIn(road, result.stdout)

    def test_k21_longer_id_is_not_allowed_by_prefix(self):
        x, y = self.adjacent_local()
        set_oter(self.overmap, x, y, 0, "field_extra")

        result = self.assert_bad("карта")
        self.assertIn("field_extra", result.stdout)

    def test_k22_second_courtyard_cell_is_rejected(self):
        x, y = self.adjacent_local()
        set_oter(self.overmap, x, y, 0, "novgorod_dev_courtyard_north")

        result = self.assert_bad("карта")
        self.assertIn("novgorod_dev_courtyard_north", result.stdout)

    def test_allowlisted_oter_is_accepted(self):
        x, y = self.adjacent_local()
        set_oter(self.overmap, x, y, 0, "forest")

        self.assert_overmaps_verified()

    def test_rotated_courtyard_and_roof_ids_are_accepted(self):
        x, y = self.court[0] % 180, self.court[1] % 180
        set_oter(self.overmap, x, y, 0, "novgorod_dev_courtyard_east")
        set_oter(self.overmap, x, y, 1, "novgorod_dev_courtyard_roof_east")

        self.assert_overmaps_verified()

    def test_forbidden_road_below_ground_is_rejected(self):
        x, y = self.adjacent_local()
        road = self.road_id_from_reference()
        set_oter(self.overmap, x, y, -1, road)

        self.assert_oter_rejected(x, y, -1, road)

    def test_forbidden_road_above_ground_is_rejected(self):
        x, y = self.adjacent_local()
        road = self.road_id_from_reference()
        set_oter(self.overmap, x, y, 2, road)

        self.assert_oter_rejected(x, y, 2, road)

    def test_second_courtyard_roof_is_rejected(self):
        x, y = self.adjacent_local()
        identifier = "novgorod_dev_courtyard_roof_north"
        set_oter(self.overmap, x, y, 1, identifier)

        result = self.assert_bad("карта")
        location = f"{self.court_section[0] * 180 + x},{self.court_section[1] * 180 + y},1"
        self.assertIn(f"карта — {location} — oter — {identifier} —", result.stdout)

    def test_roof_must_share_courtyard_xy(self):
        x, y = self.court[0] % 180, self.court[1] % 180
        roof_x, roof_y = self.adjacent_local()
        set_oter(self.overmap, x, y, 1, "open_air")
        set_oter(self.overmap, roof_x, roof_y, 1, "novgorod_dev_courtyard_roof_north")

        result = self.assert_bad("карта")
        self.assertIn("карта — overmap — oter — courtyard —", result.stdout)

    def test_second_saved_master_with_new_numeric_id_is_rejected(self):
        duplicate = copy.deepcopy(self.master)
        duplicate["id"] = self.master["id"] + 1
        self.overmap["npcs"].append(duplicate)

        result = self.assert_bad("человек")
        self.assertIn("человек — overmap — npc — masters=2 —", result.stdout)

    def test_saved_master_with_wrong_unique_id_is_rejected(self):
        wrong_unique_id = "novgorod_dev_master_test_wrong_unique_id"
        self.master["unique_id"] = wrong_unique_id

        result = self.assert_bad("человек")
        section = f"o.{self.court_section[0]}.{self.court_section[1]}"
        self.assertIn(f"человек — {section} — npc — {wrong_unique_id} —", result.stdout)

    def test_saved_master_can_walk_outside_courtyard(self):
        court_x, court_y, z = self.court
        location = list(self.master["location"])
        self.assertEqual((location[0] // 24, location[1] // 24, location[2]), self.court)
        local_x = court_x % 180
        location[0] += 24 if local_x < 179 else -24
        walking_x = location[0] // 24
        self.master["location"] = location

        result = self.invoke()
        count = sum(name.startswith("o.") for name in self.world_files)
        self.assertIn(f"участков overmap проверено — {count}", result.stdout, f"missing marker; stdout chars={len(result.stdout)}")
        person = f"человек — {walking_x},{court_y},{z} — npc — novgorod_dev_master —"
        self.assertFalse(any(line.startswith(person) for line in result.stdout.splitlines()), f"authorized saved master at {location} was rejected: {[line for line in result.stdout.splitlines() if line.startswith('человек — ')]}")
        self.assertEqual(result.returncode, 0, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_known_route_group_river_is_not_misclassified_as_unknown(self):
        source, record = self.route_group_record("GROUP_RIVER")
        self.overmap["monster_groups"] = [record]

        result = self.invoke()
        section = f"o.{self.court_section[0]}.{self.court_section[1]}"
        rejected = f"карта — {section} — monster_group — GROUP_RIVER —"
        diagnostics = [line for line in result.stdout.splitlines() if line.startswith(rejected)]
        self.assertFalse(diagnostics, f"actual GROUP_RIVER from {source} was treated as unknown: {diagnostics}")
        count = sum(name.startswith("o.") for name in self.world_files)
        self.assertIn(f"участков overmap проверено — {count}", result.stdout, f"missing marker; stdout chars={len(result.stdout)}")
        self.assertEqual(result.returncode, 0, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")

    def test_materialized_zombie_string_in_saved_horde_is_rejected_as_creature(self):
        self.assert_horde_zombie_rejected(False)

    def test_materialized_zombie_object_in_saved_horde_is_rejected_as_creature(self):
        self.assert_horde_zombie_rejected(True)

    def test_unknown_saved_monster_group_is_fail_closed(self):
        source, record = self.route_group_record("GROUP_RIVER")
        unknown_group = "GROUP_OVERMAP_TEST_UNKNOWN"
        record[0]["type"] = unknown_group
        self.overmap["monster_groups"] = [record]

        result = self.invoke()
        section = f"o.{self.court_section[0]}.{self.court_section[1]}"
        expected = f"неизвестный вход — {section} — monster_group — {unknown_group} —"
        diagnostics = [line for line in result.stdout.splitlines() if unknown_group in line]
        self.assertTrue(any(line.startswith(expected) for line in diagnostics), f"expected fail-closed diagnostic from copied record {source}; got {diagnostics}")
        self.assertEqual(result.returncode, 1, f"CLI exit={result.returncode}; stdout chars={len(result.stdout)}")


class SubmapTests(WildFixture):
    def saved_level(self, z):
        submaps = copy.deepcopy(self.submaps)
        for submap in submaps:
            submap["coordinates"][2] = z
        segment = self.map_relative.parent.name.rsplit(".", 1)[0] + f".{z}"
        path = self.map_relative.parent.parent / segment / self.map_relative.name.replace(".0.map", f".{z}.map")
        self.world_files[str(path)] = submaps
        return submaps

    def saved_roof_level(self):
        submaps = self.saved_level(1)
        for submap in submaps:
            submap["terrain"] = [["t_wood_treated_roof", 144]]
            submap["radiation"] = [0, 144]
            for key in ("furniture", "items", "fields", "traps", "cosmetics", "phase_reverts", "spawns", "vehicles", "partial_constructions", "computers"):
                submap[key] = []
            submap.pop("camp", None)
        return submaps

    def assert_submaps_verified(self):
        count = sum(len(value) for path, value in self.world_files.items() if path.endswith(".map"))
        result = self.invoke()
        marker = f"подкарт проверено — {count}"
        details = f"exit={result.returncode}; stdout={len(result.stdout)} chars; stderr={len(result.stderr)} chars"
        self.assertTrue(marker in result.stdout, f"Отсутствует {marker!r}; {details}")
        self.assertEqual(result.returncode, 0, details)
        return result

    def assert_submap_bad(self, rule, identifier):
        result = self.invoke()
        details = f"exit={result.returncode}; stdout={len(result.stdout)} chars; stderr={len(result.stderr)} chars"
        self.assertEqual(result.returncode, 1, details)
        matching_lines = []
        for line in result.stdout.splitlines():
            columns = line.split(" — ", 4)
            if len(columns) == 5 and columns[0] == rule and columns[3] == str(identifier):
                matching_lines.append(line)
        self.assertTrue(matching_lines, f"Нет строки с правилом {rule!r} и id {identifier!r}; {details}")
        return result

    def saved_category(self, category):
        for path in sorted((self.reference_world / "maps").rglob("*.map")):
            for submap in read_json(path):
                if submap.get(category):
                    return copy.deepcopy(submap[category])
        self.fail(f"В сохранении задания 25 нет непустой категории {category}")

    def saved_item(self, value, identifier):
        if isinstance(value, dict):
            if value.get("typeid") == identifier:
                return value
            for child in value.values():
                found = self.saved_item(child, identifier)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = self.saved_item(child, identifier)
                if found is not None:
                    return found
        return None

    def saved_furniture_submap(self, identifier):
        for path in sorted((self.reference_world / "maps").rglob("*.map")):
            submaps = read_json(path)
            for index, submap in enumerate(submaps):
                coordinates = submap.get("coordinates")
                if not isinstance(coordinates, list) or len(coordinates) != 3 or coordinates[2] != 0:
                    continue
                omt = (coordinates[0] // 2, coordinates[1] // 2)
                if (omt[0] // 180, omt[1] // 180) != self.court_section or omt == self.court:
                    continue
                for furniture in submap.get("furniture", []):
                    if len(furniture) == 3 and furniture[2] == identifier:
                        return path.relative_to(self.reference_world), submaps, index, copy.deepcopy(furniture), omt
        self.fail(f"В сохранении задания 25 нет {identifier} на уровне z=0 в секции двора")

    def actual_uniform_submap_copy(self):
        required = ("NOVGOROD_WILD_RUN30", "NOVGOROD_WILD_WORLD30")
        missing = [name for name in required if not os.environ.get(name)]
        self.assertFalse(missing, "Отсутствуют пути реального прогона: " + ", ".join(missing))
        world30 = Path(os.environ[required[1]])
        relative = Path("maps/0.3.0/7.122.0.map")
        coordinates = [14, 244, 0]
        records = read_json(world30 / relative)
        target = next((submap for submap in records if submap.get("coordinates") == coordinates), None)
        self.assertIsNotNone(target, f"В реальном сохранении нет submap {relative}:{coordinates}")
        if target is None:
            return None
        self.assertEqual(target["terrain"], [["t_water_moving_dp", 144]])
        self.assertNotIn("radiation", target)
        copied = copy.deepcopy(target)
        self.world_files[str(relative)] = [copied]
        return copied

    def assert_actual_uniform_copy_bad(self, rule, identifier):
        count = sum(len(value) for path, value in self.world_files.items() if path.endswith(".map"))
        result = self.invoke()
        marker = f"подкарт проверено — {count}"
        details = f"exit={result.returncode}; stdout={len(result.stdout)} chars; stderr={len(result.stderr)} chars"
        self.assertTrue(marker in result.stdout, f"Отсутствует {marker!r}; {details}")
        self.assertEqual(result.returncode, 1, details)
        matching_lines = []
        for line in result.stdout.splitlines():
            columns = line.split(" — ", 4)
            if len(columns) == 5 and columns[0] == rule and columns[3] == str(identifier):
                matching_lines.append(line)
        self.assertTrue(matching_lines, f"Нет строки с правилом {rule!r} и id {identifier!r}; {details}")
        return result

    def test_actual_uniform_submap_copy_still_rejects_native_pavement(self):
        submap = self.actual_uniform_submap_copy()
        if submap is None:
            return
        submap["terrain"] = [["t_pavement", 1], ["t_water_moving_dp", 143]]
        self.assert_actual_uniform_copy_bad("местность", "t_pavement")

    def test_actual_uniform_submap_copy_still_rejects_unsupported_category(self):
        submap = self.actual_uniform_submap_copy()
        if submap is None:
            return
        trap = self.saved_category("traps")[0]
        submap["traps"] = [trap]
        self.assert_actual_uniform_copy_bad("неизвестный вход", "traps")

    def test_allowed_saved_submap_content_and_item_contents_are_accepted(self):
        self.submaps[0]["furniture"] = [[0, 0, "f_table"]]
        self.submaps[0]["items"] = [0, 0, [{"typeid": "firewood", "uid": 900001}]]
        self.submaps[0]["fields"] = [0, 0, ["fd_dust", 1, 0, {"character_id": None, "faction_id": None}]]
        self.submaps[0]["phase_reverts"] = [[0, 0, "t_dirt"]]
        self.save["player"].setdefault("inventory", []).append({
            "typeid": "leather_pouch", "uid": 900002,
            "contents": {"contents": [{"pocket_type": 0, "contents": [{"typeid": "tunic", "uid": 900003}], "_sealed": False, "no_rigid": []}], "additional_pockets": []},
        })
        self.master.setdefault("inventory", []).append({
            "typeid": "pants", "uid": 900004,
            "contents": {"contents": [{"pocket_type": 0, "contents": [{"typeid": "chisel", "uid": 900005}], "_sealed": False, "no_rigid": []}], "additional_pockets": []},
        })
        self.saved_roof_level()
        self.assert_submaps_verified()

    def test_courtyard_table_at_roof_level_is_rejected_as_submap(self):
        submaps = self.saved_roof_level()
        submaps[0]["furniture"] = [[0, 0, "f_table"]]
        self.assert_submap_bad("подкарта", "f_table")

    def test_forbidden_saved_submap_terrain_is_rejected(self):
        self.submaps[0]["terrain"] = [["t_asphalt", 144]]
        self.assert_submap_bad("местность", "t_asphalt")

    def test_saved_submap_below_ground_is_checked(self):
        submaps = self.saved_level(-1)
        submaps[-1]["terrain"] = [["t_asphalt", 144]]
        self.assert_submap_bad("местность", "t_asphalt")

    def test_saved_submap_above_ground_is_checked(self):
        submaps = self.saved_level(1)
        submaps[0]["terrain"] = [["t_asphalt", 144]]
        self.assert_submap_bad("местность", "t_asphalt")

    def test_forbidden_saved_submap_furniture_is_rejected(self):
        self.submaps[0]["furniture"] = [[0, 0, "f_toilet"]]
        self.assert_submap_bad("мебель", "f_toilet")

    def test_streetlight_beneath_forest_overmap_is_rejected_as_submap(self):
        path, submaps, index, streetlight, omt = self.saved_furniture_submap("f_street_light")
        for submap in submaps:
            submap["terrain"] = [["t_grass", 144]]
            submap["radiation"] = [0, 144]
            for key in ("furniture", "items", "fields", "traps", "cosmetics", "phase_reverts", "spawns", "vehicles", "partial_constructions", "computers"):
                submap[key] = []
            submap.pop("camp", None)
        submaps[index]["furniture"] = [streetlight]
        self.world_files[str(path)] = submaps
        set_oter(self.overmap, omt[0] % 180, omt[1] % 180, 0, "forest")
        self.assert_submap_bad("подкарта", "f_street_light")

    def test_forbidden_saved_submap_item_is_rejected(self):
        self.submaps[0]["items"] = [0, 0, [{"typeid": "syringe", "uid": 900006}]]
        self.assert_submap_bad("вещь", "syringe")

    def test_forbidden_saved_submap_item_attachment_is_rejected(self):
        self.submaps[0]["items"] = [0, 0, [{
            "typeid": "straw_basket", "uid": 900007,
            "contents": {"contents": [{"pocket_type": 0, "contents": [{"typeid": "syringe", "uid": 900008}], "_sealed": False, "no_rigid": []}], "additional_pockets": []},
        }]]
        self.assert_submap_bad("вложение", "syringe")

    def test_forbidden_saved_field_is_rejected(self):
        self.submaps[0]["fields"] = [3, 2, ["fd_blood", 3, 35, {"character_id": None, "faction_id": None}]]
        self.assert_submap_bad("поле", "fd_blood")

    def test_forbidden_phase_revert_terrain_is_rejected(self):
        self.submaps[0]["phase_reverts"] = [[0, 0, "t_asphalt"]]
        self.assert_submap_bad("местность", "t_asphalt")

    def test_saved_vehicle_is_rejected(self):
        vehicles = self.saved_category("vehicles")[:1]
        self.submaps[0]["vehicles"] = vehicles
        self.assert_submap_bad("транспорт", vehicles[0]["type"])

    def test_actual_uniform_submap_without_radiation_is_processed(self):
        required = ("NOVGOROD_WILD_RUN30", "NOVGOROD_WILD_WORLD30")
        missing = [name for name in required if not os.environ.get(name)]
        self.assertFalse(missing, "Отсутствуют пути реального прогона: " + ", ".join(missing))
        run30 = Path(os.environ[required[0]])
        world30 = Path(os.environ[required[1]])
        relative = Path("maps/0.3.0/7.122.0.map")
        map_path = world30 / relative
        coordinates = [14, 244, 0]
        saved_submaps = read_json(map_path)
        target = next((submap for submap in saved_submaps if submap.get("coordinates") == coordinates), None)
        self.assertIsNotNone(target, f"В реальном сохранении нет submap {relative}:{coordinates}")
        if target is None:
            return
        self.assertEqual(target["terrain"], [["t_water_moving_dp", 144]])
        self.assertNotIn("radiation", target)
        self.assertTrue((run30 / "perception.jsonl").is_file(), f"Actual task30 capture is missing: {run30}")
        self.assertTrue((run30 / "inputs.log").is_file(), f"Actual task30 route inputs are missing: {run30}")
        self.assertTrue(world30.is_dir(), f"Actual task30 world is missing: {world30}")
        count = sum(len(read_json(path)) for path in (world30 / "maps").rglob("*.map"))
        result = self.invoke(extra=("--run", str(run30), "--world", str(world30)))
        marker = f"подкарт проверено — {count}"
        details = f"exit={result.returncode}; stdout={len(result.stdout)} chars; stderr={len(result.stderr)} chars"
        self.assertTrue(marker in result.stdout, f"Отсутствует {marker!r}; {details}")
        radiation_issue = f"неизвестный вход — {map_path} — submap — radiation — "
        radiation_diagnostics = [line for line in result.stdout.splitlines() if line.startswith(radiation_issue)]
        self.assertFalse(radiation_diagnostics, f"Uniform submap {relative}:{coordinates} reported missing radiation; output={radiation_diagnostics[:1]!r}; {details}")

    def test_saved_player_inventory_is_checked(self):
        self.save["player"].setdefault("inventory", []).append({"typeid": "syringe", "uid": 900009})
        self.assert_submap_bad("снаряжение", "syringe")

    def test_global_item_allowlist_does_not_expand_saved_player_gear(self):
        self.save["player"].setdefault("inventory", []).append({
            "typeid": "rock", "uid": 2147483647, "charges": 1, "bday": 5212800,
            "last_temp_check": 0, "template_traits": [], "ethereal": False,
        })
        self.assert_submap_bad("снаряжение", "rock")

    def test_k18_saved_leather_pouch_attachment_is_rejected(self):
        pouch = self.saved_item(self.save["player"], "leather_pouch")
        self.assertIsNotNone(pouch, "В сохранении героя нет разрешённого leather_pouch")
        pouch.setdefault("contents", {"contents": [{"pocket_type": 0, "contents": [], "_sealed": False, "no_rigid": []}], "additional_pockets": []})
        pouch["contents"]["contents"][0].setdefault("contents", []).append({"typeid": "syringe", "uid": 900011})
        self.assert_submap_bad("вложение", "syringe")

    def test_saved_master_inventory_is_checked(self):
        self.master.setdefault("inventory", []).append({"typeid": "syringe", "uid": 900012})
        self.assert_submap_bad("снаряжение мастера", "syringe")

    def test_global_item_allowlist_does_not_expand_saved_master_gear(self):
        self.master.setdefault("inventory", []).append({
            "typeid": "rock", "uid": 2147483647, "charges": 1, "bday": 5212800,
            "last_temp_check": 0, "template_traits": [], "ethereal": False,
        })
        self.assert_submap_bad("снаряжение мастера", "rock")

    def test_saved_master_item_attachment_is_checked(self):
        self.master.setdefault("inventory", []).append({
            "typeid": "pants", "uid": 900013,
            "contents": {"contents": [{"pocket_type": 0, "contents": [{"typeid": "syringe", "uid": 900014}], "_sealed": False, "no_rigid": []}], "additional_pockets": []},
        })
        self.assert_submap_bad("вложение", "syringe")

    def test_saved_master_frame_item_is_resolved_by_uid(self):
        npc = self.frame["creatures"][0]
        frame_items = list(npc["worn"])
        if npc["wielded"] is not None:
            frame_items.append(npc["wielded"])
        self.assertTrue(frame_items, "В реальном кадре мастера нет сохранённого UID экипировки")
        frame_item = frame_items[0]
        saved_items = list(self.master.get("worn", {}).get("worn", [])) + [self.master.get("weapon")] + self.master.get("inventory", [])
        saved_item = next(item for item in saved_items if isinstance(item, dict) and str(item.get("uid")) == frame_item["uid"])
        self.assertEqual(saved_item["typeid"], frame_item["type"])
        saved_item["typeid"] = "syringe"
        self.assert_submap_bad("снаряжение мастера", "syringe")

    def test_saved_master_frame_item_with_missing_uid_is_rejected(self):
        npc = self.frame["creatures"][0]
        self.assertTrue(npc["worn"], "В реальном кадре мастера нет носимой экипировки с UID")
        frame_item = npc["worn"][0]
        frame_item["uid"] = "900099"
        self.assert_submap_bad("снаряжение мастера", "900099")

    def test_saved_active_monster_is_checked(self):
        self.save["active_monsters"] = [{"typeid": "mon_zombie", "location": [0, 0, 0]}]
        self.assert_submap_bad("существо", "mon_zombie")

    def test_nonempty_unsupported_submap_categories_are_rejected(self):
        categories = (
            ("traps", [[0, 0, "tr_nailboard", None]]),
            ("cosmetics", [[10, 1, "GRAFFITI", "ПНХ"]]),
            ("computers", [[2, 9], {"name": "Терминал с логами", "location": [362, 2769, -4]}]),
            ("spawns", [["mon_zombie_labsecurity", 1, 0, 0, -1, -1, False, None]]),
            ("partial_constructions", [0, 0, 0, 1, 1, []]),
            ("camp", {"name": "camp"}),
            ("future_payload", [{"content": "unknown"}]),
        )
        for category, value in categories:
            with self.subTest(category=category):
                was_present = category in self.submaps[0]
                self.submaps[0][category] = copy.deepcopy(value)
                try:
                    self.assert_submap_bad("неизвестный вход", category)
                finally:
                    if was_present:
                        self.submaps[0][category] = []
                    else:
                        del self.submaps[0][category]

    def test_nonzero_saved_submap_radiation_is_rejected(self):
        self.submaps[0]["radiation"] = [1, 144]
        self.assert_submap_bad("неизвестный вход", "radiation")


class FrameTests(WildFixture):
    def original_states(self):
        state = None
        for packet in self.original_packets:
            if packet["kind"] == "full":
                state = copy.deepcopy(packet["frame"])
            else:
                state.update(copy.deepcopy(packet["changes"]))
            yield copy.deepcopy(state)

    def original_row(self, field, identifier=None, kind=None):
        for state in self.original_states():
            for row in state.get(field, []):
                row_id = row.get("type") or row.get("item", {}).get("type") or row.get("description") or row.get("vehicle_name")
                if (identifier is None or row_id == identifier) and (kind is None or row.get("kind") == kind):
                    return copy.deepcopy(row)
        self.fail(f"В настоящих кадрах не найден образец {field}: {identifier} ({kind})")

    def original_message(self):
        for state in self.original_states():
            messages = state["journal"]["player_messages"]["messages"]
            if messages:
                return copy.deepcopy(messages[0])
        self.fail("В настоящих кадрах не найдено сообщение журнала")

    def assert_frames_checked(self, result):
        self.assertIn(f"кадров проверено — {len(self.packets)}", result.stdout)

    def remove_allowance(self, kind, identifier):
        with self.allowlist.open(encoding="utf-8", newline="") as stream:
            rows = list(csv.reader(stream, delimiter="\t"))
        with self.allowlist.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream, delimiter="\t")
            writer.writerows(row for row in rows if len(row) < 2 or row[:2] != [kind, identifier])

    def ensure_allowance(self, kind, identifier):
        with self.allowlist.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.DictReader(stream, delimiter="\t"))
        if not any(row["list"] == kind and row["id"] == identifier and row["decision"] in ("keep", "keep_rename") for row in rows):
            self.add_allowance(kind, identifier)

    def test_second_nonmaster_npc_is_rejected(self):
        npc = copy.deepcopy(self.frame["creatures"][0])
        npc["id"] = str(int(npc["id"]) + 1)
        npc["type"] = "NPC_homeless_survivor"
        self.frame["creatures"].append(npc)
        self.assert_bad("человек")

    def test_second_master_template_instance_is_rejected(self):
        npc = copy.deepcopy(self.frame["creatures"][0])
        self.assertEqual(npc["type"], "novgorod_dev_master")
        npc["id"] = str(int(npc["id"]) + 1)
        self.frame["creatures"].append(npc)
        self.assert_bad("человек")

    def test_gravestone_in_visible_furniture_is_rejected(self):
        self.frame["visible_furniture"].append(self.original_row("visible_furniture", "f_grave_stone"))
        self.assert_bad("мебель")

    def test_gravestone_in_furniture_object_is_rejected(self):
        grave = self.original_row("objects", "f_grave_stone", "furniture")
        self.frame["objects"].append(grave)
        self.assert_bad("мебель")

    def test_unknown_frame_field_is_rejected(self):
        self.frame["unrecognized_capture_field"] = True
        self.assert_bad("неизвестный вход")

    def test_malformed_perception_json_is_incomplete(self):
        self.run.joinpath("perception.jsonl").write_text("{malformed json}\n", encoding="utf-8")
        result = self.invoke(flush=False)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("неполный прогон — ", result.stdout)

    def test_z1_validates_all_real_frames_and_prints_counter_tables(self):
        result = self.assert_clean()
        self.assert_frames_checked(result)
        self.assertIn("поле — число появлений", result.stdout)
        self.assertIn("звук — категория — число появлений", result.stdout)
        self.assertIn("сообщение журнала — число появлений", result.stdout)

    def test_z2_allows_a_fauna_whitelist_member_by_id(self):
        policy = read_json(self.mod / "fauna-policy.json")
        whitelist = next(row["monsters"] for row in policy if row.get("type") == "MONSTER_WHITELIST")
        self.assertIn("mon_bat", whitelist)
        creature = self.original_row("creatures", "mon_zombie", "creature")
        creature["type"] = "mon_bat"
        creature["name"] = "bat"
        self.frame["creatures"].append(creature)
        result = self.assert_clean()
        self.assert_frames_checked(result)

    def test_z3_allows_open_door_from_capture_transition(self):
        packet = next((
            packet for packet in self.packets
            if any(row["type"] == "t_door_o" for row in packet["frame"]["visible_terrain"])
            and not any(obj.get("kind") == "door" for obj in packet["frame"]["objects"])
        ), None)
        self.assertIsNotNone(packet, "В З1 нет настоящего кадра с открытой дверью")
        self.frame = packet["frame"]
        self.assertTrue(any(row["type"] == "t_door_o" for row in self.frame["visible_terrain"]))
        self.assertFalse(any(obj.get("kind") == "door" for obj in self.frame["objects"]))
        result = self.assert_clean()
        self.assert_frames_checked(result)

    def test_z4_counts_an_explicitly_allowed_field(self):
        self.ensure_allowance("field", "fd_blood")
        self.frame["objects"].append(self.original_row("objects", "fd_blood", "field"))
        result = self.assert_clean()
        self.assert_frames_checked(result)
        self.assertIn("fd_blood — 1", result.stdout)

    def test_allowed_sound_and_message_are_counted(self):
        sound = self.original_row("sounds")
        message = self.original_message()
        self.ensure_allowance("sound", f"{sound['category']}|{sound['description']}")
        self.ensure_allowance("message", message["message"])
        self.frame["sounds"].append(sound)
        self.frame["journal"]["player_messages"]["messages"].append(message)
        result = self.assert_clean()
        self.assert_frames_checked(result)
        self.assertIn(f"{sound['description']} — {sound['category']} — 1", result.stdout)
        self.assertIn(f"{message['message']} — 1", result.stdout)

    def test_saved_uid_mismatch_for_allowed_player_item_is_rejected(self):
        item = copy.deepcopy(self.frame["inventory"][0])
        item["uid"] = str(int(item["uid"]) + 1000000)
        self.frame["inventory"].append(item)
        self.assert_bad("снаряжение")

    def test_saved_uid_mismatch_for_allowed_master_item_is_rejected(self):
        item = self.frame["creatures"][0]["wielded"]
        item["uid"] = str(int(item["uid"]) + 1000000)
        self.assert_bad("снаряжение мастера")

    def test_zombie_creature_is_rejected(self):
        self.frame["creatures"].append(self.original_row("creatures", "mon_zombie", "creature"))
        self.assert_bad("существо")

    def test_blacklisted_animal_is_rejected(self):
        creature = self.original_row("creatures", "mon_zombie", "creature")
        creature["type"] = "mon_zombie_dog"
        creature["name"] = "собака-зомби"
        self.frame["creatures"].append(creature)
        self.assert_bad("существо")

    def test_syringe_in_master_wielded_is_rejected(self):
        item = self.original_row("objects", "syringe", "ground_item")["item"]
        item.pop("owner", None)
        self.frame["creatures"][0]["wielded"] = item
        self.assert_bad("снаряжение мастера")

    def test_real_nonmaster_syringe_and_hero_pouch_in_master_worn_are_rejected(self):
        master = self.frame["creatures"][0]
        clean_worn = copy.deepcopy(master["worn"])
        self.assertTrue(clean_worn, "В настоящем кадре мастера нет исходного worn")

        syringe = self.original_row("objects", "syringe", "ground_item")["item"]
        syringe.pop("owner", None)
        pouch = self.original_row("inventory", "leather_pouch")
        saved_pouch = next(
            (item for item in self.save["player"].get("worn", {}).get("worn", [])
             if isinstance(item, dict) and item.get("typeid") == "leather_pouch"),
            None,
        )
        self.assertIsNotNone(saved_pouch, "В сохранении героя нет настоящего leather_pouch")
        self.assertEqual(str(pouch["uid"]), str(saved_pouch["uid"]), "UID leather_pouch не совпадает с сохранением героя")

        for label, item, type_id in (
            ("capture-syringe-without-owner", syringe, "syringe"),
            ("hero-inventory-leather-pouch", pouch, "leather_pouch"),
        ):
            with self.subTest(item=label):
                master["worn"] = copy.deepcopy(clean_worn)
                master["worn"].append(copy.deepcopy(item))
                result = self.invoke()
                matching_rows = [
                    line for line in result.stdout.splitlines()
                    if line.startswith("снаряжение мастера — ")
                    and f" — creatures.worn — {type_id} — " in line
                ]
                self.assertEqual(len(matching_rows), 1, result.stdout)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

    def test_asphalt_in_visible_terrain_is_rejected(self):
        self.frame["visible_terrain"].append(self.original_row("visible_terrain", "t_pavement"))
        self.assert_bad("местность")

    def test_boarded_window_object_is_rejected(self):
        self.frame["objects"].append(self.original_row("objects", "t_window_boarded", "window"))
        self.assert_bad("местность")

    def test_court_furniture_outside_its_tile_is_rejected(self):
        table = next(row for row in self.frame["visible_furniture"] if row["type"] == "f_table")
        table["positions"][0] = [self.court[0] * 24 - 1, self.court[1] * 24, self.court[2]]
        self.assert_bad("мебель вне двора")

    def test_real_table_in_roof_level_visible_group_is_rejected(self):
        table = next(row for row in self.frame["visible_furniture"] if row["type"] == "f_table")
        position = next(position for position in table["positions"] if position[2] == 0)
        self.assertEqual(position[2], 0)
        position[2] = 1
        issue = f"мебель вне двора — {position[0]},{position[1]},1 — visible_furniture — f_table — table"
        result = self.invoke()
        self.assertTrue(issue in result.stdout, f"missing {issue}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            1,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_real_table_in_roof_level_furniture_object_is_rejected(self):
        table = next(obj for obj in self.frame["objects"] if obj.get("kind") == "furniture" and obj.get("type") == "f_table")
        position = table["position"]
        self.assertEqual(position[2], 0)
        position[2] = 1
        issue = f"мебель вне двора — {position[0]},{position[1]},1 — objects — f_table — table"
        result = self.invoke()
        self.assertTrue(issue in result.stdout, f"missing {issue}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            1,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_unallowed_ground_item_is_rejected(self):
        self.frame["objects"].append(self.original_row("objects", "syringe", "ground_item"))
        self.assert_bad("вещь")

    def test_vehicle_part_is_rejected(self):
        self.frame["objects"].append(self.original_row("objects", kind="vehicle_part"))
        self.assert_bad("транспорт")

    def test_fd_blood_without_allowance_is_rejected(self):
        self.remove_allowance("field", "fd_blood")
        self.frame["objects"].append(self.original_row("objects", "fd_blood", "field"))
        self.assert_bad("поле")

    def test_unallowed_sound_is_rejected(self):
        sound = self.original_row("sounds")
        sound["description"] = "стон зомби!"
        # levx/levy are submap coordinates within the overmap; captured sounds use bubble-local coordinates.
        absolute_submap_origin = (
            self.save["om_x"] * 360 + self.save["levx"],
            self.save["om_y"] * 360 + self.save["levy"],
        )
        bubble_origin = (absolute_submap_origin[0] * 12, absolute_submap_origin[1] * 12)
        sound["position"] = [
            self.frame["position"][0] - bubble_origin[0],
            self.frame["position"][1] - bubble_origin[1],
            self.frame["position"][2],
        ]
        self.frame["sounds"].append(sound)
        self.assert_bad("звук")

    def test_unallowed_journal_message_is_rejected(self):
        message = self.original_message()
        message["message"] = "Вы слышите стон зомби!"
        self.frame["journal"]["player_messages"]["messages"].append(message)
        self.assert_bad("сообщение")

    def test_syringe_in_player_wielded_is_rejected(self):
        item = self.original_row("objects", "syringe", "ground_item")["item"]
        item.pop("owner", None)
        self.frame["player_state"]["wielded"] = item
        self.assert_bad("снаряжение")

    def test_syringe_in_player_inventory_is_rejected(self):
        item = self.original_row("objects", "syringe", "ground_item")["item"]
        item.pop("owner", None)
        self.frame["inventory"].append(item)
        self.assert_bad("снаряжение")

    def test_city_place_name_is_rejected(self):
        self.frame["place"]["name"] = "Город"
        self.assert_bad("место")

    def test_acid_rain_is_rejected(self):
        self.frame["weather"]["type"] = "acid_rain"
        self.assert_bad("погода")

    def test_known_weather_with_native_passive_effect_is_rejected(self):
        self.frame["weather"]["type"] = "scarlet_storm_3"
        self.assert_bad("погода")

    def test_unknown_object_kind_is_rejected(self):
        obj = copy.deepcopy(next(obj for obj in self.frame["objects"] if obj.get("kind") == "furniture"))
        obj["kind"] = "unrecognized_capture_object"
        self.frame["objects"].append(obj)
        self.assert_bad("неизвестный вход")

    def test_removed_plant_in_visible_terrain_is_rejected(self):
        self.frame["visible_terrain"].append(self.original_row("visible_terrain", "t_bamboo_long"))
        self.assert_bad("местность")

    def test_missing_required_frame_field_is_unknown_input(self):
        del self.frame["clock"]
        self.assert_bad("неизвестный вход")

    def test_wrong_structural_field_type_is_unknown_input(self):
        self.frame["place"]["roofed"] = "true"
        self.assert_bad("неизвестный вход")

    def test_n1_reports_all_six_rules_for_the_real_task25_capture_and_world(self):
        result = self.invoke(extra=("--run", str(self.reference_run), "--world", str(self.reference_world)))
        self.assertEqual(
            result.returncode,
            1,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )
        for rule in ("существо", "местность", "мебель", "вещь", "транспорт", "карта"):
            self.assertTrue(f"{rule} — " in result.stdout, f"missing {rule}; stdout chars={len(result.stdout)}")

    def test_z5_checks_actual_task30_capture_and_world(self):
        if not os.environ.get("NOVGOROD_WILD_RUN30") or not os.environ.get("NOVGOROD_WILD_WORLD30"):
            self.skipTest("Новая запись задания 30 недоступна")
        run30 = Path(os.environ["NOVGOROD_WILD_RUN30"])
        world30 = Path(os.environ["NOVGOROD_WILD_WORLD30"])
        perception = run30 / "perception.jsonl"
        if not perception.is_file() or not world30.is_dir():
            self.skipTest("Новая запись задания 30 недоступна")
        frame_count = sum(1 for line in perception.read_text(encoding="utf-8").splitlines() if line.strip())
        self.assertEqual(frame_count, 78, f"actual task30 frame lines={frame_count}")
        result = self.invoke(extra=("--run", str(run30), "--world", str(world30)))
        marker = f"кадров проверено — {frame_count}"
        self.assertTrue(marker in result.stdout, f"missing {marker}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            0,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_native_null_wetness_label_is_accepted(self):
        if not os.environ.get("NOVGOROD_WILD_RUN30") or not os.environ.get("NOVGOROD_WILD_WORLD30"):
            self.skipTest("Новая запись задания 30 недоступна")
        run30 = Path(os.environ["NOVGOROD_WILD_RUN30"])
        world30 = Path(os.environ["NOVGOROD_WILD_WORLD30"])
        perception = run30 / "perception.jsonl"
        if not perception.is_file() or not world30.is_dir():
            self.skipTest("Новая запись задания 30 недоступна")
        packets = [json.loads(line) for line in perception.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertTrue(packets, "В настоящей записи нет кадров")
        self.assertIsNone(packets[0]["frame"]["player_state"]["wetness_label"])
        result = self.invoke(extra=("--run", str(run30), "--world", str(world30)))
        marker = f"кадров проверено — {len(packets)}"
        self.assertTrue(marker in result.stdout, f"missing {marker}; stdout chars={len(result.stdout)}")
        wetness_issue = "неизвестный вход — кадр 1 — player_state — wetness_label — "
        self.assertFalse(wetness_issue in result.stdout, f"native null wetness_label rejected; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            0,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_string_wetness_label_in_first_actual_frame_is_unknown_input(self):
        if not os.environ.get("NOVGOROD_WILD_RUN30") or not os.environ.get("NOVGOROD_WILD_WORLD30"):
            self.skipTest("Новая запись задания 30 недоступна")
        run30 = Path(os.environ["NOVGOROD_WILD_RUN30"])
        world30 = Path(os.environ["NOVGOROD_WILD_WORLD30"])
        perception = run30 / "perception.jsonl"
        if not perception.is_file() or not world30.is_dir():
            self.skipTest("Новая запись задания 30 недоступна")
        run_copy = self.root / "task30-wetness-string"
        run_copy.mkdir()
        shutil.copyfile(perception, run_copy / "perception.jsonl")
        shutil.copyfile(run30 / "inputs.log", run_copy / "inputs.log")
        lines = perception.read_text(encoding="utf-8").splitlines()
        first = json.loads(lines[0])
        self.assertIsNone(first["frame"]["player_state"]["wetness_label"])
        first["frame"]["player_state"]["wetness_label"] = "dry"
        lines[0] = json.dumps(first, ensure_ascii=False)
        (run_copy / "perception.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
        result = self.invoke(extra=("--run", str(run_copy), "--world", str(world30)))
        wetness_issue = "неизвестный вход — кадр 1 — player_state — wetness_label — "
        self.assertTrue(wetness_issue in result.stdout, f"missing {wetness_issue}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            1,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_real_middle_delta_reconstructs_frame_and_checks_all_frames(self):
        candidates = []
        for index in range(1, len(self.packets) - 1):
            previous = self.packets[index - 1]["frame"]
            frame = self.packets[index]["frame"]
            changes = {
                key: copy.deepcopy(value)
                for key, value in frame.items()
                if key not in previous or previous[key] != value
            }
            if changes:
                candidates.append((index, changes))
        self.assertTrue(candidates, "В настоящих кадрах нет представимого top-level delta")
        middle = len(self.packets) // 2
        index, changes = min(candidates, key=lambda entry: abs(entry[0] - middle))
        reconstructed = copy.deepcopy(self.packets[index - 1]["frame"])
        reconstructed.update(copy.deepcopy(changes))
        self.assertEqual(reconstructed, self.packets[index]["frame"])
        packet = self.packets[index]
        packet["kind"] = "delta"
        packet["changes"] = changes
        del packet["frame"]
        result = self.invoke()
        marker = f"кадров проверено — {len(self.packets)}"
        self.assertTrue(marker in result.stdout, f"missing {marker}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            0,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )

    def test_delta_without_preceding_full_is_unknown_input(self):
        packet = self.packets[0]
        self.assertEqual(packet["kind"], "full")
        packet["kind"] = "delta"
        packet["changes"] = packet.pop("frame")
        result = self.invoke()
        issue = "неизвестный вход — кадр 1 — perception — delta_without_full — "
        self.assertTrue(issue in result.stdout, f"missing {issue}; stdout chars={len(result.stdout)}")
        self.assertEqual(
            result.returncode,
            1,
            f"exit={result.returncode}; stdout chars={len(result.stdout)}; stderr chars={len(result.stderr)}",
        )


class CompletenessTests(WildFixture):
    def test_complete_route_with_terminal_inputs_without_frames_passes(self):
        self.assertEqual(len(self.inputs), 50)
        self.assertEqual([row["number"] for row in self.inputs], list(range(1, 51)))
        self.assertEqual([row["keys"] for row in self.inputs[-2:]], ["Y", "Q"])
        self.assertFalse(any(packet["input_number"] in (49, 50) for packet in self.packets))
        self.assertTrue(any(packet["frame"]["place"]["roofed"] for packet in self.packets))
        self.assertEqual(self.packets[-1]["reason"], "exit")
        self.assertFalse(self.packets[-1]["frame"]["place"]["roofed"])
        self.assertTrue(self.packets[-1]["frame"]["place"]["outside"])
        self.assertEqual(self.world_files["mods.json"], ["dda", "novgorod_dev_world"])
        self.assertGreaterEqual(self.save["turn"], self.packets[-1]["native_turn"])
        self.assert_clean()

    def test_rejects_missing_required_input(self):
        self.inputs = [row for row in self.inputs if row["number"] != 48]
        self.assert_bad("неполный прогон")

    def test_rejects_changed_input_key(self):
        self.inputs[0]["keys"] = "not-a-route-key"
        self.assert_bad("неполный прогон")

    def test_rejects_changed_terminal_key(self):
        self.inputs[-1]["keys"] = "not-Q"
        self.assert_bad("неполный прогон")

    def test_rejects_restored_excluded_input_sixteen(self):
        self.inputs = copy.deepcopy(self.original_inputs)
        self.assertEqual(len(self.inputs), 51)
        self.assertEqual([row["number"] for row in self.inputs], list(range(1, 52)))
        self.assert_bad("неполный прогон")

    def test_rejects_malformed_inputs(self):
        self.flush()
        self.run.joinpath("inputs.log").write_text("{\n", encoding="utf-8")
        self.assert_bad("неполный прогон", flush=False)

    def test_rejects_empty_perception(self):
        self.packets = []
        self.assert_bad("неполный прогон")

    def test_rejects_missing_perception_file(self):
        self.flush()
        self.run.joinpath("perception.jsonl").unlink()
        self.assert_bad("неполный прогон", flush=False)

    def test_rejects_malformed_perception(self):
        self.flush()
        self.run.joinpath("perception.jsonl").write_text("{\n", encoding="utf-8")
        self.assert_bad("неполный прогон", flush=False)

    def test_rejects_missing_frame_for_required_input(self):
        self.packets = [packet for packet in self.packets if packet["input_number"] != 48]
        self.assert_bad("неполный прогон")

    def test_rejects_perception_truncated_after_first_frame(self):
        self.packets = self.packets[:1]
        self.assert_bad("неполный прогон")

    def test_rejects_final_frame_that_is_not_exit(self):
        self.packets[-1]["reason"] = "capture"
        self.assert_bad("неполный прогон")

    def test_rejects_final_exit_frame_inside(self):
        self.packets[-1]["frame"]["place"]["roofed"] = True
        self.assert_bad("неполный прогон")

    def test_rejects_route_without_inside_frame(self):
        for packet in self.packets:
            packet["frame"]["place"]["roofed"] = False
        self.assert_bad("неполный прогон")

    def test_rejects_wrong_mod_order(self):
        self.world_files["mods.json"] = ["novgorod_dev_world", "dda"]
        self.assert_bad("неполный прогон")

    def test_rejects_only_wildlife_mod(self):
        self.world_files["mods.json"] = ["dda", "novgorod_dev_world", "Only_Wildlife"]
        result = self.invoke()
        diagnostic = (result.stdout + result.stderr)[:2000]
        self.assertEqual(result.returncode, 1, diagnostic)
        self.assertIn("неполный прогон — ", result.stdout, diagnostic)

    def test_accepts_saved_turn_equal_to_last_native_turn(self):
        self.save["turn"] = self.packets[-1]["native_turn"]
        self.assert_clean()

    def test_rejects_save_behind_last_native_turn(self):
        self.save["turn"] = self.packets[-1]["native_turn"] - 1
        self.assert_bad("неполный прогон")

    def test_rejects_missing_save(self):
        self.flush()
        self.world.joinpath(self.save_name).unlink()
        self.assert_bad("неполный прогон", flush=False)

    def test_rejects_malformed_save(self):
        self.flush()
        self.world.joinpath(self.save_name).write_text("{\n", encoding="utf-8")
        self.assert_bad("неполный прогон", flush=False)


if __name__ == "__main__":
    unittest.main()
