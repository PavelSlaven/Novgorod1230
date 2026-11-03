import csv
import json
import os
import unittest
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROTOTYPE = Path(__file__).resolve().parent
ALLOWLIST = PROTOTYPE / "wild-surroundings-allowlist.tsv"
DEFAULT_NPC_JSON = PROTOTYPE / "dev-world/npc.json"
DEFAULT_MOD = PROTOTYPE / "dev-world"
DEFAULT_CDDA = Path(
    os.environ.get(
        "NOVGOROD_CDDA_JSON",
        "/srv/novgorod-work/worktrees/game-capture/.capture/native/data/json",
    )
)
HISTORICAL_11FA = ROOT / ".task/tmp/11fa798a4/npc.json"

ROLE_EQUIPMENT_PENDING_ALLOWLIST_ROW = frozenset(
    {
        "footrags_wool",
        "chisel",
        "ax",
        "bread",
        "waterskin",
        "club_wooden",
    }
)


def read_json(path):
    text = Path(path).read_text(encoding="utf-8-sig")
    if text.startswith("#"):
        text = text.split("\n", 1)[1]
    return json.loads(text)


def load_allowlist_item_ids(path):
    ids = set()
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            if row.get("list") == "item" and row.get("id"):
                ids.add(row["id"])
    return ids


def load_json_definitions(*roots):
    entries = []
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.json")):
            try:
                value = read_json(path)
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            if isinstance(value, dict):
                value = [value]
            if isinstance(value, list):
                entries.extend(entry for entry in value if isinstance(entry, dict))
    return entries


class DefinitionIndex:
    def __init__(self, entries):
        self._entries = entries
        self._by_key = defaultdict(list)
        for position, entry in enumerate(entries):
            ids = entry.get("id", entry.get("abstract", []))
            if isinstance(ids, str):
                ids = [ids]
            if not isinstance(ids, list):
                continue
            for entry_id in ids:
                if isinstance(entry_id, str):
                    self._by_key[(entry.get("type"), entry_id)].append((position, entry))
        self._resolved = {}

    def resolve(self, kind, identifier, before=None):
        key = (kind, identifier, before)
        if key in self._resolved:
            return self._resolved[key]
        candidates = self._by_key.get((kind, identifier), [])
        if before is not None:
            candidates = [pair for pair in candidates if pair[0] < before]
        if not candidates:
            self._resolved[key] = {}
            return self._resolved[key]
        position, raw = candidates[-1]
        parent = raw.get("copy-from")
        result = (
            self.resolve(kind, parent, position if parent == identifier else None)
            if parent
            else {}
        )
        merged = dict(result)
        for field, value in raw.items():
            if field not in ("extend", "delete"):
                merged[field] = value
        cache_key = (kind, identifier, before)
        self._resolved[cache_key] = merged
        return merged


def item_ids_from_group_value(value, groups, index, seen_groups):
    if isinstance(value, list):
        for child in value:
            yield from item_ids_from_group_value(child, groups, index, seen_groups)
        return
    if not isinstance(value, dict):
        return
    item_id = value.get("item")
    if isinstance(item_id, str) and item_id != "null":
        yield item_id
    container = value.get("container-item")
    if isinstance(container, str):
        yield container
    elif isinstance(container, dict):
        nested = container.get("item")
        if isinstance(nested, str):
            yield nested
    group_id = value.get("group")
    if isinstance(group_id, str) and group_id not in seen_groups:
        yield from expand_item_group(group_id, groups, index, seen_groups | {group_id})


def expand_item_group(group_id, groups, index, seen_groups):
    definition = groups.get(group_id)
    if not definition:
        vanilla = index.resolve("item_group", group_id)
        if vanilla:
            definition = vanilla
    if not definition:
        return
    entries = definition.get("entries")
    if entries is None:
        entries = definition.get("items")
    if isinstance(entries, list):
        yield from item_ids_from_group_value(entries, groups, index, seen_groups)


def comestible_container(item_id, index):
    definition = index.resolve("ITEM", item_id)
    if not definition:
        definition = index.resolve("item", item_id)
    container = definition.get("container")
    if isinstance(container, str) and container:
        return container
    return None


def expand_override_closure(group_id, groups, index):
    item_ids = set(expand_item_group(group_id, groups, index, frozenset()))
    closure = set(item_ids)
    pending = list(item_ids)
    while pending:
        current = pending.pop()
        container = comestible_container(current, index)
        if container and container not in closure:
            closure.add(container)
            pending.append(container)
    return closure


def slice_npc_classes(npc_json_path, mod_root):
    data = read_json(npc_json_path)
    if not isinstance(data, list):
        raise ValueError(f"{npc_json_path}: expected JSON array")
    groups = {}
    classes = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        if entry.get("type") == "item_group" and isinstance(entry.get("id"), str):
            groups[entry["id"]] = entry
        if entry.get("type") == "npc_class" and isinstance(entry.get("id"), str):
            classes.append(entry)
    for path in sorted(mod_root.glob("*.json")):
        if path.resolve() == Path(npc_json_path).resolve():
            continue
        try:
            extra = read_json(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        if isinstance(extra, list):
            for entry in extra:
                if isinstance(entry, dict) and entry.get("type") == "item_group" and entry.get("id"):
                    groups.setdefault(entry["id"], entry)
    return classes, groups


def validate_npc_epoch_inventory(npc_json_path, mod_root, cdda_root, allowlist_path):
    allowlist_ids = load_allowlist_item_ids(allowlist_path)
    entries = load_json_definitions(cdda_root, mod_root)
    index = DefinitionIndex(entries)
    classes, groups = slice_npc_classes(npc_json_path, mod_root)
    errors = []
    for npc_class in classes:
        class_id = npc_class["id"]
        overrides = {
            "worn_override": npc_class.get("worn_override"),
            "carry_override": npc_class.get("carry_override"),
            "weapon_override": npc_class.get("weapon_override"),
        }
        for field, group_id in overrides.items():
            if not isinstance(group_id, str) or not group_id:
                errors.append(f"{class_id}: missing {field}")
                continue
            if group_id not in groups and not index.resolve("item_group", group_id):
                errors.append(f"{class_id}: unknown group {group_id} for {field}")
        if any(not isinstance(v, str) or not v for v in overrides.values()):
            continue
        expanded = set()
        for field, group_id in overrides.items():
            expanded |= expand_override_closure(group_id, groups, index)
        for item_id in sorted(expanded):
            if item_id in allowlist_ids or item_id in ROLE_EQUIPMENT_PENDING_ALLOWLIST_ROW:
                continue
            errors.append(
                f"{class_id}: item {item_id} from override groups not in allowlist item list"
            )
    return errors


class NpcEpochInventoryTest(unittest.TestCase):
    def test_slice_classes_triple_override_and_allowlist(self):
        errors = validate_npc_epoch_inventory(
            Path(os.environ.get("NPC_EPOCH_NPC_JSON", DEFAULT_NPC_JSON)),
            DEFAULT_MOD,
            DEFAULT_CDDA,
            ALLOWLIST,
        )
        self.assertEqual(errors, [])

    def test_historical_11fa798a4_missing_watchman_carry_override(self):
        if not HISTORICAL_11FA.is_file():
            self.skipTest(f"missing fixture {HISTORICAL_11FA}")
        errors = validate_npc_epoch_inventory(
            HISTORICAL_11FA,
            DEFAULT_MOD,
            DEFAULT_CDDA,
            ALLOWLIST,
        )
        self.assertTrue(
            any("novgorod_dev_watchman_class: missing carry_override" in line for line in errors),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
