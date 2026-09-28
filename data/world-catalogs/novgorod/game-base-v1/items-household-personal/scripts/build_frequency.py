"""Build items/item_place_frequency.csv, items/archetype_pf_map.csv and reports/frequency_dropped.csv.

Part A (ref_kind=it): catalog items; links = union of their master rows' item_location_links, spawn_profiles
membership (canonical/common -> common, contextual -> contextual), else master where_used keywords (contextual, C),
else item_group default places (contextual, C). Max class per (item, pf).
Part B (ref_kind=master): every master item_location_links row converted to pf (full base), with drop reasons.
"""
import json
import re
from collections import defaultdict
from common import ITEMS, REPORTS, ME, ROOT, read_csv, write_csv, split, load_master, load_me, load_place_families
import rules as R

WHERE_KW = [
    # (name-pattern, pf ids, exclude-pattern) - exclude drops a match despite the include hit
    (r"изб|жил|дом(?!ен)", ["dwelling_interior"], None),
    (r"двор|усадьб", ["town_courtyard", "peasant_homestead"], r"немецк|готск|любек|варяж|иностран|купеческ"),
    (r"торг|рын|лавк", ["market_square"], None), (r"пристан|причал|мостк", ["river_wharf"], None),
    (r"церк|храм", ["church_interior"], None), (r"монаст", ["monastery_yard"], None), (r"мастерск", ["ordinary_workshop"], None),
    (r"кузн", ["smithy"], None), (r"бан[яи]", ["bathhouse"], None), (r"амбар|клет|кладов|погреб|склад", ["cellar_granary"], None),
    (r"огород", ["orchard_garden"], None), (r"пол[ея]|пашн", ["arable_field"], None), (r"дорог|путь|поход(?!н)", ["road"], None),
    (r"рыбац|лов|берег", ["fishing_camp", "riverbank"], r"ткац|прял|тканьё|дощечк"),
    (r"улиц|мостов", ["town_street"], None),
]
# R_LOSS_DOWNGRADE: a use-context frequency class (how often the item is in use/stored) does not
# describe how often it turns up lost/dropped in a wild place; stated rule: drop two classes.
LOSS_DOWN = {"ubiquitous": "contextual", "common": "rare", "contextual": "rare", "rare": "rare"}
# The boat/pier source only permits these objects in a supported context; it
# supplies no cause for an instance at the public ferry landing.
UNSUPPORTED_ITEM_PFS = {("it_hh_basket", "ferry_landing"), ("it_ps_folding_balance", "ferry_landing")}
ARCHIVE = "sources/master-archive-v1"
CONTEXT_ARCHES = {
    "boat": ("transport_context", "transport_travel", "trv_003;trv_004;trv_006;trv_014;ct_boat_hold;cp_boat_cargo"),
    "cart_or_sledge": ("transport_context", "transport_travel", "trv_022;trv_023;trv_031;trv_032;ct_cart_body;cp_cart_load"),
    "military_camp": ("activity_overlay", "place_families", "issue:#176:military_camp"),
    "construction_site": ("activity_overlay", "place_families", "issue:#176:construction_site"),
}
DROP_REASONS = {"anachronism", "physical_impossibility", "duplicate"}
ARCHAEOLOGICAL_KINDS = {"fragment", "residue", "deposit", "waste", "byproduct"}
NON_WHOLE_KINDS = {"salvage", "component", "blank", "semifinished"}
NON_WHOLE_NAME = re.compile(r"\bобломок\b", re.I)
CONCEALED_MODE = re.compile(r"(?:container|chest|pouch|sack|basket|box|bag|jar|vessel|storage|storehouse|pit|buried|wrapped|covered|under|refuse|scrap)")
# R_RESIDUAL_RARE_DATING: items whose own source basis dates them mostly before/declining by 1230
# (see VERIFICATION.md items/personal.csv & household.csv notes) are capped at rare in frequency,
# regardless of what master links/spawn profiles would otherwise imply for 1230.
RESIDUAL_RARE = {
    "it_hh_wooden_lock": "BIB_LOCKS: пик первой половины XI в., для 1230 г. остаточная находка",
    "it_ps_lead_plomb": "источник вещи: чаще как потерянная/старая находка на 1230 г., спад в начале XIII в.",
    "it_ps_weight_cubo": "кубооктаэдрические гирьки преимущественно X-XI вв., остаточная находка к 1230 г.",
}
GROUP_DEFAULT = {  # rule R_GROUP_DEFAULT: typical rooms for the item group when sources give no place
    "HH_TABLEWARE": ["dwelling_interior"], "HH_COOKWARE": ["dwelling_interior"], "HH_FOODPROC": ["dwelling_interior", "outbuildings"],
    "HH_VESSELS_WATER": ["dwelling_interior", "town_courtyard", "peasant_homestead"], "HH_FIRE_LIGHT": ["dwelling_interior"],
    "HH_HEARTH_TOOLS": ["dwelling_interior"], "HH_CLEANING": ["dwelling_interior", "bathhouse"], "HH_BEDDING_TEXTILE": ["dwelling_interior"],
    "HH_SMALL_STORAGE": ["dwelling_interior", "cellar_granary"], "HH_LOCKS": ["dwelling_interior", "cellar_granary", "outbuildings"],
    "HH_TEXTILE_WORK": ["dwelling_interior"], "HH_SEWING": ["dwelling_interior"], "HH_TOOLS_SMALL": ["dwelling_interior", "town_courtyard", "peasant_homestead"],
    "PS_GROOMING": ["dwelling_interior", "bathhouse"], "PS_KNIFE": ["dwelling_interior"], "PS_CARRY": ["dwelling_interior"],
    "PS_FIRE_KIT": ["dwelling_interior"], "PS_WRITING": ["dwelling_interior", "church_interior"], "PS_TRADE_ADMIN": ["market_square", "river_wharf"],
    "PS_RELIGIOUS": ["dwelling_interior", "church_interior"], "PS_PLAY": ["dwelling_interior", "town_street", "town_courtyard"],
    "PS_MUSIC": ["dwelling_interior"],
}
DENY = re.compile(r"\b(картоф|кукуруз|томат|подсолнеч|табак|индейк|кролик|чай\b|кофе\b|сахар\b|огнестрел|пищал|бумаг|бумажн|печатн\w* книг|печатный станок|игральн\w* карт)", re.I)


def best(a, b):
    return a if R.FREQ_RANK[a] >= R.FREQ_RANK[b] else b


def upd(acc, pf, cls, rule, basis):
    """Accumulate the max class for (item, pf); attribute derivation_rule to whichever
    contributing rule actually supplied the winning (max) class, not just the first one seen."""
    a = acc.setdefault(pf, {"cls": cls, "basis": set(), "rule": rule})
    if R.FREQ_RANK[cls] > R.FREQ_RANK[a["cls"]]:
        a["rule"] = rule
    a["cls"] = best(a["cls"], cls)
    a["basis"].add(basis)
    return a


def allows_group_default(item):
    """A source-less generic room is not evidence for costly/import/prestige ware."""
    return (item.get("value_band") != "costly"
            and not re.search(r"(?:^|_)(?:import|prestige)(?:_|$)", item.get("subcategory", ""), re.I))


def closed_drop_reason(reason):
    if reason not in DROP_REASONS:
        raise ValueError(f"drop reason outside closed vocabulary: {reason}")
    return reason


def main():
    master, me = load_master(), load_me()
    pfs = load_place_families()
    links = read_csv(ME / "item_location_links.csv")
    spawn = read_csv(ME / "spawn_profiles.csv")
    own = {r["own_id"] for r in read_csv(ITEMS / "ownership_rules.csv")}
    items = read_csv(ITEMS / "household.csv") + read_csv(ITEMS / "personal.csv")
    canon2legacy = {v["canonical_id"]: k for k, v in master.items()}
    # A residue can be linked to the same authored item, but does not attest the
    # frequency or location of the intact object.
    residue_units = {"portion_or_local_accumulation"}
    by_item = defaultdict(list)
    for l in links:
        by_item[l["item_id"]].append(l)
    spawn_cls = defaultdict(list)  # legacy id -> [(archetype, class, profile)]
    for s in spawn:
        arch = json.loads(s["location_archetypes"])
        for key, cls in (("canonical_existing_item_ids", "common"), ("common_new_item_ids", "common"), ("contextual_new_item_ids", "contextual")):
            for iid in json.loads(s[key] or "[]"):
                for a in arch:
                    spawn_cls[iid].append((a, cls, s["profile_id"]))
    dropped = []
    context_rows = []

    def excluded(legacy):
        m = master.get(legacy)
        if not m:
            return "item not in master canonical material_items"
        if m["rec"].get("entity_kind") in ARCHAEOLOGICAL_KINDS:
            return f"archaeological trace, not a live-scene item ({m['rec']['entity_kind']})"
        if DENY.search(m["name_ru"]):
            return "anachronism"
        return None

    def whole_evidence(legacy):
        """A part or damaged remnant cannot attest the frequency of its whole parent."""
        m = master[legacy]["rec"]
        return (m.get("entity_kind") not in NON_WHOLE_KINDS
                and m.get("manufacturing_state") != "broken"
                and not NON_WHOLE_NAME.search(master[legacy]["name_ru"]))

    rows = []
    # ---------- Part A
    link_superseded = {}
    for it in items:
        legacy = [canon2legacy[c] for c in split(it["master_refs"])]
        acc = {}  # pf -> dict(cls, basis set, conf)
        for lg in legacy:
            link_superseded[lg] = it["it_id"]
            if excluded(lg) or not whole_evidence(lg):
                continue
            if me.get(lg, {}).get("quantity_mode") in residue_units:
                continue
            for l in by_item.get(lg, []):
                arch = l["location_archetype"]
                for pf in R.ARCH_PF.get(arch, []):
                    a = upd(acc, pf, l["spawn_frequency"], "R_MASTER_LINK", f"master_link:{l['link_id']}")
                    a["fanout"] = a.get("fanout", False) or len(R.ARCH_PF[arch]) > 1
            for arch, cls, prof in spawn_cls.get(lg, []):
                for pf in R.ARCH_PF.get(arch, []):
                    a = upd(acc, pf, cls, "R_SPAWN_PROFILE", f"master_spawn:{prof}:{lg}")
                    a["fanout"] = a.get("fanout", False) or len(R.ARCH_PF[arch]) > 1
        # Authored master where_used text is source evidence.  The guard below
        # applies only to the source-less R_GROUP_DEFAULT fallback.
        if not acc:
            for lg in legacy:
                if excluded(lg) or not whole_evidence(lg) or me.get(lg, {}).get("quantity_mode") in residue_units:
                    continue
                wu = re.sub(r"береговая рабочая зона", "", str(master[lg]["rec"].get("where_used") or ""), flags=re.I)
                for rx, pfl, exrx in WHERE_KW:
                    if re.search(rx, wu, re.I) and not (exrx and re.search(exrx, wu, re.I)):
                        for pf in pfl:
                            if it["item_group"] == "HH_TEXTILE_WORK" and pf in ("fishing_camp", "riverbank"):
                                continue
                            upd(acc, pf, "contextual", "R_WHERE_USED_TEXT", f"master_where_used:{lg}")
        if not acc and allows_group_default(it):
            for pf in GROUP_DEFAULT.get(it["item_group"], ["dwelling_interior"]):
                acc[pf] = {"cls": "contextual", "basis": {f"group_default:{it['item_group']}"}, "rule": "R_GROUP_DEFAULT"}
        for pf, a in sorted(acc.items()):
            if (it["it_id"], pf) in UNSUPPORTED_ITEM_PFS:
                continue
            cls_pf = R.PF_CLASS[pf]
            ctx_owner = R.own_id(pf, "in_use_or_stored", it["item_group"])
            ctx = "in_use_or_stored"
            cls = a["cls"]
            rule = a["rule"]
            if cls_pf == "wild":
                ctx_owner = R.own_id(pf, "loose_dropped", "all")
                ctx = "loose_dropped"
                # R_LOSS_DOWNGRADE: usage-class does not equal loss-class in a wild place.
                cls = LOSS_DOWN[cls]
                rule = rule + "+R_LOSS_DOWNGRADE"
            if it["it_id"] in RESIDUAL_RARE and R.FREQ_RANK[cls] > R.FREQ_RANK["rare"]:
                cls = "rare"
                rule = rule + "+R_RESIDUAL_RARE_DATING"
            link_conf = "B" if a["rule"] in ("R_MASTER_LINK", "R_SPAWN_PROFILE") else "C"
            conf = max(it["confidence"], link_conf, "C" if a.get("fanout") else "A")  # weaker wins
            basis = sorted(a["basis"])
            if it["it_id"] in RESIDUAL_RARE:
                basis = basis + [f"residual_dating:{RESIDUAL_RARE[it['it_id']]}"]
            rows.append({
                "ipf_id": f"ipf_{it['it_id']}__{pf}", "ref_kind": "it", "item_or_category_ref": it["it_id"],
                "category_id": it["category_id"], "item_group": it["item_group"], "name_ru": it["name_ru"],
                "pf_id": pf, "pf_class": cls_pf, "frequency_class": cls, "weight": R.FREQ_WEIGHT[cls],
                "count_limit_rule": f"{it['quantity_unit']}:max 1 instance-group per first-arrival roll; place totals capped by place_generation_limits",
                "allowed_seasons": "winter;spring;summer;autumn", "refresh_class": "none",
                "find_context": ctx, "owner_rule_ref": ctx_owner, "derivation_rule": rule,
                "entry_visible_if": "placed_exposed", "search_only_if": "placed_concealed",
                "wild_arrival_cause_required": "prior_visitor_loss_or_discard" if cls_pf == "wild" else "",
                "wk_check": f"pf in WK place-first-cartography; item WK refs: {len(split(it['wk_refs']))}",
                "superseded_by": "", "source_refs": ";".join(basis[:20]) + (f";+{len(basis)-20} more" if len(basis) > 20 else ""),
                "confidence": conf, "status": "candidate",
            })
    # ---------- Part B
    accB = {}
    for l in links:
        lg, arch = l["item_id"], l["location_archetype"]
        if lg not in master:
            raise ValueError(f"source link {l['link_id']} has no canonical item: {lg}")
        # Archaeological states are preserved by item_place_trace_relations.csv.
        # They are neither intact-item frequency evidence nor dropped links.
        if master[lg]["rec"].get("entity_kind") in ARCHAEOLOGICAL_KINDS:
            continue
        why = excluded(lg)
        if why is None and arch in CONTEXT_ARCHES:
            context_kind, target_owner, target_refs = CONTEXT_ARCHES[arch]
            m = master[lg]
            context_rows.append({
                "icr_id": f"icr_{l['link_id'].lower()}",
                "source_link_id": l["link_id"],
                "item_ref": m["canonical_id"],
                "name_ru": m["name_ru"],
                "location_archetype": arch,
                "context_kind": context_kind,
                "spawn_frequency": l["spawn_frequency"],
                "target_owner": target_owner,
                "target_refs": target_refs,
                "materialization_rule": "owner resolves the concrete vehicle or activity scene; never ambient place-family placement",
                "basis": "sourced",
                "derivation": f"{ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv#{l['link_id']}; decision:D40",
                "anachronism_check": "pass:master identity survives denylist; confidence alone is not exclusion",
                "confidence": m["conf"] or "D",
                "status": "candidate",
            })
            continue
        if why is None and arch not in R.ARCH_PF:
            raise ValueError(f"unmapped location archetype requires owner decision: {arch}")
        if why:
            reason_code = closed_drop_reason(why)
            dropped.append({"link_id": l["link_id"], "item_id": lg, "location_archetype": arch,
                            "spawn_frequency": l["spawn_frequency"], "reason_code": reason_code,
                            "reason": why})
            continue
        m = master[lg]
        cat, sub = m["rec"].get("category"), m["rec"].get("subcategory")
        grp = R.ME_SUB_GROUP.get(sub) or (R.ME_GROUP.get(cat) if m["dataset"] == "material_entities" else R.OCC_GROUP.get(cat)) or "HH_TOOLS_SMALL"
        for pf in R.ARCH_PF[arch]:
            k = (lg, pf)
            a = accB.setdefault(k, {"cls": l["spawn_frequency"], "links": [], "grp": grp, "fanout": False})
            a["cls"] = best(a["cls"], l["spawn_frequency"])
            a["links"].append(l["link_id"])
            a["fanout"] = a["fanout"] or len(R.ARCH_PF[arch]) > 1
    for (lg, pf), a in sorted(accB.items()):
        m = master[lg]
        cls_pf = R.PF_CLASS[pf]
        ctx = "loose_dropped" if cls_pf == "wild" else "in_use_or_stored"
        grp = a["grp"]
        cls = a["cls"]
        rule = "R_MASTER_LINK"
        if cls_pf == "wild":
            # R_LOSS_DOWNGRADE: same stated rule as Part A - usage class != loss class in the wild.
            cls = LOSS_DOWN[cls]
            rule = rule + "+R_LOSS_DOWNGRADE"
        rows.append({
            "ipf_id": f"ipf_m_{lg.lower()}__{pf}", "ref_kind": "master", "item_or_category_ref": m["canonical_id"],
            "category_id": "", "item_group": grp, "name_ru": m["name_ru"], "pf_id": pf, "pf_class": cls_pf,
            "frequency_class": cls, "weight": R.FREQ_WEIGHT[cls],
            "count_limit_rule": f"{me.get(lg, {}).get('quantity_mode') or 'single_object'}:max 1 instance-group per first-arrival roll; place totals capped by place_generation_limits",
            "allowed_seasons": "winter;spring;summer;autumn", "refresh_class": "none", "find_context": ctx,
            "owner_rule_ref": R.own_id(pf, ctx, "all" if ctx == "loose_dropped" else grp),
            "entry_visible_if": "placed_exposed", "search_only_if": "placed_concealed",
            "wild_arrival_cause_required": "prior_visitor_loss_or_discard" if cls_pf == "wild" else "",
            "derivation_rule": rule, "wk_check": "pf in WK place-first-cartography; item not WK-checked (master candidate)",
            "superseded_by": link_superseded.get(lg, ""), "source_refs": ";".join(f"master_link:{x}" for x in a["links"][:6]),
            "confidence": max(m["conf"], "C" if a["fanout"] else "B"), "status": "candidate",
        })
    # ---------- Part C: place families without a master archetype (stated rules, confidence C)
    have = {(r["item_or_category_ref"], r["pf_id"]) for r in rows}
    it_by_ref = {it["it_id"]: it for it in items}
    extra = []

    def add(src_row, pf, cls, rule, basis):
        key = (src_row["item_or_category_ref"], pf)
        if key in have:
            return
        have.add(key)
        cls_pf = R.PF_CLASS[pf]
        ctx = "loose_dropped" if cls_pf == "wild" else "in_use_or_stored"
        prefix = "ipf_" if src_row["ref_kind"] == "it" else "ipf_m_"
        ref_short = src_row["item_or_category_ref"] if src_row["ref_kind"] == "it" else src_row["item_or_category_ref"].rsplit(":", 1)[1]
        r = dict(src_row)
        r.update({"ipf_id": f"{prefix}{ref_short}__{pf}", "pf_id": pf, "pf_class": cls_pf, "frequency_class": cls,
                  "weight": R.FREQ_WEIGHT[cls], "find_context": ctx,
                  "owner_rule_ref": R.own_id(pf, ctx, "all" if ctx == "loose_dropped" else src_row["item_group"]),
                  "wild_arrival_cause_required": "prior_visitor_loss_or_discard" if cls_pf == "wild" else "",
                  "derivation_rule": rule, "source_refs": basis, "confidence": "C"})
        extra.append(r)

    # R_ALIAS: rural_yard is the WK open rural-yard context = same inventory basis as peasant_homestead
    for r in list(rows):
        if r["pf_id"] == "peasant_homestead":
            add(r, "rural_yard", r["frequency_class"], "R_ALIAS", "alias:peasant_homestead;" + r["source_refs"][:200])
    # R_NAME_KEYWORD over master names and catalog names.
    # Each entry is (include-pattern, exclude-pattern-or-None); exclude drops a match despite the
    # include hit, to keep the keyword tied to the place it names rather than a loose root match.
    KW = {
        "mill": (r"жернов|\bмельн|помол|\bотруби\b|\bвысевк", None),
        "grain_drying_shed_ovin": (r"\bовин|\bсноп|\bколос|\bмякин|после обмолота|\bнеобмолоч|колосков", None),
        "hay_meadow": (r"\bсен[оа]\b|\bсенн|\bстог|\bкопн|\bкос[аы]\b|горбуш|\bграбл|\bвил[ыа]\b", r"прокладк|груз|упаковк"),
        "pasture": (r"\bскот|\bпастух|\bпастуш|\bботал|\bизгород|кольцо для привязи|\bпривязн|\bкнут\b|\bрожок", None),
        "field_margin": (r"\bмежев|\bизгород|\bканав|\bплетен|куча камн|\bжерд", None),
        "bridge_crossing": (r"\bмост\b|\bмоста\b|\bмостк|\bсва[яи]\b", r"смол|капл"),
        "town_wall_edge": (r"\bвал\b|частокол|\bтын\b|\bгородн|\bворот[аы]\b|\bворотн", None),
        "churchyard": (r"могил|погост|\bгроб|надгроб|\bкрест\b|энколпион", r"свеч|подсвечник"),
    }
    pool = {}
    for r in rows:
        if r["ref_kind"] in ("it", "master"):
            pool.setdefault(r["item_or_category_ref"], r)
    for pf, (rx, exrx) in KW.items():
        for ref, r in pool.items():
            if re.search(rx, r["name_ru"], re.I) and not (exrx and re.search(exrx, r["name_ru"], re.I)):
                add(r, pf, "contextual", "R_NAME_KEYWORD", f"keyword:{pf}")
    # R_WK_COMPOSES: inherit catalog rows from families the target actually composes with in WK
    # place-first-cartography (pfs[pf]["composes_with"]), downgraded one class. Restricted to
    # sources that hold catalog items (ARCH_PF targets) so the rule stays checkable against WK.
    INHERIT_TARGETS = ["churchyard", "town_wall_edge", "bridge_crossing", "field_margin",
                        "hay_meadow", "pasture", "mill", "grain_drying_shed_ovin"]
    INHERIT = {pf: [s for s in pfs.get(pf, {}).get("composes_with", []) if s in R.PF_CLASS]
               for pf in INHERIT_TARGETS}
    for pf, srcs in INHERIT.items():
        for r in list(rows):
            if r["pf_id"] in srcs and r["ref_kind"] == "it":
                add(r, pf, "rare", "R_WK_COMPOSES", f"wk_composes:{r['pf_id']}->{pf};transferred_or_lost")
    rows += extra
    catalog_pairs = {(r["item_or_category_ref"], r["pf_id"]) for r in rows if r["ref_kind"] == "it"}
    rows = [r for r in rows if r["ref_kind"] != "master" or
            (r["superseded_by"], r["pf_id"]) not in catalog_pairs | UNSUPPORTED_ITEM_PFS]
    stage_ref = "packages/new-game/src/stages/stage-16-item-placement/orchestration/run-stage-16.js#materialize"
    for r in rows:
        if r["ref_kind"] == "it":
            source_ids = [canon2legacy[c] for c in split(it_by_ref[r["item_or_category_ref"]]["master_refs"])
                          if not excluded(canon2legacy[c]) and whole_evidence(canon2legacy[c])
                          and me.get(canon2legacy[c], {}).get("quantity_mode") not in residue_units]
        else:
            source_ids = [r["item_or_category_ref"].rsplit(":", 1)[-1].upper()]
        mode_sources = [(lg, json.loads(me[lg]["placement_modes"])) for lg in source_ids
                        if lg in me and me[lg].get("placement_modes")]
        modes = sorted({part for _, values in mode_sources for mode in values for part in mode.split("_or_")})
        if modes:
            concealed = sum(bool(CONCEALED_MODE.search(mode)) for mode in modes)
            r["entry_exposed_weight"] = round(8 * (len(modes) - concealed) / len(modes))
            r["search_concealed_weight"] = 8 - r["entry_exposed_weight"]
            r["placement_basis_ref"] = ";".join(f"master:{master[lg]['canonical_id']}#placement_modes" for lg, _ in mode_sources)
            r["placement_owner_ref"] = ""
        else:
            r["entry_exposed_weight"] = ""
            r["search_concealed_weight"] = ""
            r["placement_basis_ref"] = "no_source:placement_modes_absent"
            r["placement_owner_ref"] = stage_ref
    fields = list(rows[0])
    n = write_csv(ITEMS / "item_place_frequency.csv", rows, fields)
    write_csv(REPORTS / "frequency_dropped.csv", dropped,
              ["link_id", "item_id", "location_archetype", "spawn_frequency", "reason_code", "reason"])
    write_csv(ITEMS / "item_context_relations.csv", sorted(context_rows, key=lambda r: r["icr_id"]), [
        "icr_id", "source_link_id", "item_ref", "name_ru", "location_archetype", "context_kind",
        "spawn_frequency", "target_owner", "target_refs", "materialization_rule", "basis",
        "derivation", "anachronism_check", "confidence", "status",
    ])
    amap = [{"location_archetype": a, "pf_ids": ";".join(p), "action": "map", "note": R.ARCH_NOTE.get(a, "")} for a, p in R.ARCH_PF.items()]
    amap += [{"location_archetype": a, "pf_ids": "", "action": "context",
              "note": f"{CONTEXT_ARCHES[a][0]} -> {CONTEXT_ARCHES[a][1]}; {why}"}
             for a, why in R.ARCH_DROP.items()]
    write_csv(ITEMS / "archetype_pf_map.csv", amap, ["location_archetype", "pf_ids", "action", "note"])
    # checks
    errs = []
    for r in rows:
        if r["pf_id"] not in pfs:
            errs.append(f"{r['ipf_id']}: pf {r['pf_id']} not in WK")
        if r["frequency_class"] not in R.FREQ_WEIGHT:
            errs.append(f"{r['ipf_id']}: bad class")
        if r["owner_rule_ref"] not in own:
            errs.append(f"{r['ipf_id']}: owner rule {r['owner_rule_ref']} missing")
    (REPORTS / "build_frequency_errors.txt").write_text("\n".join(errs[:500]) + ("\n" if errs else ""), encoding="utf-8")
    a_rows = sum(1 for r in rows if r["ref_kind"] == "it")
    print(f"item_place_frequency={n} (it={a_rows}, master={n - a_rows}) context_links={len(context_rows)} dropped_links={len(dropped)} errors={len(errs)}")
    for e in errs[:20]:
        print("  ERR", e)


if __name__ == "__main__":
    main()
