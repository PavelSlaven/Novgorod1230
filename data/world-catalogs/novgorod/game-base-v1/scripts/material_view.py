"""Read the approved narrow material view over normalized master rows."""
import csv
import hashlib
import json
from functools import lru_cache
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
GAME_BASE = SCRIPT_DIR.parent
VIEW_PATH = GAME_BASE / "generated/master-material-material-view.json"
OVERLAY_PATH = GAME_BASE / "source-overlays/master-material-materials.csv"
OVERLAY_REF = "data/world-catalogs/novgorod/game-base-v1/source-overlays/master-material-materials.csv:"
FIELDS = {"item_id", "primary_material", "materials"}


def _overlay_item_ids(path):
    with open(path, encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if "item_id" not in (reader.fieldnames or []):
            raise ValueError("material overlay lacks item_id column")
        ids = set()
        for row in reader:
            item_id = row.get("item_id", "")
            if not item_id or item_id in ids:
                raise ValueError(f"material overlay has missing or duplicate item_id: {item_id}")
            ids.add(item_id)
    return ids


def _incomplete_view_error(missing, extra):
    error = ValueError(
        f"material view is incomplete; missing item_ids: {json.dumps(missing)}; "
        f"extra item_ids: {json.dumps(extra)}"
    )
    error.code = "MATERIAL_VIEW_INCOMPLETE"
    return error


@lru_cache(maxsize=4)
def load_material_overrides(source_path):
    source_path = Path(source_path)
    view = json.loads(VIEW_PATH.read_text(encoding="utf-8"))
    source_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
    overlay_sha = hashlib.sha256(OVERLAY_PATH.read_bytes()).hexdigest()
    if view.get("source_sha256") != source_sha or view.get("overlay_sha256") != overlay_sha:
        raise ValueError("material view is stale for the normalized master source or overlay")
    overlay_ids = _overlay_item_ids(OVERLAY_PATH)
    rows = view.get("rows")
    if not isinstance(rows, list):
        raise _incomplete_view_error(sorted(overlay_ids), [])
    result = {}
    for row in rows:
        if set(row) != FIELDS or not row.get("item_id") or row["item_id"] in result:
            raise ValueError("material view has invalid or duplicate projected row")
        result[row["item_id"]] = row
    missing = sorted(overlay_ids - result.keys())
    extra = sorted(result.keys() - overlay_ids)
    if missing or extra:
        raise _incomplete_view_error(missing, extra)
    return result


def apply_material_overrides(rows, source_path):
    overrides = load_material_overrides(str(Path(source_path).resolve()))
    result = []
    for row in rows:
        override = overrides.get(row.get("item_id", ""))
        if override:
            result.append({**row, "primary_material": override["primary_material"], "materials": override["materials"]})
        else:
            result.append(row)
    return result


def overlay_source_ref(item_id, source_path):
    return OVERLAY_REF + item_id if item_id in load_material_overrides(str(Path(source_path).resolve())) else ""
