#!/usr/bin/env python3
"""Acceptance checks for group buildings-interiors-containers (catalog.json acceptance_ru of 6 domains).

Reads only the generated CSV/JSON of this group plus repo sources (WK, v5, v6, rus13tpl);
matcult/MASTER/sqlite ids are checked against the snapshot tables written by build.py
(interiors/matcult_item_refs.csv, sources.csv) and, when available, against the originals.
Exit code 1 on any ERROR. Prints counts and warnings.
"""
import csv, glob, json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GROUP = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(GROUP, "..", "..", "..", "..", ".."))
sys.path.insert(0, HERE)
import build  # noqa: E402  (paths + REFS)

ERR, WARN = [], []


def err(m): ERR.append(m)
def warn(m): WARN.append(m)


def rd(rel):
    with open(os.path.join(GROUP, rel), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sp(v):
    return [x for x in (v or "").split("|") if x]


# ---------------- reference universes ----------------
WK_DIR = os.path.join(REPO, "data/world-catalogs/novgorod/world-knowledge/production-v1")
wk_claims = set()
for f in glob.glob(os.path.join(WK_DIR, "*.json")):
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    if isinstance(d, dict):
        wk_claims |= {c["claim_ref"] for c in d.get("claims", []) if isinstance(c, dict) and "claim_ref" in c}
pf_ids = {f["id"] for f in json.load(open(os.path.join(WK_DIR, "place-first-cartography.json"), encoding="utf-8"))["environment_families"]}
V5 = os.path.join(REPO, "data/knowledge-source/imports/item-container-120-v5/candidate/tables")
v5 = {os.path.basename(f)[:-5]: {r.get("id") for r in json.load(open(f, encoding="utf-8")) if isinstance(r, dict)} for f in glob.glob(os.path.join(V5, "*.json"))}
rus = json.load(open(os.path.join(REPO, "tools/rus13-novgorod-regional-templates/novgorod_container_profiles_v1.json"), encoding="utf-8"))
rus_ids = {c["container_type_id"] for c in rus["container_profiles"]} | {r["rule_id"] for r in rus["container_content_resolution_rules"]}
v6 = build.read_csv(os.path.join(build.V6_TSV, "novgorod_g2_g4_70_cells_v6_g3_places.tsv"), "\t")
v6_types = {r["template_type_note"] for r in v6}
v6_ptpl = {r["place_template_id"] for r in v6}
mc_refs = {r["item_id"]: r for r in rd("interiors/matcult_item_refs.csv")}
mc_scenes = {r["source_scene_id"] for r in rd("interiors/scenes.csv") if r["source_scene_id"]}
sources = {r["ref"] for r in rd("sources.csv")}
aps = {r["ap_id"] for r in rd("interiors/anti_patterns_ref.csv")}
cp_ids = {r["cp_id"] for r in rd("containers/content_profiles.csv")}
try:
    mc_src = {r["source_id"] for r in build.read_csv(os.path.join(build.MATCULT_DIR, "sources.csv"))}
except Exception:
    mc_src = None
try:
    master_spawn = {r["profile_id"] for r in build.read_csv(os.path.join(build.MASTER_DIR, "normalized_source_tables/material_entities/spawn_profiles.csv"))}
    master_ws = {r["id"] for r in build.read_csv(os.path.join(build.MASTER_DIR, "normalized_source_tables/technology_processes/workshop_profiles.csv"))}
except Exception:
    master_spawn = master_ws = None
try:
    import sqlite3
    con = sqlite3.connect("file:" + build.NOV1230_DB + "?mode=ro", uri=True)
    nov_ids = set()
    for t in ("city_features", "ends", "streets", "institutions", "sources", "settlements", "territories", "persons_1230", "law"):
        nov_ids |= {r[0] for r in con.execute("select id from %s" % t)}
    nov_ids |= {"famine_prices"} | {"material_culture:" + r[0] for r in con.execute("select category from material_culture")} | {"material_culture:пояс"}
except Exception:
    nov_ids = None

tok_seen = collections.Counter()


def check_ref(tok, where):
    tok_seen[tok.split(":")[0]] += 1
    if tok.startswith("wk:claim:"):
        if tok[3:] not in wk_claims: err("%s: WK claim not found: %s" % (where, tok))
    elif tok.startswith("matcult_scene:"):
        if tok.split(":")[1] not in mc_scenes: err("%s: matcult scene not found: %s" % (where, tok))
    elif tok.startswith("matcult_src:"):
        if mc_src is not None and tok.split(":")[1] not in mc_src: err("%s: matcult source not found: %s" % (where, tok))
    elif tok == "matcult:anti_patterns.json":
        pass
    elif tok.startswith("matcult:"):
        i = tok.split(":")[1]
        if i not in mc_refs or mc_refs[i]["exists"] != "1": err("%s: matcult item not found: %s" % (where, tok))
    elif tok.startswith("master:spawn:"):
        if master_spawn is not None and tok.split(":")[2] not in master_spawn: err("%s: MASTER spawn not found: %s" % (where, tok))
    elif tok.startswith("master:workshop:"):
        if master_ws is not None and tok.split(":")[2] not in master_ws: err("%s: MASTER workshop not found: %s" % (where, tok))
    elif tok.startswith("nov1230db:"):
        i = tok.split(":", 1)[1]
        if nov_ids is not None and i not in nov_ids: err("%s: nov1230db id not found: %s" % (where, tok))
    elif tok.startswith("v5:"):
        parts = tok.split(":")
        if parts[1] not in v5: err("%s: v5 table not found: %s" % (where, tok))
        elif len(parts) > 2 and parts[2] not in v5[parts[1]]: err("%s: v5 id not found: %s" % (where, tok))
    elif tok.startswith("rus13tpl:container:"):
        if tok.split(":")[2] not in rus_ids: err("%s: rus13tpl id not found: %s" % (where, tok))
    elif tok.startswith("v6tsv:g3_places:"):
        if tok.split(":", 2)[2] not in v6_types: err("%s: v6 template type not found: %s" % (where, tok))
    elif tok.startswith("ref:"):
        if tok not in sources: err("%s: bibliography ref not in sources.csv: %s" % (where, tok))
    elif tok.startswith("authored_scene:"):
        if tok.split(":")[1] not in {r["sc_id"] for r in rd("interiors/scenes.csv")}: err("%s: authored scene not found: %s" % (where, tok))
    elif tok.startswith("content_profile:"):
        if tok.split(":", 1)[1] not in cp_ids: err("%s: content profile not found: %s" % (where, tok))
    elif tok.startswith("pr98:"):
        pass
    else:
        err("%s: unknown source token: %s" % (where, tok))


def check_refs(rows, cols, name, key):
    for r in rows:
        for c in cols:
            for t in sp(r.get(c)):
                check_ref(t, "%s[%s].%s" % (name, r[key], c))


CONF = {"A", "B", "C"}
DENY = re.compile(r"картоф|кукуруз|(?<!\w)томат|подсолн|табак|индейк|тяжелов|\bчай\b|кофе|сахар|огнестрел|порох|пищал|кирпичн\w* изб|стекольн|застеклённ\w* окн\w* изб", re.I)
NEG_COLS = {"anachronism_guard", "notes", "size_note", "reconstruction_note", "why_wrong", "use_instead", "title", "capacity_basis"}


def deny_scan(rows, name, key):
    for r in rows:
        for c, v in r.items():
            if c in NEG_COLS or not v:
                continue
            if DENY.search(v):
                err("%s[%s].%s: anachronism denylist hit: %s" % (name, r[key], c, DENY.search(v).group(0)))


# ================= buildings_structures =================
mats = rd("buildings/materials_vocab.csv"); mat_ids = {m["mat_id"] for m in mats}
bts = rd("buildings/building_types.csv"); bt_ids = {b["bt_id"] for b in bts}
bps = rd("buildings/building_parts.csv"); bp_ids = {b["bp_id"] for b in bps}
btp = rd("buildings/building_type_parts.csv")
check_refs(mats, ["source_refs"], "materials", "mat_id")
check_refs(bts, ["source_refs"], "building_types", "bt_id")
check_refs(bps, ["source_refs"], "building_parts", "bp_id")
check_refs(btp, ["size_source"], "building_type_parts", "bt_id")
for b in bts:
    if b["confidence"] not in CONF: err("bt %s bad confidence" % b["bt_id"])
    for pf in sp(b["pf_ids"]):
        if pf not in pf_ids: err("bt %s unknown pf %s" % (b["bt_id"], pf))
    for m in sp(b["materials"]):
        if m not in mat_ids: err("bt %s unknown material %s" % (b["bt_id"], m))
    for lo, hi in (("area_m2_min", "area_m2_max"), ("side_m_min", "side_m_max")):
        if b[lo] and b[hi] and float(b[lo]) > float(b[hi]): err("bt %s %s>%s" % (b["bt_id"], lo, hi))
    if b["fire_risk"] not in ("high", "medium", "low"): err("bt %s fire_risk" % b["bt_id"])
    if not b["source_refs"]: err("bt %s no source_refs" % b["bt_id"])
for b in bps:
    if b["default_material"] not in mat_ids: err("part %s unknown material" % b["bp_id"])
btp_by_bt = collections.defaultdict(list)
for p in btp:
    btp_by_bt[p["bt_id"]].append(p)
    if p["bt_id"] not in bt_ids: err("bt_parts unknown bt %s" % p["bt_id"])
    if p["bp_id"] not in bp_ids: err("bt_parts %s unknown part %s" % (p["bt_id"], p["bp_id"]))
    if p["material"] not in mat_ids: err("bt_parts %s/%s material %s not in materials_vocab" % (p["bt_id"], p["bp_id"], p["material"]))
    if p["size_min"] and p["size_max"] and float(p["size_min"]) > float(p["size_max"]): err("bt_parts %s/%s size_min>size_max" % (p["bt_id"], p["bp_id"]))
for b in bts:
    if b["bt_id"] not in btp_by_bt: err("bt %s has no parts" % b["bt_id"])
# anachronism rules on structure
glass_ok = {"bt_horomy", "bt_church_stone"}
for p in btp:
    if p["bp_id"] == "bp_window_glazed" and p["bt_id"] not in glass_ok: err("glazed window on %s" % p["bt_id"])
    if p["material"] == "mat_plinfa" and p["bt_id"] not in ("bt_church_stone", "bt_stone_civil_building", "bt_building_site_stone"): err("plinfa used in %s" % p["bt_id"])
for b in bts:
    if b["bt_class"] == "dwelling" and "нет дымохода" not in b["anachronism_guard"] and "нет кирпичной трубы/дымохода" not in b["anachronism_guard"]:
        warn("dwelling %s has no explicit chimney guard" % b["bt_id"])
deny_scan(bts, "building_types", "bt_id"); deny_scan(bps, "building_parts", "bp_id")
RES_ECON_PF = ["dwelling_interior", "town_courtyard", "peasant_homestead", "outbuildings", "cellar_granary", "bathhouse", "smithy", "mill", "threshing_barn",
               "grain_drying_shed_ovin", "ordinary_workshop", "church_interior", "churchyard", "monastery_yard", "river_wharf", "market_square", "fishing_camp",
               "town_street", "town_wall_edge", "bridge_crossing", "ferry_landing", "village_lane"]
pf_bt = collections.defaultdict(set)
for b in bts:
    for pf in sp(b["pf_ids"]): pf_bt[pf].add(b["bt_id"])
for pf in RES_ECON_PF:
    if not pf_bt[pf]: err("residential/economic pf %s has no building type" % pf)

# ================= settlement_form =================
sfs = rd("buildings/settlement_form.csv"); sf_ids = {s["sf_id"] for s in sfs}
mix = rd("buildings/settlement_building_mix.csv")
check_refs(sfs, ["source_refs"], "settlement_form", "sf_id"); check_refs(mix, ["basis_ref"], "settlement_mix", "sf_id")
rng = re.compile(r"(\d+)\s*[-–]\s*(\d+)|(?<![\d%])(\d+)(?![\d%\-–])")
for s in sfs:
    for pf in sp(s["pf_ids"]):
        if pf not in pf_ids: err("sf %s unknown pf %s" % (s["sf_id"], pf))
    if not sp(s["place_template_ids"]): err("sf %s not linked to place_template" % s["sf_id"])
    for t in sp(s["place_template_ids"]):
        if t not in v6_ptpl: err("sf %s place_template %s not in v6" % (s["sf_id"], t))
    for f in sp(s["fence_types"]) + sp(s["street_elements"]):
        if f not in bt_ids: err("sf %s element %s not a bt" % (s["sf_id"], f))
    if s["v6_template_type"] and int(s["v6_g3_count"] or 0) == 0: err("sf %s v6 type has 0 rows" % s["sf_id"])
for m in mix:
    if m["member_id"] not in bt_ids and m["member_id"] not in sf_ids: err("mix %s member %s unknown" % (m["sf_id"], m["member_id"]))
    if m["count_max"] and int(m["count_min"]) > int(m["count_max"]): err("mix %s/%s min>max" % (m["sf_id"], m["member_id"]))
# count_rule vs v6 household_mix: yard-member totals must lie inside the summed ranges of the v6 mix text (only percentages-free texts)
mix_by_sf = collections.defaultdict(list)
for m in mix: mix_by_sf[m["sf_id"]].append(m)
for s in sfs:
    if not s["v6_template_type"] or "%" in s["v6_household_mix"]:
        continue
    texts = s["v6_household_mix"].split("; ")
    yard = [m for m in mix_by_sf[s["sf_id"]] if m["member_id"].startswith("sf_yard") or m["member_id"] in ("bt_izba_heated_single",)]
    if not yard or len(set(texts)) != 1:
        continue
    lo = hi = 0
    t0 = re.sub(r"(?<!\w)(один|одна)(?!\w)", "1", texts[0])
    for a, b, c in rng.findall(t0):
        if a: lo += int(a); hi += int(b)
        elif c: lo += int(c); hi += int(c)
    ymin = sum(int(m["count_min"]) for m in yard); ymax = sum(int(m["count_max"] or 10**6) for m in yard)
    if lo == hi == 0:
        continue
    if not (ymin >= lo and ymax <= hi):
        err("sf %s yard counts %d-%d outside v6 household_mix %d-%d (%s)" % (s["sf_id"], ymin, ymax, lo, hi, texts[0]))

# ================= interiors_scenes =================
scs = rd("interiors/scenes.csv"); items = rd("interiors/scene_items.csv")
check_refs(scs, ["source_refs", "ambience_refs"], "scenes", "sc_id")
if len(mc_scenes) != 66: err("expected 66 matcult scenes, got %d" % len(mc_scenes))
for s in scs:
    req, fb = set(sp(s["required_items"])), set(sp(s["forbidden_items"]))
    if req & fb: err("scene %s required∩forbidden: %s" % (s["sc_id"], req & fb))
    if s["scene_kind"] != "character_kit" and not s["pf_ids"]: err("scene %s no pf" % s["sc_id"])
    for pf in sp(s["pf_ids"]):
        if pf not in pf_ids: err("scene %s unknown pf %s" % (s["sc_id"], pf))
    for b in sp(s["bt_ids"]):
        if b not in bt_ids: err("scene %s unknown bt %s" % (s["sc_id"], b))
    if s["confidence"] not in CONF: warn("scene %s confidence %s" % (s["sc_id"], s["confidence"]))
for it in items:
    if it["resolves_to"] == "UNRESOLVED": err("scene item unresolved %s in %s" % (it["item_ref"], it["sc_id"]))
    if it["role"] == "required" and it["generation_policy"] == "research_only": warn("scene %s requires research_only item %s" % (it["sc_id"], it["item_ref"]))
INTERIOR_PF = ["dwelling_interior", "church_interior", "ordinary_workshop", "cellar_granary", "bathhouse", "smithy", "outbuildings", "threshing_barn", "grain_drying_shed_ovin", "mill"]
pf_sc = collections.Counter()
for s in scs:
    for pf in sp(s["pf_ids"]): pf_sc[pf] += 1
for pf in INTERIOR_PF:
    if pf_sc[pf] == 0: err("interior pf %s has no scene" % pf)
deny_scan(scs, "scenes", "sc_id")

# ================= containers_contents =================
cats = {c["content_category"]: c for c in rd("containers/content_categories.csv")}
cts = {c["ct_id"]: c for c in rd("containers/container_forms.csv")}
cps = rd("containers/content_profiles.csv"); ces = rd("containers/content_profile_entries.csv")
pcs = rd("containers/place_containers.csv"); xw = rd("containers/item_to_container_crosswalk.csv")
check_refs(list(cts.values()), ["source_refs"], "container_forms", "ct_id")
check_refs(cps, ["source_refs"], "content_profiles", "cp_id"); check_refs(ces, ["basis_ref"], "content_entries", "cp_id")
check_refs(pcs, ["basis_ref"], "place_containers", "ct_id")
uc = {r["id"] for r in json.load(open(os.path.join(V5, "universal_categories.json"), encoding="utf-8"))}
for c in cts.values():
    if c["v5_category"] and c["v5_category"] not in uc: err("ct %s v5 category missing" % c["ct_id"])
    if c["rus13_ref"] and c["rus13_ref"] not in rus_ids: err("ct %s rus13 ref missing" % c["ct_id"])
    for k in sp(c["compatible"]) + sp(c["forbidden_content"]):
        if k not in cats: err("ct %s unknown content category %s" % (c["ct_id"], k))
    if set(sp(c["compatible"])) & set(sp(c["forbidden_content"])): err("ct %s compatible∩forbidden" % c["ct_id"])
    if c["matcult"] and c["matcult"] not in mc_refs: err("ct %s matcult id missing" % c["ct_id"])
# v5 relation consistency for forms with a v5 twin
rel = json.load(open(os.path.join(V5, "container_content_category_relations.json"), encoding="utf-8"))
v5rel = collections.defaultdict(dict)
for r in rel: v5rel[r["container_category_id"]][r["content_category_id"]] = r["compatibility"]
cp_by = {p["cp_id"]: p for p in cps}
for p in cps:
    if p["ct_id"] not in cts: err("cp %s unknown ct" % p["cp_id"])
    for pf in sp(p["pf_ids"]):
        if pf != "*" and pf not in pf_ids: err("cp %s unknown pf %s" % (p["cp_id"], pf))
    for b in sp(p["bt_ids"]):
        if b not in bt_ids: err("cp %s unknown bt %s" % (p["cp_id"], b))
for e in ces:
    p = cp_by[e["cp_id"]]; c = cts[p["ct_id"]]
    if e["content_category"] not in cats: err("entry %s unknown category %s" % (e["cp_id"], e["content_category"]))
    if e["content_category"] not in sp(c["compatible"]): err("entry %s category %s not compatible with %s" % (e["cp_id"], e["content_category"], c["ct_id"]))
    if e["content_category"] in sp(c["forbidden_content"]): err("entry %s category %s forbidden in %s" % (e["cp_id"], e["content_category"], c["ct_id"]))
    if c["v5_category"] and v5rel[c["v5_category"]].get(e["content_category"]) == "forbidden": err("entry %s: v5 forbids %s in %s" % (e["cp_id"], e["content_category"], c["v5_category"]))
    if int(e["qty_min_slots"]) > int(e["qty_max_slots"]): err("entry %s qty min>max" % e["cp_id"])
    if int(e["qty_max_slots"]) > int(c["capacity_slots"]): err("entry %s qty %s > capacity %s of %s" % (e["cp_id"], e["qty_max_slots"], c["capacity_slots"], c["ct_id"]))
    if e["frequency_class"] not in build.FREQ_WEIGHT or int(e["weight"]) != build.FREQ_WEIGHT[e["frequency_class"]]: err("entry %s bad freq/weight" % e["cp_id"])
    for x in sp(e["example_items"]):
        if x not in mc_refs or mc_refs[x]["exists"] != "1": err("entry %s example item %s unresolved" % (e["cp_id"], x))
prof_ct = {p["ct_id"] for p in cps}
scene_ct = set()
xmap = {x["item_id"]: x["ct_id"] for x in xw}
for it in items:
    if it["item_ref"] in xmap and it["role"] != "forbidden": scene_ct.add(xmap[it["item_ref"]])
for ct in scene_ct | {p["ct_id"] for p in pcs}:
    if ct not in prof_ct: err("container %s (in scenes/place_containers) has no content profile" % ct)
for ct in cts:
    if ct not in prof_ct: warn("container form %s has no content profile" % ct)

# ================= city_landmarks_institutions =================
lms = rd("landmarks/landmarks.csv")
check_refs(lms, ["source_refs"], "landmarks", "lm_id")
yr = re.compile(r"(1[0-4]\d\d)")
for l in lms:
    if not l["status_1230"]: err("landmark %s no status_1230" % l["lm_id"])
    if not l["source_refs"]: err("landmark %s no source_refs" % l["lm_id"])
    ys = [int(y) for y in yr.findall(l["founded_or_built"])]
    if ys and min(ys) > 1250: err("landmark %s built after 1250 (%s)" % (l["lm_id"], l["founded_or_built"]))
    if not l["v6_name_match"] and l["category"] not in ("institution", "building_type_ref", "infrastructure"): warn("landmark %s name not in v6 naming_register (new, sourced)" % l["lm_id"])
# ================= settlement_ambience_texts =================
amb = rd("ambience/settlement_ambience_texts.csv"); tokens = {t["token"] for t in rd("ambience/presence_tokens.csv")}
check_refs(amb, ["source_refs"], "ambience", "sat_id"); check_refs(rd("ambience/presence_tokens.csv"), ["source_refs"], "presence_tokens", "token")
for a in amb:
    if a["pf_id"] not in pf_ids: err("ambience %s unknown pf" % a["sat_id"])
    if not a["requires_presence_ref"]: err("ambience %s no requires_presence_ref" % a["sat_id"])
    for r in sp(a["requires_presence_ref"]):
        if r not in bt_ids and r not in tokens: err("ambience %s presence ref %s unknown" % (a["sat_id"], r))
    if not a["clear_text"] or not a["partial_text"]: err("ambience %s missing text" % a["sat_id"])
deny_scan(amb, "ambience", "sat_id")
by_pf = collections.defaultdict(lambda: (set(), set()))
for a in amb:
    by_pf[a["pf_id"]][0].add(a["season_period"]); by_pf[a["pf_id"]][1].add(a["layer"])
for g in rd("ambience/g4_human_layer_binding.csv"):
    seasons, layers = set(), set()
    for pf in sp(g["pf_ids"]):
        seasons |= by_pf[pf][0]; layers |= by_pf[pf][1]
    if len(seasons) < 4 or len(layers) < 3: err("G4 %s: seasons %d layers %d" % (g["g4_ref"], len(seasons), len(layers)))
# seasonal coverage per (pf,layer)
pl = collections.defaultdict(set)
for a in amb: pl[(a["pf_id"], a["layer"])].add(a["season_period"])
for k, v in pl.items():
    if len(v) < 4: warn("ambience %s/%s only %d seasons" % (k[0], k[1], len(v)))

# ---------------- report ----------------
print("counts:", json.dumps({"building_types": len(bts), "building_parts": len(bps), "bt_parts": len(btp), "materials": len(mats), "settlement_forms": len(sfs),
                             "settlement_mix": len(mix), "scenes": len(scs), "scene_items": len(items), "container_forms": len(cts), "content_profiles": len(cps),
                             "content_entries": len(ces), "place_containers": len(pcs), "landmarks": len(lms), "ambience_texts": len(amb)}, ensure_ascii=False))
print("source tokens checked:", dict(tok_seen))
print("universes: wk_claims=%d pf=%d matcult_refs=%d nov1230db=%s master_spawn=%s" % (len(wk_claims), len(pf_ids), len(mc_refs), "n/a" if nov_ids is None else len(nov_ids), "n/a" if master_spawn is None else len(master_spawn)))
for w in WARN: print("WARN", w)
for e in ERR: print("ERROR", e)
print("RESULT:", "FAIL" if ERR else "PASS", "errors=%d warnings=%d" % (len(ERR), len(WARN)))
sys.exit(1 if ERR else 0)
