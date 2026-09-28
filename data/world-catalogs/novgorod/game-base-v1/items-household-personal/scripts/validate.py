"""Acceptance checks for the five domains; writes reports/validation.json and reports/counts.json."""
import json
import re
import sys
from collections import Counter, defaultdict
from common import ITEMS, REPORTS, ME, ROOT, read_csv, split, load_master, load_place_families
import rules as R
from validate_household_inventory import self_test as self_test_household_inventory, validate_rows as validate_household_inventory
from validate_trace_relations import self_test as self_test_trace_relations, validate_rows as validate_trace_relations
from validate_exclusion_returns import self_test as self_test_exclusion_returns, validate_rows as validate_exclusion_returns
from validate_context_relations import self_test as self_test_context_relations, validate_rows as validate_context_relations
from validate_evidence_intake import load_report as load_evidence_report, self_test as self_test_evidence_intake, validate_report as validate_evidence_intake
from build_frequency import allows_group_default, closed_drop_reason

KIND_OF_SLOT = {"own": {"owner_sign", "inscription"}, "mk": {"maker_mark", "inscription"}, "orn": {"ornament"},
                "rep": {"repair"}, "wear": {"wear"}, "dmg": {"damage"}, "ins": {"inscription"}}
MATFAM = [(r"^(wood|twigs|leafy_twigs|gesso)", "wood"), (r"^(birch_bark|bast|willow|reed)", "bark"), (r"^(clay|glaze)", "clay"),
          (r"^(iron|steel)", "iron"), (r"^(copper|silver|lead|tin|metal)", "nonferrous"), (r"^stone", "stone"),
          (r"^(bone|horn)", "bone"), (r"^(leather|rawhide|parchment)", "leather"),
          (r"^(linen|wool|hemp|flax|textile|felt|plant_fiber|gut|horsehair|hair|cord)", "textile"),
          (r"^(beeswax|tallow|wax)", "wax"), (r"^(tinder|straw|grass|hay|feather|pigment)", "organic_soft")]
DENY = re.compile(r"\b(картоф|кукуруз|томат|подсолнеч|табак|индейк|кролик|чай\b|кофе\b|сахар\b|огнестрел|пищал|бумаг|бумажн|ухват|чугун)", re.I)
TEMPLATE_ALLOWED_CAPS = {"Святая", "Богородице", "ІС", "ХС"}


def check_c007d(rows):
    """Keep the reviewed item/place decisions independent of the generator."""
    by_id = {r["ipf_id"]: r for r in rows}
    failures = [f"{ipf_id}: unsupported item/place pair returned" for ipf_id in (
        "ipf_it_hh_basket__ferry_landing", "ipf_it_ps_folding_balance__ferry_landing",
        "ipf_m_omi01625__ferry_landing") if ipf_id in by_id]
    cask_id = "ipf_it_hh_small_cask__riverbank"
    cask = by_id.get(cask_id)
    if not cask or cask["frequency_class"] != "rare" or cask["wild_arrival_cause_required"] != "prior_visitor_loss_or_discard":
        failures.append(f"{cask_id}: rare row with prior-visitor loss/discard cause required")
    return failures


def check_costly_generic_ambient(rows):
    forbidden = {"it_hh_glass_drinking_vessel", "it_hh_silver_feast_cup"}
    return [f"{r['ipf_id']}: costly vessel must be conditional inventory, not generic dwelling ambient"
            for r in rows if r.get("item_or_category_ref") in forbidden
            and (r.get("pf_id") == "dwelling_interior" or "R_GROUP_DEFAULT" in r.get("derivation_rule", ""))]


def check_valued_where_used(rows):
    """Known valued identities retain authored master where_used placements."""
    by_id = {r["ipf_id"]: r for r in rows}
    required = {
        "ipf_it_ps_encolpion__church_interior",
        "ipf_it_ps_gusli_lyre__dwelling_interior",
    }
    failures = []
    for ipf_id in sorted(required):
        row = by_id.get(ipf_id)
        if not row or "R_WHERE_USED_TEXT" not in row.get("derivation_rule", "") or "master_where_used:" not in row.get("source_refs", ""):
            failures.append(f"{ipf_id}: authored master where_used placement missing")
    return failures


def self_test_c007d(rows):
    assert not check_c007d(rows)
    cask_id = "ipf_it_hh_small_cask__riverbank"
    cask = next(r for r in rows if r["ipf_id"] == cask_id)
    for field, value in (("wild_arrival_cause_required", ""), ("frequency_class", "contextual")):
        changed = [dict(r) if r is not cask else {**r, field: value} for r in rows]
        assert check_c007d(changed)
    for ipf_id in ("ipf_it_hh_basket__ferry_landing", "ipf_it_ps_folding_balance__ferry_landing",
                   "ipf_m_omi01625__ferry_landing"):
        changed = rows + [{**cask, "ipf_id": ipf_id}]
        assert check_c007d(changed)
    try:
        closed_drop_reason("unreviewed_gap")
    except ValueError:
        pass
    else:
        raise AssertionError("unknown drop reason must fail")
    costly_probe = {**cask, "ipf_id": "ipf_costly_generic_probe",
                    "item_or_category_ref": "it_hh_glass_drinking_vessel",
                    "pf_id": "dwelling_interior", "derivation_rule": "R_GROUP_DEFAULT"}
    assert check_costly_generic_ambient(rows + [costly_probe])
    silver_probe = {**costly_probe, "ipf_id": "ipf_silver_generic_probe",
                    "item_or_category_ref": "it_hh_silver_feast_cup"}
    assert check_costly_generic_ambient(rows + [silver_probe])
    assert not check_valued_where_used(rows)
    removed = [r for r in rows if r["ipf_id"] != "ipf_it_ps_encolpion__church_interior"]
    assert check_valued_where_used(removed)
    print("c007d negative probes PASS (including costly ambient and valued master where_used)")


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
    if "--self-test" in sys.argv:
        self_test_c007d(ipf)
    residues = {r["item_id"] for r in read_csv(ME / "material_entities.csv")
                if r["entity_kind"] in {"fragment", "residue", "deposit", "waste", "byproduct"}}
    residue_links = {r["link_id"] for r in read_csv(ME / "item_location_links.csv") if r["item_id"] in residues}
    residue_refs = {f"master_link:{x}" for x in residue_links} | {f"master_where_used:{x}" for x in residues}
    master = load_master()
    material = {r["item_id"]: r for r in read_csv(ME / "material_entities.csv")}
    legacy = {m["canonical_id"]: lg for lg, m in master.items()}
    links = {r["link_id"]: r for r in read_csv(ME / "item_location_links.csv")}
    non_whole = {lg for lg, m in master.items() if m["rec"].get("entity_kind") in {"salvage", "component", "blank", "semifinished"}
                 or m["rec"].get("manufacturing_state") == "broken" or re.search(r"\bобломок\b", m["name_ru"], re.I)}
    item_by_id = {r["it_id"]: r for r in items}
    stage_ref = "packages/new-game/src/stages/stage-16-item-placement/orchestration/run-stage-16.js#materialize"
    it_ids = {r["it_id"] for r in items}
    fail = []
    per_pf = defaultdict(set)
    per_pf_it = defaultdict(set)
    seen_ipf = set()
    seen_pairs = set()
    fail.extend(check_c007d(ipf))
    catalog_pairs = {(r["item_or_category_ref"], r["pf_id"]) for r in ipf if r["ref_kind"] == "it"}
    for r in ipf:
        pair = (r["item_or_category_ref"], r["pf_id"])
        if r["ipf_id"] in seen_ipf or pair in seen_pairs:
            fail.append(f"{r['ipf_id']}: duplicate item in place family")
        seen_ipf.add(r["ipf_id"])
        seen_pairs.add(pair)
        if r["ref_kind"] == "master" and (r["superseded_by"], r["pf_id"]) in catalog_pairs:
            fail.append(f"{r['ipf_id']}: same object duplicated by catalog item")
        if r["pf_id"] not in pfs:
            fail.append(f"{r['ipf_id']}: pf unresolved")
        if r["frequency_class"] not in R.FREQ_WEIGHT:
            fail.append(f"{r['ipf_id']}: class")
        if r["status"] != "candidate":
            fail.append(f"{r['ipf_id']}: status must remain candidate")
        if r["ref_kind"] == "it" and r["item_or_category_ref"] not in it_ids:
            fail.append(f"{r['ipf_id']}: item unresolved")
        if r["ref_kind"] == "it" and "R_GROUP_DEFAULT" in r["derivation_rule"] and not allows_group_default(item_by_id[r["item_or_category_ref"]]):
            fail.append(f"{r['ipf_id']}: costly/import/status item received R_GROUP_DEFAULT")
        if r["ref_kind"] == "master" and not r["item_or_category_ref"].startswith("n1230:material_item:"):
            fail.append(f"{r['ipf_id']}: master ref malformed")
        if r["derivation_rule"] == "R_WK_COMPOSES" and (r["frequency_class"] != "rare" or r["confidence"] != "C"):
            fail.append(f"{r['ipf_id']}: composed place must stay rare/C")
        if r["ref_kind"] == "it" and residue_refs.intersection(split(r["source_refs"])):
            fail.append(f"{r['ipf_id']}: residue used as whole-item evidence")
        if r["ref_kind"] == "it":
            whole_basis = False
            for source in split(r["source_refs"]):
                if source.startswith("master_link:") and links.get(source[12:], {}).get("item_id") in non_whole:
                    fail.append(f"{r['ipf_id']}: non-whole link used as whole-item evidence")
                elif source.startswith("master_link:") and source[12:] in links and links[source[12:]]["item_id"] not in non_whole:
                    whole_basis = True
                if source.startswith("master_spawn:") and source.rsplit(":", 1)[-1] in non_whole:
                    fail.append(f"{r['ipf_id']}: non-whole spawn used as whole-item evidence")
                elif source.startswith("master_spawn:"):
                    whole_basis = True
                if source.startswith("master_where_used:") and source[18:] in non_whole:
                    fail.append(f"{r['ipf_id']}: non-whole place text used as whole-item evidence")
            if r["frequency_class"] in {"ubiquitous", "common"} and not whole_basis:
                fail.append(f"{r['ipf_id']}: high whole-item frequency lacks whole-item evidence")
        if r["ref_kind"] == "master" and r["item_or_category_ref"].rsplit(":", 1)[-1].upper() in residues:
            fail.append(f"{r['ipf_id']}: archaeological trace materialized as item")
        if r["entry_visible_if"] != "placed_exposed" or r["search_only_if"] != "placed_concealed":
            fail.append(f"{r['ipf_id']}: entry visibility and targeted search must be separate")
        if r["ref_kind"] == "it":
            source_ids = [legacy[c] for c in split(item_by_id[r["item_or_category_ref"]]["master_refs"])
                          if legacy[c] not in non_whole
                          and master[legacy[c]]["rec"].get("entity_kind") not in {"fragment", "residue", "deposit", "waste", "byproduct"}
                          and master[legacy[c]]["conf"] in {"A", "B", "C"}
                          and "never" not in str(material.get(legacy[c], {}).get("generation_policy") or master[legacy[c]]["rec"].get("generation_policy", ""))
                          and material.get(legacy[c], {}).get("quantity_mode") != "portion_or_local_accumulation"
                          and not DENY.search(master[legacy[c]]["name_ru"])]
        else:
            source_ids = [r["item_or_category_ref"].rsplit(":", 1)[-1].upper()]
        mode_sources = [(lg, json.loads(material[lg]["placement_modes"])) for lg in source_ids
                        if lg in material and material[lg].get("placement_modes")]
        modes = {part for _, values in mode_sources for mode in values for part in mode.split("_or_")}
        if modes:
            hidden = sum(bool(re.search(r"container|chest|pouch|sack|basket|box|bag|jar|vessel|storage|storehouse|pit|buried|wrapped|covered|under|refuse|scrap", mode)) for mode in modes)
            visible_weight = round(8 * (len(modes) - hidden) / len(modes))
            expected_ref = ";".join(f"master:{master[lg]['canonical_id']}#placement_modes" for lg, _ in mode_sources)
            if r["entry_exposed_weight"] != str(visible_weight) or r["search_concealed_weight"] != str(8 - visible_weight) or r["placement_basis_ref"] != expected_ref or r["placement_owner_ref"]:
                fail.append(f"{r['ipf_id']}: placement weights or source do not match master modes")
        else:
            if r["entry_exposed_weight"] or r["search_concealed_weight"] or r["placement_basis_ref"] != "no_source:placement_modes_absent" or r["placement_owner_ref"] != stage_ref:
                fail.append(f"{r['ipf_id']}: placement owner unresolved")
        if r["wild_arrival_cause_required"] != ("prior_visitor_loss_or_discard" if r["pf_class"] == "wild" else ""):
            fail.append(f"{r['ipf_id']}: wild arrival cause missing or misplaced")
        if r["item_or_category_ref"] == "it_hh_oven_peel" and r["pf_id"] in {"road", "bridge_crossing", "town_wall_edge"}:
            fail.append(f"{r['ipf_id']}: oven peel leaked from 'походный быт' into a public route")
        per_pf[r["pf_id"]].add(r["item_or_category_ref"])
        if r["ref_kind"] == "it":
            per_pf_it[r["pf_id"]].add(r["item_or_category_ref"])
    fail.extend(check_costly_generic_ambient(ipf))
    fail.extend(check_valued_where_used(ipf))
    peopled = [p for p, c in R.PF_CLASS.items() if c != "wild"]
    thin = {p: len(per_pf[p]) for p in peopled if len(per_pf[p]) < 10}
    if thin:
        fail.append(f"peopled pf with <10 items: {thin}")
    if any(r["placement_owner_ref"] == stage_ref for r in ipf):
        stage_path = ROOT / stage_ref.split("#", 1)[0]
        if not stage_path.is_file() or not re.search(r"\bmaterialize\b", stage_path.read_text(encoding="utf-8")):
            fail.append("Stage 16 placement owner reference unresolved")
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
    # --- class-C household/workshop inventory relation
    inventory = read_csv(ITEMS / "household_inventory_profiles.csv")
    fail, inventory_metrics = validate_household_inventory(inventory)
    if "--self-test" in sys.argv and not fail:
        self_test_household_inventory(inventory)
    res["household_inventory_profiles"] = {"pass": not fail, "failures": fail[:300], **inventory_metrics}
    # --- typed trace states returned from utility exclusions
    trace_rows = read_csv(ITEMS / "item_place_trace_relations.csv")
    fail, trace_metrics = validate_trace_relations(trace_rows)
    if "--self-test" in sys.argv and not fail:
        self_test_trace_relations(trace_rows)
    res["item_place_trace_relations"] = {"pass": not fail, "failures": fail[:300], **trace_metrics}
    # --- whole items returned to transport/activity owners instead of false PF placement
    context_rows = read_csv(ITEMS / "item_context_relations.csv")
    fail, context_metrics = validate_context_relations(context_rows, dropped)
    if "--self-test" in sys.argv and not fail:
        self_test_context_relations(context_rows)
    res["item_context_relations"] = {"pass": not fail, "failures": fail[:300], **context_metrics}
    # --- point exclusions handed back to their authoritative owners
    return_rows = read_csv(REPORTS / "item_exclusion_returns.csv")
    fail, return_metrics = validate_exclusion_returns(return_rows)
    if "--self-test" in sys.argv and not fail:
        self_test_exclusion_returns(return_rows)
    res["item_exclusion_returns"] = {"pass": not fail, "failures": fail[:300], **return_metrics}
    # --- reviewer-provided evidence army: complete traversal and exact source pins
    evidence_report = load_evidence_report()
    fail, evidence_metrics = validate_evidence_intake(evidence_report)
    if "--self-test" in sys.argv and not fail:
        self_test_evidence_intake(evidence_report)
    res["household_evidence_intake"] = {"pass": not fail, "failures": fail[:300], **evidence_metrics}
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
        "household_inventory_profiles.csv": len(inventory),
        "household_inventory_profiles": inventory_metrics["profiles"],
        "household_inventory_profiles_by_kind": inventory_metrics["profiles_by_kind"],
        "household_inventory_basis": inventory_metrics["basis"],
        "household_inventory_need_category": inventory_metrics["need_category"],
        "household_inventory_rejected_anachronisms": inventory_metrics["rejected_anachronisms"],
        "item_place_trace_relations.csv": len(trace_rows),
        "item_place_trace_source_items": trace_metrics["source_items"],
        "item_place_trace_by_kind": trace_metrics["by_trace_kind"],
        "item_place_trace_by_resolution": trace_metrics["by_place_resolution"],
        "item_context_relations.csv": len(context_rows),
        "item_context_relations": context_metrics,
        "reports/item_exclusion_returns.csv": len(return_rows),
        "item_exclusion_returns": return_metrics,
        "reports/household_evidence_intake.json": evidence_metrics,
        "confidence_items": dict(Counter(r["confidence"] for r in items)),
        "confidence_frequency": dict(Counter(r["confidence"] for r in ipf)),
        "frequency_class_it": dict(Counter(r["frequency_class"] for r in ipf if r["ref_kind"] == "it")),
        "derivation_rule_it": dict(Counter(r["derivation_rule"] for r in ipf if r["ref_kind"] == "it")),
        "placement_weights": dict(Counter(f"{r['entry_exposed_weight']}:{r['search_concealed_weight']}" for r in ipf)),
        "placement_basis": dict(Counter(r["placement_basis_ref"].split(":", 1)[0].split(".", 1)[0] for r in ipf)),
        "owner_kind": dict(Counter(r["owner_kind"] for r in own)),
        "mark_kind": dict(Counter(m["mark_kind"] for m in marks)),
    }
    (REPORTS / "validation.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    (REPORTS / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    for k, v in res.items():
        print(k, "PASS" if v["pass"] else "FAIL", len(v["failures"]))
        for f in v["failures"][:15]:
            print("   ", f)
    print(json.dumps(counts, ensure_ascii=False))
    if any(not v["pass"] for v in res.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
