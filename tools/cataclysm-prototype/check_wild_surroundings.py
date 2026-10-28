import argparse
import copy
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def read_json(path):
    text = Path(path).read_text(encoding="utf-8-sig")
    if text.startswith("#"):
        text = text.split("\n", 1)[1]
    return json.loads(text)


def item_nodes(value):
    if isinstance(value, dict):
        if isinstance(value.get("typeid"), str):
            yield value
        for child in value.values():
            yield from item_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from item_nodes(child)


class Context:
    def __init__(self, args):
        self.args = args
        self.violations = []
        self.errors = []
        self.packets = []
        self.frames = []
        self.inputs = []
        self.reference_inputs = []
        self.rows = []
        self.overmaps = []
        self.submaps = []
        self.saves = []
        self.mod_objects = []
        self.allowed = defaultdict(set)
        self.names = defaultdict(dict)
        self.court_allowed = defaultdict(set)
        self.court_levels = defaultdict(set)
        self.court_oters = set()
        self.court_ground_oters = set()
        self.court_roof_oters = set()
        self.court_positions = set()
        self.hero_types = set()
        self.master_types = set()
        self.fauna = set()
        self.exclusive = False
        self.blacklisted_types = set()
        self.whitelisted_types = set()
        self.master_ids = set()
        self.saved_items = {}
        self.npcs = []
        self.field_counts = Counter()
        self.sound_counts = Counter()
        self.message_counts = Counter()
        self.summary = []
        self._definitions = None
        self._definition_index = None
        self._resolved = {}
        self._load()

    def issue(self, rule, location, kind, identifier, name=""):
        self.violations.append((str(rule), str(location), str(kind), str(identifier), str(name)))

    def _json(self, path):
        try:
            return read_json(path)
        except (OSError, ValueError, IndexError) as error:
            self.errors.append((str(path), str(error)))
            return None

    def _lines(self, path):
        try:
            return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
        except (OSError, ValueError) as error:
            self.errors.append((str(path), str(error)))
            return []

    def _load(self):
        self.packets = self._lines(self.args.run / "perception.jsonl")
        self.inputs = self._lines(self.args.run / "inputs.log")
        self.reference_inputs = self._lines(self.args.reference_inputs)
        state = None
        for number, packet in enumerate(self.packets, 1):
            if not isinstance(packet, dict):
                continue
            if packet.get("kind") == "full" and isinstance(packet.get("frame"), dict):
                state = copy.deepcopy(packet["frame"])
            elif packet.get("kind") == "delta" and state is not None and isinstance(packet.get("changes"), dict):
                state.update(copy.deepcopy(packet["changes"]))
            else:
                continue
            self.frames.append((number, packet, copy.deepcopy(state)))
        try:
            with self.args.allowlist.open(encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream, delimiter="\t")
                self.row_columns = reader.fieldnames
                self.rows = list(reader)
        except (OSError, ValueError, csv.Error) as error:
            self.errors.append((str(self.args.allowlist), str(error)))
            self.row_columns = None
        for path in sorted(self.args.mod.rglob("*.json")):
            value = self._json(path)
            if isinstance(value, list):
                self.mod_objects.extend(value)
            elif isinstance(value, dict):
                self.mod_objects.append(value)
        for path in sorted(self.args.world.glob("o.*.*")):
            match = re.fullmatch(r"o\.(-?\d+)\.(-?\d+)", path.name)
            if match:
                value = self._json(path)
                if isinstance(value, dict):
                    self.overmaps.append((path, (int(match[1]), int(match[2])), value))
                    self.npcs.extend(value.get("npcs", []))
        for path in sorted(self.args.world.glob("*.sav")):
            value = self._json(path)
            if isinstance(value, dict):
                self.saves.append((path, value))
        for path in sorted((self.args.world / "maps").rglob("*.map")):
            value = self._json(path)
            if isinstance(value, list):
                self.submaps.extend((path, entry) for entry in value)

    @property
    def definitions(self):
        if self._definitions is None:
            self._definitions = []
            data = self.args.mod.parent.parent
            for directory in (data / "core", data / "json", self.args.mod):
                for path in sorted(directory.rglob("*.json")):
                    value = self._json(path)
                    if isinstance(value, dict):
                        value = [value]
                    if isinstance(value, list):
                        self._definitions.extend(entry for entry in value if isinstance(entry, dict))
        return self._definitions

    def definition(self, kind, identifier, before=None):
        if self._definition_index is None:
            self._definition_index = defaultdict(list)
            for position, entry in enumerate(self.definitions):
                ids = entry.get("id", entry.get("abstract", []))
                if isinstance(ids, str):
                    ids = [ids]
                if not isinstance(ids, list):
                    continue
                for entry_id in ids:
                    if isinstance(entry_id, str):
                        self._definition_index[(entry.get("type"), entry_id)].append((position, entry))
        candidates = self._definition_index.get((kind, identifier), [])
        if before is not None:
            candidates = [pair for pair in candidates if pair[0] < before]
        if not candidates:
            return {}
        position, raw = candidates[-1]
        key = (kind, identifier, position)
        if key in self._resolved:
            return copy.deepcopy(self._resolved[key])
        self._resolved[key] = {}
        parent = raw.get("copy-from")
        result = self.definition(kind, parent, position if parent == identifier else None) if parent else {}
        result.update(copy.deepcopy({key: value for key, value in raw.items() if key not in ("extend", "delete")}))
        for field, values in raw.get("extend", {}).items():
            if isinstance(values, list):
                result[field] = list(result.get(field, [])) + copy.deepcopy(values)
        for field, values in raw.get("delete", {}).items():
            if isinstance(values, list) and isinstance(result.get(field), list):
                result[field] = [value for value in result[field] if value not in values]
        self._resolved[key] = result
        return copy.deepcopy(result)

    def output(self):
        for violation in self.violations:
            print(" — ".join(violation))
        print("поле — число появлений")
        for identifier, count in sorted(self.field_counts.items()):
            print(f"{identifier} — {count}")
        print("звук — категория — число появлений")
        for (description, category), count in sorted(self.sound_counts.items(), key=lambda pair: str(pair[0])):
            print(f"{description} — {category} — {count}")
        print("сообщение журнала — число появлений")
        for message, count in sorted(self.message_counts.items()):
            print(f"{message} — {count}")
        for line in self.summary:
            print(line)


def check_permissions(context):
    typed_lists = {"terrain", "furniture", "item", "oter", "field", "sound", "message"}
    processed_rows = 0
    for row in context.rows:
        if not isinstance(row, dict):
            continue
        processed_rows += 1
        kind = row.get("list")
        identifier = row.get("id")
        name = row.get("new_name_ru") or row.get("name_ru")
        if isinstance(kind, str) and isinstance(identifier, str):
            if isinstance(name, str) and name:
                context.names[kind][identifier] = name
            if (kind in typed_lists and
                    row.get("decision") in ("keep", "keep_rename")):
                context.allowed[kind].add(identifier)
    context.summary.append(f"строк допусков проверено — {processed_rows}")

    def json_name(entry):
        name = entry.get("name")
        if isinstance(name, str):
            return name
        if isinstance(name, dict):
            return next((name[key] for key in ("str", "str_sp", "str_pl")
                         if isinstance(name.get(key), str)), "")
        if entry.get("type") == "field_type":
            levels = entry.get("intensity_levels", [])
            if isinstance(levels, list):
                for level in levels:
                    if isinstance(level, dict):
                        name = level.get("name")
                        if isinstance(name, str):
                            return name
                        if isinstance(name, dict):
                            return next((name[key] for key in ("str", "str_sp", "str_pl")
                                         if isinstance(name.get(key), str)), "")
        return ""

    native_lists = {
        "terrain": "terrain",
        "furniture": "furniture",
        "overmap_terrain": "oter",
        "field_type": "field",
        "weather_type": "weather",
        "MONSTER": "monster",
        "ITEM": "item",
    }
    for entry in context.definitions:
        kind = native_lists.get(entry.get("type"))
        if not kind:
            continue
        name = json_name(entry)
        identifiers = entry.get("id", [])
        if isinstance(identifiers, str):
            identifiers = [identifiers]
        if not isinstance(identifiers, list):
            continue
        for identifier in identifiers:
            if isinstance(identifier, str) and name:
                context.names[kind].setdefault(identifier, name)
                if kind == "monster":
                    context.names["fauna"].setdefault(identifier, name)

    directions = ("north", "east", "south", "west")
    courtyard_roots = {}
    for entry in context.mod_objects:
        if (not isinstance(entry, dict) or entry.get("type") != "overmap_special" or
                entry.get("id") != "novgorod_dev_courtyard_special"):
            continue
        overmaps = entry.get("overmaps", [])
        if not isinstance(overmaps, list):
            continue
        for overmap in overmaps:
            if not isinstance(overmap, dict):
                continue
            identifier = overmap.get("overmap")
            point = overmap.get("point")
            if (not isinstance(identifier, str) or not isinstance(point, list) or
                    len(point) != 3 or type(point[2]) is not int):
                continue
            direction = identifier.rsplit("_", 1)[-1]
            if direction not in directions:
                continue
            root = identifier[:-(len(direction) + 1)]
            if root not in ("novgorod_dev_courtyard", "novgorod_dev_courtyard_roof"):
                continue
            if point[2] not in (0, 1):
                continue
            courtyard_roots[root] = point[2]

    mapgen_oters = set(courtyard_roots)
    for root, z in courtyard_roots.items():
        definition = context.definition("overmap_terrain", root)
        if not definition:
            continue
        rotated = context.court_ground_oters if z == 0 else context.court_roof_oters if z == 1 else set()
        for direction in directions:
            identifier = f"{root}_{direction}"
            context.court_oters.add(identifier)
            rotated.add(identifier)
            name = json_name(definition)
            if name:
                context.names["oter"].setdefault(identifier, name)

    for entry in context.mod_objects:
        if not isinstance(entry, dict) or entry.get("type") != "mapgen":
            continue
        overmap_terrain = entry.get("om_terrain")
        if not isinstance(overmap_terrain, str) or overmap_terrain not in mapgen_oters:
            continue
        z = courtyard_roots[overmap_terrain]
        value = entry.get("object")
        if not isinstance(value, dict):
            continue
        for field, kind in (("terrain", "terrain"), ("furniture", "furniture")):
            mappings = value.get(field, {})
            if isinstance(mappings, dict):
                identifiers = {
                    identifier for identifier in mappings.values()
                    if isinstance(identifier, str)
                }
                context.court_allowed[kind].update(identifiers)
                for identifier in identifiers:
                    context.court_levels[(kind, identifier)].add(z)
        loot = value.get("place_loot", [])
        if isinstance(loot, list):
            identifiers = {
                entry["item"] for entry in loot
                if isinstance(entry, dict) and isinstance(entry.get("item"), str)
            }
            context.court_allowed["item"].update(identifiers)
            for identifier in identifiers:
                context.court_levels[("item", identifier)].add(z)

    for kind in ("terrain", "furniture"):
        pending = [
            (identifier, z)
            for (level_kind, identifier), levels in context.court_levels.items()
            if level_kind == kind
            for z in levels
        ]
        while pending:
            identifier, z = pending.pop()
            definition = context.definition(kind, identifier)
            for field in ("open", "close"):
                target = definition.get(field)
                levels = context.court_levels[(kind, target)] if isinstance(target, str) else set()
                if isinstance(target, str) and z not in levels:
                    context.court_allowed[kind].add(target)
                    levels.add(z)
                    pending.append((target, z))

    def item_ids(value, groups=frozenset()):
        if isinstance(value, list):
            for child in value:
                yield from item_ids(child, groups)
        elif isinstance(value, dict):
            identifier = value.get("item")
            if isinstance(identifier, str):
                yield identifier
            group = value.get("group")
            if isinstance(group, str) and group not in groups:
                definition = context.definition("item_group", group)
                yield from item_ids(definition.get("entries", []), groups | {group})
            for key, child in value.items():
                if key not in ("item", "group"):
                    yield from item_ids(child, groups)

    master_groups = {
        "novgorod_dev_master_worn",
        "novgorod_dev_master_carried",
        "novgorod_dev_master_weapon",
    }
    crosswalk_path = context.args.mod / "mtype_taxon_crosswalk.csv"
    try:
        with crosswalk_path.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                identifier = row.get("mtype_id")
                if isinstance(identifier, str) and row.get("decision") == "allow":
                    context.fauna.add(identifier)
    except (OSError, UnicodeError, csv.Error):
        context.issue("неизвестный вход", crosswalk_path, "fauna", "mtype_taxon_crosswalk.csv")

    for entry in context.mod_objects:
        if not isinstance(entry, dict):
            continue
        if entry.get("type") == "item_group" and entry.get("id") in master_groups:
            context.master_types.update(item_ids(entry.get("entries", [])))
        if entry.get("type") == "profession" and entry.get("id") == "novgorod_dev_visitor":
            context.hero_types.update(item_ids(entry.get("items", {})))
        if entry.get("type") == "MONSTER_BLACKLIST":
            monsters = entry.get("monsters", [])
            if not isinstance(monsters, list) or any(not isinstance(identifier, str) for identifier in monsters):
                context.issue("неизвестный вход", context.args.mod / "fauna-policy.json",
                              "fauna", "MONSTER_BLACKLIST", "monsters")
                continue
            context.blacklisted_types.update(monsters)
        elif entry.get("type") == "MONSTER_WHITELIST":
            context.exclusive = entry.get("mode") == "EXCLUSIVE"
            raw_monsters = entry.get("monsters")
            if not isinstance(raw_monsters, list) or any(not isinstance(identifier, str) for identifier in raw_monsters):
                context.issue("неизвестный вход", context.args.mod / "fauna-policy.json",
                              "fauna", "MONSTER_WHITELIST", "monsters")
                continue
            monsters = {
                identifier for identifier in raw_monsters
            }
            context.whitelisted_types.update(monsters)


def check_overmaps(context):
    side = 180
    cells_per_layer = side * side
    ground_oters = context.court_ground_oters
    roof_oters = context.court_roof_oters
    court_oters = context.court_oters | ground_oters | roof_oters
    allowed_oters = context.allowed["oter"] | court_oters
    yard_positions = []
    roof_positions = []
    saved_npcs = []
    group_definitions = defaultdict(list)

    def issue(location, kind, identifier, name=""):
        context.issue("карта", location, kind, identifier, name)

    def oter_name(identifier):
        return context.names["oter"].get(identifier, "")

    def monster_name(identifier):
        return (context.names["fauna"].get(identifier, "") or
                context.names["monster"].get(identifier, ""))

    for entry in context.definitions:
        if entry.get("type") == "monstergroup" and isinstance(entry.get("id"), str):
            group_definitions[entry["id"]].append(entry)

    def group_members(identifier, parents=()):
        if identifier in parents or identifier not in group_definitions:
            return set(), {identifier}
        members = set()
        missing = set()
        default = "mon_null"
        explicit_null = False
        loaded = False
        for definition in group_definitions[identifier]:
            if not loaded or definition.get("override") is True:
                members.clear()
                default = definition.get("default", "mon_null")
                explicit_null = definition.get("default") == "mon_null" and "default" in definition
                loaded = True
            elif "default" in definition:
                default = definition.get("default", "mon_null")
                explicit_null = default == "mon_null"
            elif default == "mon_null":
                explicit_null = True

            entries = definition.get("monsters", [])
            if not isinstance(entries, list):
                missing.add(identifier)
                continue
            default_candidate = "mon_null"
            default_frequency = 0
            for spawn in entries:
                if not isinstance(spawn, dict):
                    missing.add(identifier)
                    continue
                frequency = spawn.get("freq", spawn.get("weight", 1))
                if type(frequency) is not int or frequency <= 0:
                    continue
                subgroup = spawn.get("group")
                monster = spawn.get("monster")
                if isinstance(subgroup, str):
                    nested, nested_missing = group_members(subgroup, parents + (identifier,))
                    members.update(nested)
                    missing.update(nested_missing)
                elif isinstance(monster, str):
                    members.add(monster)
                    if spawn.get("event", "none") == "none" and frequency > default_frequency:
                        default_candidate = monster
                        default_frequency = frequency
                else:
                    missing.add(identifier)
            if default == "mon_null" and not explicit_null:
                default = default_candidate

        if default != "mon_null":
            members.add(default)
        whitelist = context.whitelisted_types or context.fauna
        members = {
            member for member in members
            if member in whitelist or (member not in context.blacklisted_types and not context.exclusive)
        }
        return members, missing

    checked_sections = 0
    for path, (section_x, section_y), overmap in context.overmaps:
        layers = overmap.get("layers")
        section_complete = isinstance(layers, list) and len(layers) == 21
        if not isinstance(layers, list):
            issue(path.name, "overmap", "layers")
            layers = []
        if len(layers) != 21:
            issue(path.name, "overmap", "layers")
        for layer_index, runs in enumerate(layers[:21]):
            z = layer_index - 10
            if not isinstance(runs, list):
                issue(f"{path.name}:{z}", "oter", "layers")
                section_complete = False
                continue
            cell_index = 0
            for run in runs:
                if not isinstance(run, list) or len(run) != 2:
                    issue(f"{path.name}:{z}", "oter", str(run))
                    section_complete = False
                    continue
                identifier, count = run
                if not isinstance(identifier, str) or type(count) is not int or count <= 0:
                    issue(f"{path.name}:{z}", "oter", str(identifier))
                    section_complete = False
                    continue
                limit = min(count, max(0, cells_per_layer - cell_index))
                if cell_index + count > cells_per_layer:
                    issue(f"{path.name}:{z}", "oter", identifier, oter_name(identifier))
                    section_complete = False
                if identifier not in allowed_oters:
                    local_x, local_y = cell_index % side, cell_index // side
                    issue(f"{section_x * side + local_x},{section_y * side + local_y},{z} (run={count})",
                          "oter", identifier, oter_name(identifier))
                elif identifier in court_oters:
                    for offset in range(limit):
                        local_x, local_y = (cell_index + offset) % side, (cell_index + offset) // side
                        position = (section_x * side + local_x, section_y * side + local_y)
                        if identifier in ground_oters and z == 0:
                            yard_positions.append((*position, identifier))
                        elif identifier in roof_oters and z == 1:
                            roof_positions.append((*position, identifier))
                        else:
                            issue(f"{position[0]},{position[1]},{z}", "oter", identifier, oter_name(identifier))
                cell_index += count
            if cell_index != cells_per_layer:
                issue(f"{path.name}:{z}", "oter", f"cells={cell_index}")
                section_complete = False

        if section_complete:
            checked_sections += 1

        npcs = overmap.get("npcs", [])
        if not isinstance(npcs, list):
            issue(path.name, "npc", "npcs")
        else:
            saved_npcs.extend((path, npc) for npc in npcs)

    yard_xy = yard_positions[0][:2] if yard_positions else None
    roof_xy = roof_positions[0][:2] if roof_positions else None
    if len(yard_positions) > 1:
        for x, y, identifier in yard_positions[1:]:
            issue(f"{x},{y},0", "oter", identifier, oter_name(identifier))
    if len(roof_positions) > 1:
        for x, y, identifier in roof_positions[1:]:
            issue(f"{x},{y},1", "oter", identifier, oter_name(identifier))
    if len(yard_positions) != 1 or len(roof_positions) != 1 or yard_xy != roof_xy:
        if len(yard_positions) == 1 and len(roof_positions) == 1:
            x, y, identifier = roof_positions[0]
            issue(f"{x},{y},1", "oter", identifier, oter_name(identifier))
        issue("overmap", "oter", "courtyard")
        context.court_positions.clear()
    else:
        context.court_positions = {(yard_positions[0][0], yard_positions[0][1], 0)}

    masters = []
    for path, npc in saved_npcs:
        if not isinstance(npc, dict):
            context.issue("человек", path.name, "npc", str(npc))
            continue
        identifier = npc.get("id")
        is_master = npc.get("unique_id") == "novgorod_dev_master" and npc.get("idz") == "novgorod_dev_master"
        if not is_master:
            context.issue("человек", path.name, "npc", str(npc.get("unique_id", npc.get("idz", identifier))))
            continue
        if type(identifier) is not int:
            context.issue("человек", path.name, "npc", str(identifier))
            continue
        context.master_ids.add(str(identifier))
        masters.append(npc)
        location = npc.get("location")
        if (not isinstance(location, list) or len(location) != 3 or
                any(type(coordinate) is not int for coordinate in location)):
            context.issue("человек", path.name, "npc", "location")
    if len(masters) != 1:
        context.issue("человек", "overmap", "npc", f"masters={len(masters)}")

    for path, (section_x, section_y), overmap in context.overmaps:
        groups = overmap.get("monster_groups", [])
        if not isinstance(groups, list):
            issue(path.name, "monster_group", "monster_groups")
            groups = []
        for record in groups:
            if not isinstance(record, list) or len(record) != 2 or not isinstance(record[0], dict) or not isinstance(record[1], list):
                issue(path.name, "monster_group", str(record))
                continue
            group, positions = record
            actual = group.get("monsters", [])
            if not isinstance(actual, list):
                issue(path.name, "monster_group", str(group.get("type", "")))
                continue
            population = group.get("population", 1)
            if type(population) is not int or population < 0:
                issue(path.name, "monster_group", str(group.get("type", "")))
                continue
            group_id = group.get("type")
            if not isinstance(group_id, str):
                issue(path.name, "monster_group", str(group_id))
                continue
            candidates = set()
            if actual:
                for monster in actual:
                    monster_id = monster.get("typeid") if isinstance(monster, dict) else None
                    if not isinstance(monster_id, str) or monster_id not in context.fauna:
                        for position in positions or [None]:
                            location = path.name
                            if (isinstance(position, list) and len(position) == 3 and
                                    all(type(coordinate) is int for coordinate in position)):
                                location = f"{section_x * side + position[0] // 2},{section_y * side + position[1] // 2},{position[2]}"
                            context.issue("существо", location, "creature", str(monster_id), monster_name(str(monster_id)))
            elif population:
                candidates, missing = group_members(group_id)
                for missing_id in sorted(missing):
                    context.issue("неизвестный вход", path.name, "monster_group", missing_id)
                for monster_id in sorted(candidates - context.fauna):
                    context.issue("существо", path.name, "creature", monster_id, monster_name(monster_id))
            for position in positions:
                if (not isinstance(position, list) or len(position) != 3 or
                        any(type(coordinate) is not int for coordinate in position)):
                    issue(path.name, "monster_group", group_id)

        horde_map = overmap.get("horde_map", [])
        if not isinstance(horde_map, list):
            issue(path.name, "creature", "horde_map")
            continue
        if len(horde_map) % 6:
            issue(path.name, "creature", "horde_map")
        for index in range(0, len(horde_map) - len(horde_map) % 6, 6):
            position, monster = horde_map[index:index + 2]
            if isinstance(monster, dict):
                monster_id = monster.get("typeid")
            else:
                monster_id = monster
            if not isinstance(monster_id, str) or monster_id not in context.fauna:
                location = path.name
                if (isinstance(position, list) and len(position) == 3 and
                        all(type(coordinate) is int for coordinate in position)):
                    location = f"{position[0] // 24},{position[1] // 24},{position[2]}"
                context.issue("существо", location, "creature", str(monster_id), monster_name(str(monster_id)))

    context.summary.append(f"участков overmap проверено — {checked_sections}")


def check_submaps(context):
    submap_fields = {
        "version", "coordinates", "turn_last_touched", "temperature", "terrain", "radiation",
        "furniture", "items", "traps", "fields", "cosmetics", "phase_reverts", "spawns",
        "vehicles", "partial_constructions", "computers", "camp",
    }
    required_fields = submap_fields - {"computers", "camp"}
    native_elided_fields = submap_fields - {"version", "coordinates", "turn_last_touched", "temperature", "terrain"}
    unsupported_fields = {"traps", "cosmetics", "spawns", "partial_constructions", "computers", "camp"}
    checked = 0
    coordinates_seen = []
    overmaps = {(x, y): value for _, (x, y), value in context.overmaps}

    def issue(rule, location, kind, identifier):
        name = context.names[kind].get(identifier, "") if isinstance(identifier, str) else ""
        context.issue(rule, location, kind, identifier, name)

    def unknown(location, kind, identifier):
        context.issue("неизвестный вход", location, kind, identifier)

    def cell_location(path, coordinates, x=None, y=None):
        result = f"{path}:{','.join(map(str, coordinates))}"
        if x is not None and y is not None:
            result += f"[{x},{y}]"
        return result

    def court_xy(coordinates):
        return coordinates is not None and (coordinates[0] // 2, coordinates[1] // 2, 0) in context.court_positions

    ground_roots = {
        identifier.rsplit("_", 1)[0]
        for identifier in context.court_ground_oters
        if identifier.rsplit("_", 1)[-1] in ("north", "east", "south", "west")
    }
    roof_roots = {
        identifier.rsplit("_", 1)[0]
        for identifier in context.court_roof_oters
        if identifier.rsplit("_", 1)[-1] in ("north", "east", "south", "west")
    }
    court_by_level = {0: defaultdict(set), 1: defaultdict(set)}
    for entry in context.mod_objects:
        if not isinstance(entry, dict) or entry.get("type") != "mapgen":
            continue
        om_terrain = entry.get("om_terrain")
        level = 0 if om_terrain in ground_roots else 1 if om_terrain in roof_roots else None
        value = entry.get("object")
        if level is None or not isinstance(value, dict):
            continue
        for field, kind in (("terrain", "terrain"), ("furniture", "furniture")):
            mappings = value.get(field, {})
            if isinstance(mappings, dict):
                court_by_level[level][kind].update(identifier for identifier in mappings.values() if isinstance(identifier, str))
        loot = value.get("place_loot", [])
        if isinstance(loot, list):
            court_by_level[level]["item"].update(
                entry["item"] for entry in loot if isinstance(entry, dict) and isinstance(entry.get("item"), str)
            )
    for level in (0, 1):
        for kind in ("terrain", "furniture"):
            pending = list(court_by_level[level][kind])
            while pending:
                identifier = pending.pop()
                definition = context.definition(kind, identifier)
                for transition in ("open", "close"):
                    target = definition.get(transition)
                    if isinstance(target, str) and target not in court_by_level[level][kind]:
                        court_by_level[level][kind].add(target)
                        pending.append(target)

    def overmap_oter(coordinates):
        if coordinates is None:
            return None
        omt_x, omt_y, z = coordinates[0] // 2, coordinates[1] // 2, coordinates[2]
        section_x, section_y = omt_x // 180, omt_y // 180
        overmap = overmaps.get((section_x, section_y))
        layer_index = z + 10
        if not isinstance(overmap, dict) or not 0 <= layer_index < 21:
            return None
        layers = overmap.get("layers")
        if not isinstance(layers, list) or layer_index >= len(layers) or not isinstance(layers[layer_index], list):
            return None
        target = (omt_y - section_y * 180) * 180 + omt_x - section_x * 180
        offset = 0
        for run in layers[layer_index]:
            if not isinstance(run, list) or len(run) != 2:
                return None
            identifier, count = run
            if not isinstance(identifier, str) or type(count) is not int or count <= 0:
                return None
            if offset <= target < offset + count:
                return identifier
            offset += count
        return None

    def permit(kind, identifier, coordinates, location, rule):
        if identifier in context.allowed[kind]:
            return
        if identifier in context.court_allowed[kind]:
            if not court_xy(coordinates):
                issue(rule + " вне двора", location, kind, identifier)
            elif coordinates[2] not in court_by_level or identifier not in court_by_level[coordinates[2]][kind]:
                issue("подкарта", location, kind, identifier)
            return
        if kind == "furniture" and not court_xy(coordinates) and overmap_oter(coordinates) in context.allowed["oter"]:
            issue("подкарта", location, kind, identifier)
        else:
            issue(rule, location, kind, identifier)

    def valid_local_position(x, y):
        return type(x) is int and type(y) is int and 0 <= x < 12 and 0 <= y < 12

    def check_item_tree(root, coordinates, location, base_rule, allowed_base, nested_allowed):
        if not isinstance(root, dict) or not isinstance(root.get("typeid"), str):
            unknown(location, "item", "typeid")
            return
        for node in item_nodes(root):
            identifier = node.get("typeid")
            uid = node.get("uid")
            if type(uid) not in (str, int) or not str(uid):
                unknown(location, "item", "uid")
            if node is root:
                if identifier not in allowed_base:
                    permit("item", identifier, coordinates, location, base_rule)
            elif identifier not in nested_allowed:
                permit("item", identifier, coordinates, location, "вложение")

    def actor_roots(actor, location, inventory_fields):
        roots = []
        worn = actor.get("worn")
        if isinstance(worn, dict):
            worn_items = worn.get("worn", [])
        elif isinstance(worn, list):
            worn_items = worn
        elif worn is None or worn == {}:
            worn_items = []
        else:
            unknown(location, "worn", "shape")
            worn_items = []
        if not isinstance(worn_items, list):
            unknown(location, "worn", "worn")
        else:
            roots.extend(worn_items)

        weapon = actor.get("weapon")
        if isinstance(weapon, dict):
            if weapon:
                roots.append(weapon)
        elif weapon is not None:
            unknown(location, "weapon", "shape")

        for field in inventory_fields:
            value = actor.get(field)
            if value is None:
                continue
            if isinstance(value, list):
                roots.extend(value)
            elif isinstance(value, dict) and isinstance(value.get("typeid"), str):
                roots.append(value)
            elif isinstance(value, dict) and isinstance(value.get("items"), list):
                roots.extend(value["items"])
            elif value:
                unknown(location, field, "shape")
        return roots

    def check_actor(actor, location, base_allowed, base_rule, inventory_fields):
        nested_allowed = context.allowed["item"] | base_allowed
        for root in actor_roots(actor, location, inventory_fields):
            if not isinstance(root, dict) or not isinstance(root.get("typeid"), str):
                unknown(location, "item", "typeid")
                continue
            for node in item_nodes(root):
                identifier = node.get("typeid")
                uid = node.get("uid")
                if type(uid) not in (str, int) or not str(uid):
                    unknown(location, "item", "uid")
                else:
                    key = str(uid)
                    if key in context.saved_items:
                        unknown(location, "item", key)
                    else:
                        context.saved_items[key] = node
                if node is root:
                    if identifier not in base_allowed:
                        issue(base_rule, location, "item", identifier)
                elif identifier not in nested_allowed:
                    issue("вложение", location, "item", identifier)

    for path, submap in context.submaps:
        checked += 1
        if not isinstance(submap, dict):
            unknown(str(path), "submap", "object")
            continue
        location = str(path)
        terrain = submap.get("terrain")
        native_uniform = (
            isinstance(terrain, list) and len(terrain) == 1 and
            isinstance(terrain[0], list) and len(terrain[0]) == 2 and
            isinstance(terrain[0][0], str) and type(terrain[0][1]) is int and terrain[0][1] == 144 and
            not native_elided_fields.intersection(submap)
        )
        missing_fields = required_fields - submap.keys()
        if native_uniform:
            missing_fields -= native_elided_fields
        for field in sorted(missing_fields):
            unknown(location, "submap", field)
        for field in ("version", "turn_last_touched", "temperature"):
            if field in submap and type(submap[field]) is not int:
                unknown(location, field, field)

        raw_coordinates = submap.get("coordinates")
        if (not isinstance(raw_coordinates, list) or len(raw_coordinates) != 3 or
                any(type(value) is not int for value in raw_coordinates)):
            coordinates = None
            unknown(location, "submap", "coordinates")
        else:
            coordinates = tuple(raw_coordinates)
            coordinates_seen.append(coordinates)
            location = cell_location(path, coordinates)
            if overmap_oter(coordinates) is None:
                issue("подкарта", location, "overmap", "missing")

        for field in unsupported_fields:
            if submap.get(field):
                unknown(location, field, field)
        for field, value in submap.items():
            if field not in submap_fields and value:
                unknown(location, field, field)

        if not isinstance(terrain, list):
            unknown(location, "terrain", "shape")
        else:
            cell_index = 0
            for run in terrain:
                if isinstance(run, str):
                    identifier, count = run, 1
                elif (isinstance(run, list) and len(run) == 2 and isinstance(run[0], str) and
                      type(run[1]) is int and run[1] > 0):
                    identifier, count = run
                else:
                    unknown(location, "terrain", "run")
                    continue
                if cell_index + count > 144:
                    unknown(location, "terrain", "cells")
                if cell_index < 144:
                    local = cell_index % 12, cell_index // 12
                    permit("terrain", identifier, coordinates, cell_location(path, coordinates or ("?", "?", "?"), *local), "местность")
                cell_index += count
            if cell_index != 144:
                unknown(location, "terrain", f"cells={cell_index}")

        furniture = submap.get("furniture", [])
        if not isinstance(furniture, list):
            unknown(location, "furniture", "shape")
        else:
            for entry in furniture:
                if (not isinstance(entry, list) or len(entry) != 3 or
                        not valid_local_position(entry[0], entry[1]) or not isinstance(entry[2], str)):
                    unknown(location, "furniture", "entry")
                    continue
                x, y, identifier = entry
                permit("furniture", identifier, coordinates, cell_location(path, coordinates or ("?", "?", "?"), x, y), "мебель")

        phase_reverts = submap.get("phase_reverts", [])
        if not isinstance(phase_reverts, list):
            unknown(location, "phase_reverts", "shape")
        else:
            for entry in phase_reverts:
                if (not isinstance(entry, list) or len(entry) != 3 or
                        not valid_local_position(entry[0], entry[1]) or not isinstance(entry[2], str)):
                    unknown(location, "phase_reverts", "entry")
                    continue
                x, y, identifier = entry
                permit("terrain", identifier, coordinates, cell_location(path, coordinates or ("?", "?", "?"), x, y), "местность")

        fields = submap.get("fields", [])
        if not isinstance(fields, list):
            unknown(location, "fields", "shape")
        else:
            if len(fields) % 3:
                unknown(location, "fields", "entries")
            for index in range(0, len(fields) - len(fields) % 3, 3):
                x, y, entries = fields[index:index + 3]
                field_location = cell_location(path, coordinates or ("?", "?", "?"), x, y) if valid_local_position(x, y) else location
                if not valid_local_position(x, y) or not isinstance(entries, list):
                    unknown(field_location, "fields", "entry")
                    continue
                if len(entries) % 4:
                    unknown(field_location, "fields", "values")
                for offset in range(0, len(entries) - len(entries) % 4, 4):
                    identifier, intensity, age, source = entries[offset:offset + 4]
                    if (not isinstance(identifier, str) or type(intensity) is not int or type(age) is not int or
                            not isinstance(source, (dict, type(None)))):
                        unknown(field_location, "fields", "value")
                    elif identifier not in context.allowed["field"]:
                        issue("поле", field_location, "field", identifier)

        items = submap.get("items", [])
        if not isinstance(items, list):
            unknown(location, "items", "shape")
        else:
            if len(items) % 3:
                unknown(location, "items", "entries")
            for index in range(0, len(items) - len(items) % 3, 3):
                x, y, stack = items[index:index + 3]
                item_location = cell_location(path, coordinates or ("?", "?", "?"), x, y) if valid_local_position(x, y) else location
                if not valid_local_position(x, y) or not isinstance(stack, list):
                    unknown(item_location, "items", "entry")
                    continue
                for root in stack:
                    check_item_tree(root, coordinates, item_location, "вещь", set(), context.allowed["item"])

        radiation = [0, 144] if native_uniform else submap.get("radiation", [])
        if not isinstance(radiation, list) or len(radiation) % 2:
            unknown(location, "radiation", "shape")
        else:
            cells = 0
            nonzero = False
            for index in range(0, len(radiation), 2):
                level, count = radiation[index:index + 2]
                if type(level) is not int or type(count) is not int or count <= 0:
                    unknown(location, "radiation", "run")
                    continue
                cells += count
                nonzero = nonzero or level != 0
            if cells != 144:
                unknown(location, "radiation", f"cells={cells}")
            if nonzero:
                unknown(location, "radiation", "radiation")

        vehicles = submap.get("vehicles", [])
        if isinstance(vehicles, list):
            for vehicle in vehicles:
                identifier = vehicle.get("type") if isinstance(vehicle, dict) else str(vehicle)
                name = vehicle.get("name", "") if isinstance(vehicle, dict) else ""
                context.issue("транспорт", location, "vehicle", identifier, name if isinstance(name, str) else "")
        elif vehicles:
            issue("транспорт", location, "vehicle", "vehicles")

    for path, save in context.saves:
        if not isinstance(save, dict):
            continue
        player = save.get("player")
        if not isinstance(player, dict):
            unknown(str(path), "player", "object")
            continue
        check_actor(player, str(path), context.hero_types, "снаряжение", ("inventory", "inv"))
        monsters = save.get("active_monsters", [])
        if not isinstance(monsters, list):
            unknown(str(path), "active_monsters", "shape")
        else:
            for monster in monsters:
                if not isinstance(monster, dict) or not isinstance(monster.get("typeid"), str):
                    unknown(str(path), "active_monsters", "typeid")
                    continue
                identifier = monster["typeid"]
                position = monster.get("location")
                if (not isinstance(position, list) or len(position) != 3 or
                        any(type(value) is not int for value in position)):
                    unknown(str(path), "active_monsters", "location")
                    monster_location = str(path)
                else:
                    monster_location = f"{path}:{','.join(map(str, position))}"
                if identifier not in context.fauna:
                    context.issue("существо", monster_location, "creature", identifier,
                                  context.names["fauna"].get(identifier, ""))

    for path, _, overmap in context.overmaps:
        npcs = overmap.get("npcs", [])
        if not isinstance(npcs, list):
            continue
        for npc in npcs:
            if not isinstance(npc, dict):
                continue
            identifier = str(npc.get("id"))
            is_master = npc.get("unique_id") == "novgorod_dev_master" and identifier in context.master_ids
            allowed = context.master_types if is_master else set()
            check_actor(npc, f"{path}:npc:{identifier}", allowed, "снаряжение мастера",
                        ("inventory", "inv", "companion_mission_inv"))

    context.summary.append(f"подкарт проверено — {checked}")
    valid_coordinates = [(x // 2, y // 2, z) for x, y, z in coordinates_seen]
    if valid_coordinates:
        context.summary.append(
            "границы проверенных подкат (OMT) — "
            f"x={min(point[0] for point in valid_coordinates)}..{max(point[0] for point in valid_coordinates)}, "
            f"y={min(point[1] for point in valid_coordinates)}..{max(point[1] for point in valid_coordinates)}, "
            f"z={min(point[2] for point in valid_coordinates)}..{max(point[2] for point in valid_coordinates)}"
        )


def check_frames(context):
    frame_keys = {
        "journal", "sounds", "place", "position", "light", "sky_diagnostic", "clock",
        "weather", "visible_terrain", "visible_furniture", "objects", "creatures",
        "inventory", "player_state",
    }
    processed = 0
    state = None

    def form_issue(number, path, identifier):
        context.issue("неизвестный вход", f"кадр {number}", path, identifier)

    def exact(value, expected, number, path):
        if not isinstance(value, dict):
            form_issue(number, path, "object")
            return False
        for key in expected - value.keys():
            form_issue(number, path, key)
        for key in value.keys() - expected:
            form_issue(number, path, key)
        return True

    def is_number(value):
        return type(value) in (int, float) and value == value and str(value).lower() not in ("inf", "-inf", "nan")

    def position(value):
        return isinstance(value, list) and len(value) == 3 and all(type(part) is int for part in value)

    def typed(value, check, number, path, field):
        if not check(value):
            form_issue(number, path, field)
            return False
        return True

    def validate_fields(value, fields, check, number, path):
        valid = True
        for field in fields:
            if field in value and not typed(value[field], check, number, path, field):
                valid = False
        return valid

    def native_name(kind, identifier):
        if not isinstance(identifier, str):
            return ""
        name = context.names.get(kind, {}).get(identifier, "")
        if isinstance(name, str) and name:
            return name
        definition_types = {
            "fauna": ("MONSTER", "monster"),
            "field": ("field_type",),
        }.get(kind, (kind,))
        for definition_type in definition_types:
            definition = context.definition(definition_type, identifier)
            name = definition.get("name")
            if isinstance(name, dict):
                name = name.get("str", "")
            if isinstance(name, str) and name:
                return name
        return ""

    def location(number, coordinates=None):
        if coordinates is None:
            return f"кадр {number}"
        return ",".join(map(str, coordinates))

    def semantic_issue(rule, number, path, kind, identifier, name_kind=None, coordinates=None):
        name = native_name(name_kind or kind, identifier) if isinstance(identifier, str) else ""
        context.issue(rule, location(number, coordinates), path, identifier, name)

    def court_position(value, domain, identifier):
        return (
            position(value)
            and value[2] in context.court_levels[(domain, identifier)]
            and (value[0] // 24, value[1] // 24, 0) in context.court_positions
        )

    def permitted(domain, identifier, coordinates, number, path):
        rule = {"terrain": "местность", "furniture": "мебель", "item": "вещь"}[domain]
        if identifier in context.allowed[domain]:
            return
        if identifier in context.court_allowed[domain]:
            if not court_position(coordinates, domain, identifier):
                semantic_issue(rule + " вне двора", number, path, domain, identifier, coordinates=coordinates)
            return
        semantic_issue(rule, number, path, domain, identifier, coordinates=coordinates)

    def check_item(item, number, path, allowed, rule, owner=False, saved=False):
        keys = {"uid", "type", "name"} | ({"owner"} if owner else set())
        exact(item, keys, number, path)
        if not isinstance(item, dict):
            return
        validate_fields(item, ("uid", "type", "name"), lambda value: isinstance(value, str), number, path)
        if owner and "owner" in item:
            typed(item["owner"], lambda value: isinstance(value, str), number, path, "owner")
        identifier = item.get("type")
        if allowed is not None and isinstance(identifier, str) and identifier not in allowed:
            semantic_issue(rule, number, path, "item", identifier)
        uid = item.get("uid")
        if saved and isinstance(uid, str) and isinstance(identifier, str):
            saved_item = context.saved_items.get(uid)
            if not isinstance(saved_item, dict) or saved_item.get("typeid") != identifier:
                saved_type = saved_item.get("typeid") if isinstance(saved_item, dict) else identifier
                context.issue(rule, f"кадр {number}", path, uid, native_name("item", saved_type))

    def check_item_list(items, number, path, allowed, rule, saved=False):
        if not isinstance(items, list):
            form_issue(number, path, "array")
            return
        for item in items:
            check_item(item, number, path, allowed, rule, saved=saved)

    def check_positioned_groups(groups, number, path, domain):
        if not isinstance(groups, list):
            form_issue(number, path, "array")
            return
        for group in groups:
            keys = {"type", "name", "count", "nearest_distance", "nearest_direction", "positions"}
            exact(group, keys, number, path)
            if not isinstance(group, dict):
                continue
            validate_fields(group, ("type", "name", "nearest_direction"), lambda value: isinstance(value, str), number, path)
            validate_fields(group, ("count", "nearest_distance"), lambda value: type(value) is int and value >= 0, number, path)
            positions = group.get("positions")
            if not isinstance(positions, list):
                form_issue(number, path, "positions")
                positions = []
            else:
                for point in positions:
                    typed(point, position, number, path, "positions")
            count = group.get("count")
            if type(count) is int and count != len(positions):
                form_issue(number, path, "count")
            identifier = group.get("type")
            if isinstance(identifier, str):
                if identifier not in context.allowed[domain] and identifier not in context.court_allowed[domain]:
                    semantic_issue("местность" if domain == "terrain" else "мебель", number, path, domain, identifier)
                elif identifier not in context.allowed[domain]:
                    for point in positions:
                        if not court_position(point, domain, identifier):
                            semantic_issue("местность вне двора" if domain == "terrain" else "мебель вне двора",
                                           number, path, domain, identifier, coordinates=point)

    def check_state(frame, number):
        exact(frame, frame_keys, number, "frame")
        if not isinstance(frame, dict):
            return

        exact(frame.get("journal"), {"player_messages"}, number, "journal")
        journal = frame.get("journal")
        if isinstance(journal, dict):
            exact(journal.get("player_messages"), {"messages", "curmes"}, number, "journal.player_messages")
            player_messages = journal.get("player_messages")
            if isinstance(player_messages, dict):
                typed(player_messages.get("curmes"), lambda value: type(value) is int, number,
                      "journal.player_messages", "curmes")
                messages = player_messages.get("messages")
                if not isinstance(messages, list):
                    form_issue(number, "journal.player_messages", "messages")
                else:
                    for message in messages:
                        exact(message, {"turn", "message", "count", "type"}, number, "journal.player_messages.messages")
                        if not isinstance(message, dict):
                            continue
                        validate_fields(message, ("turn", "count", "type"), lambda value: type(value) is int,
                                        number, "journal.player_messages.messages")
                        valid_message = typed(message.get("message"), lambda value: isinstance(value, str), number,
                                              "journal.player_messages.messages", "message")
                        text = message.get("message")
                        amount = message.get("count")
                        if valid_message and isinstance(text, str):
                            context.message_counts[text] += amount if type(amount) is int and amount > 0 else 1
                            if text not in context.allowed["message"]:
                                context.issue("сообщение", f"кадр {number}", "journal.player_messages.messages", text, text)

        sounds = frame.get("sounds")
        if not isinstance(sounds, list):
            form_issue(number, "sounds", "array")
        else:
            for sound in sounds:
                exact(sound, {"position", "description", "category", "heard_volume", "ambient", "native_turn"},
                      number, "sounds")
                if not isinstance(sound, dict):
                    continue
                typed(sound.get("position"), position, number, "sounds", "position")
                typed(sound.get("description"), lambda value: isinstance(value, str), number, "sounds", "description")
                validate_fields(sound, ("category", "heard_volume", "native_turn"), lambda value: type(value) is int, number, "sounds")
                typed(sound.get("ambient"), lambda value: type(value) is bool, number, "sounds", "ambient")
                description = sound.get("description")
                category = sound.get("category")
                if isinstance(description, str) and type(category) is int:
                    context.sound_counts[(description, category)] += 1
                    sound_key = f"{category}|{description}"
                    if sound_key not in context.allowed["sound"]:
                        context.issue("звук", f"кадр {number}", "sounds", sound_key, description)

        exact(frame.get("place"), {"name", "overmap_position", "outside", "roofed", "z"}, number, "place")
        place = frame.get("place")
        if isinstance(place, dict):
            typed(place.get("name"), lambda value: isinstance(value, str), number, "place", "name")
            typed(place.get("overmap_position"), position, number, "place", "overmap_position")
            typed(place.get("outside"), lambda value: type(value) is bool, number, "place", "outside")
            typed(place.get("roofed"), lambda value: type(value) is bool, number, "place", "roofed")
            typed(place.get("z"), lambda value: type(value) is int, number, "place", "z")
            name = place.get("name")
            allowed_oter_ids = context.allowed["oter"] | context.court_oters | context.court_ground_oters | context.court_roof_oters
            allowed_names = {context.names["oter"].get(identifier) for identifier in allowed_oter_ids}
            if isinstance(name, str) and name not in allowed_names:
                context.issue("место", f"кадр {number}", "place", name, name)

        typed(frame.get("position"), position, number, "frame", "position")

        exact(frame.get("light"), {"ambient", "label", "sight_range", "unimpaired_range", "vision_threshold"}, number, "light")
        light = frame.get("light")
        if isinstance(light, dict):
            validate_fields(light, ("ambient", "sight_range", "unimpaired_range", "vision_threshold"),
                            is_number, number, "light")
            typed(light.get("label"), lambda value: isinstance(value, str), number, "light", "label")

        sky_fields = {"sun_light", "moon_light", "sun_moon_light", "moon_phase", "natural_light_cached",
                      "sun_light_at_tile_cached", "weather_light_multiplier", "weather_light_modifier",
                      "weather_sun_multiplier", "weather_sight_penalty", "weather_sound_attenuation"}
        exact(frame.get("sky_diagnostic"), sky_fields, number, "sky_diagnostic")
        sky = frame.get("sky_diagnostic")
        if isinstance(sky, dict):
            validate_fields(sky, sky_fields - {"moon_phase"}, is_number, number, "sky_diagnostic")
            typed(sky.get("moon_phase"), lambda value: type(value) is int, number, "sky_diagnostic", "moon_phase")

        exact(frame.get("clock"), {"date_time", "time", "time_of_day", "hour", "night"}, number, "clock")
        clock = frame.get("clock")
        if isinstance(clock, dict):
            validate_fields(clock, ("date_time", "time", "time_of_day"), lambda value: isinstance(value, str), number, "clock")
            typed(clock.get("hour"), lambda value: type(value) is int, number, "clock", "hour")
            typed(clock.get("night"), lambda value: type(value) is bool, number, "clock", "night")

        weather_fields = {"type", "name", "temperature_c", "local_temperature_c", "wind_speed_mph",
                          "wind_direction_degrees", "wind_label", "wind_direction_label", "precipitation", "rains"}
        exact(frame.get("weather"), weather_fields, number, "weather")
        weather = frame.get("weather")
        if isinstance(weather, dict):
            validate_fields(weather, ("type", "name", "wind_label", "wind_direction_label"),
                            lambda value: isinstance(value, str), number, "weather")
            for field in ("temperature_c", "wind_speed_mph", "wind_direction_degrees"):
                typed(weather.get(field), is_number, number, "weather", field)
            local_temperature = weather.get("local_temperature_c")
            if local_temperature is not None:
                typed(local_temperature, is_number, number, "weather", "local_temperature_c")
            typed(weather.get("precipitation"), lambda value: type(value) is int, number, "weather", "precipitation")
            typed(weather.get("rains"), lambda value: type(value) is bool, number, "weather", "rains")
            identifier = weather.get("type")
            definition = context.definition("weather_type", identifier) if isinstance(identifier, str) else {}
            if (not definition or any(definition.get(field) for field in
                                      ("passive_effects", "debug_cause_eoc", "debug_leave_eoc"))):
                semantic_issue("погода", number, "weather", "weather_type", identifier)

        check_positioned_groups(frame.get("visible_terrain"), number, "visible_terrain", "terrain")
        check_positioned_groups(frame.get("visible_furniture"), number, "visible_furniture", "furniture")

        objects = frame.get("objects")
        if not isinstance(objects, list):
            form_issue(number, "objects", "array")
        else:
            for obj in objects:
                if not isinstance(obj, dict):
                    form_issue(number, "objects", "object")
                    continue
                kind = obj.get("kind")
                common = {"kind", "position", "distance", "direction"}
                extras = {
                    "door": {"type", "name", "open_to", "close_to", "state"},
                    "window": {"type", "name", "open_to", "close_to", "state"},
                    "furniture": {"type", "name"},
                    "ground_item": {"item"},
                    "field": {"type", "name", "intensity"},
                    "vehicle_part": {"vehicle_name"},
                    "known_trap": {"name"},
                }
                if not isinstance(kind, str) or kind not in extras:
                    form_issue(number, "objects", str(kind))
                    continue
                exact(obj, common | extras[kind], number, "objects")
                typed(obj.get("position"), position, number, "objects", "position")
                typed(obj.get("distance"), lambda value: type(value) is int and value >= 0, number, "objects", "distance")
                typed(obj.get("direction"), lambda value: isinstance(value, str), number, "objects", "direction")
                coordinates = obj.get("position")
                if kind in ("door", "window", "furniture"):
                    validate_fields(obj, ("type", "name"), lambda value: isinstance(value, str), number, "objects")
                    identifier = obj.get("type")
                    if isinstance(identifier, str):
                        permitted("terrain" if kind in ("door", "window") else "furniture", identifier,
                                  coordinates, number, "objects")
                    if kind in ("door", "window"):
                        validate_fields(obj, ("open_to", "close_to", "state"), lambda value: isinstance(value, str), number, "objects")
                elif kind == "ground_item":
                    check_item(obj.get("item"), number, "objects.item", None, "вещь", owner=True)
                    item = obj.get("item")
                    if isinstance(item, dict) and isinstance(item.get("type"), str):
                        permitted("item", item["type"], coordinates, number, "objects")
                elif kind == "field":
                    validate_fields(obj, ("type", "name"), lambda value: isinstance(value, str), number, "objects")
                    typed(obj.get("intensity"), lambda value: type(value) is int and value > 0, number, "objects", "intensity")
                    identifier = obj.get("type")
                    if isinstance(identifier, str):
                        context.field_counts[identifier] += 1
                        if identifier not in context.allowed["field"]:
                            semantic_issue("поле", number, "objects", "field", identifier)
                elif kind == "vehicle_part":
                    typed(obj.get("vehicle_name"), lambda value: isinstance(value, str), number, "objects", "vehicle_name")
                    vehicle_name = obj.get("vehicle_name", "")
                    context.issue("транспорт", location(number, coordinates), "objects", vehicle_name, vehicle_name)
                else:
                    typed(obj.get("name"), lambda value: isinstance(value, str), number, "objects", "name")
                    form_issue(number, "objects", "known_trap")

        creatures = frame.get("creatures")
        if not isinstance(creatures, list):
            form_issue(number, "creatures", "array")
        else:
            npc_count = 0
            for creature in creatures:
                if not isinstance(creature, dict):
                    form_issue(number, "creatures", "object")
                    continue
                kind = creature.get("kind")
                common = {"kind", "position", "distance", "direction", "name"}
                extras = {
                    "npc": {"id", "type", "status", "attitude", "worn", "wielded"},
                    "creature": {"type", "attitude"},
                    "other_creature": set(),
                }
                if not isinstance(kind, str) or kind not in extras:
                    form_issue(number, "creatures", str(kind))
                    continue
                exact(creature, common | extras[kind], number, "creatures")
                typed(creature.get("position"), position, number, "creatures", "position")
                typed(creature.get("distance"), lambda value: type(value) is int and value >= 0, number, "creatures", "distance")
                typed(creature.get("direction"), lambda value: isinstance(value, str), number, "creatures", "direction")
                typed(creature.get("name"), lambda value: isinstance(value, str), number, "creatures", "name")
                if kind == "npc":
                    npc_count += 1
                    validate_fields(creature, ("id", "type", "status", "attitude"),
                                    lambda value: isinstance(value, str), number, "creatures")
                    identifier = creature.get("type")
                    npc_id = creature.get("id")
                    if (npc_count > 1 or identifier != "novgorod_dev_master" or
                            not isinstance(npc_id, str) or npc_id not in context.master_ids):
                        semantic_issue("человек", number, "creatures", "npc", identifier or str(npc_id), "npc")
                    check_item_list(creature.get("worn"), number, "creatures.worn", context.master_types,
                                    "снаряжение мастера", saved=True)
                    wielded = creature.get("wielded")
                    if wielded is not None:
                        check_item(wielded, number, "creatures.wielded", context.master_types,
                                   "снаряжение мастера", saved=True)
                    elif "wielded" not in creature:
                        form_issue(number, "creatures", "wielded")
                    if "worn" not in creature:
                        form_issue(number, "creatures", "worn")
                elif kind == "creature":
                    validate_fields(creature, ("type", "attitude"), lambda value: isinstance(value, str), number, "creatures")
                    identifier = creature.get("type")
                    if isinstance(identifier, str) and identifier not in context.fauna:
                        semantic_issue("существо", number, "creatures", "creature", identifier, "fauna")
                else:
                    form_issue(number, "creatures", "other_creature")

        check_item_list(frame.get("inventory"), number, "inventory", context.hero_types, "снаряжение", saved=True)

        player_fields = {"name", "male", "bmi_fat", "pain_label", "hunger_label", "thirst_label",
                         "sleepiness_label", "weariness_label", "warmth_label", "activity_label", "weight_label",
                         "pain", "carried_weight_grams", "carry_capacity_grams", "stamina", "wetness_label",
                         "body_parts", "wielded", "activity_id"}
        exact(frame.get("player_state"), player_fields, number, "player_state")
        player = frame.get("player_state")
        if isinstance(player, dict):
            validate_fields(player, player_fields - {"male", "bmi_fat", "pain", "carried_weight_grams", "carry_capacity_grams", "stamina", "wetness_label", "body_parts", "wielded"},
                            lambda value: isinstance(value, str), number, "player_state")
            typed(player.get("male"), lambda value: type(value) is bool, number, "player_state", "male")
            typed(player.get("bmi_fat"), is_number, number, "player_state", "bmi_fat")
            for field in ("pain", "carry_capacity_grams", "stamina"):
                typed(player.get(field), lambda value: type(value) is int, number, "player_state", field)
            weight = player.get("carried_weight_grams")
            if weight is not None:
                typed(weight, lambda value: type(value) is int, number, "player_state", "carried_weight_grams")
            typed(player.get("wetness_label"), lambda value: value is None, number, "player_state", "wetness_label")
            body_parts = player.get("body_parts")
            if not isinstance(body_parts, list):
                form_issue(number, "player_state", "body_parts")
            else:
                for part in body_parts:
                    exact(part, {"id", "wetness", "wetness_percent", "temperature_c"}, number, "player_state.body_parts")
                    if isinstance(part, dict):
                        typed(part.get("id"), lambda value: isinstance(value, str), number, "player_state.body_parts", "id")
                        typed(part.get("wetness"), lambda value: type(value) is int, number, "player_state.body_parts", "wetness")
                        typed(part.get("wetness_percent"), is_number, number, "player_state.body_parts", "wetness_percent")
                        typed(part.get("temperature_c"), is_number, number, "player_state.body_parts", "temperature_c")
            wielded = player.get("wielded")
            if wielded is not None:
                check_item(wielded, number, "player_state.wielded", context.hero_types, "снаряжение", saved=True)

    for number, packet in enumerate(context.packets, 1):
        if not isinstance(packet, dict):
            form_issue(number, "perception", "object")
            continue
        kind = packet.get("kind")
        payload_key = "frame" if kind == "full" else "changes" if kind == "delta" else None
        if payload_key is None:
            form_issue(number, "perception", "kind")
            continue
        exact(packet, {"sequence", "native_turn", "reason", "input_number", "kind", payload_key}, number, "perception")
        validate_fields(packet, ("sequence", "native_turn", "input_number"),
                        lambda value: type(value) is int, number, "perception")
        typed(packet.get("reason"), lambda value: isinstance(value, str), number, "perception", "reason")
        if not isinstance(packet.get(payload_key), dict):
            form_issue(number, "perception", payload_key)
            continue
        if kind == "full":
            state = copy.deepcopy(packet[payload_key])
        elif state is None:
            form_issue(number, "perception", "delta_without_full")
            continue
        else:
            state.update(copy.deepcopy(packet[payload_key]))
        processed += 1
        check_state(state, number)

    if context.packets and processed == len(context.packets):
        context.summary.append(f"кадров проверено — {processed}")


def check_completeness(context):
    rule = "неполный прогон"
    # В эталоне `l` остановлен безопасным режимом и не переместил героя.
    EXCLUDED_REFERENCE_INPUT_NUMBER = 16
    reference_keys = [
        row.get("keys")
        for row in context.reference_inputs
        if isinstance(row, dict) and row.get("number") != EXCLUDED_REFERENCE_INPUT_NUMBER
    ]
    input_numbers = [row.get("number") if isinstance(row, dict) else None for row in context.inputs]
    input_keys = [row.get("keys") if isinstance(row, dict) else None for row in context.inputs]

    if not context.packets:
        context.issue(rule, "perception.jsonl", "recording", "empty")

    if (
        len(context.inputs) != 50
        or input_numbers != list(range(1, 51))
        or input_keys != reference_keys
    ):
        context.issue(rule, "inputs.log", "route", "keys")

    framed_inputs = {
        packet.get("input_number")
        for _, packet, _ in context.frames
        if isinstance(packet.get("input_number"), int)
    }
    for input_number in range(1, 49):
        if input_number not in framed_inputs:
            context.issue(rule, "perception.jsonl", "input_number", input_number)

    if input_keys[-2:] != ["Y", "Q"]:
        context.issue(rule, "inputs.log", "terminal_keys", "49,50")

    if not any(
        isinstance(state.get("place"), dict) and state["place"].get("roofed") is True
        for _, _, state in context.frames
        if isinstance(state, dict)
    ):
        context.issue(rule, "perception.jsonl", "place", "roofed")

    last_packet = context.packets[-1] if context.packets else {}
    last_state = (
        context.frames[-1][2]
        if context.frames and context.frames[-1][0] == len(context.packets)
        else {}
    )
    if (
        not isinstance(last_packet, dict)
        or last_packet.get("reason") != "exit"
        or not isinstance(last_state, dict)
        or not isinstance(last_state.get("place"), dict)
        or last_state["place"].get("roofed") is not False
    ):
        context.issue(rule, "perception.jsonl", "last_frame", "exit")

    if context._json(context.args.world / "mods.json") != ["dda", "novgorod_dev_world"]:
        context.issue(rule, "mods.json", "mods", "dda, novgorod_dev_world")

    if not context.saves:
        context.issue(rule, "world", "save", "missing")
    elif context.frames and context.frames[-1][0] == len(context.packets):
        last_native_turn = last_packet.get("native_turn") if isinstance(last_packet, dict) else None
        if isinstance(last_native_turn, int) and not any(
            isinstance(save, dict)
            and isinstance(save.get("turn"), int)
            and save["turn"] >= last_native_turn
            for _, save in context.saves
        ):
            context.issue(rule, "world", "turn", last_native_turn)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--reference-inputs", required=True, type=Path)
    parser.add_argument("--world", required=True, type=Path)
    parser.add_argument("--mod", required=True, type=Path)
    parser.add_argument("--allowlist", required=True, type=Path)
    context = Context(parser.parse_args(argv))
    for check in (check_permissions, check_overmaps, check_submaps, check_frames, check_completeness):
        check(context)
    for path, error in context.errors:
        context.issue("неизвестный вход", path, "json", "", error)
    context.output()
    return int(bool(context.violations))


if __name__ == "__main__":
    raise SystemExit(main())
