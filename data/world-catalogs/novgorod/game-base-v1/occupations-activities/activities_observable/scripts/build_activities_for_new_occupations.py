# -*- coding: utf-8 -*-
"""
Extract activity chains (prev/next) for the PRO#### ids cited as sources for
occupations/occupations_additions.csv (this same collector), from the
already-copied master-archive-v1 activities.csv (2442 rows, candidate).

Scope note: this is a NARROW slice of the activities_observable domain
(only the 27 PRO ids behind our 18 new occupations), not the full domain
(2442 activities x 68+ occupations), which is out of this pass's budget and
is priority M3 per the brief. See README.md gaps.

Deterministic: pure filter + cycle check, no authored content.

Run: python build_activities_for_new_occupations.py
"""
import csv
import json
import os

SRC = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "sources",
    "master-archive-v1", "data", "normalized_source_tables", "occupations",
    "activities.csv",
)
OUT = os.path.join(os.path.dirname(__file__), "..", "activities_new_occupations.csv")

# PRO ids cited in occupations_additions.csv source_refs
TARGET_PROS = {
    "PRO0017", "PRO0018", "PRO0051", "PRO0052", "PRO0053", "PRO0040", "PRO0028",
    "PRO0128", "PRO0264", "PRO0066", "PRO0067", "PRO0115", "PRO0006", "PRO0311",
    "PRO0009", "PRO0203", "PRO0072", "PRO0204", "PRO0077", "PRO0086", "PRO0087",
    "PRO0090", "PRO0091", "PRO0084", "PRO0093", "PRO0094", "PRO0424",
}

FIELDS = [
    "ac_id", "name_ru", "profession_ids", "prev_ref", "next_ref",
    "season_scope", "duration_estimate", "observable_text_ru",
    "source_refs", "confidence",
]


def main():
    with open(SRC, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    by_id = {}
    kept = []
    for r in rows:
        pids = json.loads(r["profession_ids"]) if r["profession_ids"] else []
        if any(p in TARGET_PROS for p in pids):
            by_id[r["activity_id"]] = r
            kept.append(r)

    # cycle check within kept chains (prev/next restricted to kept set)
    def neighbors(r, key):
        try:
            ids = json.loads(r[key]) if r[key] else []
        except Exception:
            ids = []
        return [i for i in ids if i in by_id]

    visiting, visited = set(), set()
    cyclic = []

    def dfs(node_id):
        if node_id in visited:
            return
        if node_id in visiting:
            cyclic.append(node_id)
            return
        visiting.add(node_id)
        for nxt in neighbors(by_id[node_id], "next_activity_ids"):
            dfs(nxt)
        visiting.discard(node_id)
        visited.add(node_id)

    for aid in by_id:
        dfs(aid)

    out_rows = []
    for r in kept:
        out_rows.append({
            "ac_id": "ac_" + r["activity_id"].lower(),
            "name_ru": r["name_ru"],
            "profession_ids": r["profession_ids"],
            "prev_ref": r["previous_activity_ids"],
            "next_ref": r["next_activity_ids"],
            "season_scope": r["season_scope"],
            "duration_estimate": r["duration_estimate"],
            "observable_text_ru": r["description_ru"],
            "source_refs": f"gb:sources/master-archive-v1/data/normalized_source_tables/occupations/activities.csv#{r['activity_id']}",
            "confidence": r["historical_confidence"],
        })

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out_rows)

    print(f"wrote {len(out_rows)} rows to {OUT}")
    print(f"cycle check: {len(cyclic)} nodes involved in a cycle" if cyclic else "cycle check: no cycles found")
    missing_text = [r for r in out_rows if not r["observable_text_ru"].strip()]
    print(f"rows missing observable_text_ru: {len(missing_text)}")


if __name__ == "__main__":
    main()
