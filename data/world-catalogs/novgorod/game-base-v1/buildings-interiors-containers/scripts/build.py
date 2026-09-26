#!/usr/bin/env python3
"""Build candidate tables for group buildings-interiors-containers (game-base-v1).

Deterministic: reads authored sources in scripts/src/*.py and the listed upstream sources,
writes CSV/JSON into buildings/ interiors/ containers/ landmarks/ ambience/ and prints counts.

External (non-repo) inputs, overridable by env:
  MATCULT_DIR  unpacked Novgorod1230_material_culture_dataset_v1/data (catalog_items.csv, anti_patterns.json)
  MASTER_DIR   unpacked Novgorod1230_MASTER_ARCHIVE_v1/data
  NOV1230_DB   C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite
Repo inputs are resolved from the worktree root (5 levels up from this group folder).
"""
import csv, json, os, re, sqlite3, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GROUP = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(GROUP, "..", "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "src"))

SCRATCH = "C:/Users/Slaven/AppData/Local/Temp/claude/C--Users-Slaven-Documents-Novgorod/ff9acd1f-6ccd-44a9-bc42-216c6bc662b8/scratchpad/zips"
MATCULT_DIR = os.environ.get("MATCULT_DIR", SCRATCH + "/Novgorod1230_material_culture_dataset_v1/Novgorod1230_material_culture_dataset_v1/data")
MASTER_DIR = os.environ.get("MASTER_DIR", SCRATCH + "/Novgorod1230_MASTER_ARCHIVE_v1/Novgorod1230_MASTER_ARCHIVE_v1/data")
NOV1230_DB = os.environ.get("NOV1230_DB", "C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite")
SCENES_CSV = os.path.join(REPO, "data/world-catalogs/novgorod/sources/material-culture-scenes-v1/data/scenes.csv")
V6_TSV = os.path.join(REPO, "DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv")

FREQ_WEIGHT = {"ubiquitous": 8, "common": 4, "contextual": 2, "rare": 1}
STATUS = "candidate"

import materials, buildings, parts, settlement, containers, content_profiles, scenes_map, ambience  # noqa: E402

# Bibliography for ref:* tokens (new research / secondary sources).
REFS = [
    ("ref:arhitekto_2russ27", "Городские постройки древнего Новгорода (Архитектура Древней Руси)", "https://www.arhitekto.ru/txt/2russ27.shtml", "B", "Размеры жилищ 4–9 м, угловые печи в домах 20–40 м², ширина мостовых 3,5–5 м (главные до 8 м), водостоки, хоромы."),
    ("ref:dissercat_ljudin", "Постройки Людина конца средневекового Новгорода: по материалам Троицких I–XI раскопов (дисс., аннотация)", "https://www.dissercat.com/content/postroiki-lyudina-kontsa-srednevekovogo-novgoroda", "B", "Пятистенки с XI в.; подклеты конец XII – начало XIII в.; четырёхстенные ~12% в XIII в."),
    ("ref:rsl_zasurcev_search", "Засурцев П.И. Усадьбы и постройки древнего Новгорода (МИА 123, 1963; автореферат РГБ) — факты по сводке поиска", "https://search.rsl.ru/ru/record/01006192370", "B", "~95% печей Неревского раскопа в углу; пятистенки — основные владельческие постройки до сер. XIII в. Первоисточник не прочитан (нужен OCR) — перепроверить."),
    ("ref:wiki_banya", "Баня — Википедия (раздел об археологии Троицкого раскопа)", "https://ru.wikipedia.org/wiki/%D0%91%D0%B0%D0%BD%D1%8F", "B", "Типы бань конца X–XI в.: пятистенные, однокамерные чёрные, с предбанником."),
    ("ref:pravenc_zhalnik", "Жальник — Православная энциклопедия", "https://www.pravenc.ru/text/182191.html", "B", "Грунтовые могилы с каменной обкладкой; XII – конец XV в.; зона земледельческой колонизации Новгородской земли."),
    ("ref:dissercat_zhalniki", "Погребальные памятники земли словен новгородских (курганы и жальники XI–XIV вв.) (дисс., аннотация)", "https://www.dissercat.com/content/pogrebalnye-pamyatniki-zemli-sloven-novgorodskikh-kurgany-i-zhalniki-xi-xiv-vv", "B", ""),
    ("ref:novgorodmuseum_khutyn", "Варлаамо-Хутынский Спасо-Преображенский монастырь — Новгородский музей-заповедник", "https://novgorodmuseum.ru/muzei/varlaamo-hutynskij-spaso-preobrazhenskij-monastyr", "B", "Основан 1192 г. Варлаамом; деревянный, затем каменный храм Спаса, освящён 1192 г."),
]


def jl(x):
    return "|".join(x) if isinstance(x, (list, tuple)) else ("" if x is None else str(x))


def write_csv(path, rows, cols):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="raise")
        w.writeheader()
        for r in rows:
            w.writerow({c: jl(r.get(c, "")) for c in cols})
    return len(rows)


def read_csv(path, delim=","):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=delim))


COUNTS = collections.OrderedDict()


REFD = set()
_TOK = re.compile(r"matcult:([A-Z]{3}\d{4})")
_BARE = {"required_items", "allowed_items", "furniture", "matcult", "example_items", "item_id", "item_ref"}
_ID = re.compile(r"^[A-Z]{3}\d{4}$")


def out(rel, rows, cols):
    for r in rows:
        for k, v in r.items():
            vals = v if isinstance(v, (list, tuple)) else [v]
            for x in vals:
                if isinstance(x, str):
                    REFD.update(_TOK.findall(x))
                    if k in _BARE:
                        REFD.update(y for y in x.split("|") if _ID.match(y))
    COUNTS[rel] = write_csv(os.path.join(GROUP, rel), rows, cols)


def cap_band(slots):
    s = int(slots)
    return "tiny" if s <= 2 else "small" if s <= 4 else "medium" if s <= 12 else "large" if s <= 24 else "bulk"


def main():
    matcult = {r["item_id"]: r for r in read_csv(os.path.join(MATCULT_DIR, "catalog_items.csv"))}
    antip = {a["anti_id"]: a for a in json.load(open(os.path.join(MATCULT_DIR, "anti_patterns.json"), encoding="utf-8"))}
    scenes = read_csv(SCENES_CSV)
    spawn = read_csv(os.path.join(MASTER_DIR, "normalized_source_tables/material_entities/spawn_profiles.csv"))

    # ---------------- buildings ----------------
    out("buildings/materials_vocab.csv",
        [dict(mat_id=m[0], name_ru=m[1], name_en=m[2], material_class=m[3], source_refs=m[4], confidence=m[5], note=m[6], status=STATUS) for m in materials.MATERIALS],
        ["mat_id", "name_ru", "name_en", "material_class", "source_refs", "confidence", "note", "status"])
    bt_cols = ["bt_id", "name_ru", "name_en", "bt_class", "region_id", "pf_ids", "rooms", "storeys", "area_m2_min", "area_m2_max", "side_m_min", "side_m_max",
               "size_note", "materials", "condition_states", "age_states", "fire_risk", "occupants_roles", "light_smoke_smell", "anachronism_guard",
               "source_refs", "confidence", "status", "notes"]
    out("buildings/building_types.csv", [dict(b, status=STATUS) for b in buildings.BUILDING_TYPES], bt_cols)
    out("buildings/building_parts.csv",
        [dict(bp_id=p[0], name_ru=p[1], name_en=p[2], part_class=p[3], default_material=p[4], restriction=p[5], source_refs=p[6], confidence=p[7], status=STATUS) for p in parts.PARTS],
        ["bp_id", "name_ru", "name_en", "part_class", "default_material", "restriction", "source_refs", "confidence", "status"])
    btp = []
    for bt_id, plist in parts.BT_PARTS.items():
        for i, p in enumerate(plist, 1):
            btp.append(dict(bt_id=bt_id, seq=i, bp_id=p[0], material=p[1], size_min=p[2], size_max=p[3], size_unit=p[4], count_rule=p[5], required=p[6], size_source=p[7], status=STATUS))
    out("buildings/building_type_parts.csv", btp, ["bt_id", "seq", "bp_id", "material", "size_min", "size_max", "size_unit", "count_rule", "required", "size_source", "status"])

    # settlement forms (+ v6 household text imported)
    v6 = read_csv(os.path.join(V6_TSV, "novgorod_g2_g4_70_cells_v6_g3_places.tsv"), "\t")
    v6_by_type = collections.defaultdict(list)
    for r in v6:
        v6_by_type[r["template_type_note"]].append(r)
    sf_rows, mix_rows = [], []
    for s in settlement.SETTLEMENT_FORMS:
        est = mixt = ptpl = ""
        n = 0
        if s["v6_template_type"]:
            rows = v6_by_type.get(s["v6_template_type"], [])
            n = len(rows)
            est = "; ".join(sorted({r["household_estimate"] for r in rows}))
            mixt = "; ".join(sorted({r["household_mix"] for r in rows}))
            ptpl = "|".join(sorted({r["place_template_id"] for r in rows}))
        row = {k: v for k, v in s.items() if k != "mix"}
        row.update(v6_g3_count=n, v6_household_estimate=est, v6_household_mix=mixt, v6_place_template_ids=ptpl, place_template_ids=settlement.PLACE_TEMPLATES.get(s["sf_id"], ""), status=STATUS)
        sf_rows.append(row)
        for m in s["mix"]:
            mix_rows.append(dict(sf_id=s["sf_id"], member_id=m[0], count_min=m[1], count_max="" if m[2] is None else m[2], count_rule=m[3], basis_ref=m[4], status=STATUS))
    out("buildings/settlement_form.csv", sf_rows,
        ["sf_id", "name_ru", "level", "settlement_kind", "region_id", "pf_ids", "place_template_ids", "v6_template_type", "v6_g3_count", "v6_place_template_ids", "v6_household_estimate", "v6_household_mix",
         "area_m2_min", "area_m2_max", "yard_layout", "street_elements", "fence_types", "source_refs", "confidence", "status", "notes"])
    out("buildings/settlement_building_mix.csv", mix_rows, ["sf_id", "member_id", "count_min", "count_max", "count_rule", "basis_ref", "status"])

    # ---------------- interiors ----------------
    sc_rows, item_rows = [], []
    def split(v):
        return [x.strip() for x in v.split("|") if x.strip()]
    for s in scenes:
        sid = s["scene_id"]
        kind, pf, bt = scenes_map.SCENE_MAP[sid]
        amb = scenes_map.AMBIENCE.get(s["scene_type"], ("", "", "", "", ""))
        req, alw, fb = split(s["required_item_ids"]), split(s["allowed_item_ids"]), split(s["forbidden_item_ids"])
        furn = [i for i in req + alw if i[:3] in ("FUR", "INT")]
        sc_rows.append(dict(sc_id="sc_" + sid.lower(), source_scene_id=sid, name_ru=s["name_ru"], scene_type=s["scene_type"], scene_kind=kind, pf_ids=pf, bt_ids=bt,
                            location_scope=s["location_scope"], required_items=req, allowed_items=alw, forbidden_items=fb, furniture=furn,
                            quantity_rules=s["object_counts"], placement_rules=s["layout_rules"], condition=s["condition_ru"], season_variants=s["season_variants"],
                            light=amb[0], smoke=amb[1], smell=amb[2], sound=amb[3], ambience_refs=amb[4],
                            source_refs=["matcult_scene:" + sid] + ["matcult_src:" + x for x in split(s["source_ids"])], confidence=s["confidence"], status=STATUS))
        for role, ids in (("required", req), ("allowed", alw), ("forbidden", fb)):
            for i in ids:
                m = matcult.get(i)
                a = antip.get(i)
                fc = {"required": "ubiquitous", "allowed": "contextual", "forbidden": ""}[role]
                item_rows.append(dict(sc_id="sc_" + sid.lower(), role=role, item_ref=i,
                                      resolves_to="matcult_item" if m else "anti_pattern" if a else "UNRESOLVED",
                                      name_ru=(m or {}).get("name_ru") or (a or {}).get("title", ""), category=(m or {}).get("category", ""),
                                      historical_confidence=(m or {}).get("historical_confidence", ""), generation_policy=(m or {}).get("generation_policy", ""),
                                      frequency_class=fc, weight=FREQ_WEIGHT.get(fc, ""), status=STATUS))
    for x in scenes_map.EXTRA_SCENES:
        req, alw, fb = split(x["required"]), split(x["allowed"]), split(x["forbidden"])
        sc_rows.append(dict(sc_id=x["sc_id"], source_scene_id="", name_ru=x["name_ru"], scene_type="authored", scene_kind=x["scene_kind"], pf_ids=x["pf_ids"], bt_ids=x["bt_ids"],
                            location_scope="", required_items=req, allowed_items=alw, forbidden_items=fb, furniture=[i for i in req + alw if i[:3] in ("FUR", "INT")],
                            quantity_rules=x["quantity_rules"], placement_rules=x["placement_rules"], condition=x["condition"], season_variants="",
                            light=x["light"], smoke=x["smoke"], smell=x["smell"], sound=x["sound"], ambience_refs=x["source_refs"],
                            source_refs=x["source_refs"], confidence=x["confidence"], status=STATUS))
        for role, ids in (("required", req), ("allowed", alw), ("forbidden", fb)):
            for i in ids:
                m = matcult.get(i); a = antip.get(i)
                fc = {"required": "ubiquitous", "allowed": "contextual", "forbidden": ""}[role]
                item_rows.append(dict(sc_id=x["sc_id"], role=role, item_ref=i, resolves_to="matcult_item" if m else "anti_pattern" if a else "UNRESOLVED",
                                      name_ru=(m or {}).get("name_ru") or (a or {}).get("title", ""), category=(m or {}).get("category", ""),
                                      historical_confidence=(m or {}).get("historical_confidence", ""), generation_policy=(m or {}).get("generation_policy", ""),
                                      frequency_class=fc, weight=FREQ_WEIGHT.get(fc, ""), status=STATUS))
    out("interiors/scenes.csv", sc_rows,
        ["sc_id", "source_scene_id", "name_ru", "scene_type", "scene_kind", "pf_ids", "bt_ids", "location_scope", "required_items", "allowed_items", "forbidden_items", "furniture",
         "quantity_rules", "placement_rules", "condition", "season_variants", "light", "smoke", "smell", "sound", "ambience_refs", "source_refs", "confidence", "status"])
    out("interiors/scene_items.csv", item_rows,
        ["sc_id", "role", "item_ref", "resolves_to", "name_ru", "category", "historical_confidence", "generation_policy", "frequency_class", "weight", "status"])
    used_ap = sorted({r["item_ref"] for r in item_rows if r["resolves_to"] == "anti_pattern"})
    out("interiors/anti_patterns_ref.csv",
        [dict(ap_id=k, title=antip[k]["title"], why_wrong=antip[k]["why_wrong"], use_instead=antip[k]["use_instead"], risk_level=antip[k]["risk_level"], applies_to=antip[k]["applies_to"], source_refs="matcult:anti_patterns.json") for k in sorted(antip)],
        ["ap_id", "title", "why_wrong", "use_instead", "risk_level", "applies_to", "source_refs"])
    # furniture / fixtures / light catalogue: import of all matcult FUR* and INT* items + dating notes
    FURN_NOTES = {
        "INT0005": "«красный угол» как термин и диагональная планировка печь/угол — поздняя этнография; для 1230 г. допустима лишь домашняя молельная зона (икона/крест на полке у стены), C. Не ставить киот и божницу XIX в.",
        "INT0006": "курная топка без кирпичного дымохода — норма; трубы нет",
        "INT0025": "стекло только в элитном/церковном окне; не в рядовой избе",
        "INT0043": "развитая русская печь позднего типа недопустима",
        "FUR0016": "кресло со спинкой — только элита и только по конкретному референсу",
        "FUR0019": "высокая кровать — прямое новгородское подтверждение ограничено; норма — настил/лавка",
    }
    furn = [dict(item_id=k, name_ru=v["name_ru"], category=v["category"], subcategory=v.get("subcategory", ""), materials=v["materials"], dimensions=v["dimensions"],
                 historical_confidence=v["historical_confidence"], generation_policy=v["generation_policy"], who_used=v.get("who_used", ""), where_used=v.get("where_used", ""),
                 dating_note=FURN_NOTES.get(k, ""), source_refs="matcult:" + k, status=STATUS)
            for k, v in sorted(matcult.items()) if k[:3] in ("FUR", "INT")]
    out("interiors/furniture_fixtures_light.csv", furn, ["item_id", "name_ru", "category", "subcategory", "materials", "dimensions", "historical_confidence", "generation_policy",
                                                         "who_used", "where_used", "dating_note", "source_refs", "status"])

    # ---------------- containers ----------------
    out("containers/content_categories.csv", [dict(content_category=c[0], name_ru=c[1], origin=c[2], status=STATUS) for c in containers.CONTENT_CATEGORIES],
        ["content_category", "name_ru", "origin", "status"])
    ct_rows = []
    for c in containers.CONTAINERS:
        ct_rows.append(dict(c, capacity_band=cap_band(c["capacity_slots"]), status=STATUS))
    out("containers/container_forms.csv", ct_rows,
        ["ct_id", "name_ru", "name_en", "container_class", "matcult", "v5_category", "rus13_ref", "capacity_slots", "capacity_band", "capacity_basis", "closure", "lock", "portability",
         "compatible", "forbidden_content", "source_refs", "confidence", "status", "notes"])
    cp_rows, ce_rows = [], []
    for p in content_profiles.PROFILES:
        cp_rows.append(dict(cp_id=p["cp_id"], ct_id=p["ct_id"], pf_ids=p["pf_ids"], bt_ids=p["bt_ids"], empty_allowed=p["empty_allowed"],
                            first_open_rule="containers/first_open_rule.json#d3_first_open_v1", source_refs=p["source_refs"], confidence=p["confidence"], status=STATUS))
        for i, e in enumerate(p["entries"], 1):
            ce_rows.append(dict(cp_id=p["cp_id"], seq=i, content_category=e[0], frequency_class=e[1], weight=FREQ_WEIGHT[e[1]], qty_min_slots=e[2], qty_max_slots=e[3],
                                example_items=e[4], basis_ref=e[5], status=STATUS))
    out("containers/content_profiles.csv", cp_rows, ["cp_id", "ct_id", "pf_ids", "bt_ids", "empty_allowed", "first_open_rule", "source_refs", "confidence", "status"])
    out("containers/content_profile_entries.csv", ce_rows,
        ["cp_id", "seq", "content_category", "frequency_class", "weight", "qty_min_slots", "qty_max_slots", "example_items", "basis_ref", "status"])

    # place_containers: derived from scenes (required->ubiquitous, allowed->contextual) and MASTER spawn profiles (existing ids -> contextual)
    item2ct = {}
    for c in containers.CONTAINERS:
        if c["matcult"]:
            item2ct[c["matcult"]] = c["ct_id"]
    item2ct.update({"TRD0023": "ct_barrel_cargo", "TRD0044": "ct_kad", "FOD0059": "ct_kad", "CON0004": "ct_bucket_staved", "CON0005": "ct_basket_woven",
                    "TRD0022": "ct_tues", "TRD0027": "ct_bale_wrapped", "TRD0053": "ct_bale_wrapped", "TRD0052": "ct_bale_wrapped", "FUR0023": "ct_grain_bin",
                    "POT0025": "ct_kad", "HOU0037": "ct_knife_sheath", "WPN0069": "ct_knife_sheath", "MIL0017": "ct_knife_sheath", "AGR0002": "ct_feed_manger",
                    "INT0013": "ct_shelf_storage", "FUR0007": "ct_shelf_storage", "FUR0014": "ct_shelf_storage", "TRD0036": "ct_shelf_storage", "FUR0025": "ct_shelf_storage",
                    "MSC0024": "ct_woodpile", "CRF0039": "ct_kad", "CRF0110": "ct_kad", "LTR0030": "ct_cart_body", "MSC0042": "ct_sack_cloth", "MSC0018": "ct_barrel_oak",
                    "FOD0052": "ct_sack_grain", "TRD0009": "ct_sack_grain", "TRD0025": "ct_sack_grain", "TRD0005": "ct_barrel_cargo", "TRD0047": "ct_barrel_cargo", "TRD0048": "ct_barrel_cargo",
                    "FOD0049": "ct_pot_cooking", "TRD0004": "ct_sack_cloth"})
    arch2pf = {"urban_house": "dwelling_interior", "poor_house": "dwelling_interior", "wealthy_house": "dwelling_interior", "hearth": "dwelling_interior", "scribe_area": "dwelling_interior",
               "storehouse": "cellar_granary", "cellar": "cellar_granary", "yard": "town_courtyard", "street": "town_street", "torg": "market_square", "forge": "smithy",
               "workshop": "ordinary_workshop", "leather_workshop": "ordinary_workshop", "pottery_workshop": "ordinary_workshop", "textile_work_area": "ordinary_workshop",
               "stable": "outbuildings", "byre": "outbuildings", "bathhouse": "bathhouse", "pier": "river_wharf", "riverbank": "riverbank", "boat": "river_channel",
               "fishing_site": "fishing_camp", "hunting_camp": "hunting_ground", "forest": "mixed_woodland", "construction_site": "town_courtyard", "church": "church_interior",
               "monastery": "monastery_yard", "field": "arable_field", "road": "road", "military_camp": "road", "refuse_area": "town_courtyard", "cart_or_sledge": "road"}
    pc = {}
    def add_pc(pf, ct, fc, ref):
        key = (pf, ct)
        if key not in pc or FREQ_WEIGHT[fc] > FREQ_WEIGHT[pc[key]["frequency_class"]]:
            pc[key] = dict(pf_id=pf, ct_id=ct, frequency_class=fc, weight=FREQ_WEIGHT[fc], basis_ref=ref, status=STATUS)
        else:
            pc[key]["basis_ref"] = "|".join(sorted(set(pc[key]["basis_ref"].split("|") + [ref])))
    # rule: per (pf, container form): ubiquitous if REQUIRED in >=50% of scenes bound to pf; common if required in any
    # scene of pf; contextual if only ALLOWED in a scene or listed in a MASTER spawn profile of that place archetype.
    pf_nscenes = collections.Counter()
    req_cnt = collections.Counter()
    refs_by = collections.defaultdict(set)
    allowed = set()
    for r in sc_rows:
        if not r["pf_ids"]:
            continue
        ref = ("matcult_scene:" + r["source_scene_id"]) if r["source_scene_id"] else ("authored_scene:" + r["sc_id"])
        for pf in r["pf_ids"].split("|"):
            pf_nscenes[pf] += 1
            for ct in {item2ct[i] for i in r["required_items"] if i in item2ct}:
                req_cnt[(pf, ct)] += 1; refs_by[(pf, ct)].add(ref)
            for ct in {item2ct[i] for i in r["allowed_items"] if i in item2ct}:
                allowed.add((pf, ct)); refs_by[(pf, ct)].add(ref)
    for key in set(req_cnt) | allowed:
        pf, ct = key
        n = req_cnt.get(key, 0)
        fc = "ubiquitous" if n and n * 2 >= pf_nscenes[pf] else "common" if n else "contextual"
        for ref in sorted(refs_by[key]):
            add_pc(pf, ct, fc, ref)
    for sp in spawn:
        # Only canonical_existing_item_ids: context_anchor_item_ids name the place/structure itself
        # (e.g. ARC0026 = the storehouse pit anchor), not an item present inside every archetype of
        # the profile, and get incorrectly multiplied across all of them if included (rework #1).
        archs = json.loads(sp["location_archetypes"])
        if "construction_site" in archs:
            # A construction-site profile describes a building mid-build (scaffolding, tools); its
            # canonical items (e.g. SPN030 CON0004/CON0005) belong to the site, not to the finished
            # "church" archetype's regular interior contents (rework #1).
            archs = [a for a in archs if a != "church"]
        pfs = {arch2pf[a] for a in archs if a in arch2pf}
        for i in json.loads(sp["canonical_existing_item_ids"] or "[]"):
            if i in item2ct:
                for pf in pfs:
                    add_pc(pf, item2ct[i], "contextual", "master:spawn:" + sp["profile_id"])
    # Third presence source: content_profiles.pf_ids, classed by that profile's own entries (max
    # frequency_class among its content entries) - covers container forms that have a content
    # profile for a place family but no scene requirement/allowance and no MASTER spawn hit
    # (rework #2/#3: coverage holes incl. ct_woodpile/ct_zakrom/ct_feed_manger/... and the missing
    # peasant_homestead family).
    for p in content_profiles.PROFILES:
        pf_ids = [pf for pf in p["pf_ids"].split("|") if pf != "*"]
        if not pf_ids:
            continue
        fc = max((e[1] for e in p["entries"]), key=lambda f: FREQ_WEIGHT[f], default="contextual")
        ref = "content_profile:" + p["cp_id"]
        for pf in pf_ids:
            add_pc(pf, p["ct_id"], fc, ref)
    out("containers/place_containers.csv", sorted(pc.values(), key=lambda x: (x["pf_id"], -x["weight"], x["ct_id"])),
        ["pf_id", "ct_id", "frequency_class", "weight", "basis_ref", "status"])
    out("containers/item_to_container_crosswalk.csv", [dict(item_id=k, ct_id=v, name_ru=matcult.get(k, {}).get("name_ru", "")) for k, v in sorted(item2ct.items())],
        ["item_id", "ct_id", "name_ru"])

    rule = {
        "rule_id": "d3_first_open_v1", "status": STATUS,
        "decision_ref": "Issue #133 D3 (owner decision 2026-09-26): «Содержимое контейнера определяется при первом открытии»; D6 season refresh class",
        "trigger": "first time any actor opens the container instance (not on arrival, not on inspection from outside)",
        "profile_selection": "content_profiles row with ct_id = instance form and pf_id = place family of the instance location; fallback pf '*' (carried); if several match — most specific bt_ids match wins; no match -> container is empty (never LLM-invented)",
        "roll": {
            "seed": "hash(party_seed, container_instance_id, 'first_open', season_period_index if refresh_class=='per_season' else 0)",
            "empty_check": "if empty_allowed=1: container is empty with probability 1/(1+sum(weights of entries)) — i.e. empty competes as one weight-1 outcome",
            "entry_inclusion": "each entry included independently with probability weight/8 (ubiquitous always)",
            "quantity": "uniform integer in [qty_min_slots, qty_max_slots], then capped so that total slots <= container capacity_slots (entries processed in seq order)",
            "concretization": "code picks category; a concrete item inside the category may come from example_items or from the item domain; LLM only describes, never adds",
        },
        "persistence": "result stored once as party fact; later openings read it; no reroll within a period (D3, D6)",
        "refresh_class_default": "none", "refresh_class_allowed": ["none", "per_season"],
        "modifiers": [
            {"id": "famine_1230", "applies_when": "presence:famine_1230 phase active (temporal rule novgorod_famine_1230, approved)",
             "effect": "frequency_class of content_grain, content_flour, content_food_dry, content_vegetables, content_meat, content_fish lowered one step (common->contextual->rare; rare -> excluded)",
             "source_refs": ["nov1230db:S01", "nov1230db:B031", "matcult_scene:SCN060", "nov1230db:famine_prices"], "confidence": "B"}
        ],
        "ownership": "owner of contents = owner of container (D14; domain item_ownership_rules); rus13tpl owner_and_holder_split draft rule noted",
        "never": ["contents created by player request", "contents created by LLM", "reroll on second opening", "hidden stash without causal basis"],
        "source_refs": ["rus13tpl:container:resolve_before_opening_if_significant", "v5:container_content_profiles"],
    }
    json.dump(rule, open(os.path.join(GROUP, "containers/first_open_rule.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    COUNTS["containers/first_open_rule.json"] = 1

    # ---------------- landmarks (import from curated sqlite + few additions) ----------------
    con = sqlite3.connect("file:" + NOV1230_DB + "?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    names_v6 = {r["name"] for r in read_csv(os.path.join(V6_TSV, "novgorod_g2_g4_70_cells_v6_naming_register.tsv"), "\t")}
    def v6match(n):
        hits = [x for x in names_v6 if n.lower() in x.lower() or x.lower() in n.lower()]
        return hits[0] if hits else ""
    catmap = {"храм": "church", "укрепление/центр": "fortification", "резиденция/хозяйственный комплекс": "court", "мост/рынок/судебная сцена": "bridge",
              "политико-торговый комплекс": "court", "храм/торговый суд": "church", "рынок": "market", "иностранный двор": "foreign_court", "резиденция": "court",
              "храм/кладбище": "church", "укрепление": "fortification", "инфраструктура": "infrastructure", "жильё": "building_type_ref", "жильё/власть": "building_type_ref",
              "хозяйственные постройки": "building_type_ref", "бытовая постройка": "building_type_ref", "производство": "building_type_ref", "светская постройка": "building",
              "массовое захоронение": "burial"}
    lm = []
    for r in con.execute("select * from city_features"):
        name = r["name"]
        lm.append(dict(lm_id="lm_" + r["id"].lower(), name_ru=name, category=catmap.get(r["category"], r["category"]), source_category=r["category"], location_ref=r["location"],
                       founded_or_built=r["date"], material=r["material"], status_1230=r["status_1230"], functions="", roles_present="", reconstruction_note=r["reconstruction"],
                       v6_name_match=v6match(name), source_refs=["nov1230db:" + r["id"]] + ["nov1230db:" + s for s in r["sources"].split(";")], confidence=r["confidence"], status=STATUS))
    for r in con.execute("select * from ends"):
        lm.append(dict(lm_id="lm_" + r["id"].lower(), name_ru=r["name"] + " конец", category="end", source_category="конец", location_ref=r["side"] + " сторона; " + r["position"],
                       founded_or_built="", material="", status_1230="существует", functions=r["axes"], roles_present="", reconstruction_note=r["notes"], v6_name_match=v6match(r["name"]),
                       source_refs=["nov1230db:" + r["id"]] + ["nov1230db:" + s for s in r["sources"].split(";")], confidence=r["confidence"], status=STATUS))
    for r in con.execute("select * from streets"):
        lm.append(dict(lm_id="lm_" + r["id"].lower(), name_ru=r["name"] + " улица", category="street", source_category=r["type"], location_ref=r["end_name"] + "; " + r["direction"],
                       founded_or_built="", material="", status_1230="существует", functions="", roles_present="", reconstruction_note=r["appearance"], v6_name_match=v6match(r["name"]),
                       source_refs=["nov1230db:" + r["id"]] + ["nov1230db:" + s for s in r["sources"].split(";")], confidence=r["confidence"], status=STATUS))
    for r in con.execute("select * from institutions"):
        lm.append(dict(lm_id="lm_" + r["id"].lower(), name_ru=r["name"], category="institution", source_category=r["category"], location_ref="",
                       founded_or_built="", material="", status_1230="существует", functions=r["functions"], roles_present="", reconstruction_note=r["limits"], v6_name_match="",
                       source_refs=["nov1230db:" + r["id"]] + ["nov1230db:" + s for s in r["sources"].split(";")], confidence=r["confidence"], status=STATUS))
    extra = [
        dict(lm_id="lm_x_khutyn_monastery", name_ru="Хутынский Спасо-Преображенский монастырь", category="monastery", source_category="монастырь", location_ref="Хутынь, правый берег Волхова севернее города",
             founded_or_built="1192", material="деревянный, затем каменный храм Спаса (освящён 1192)", status_1230="существует", functions="монастырь", roles_present="монахи|паломники",
             reconstruction_note="нынешний собор 1515 г. — не для 1230", v6_name_match=v6match("Хутын"), source_refs=["ref:novgorodmuseum_khutyn"], confidence="B"),
        dict(lm_id="lm_x_yuriev_monastery", name_ru="Юрьев монастырь", category="monastery", source_category="монастырь", location_ref="у истока Волхова к югу от города",
             founded_or_built="собор 1119–1130", material="каменный собор, деревянные постройки", status_1230="существует", functions="монастырь", roles_present="монахи|игумен",
             reconstruction_note="по собору B018", v6_name_match=v6match("Юрьев монастырь"), source_refs=["nov1230db:B018", "matcult:ARC0003"], confidence="A"),
        dict(lm_id="lm_x_antoniev_monastery", name_ru="Антониев монастырь", category="monastery", source_category="монастырь", location_ref="севернее города",
             founded_or_built="собор 1117–1119", material="каменный собор, деревянные постройки", status_1230="существует", functions="монастырь", roles_present="монахи",
             reconstruction_note="по собору B019", v6_name_match=v6match("Антони"), source_refs=["nov1230db:B019"], confidence="A"),
        dict(lm_id="lm_x_gorodishche", name_ru="Рюриково Городище", category="court", source_category="княжеская резиденция", location_ref="к югу от города у истока Волхова",
             founded_or_built="", material="дерево; каменный храм Благовещения 1103", status_1230="существует", functions="основная резиденция князя", roles_present="князь|дружина|тиуны",
             reconstruction_note="не смешивать с Ярославовым дворищем", v6_name_match=v6match("Городище"), source_refs=["nov1230db:P002", "nov1230db:B016", "nov1230db:B015"], confidence="A"),
    ]
    for vy in ("Немецкий", "Ивань", "Алфердов", "Будятин", "Матфеев"):
        extra.append(dict(lm_id="lm_x_vymol_" + {"Немецкий": "nemetsky", "Ивань": "ivan", "Алфердов": "alferdov", "Будятин": "budyatin", "Матфеев": "matfeev"}[vy],
                          name_ru=vy + " вымол", category="wharf", source_category="вымол", location_ref="Торговая сторона", founded_or_built="Устав кон. XII – нач. XIII в. (список XIV в.)",
                          material="дерево", status_1230="вероятно существует", functions="речная пристань", roles_present="лодейщики|грузчики|купцы",
                          reconstruction_note="датировка Устава дискуссионна", v6_name_match=v6match(vy), source_refs=["wk:claim:river-landing-named-list"], confidence="B"))
    for e in extra:
        e["status"] = STATUS
    lm += extra
    out("landmarks/landmarks.csv", lm, ["lm_id", "name_ru", "category", "source_category", "location_ref", "founded_or_built", "material", "status_1230", "functions", "roles_present",
                                        "reconstruction_note", "v6_name_match", "source_refs", "confidence", "status"])
    out("sources.csv", [dict(ref=r[0], title=r[1], url_or_path=r[2], confidence_hint=r[3], note=r[4], kind="bibliography") for r in REFS] +
        [dict(ref="nov1230db:" + r["id"], title=r["title"], url_or_path=r["url"], confidence_hint="", note=r["use_note"], kind="nov1230db_source") for r in con.execute("select * from sources")] +
        [dict(ref="nov1230db", title="Новгородская земля и Великий Новгород в 1230 году (SQLite, 13.07.2026)", url_or_path=NOV1230_DB, confidence_hint="A-D per row", note="curated db, not in repo", kind="database"),
         dict(ref="matcult", title="Novgorod1230 material culture dataset v1", url_or_path="Downloads/Novgorod1230_material_culture_dataset_v1.zip (catalog_items.csv 1137; scenes copied to sources/material-culture-scenes-v1)", confidence_hint="A-D per row", note="candidate", kind="dataset"),
         dict(ref="master", title="Novgorod1230 MASTER ARCHIVE v1", url_or_path="Downloads/Novgorod1230_MASTER_ARCHIVE_v1.zip", confidence_hint="candidate", note="spawn_profiles, workshop_profiles", kind="dataset"),
         dict(ref="wk", title="World Knowledge production-v1 (approved)", url_or_path="data/world-catalogs/novgorod/world-knowledge/production-v1", confidence_hint="approved", note="claim ids", kind="repo"),
         dict(ref="v5", title="item-container-120-v5 candidate tables (pending)", url_or_path="data/knowledge-source/imports/item-container-120-v5/candidate/tables", confidence_hint="pending", note="", kind="repo"),
         dict(ref="rus13tpl", title="rus13-novgorod-regional-templates (draft)", url_or_path="tools/rus13-novgorod-regional-templates", confidence_hint="draft", note="", kind="repo"),
         dict(ref="v6tsv", title="Graph v6 g3_places / naming_register (draft)", url_or_path="DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv", confidence_hint="draft", note="", kind="repo")],
        ["ref", "title", "url_or_path", "confidence_hint", "note", "kind"])

    # ---------------- ambience ----------------
    amb_rows = []
    n = 0
    for (pf, layer, chan, req, loud, dp, seasons, refs, conf) in ambience.AMB:
        for season in ambience.SEASONS:
            if season not in seasons:
                continue
            n += 1
            ct, pt = seasons[season]
            amb_rows.append(dict(sat_id="sat_%s_%s_%s_%03d" % (pf, layer, season, n), pf_id=pf, layer=layer, season_period=season, day_part=dp, channel=chan,
                                 clear_text=ct, partial_text=pt, loudness=loud, requires_presence_ref=req, source_refs=refs, confidence=conf, status=STATUS))
    out("ambience/settlement_ambience_texts.csv", amb_rows,
        ["sat_id", "pf_id", "layer", "season_period", "day_part", "channel", "clear_text", "partial_text", "loudness", "requires_presence_ref", "source_refs", "confidence", "status"])
    out("ambience/presence_tokens.csv", [dict(token=t[0], meaning_ru=t[1], source_refs=t[2]) for t in ambience.PRESENCE_TOKENS], ["token", "meaning_ru", "source_refs"])
    G4 = [
        ("g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality", "vikhtuy_locality", "peasant_homestead|village_lane"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge", "forest_tract", "forest_edge"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach", "landing_terrace", "ferry_landing|riverbank"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace", "landing_terrace", "ferry_landing|riverbank"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_settlement_center", "archaeological_settlement", "peasant_homestead|village_lane"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_landing", "local_landing", "ferry_landing|riverbank|fishing_camp"),
        ("g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_burial_area", "burial_area", "churchyard"),
    ]
    out("ambience/g4_human_layer_binding.csv",
        [dict(g4_ref=g[0], source_place_type=g[1], pf_ids=g[2], basis_ref="pr98:data/world-catalogs/novgorod/m2c-natural/candidate.json (source_place_type, authoring_axes)", confidence="C", status=STATUS) for g in G4],
        ["g4_ref", "source_place_type", "pf_ids", "basis_ref", "confidence", "status"])

    # snapshot of every referenced matcult item (for offline validation)
    refd = set(REFD)
    out("interiors/matcult_item_refs.csv",
        [dict(item_id=i, exists=int(i in matcult), name_ru=matcult.get(i, {}).get("name_ru", ""), category=matcult.get(i, {}).get("category", ""),
              historical_confidence=matcult.get(i, {}).get("historical_confidence", ""), generation_policy=matcult.get(i, {}).get("generation_policy", ""),
              dimensions=matcult.get(i, {}).get("dimensions", ""), source_ids=matcult.get(i, {}).get("source_ids", "")) for i in sorted(refd)],
        ["item_id", "exists", "name_ru", "category", "historical_confidence", "generation_policy", "dimensions", "source_ids"])

    json.dump(COUNTS, open(os.path.join(GROUP, "scripts", "build_counts.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for k, v in COUNTS.items():
        print("%6d  %s" % (v, k))


if __name__ == "__main__":
    main()
