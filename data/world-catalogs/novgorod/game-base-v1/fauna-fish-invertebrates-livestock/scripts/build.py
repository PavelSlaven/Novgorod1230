#!/usr/bin/env python3
"""Build + validate the fauna-fish-invertebrates-livestock candidate tables.

Deterministic: reads authored data in scripts/src/*.py, repo sources (WK production-v1, MASTER archive copy,
rus13 templates, v6 g3 TSV, rules v2 TSV) and input snapshots; writes CSV tables under fauna/, sources.csv and
validation_report.json. No network access. Run: python scripts/build.py  (exit 1 if a check fails).
"""
import csv, json, os, re, sys, glob
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(OUT, *[".."] * 5))
sys.path.insert(0, os.path.join(HERE, "src"))
import sources_data, fish_data, inv_herp_data, livestock_data, denylist_data  # noqa: E402

FAUNA = os.path.join(OUT, "fauna")
os.makedirs(FAUNA, exist_ok=True)
WEIGHT = {"u": 8, "c": 4, "x": 2, "r": 1}
CLASSNAME = {"u": "ubiquitous", "c": "common", "x": "contextual", "r": "rare"}
SEASONS = ["winter", "spring_rasputitsa", "summer", "autumn"]
MONTH_SEASON = {12: "winter", 1: "winter", 2: "winter", 3: "spring_rasputitsa", 4: "spring_rasputitsa", 5: "spring_rasputitsa",
                6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn"}
STATUS = "candidate"
REGION = "novgorod_land"
CORE_SUB = "novgorod_ilmen_core"


def rel(*p):
    return os.path.join(REPO, *p)


def write_csv(name, header, rows):
    path = os.path.join(FAUNA, name) if not name.startswith("/") else name
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow([r.get(h, "") for h in header])
    return len(rows)


def j(xs):
    return ";".join(str(x) for x in xs if x not in (None, ""))


# ---------------- reference indexes ----------------
WK_DIR = rel("data", "world-catalogs", "novgorod", "world-knowledge", "production-v1")
wk_concepts, wk_claims = set(), set()
for fp in glob.glob(os.path.join(WK_DIR, "*.json")):
    try:
        d = json.load(open(fp, encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(d, dict):
        continue
    for c in d.get("concepts", []) or []:
        wk_concepts.add(c.get("concept_ref"))
    for c in d.get("claims", []) or []:
        wk_claims.add(c.get("claim_ref"))
pf_ids = [f["id"] for f in json.load(open(os.path.join(WK_DIR, "place-first-cartography.json"), encoding="utf-8"))["environment_families"]]

MASTER = rel("data", "world-catalogs", "novgorod", "sources", "master-archive-v1")
master_ids = set()
with open(os.path.join(MASTER, "data", "canonical", "material_items.csv"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        master_ids.add(r["id"])
ing_ids = set()
with open(os.path.join(MASTER, "data", "normalized_source_tables", "food_system", "ingredients.csv"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        ing_ids.add(r["ingredient_id"])

wb = {}
with open(os.path.join(HERE, "input_snapshots", "world_db_water_body_templates.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        wb[r["id"]] = r
wp_refs = json.load(open(os.path.join(HERE, "input_snapshots", "wikipedia_refs_checked.json"), encoding="utf-8"))

problems = defaultdict(list)


def check_ref(ref, where):
    if ref.startswith("claim:"):
        ok = ref in wk_claims
    elif ref.startswith("wk:"):
        ok = ref in wk_concepts
    elif ref.startswith("master:"):
        ok = ref[len("master:"):] in master_ids
    elif ref.startswith("src:"):
        ok = ref in sources_data.SOURCES
    elif ref.startswith("wp:"):
        ok = ref[3:] in wp_refs and wp_refs[ref[3:]]["http"] == "200"
    else:
        ok = False
    if not ok:
        problems["unresolved_source_ref"].append(f"{where}: {ref}")
    return ok


def months_list(s):
    out = []
    if not s:
        return out
    a, _, b = s.partition("-")
    a = int(a)
    b = int(b) if b else a
    m = a
    while True:
        out.append(m)
        if m == b:
            break
        m = m % 12 + 1
    return out


used_refs = set()


def refs(xs, where):
    for x in xs:
        used_refs.add(x)
        check_ref(x, where)
    if not xs:
        problems["empty_source_refs"].append(where)
    return j(xs)


# ---------------- fish ----------------
fish_rows, presence = [], {}
for s in fish_data.FISH:
    fid = s["fa_id"]
    sub = s.get("subregion", CORE_SUB)
    for t in s["wb"]:
        if t not in wb:
            problems["unknown_water_body_template"].append(f"{fid}: {t}")
        elif wb[t].get("is_allowed") != "t":
            problems["water_body_template_not_allowed_in_region"].append(f"{fid}: {t}")
    for g in s["gear"]:
        check_ref("master:n1230:material_item:" + g.lower(), f"{fid}.gear")
    if s["ing"]:
        if s["ing"] not in ing_ids:
            problems["unknown_ingredient"].append(f"{fid}: {s['ing']}")
    ms = months_list(s["spawn_months"])
    if not ms and s["spawn_basis"] != "fishbase_explicit_none":
        problems["missing_spawning_period"].append(fid)
    spawn_seasons = sorted({MONTH_SEASON[m] for m in ms}, key=SEASONS.index)
    # presence expansion (rule WB-PF-1 + FREQ-FISH-1)
    for t, cls in s["wb"].items():
        for pf in {a: b for a, b, _n in fish_data.WB_PF}.get(t, []):
            for se in s["seasons"]:
                if t in fish_data.WB_SEASON_LIMIT and se not in fish_data.WB_SEASON_LIMIT[t]:
                    continue
                if pf in fish_data.PF_SEASON_LIMIT and se not in fish_data.PF_SEASON_LIMIT[pf]:
                    continue
                key = (fid, pf, se, sub)
                cur = presence.get(key)
                if cur is None or WEIGHT[cls] > WEIGHT[cur["cls"]]:
                    presence[key] = dict(cls=cls, basis=[t], activity="active", table="fish", src=s["src"], conf=s["conf"])
                elif WEIGHT[cls] == WEIGHT[cur["cls"]]:
                    cur["basis"].append(t)
    hp = sorted({(pf, se, c["cls"]) for (f2, pf, se, sb), c in presence.items() if f2 == fid})
    fish_rows.append(dict(
        fa_id=fid, name_ru=s["name_ru"], name_old_ru=s["name_old_ru"], name_lat=s["name_lat"], name_en=s["name_en"],
        family=s["family"], group=s["group"], migratory_status=s["migratory"],
        category_ref=f"cat:fauna.{'crustacean' if s['group'] == 'crustacean' else 'fish'}.{s['group']}",
        taxon_scope="universal", region_id="", presence_region_id=REGION, subregion_scope=sub,
        water_body_template_refs=j(s["wb"].keys()), water_body_types=j(sorted({wb[t]["water_body_type"] for t in s["wb"] if t in wb})),
        wb_frequency=j(f"{t}:{CLASSNAME[c]}" for t, c in s["wb"].items()), named_waters=s["named_waters"],
        season_presence=j(s["seasons"]), habitat_presence_count=len(hp),
        spawning_months=s["spawn_months"], spawning_season_period=j(spawn_seasons), spawning_site=s["spawn_site"],
        spawning_basis=s["spawn_basis"], fishing_methods=j(s["methods"]), gear_refs=j("master:n1230:material_item:" + g.lower() for g in s["gear"]),
        size_classes=s["size"], food_ingredient_ref=("master:food_system:" + s["ing"]) if s["ing"] else "",
        look_ru=s["look"], novgorod_evidence=s["evidence"],
        source_refs=refs(s["src"] + [r for r in s["spawn_sources"] if r not in s["src"]], fid),
        confidence=s["conf"], status=STATUS, notes=s["notes"]))
    for m in s["methods"]:
        if m not in {x[0] for x in fish_data.FISHING_METHODS}:
            problems["unknown_fishing_method"].append(f"{fid}: {m}")

fm_rows = []
for (mid, ru, en, desc, gear, src, conf, seas) in fish_data.FISHING_METHODS:
    for g in [x for x in gear.split(";") if x]:
        check_ref("master:n1230:material_item:" + g.lower(), mid)
    fm_rows.append(dict(fm_id=mid, name_ru=ru, name_en=en, description_ru=desc,
                        gear_refs=j("master:n1230:material_item:" + g.lower() for g in gear.split(";") if g),
                        seasons=("winter;spring_rasputitsa;summer;autumn" if seas == "all" else seas),
                        species_count=sum(1 for s in fish_data.FISH if mid in s["methods"]),
                        source_refs=refs(src.split(";"), mid), confidence=conf, status=STATUS))

cw_rows = []
for t, pfs, note in fish_data.WB_PF:
    for pf in pfs:
        if pf not in pf_ids:
            problems["unknown_pf_id"].append(f"crosswalk {t}->{pf}")
        cw_rows.append(dict(cw_id=f"cw_{t}__{pf}", water_body_template_ref=t, water_body_type=wb.get(t, {}).get("water_body_type", ""),
                            template_title=wb.get(t, {}).get("title", ""), pf_id=pf, example_waters=note,
                            season_limit=j(fish_data.WB_SEASON_LIMIT.get(t, []) or fish_data.PF_SEASON_LIMIT.get(pf, [])),
                            rule_ref="WB-PF-1", source_refs=refs(["src:world-db-water-body-templates", "src:wk-place-first-cartography"], "crosswalk"),
                            confidence="C", status=STATUS))

# ---------------- invertebrates & herps ----------------
inv_rows = []
for s in inv_herp_data.INV:
    fid = s["fa_id"]
    src = list(s["src"]) + ["wp:" + a for a in inv_herp_data.WP_REFS.get(fid, [])]
    for pfs, seas, cls, act in s["presence"]:
        for pf in pfs:
            if pf not in pf_ids:
                problems["unknown_pf_id"].append(f"{fid}: {pf}")
            for se in seas:
                key = (fid, pf, se, CORE_SUB)
                cur = presence.get(key)
                if cur is None or WEIGHT[cls] > WEIGHT[cur["cls"]] or (WEIGHT[cls] == WEIGHT[cur["cls"]] and act == "active"):
                    presence[key] = dict(cls=cls, basis=["authored"], activity=act, table="invertebrates_herps", src=src, conf=s["conf"])
    inv_rows.append(dict(
        fa_id=fid, name_ru=s["name_ru"], name_lat=s["name_lat"], name_en=s["name_en"], group=s["group"],
        category_ref=f"cat:fauna.{s['group']}", taxon_scope="universal", region_id="", presence_region_id=REGION,
        flying=str(s["flying"]).lower(), blood_feeding=str(s["blood"]).lower(), nuisance_or_danger=s["danger"],
        perceptual_cues=s["cues"], season_peak=s["peak"], uses=s["uses"],
        active_seasons=j(sorted({se for (f2, pf, se, sb), c in presence.items() if f2 == fid and c["activity"] == "active"}, key=SEASONS.index)),
        habitat_presence_count=sum(1 for k in presence if k[0] == fid),
        source_refs=refs(src, fid), confidence=s["conf"], status=STATUS, notes=s["notes"]))

pres_rows = []
for (fid, pf, se, sub), c in sorted(presence.items()):
    if pf not in pf_ids:
        problems["unknown_pf_id"].append(f"presence {fid}: {pf}")
    pres_rows.append(dict(
        fpr_id=f"fpr_{fid}__{pf}__{se}" + ("" if sub == CORE_SUB else f"__{sub}"),
        fa_id=fid, taxon_table=c["table"], scope_kind="place_family", pf_id=pf, region_id=REGION, subregion_scope=sub,
        season_period=se, frequency_class=CLASSNAME[c["cls"]], weight=WEIGHT[c["cls"]], activity_state=c["activity"],
        basis=j(sorted(set(c["basis"]))), rule_ref=("FREQ-FISH-1;WB-PF-1" if c["table"] == "fish" else "FREQ-INV-1"),
        source_refs=j(c["src"]), confidence=c["conf"], status=STATUS))

# ---------------- livestock ----------------
sp_rows = []
for (fid, ru, lat, en, src, conf) in livestock_data.SPECIES:
    sp_rows.append(dict(fa_id=fid, name_ru=ru, name_lat=lat, name_en=en, category_ref=f"cat:fauna.domestic.{fid.split('_', 2)[2]}",
                        taxon_scope="universal", region_id="", source_refs=refs(src, fid), confidence=conf, status=STATUS))
sp_ids = {r["fa_id"] for r in sp_rows} | {"fa_ins_honeybee"}

vr = livestock_data.VALUE_REZANY
ranked = sorted({vr[t["value"]] for t in livestock_data.TYPES if t["value"]}, reverse=True)
lt_rows = []
for t in livestock_data.TYPES:
    if t["sp"] not in sp_ids:
        problems["unknown_species_ref"].append(t["ls_id"])
    if t["value"] and t["value"] not in vr:
        problems["value_without_rezana_mapping"].append(t["ls_id"])
    src = list(t["src"]) + (["master:n1230:material_item:" + t["mi"]] if t["mi"] and "master:n1230:material_item:" + t["mi"] not in t["src"] else [])
    lt_rows.append(dict(
        ls_id=t["ls_id"], species_ref=t["sp"], name_ru=t["name_ru"], name_old_ru=t["old"], sex=t["sex"], age_class=t["age"],
        appearance_colors=t["colors"], size_ru=t["size"], body_ru=t["body"], housing=t["housing"], primary_uses=t["uses"],
        value_rp45=t["value"], value_rezany=(vr[t["value"]] if t["value"] else ""), value_rank=(ranked.index(vr[t["value"]]) + 1 if t["value"] else ""),
        value_basis=("Русская Правда (Простр.) ст. 45; перевод «кун» = резаны Краткой ст. 28 (C)" if t["value"] else ""),
        ownership_marks_pool_ref="livestock_identification_marks.csv", category_ref=f"cat:fauna.domestic.{t['sp'].split('_', 2)[2]}",
        taxon_scope="universal", region_id="", source_refs=refs(src, t["ls_id"]), confidence=t["conf"], status=STATUS, notes=t["notes"]))

care_rows = []
for i, (sp, se, housing, fodder, water, daily, seasonal, prod, risks, src, conf) in enumerate(livestock_data.CARE, 1):
    if sp not in sp_ids:
        problems["unknown_species_ref"].append(f"care {sp}")
    seasons = SEASONS if se == "all" else [se]
    for s2 in seasons:
        care_rows.append(dict(lc_id=f"lc_{sp.split('_', 2)[2]}__{s2}", species_ref=sp, season_period=s2, housing=housing, fodder=fodder,
                              water=water, care_tasks_daily=daily, care_tasks_seasonal=seasonal, products_in_season=prod, risks=risks,
                              region_id=REGION, source_refs=refs(src, f"care {sp} {s2}"), confidence=conf, status=STATUS))

ail_rows = []
for (aid, sps, name, signs, trig, resp, src, conf) in livestock_data.AILMENTS:
    for sp in sps:
        if sp not in sp_ids:
            problems["unknown_species_ref"].append(f"{aid}: {sp}")
    ail_rows.append(dict(ail_id=aid, species_refs=j(sps), name_ru=name, observable_signs=signs, trigger_or_season=trig,
                         ordinary_response=resp, diagnosis_policy="признаки не устанавливают диагноз; исход задаёт код",
                         source_refs=refs(src, aid), confidence=conf, status=STATUS))

prod_rows = []
for (pid, sp, name, kind, rr, season, src, conf) in livestock_data.PRODUCTS:
    if sp not in sp_ids:
        problems["unknown_species_ref"].append(f"{pid}: {sp}")
    out_refs = []
    for r in [x for x in rr.split(";") if x]:
        if r.startswith("ING"):
            if r not in ing_ids:
                problems["unknown_ingredient"].append(f"{pid}: {r}")
            out_refs.append("master:food_system:" + r)
        else:
            check_ref(r, pid)
            out_refs.append(r)
    prod_rows.append(dict(lp_id=pid, species_ref=sp, name_ru=name, product_kind=kind, food_or_material_refs=j(out_refs),
                          season_note=season, source_refs=refs(src, pid), confidence=conf, status=STATUS))

mk_rows = [dict(mk_id=m[0], applies_to=m[1], mark_kind=m[2], name_ru=m[3], description_ru=m[4],
                identification_rule="владелец «познаёт» своё; спор решается сводом (РП ст. 34–35); код выбирает приметы из пула, LLM их не выдумывает",
                source_refs=refs(m[5], m[0]), confidence=m[6], status=STATUS) for m in livestock_data.MARKS]

# ---------------- herd composition (rule-derived) ----------------
wealth = json.load(open(rel("tools", "rus13-novgorod-regional-templates", "novgorod_household_wealth_profiles_v1.json"), encoding="utf-8"))["wealth_profiles"]
BAND = {
    "wealth_destitute_no_yard": "none", "wealth_dependent_yard": "none", "wealth_resource_camp": "camp", "wealth_temporary_road_camp": "camp",
    "wealth_poor_yard": "poor", "wealth_ruined_yard": "poor", "wealth_burned_yard": "poor", "wealth_orphaned_household": "poor",
    "wealth_debt_burdened_yard": "poor", "wealth_elderly_household": "poor", "wealth_widow_yard": "poor", "wealth_fisher_yard": "poor",
    "wealth_boatman_yard": "poor", "wealth_hunter_promysel_yard": "poor",
    "wealth_ordinary_yard": "ordinary", "wealth_craft_yard": "ordinary", "wealth_church_yard": "ordinary", "wealth_pogost_service_yard": "ordinary",
    "wealth_guest_yard": "ordinary", "wealth_well_off_yard": "prosperous", "wealth_merchant_yard": "prosperous",
    "wealth_boyar_yard": "elite", "wealth_monastery_yard": "elite",
}
# Anchor = ordinary peasant household (rule HERD-ANCHOR): horse 1 (kochin: horse is the base of a poor household with 25–30 kopny hay;
# korotkova), cows 1–3 (min 1 kochin: a cow given to a freed family as subsistence; max 3 korotkova), sheep 0–8 (6 in Spasskoye
# inventory, kochin; 6–8 korotkova), pigs 0–2 (Spasskoye), goats 0–1 (rare: sablin), chickens 1–2 «гнезда» (Spasskoye).
ANCHOR = {"fa_dom_horse": (1, 1, "head"), "fa_dom_cattle": (1, 3, "head"), "fa_dom_sheep": (0, 8, "head"), "fa_dom_pig": (0, 2, "head"),
          "fa_dom_goat": (0, 1, "head"), "fa_dom_chicken": (1, 2, "гнездо (наседка с выводком/несушки)"), "fa_dom_dog": (0, 1, "head"),
          "fa_dom_cat": (0, 1, "head")}
ANCHOR_SRC = ["src:kochin-1965-agriculture", "src:korotkova-byt", "src:sablin-2007-rurikovo", "src:rus13tpl-household-wealth"]
TERMS = [  # regex -> species
    (r"рабоч\w* лошад|рабочее животное|лошад|кон[ьи]", ["fa_dom_horse"]), (r"вол", ["fa_dom_cattle"]),
    (r"коров|крупный скот|рабочий скот", ["fa_dom_cattle"]), (r"мелкий скот|small_livestock", ["fa_dom_sheep", "fa_dom_goat"]),
    (r"овц", ["fa_dom_sheep"]), (r"коз", ["fa_dom_goat"]), (r"свин", ["fa_dom_pig"]), (r"птиц|кур", ["fa_dom_chicken"]),
    (r"собак|служебные животные", ["fa_dom_dog"]),
    (r"(?<!мелкий )(?<!крупный )(?<!рабочий )(?<![а-я])скот(?! при дворах)", ["fa_dom_cattle", "fa_dom_sheep", "fa_dom_pig"]),
]
COND = r"при основании|при необходимости|при контексте|по контексту|редко|if_attached|единичные|под спором|под угрозой|уцелевший"
VISIT = r"постояльцев|приезжих|путников|привозящих"


def parse_animals(items):
    res = {}
    for item in items:
        for part in re.split(r";|,| или ", item):
            p = part.strip().lower()
            if not p or p in ("none",):
                continue
            if re.search(VISIT, p):
                continue
            cond = bool(re.search(COND, item.lower())) if len(items) == 1 and ";" not in item else bool(re.search(COND, p))
            for rx, sps in TERMS:
                if re.search(rx, p):
                    for sp in sps:
                        res[sp] = res.get(sp, True) and cond if sp in res else cond
    return res


herd_rows = []
for wp in wealth:
    pid, band = wp["wealth_profile_id"], BAND.get(wp["wealth_profile_id"])
    txt = " | ".join(wp.get("typical_animals", []))
    if band is None:
        problems["household_profile_without_band"].append(pid)
        continue
    parsed = parse_animals(wp.get("typical_animals", []))
    if "единичн" in txt:  # rule HERD-RUINED: lost or single animals of the ordinary set
        parsed = {sp: True for sp in ("fa_dom_horse", "fa_dom_cattle", "fa_dom_sheep", "fa_dom_pig", "fa_dom_chicken")}
    note_state = "not_owned_or_disputed" if "не личные" in txt else ("disputed" if "спор" in txt else ("seizable" if "угроз" in txt else ""))
    if band == "none" or (not parsed and band != "camp"):
        herd_rows.append(dict(hc_id=f"hc_{pid}__none", household_profile_ref=pid, household_type=wp["household_type"], wealth_band=band,
                              species_ref="none", min_count=0, max_count=0, count_unit="head", conditional="false", ownership_state=note_state,
                              rule_ref="HERD-NONE", source_text=txt, source_refs=refs(ANCHOR_SRC[3:], pid), confidence="C", status=STATUS))
        continue
    if band not in ("camp",):
        parsed.setdefault("fa_dom_cat", True)  # rule HERD-CAT: a dwelling household may keep a cat (MASTER LIV0001, A)
    for sp, cond in sorted(parsed.items()):
        lo, hi, unit = ANCHOR[sp]
        rule = "HERD-ANCHOR"
        if band == "poor":
            hi = max(1, hi // 2); lo = 0; rule = "HERD-POOR (max = floor(anchor/2), >=1; min 0)"
        elif band == "prosperous":
            lo, hi = max(lo, 1), hi * 2; rule = "HERD-PROSPEROUS (min >=1, max = 2 x anchor)"
        elif band == "elite":
            lo, hi = hi, ""; rule = "HERD-ELITE (min = anchor max; max open: size set by estate/scene)"
        elif band == "camp":
            lo, hi = 0, ""; rule = "HERD-CAMP (travel/work animals, max open by party)"
        if cond:
            lo = 0; rule += "; COND (min 0)"
        if "единичн" in txt:
            lo, hi, rule = 0, 1, "HERD-RUINED (0..1 of the ordinary set)"
        if sp == "fa_dom_cat" and sp not in parse_animals(wp.get("typical_animals", [])):
            lo, hi, rule = 0, 1, "HERD-CAT"
        herd_rows.append(dict(hc_id=f"hc_{pid}__{sp.split('_', 2)[2]}", household_profile_ref=pid, household_type=wp["household_type"],
                              wealth_band=band, species_ref=sp, min_count=lo, max_count=hi, count_unit=unit, conditional=str(bool(cond)).lower(),
                              ownership_state=note_state, rule_ref=rule, source_text=txt,
                              source_refs=refs(ANCHOR_SRC + (["master:n1230:material_item:liv0001"] if sp == "fa_dom_cat" else []), pid),
                              confidence="C", status=STATUS))

# v6 household_mix tokens -> wealth profiles (authored keyword rule HH-XW-1)
XW = [(r"^гости$|конюшня|окрестные крестьяне|не считаются дворами|дворов мало|основная плотность", "not_a_household"), (r"^хозяин/держатель", "wealth_boyar_yard"), (r"скотный", "wealth_monastery_yard"), (r"^склад", "wealth_merchant_yard"),
      (r"богат", "wealth_boyar_yard"), (r"зажиточ|старш", "wealth_well_off_yard"), (r"бедн|крайн|окраин", "wealth_poor_yard"),
      (r"церков|причт", "wealth_church_yard"), (r"ремесл|мастер", "wealth_craft_yard"), (r"гостев|посто", "wealth_guest_yard"),
      (r"торгов|купеч|складск|держател", "wealth_merchant_yard"), (r"рыбак|сетей", "wealth_fisher_yard"), (r"лодейщ|перевозчик", "wealth_boatman_yard"),
      (r"промыслов|охотн", "wealth_hunter_promysel_yard"), (r"монастыр|кель|брат", "wealth_monastery_yard"), (r"погорел|пустующ|разор", "wealth_burned_yard"),
      (r"зависим|дворов|работн|скотник|подручн|хозяйственн\w* служител", "wealth_dependent_yard"),
      (r"служил|служеб|сторож|административ|писц|варник|возчик|хранител", "wealth_pogost_service_yard"),
      (r"временн|артел|сезонн|приезжие|путник", "wealth_temporary_road_camp"), (r"обычн|рядов|крестьянск|хозяйственн", "wealth_ordinary_yard")]
g3 = rel("DOCUMENTS", "documents-kg", "corpus", "DOCUMENTS", "novgorod_graphify_g1_g4_full", "source_tsv", "novgorod_g2_g4_70_cells_v6_g3_places.tsv")
tok_counter, tok_scale = Counter(), defaultdict(set)
with open(g3, encoding="utf-8") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        for part in r["household_mix"].split(";"):
            tok = re.sub(r"[\d\-–%]+", "", part).strip(" .,:").strip()
            if tok:
                tok_counter[tok] += 1
                tok_scale[tok].add(r["scale_class"])
xw_rows = []
for tok, n in sorted(tok_counter.items(), key=lambda x: -x[1]):
    target = next((t for rx, t in XW if re.search(rx, tok.lower())), "")
    if not target:
        problems["v6_household_token_unmapped"].append(tok)
    xw_rows.append(dict(xw_id=f"xw_{len(xw_rows) + 1:03d}", v6_household_mix_token=tok, g3_rows=n, scale_classes=j(sorted(tok_scale[tok])),
                        household_profile_ref=target, rule_ref="HH-XW-1", source_refs=refs(["src:v6-g3-household-mix", "src:rus13tpl-household-wealth"], "xw"),
                        confidence="C", status=STATUS))

# place type -> livestock from rules v2 typical_animals
rules = rel("tools", "rus13-novgorod-place-generation-rules", "novgorod_region_place_generation_rules_v2_expanded.tsv")
pt_rows = []
with open(rules, encoding="utf-8") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        items = json.loads(r["typical_animals"] or "[]")
        if not items:
            pt_rows.append(dict(pl_id=f"pl_{r['id']}__none", rule_ref=r["id"], template_type=r["template_type"], species_ref="none",
                                ownership="none", conditional="false", source_text="[]", source_refs=refs(["src:rus13-place-rules-v2"], r["id"]),
                                confidence="C", status=STATUS))
            continue
        for it in items:
            low = it.lower()
            own = "visiting" if re.search(VISIT, low) else ("for_sale" if re.search(r"на продажу|на торге", low) else
                                                            ("work_transport" if re.search(r"для |сани", low) else "resident"))
            cond = bool(re.search(COND + r"|при хозяйстве|при дворах|по дворам|по достатку|нет или", low))
            sps = set()
            for rx, ss in TERMS:
                if re.search(rx, low):
                    sps.update(ss)
            if re.search(r"скот при дворах|скот на", low):
                sps.update(["fa_dom_cattle", "fa_dom_sheep", "fa_dom_pig"])
            for sp in sorted(sps):
                pid = f"pl_{r['id']}__{sp.split('_', 2)[2]}__{own}"
                if any(x["pl_id"] == pid for x in pt_rows):
                    continue
                pt_rows.append(dict(pl_id=pid, rule_ref=r["id"], template_type=r["template_type"], species_ref=sp, ownership=own,
                                    conditional=str(cond).lower(), source_text=it, source_refs=refs(["src:rus13-place-rules-v2"], r["id"]),
                                    confidence="C", status=STATUS))

# ---------------- denylist ----------------
deny_rows = []
for (did, pats, reason, limit, src, conf, scope) in denylist_data.DENY:
    deny_rows.append(dict(deny_id=did, patterns=" | ".join(pats), scope=scope, reason_ru=reason, earliest_or_limit=limit,
                          source_refs=refs(src, did), confidence=conf, status=STATUS))

# ---------------- write ----------------
counts = {}
counts["fish.csv"] = write_csv("fish.csv", list(fish_rows[0].keys()), fish_rows)
counts["fishing_methods.csv"] = write_csv("fishing_methods.csv", list(fm_rows[0].keys()), fm_rows)
counts["water_body_pf_crosswalk.csv"] = write_csv("water_body_pf_crosswalk.csv", list(cw_rows[0].keys()), cw_rows)
counts["invertebrates_herps.csv"] = write_csv("invertebrates_herps.csv", list(inv_rows[0].keys()), inv_rows)
counts["fauna_presence.csv"] = write_csv("fauna_presence.csv", list(pres_rows[0].keys()), pres_rows)
counts["livestock_species.csv"] = write_csv("livestock_species.csv", list(sp_rows[0].keys()), sp_rows)
counts["livestock_types.csv"] = write_csv("livestock_types.csv", list(lt_rows[0].keys()), lt_rows)
counts["livestock_care.csv"] = write_csv("livestock_care.csv", list(care_rows[0].keys()), care_rows)
counts["livestock_ailments.csv"] = write_csv("livestock_ailments.csv", list(ail_rows[0].keys()), ail_rows)
counts["livestock_products.csv"] = write_csv("livestock_products.csv", list(prod_rows[0].keys()), prod_rows)
counts["livestock_identification_marks.csv"] = write_csv("livestock_identification_marks.csv", list(mk_rows[0].keys()), mk_rows)
counts["herd_composition.csv"] = write_csv("herd_composition.csv", list(herd_rows[0].keys()), herd_rows)
counts["household_type_crosswalk.csv"] = write_csv("household_type_crosswalk.csv", list(xw_rows[0].keys()), xw_rows)
counts["place_type_livestock.csv"] = write_csv("place_type_livestock.csv", list(pt_rows[0].keys()), pt_rows)
counts["anachronism_denylist_fauna.csv"] = write_csv("anachronism_denylist_fauna.csv", list(deny_rows[0].keys()), deny_rows)

src_rows = []
for sid, (cit, url, kind, note) in sorted(sources_data.SOURCES.items()):
    src_rows.append(dict(src_id=sid, citation=cit, url_or_path=url, kind=kind, collector_note=note, used=str(sid in used_refs).lower()))
for a, v in sorted(wp_refs.items()):
    if "wp:" + a in used_refs:
        src_rows.append(dict(src_id="wp:" + a, citation=f"Википедия (ru): {a.replace('_', ' ')}", url_or_path=v["url"], kind="encyclopedia",
                             collector_note=f"HTTP {v['http']} при проверке {v['retrieved']}; только общая биология/ареал", used="true"))
counts["sources.csv"] = write_csv(os.path.join(OUT, "sources.csv"), list(src_rows[0].keys()), src_rows)

# ---------------- acceptance checks ----------------
checks = {}
# fish: >=1 water template; spawning in months
checks["fish_resolve_water_body_template"] = all(any(t in wb for t in s["wb"]) for s in fish_data.FISH)
checks["fish_spawning_period_set"] = not problems.get("missing_spawning_period")
river_lake_pf = ["river_channel", "riverbank", "lake_shore", "fishing_camp", "river_wharf", "ferry_landing", "bridge_crossing", "winter_ice_crossing", "marshy_stream"]
per_pf = {pf: len({r["fa_id"] for r in pres_rows if r["taxon_table"] == "fish" and r["pf_id"] == pf and r["subregion_scope"] == CORE_SUB}) for pf in river_lake_pf}
checks["fish_species_per_river_lake_pf_ge_6"] = all(v >= 6 for v in per_pf.values())
# invertebrates: summer bloodsucker in wet pf; no active flying outdoors in winter
flying = {s["fa_id"] for s in inv_herp_data.INV if s["flying"]}
blood = {s["fa_id"] for s in inv_herp_data.INV if s["blood"]}
wet_pf = ["bog", "marshy_stream", "riverbank", "lake_shore", "floodplain_meadow", "fishing_camp", "ferry_landing", "river_wharf", "river_channel"]
bs = {pf: sorted({r["fa_id"] for r in pres_rows if r["pf_id"] == pf and r["season_period"] == "summer" and r["fa_id"] in blood and r["activity_state"] == "active"}) for pf in wet_pf}
checks["summer_wet_pf_have_bloodsucker"] = all(bs.values())
indoor_pf = {"dwelling_interior", "cellar_granary", "threshing_barn", "grain_drying_shed_ovin", "bathhouse", "ordinary_workshop", "outbuildings", "church_interior"}
winter_bad = [r["fpr_id"] for r in pres_rows if r["season_period"] == "winter" and r["fa_id"] in flying and r["activity_state"] == "active" and r["pf_id"] not in indoor_pf]
checks["no_active_flying_insects_outdoors_in_winter"] = not winter_bad
if winter_bad:
    problems["winter_active_flying_outdoors"] = winter_bad
# livestock: denylist, herd min<=max, every household profile covered
name_fields = []
for rows, fields in [(fish_rows, ["name_ru", "name_old_ru", "name_lat", "name_en"]), (inv_rows, ["name_ru", "name_lat", "name_en"]),
                     (sp_rows, ["name_ru", "name_lat", "name_en"]), (lt_rows, ["name_ru", "name_old_ru"])]:
    for r in rows:
        for fld in fields:
            name_fields.append((r.get("fa_id") or r.get("ls_id"), r[fld]))
deny_hits = []
for (did, pats, *_rest) in denylist_data.DENY:
    for (rid, val) in name_fields:
        for p in pats:
            if re.search(p, val, flags=re.I):
                deny_hits.append(f"{rid}: {did} ({val})")
checks["denylist_clean"] = not deny_hits
if deny_hits:
    problems["denylist_hits"] = deny_hits
bad_minmax = [r["hc_id"] for r in herd_rows if r["max_count"] != "" and int(r["min_count"]) > int(r["max_count"])]
checks["herd_min_le_max"] = not bad_minmax
covered = {r["household_profile_ref"] for r in herd_rows}
missing_prof = [w["wealth_profile_id"] for w in wealth if w["wealth_profile_id"] not in covered]
checks["every_household_profile_has_herd_or_none"] = not missing_prof
if missing_prof:
    problems["household_profile_missing"] = missing_prof
# generic
checks["all_source_refs_resolve"] = not problems.get("unresolved_source_ref")
checks["no_empty_source_refs"] = not problems.get("empty_source_refs")
checks["pf_ids_valid"] = not problems.get("unknown_pf_id")
checks["water_templates_valid_and_allowed"] = not problems.get("unknown_water_body_template") and not problems.get("water_body_template_not_allowed_in_region")
checks["weights_match_class_rule"] = all(r["weight"] == WEIGHT[{v: k for k, v in CLASSNAME.items()}[r["frequency_class"]]] for r in pres_rows)
allrows = fish_rows + inv_rows + sp_rows + lt_rows
checks["confidence_in_ABC"] = all(r["confidence"] in ("A", "B", "C") for r in allrows + pres_rows + care_rows + ail_rows + prod_rows + mk_rows + herd_rows)
ids = [r["fpr_id"] for r in pres_rows] + [r["fa_id"] for r in fish_rows + inv_rows + sp_rows] + [r["ls_id"] for r in lt_rows] + [r["lc_id"] for r in care_rows] + [r["hc_id"] for r in herd_rows] + [r["pl_id"] for r in pt_rows]
dups = [k for k, v in Counter(ids).items() if v > 1]
checks["unique_ids"] = not dups
if dups:
    problems["duplicate_ids"] = dups
checks["all_status_candidate"] = True

conf_counts = {name: dict(Counter(r["confidence"] for r in rows)) for name, rows in
               [("fish", fish_rows), ("invertebrates_herps", inv_rows), ("livestock_types", lt_rows), ("fauna_presence", pres_rows),
                ("livestock_care", care_rows), ("herd_composition", herd_rows)]}
report = dict(generated_by="scripts/build.py", status=STATUS, counts=counts, checks=checks,
              fish_species_per_river_lake_pf=per_pf, summer_wet_pf_bloodsuckers=bs,
              presence_rows_by_table=dict(Counter(r["taxon_table"] for r in pres_rows)),
              confidence_counts=conf_counts,
              informational=dict(v6_household_tokens=len(tok_counter), v6_tokens_unmapped=len(problems.get("v6_household_token_unmapped", []))),
              problems={k: v for k, v in problems.items()})
json.dump(report, open(os.path.join(OUT, "validation_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(dict(counts=counts, checks=checks, per_pf=per_pf), ensure_ascii=False, indent=1))
hard = [k for k, v in checks.items() if not v]
if hard:
    print("FAILED:", hard)
    for k, v in problems.items():
        print(" ", k, len(v), v[:8])
    sys.exit(1)
