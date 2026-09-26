"""Acceptance checks for the five domains; writes reports/validation.json and reports/counts.json."""
import json
import re
from collections import Counter, defaultdict
from common import ITEMS, REPORTS, read_csv, split, load_place_families
import rules as R

KIND_OF_SLOT = {"own": {"owner_sign", "inscription"}, "mk": {"maker_mark", "inscription"}, "orn": {"ornament"},
                "rep": {"repair"}, "wear": {"wear"}, "dmg": {"damage"}, "ins": {"inscription"}}
MATFAM = [(r"^(wood|twigs|leafy_twigs|gesso)", "wood"), (r"^(birch_bark|bast|willow|reed)", "bark"), (r"^(clay|glaze)", "clay"),
          (r"^(iron|steel)", "iron"), (r"^(copper|silver|lead|tin|metal)", "nonferrous"), (r"^stone", "stone"),
          (r"^(bone|horn)", "bone"), (r"^(leather|rawhide|parchment)", "leather"),
          (r"^(linen|wool|hemp|flax|textile|felt|plant_fiber|gut|horsehair|hair|cord)", "textile"),
          (r"^(beeswax|tallow|wax)", "wax"), (r"^(tinder|straw|grass|hay|feather|pigment)", "organic_soft")]
DENY = re.compile(r"\b(картоф|кукуруз|томат|подсолнеч|табак|индейк|кролик|чай\b|кофе\b|сахар\b|огнестрел|пищал|бумаг|бумажн|ухват|чугун)", re.I)
TEMPLATE_ALLOWED_CAPS = {"Святая", "Богородице", "ІС", "ХС"}


def fams(materials):
    out = set()
    for m in split(materials):
        for rx, f in MATFAM:
            if re.match(rx, m):
                out.add(f)
                break
    return out


def main():
    res, counts = {}, {}
    H, P = read_csv(ITEMS / "household.csv"), read_csv(ITEMS / "personal.csv")
    items = H + P
    cats = {r["category_id"] for r in read_csv(ITEMS / "item_categories.csv")}
    bands = {r["size_band"]: r for r in read_csv(ITEMS / "mass_policy.csv")}
    # --- household/personal
    fail = []
    seen = Counter((r["category_id"], r["material"], r["name_ru"]) for r in items)
    for r in items:
        if r["category_id"] not in cats:
            fail.append(f"{r['it_id']}: category unresolved")
        b = bands[r["size_band"]]
        if r["mass_g_nominal"] and not (float(b["min_g"]) <= float(r["mass_g_nominal"]) <= float(b["max_g"])):
            fail.append(f"{r['it_id']}: mass outside policy")
        if seen[(r["category_id"], r["material"], r["name_ru"])] > 1:
            fail.append(f"{r['it_id']}: duplicate (category, material, name)")
        if not r["attestation"] and not (r["confidence"] == "C" and r["note"]):
            fail.append(f"{r['it_id']}: no attestation and not C+note")
        if not r["source_refs"]:
            fail.append(f"{r['it_id']}: no source_refs")
        if DENY.search(r["name_ru"]):
            fail.append(f"{r['it_id']}: anachronism denylist")
    res["household_personal_items"] = {"pass": not fail, "failures": fail}
    # --- personal text slots
    pools = {r["text_pool_id"]: r for r in read_csv(ITEMS / "identifying_text_pools.csv")}
    fail = []
    for r in items:
        s = r["identifying_text_slot"]
        if s != "none":
            if s not in pools:
                fail.append(f"{r['it_id']}: text pool {s} missing")
            elif pools[s]["status"] != "candidate":
                fail.append(f"{r['it_id']}: text pool {s} excluded")
        for fld in ("name_ru", "perceptual_cues", "note"):
            if re.search(r"«[^»]*[А-ЯЁ][а-яё]+[^»]*»", r[fld]):
                fail.append(f"{r['it_id']}: quoted text in {fld}")
    res["identifying_text_slots"] = {"pass": not fail, "failures": fail}
    # --- frequency
    pfs = load_place_families()
    ipf = read_csv(ITEMS / "item_place_frequency.csv")
    it_ids = {r["it_id"] for r in items}
    fail = []
    per_pf = defaultdict(set)
    per_pf_it = defaultdict(set)
    for r in ipf:
        if r["pf_id"] not in pfs:
            fail.append(f"{r['ipf_id']}: pf unresolved")
        if r["frequency_class"] not in R.FREQ_WEIGHT:
            fail.append(f"{r['ipf_id']}: class")
        if r["ref_kind"] == "it" and r["item_or_category_ref"] not in it_ids:
            fail.append(f"{r['ipf_id']}: item unresolved")
        if r["ref_kind"] == "master" and not r["item_or_category_ref"].startswith("n1230:material_item:"):
            fail.append(f"{r['ipf_id']}: master ref malformed")
        per_pf[r["pf_id"]].add(r["item_or_category_ref"])
        if r["ref_kind"] == "it":
            per_pf_it[r["pf_id"]].add(r["item_or_category_ref"])
    peopled = [p for p, c in R.PF_CLASS.items() if c != "wild"]
    thin = {p: len(per_pf[p]) for p in peopled if len(per_pf[p]) < 10}
    if thin:
        fail.append(f"peopled pf with <10 items: {thin}")
    dropped = read_csv(REPORTS / "frequency_dropped.csv")
    res["item_place_frequency"] = {"pass": not fail, "failures": fail[:50],
                                   "peopled_pf_items_all": {p: len(per_pf[p]) for p in peopled},
                                   "peopled_pf_items_catalog_only": {p: len(per_pf_it[p]) for p in peopled},
                                   "dropped_master_links": len(dropped),
                                   "dropped_by_reason": Counter(d["reason"] for d in dropped)}
    # --- ownership
    own = read_csv(ITEMS / "ownership_rules.csv")
    fail = []
    have = {(r["pf_id"], r["item_group"]) for r in own if r["find_context"] == "in_use_or_stored"}
    groups_in_freq = {r["item_group"] for r in ipf}
    for p in peopled:
        for g in groups_in_freq:
            if (p, g) not in have:
                fail.append(f"no rule {p} x {g}")
    for r in own:
        if R.PF_CLASS.get(r["pf_id"]) == "wild" and r["owner_kind"] not in ("ownerless", "lost_unknown"):
            fail.append(f"{r['own_id']}: wild pf with owner {r['owner_kind']}")
        if r["named_person"] != "no":
            fail.append(f"{r['own_id']}: named person")
        if r["owner_kind"] not in ("household", "master", "trader", "church", "authority", "ownerless", "lost_unknown"):
            fail.append(f"{r['own_id']}: owner kind")
    res["item_ownership_rules"] = {"pass": not fail, "failures": fail[:50]}
    # --- marks
    marks = read_csv(ITEMS / "mark_pools.csv")
    fail, per_item, per_group = [], {}, defaultdict(set)
    for r in items:
        slots = [s for s in split(r["mark_slots"]) if s != "none"]
        if not slots:
            continue
        f = fams(r["material"])
        app = [m for m in marks
               if (m["applicable_groups"] == "*" or r["item_group"] in split(m["applicable_groups"]))
               and (m["applicable_materials"] == "*" or f & set(split(m["applicable_materials"])))]
        kinds_needed = set().union(*(KIND_OF_SLOT[s] for s in slots))
        app_in_slots = [m for m in app if m["mark_kind"] in kinds_needed]
        covered = {s for s in slots if any(m["mark_kind"] in KIND_OF_SLOT[s] for m in app_in_slots)}
        per_item[r["it_id"]] = {"slots": len(slots), "slots_covered": len(covered), "marks": len(app_in_slots),
                                "kinds": len({m['mark_kind'] for m in app_in_slots})}
        per_group[r["item_group"]] |= {m["mark_kind"] for m in app_in_slots}
        if covered != set(slots):
            fail.append(f"{r['it_id']}: uncovered slots {set(slots) - covered}")
        if len(slots) >= 3 and len(app_in_slots) < 5:
            fail.append(f"{r['it_id']}: only {len(app_in_slots)} applicable marks")
    for r in items:  # typical items carry no marks
        if r["quantity_unit"] in ("bundle", "portion") and r["mark_slots"] != "none":
            fail.append(f"{r['it_id']}: bulk/typical item has mark slots")
    for m in marks:
        if m["distinctiveness"] == "unique" and m["mark_kind"] not in ("owner_sign", "inscription", "repair"):
            fail.append(f"{m['mk_id']}: unique distinctiveness for kind {m['mark_kind']}")
    for t in read_csv(ITEMS / "identifying_text_pools.csv"):
        caps = set(re.findall(r"\b[А-ЯЁІ][А-ЯЁа-яёі]*", re.sub(r"\{[^}]*\}", "", t["template_ru"])))
        bad = caps - TEMPLATE_ALLOWED_CAPS
        if bad:
            fail.append(f"{t['text_pool_id']}: capitalised words outside pool {bad}")
    groups_lt5 = {g: sorted(k) for g, k in per_group.items() if len(k) < 5}
    res["item_marks_text_pools"] = {"pass": not fail, "failures": fail[:300],
                                    "groups_with_lt5_mark_kinds(info)": groups_lt5}
    counts = {
        "household.csv": len(H), "personal.csv": len(P),
        "item_categories.csv": len(cats), "item_categories_proposed_new": sum(1 for r in read_csv(ITEMS / "item_categories.csv") if r["status"] == "proposed_new"),
        "item_place_frequency.csv": len(ipf), "item_place_frequency_it": sum(1 for r in ipf if r["ref_kind"] == "it"),
        "item_place_frequency_master": sum(1 for r in ipf if r["ref_kind"] == "master"),
        "ownership_rules.csv": len(own), "recognizers.csv": len(read_csv(ITEMS / "recognizers.csv")),
        "mark_pools.csv": len(marks), "identifying_text_pools.csv": len(pools),
        "mass_policy.csv": len(bands), "condition_vocab.csv": len(read_csv(ITEMS / "condition_vocab.csv")),
        "archetype_pf_map.csv": len(read_csv(ITEMS / "archetype_pf_map.csv")),
        "reports/frequency_dropped.csv": len(dropped),
        "confidence_items": dict(Counter(r["confidence"] for r in items)),
        "confidence_frequency": dict(Counter(r["confidence"] for r in ipf)),
        "frequency_class_it": dict(Counter(r["frequency_class"] for r in ipf if r["ref_kind"] == "it")),
        "derivation_rule_it": dict(Counter(r["derivation_rule"] for r in ipf if r["ref_kind"] == "it")),
        "owner_kind": dict(Counter(r["owner_kind"] for r in own)),
        "mark_kind": dict(Counter(m["mark_kind"] for m in marks)),
    }
    (REPORTS / "validation.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    (REPORTS / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in res.items():
        print(k, "PASS" if v["pass"] else "FAIL", len(v["failures"]))
        for f in v["failures"][:15]:
            print("   ", f)
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
