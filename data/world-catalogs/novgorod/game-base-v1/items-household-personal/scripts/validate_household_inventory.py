"""Validation for the class-C inventory relation, including negative probes."""
from collections import Counter, defaultdict
import re

from common import ITEMS, ROOT, read_csv
from household_inventory_rules import FIRST_OPEN, REJECTED_ANACHRONISMS

GAME = ROOT / "data/world-catalogs/novgorod/game-base-v1"
BASIS = {"sourced", "analogy", "logical_necessity", "editorial"}
PROFILE_KINDS = {"household", "workshop", "place_set"}
NEEDS = {"water", "cooking", "food_drink", "sleep", "light_heat", "storage", "cleaning",
         "clothing_repair", "occupation_tools", "livestock_harness", "child", "ritual_church",
         "leisure", "import_luxury", "furniture", "vessels", "textiles", "shrines",
         "waste_traces", "stocks", "personal_adornment"}
REQUIREMENTS = {"required", "conditional", "wealth_extra", "contextual"}
QMODES = {"formula", "seasonal_stock", "conditional_presence", "delegated_profile"}
SCOPES = {"stored", "scene", "delegated"}
HOUSEHOLD_CLASSES = {"", "poor", "common_urban", "rural", "fisher", "merchant", "boyar", "clergy_monastery"}
COMPOSITION_FACTORS = {
    "actual_herd", "actual_household_members", "actual_servings", "actual_work_batches",
    "existing_food_profile", "per_active_station", "per_active_weaver", "per_attested_find",
    "per_baptized_wearer", "per_child", "per_drink_kind", "per_eater", "per_eligible_wearer",
    "per_elite_outfit", "per_hearth", "per_heated_dwelling", "per_hired_musician", "per_household",
    "per_indoor_workplace", "per_infant", "per_literate_cell_or_church", "per_liturgical_context",
    "per_ritual_need", "per_served_eater", "per_sleeper", "per_spindle", "per_spinner",
    "per_two_sleepers", "per_work_horse", "per_workplace",
    "per_attested_feast_or_liturgy", "per_active_trade_stock",
    "per_active_fisher", "per_active_trader", "per_bather", "per_feast_table",
    "per_home_milling", "per_labelled_trade_lot", "per_locked_chest", "per_sealed_trade_lot",
    "per_attested_trade_or_feast",
}
HOUSEHOLD_COMPOSITION = {
    "hh_poor_urban": "hh_role_nov_role_householder",
    "hh_artisan_urban": "hh_role_nov_role_craftsman_master",
    "hh_rural_smerd": "hh_role_nov_role_smerd_householder",
    "hh_fisher": "hh_role_nov_role_fisher",
    "hh_merchant_urban": "hh_occ_nov_occ_long_distance_merchant",
    "hh_boyar_urban": "hh_role_nov_role_boyar",
    "hh_monastery": "hh_role_nov_role_monk",
}
FORBIDDEN_IDENTITY = re.compile(r"ухват|чугун|бумаг|бумаж", re.I)
SILK_REFS = {"gm_gm017", "gm_cl005"}
D39_REFS = {"it_hh_kitchen_spatula", "it_hh_mortar", "it_hh_sieve", "it_hh_salt_cup"}
D39_PROFILE_REFS = {("hh_merchant_urban", "TRD0027"), ("hh_merchant_urban", "TRD0051"), ("hh_merchant_urban", "TRD0052")}
D_MASTER_REFS = {"n1230:material_item:fod0027", "n1230:material_item:frn0048", "n1230:material_item:trd0002"}
HOUSEHOLD_TOOLS = {
    "tl_loom", "tl_firesteel", "tl_axe_household", "tl_stylus", "tl_sokha", "tl_ralo",
    "tl_harrow", "tl_sickle", "tl_scythe_gorbusha", "tl_flail", "tl_pitchfork", "tl_rake",
    "tl_spade", "tl_hoe", "tl_fishhook", "tl_fishing_rod", "tl_fish_spear", "tl_net_seine",
}
REF_KINDS = {"item", "matcult_item", "master_item", "tool", "workshop_stock", "food_profile",
             "food_item", "livestock_profile", "transport", "adornment", "garment_component",
             "garment", "currency"}
HOUSEHOLD_REQUIRED = {"water", "cooking", "food_drink", "sleep", "light_heat", "storage",
                      "cleaning", "clothing_repair", "livestock_harness", "child",
                      "ritual_church", "leisure"}
WORKSHOP_REQUIRED = {"water", "light_heat", "storage", "cleaning", "occupation_tools"}
PLACE_PROFILES = {
    "place_korchma", "place_inn", "place_bathhouse", "place_mill", "place_wharf_hut",
    "place_guardhouse", "place_market_shop",
}
PLACE_LENSES = {"furniture", "storage", "light_heat", "food_drink", "vessels",
                "occupation_tools", "textiles", "shrines", "waste_traces", "stocks"}
PLACE_BINDINGS = {
    "place_korchma": ("", "", "issue:#176:korchma_pf_scene_owner"),
    "place_inn": ("", "", "issue:#176:inn_pf_scene_owner"),
    "place_bathhouse": ("bathhouse", "sc_x001_bathhouse", ""),
    "place_mill": ("mill", "sc_scn020", "issue:#176:confirm_watermill_region_1230"),
    "place_wharf_hut": ("river_wharf", "sc_scn007", "issue:#176:wharf_hut_building_owner"),
    "place_guardhouse": ("town_wall_edge", "bt_guard_shelter", "issue:#176:guardhouse_interior_ownership"),
    "place_market_shop": ("market_square", "sc_scn021", ""),
}
PLACE_REQUIRED = {
    "place_korchma": PLACE_LENSES | {"water", "cooking", "cleaning", "leisure", "import_luxury"},
    "place_inn": PLACE_LENSES | {"water", "cooking", "sleep", "cleaning"},
    "place_bathhouse": (PLACE_LENSES - {"shrines"}) | {"water", "cleaning"},
    "place_mill": PLACE_LENSES | {"water", "cleaning"},
    "place_wharf_hut": PLACE_LENSES | {"water", "sleep", "cleaning"},
    "place_guardhouse": PLACE_LENSES | {"water", "cooking", "sleep", "cleaning"},
    "place_market_shop": PLACE_LENSES | {"water", "cleaning", "import_luxury"},
}


def ids(path, field):
    return {r[field] for r in read_csv(path)}


def load_refs():
    household = read_csv(ITEMS / "household.csv")
    personal = read_csv(ITEMS / "personal.csv")
    item_rows = household + personal
    item_by_id = {r["it_id"]: r for r in item_rows}
    matcult = ids(GAME / "buildings-interiors-containers/interiors/matcult_item_refs.csv", "item_id")
    master = ids(ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv", "id")
    tools = ids(GAME / "crafts-tools-processes/craft_tools_gear/tools_gear.csv", "tl_id")
    food = ids(GAME / "food-drink/food/ingredients.csv", "fd_id")
    herd = {r["household_type"] for r in read_csv(GAME / "fauna-fish-invertebrates-livestock/fauna/herd_composition.csv")}
    return {
        "item": set(item_by_id), "matcult_item": matcult, "master_item": master, "tool": tools,
        "food_item": food, "livestock_profile": herd,
        "transport": ids(GAME / "transport-health-recreation/transport_travel/transport_entities.csv", "tr_id"),
        "adornment": ids(GAME / "clothing-appearance/adornment_appearance/adornment.csv", "ad_id"),
        "garment_component": ids(GAME / "clothing-appearance/garments/garment_components.csv", "gm_id"),
        "garment": ids(GAME / "clothing-appearance/garments/garments.csv", "gm_id"),
        "currency": ids(GAME / "economy-trade-measures/currencies_measures/currency_units.csv", "cu_id"),
    }, item_by_id


def validate_rows(rows):
    fail = []
    refs, item_by_id = load_refs()
    seen_ids = set()
    seen_semantic = set()
    workshops = {r["ws_id"]: r for r in read_csv(GAME / "crafts-tools-processes/workshops/workshops.csv")}
    compositions = ids(GAME / "households-psychology-speech/households_kinship/household_composition_profiles.csv", "hh_id")
    food_rows = read_csv(GAME / "food-drink/food/household_food_stock_profiles.csv")
    food_types = {r["household_type"] for r in food_rows}
    food_keys = {(r["household_type"], r["season_period"], r["fd_id"]) for r in food_rows}
    scenes = ids(GAME / "buildings-interiors-containers/interiors/scenes.csv", "sc_id")
    buildings = ids(GAME / "buildings-interiors-containers/buildings/building_types.csv", "bt_id")
    ipf = {(r["item_or_category_ref"], r["pf_id"]) for r in read_csv(ITEMS / "item_place_frequency.csv") if r["ref_kind"] == "it"}
    ownership = read_csv(ITEMS / "ownership_rules.csv")
    own = {(r["pf_id"], r["item_group"]) for r in ownership if r["find_context"] == "in_use_or_stored"}
    deny_rules = [r for r in read_csv(GAME / "crafts-tools-processes/materials_registry/late_materials_denylist.csv")
                  if r["verdict"] == "deny"]
    materials = {r["mt_id"]: r for r in read_csv(GAME / "crafts-tools-processes/materials_registry/materials.csv")}
    rejected_terms = {r[0] for r in REJECTED_ANACHRONISMS}
    identity = {
        "item": {k: " ".join((v["name_ru"], v["material"], v["technique"])) for k, v in item_by_id.items()},
        "matcult_item": {r["item_id"]: r["name_ru"] for r in read_csv(GAME / "buildings-interiors-containers/interiors/matcult_item_refs.csv")},
        "tool": {r["tl_id"]: " ".join((r["name_ru"], r["name_en"], r["material"])) for r in read_csv(GAME / "crafts-tools-processes/craft_tools_gear/tools_gear.csv")},
        "food_item": {r["fd_id"]: " ".join((r["name_ru"], r["name_en"])) for r in read_csv(GAME / "food-drink/food/ingredients.csv")},
        "transport": {r["tr_id"]: r["name_ru"] for r in read_csv(GAME / "transport-health-recreation/transport_travel/transport_entities.csv")},
        "adornment": {r["ad_id"]: " ".join((r["name_ru"], r["material"])) for r in read_csv(GAME / "clothing-appearance/adornment_appearance/adornment.csv")},
        "garment_component": {r["gm_id"]: " ".join((r["name_ru"], r["material"])) for r in read_csv(GAME / "clothing-appearance/garments/garment_components.csv")},
        "garment": {r["gm_id"]: " ".join((r["name_ru"], r["material"])) for r in read_csv(GAME / "clothing-appearance/garments/garments.csv")},
        "currency": {r["cu_id"]: r["name_ru"] for r in read_csv(GAME / "economy-trade-measures/currencies_measures/currency_units.csv")},
    }

    needs_by_profile = defaultdict(set)
    kinds_by_profile = {}
    for row in rows:
        rid = row.get("hip_id", "")
        if not rid or rid in seen_ids:
            fail.append(f"{rid or '<blank>'}: duplicate or blank hip_id")
        seen_ids.add(rid)
        semantic = (row.get("profile_id", ""), row.get("object_ref", ""))
        if semantic in seen_semantic:
            fail.append(f"{rid}: duplicate profile/object pair")
        seen_semantic.add(semantic)
        for field, allowed in (("basis", BASIS), ("profile_kind", PROFILE_KINDS),
                               ("need_category", NEEDS), ("requirement", REQUIREMENTS),
                               ("quantity_mode", QMODES), ("materialization_scope", SCOPES),
                               ("ref_kind", REF_KINDS), ("household_class", HOUSEHOLD_CLASSES),
                               ("composition_factor", COMPOSITION_FACTORS)):
            if row.get(field) not in allowed:
                fail.append(f"{rid}: {field}={row.get(field)!r} outside closed vocabulary")
        if not row.get("derivation") or not row.get("source_refs"):
            fail.append(f"{rid}: basis requires derivation and source_refs")
        if (row.get("object_ref") in D39_REFS or (row.get("profile_id"), row.get("object_ref")) in D39_PROFILE_REFS) and "sources/master-archive-v1/" not in row.get("derivation", ""):
            fail.append(f"{rid}: D39-derived row lacks repository archive path and row id")
        expected_confidence = "D" if row.get("object_ref") in D_MASTER_REFS else "C"
        if row.get("confidence") != expected_confidence or row.get("status") != "candidate":
            fail.append(f"{rid}: inventory relation must remain reviewed confidence/candidate")
        if row.get("quantity_norm"):
            try:
                if float(row["quantity_norm"]) <= 0:
                    fail.append(f"{rid}: quantity_norm must be positive")
            except ValueError:
                fail.append(f"{rid}: quantity_norm is not numeric")
        if row.get("quantity_mode") in {"formula", "seasonal_stock"} and not row.get("quantity_norm"):
            fail.append(f"{rid}: formula mode requires quantity_norm")
        if row.get("materialization_scope") == "stored":
            if row.get("first_open_rule_ref") != FIRST_OPEN:
                fail.append(f"{rid}: stored row must use d3 first-open rule")
        elif row.get("first_open_rule_ref"):
            fail.append(f"{rid}: first-open rule belongs only to stored rows")
        if not row.get("quantity_rule") or not row.get("composition_factor") or not row.get("wealth_multiplier"):
            fail.append(f"{rid}: incomplete class-C quantity rule")
        else:
            try:
                if float(row["wealth_multiplier"]) <= 0:
                    fail.append(f"{rid}: wealth_multiplier must be positive")
                if row.get("requirement") == "required" and row.get("composition_factor", "").startswith("per_") and float(row["wealth_multiplier"]) < 1:
                    fail.append(f"{rid}: required per_* row cannot be reduced below 1.00 by wealth")
            except ValueError:
                fail.append(f"{rid}: wealth_multiplier is not numeric")
        if row.get("object_ref") == "it_ps_pectoral_cross" and row.get("wealth_multiplier") != "1.00":
            fail.append(f"{rid}: baptismal cross is one per wearer without wealth scaling")
        if row.get("requirement") in {"conditional", "contextual", "wealth_extra"} and row.get("quantity_mode") not in {"conditional_presence", "delegated_profile"}:
            fail.append(f"{rid}: conditional row must use conditional_presence or delegated_profile")

        kind, ref = row.get("ref_kind"), row.get("object_ref")
        identity_text = f"{ref} {identity.get(kind, {}).get(ref, '')}"
        if FORBIDDEN_IDENTITY.search(identity_text):
            fail.append(f"{rid}: forbidden identity term in selected object")
        if kind in refs and ref not in refs[kind]:
            fail.append(f"{rid}: unresolved {kind} ref {ref}")
        if kind == "food_profile" and ref not in food_types:
            fail.append(f"{rid}: unresolved food household_type {ref}")
        if kind == "workshop_stock":
            ws = workshops.get(row.get("profile_id"))
            if not ws or ref not in ws["stocks"].split(";"):
                fail.append(f"{rid}: workshop stock does not belong to profile")
            if ref.startswith("mt_"):
                material = materials.get(ref)
                if not material:
                    fail.append(f"{rid}: unresolved material {ref}")
                else:
                    # Scan the typed identity fields; prose may legitimately discuss another process
                    # (for example steel cementation is not Portland cement).
                    text = " ".join((material["name_ru"], material["aliases_ru"]))
                    for deny in deny_rules:
                        if any(stem and re.search(stem, text, re.I) for stem in deny["match_stems"].split(";")):
                            fail.append(f"{rid}: denied material term via {deny['dl_id']}")
        if kind == "tool":
            if row.get("profile_kind") == "workshop":
                ws = workshops.get(row.get("profile_id"))
                if not ws or ref not in ws["tools"].split(";"):
                    fail.append(f"{rid}: tool does not belong to workshop")
            elif ref not in HOUSEHOLD_TOOLS:
                fail.append(f"{rid}: household tool must be explicit supported exception")
        if kind == "item" and ref in item_by_id:
            item = item_by_id[ref]
            if row.get("item_place_frequency_ref") and (ref, row.get("pf_id")) not in ipf:
                fail.append(f"{rid}: item_place_frequency link does not resolve")
            if row.get("pf_id") and (row["pf_id"], item["item_group"]) not in own:
                fail.append(f"{rid}: ownership selector does not resolve")
        if kind == "currency" and (row.get("requirement") == "required" or row.get("quantity_mode") != "conditional_presence"):
            fail.append(f"{rid}: foreign coin cannot be normal required/circulating stock")
        if ref == "it_hh_glazed_bowl_import" and (row.get("requirement") != "wealth_extra" or row.get("quantity_mode") != "conditional_presence"):
            fail.append(f"{rid}: glazed import must remain a conditional wealth extra")
        if ref in SILK_REFS and (row.get("requirement") != "wealth_extra" or row.get("quantity_mode") != "conditional_presence"):
            fail.append(f"{rid}: silk must remain a conditional imported wealth extra")
        if ref == "fd_wine_imported":
            if row.get("requirement") != "wealth_extra" or row.get("quantity_mode") != "conditional_presence":
                fail.append(f"{rid}: imported wine must remain context-conditional wealth stock")
            if row.get("quantity_mode") == "delegated_profile":
                hh_type = row.get("household_type") or "hh_merchant_urban"
                if not any(k[0] == hh_type and k[2] == ref for k in food_keys):
                    fail.append(f"{rid}: delegated food item absent from household food profile")
        if ref == "tg_spices_gap":
            fail.append(f"{rid}: spices GAP is not a resolved trade good")
        if ref == "n1230:material_item:fod0027" and (row.get("requirement") != "wealth_extra" or row.get("quantity_mode") != "conditional_presence" or row.get("household_type") not in {"hh_merchant_urban", "hh_boyar_urban"}):
            fail.append(f"{rid}: spices must remain a conditional merchant/boyar wealth extra")
        if ref in {"n1230:material_item:frn0048", "n1230:material_item:trd0002"} and (row.get("requirement") not in {"contextual", "wealth_extra"} or row.get("quantity_mode") != "conditional_presence"):
            fail.append(f"{rid}: exceptional master find must remain conditional")
        if row.get("profile_id") == "place_korchma":
            if row.get("pf_id") or row.get("profile_ref") or "issue:#176" not in row.get("owner_gap_ref", ""):
                fail.append(f"{rid}: korchma must retain the explicit place-owner gap")

        if row.get("profile_kind") == "household":
            hh_type = row.get("household_type")
            if hh_type not in food_types:
                fail.append(f"{rid}: household_type not in food profiles")
            cref = row.get("composition_ref", "").rsplit("#", 1)[-1]
            if cref not in compositions:
                fail.append(f"{rid}: composition ref unresolved")
            elif HOUSEHOLD_COMPOSITION.get(hh_type) != cref:
                fail.append(f"{rid}: household_type/composition mapping is not the explicit reviewed mapping")
        elif row.get("profile_kind") == "workshop":
            if row.get("profile_id") not in workshops:
                fail.append(f"{rid}: workshop profile unresolved")
        elif row.get("profile_kind") == "place_set":
            profile_ref = row.get("profile_ref")
            if row.get("profile_id") not in PLACE_PROFILES:
                fail.append(f"{rid}: unknown D40 place-set profile")
            elif (row.get("pf_id"), profile_ref, row.get("owner_gap_ref")) != PLACE_BINDINGS[row["profile_id"]]:
                fail.append(f"{rid}: D40 place binding/gap differs from reviewed mapping")
            if profile_ref and profile_ref not in scenes | buildings:
                fail.append(f"{rid}: place-set scene/building ref unresolved")
            if not profile_ref and "issue:#176" not in row.get("owner_gap_ref", ""):
                fail.append(f"{rid}: unresolved place-set must hand off to #176")
        needs_by_profile[row.get("profile_id")].add(row.get("need_category"))
        kinds_by_profile[row.get("profile_id")] = row.get("profile_kind")

    for profile, needs in needs_by_profile.items():
        required = (HOUSEHOLD_REQUIRED if kinds_by_profile[profile] == "household"
                    else WORKSHOP_REQUIRED if kinds_by_profile[profile] == "workshop"
                    else PLACE_REQUIRED.get(profile, set()))
        missing = required - needs
        if missing:
            fail.append(f"{profile}: missing need coverage {sorted(missing)}")

    for hh_type in sorted({r.get("household_type") for r in rows if r.get("profile_kind") == "household"}):
        for season in ("winter", "spring_rasputitsa", "summer", "autumn"):
            for fd_id in ("fd_bread_rye", "fd_kvass_like"):
                if (hh_type, season, fd_id) not in food_keys:
                    fail.append(f"{hh_type}: food profile lacks {season}/{fd_id}")

    got_places = {r.get("profile_id") for r in rows if r.get("profile_kind") == "place_set"}
    if got_places != PLACE_PROFILES:
        fail.append(f"D40 place-set coverage mismatch: missing={sorted(PLACE_PROFILES-got_places)} extra={sorted(got_places-PLACE_PROFILES)}")

    rejected_file = ROOT / "data/world-catalogs/novgorod/game-base-v1/items-household-personal/reports/household_inventory_rejected.csv"
    if rejected_file.exists():
        got = {r["term"] for r in read_csv(rejected_file)}
        if got != rejected_terms:
            fail.append("rejected-anachronism report does not match authored rules")
    else:
        fail.append("rejected-anachronism report missing")

    # The allow/deny policy is executable, not merely a copied rejection report.
    if materials.get("mt_silk", {}).get("origin") != "import":
        fail.append("mt_silk must remain import-only")
    if any(r.get("object_ref") == "tg_spices_gap" for r in rows):
        fail.append("spices GAP must not materialize")
    if any(r.get("profile_id") == "place_bathhouse" and r.get("object_ref") == "REL0001" for r in rows):
        fail.append("bathhouse must not receive the dwelling shrine")
    bath_towels = [r for r in rows if r.get("profile_id") == "place_bathhouse" and r.get("object_ref") == "it_hh_towel"]
    if not bath_towels or any(r.get("composition_factor") != "per_bather" for r in bath_towels):
        fail.append("bathhouse towel must scale per bather")
    glass_adornments = [r for r in rows if r.get("object_ref") in {"ad_new_glass_bracelet", "ad_ac020"}]
    if any(r.get("need_category") == "import_luxury" for r in glass_adornments):
        fail.append("locally produced glass adornment cannot be classified as import_luxury")
    expected_adornment_profiles = set(HOUSEHOLD_COMPOSITION) - {"hh_monastery"}
    for ref in ("ad_new_glass_bracelet", "ad_ac020"):
        got = {r["profile_id"] for r in glass_adornments if r["object_ref"] == ref and r["profile_kind"] == "household"}
        if got != expected_adornment_profiles:
            fail.append(f"{ref}: low/middle/high household coverage incomplete")

    coverage_path = ROOT / "data/world-catalogs/novgorod/game-base-v1/items-household-personal/reports/item_catalog_coverage.csv"
    if coverage_path.exists():
        coverage = read_csv(coverage_path)
        all_items = set(item_by_id)
        coverage_ids = {r["item_id"] for r in coverage}
        if coverage_ids != all_items or len(coverage) != len(all_items):
            fail.append("item catalog coverage is not an exact one-row partition")
        allowed_coverage = {"inventory", "ambient_frequency", "closed_reason"}
        allowed_reasons = {"anachronism", "physical_impossibility", "duplicate"}
        for entry in coverage:
            if entry["coverage_kind"] not in allowed_coverage:
                fail.append(f"{entry['item_id']}: unknown catalog coverage kind")
            if entry["coverage_kind"] == "closed_reason" and entry["reason_code"] not in allowed_reasons:
                fail.append(f"{entry['item_id']}: missing closed catalog reason")
            if entry["coverage_kind"] != "closed_reason" and entry["reason_code"]:
                fail.append(f"{entry['item_id']}: reason only belongs to closed coverage")
    else:
        fail.append("item catalog coverage report missing")

    metrics = {
        "rows": len(rows), "profiles": len(needs_by_profile),
        "profiles_by_kind": dict(Counter(kinds_by_profile.values())),
        "basis": dict(Counter(r.get("basis") for r in rows)),
        "requirement": dict(Counter(r.get("requirement") for r in rows)),
        "need_category": dict(Counter(r.get("need_category") for r in rows)),
        "rejected_anachronisms": len(rejected_terms),
    }
    return fail, metrics


def self_test(rows):
    baseline, _ = validate_rows(rows)
    assert not baseline, baseline[:3]
    glazed = next(r for r in rows if r["object_ref"] == "it_hh_glazed_bowl_import")
    silk = next(r for r in rows if r["object_ref"] in SILK_REFS)
    coin = next(r for r in rows if r["object_ref"] == "cu_foreign_silver_coin")
    wine = next(r for r in rows if r["object_ref"] == "fd_wine_imported")
    probes = [
        ("bad basis", {**rows[0], "basis": "guess"}, "basis="),
        ("missing item", {**rows[0], "object_ref": "it_missing_probe"}, "unresolved"),
        ("blank derivation", {**rows[0], "derivation": ""}, "basis requires"),
        ("negative quantity", {**rows[0], "quantity_norm": "-1"}, "must be positive"),
        ("bad composition factor", {**rows[0], "composition_factor": "average_family_guess"}, "composition_factor="),
        ("no first-open", {**next(r for r in rows if r["materialization_scope"] == "stored"), "first_open_rule_ref": ""}, "d3 first-open"),
        ("ukhvat", {**rows[0], "object_ref": "ухват"}, "forbidden identity term"),
        ("cast iron stove", {**rows[0], "object_ref": "чугунная_печь"}, "forbidden identity term"),
        ("paper book", {**rows[0], "object_ref": "бумажная_книга"}, "forbidden identity term"),
        ("mass glazed ware", {**glazed, "requirement": "required"}, "glazed import"),
        ("non-conditional silk", {**silk, "requirement": "required"}, "silk must remain"),
        ("circulating foreign coin", {**coin, "requirement": "required"}, "foreign coin"),
        ("wine delegated to absent food row", {**wine, "quantity_mode": "delegated_profile"}, "delegated food item absent"),
        ("spice gap", {**rows[0], "ref_kind": "workshop_stock", "object_ref": "tg_spices_gap", "profile_kind": "workshop", "profile_id": "ws_smithy_town"}, "spices GAP"),
        ("invented korchma PF", {**next(r for r in rows if r["profile_id"] == "place_korchma"), "pf_id": "market_square"}, "korchma must retain"),
        ("discounted required headcount", {**next(r for r in rows if r["requirement"] == "required" and r["composition_factor"].startswith("per_")), "wealth_multiplier": "0.60"}, "cannot be reduced"),
        ("unconditional gusli", {**next(r for r in rows if r["object_ref"] == "it_ps_gusli_wing"), "quantity_mode": "formula"}, "conditional row"),
        ("unconditional glass vessel", {**next(r for r in rows if r["object_ref"] == "it_hh_glass_drinking_vessel"), "quantity_mode": "formula"}, "conditional row"),
        ("unconditional silver cup", {**next(r for r in rows if r["object_ref"] == "it_hh_silver_feast_cup"), "quantity_mode": "formula"}, "conditional row"),
        ("mass spices", {**next(r for r in rows if r["object_ref"] == "n1230:material_item:fod0027"), "requirement": "required"}, "spices must remain"),
        ("glass adornment import", {**next(r for r in rows if r["object_ref"] == "ad_new_glass_bracelet"), "need_category": "import_luxury"}, "cannot be classified as import_luxury"),
    ]
    for name, changed, expected in probes:
        candidate = [changed] + rows[1:]
        failures, _ = validate_rows(candidate)
        assert any(expected in failure for failure in failures), f"negative probe did not hit {expected!r}: {name}"
    duplicate = {**rows[0], "hip_id": "hip_duplicate_profile_object_probe"}
    failures, _ = validate_rows(rows + [duplicate])
    assert any("duplicate profile/object pair" in failure for failure in failures)
    print(f"household inventory negative probes PASS ({len(probes) + 1})")
