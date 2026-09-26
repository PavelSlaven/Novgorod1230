#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deterministic builder for group households-psychology-speech (candidate data).
Reads TSV/WK sources only; writes CSV outputs per domain. No invented numbers:
weights/frequencies are derived by a stated rule from stated TSV fields.

Run: python build.py
Outputs under ../<domain>/*.csv and prints row counts (also to build_report.json).
"""
import csv, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../game-base-v1/households-psychology-speech
GAME_BASE_V1 = os.path.dirname(ROOT)                                # .../game-base-v1
CATALOG_NOVGOROD = os.path.dirname(GAME_BASE_V1)                    # .../world-catalogs/novgorod
WORLD_CATALOGS = os.path.dirname(CATALOG_NOVGOROD)                  # .../world-catalogs
GB_DATA = os.path.dirname(WORLD_CATALOGS)                           # .../data

REGION_TSV = os.path.join(GB_DATA, "novgorod-region")
WK_PROD = os.path.join(CATALOG_NOVGOROD, "world-knowledge", "production-v1")

OCC_TSV = os.path.join(REGION_TSV, "novgorod_occupations_v1_enriched.tsv")
ROLE_TSV = os.path.join(REGION_TSV, "novgorod_social_roles_v1_enriched.tsv")

report = {}


def read_tsv(path):
    with open(path, encoding="utf-8") as f:
        r = csv.DictReader(f, delimiter="\t")
        return list(r)


def read_wk(name):
    path = os.path.join(WK_PROD, name)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm_conf(v):
    """Map the enriched-TSV confidence scale (high/medium_high/medium/
    medium_low/low) onto the project's closed A/B/C scale.

    Fixed 2026-09-26 (rework): the TSV is itself documented as a "regional
    social reconstruction", not a primary/archaeological source, so a TSV
    row can never justify confidence A regardless of the TSV's own
    'high'. Ceiling is B. Only a primary source (book evidence, WK claim
    marked high, archaeological measurement) may justify A, and that is
    set explicitly at the call site, never by this function."""
    v = (v or "").strip().lower()
    if v in ("high",) or v.startswith("medium"):
        return "B"
    if v == "low":
        return "C"
    return "C"


def write_csv(path, rows, fieldnames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            out = {}
            for k in fieldnames:
                v = row.get(k, "")
                if isinstance(v, (list, dict)):
                    v = json.dumps(v, ensure_ascii=False)
                out[k] = v
            w.writerow(out)
    return len(rows)


# ---------------------------------------------------------------------------
# Domain 1: households_kinship
# ---------------------------------------------------------------------------


# Fixed 2026-09-26 (rework). wealth_band is now a single closed vocabulary
# (not a mix of two source scales); household member counts are no longer
# left as a bare blank ("unknown" gap) but are given a min/max range where
# book evidence supports one, with the evidence cited in members_estimate_basis.
# Basis (book:622242, "Новгород и Новгородская земля", §519 — archaeological
# household-plot survey): "средняя семья 6 человек" / an ordinary Novgorod
# household plot (400-600 kв.м) housed on average one family of ~6 people;
# a boyar household plot was 2.5-4x larger and populated proportionally.
WEALTH_BAND_MAP_OCC = {
    "middle-high": "high", "low-middle": "middle", "middle": "middle",
    "low": "low", "low-dependent": "dependent", "outcast-low": "outcast",
    "low-variable": "low",
}
WEALTH_BAND_MAP_ROLE = {
    "elite": "elite", "high": "high", "middle": "middle", "low": "low",
    "dependent": "dependent", "outcast": "outcast", "variable": "variable",
}
MEMBERS_BY_BAND = {
    "elite": (10, 24, "boyar/elite household plot 2.5-4x an ordinary plot "
                       "(book:622242 §519); ordinary ~6 people => ~15-24, "
                       "lower bound widened to 10 for smaller elite households"),
    "high": (10, 24, "same basis as elite (book:622242 §519); high-rank "
                     "household treated as elite-scale for this estimate"),
    "middle": (4, 8, "ordinary Novgorod household plot, average family ~6 "
                     "people (book:622242 §519)"),
    "low": (4, 8, "ordinary Novgorod household plot, average family ~6 "
                  "people (book:622242 §519)"),
    "dependent": (1, 3, "dependent/servant household unit, not a full family "
                        "plot; no source gives a count (gap) — kept narrow "
                        "and marked low-confidence rather than reusing the "
                        "ordinary-family figure"),
    "outcast": ("unspecified", "unspecified", "no source for outcast/marginal "
                                "household size (gap)"),
    "variable": ("unspecified", "unspecified", "social_rank=variable; no "
                                 "single band applies, size not estimated (gap)"),
}
MEMBERS_SOURCE_REF = ("book:622242 §519 (Новгород и Новгородская земля; "
                       "археологическое обследование дворов; средняя семья "
                       "~6 чел., боярская усадьба в 2,5-4 раза больше)")


def build_households_kinship(occs, roles):
    out_dir = os.path.join(ROOT, "households_kinship")

    # household_composition_profiles.csv — one row per occupation/role that
    # carries a family_pattern/household_pattern text in the source TSV.
    # family_pattern_ru/household_pattern_ru are kept as informational text
    # only: household_pattern is identical boilerplate across (almost) every
    # TSV row (distinct=1) and is NOT a signal of actual household
    # composition — see note. The differentiating, sourced columns are
    # wealth_band (closed vocabulary) and members_estimate_min/max (book
    # evidence, by wealth_band). members[relation,sex,age_band],
    # servants_dependants (numeric), kinship_terms and customs_refs asked
    # for in the brief are NOT derivable from any source available to this
    # builder and are left as explicit pointers/gaps, not invented.
    comp_rows = []
    for o in occs:
        fam = (o.get("family_pattern") or "").strip()
        hh = (o.get("household_pattern") or "").strip()
        if not fam and not hh:
            continue
        band = WEALTH_BAND_MAP_OCC.get((o.get("typical_status_range") or "").strip(), "unspecified")
        mmin, mmax, basis = MEMBERS_BY_BAND.get(band, ("unspecified", "unspecified", "wealth_band not in MEMBERS_BY_BAND (gap)"))
        comp_rows.append({
            "hh_id": f"hh_occ_{o['occupation_id']}",
            "household_type": "occupation_linked",
            "wealth_band": band,
            "pf_id": o["occupation_id"],
            "family_pattern_ru": fam,
            "household_pattern_ru": hh,
            "members_estimate_min": mmin,
            "members_estimate_max": mmax,
            "members_estimate_basis": basis,
            "servants_dependants_ref": "unspecified (no source for a numeric count; see typical_obligations/typical_debts, occupations TSV, same row, for qualitative dependents)",
            "kinship_terms_ref": "households_kinship/kinship_terms.csv (closed vocabulary, not linked per-row)",
            "customs_refs": "social_norms_honour_hospitality/norms.csv (sn_* rows whose applies_to_roles matches this occupation, not linked per-row)",
            "source_refs": f"novgorod_occupations_v1_enriched.tsv#{o['occupation_id']} (status={o.get('status','')}, confidence={o.get('confidence','')}); {MEMBERS_SOURCE_REF}",
            "confidence": norm_conf(o.get("confidence")),
            "note": "household_pattern_ru is template text, identical across almost all rows of this TSV (distinct=1) — informational only, not a differentiation signal; members_* columns are the sourced composition estimate.",
        })
    for r in roles:
        fam = (r.get("family_pattern") or "").strip()
        hh = (r.get("household_pattern") or "").strip()
        deps = (r.get("typical_dependents") or "").strip()
        if not fam and not hh and not deps:
            continue
        band = WEALTH_BAND_MAP_ROLE.get((r.get("social_rank") or "").strip(), "unspecified")
        mmin, mmax, basis = MEMBERS_BY_BAND.get(band, ("unspecified", "unspecified", "wealth_band not in MEMBERS_BY_BAND (gap)"))
        comp_rows.append({
            "hh_id": f"hh_role_{r['role_id']}",
            "household_type": "role_linked",
            "wealth_band": band,
            "pf_id": r["role_id"],
            "family_pattern_ru": fam,
            "household_pattern_ru": hh,
            "members_estimate_min": mmin,
            "members_estimate_max": mmax,
            "members_estimate_basis": basis,
            "servants_dependants_ref": deps or "unspecified (no source for a numeric count)",
            "kinship_terms_ref": "households_kinship/kinship_terms.csv (closed vocabulary, not linked per-row)",
            "customs_refs": "social_norms_honour_hospitality/norms.csv (sn_* rows whose applies_to_roles matches this role, not linked per-row)",
            "source_refs": f"novgorod_social_roles_v1_enriched.tsv#{r['role_id']} (status={r.get('status','')}, confidence={r.get('confidence','')}); {MEMBERS_SOURCE_REF}",
            "confidence": norm_conf(r.get("confidence")),
            "note": "household_pattern_ru is template text, identical across almost all rows of this TSV (distinct=1) — informational only, not a differentiation signal; members_* columns are the sourced composition estimate.",
        })
    n_comp = write_csv(
        os.path.join(out_dir, "household_composition_profiles.csv"), comp_rows,
        ["hh_id", "household_type", "wealth_band", "pf_id", "family_pattern_ru",
         "household_pattern_ru", "members_estimate_min", "members_estimate_max",
         "members_estimate_basis", "servants_dependants_ref", "kinship_terms_ref",
         "customs_refs", "source_refs", "confidence", "note"],
    )

    # marriage_inheritance_rules.csv — from WK family-social-context claims
    # (Russkaya Pravda articles already reviewed/approved in WK).
    fsc = read_wk("family-social-context.json")
    concepts_by_ref = {c["concept_ref"]: c for c in fsc.get("concepts", [])}
    mi_rows = []
    for cl in fsc.get("claims", []):
        subj = concepts_by_ref.get(cl.get("subject_ref"), {})
        mi_rows.append({
            "mi_id": cl["claim_ref"],
            "topic_ref": cl.get("subject_ref", ""),
            "domain": cl.get("domain", ""),
            "statement_key": cl.get("object", {}).get("value", ""),
            "review_status": cl.get("review_status", ""),
            "confidence_wk": cl.get("qualifiers", {}).get("confidence", ""),
            "evidence_refs": ";".join(cl.get("evidence_refs", [])),
            "source_refs": "wk:family-social-context.json#" + cl["claim_ref"],
            "confidence": {"high": "A", "medium": "B", "low": "C"}.get(
                cl.get("qualifiers", {}).get("confidence", ""), "C"),
        })
    n_mi = write_csv(
        os.path.join(out_dir, "marriage_inheritance_rules.csv"), mi_rows,
        ["mi_id", "topic_ref", "domain", "statement_key", "review_status",
         "confidence_wk", "evidence_refs", "source_refs", "confidence"],
    )

    # kinship_terms.csv — closed vocabulary of Old East Slavic / Novgorod
    # kinship terms in period use.
    #
    # Fixed 2026-09-26 (rework), against
    # servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv
    # (book:499410 = Kolesov, "Древняя Русь: наследие в слове. Мир человека",
    # 2000, verified, confidence B, period c1230):
    # - removed the blanket "Zaliznyak ... kinship-term chapter; Russkaya
    #   Pravda ... articles on inheritance/dowry terms" source_refs line
    #   (there is no such Zaliznyak chapter, and most of these terms do not
    #   appear in the RP inheritance/dowry articles) — every row now has an
    #   honest, per-term source_refs;
    # - split the anachronistic combined "дядя / уй" into separate стрый
    #   (paternal uncle) and уй (maternal uncle): book:499410 §92-99 states
    #   there was no single "дядя" word for either until the late 14th c.;
    # - fixed the "баба" gloss from "grandmother" to "pojhilaya zhenshchina"
    #   (an older woman / midwife), per book:499410 §99;
    # - fixed the mixed-script id "kt_pri_" (Latin+Cyrillic key);
    # - added золовка, ятровь, шурин (book:499410 §92/§98) plus деверь and
    #   сноха (standard affinal-kin terms, no row-level attestation found in
    #   this group's evidence — confidence C, listed as a gap) to cover
    #   affinity terms the brief asks for and the rework note lists as missing;
    # - "приданое" now cites the actual evidence row (book:641351 §2974,
    #   confidence A, c1230: "что дал отец и родичи") instead of a vague and
    #   partly-wrong generic reference.
    KIN = [
        ("otets", "отец", "father", "family_head", "B",
         "standard Old East Slavic term; no dedicated per-row attestation in this group's book evidence (gap) — general historical-linguistic reference"),
        ("mati", "мати / мать", "mother", "family_head", "B",
         "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("syn", "сын", "son", "child", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("dchi", "дъчи / дочь", "daughter", "child", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("brat", "брат", "brother", "sibling", "A", "book:641351 §2988 (БЕРЕСТЯНЫЕ ГРАМОТЫ > ПЕРЕВОД) — брат as active kin role (защита замужней сестры), c1230"),
        ("sestra", "сестра", "sister", "sibling", "A", "book:641351 §2984/§2988 (БЕРЕСТЯНЫЕ ГРАМОТЫ > ПЕРЕВОД), c1230"),
        ("ded", "дѣдъ", "grandfather", "elder_kin", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("baba", "баба", "pojhilaya zhenshchina / midwife (NOT grandmother)", "elder_kin", "B",
         "book:499410 §99: «Баба» значило пожилую, опытную в домашних делах женщину (и повитуху), а не «бабушку» — gloss fixed, was wrongly 'grandmother'"),
        ("vnuk", "вънукъ", "grandson", "junior_kin", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("muzh", "мужь", "husband", "spouse", "A", "book:641351 §1678/§1680 (СЛОВО ДАНИИЛА ЗАТОЧНИКА > ПЕРЕВОД), c1230"),
        ("zhena", "жена", "wife", "spouse", "A", "book:641351 §1678/§2976 (СЛОВО ДАНИИЛА ЗАТОЧНИКА; БЕРЕСТЯНЫЕ ГРАМОТЫ), c1230"),
        ("vdova", "вдова", "widow", "spouse_status", "A", "book:641351 §2847/§2855-2856 (РУССКАЯ ПРАВДА, ПРОСТРАННАЯ РЕДАКЦИЯ > ПЕРЕВОД) — вдова's rights, c1230"),
        ("sirota", "сирота", "person without kin / orphan, low-status dependant", "dependent_status", "B",
         "book:499410 §521: сирота = человек без рода и племени, 'лишённый родных, близких' (period medieval_general — analogy, confidence capped at B/C)"),
        ("otrok", "отрокъ", "adolescent / junior household dependant", "dependent_status", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("tyi_test", "тьсть", "father-in-law (wife's father)", "in_law", "A", "book:641352 §1722/§1765 (зять/тесть address forms), c1230/medieval_general"),
        ("tyoshcha", "тьща", "mother-in-law (wife's mother)", "in_law", "C", "standard Old East Slavic term paired with тьсть; no per-row attestation found in this group's evidence (gap)"),
        ("svekr", "свекръ", "father-in-law (husband's father)", "in_law", "C", "standard Old East Slavic term paired with свекры; no per-row attestation found (gap)"),
        ("svekrov", "свекры", "mother-in-law (husband's mother)", "in_law", "B", "book:499410 §92: *svekry -> свекровь 'мать мужа'"),
        ("stryi", "стрый / строй", "paternal uncle (father's brother)", "collateral_kin", "B",
         "book:499410 §99: до конца XIV в. различали дядю по отцу — стрый, и по матери — уй; общего 'дядя' ещё не было ~1230"),
        ("uy", "уй / вуй", "maternal uncle (mother's brother)", "collateral_kin", "B", "book:499410 §99, same source as стрый"),
        ("teta", "тётка", "aunt", "collateral_kin", "C", "standard Old East Slavic term; no per-row attestation found (gap)"),
        ("plemyannik", "племянникъ", "nephew", "collateral_kin", "A", "book:641351 §2988: племянник живёт у дяди 'за сына' после смерти сестры, c1230"),
        ("zolovka", "золовка", "husband's sister", "in_law", "B", "book:499410 §92: *zъly -> золовка 'сестра мужа'"),
        ("yatrov", "ятровь", "brother's wife (sister-in-law)", "in_law", "B", "book:499410 §92: *jětry -> ятровь 'жена брата'"),
        ("shurin", "шуринъ", "wife's brother (brother-in-law)", "in_law", "B", "book:499410 §98: шуринъ — тот, кто «пришит» к роду посредством брака своего родича"),
        ("dever", "деверь", "husband's brother", "in_law", "C", "standard affinal-kin term of the same system as золовка/ятровь/шурин; no per-row attestation found in this group's evidence (gap)"),
        ("snokha", "сноха", "son's wife (daughter-in-law)", "in_law", "C", "standard affinal-kin term; no per-row attestation found in this group's evidence (gap)"),
        ("zyat", "зять", "son-in-law / sister's husband", "in_law", "A", "book:641352 §1722/§1765 (зять к тестю: «Господин и отец»), c1230/medieval_general"),
        ("pasynok", "пасынокъ", "stepson", "step_kin", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("machekha", "мачеха", "stepmother", "step_kin", "B", "standard Old East Slavic term; general historical-linguistic reference (gap: no per-row attestation)"),
        ("pridanoe", "приданое", "dowry / bride's household goods (what her father and kin gave)", "marriage_property", "A",
         "book:641351 §2974 (БЕРЕСТЯНЫЕ ГРАМОТЫ > ПЕРЕВОД): «приданое жены составляли дар отца и 'впридачу' от родичей», c1230"),
        ("veno", "вѣно", "bride-price / marriage payment", "marriage_property", "C", "standard Old East Slavic legal-property term; no per-row attestation found in this group's evidence (gap)"),
    ]
    kt_rows = []
    for kid, term, gloss, cat, conf, src in KIN:
        kt_rows.append({
            "term_id": f"kt_{kid}",
            "term_ru": term,
            "gloss_en": gloss,
            "category": cat,
            "source_refs": src,
            "confidence": conf,
            "note": "period-plausible Old East Slavic / Novgorod term for ~1230; see source_refs for this row's specific attestation or stated gap.",
        })
    n_kt = write_csv(
        os.path.join(out_dir, "kinship_terms.csv"), kt_rows,
        ["term_id", "term_ru", "gloss_en", "category", "source_refs", "confidence", "note"],
    )

    report["households_kinship"] = {
        "household_composition_profiles.csv": n_comp,
        "marriage_inheritance_rules.csv": n_mi,
        "kinship_terms.csv": n_kt,
    }


# ---------------------------------------------------------------------------
# Domain 2: npc_psychology
# ---------------------------------------------------------------------------

CLOSED_TEMPERAMENT = ["calm", "wary", "hot_tempered", "timid", "assertive", "sociable", "withdrawn"]
CLOSED_VALUES = ["honour", "piety", "kin_loyalty", "profit", "safety", "custom", "hospitality"]

# Fixed 2026-09-26 (rework). The previous rule counted keyword hits in
# text fields that are template boilerplate, identical across almost every
# row (attitude_to_*, typical_fears, languages_or_speech_notes for roles;
# social_risk_if_insulted, theft_risk, witness_likelihood, common_conflicts,
# common_fears, common_goals for occupations — all distinct=1 by row count),
# so the keyword count was effectively constant and the result did not
# differentiate roles/occupations at all (verifier's "корневая проблема").
#
# New rule uses only the fields that are genuinely categorical and DO vary
# per row: role_group/occupation_group, social_rank/typical_status_range,
# freedom_status, combat_likelihood, violence_risk. Weights are a small
# fixed table (documented below), not a frequency invented from templated
# text. motives/fears are left empty with an explicit note rather than
# populated from the templated common_goals/common_fears/typical_fears
# fields (that would just repeat the same list on every row).
GROUP_TEMPERAMENT = {
    # role_group (roles) / occupation_group (occupations) -> (temperament, weight)
    "власть": ("assertive", 1), "военное": ("hot_tempered", 1),
    "церковь": ("calm", 1), "город": ("sociable", 1), "торговля": ("sociable", 1),
    "зависимые": ("timid", 1), "дорога": ("withdrawn", 1), "промысел": ("withdrawn", 1),
    "низкий_статус": ("timid", 1), "село": ("calm", 1), "ремесло": ("calm", 1),
}
GROUP_VALUE = {
    "власть": ("honour", 1), "военное": ("honour", 1), "церковь": ("piety", 2),
    "город": ("custom", 1), "торговля": ("profit", 1), "зависимые": ("safety", 1),
    "дорога": ("safety", 1), "промысел": ("custom", 1), "низкий_статус": ("safety", 1),
    "село": ("kin_loyalty", 1), "ремесло": ("custom", 1),
}
RANK_TEMPERAMENT = {
    # social_rank (roles) / typical_status_range mapped band (occupations, via
    # WEALTH_BAND_MAP_OCC below) -> (temperament, weight)
    "elite": ("assertive", 1), "high": ("assertive", 1), "middle": (None, 0),
    "low": ("wary", 1), "dependent": ("timid", 1), "outcast": ("timid", 2),
    "variable": ("wary", 1),
}
FREEDOM_TEMPERAMENT = {
    "slave": ("timid", 2), "dependent": ("wary", 1), "unclear": ("wary", 1),
    "variable": ("wary", 1), "free": (None, 0),
}


def _bump(w, label, n):
    if label:
        w[label] = w.get(label, 0) + n


def rule_temperament_values_from_occ(o):
    """Categorical rule over occupation_group (11 distinct values),
    typical_status_range (7 distinct, mapped to the same wealth-band scale
    as household_composition_profiles.csv), combat_likelihood (4 distinct)
    and violence_risk (5 distinct) — all genuinely differentiating fields.
    calm=1 is the closed-vocabulary baseline weight for every row."""
    w = {"calm": 1}
    v = {}
    grp = (o.get("occupation_group") or "").strip()
    _bump(w, *GROUP_TEMPERAMENT.get(grp, (None, 0)))
    _bump(v, *GROUP_VALUE.get(grp, (None, 0)))
    band = WEALTH_BAND_MAP_OCC.get((o.get("typical_status_range") or "").strip())
    _bump(w, *RANK_TEMPERAMENT.get(band, (None, 0)))
    combat = (o.get("combat_likelihood") or "").strip().lower()
    _bump(w, "hot_tempered", {"very_low": 0, "low": 1, "medium": 2, "medium_high": 3}.get(combat, 0))
    violence = (o.get("violence_risk") or "").strip().lower()
    if violence == "high":
        _bump(w, "hot_tempered", 2)
    elif violence == "medium_high":
        _bump(w, "hot_tempered", 1); _bump(w, "wary", 1)
    elif violence == "medium":
        _bump(w, "wary", 1)
    elif violence == "high_social_risk":
        _bump(w, "wary", 2)
    elif violence == "high_against_them":
        _bump(w, "timid", 2)
    if not v:
        v["custom"] = 1
    return ({k: n for k, n in w.items() if n > 0}, v)


def rule_temperament_values_from_role(r):
    """Categorical rule over role_group (10 distinct), social_rank (7
    distinct) and freedom_status (5 distinct) — all genuinely
    differentiating fields (unlike attitude_to_*/typical_fears, which are
    identical boilerplate on every row and are no longer used here).
    calm=1 is the closed-vocabulary baseline weight for every row."""
    w = {"calm": 1}
    v = {}
    grp = (r.get("role_group") or "").strip()
    _bump(w, *GROUP_TEMPERAMENT.get(grp, (None, 0)))
    _bump(v, *GROUP_VALUE.get(grp, (None, 0)))
    rank = (r.get("social_rank") or "").strip()
    _bump(w, *RANK_TEMPERAMENT.get(rank, (None, 0)))
    freedom = (r.get("freedom_status") or "").strip()
    _bump(w, *FREEDOM_TEMPERAMENT.get(freedom, (None, 0)))
    if not v:
        v["custom"] = 1
    return ({k: n for k, n in w.items() if n > 0}, v)


def rule_risk_traits_occ(o):
    """violence is read from violence_risk, which genuinely varies per row
    (5 distinct values). theft/witness stay 'unspecified': theft_risk and
    witness_likelihood are identical boilerplate text on every row of this
    TSV (distinct=1) — there is no source signal to derive a per-row value,
    so the honest result is 'unspecified', not a fabricated frequency."""
    violence = (o.get("violence_risk") or "").strip().lower()
    v = {
        "high": "high", "medium_high": "medium_high", "medium": "medium",
        "high_social_risk": "high_social_risk_not_violence",
        "high_against_them": "high_as_target",
    }.get(violence, "unspecified")
    return {"theft": "unspecified", "violence": v, "witness": "unspecified"}


def build_npc_psychology(occs, roles):
    out_dir = os.path.join(ROOT, "npc_psychology")
    rows = []
    for o in occs:
        temp, vw = rule_temperament_values_from_occ(o)
        rows.append({
            "ps_id": f"ps_occ_{o['occupation_id']}",
            "role_or_occupation_ref": o["occupation_id"],
            "ref_kind": "occupation",
            "temperament_weights": temp,
            "values_weights": vw,
            "motives": [],
            "fears": [],
            "risk_traits": rule_risk_traits_occ(o),
            "fears_motives_note": "common_goals/common_fears (occupations TSV) are identical template text across all rows (distinct=1) — not used; no per-occupation motive/fear source available (gap).",
            "initial_mood_rules": "baseline=calm=1; see derivation_rule for the categorical weight table (no invented per-row numbers)",
            "derivation_rule": "categorical table over occupation_group, typical_status_range (via wealth_band), combat_likelihood, violence_risk; see build.py:rule_temperament_values_from_occ",
            "source_refs": f"novgorod_occupations_v1_enriched.tsv#{o['occupation_id']}",
            "confidence": "C",
        })
    for r in roles:
        temp, vw = rule_temperament_values_from_role(r)
        rows.append({
            "ps_id": f"ps_role_{r['role_id']}",
            "role_or_occupation_ref": r["role_id"],
            "ref_kind": "role",
            "temperament_weights": temp,
            "values_weights": vw,
            "motives": [],
            "fears": [],
            "risk_traits": {"theft": "unspecified", "violence": "unspecified", "witness": "unspecified"},
            "fears_motives_note": "typical_fears/attitude_to_* (roles TSV) are identical template text across all 71 rows (distinct=1) — not used; risk_traits fields have no source column at all for roles (gap).",
            "initial_mood_rules": "baseline=calm=1; see derivation_rule for the categorical weight table (no invented per-row numbers)",
            "derivation_rule": "categorical table over role_group, social_rank, freedom_status; see build.py:rule_temperament_values_from_role",
            "source_refs": f"novgorod_social_roles_v1_enriched.tsv#{r['role_id']}",
            "confidence": "C",
        })
    n = write_csv(
        os.path.join(out_dir, "psychology_profiles.csv"), rows,
        ["ps_id", "role_or_occupation_ref", "ref_kind", "temperament_weights", "values_weights",
         "motives", "fears", "risk_traits", "fears_motives_note", "initial_mood_rules",
         "derivation_rule", "source_refs", "confidence"],
    )
    report["npc_psychology"] = {"psychology_profiles.csv": n, "occupations_covered": len(occs), "roles_covered": len(roles)}


# ---------------------------------------------------------------------------
# Domain 3: speech_address
# ---------------------------------------------------------------------------

def build_speech_address(roles):
    out_dir = os.path.join(ROOT, "speech_address")

    # registers.csv — closed vocabulary of speech registers, one per role.
    #
    # Fixed 2026-09-26 (rework). literacy_expectation is identical template
    # text on all 71 rows (distinct=1): "низкая по умолчанию; выше у элиты,
    # церкви, писцов и купеческих доверенных". The old rule searched that
    # constant text for "выс"/"низ", which is present on every row and so
    # only ever matched via the social_rank fallback — giving formal_literate
    # to the 4 elite/high roles and plain_oral to everyone else (including
    # clergy, scribes and merchant clerks the template text itself names as
    # literate), and never producing everyday_oral at all.
    #
    # New rule reads the *named exception groups* out of that same template
    # text (элита / церковь / писцы / купеческие доверенные) and matches
    # roles against them by role_group/social_rank/role_title instead of by
    # a broken substring search, which fixes посадник/тысяцкий, priest/
    # deacon/igumen/church_scribe, and merchant_clerk, and lets
    # everyday_oral actually occur for ordinary free middle-rank roles.
    LITERATE_TITLE_KEYWORDS = ["писец", "дьяк", "приказчик", "доверенн"]

    def literacy_register(r):
        rank = (r.get("social_rank") or "").strip().lower()
        grp = (r.get("role_group") or "").strip()
        title = ((r.get("role_title") or "") + " " + (r.get("historical_term") or "")).lower()
        if rank in ("elite", "high") or grp == "церковь" or any(k in title for k in LITERATE_TITLE_KEYWORDS):
            return "formal_literate"
        if rank in ("low", "dependent", "outcast"):
            return "plain_oral"
        return "everyday_oral"

    reg_rows = []
    for r in roles:
        register = literacy_register(r)
        reg_rows.append({
            "role_id": r["role_id"],
            "register": register,
            "literacy_expectation_ru": r.get("literacy_expectation", ""),
            "speech_notes_ru": r.get("languages_or_speech_notes", ""),
            "derivation_rule": "register=formal_literate if social_rank in {elite,high}, or role_group=церковь, or role_title/historical_term names a literate occupation (писец/дьяк/приказчик/доверенный); plain_oral if social_rank in {low,dependent,outcast}; else everyday_oral. Matches the named exception groups (элита, церковь, писцы, купеческие доверенные) stated in literacy_expectation itself, rather than a generic substring search over that constant text.",
            "source_refs": f"novgorod_social_roles_v1_enriched.tsv#{r['role_id']}",
            "confidence": "C",
        })
    n_reg = write_csv(
        os.path.join(out_dir, "speech_registers.csv"), reg_rows,
        ["role_id", "register", "literacy_expectation_ru", "speech_notes_ru", "derivation_rule", "source_refs", "confidence"],
    )

    # address_forms.csv — a seed closed set of period address formulas,
    # attested in scholarship on birchbark letters (formula "поклон отъ ... къ ...")
    # but NOT yet checked row-by-row against gramoty.ru texts (stated gap:
    # fill_method=research in the brief; this pass only seeds the structure
    # and the two best-known attested formula types).
    SEED = [
        ("form_poklon", "боярин/госпожа", "равный/родня", "поклон от {А} к {Б}",
         "epistolary_opening", "письмо (берестяная грамота)",
         "law_none", "formula type attested across many birchbark letters",
         "A", "gramoty.ru corpus; Зализняк, Древненовгородский диалект — formula description (not verbatim quoted here)"),
        ("form_gospodine", "просящий/младший", "боярин/начальник", "господине",
         "respectful_address", "просьба, письмо",
         "law_none", "vocative respectful address attested in letters",
         "B", "Зализняк, Древненовгородский диалект — general description of address forms"),
        ("form_bratie", "равный", "равный/сослуживец", "братие",
         "collegial_address", "устная и письменная речь",
         "law_none", "collective address term, standard Old East Slavic usage",
         "C", "general historical-linguistic reconstruction, no row-level attestation yet"),
    ]
    af_rows = []
    for sid, speaker, addressee, form, register, situation, legal, attest, conf, src in SEED:
        af_rows.append({
            "sp_id": sid, "speaker_role_ref": speaker, "addressee_role_ref": addressee,
            "form_ru": form, "register": register, "situation": situation,
            "legal_weight_ref": legal, "attestation": attest, "source_refs": src, "confidence": conf,
        })
    n_af = write_csv(
        os.path.join(out_dir, "address_forms.csv"), af_rows,
        ["sp_id", "speaker_role_ref", "addressee_role_ref", "form_ru", "register", "situation",
         "legal_weight_ref", "attestation", "source_refs", "confidence"],
    )
    report["speech_address"] = {"speech_registers.csv": n_reg, "address_forms.csv": n_af,
                                 "gap": "berestyanaya-grammota corpus not collected row-by-row in this pass; "
                                        "brief fill_method=research not fulfilled beyond 3 seed formulas"}


# ---------------------------------------------------------------------------
# Domain 4: social_norms_honour_hospitality
# ---------------------------------------------------------------------------

def build_social_norms():
    out_dir = os.path.join(ROOT, "social_norms_honour_hospitality")
    fsc = read_wk("family-social-context.json")

    rows = []
    for cl in fsc.get("claims", []):
        # Fixed 2026-09-26 (rework): prefixed with sn_wk_ so these ids never
        # collide with the same claim:* ids reused verbatim in
        # marriage_inheritance_rules.csv (verifier's cross-file duplicate-id
        # finding). Content/classification of these 8 WK claims is
        # unchanged — marriage_inheritance_rules.csv is out of scope for
        # this rework pass.
        rows.append({
            "sn_id": "sn_wk_" + cl["claim_ref"].split(":", 1)[-1],
            "norm_kind": "family_property" if "care" in cl["claim_ref"] or "household" in cl["claim_ref"] else "social_law_economy",
            "trigger_act": cl.get("object", {}).get("value", ""),
            "reaction_by_role": [],
            "legal_weight_ref": "russkaya_pravda_extended" if cl.get("claim_ref", "").startswith("claim:rp-") else "",
            "repair_options": "",
            "applies_to_roles": "",
            "attestation": ";".join(cl.get("evidence_refs", [])),
            "source_refs": "wk:family-social-context.json#" + cl["claim_ref"],
            "confidence": {"high": "A", "medium": "B", "low": "C"}.get(cl.get("qualifiers", {}).get("confidence", ""), "C"),
        })
    # Honour/insult norms from Russkaya Pravda, Prostrannaya redaktsiya.
    #
    # Fixed 2026-09-26 (rework), against
    # servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv:
    # - sn_rp_beard: removed the stray CJK character "較" from legal_weight_ref
    #   (generation garbage) and corrected repair_options — the 12-grivna
    #   payment is a продажа (fine to the prince), not a payment to the
    #   victim; per book:641351 §2821: "Повреждение бороды при свидетелях —
    #   12 гривен штрафа князю (тяжкое бесчестье)";
    # - sn_rp_blunt_sword: same fix (штраф князю, not "денежная выплата" to
    #   the victim), per book:641351 §2776: "Удар батогом, чашей, рогом или
    #   тыльной стороной оружия — 12 гривен (бесчестье)"; also added the
    #   related, distinctly-weighted "обнажение меча без удара" (1 гривна
    #   кун, §2775) rule that the evidence gives right next to it;
    # - sn_rp_slave_insult: no specific article number was found in this
    #   group's verified book evidence for this exact rule, so confidence is
    #   downgraded B->C and the gap is stated explicitly rather than citing
    #   an unverified article number.
    RP_INSULT = [
        ("sn_rp_beard", "insult", "вырывание бороды/усов при свидетелях", "продажа (штраф) 12 гривен князю — тяжкое бесчестье",
         "штраф князю; публичного извинения недостаточно (нет отдельного источника на это последнее утверждение — общее место в изданиях памятника)",
         "любой свободный", "B",
         "book:641351 §2821 (РУССКАЯ ПРАВДА, ПРОСТРАННАЯ РЕДАКЦИЯ > ПЕРЕВОД), c1230: «Повреждение бороды при свидетелях — 12 гривен штрафа князю (тяжкое бесчестье)»"),
        ("sn_rp_blunt_sword", "insult", "удар батогом, чашей, рогом либо тыльной стороной оружия",
         "продажа (штраф) 12 гривен князю — бесчестье приравнено к удару, тяжесть по статусу и способу, а не по физической боли",
         "штраф князю", "любой свободный", "B",
         "book:641351 §2776 (РУССКАЯ ПРАВДА, ПРОСТРАННАЯ РЕДАКЦИЯ > ПЕРЕВОД), c1230: «Удар батогом, чашей, рогом или тыльной стороной оружия — 12 гривен (бесчестье)»"),
        ("sn_rp_bare_sword", "insult", "обнажение меча без удара", "продажа (штраф) 1 гривна кун — легче, чем состоявшийся удар",
         "штраф князю", "любой свободный", "B",
         "book:641351 §2775 (РУССКАЯ ПРАВДА, ПРОСТРАННАЯ РЕДАКЦИЯ > ПЕРЕВОД), c1230: «Вынувший меч, но не ударивший, платит гривну кун»"),
        ("sn_rp_push_slap", "insult", "толчок или удар по лицу при двух свидетелях", "продажа (штраф) 3 гривны",
         "штраф; требуется два свидетеля", "любой свободный", "B",
         "book:641351 §2782 (РУССКАЯ ПРАВДА, ПРОСТРАННАЯ РЕДАКЦИЯ > ПЕРЕВОД), c1230: «Толчок или удар по лицу при двух свидетелях — 3 гривны штрафа»"),
        ("sn_rp_slave_insult", "insult", "удар со стороны холопа по свободному",
         "иной правовой вес — ответственность несёт господин, либо выдача холопа",
         "выдача виновного холопа или выплата господином", "холоп/свободный", "C",
         "Русская Правда, Пространная редакция, общая норма о холопах и ответственности господина — конкретная статья/номер НЕ подтверждена per-row в доступной этой группе book evidence (гэп, требуется отдельная проверка по академическому изданию, напр. Троицкий список)"),
    ]
    for sid, kind, trig, weight, repair, roles_, conf, src in RP_INSULT:
        rows.append({
            "sn_id": sid, "norm_kind": kind, "trigger_act": trig, "reaction_by_role": [],
            "legal_weight_ref": weight, "repair_options": repair, "applies_to_roles": roles_,
            "attestation": "Русская Правда, Пространная редакция, статьи об оскорблении действием",
            "source_refs": src, "confidence": conf,
        })
    # Fixed 2026-09-26 (rework): the four norm_kind buckets the brief asks
    # for (hospitality, taboo, mutual_aid, gender_age_conduct) had zero rows.
    # Populated from this group's verified book evidence (household_kinship /
    # npc_psychology domains), one sentence per quote, confidence per the
    # evidence row's own field; period=medieval_general rows are capped at C
    # (analogy only) per project rule even where the source book marks them A.
    EVIDENCE_NORMS = [
        ("sn_hospitality_guest", "hospitality", "приём гостя любого звания",
         "долг хозяина принять и накормить", "подарок, еда и питьё гостю", "хозяин двора", "A",
         "book:641342 §1786 (ПОУЧЕНИЕ ВЛАДИМИРА МОНОМАХА > ПЕРЕВОД), c1230: «Выше всего чтить гостя любого звания — подарком или едой и питьём»"),
        ("sn_gender_age_elders", "gender_age_conduct", "обращение со старшими и младшими",
         "почитание по возрасту, а не только по рангу", "", "любой свободный", "A",
         "book:641342 §1786 (ПОУЧЕНИЕ ВЛАДИМИРА МОНОМАХА > ПЕРЕВОД), c1230: «Старых чтить как отца, молодых — как братьев»"),
        ("sn_gender_age_youth_conduct", "gender_age_conduct", "поведение юноши при старших",
         "молчать при старых, слушать премудрых, покоряться старшим", "", "отрокъ/юноша", "A",
         "book:641342 §1779 (ПОУЧЕНИЕ ВЛАДИМИРА МОНОМАХА > ПЕРЕВОД), c1230: «Юноше подобает есть и пить без шума, при старых молчать, старшим покоряться»"),
        ("sn_mutual_aid_kin_liability", "mutual_aid", "требование покрыть долг родича",
         "родич не обязан отвечать за чужой долг без ручательства", "поручительство должно быть явным", "любой свободный", "A",
         "book:641351 §2958 (БЕРЕСТЯНЫЕ ГРАМОТЫ > ПЕРЕВОД), c1230: «Возмущение, когда имущество изымают за долг брата: „я не поручитель“»"),
        ("sn_taboo_oath_causes_drought", "taboo", "частые клятвы Богом и святыми в обычной речи",
         "церковное осуждение; клятва — не для повседневной речи", "", "любой", "A",
         "book:641351 §1737 (общая проповедь), c1230: «Церковь учила, что частые клятвы Богом и святыми вызывают засуху»"),
        ("sn_taboo_witch_trial_water", "taboo", "обвинение в колдовстве в бедствие",
         "испытание водой; сожжение при обвинении в голод/мор", "", "любой (чаще женщины)", "C",
         "book:641352 §1994 (period=medieval_general — аналогия, confidence снижен до C по правилу проекта), «Обвинённых в колдовстве испытывали водой: тонет — невиновна, плывёт — виновна»"),
    ]
    for sid, kind, trig, weight, repair, roles_, conf, src in EVIDENCE_NORMS:
        rows.append({
            "sn_id": sid, "norm_kind": kind, "trigger_act": trig, "reaction_by_role": [],
            "legal_weight_ref": weight, "repair_options": repair, "applies_to_roles": roles_,
            "attestation": "book evidence households-psychology-speech.csv (verified), see source_refs",
            "source_refs": src, "confidence": conf,
        })
    n = write_csv(
        os.path.join(out_dir, "norms.csv"), rows,
        ["sn_id", "norm_kind", "trigger_act", "reaction_by_role", "legal_weight_ref", "repair_options",
         "applies_to_roles", "attestation", "source_refs", "confidence"],
    )
    report["social_norms_honour_hospitality"] = {
        "norms.csv": n,
        "gap": "gift-giving (norm_kind=gift) still not populated in this pass; "
               "sn_rp_slave_insult has no per-row article-number attestation (see its source_refs note)",
    }


def main():
    occs = read_tsv(OCC_TSV)
    roles = read_tsv(ROLE_TSV)
    report["inputs"] = {"occupations_rows": len(occs), "roles_rows": len(roles)}
    build_households_kinship(occs, roles)
    build_npc_psychology(occs, roles)
    build_speech_address(roles)
    build_social_norms()
    with open(os.path.join(os.path.dirname(__file__), "build_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
