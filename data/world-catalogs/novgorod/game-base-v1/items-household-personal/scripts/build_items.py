"""Build items/household.csv, items/personal.csv, items/mass_policy.csv, items/condition_vocab.csv,
items/item_categories.csv from the authored seed + master/v5/WK sources (deterministic)."""
import re
import sys
from common import (ITEMS, REPORTS, read_psv, write_csv, split, load_master, load_me, load_sources,
                    load_v5, load_wk, HERE)

# Size-band mass policy (editorial rule, grams per quantity unit). Bands are the category mass policy;
# nominal comes from v5 template (src_gameplay_physical_policy_v3), an analogous v5 template, or band default.
BANDS = [
    ("tiny", 1, 50, 20), ("small", 50, 250, 120), ("hand", 250, 1000, 500),
    ("medium", 1000, 5000, 2000), ("large", 5000, 25000, 10000), ("bulky", 25000, 200000, 40000),
]
BAND = {b[0]: b for b in BANDS}

# Condition-state vocabulary by material family; each family cites WK claims on material response.
COND = {
    "wood": ("new;serviceable;worn;cracked;split;repaired;charred;damp_swollen;rotting;broken",
             "claim:population-material-wood-decay;claim:population-material-wood-shrinkage;claim:population-material-wood-combustion"),
    "bark": ("new;serviceable;worn;cracked;torn;repaired;damp", "claim:household-bark-tues;claim:population-material-wood-moisture"),
    "clay": ("whole;chipped;cracked;repaired_laced;sooted;handle_broken;broken_to_sherds",
             "claim:population-ceramic-fracture;claim:population-ceramic-joint;claim:population-ceramic-water"),
    "iron": ("serviceable;dull;rusted;bent;cracked;broken;repaired", "claim:population-material-iron-rust;claim:population-joining-metal-fatigue"),
    "nonferrous": ("serviceable;tarnished;worn_smooth;bent;cracked;broken", "claim:population-joining-metal-cold-work;claim:population-joining-metal-fatigue"),
    "stone": ("whole;worn;chipped;cracked;broken", "claim:stone-whetstone-edge-maintenance"),
    "bone": ("whole;worn_polished;cracked;teeth_broken;broken", "wk:material_culture:novgorod-wood-bone-horn-classes"),
    "leather": ("serviceable;worn;stiff_dry;mouldy;torn;patched;wet", "claim:population-material-leather-dry;claim:population-material-leather-mould;claim:material-water-leather-water-processing"),
    "textile": ("clean;soiled;worn;torn;patched;damp;mouldy", "claim:population-material-wet-wool;claim:material-water-new-linen-water"),
    "wax": ("whole;partly_burnt;stub;softened;broken", "claim:population-joining-wax-soften"),
    "organic_soft": ("fresh;dry;damp;crumbling;spent", "claim:reality-batch-01-dried-herbs-need-dry-protected-storage"),
}
MATFAM = [
    (r"^(wood|twigs|leafy_twigs|gesso)", "wood"), (r"^(birch_bark|bast|willow|reed)", "bark"),
    (r"^(clay|glaze)", "clay"), (r"^(iron|steel)", "iron"), (r"^(copper|silver|lead|tin|metal)", "nonferrous"),
    (r"^stone", "stone"), (r"^(bone|horn)", "bone"), (r"^(leather|rawhide|parchment)", "leather"),
    (r"^(linen|wool|hemp|flax|textile|felt|plant_fiber|gut|horsehair|hair|cord)", "textile"),
    (r"^(beeswax|tallow|wax)", "wax"), (r"^(tinder|straw|grass|hay|feather|pigment)", "organic_soft"),
]
GENERIC = re.compile(r"вариативн|не нормировать|по конкретной|по находке|универсальный размер|type_default|по носителю")

VALUE_RULE = "value_band rule: trifle = common organic/clay/bone work; ordinary = iron tools, lathe/stave work, leatherwork; valued = copper-alloy/silver work, locks, textiles of wool, instruments, imports; costly = glazed imports, codices"


def matfam(materials):
    for m in materials:
        for rx, fam in MATFAM:
            if re.match(rx, m):
                return fam
    return "organic_soft"


def clip(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def main():
    seed = read_psv(HERE / "seed_items.psv")
    master, me, sources = load_master(), load_me(), load_sources()
    tpl, qty, cats, cont, srcb, _ = load_v5()
    claims, concepts = load_wk()
    errors, out = [], {"household": [], "personal": []}
    catrows = {}
    for s in seed:
        iid = s["it_id"]
        mrefs = split(s["master"])
        for m in mrefs:
            if m not in master:
                errors.append(f"{iid}: master ref {m} not found")
        for c in split(s["wk"]):
            if c not in claims and c not in concepts:
                errors.append(f"{iid}: WK claim {c} not found")
        for b in split(s["bib"]):
            if b not in sources:
                errors.append(f"{iid}: source {b} not found")
        v5code = s["v5"]
        if v5code and v5code not in tpl:
            errors.append(f"{iid}: v5 template {v5code} not found")
        if s["container"] and s["container"] not in cont:
            errors.append(f"{iid}: v5 container {s['container']} not found")
        cat_id = f"cat_item_object_{s['cat']}_v1"
        cat_status = "existing_v5_draft" if cat_id in cats else "proposed_new"
        catrows.setdefault(cat_id, {"category_id": cat_id, "stable_code": s["cat"], "domain": "item",
                                    "facet": "object_type", "parent_group": s["group"], "status": cat_status,
                                    "preferred_label_ru": s["name_ru"] if cat_status == "proposed_new" else cats[cat_id]["preferred_label"],
                                    "category_scope": "universal", "region_permission": "region_novgorod_land",
                                    "used_by": []})
        catrows[cat_id]["used_by"].append(iid)
        # mass
        size = s["size"]
        if size not in BAND:
            errors.append(f"{iid}: bad size band {size}")
            continue
        _, lo, hi, dflt = BAND[size]
        mass, basis = None, None
        if s["mass"] == "":
            if not v5code:
                errors.append(f"{iid}: no mass and no v5 template")
                continue
            q = qty[tpl[v5code]["id"]]
            mass, basis = q["mass_grams_per_unit"], f"v5:{tpl[v5code]['id']}.mass_grams_per_unit ({q['source_id']})"
            if q["quantity_unit_id"] == "gram":
                mass, basis = None, None
        elif s["mass"].startswith("a:"):
            a = s["mass"][2:]
            if a not in tpl:
                errors.append(f"{iid}: analog template {a} missing")
                continue
            q = qty[tpl[a]["id"]]
            mass, basis = q["mass_grams_per_unit"], f"analog v5:{tpl[a]['id']} ({q['source_id']})"
        elif s["mass"] == "b":
            mass, basis = dflt, f"band default {size}"
        if mass is None and s["unit"] == "portion":
            mass, basis = dflt, f"band default {size} (portion)"
        if mass is not None and not (lo <= float(mass) <= hi):
            errors.append(f"{iid}: nominal mass {mass} outside band {size} [{lo}-{hi}]")
        # evidence
        prim = master.get(mrefs[0]) if mrefs else None
        confs = sorted({master[m]["conf"] for m in mrefs if m in master})
        conf = s["conf"] or (prim["conf"] if prim else "")
        if not conf and v5code:
            conf = "B"
        att = []
        if prim:
            r = prim["rec"]
            att.append(f"master {mrefs[0]} ({prim['conf']}): {clip(r.get('evidence_basis'), 160)}")
            if len(confs) > 1 or len(mrefs) > 1:
                att.append(f"linked master rows {len(mrefs)}, confidence set {'/'.join(confs)}")
        if v5code:
            bl = srcb.get(tpl[v5code]["id"], [])
            if bl:
                att.append(f"v5 {tpl[v5code]['id']}: {len(bl)} source bindings ({'/'.join(sorted({b['evidence_class'] for b in bl}))})")
        if split(s["wk"]):
            att.append(f"WK approved claims: {len(split(s['wk']))}")
        # source ids resolved from master records + bib keys
        srcids = []
        for m in mrefs:
            if m in master:
                sid = master[m]["rec"].get("source_ids") or []
                if isinstance(sid, str):
                    sid = [x.strip() for x in re.split(r"[|;,]", sid) if x.strip()]
                srcids += sid
        srcids = list(dict.fromkeys(split(s["bib"]) + srcids))
        unknown = [x for x in srcids if x not in sources]
        if unknown:
            errors.append(f"{iid}: unresolved source ids {unknown}")
        src_refs = ([f"master:{master[m]['canonical_id']}" for m in mrefs if m in master]
                    + ([f"v5:{tpl[v5code]['id']}"] if v5code else [])
                    + ([f"v5:container_tpl_nov_{s['container']}_v1"] if s["container"] else [])
                    + [c if c.startswith("wk:") else f"wk:{c}" for c in split(s["wk"])] + [f"src:{x}" for x in srcids])
        # perceptual cues from primary master record (+ matcult dims)
        cues = []
        if prim:
            r = prim["rec"]
            rme = me.get(mrefs[0], {})
            col = r.get("colors") or rme.get("colors")
            wear = r.get("wear_and_condition") or rme.get("wear_and_condition")
            con = r.get("construction")
            dims = r.get("dimensions") or rme.get("dimensions")
            if col and not GENERIC.search(str(col)):
                cues.append(f"цвет: {clip(col, 90)}")
            if con and not GENERIC.search(str(con)) and prim["dataset"] == "occupations":
                cues.append(f"устройство: {clip(con, 110)}")
            if wear and not GENERIC.search(str(wear)):
                cues.append(f"следы: {clip(wear, 90)}")
            if dims and not GENERIC.search(str(dims)):
                cues.append(f"размер по источнику: {clip(dims, 60)}")
        fam = matfam(split(s["materials"]))
        row = {
            "it_id": iid, "name_ru": s["name_ru"], "name_en": s["name_en"], "category_id": cat_id,
            "category_status": cat_status, "category_scope": "universal", "region_permission": "region_novgorod_land",
            "subcategory": s["subcat"], "item_group": s["group"], "material": s["materials"],
            "technique": s["technique"], "size_band": size,
            "mass_rule": f"band:{size} [{lo}-{hi} g per {s['unit']}]" + (f"; nominal {mass} g" if mass is not None else "; mass by measured quantity"),
            "mass_g_nominal": "" if mass is None else mass, "mass_basis": basis or "quantity-measured (gram unit)",
            "quantity_unit": s["unit"], "condition_states": COND[fam][0], "condition_vocab_ref": f"cond_{fam}",
            "perceptual_cues": " | ".join(cues), "functions": s["functions"], "typical_owner_roles": s["owners"],
            "value_band": s["value"], "carry_form": s["carry"], "mark_slots": s["marks"],
            "identifying_text_slot": s["text_slot"], "v5_item_template_ref": f"item_tpl_nov_{v5code}_v1" if v5code else "",
            "v5_container_template_ref": f"container_tpl_nov_{s['container']}_v1" if s["container"] else "",
            "master_refs": ";".join(master[m]["canonical_id"] for m in mrefs if m in master),
            "wk_refs": s["wk"], "attestation": " ; ".join(att), "source_refs": ";".join(src_refs),
            "confidence": conf, "status": "candidate", "note": s["note"],
        }
        if conf not in ("A", "B", "C"):
            errors.append(f"{iid}: confidence {conf!r} not in A/B/C")
        if conf == "C" and not s["note"] and not att:
            errors.append(f"{iid}: confidence C without note/attestation")
        out[s["file"]].append(row)
    fields = list(next(iter(out["household"]))).copy()
    n_h = write_csv(ITEMS / "household.csv", out["household"], fields)
    n_p = write_csv(ITEMS / "personal.csv", out["personal"], fields)
    write_csv(ITEMS / "mass_policy.csv",
              [{"size_band": b, "min_g": lo, "max_g": hi, "default_nominal_g": d,
                "rule": "nominal = v5 template mass | analogous v5 template mass | band default; must lie in [min,max]",
                "basis": "editorial policy (this domain); v5 masses from src_gameplay_physical_policy_v3", "confidence": "C"}
               for b, lo, hi, d in BANDS],
              ["size_band", "min_g", "max_g", "default_nominal_g", "rule", "basis", "confidence"])
    write_csv(ITEMS / "condition_vocab.csv",
              [{"cond_id": f"cond_{k}", "material_family": k, "states": v[0], "source_refs": ";".join(c if c.startswith("wk:") else "wk:" + c for c in v[1].split(";")),
                "confidence": "B"} for k, v in COND.items()],
              ["cond_id", "material_family", "states", "source_refs", "confidence"])
    for c in catrows.values():
        c["used_by"] = ";".join(c["used_by"])
    write_csv(ITEMS / "item_categories.csv", sorted(catrows.values(), key=lambda r: r["category_id"]),
              ["category_id", "stable_code", "domain", "facet", "parent_group", "status", "preferred_label_ru",
               "category_scope", "region_permission", "used_by"])
    # WK claim existence check for condition vocab
    for k, v in COND.items():
        for c in v[1].split(";"):
            if c not in claims and c not in concepts:
                errors.append(f"condition vocab {k}: WK claim {c} missing")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "build_items_errors.txt").write_text("\n".join(errors) + ("\n" if errors else ""), encoding="utf-8")
    print(f"household={n_h} personal={n_p} categories={len(catrows)} errors={len(errors)}")
    for e in errors:
        print("  ERR", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
