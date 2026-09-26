#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Builds religion/church_practice.csv and religion/lifecycle_rites_burial.csv.

Primary source: book evidence, group time-calendar-church, domain
religion_church (162 rows) and a handful of lifecycle-flavoured rows
embedded in domain calendar_feasts_fasts (радуница, крещение-not-every-week
etc.). Fetched read-only via:
  ssh servak "cat /srv/novgorod-work/data/books/evidence/time-calendar-church.csv"
The raw evidence CSV (with its per-row 'quote' field) is NOT copied into the
repo -- only book_id/authors/title/year/section_path/para_no are cited as
source_refs, and this script uses each row's already-paraphrased 'value'
field (not the verbatim 'quote' field) for the dataset's own description,
trimmed to stay well inside the "own words" rule.

Secondary sources:
  - wk:social-institutions.json (approved claims: burial containers,
    church-people statutory category, priest/baptism statutory context)
  - main:data/novgorod-region/novgorod_social_roles_v1_enriched.tsv
    (attitude_to_church, religious_knowledge_level -- per social role)
  - main:data/novgorod-region/novgorod_occupations_v1_enriched.tsv
    (typical_religious_behavior -- flagged as template-uniform, see
    time/schedules_routines.csv's own gap note; NOT re-duplicated here)

kind classification is a deterministic keyword/fact_type heuristic (see
KIND_RULES below), not manual per-row judgement -- keeps 162 rows
reproducible from one script run rather than hand-authored.
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)
# Evidence CSV lives only in the scratchpad (never copied into the repo).
EVIDENCE_CSV = (
    "C:/Users/Slaven/AppData/Local/Temp/claude/"
    "C--Users-Slaven-Documents-Novgorod/ff9acd1f-6ccd-44a9-bc42-216c6bc662b8/"
    "scratchpad/gb-collect-time-calendar-church/book-evidence.csv"
)

WK_SOCIAL = (
    "C:/Users/Slaven/Documents/Novgorod-game-base/data/world-catalogs/"
    "novgorod/world-knowledge/production-v1/social-institutions.json"
)

SOCIAL_ROLES_TSV = "C:/Users/Slaven/Documents/Novgorod/data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"

CHURCH_FIELDS = [
    "rl_id", "kind", "name_ru", "roles", "pf_ids", "calendar_refs", "items_refs",
    "sensory_cues", "source_refs", "confidence", "period", "status", "note",
]
LIFECYCLE_FIELDS = [
    "lr_id", "rite_kind", "name_ru", "roles", "pf_ids", "calendar_refs", "items_refs",
    "visible_traces", "sensory_cues", "attestation", "source_refs", "confidence",
    "period", "status", "note",
]

# --- classification heuristics -------------------------------------------

LIFECYCLE_KEYWORDS = {
    "birth": ["кормилица и пост перед крещением"],
    "baptism": ["крещение младенцев", "крещение у варяжского попа", "сорокадневный пост перед крещением",
                "пост матери перед крещением", "препятствия к крещению", "крещение не во все недели"],
    "wedding": ["венчание — для бояр и князей", "попы на свадьбах и пирах", "супружество в великий пост"],
    "death": ["поп: вдовство и прелюбодеяние попадьи", "епитимья за некрещёного умершего ребёнка",
              "самоубийцы: погребение и поминовение", "погребение посадников в св. софии и юрьеве"],
    "commemoration": ["радуница — поминовение предков", "кутья и сорокоуст"],
}


def classify_lifecycle(entity_ru: str):
    low = entity_ru.lower()
    for rite_kind, keys in LIFECYCLE_KEYWORDS.items():
        for k in keys:
            if k in low or low in k:
                return rite_kind
    return None


BELIEF_FACT_TYPES = {"taboo_or_custom"}
INSTITUTION_HINTS = ["монастырь", "собор", "владык", "епитимь", "суд", "казна", "десятин", "устав",
                      "поставлен", "избрание", "низложение", "изгнание", "приход", "владычный", "стольник"]
RITE_HINTS = ["исповед", "причасти", "погребен", "крещен", "венчан", "постриг", "отпеван", "поминов"]


def classify_kind(fact_type: str, entity_ru: str, value: str) -> str:
    low = (entity_ru + " " + value).lower()
    if fact_type in BELIEF_FACT_TYPES:
        return "belief"
    if any(h in low for h in RITE_HINTS):
        return "rite"
    if any(h in low for h in INSTITUTION_HINTS):
        return "institution"
    if fact_type in ("use", "technique", "description", "presence_in_region"):
        return "practice"
    if fact_type == "event":
        return "institution"  # historical/institutional event; cross-ref historical_events domain
    return "practice"


SENSORY_MAP = [
    (["звон", "колокол", "било", "клепало"], "звон/удар в било или клепало"),
    (["пение", "литург"], "церковное пение"),
    (["ладан", "кандил", "лампад", "хорос"], "свет и запах масляных лампад"),
    (["кадил"], "запах ладана"),
    (["скоморох", "гусл"], "звуки гуслей и скоморошьих игрищ"),
]


def sensory_cues(text: str):
    low = text.lower()
    seen = []
    for keys, cue in SENSORY_MAP:
        if any(k in low for k in keys) and cue not in seen:
            seen.append(cue)
    return seen


CALENDAR_HINTS = [
    (["великий пост"], "time/calendar_1230_1250.csv#cal_mv_great_lent_start_* (movable, per year)"),
    (["пасх", "причасти"], "time/calendar_1230_1250.csv#cal_mv_easter_* (movable, per year)"),
    (["radunitsa", "радуниц"], "time/calendar_1230_1250.csv#cal_mv_radunitsa_* (movable, per year)"),
    (["петров"], "time/calendar_1230_1250.csv#cal_mv_petrov_start_*/cal_mv_petrov_end_* (movable, per year)"),
]


def calendar_refs(text: str):
    low = text.lower()
    return [ref for keys, ref in CALENDAR_HINTS if any(k in low for k in keys)]


def source_ref(row):
    return (f"book:{row['book_id']} ({row['authors']}, {row['title']}, {row['year']}) "
            f"§{row['section_path']} ¶{row['para_no']}")


def note_from(row):
    n = (row.get("note") or "").strip()
    period = row.get("period") or ""
    prefix = f"period={period}. " if period else ""
    return (prefix + n).strip()


def main():
    with open(EVIDENCE_CSV, encoding="utf-8") as f:
        evidence = list(csv.DictReader(f))
    religion_rows_src = [r for r in evidence if r["domain"] == "religion_church"]
    calendar_rows_src = [r for r in evidence if r["domain"] == "calendar_feasts_fasts"]

    church_rows = []
    lifecycle_rows = []
    ch_i = 0
    lc_i = 0

    for r in religion_rows_src + calendar_rows_src:
        rite_kind = classify_lifecycle(r["entity_ru"])
        if rite_kind:
            lc_i += 1
            lifecycle_rows.append({
                "lr_id": f"lr_{lc_i:03d}",
                "rite_kind": rite_kind,
                "name_ru": r["entity_ru"],
                "roles": json.dumps([], ensure_ascii=False),
                "pf_ids": json.dumps([], ensure_ascii=False),
                "calendar_refs": json.dumps(calendar_refs(r["entity_ru"] + " " + r["value"]), ensure_ascii=False),
                "items_refs": json.dumps([], ensure_ascii=False),
                "visible_traces": r["value"][:400],
                "sensory_cues": json.dumps(sensory_cues(r["entity_ru"] + " " + r["value"]), ensure_ascii=False),
                "attestation": r["fact_type"],
                "source_refs": source_ref(r),
                "confidence": r["confidence"],
                "period": r.get("period", ""),
                "status": "candidate",
                "note": note_from(r),
            })
            continue
        if r["domain"] != "religion_church":
            continue  # non-lifecycle calendar rows go to calendar_1230_1250.csv, not here
        ch_i += 1
        kind = classify_kind(r["fact_type"], r["entity_ru"], r["value"])
        church_rows.append({
            "rl_id": f"rl_{ch_i:03d}",
            "kind": kind,
            "name_ru": r["entity_ru"],
            "roles": json.dumps([], ensure_ascii=False),
            "pf_ids": json.dumps([], ensure_ascii=False),
            "calendar_refs": json.dumps(calendar_refs(r["entity_ru"] + " " + r["value"]), ensure_ascii=False),
            "items_refs": json.dumps([], ensure_ascii=False),
            "sensory_cues": json.dumps(sensory_cues(r["entity_ru"] + " " + r["value"]), ensure_ascii=False),
            "source_refs": source_ref(r),
            "confidence": r["confidence"],
            "period": r.get("period", ""),
            "status": "candidate",
            "note": note_from(r) + (" | " + r["value"][:300] if r["value"] else ""),
        })

    # --- add WK-approved lifecycle burial claims (already-approved claims,
    # referenced not restated in full) ------------------------------------
    with open(WK_SOCIAL, encoding="utf-8") as f:
        wk = json.load(f)
    burial_claims = [c for c in wk["claims"] if c.get("claim_ref", "").startswith("claim:burial-")]
    for c in burial_claims:
        lc_i += 1
        lifecycle_rows.append({
            "lr_id": f"lr_{lc_i:03d}",
            "rite_kind": "burial",
            "name_ru": c["claim_ref"].replace("claim:", "").replace("-", " "),
            "roles": json.dumps([], ensure_ascii=False),
            "pf_ids": json.dumps(["g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_burial_area"], ensure_ascii=False),
            "calendar_refs": json.dumps([], ensure_ascii=False),
            "items_refs": json.dumps([c.get("subject_ref", "")], ensure_ascii=False),
            "visible_traces": "burial container form (see WK claim payload for the full description)",
            "sensory_cues": json.dumps([], ensure_ascii=False),
            "attestation": "archaeological",
            "source_refs": f"wk:social-institutions.json#{c['claim_ref']} (approved) -- evidence:ilinskii-burial-containers",
            "confidence": "A",
            "period": "c1230_analogy",
            "status": "candidate",
            "note": "Уже approved claim в WK; здесь только привязка к домену lifecycle_rites_burial и к G4 zaostrovye_burial_area, "
                     "полный payload не копируется.",
        })

    for path, fields, rows in (
        (os.path.join(OUT_DIR, "church_practice.csv"), CHURCH_FIELDS, church_rows),
        (os.path.join(OUT_DIR, "lifecycle_rites_burial.csv"), LIFECYCLE_FIELDS, lifecycle_rows),
    ):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for row in rows:
                w.writerow(row)
        print(f"wrote {len(rows)} rows to {path}")

    from collections import Counter
    print("church_practice kind counts:", dict(Counter(r["kind"] for r in church_rows)))
    print("lifecycle rite_kind counts:", dict(Counter(r["rite_kind"] for r in lifecycle_rows)))


if __name__ == "__main__":
    main()
