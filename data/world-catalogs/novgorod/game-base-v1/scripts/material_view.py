"""Read the approved narrow material view over normalized master rows."""
import csv
import hashlib
import json
from functools import lru_cache
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
GAME_BASE = SCRIPT_DIR.parent
REPO = GAME_BASE.parents[3]
VIEW_PATH = GAME_BASE / "generated/master-material-material-view.json"
OVERLAY_PATH = GAME_BASE / "source-overlays/master-material-materials.csv"
OVERLAY_REF = "data/world-catalogs/novgorod/game-base-v1/source-overlays/master-material-materials.csv:"
FIELDS = {"item_id", "primary_material", "materials"}


@lru_cache(maxsize=4)
def load_material_overrides(source_path):
    source_path = Path(source_path)
    view = json.loads(VIEW_PATH.read_text(encoding="utf-8"))
    source_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
    overlay_sha = hashlib.sha256(OVERLAY_PATH.read_bytes()).hexdigest()
    if view.get("source_sha256") != source_sha or view.get("overlay_sha256") != overlay_sha:
        raise ValueError("material view is stale for the normalized master source or overlay")
    result = {}
    for row in view.get("rows", []):
        if set(row) != FIELDS or not row.get("item_id") or row["item_id"] in result:
            raise ValueError("material view has invalid or duplicate projected row")
        result[row["item_id"]] = row
    if len(result) != 22:
        raise ValueError(f"material view must contain 22 rows, found {len(result)}")
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
