"""Shared loaders for the items-household-personal build scripts (read-only over sources)."""
import csv
import json
import sys
from pathlib import Path

csv.field_size_limit(10**9)

HERE = Path(__file__).resolve().parent
DOMAIN = HERE.parent
ITEMS = DOMAIN / "items"
REPORTS = DOMAIN / "reports"
ROOT = HERE.parents[5]
NOV = ROOT / "data/world-catalogs/novgorod"
MASTER = NOV / "sources/master-archive-v1/data"
ME = MASTER / "normalized_source_tables/material_entities"
OCC = MASTER / "normalized_source_tables/occupations"
V5 = ROOT / "data/knowledge-source/imports/item-container-120-v5/candidate/tables"
WK = NOV / "world-knowledge/production-v1"

REL = lambda p: str(Path(p).resolve().relative_to(ROOT)).replace("\\", "/")


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})
    return len(rows)


def read_psv(path):
    rows, header = [], None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if header is None:
            header = parts
            continue
        if len(parts) != len(header):
            sys.exit(f"{path.name}: column count {len(parts)} != {len(header)} in: {line[:80]}")
        rows.append(dict(zip(header, parts)))
    return rows


def split(v):
    return [x for x in (v or "").split(";") if x]


def load_master():
    """legacy item_id -> dict(canonical_id, record, confidence, dataset)."""
    out = {}
    for x in read_csv(MASTER / "canonical/material_items.csv"):
        s = json.loads(x["source_record"])
        lid = s.get("item_id")
        if lid:
            out[lid] = {"canonical_id": x["id"], "rec": s, "conf": x["historical_confidence"],
                        "dataset": x["source_dataset"], "name_ru": x["name_ru"]}
    return out


def load_me():
    return {r["item_id"]: r for r in read_csv(ME / "material_entities.csv")}


def load_sources():
    src = {}
    for p in (ME / "sources.csv", OCC / "sources.csv"):
        for r in read_csv(p):
            src.setdefault(r["source_id"], r)
    for r in read_csv(HERE / "sources_extra.csv"):
        src[r["source_key"]] = r
    return src


def load_v5():
    L = lambda t: json.load(open(V5 / f"{t}.json", encoding="utf-8"))
    tpl = {t["id"].replace("item_tpl_nov_", "").removesuffix("_v1"): t for t in L("item_templates")}
    qty = {q["item_template_id"]: q for q in L("item_template_quantity_profiles")}
    cats = {c["id"]: c for c in L("universal_categories")}
    cont = {c["id"].replace("container_tpl_nov_", "").removesuffix("_v1"): c for c in L("container_templates")}
    srcb = {}
    for b in L("item_template_source_bindings"):
        srcb.setdefault(b["item_template_id"], []).append(b)
    props = {p["id"]: p for p in L("property_profiles")}
    return tpl, qty, cats, cont, srcb, props


def load_wk():
    b = json.load(open(WK / "runtime-bundle.json", encoding="utf-8"))
    claims = {c["claim_ref"]: c for c in b["claims"]}
    concepts = {c["concept_ref"]: c for c in b["concepts"]}
    return claims, concepts


def load_place_families():
    p = json.load(open(WK / "place-first-cartography.json", encoding="utf-8"))
    return {f["id"]: f for f in p["environment_families"]}
