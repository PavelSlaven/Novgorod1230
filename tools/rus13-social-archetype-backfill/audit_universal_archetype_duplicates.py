#!/usr/bin/env python3
"""Anti-duplication audit before adding a new social_position_archetype."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


FINGERPRINT_FIELDS = [
    "social_class_id",
    "role_archetype_id",
    "legal_status_archetype_id",
    "dependency_archetype_id",
    "mobility_archetype_id",
    "property_rights_model",
    "weapon_rights_model",
    "court_voice_model",
]


def load_positions(seeds_dir: Path) -> Dict[str, Dict[str, str]]:
    path = seeds_dir / "social_position_archetypes_v1.csv"
    idx: Dict[str, Dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            idx[row["id"]] = row
    return idx


def fingerprint(row: Dict[str, str]) -> Tuple[str, ...]:
    return tuple((row.get(field) or "").strip() for field in FINGERPRINT_FIELDS)


def audit_proposal(
    proposal: Dict[str, Any],
    positions: Dict[str, Dict[str, str]],
) -> Dict[str, Any]:
    payload = proposal.get("proposed_archetype_payload") or proposal
    fp = fingerprint(payload)
    matches = [pid for pid, row in positions.items() if fingerprint(row) == fp]
    nearest = matches[0] if matches else ""
    return {
        "proposal_id": proposal.get("id") or proposal.get("local_term") or "",
        "fingerprint": dict(zip(FINGERPRINT_FIELDS, fp)),
        "duplicate_of_existing": bool(matches),
        "matching_archetype_ids": matches,
        "nearest_existing_archetype_id": nearest,
        "new_archetype_allowed": not matches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit universal archetype proposals for duplicates")
    parser.add_argument("--seeds-dir", default="data/world-base-seeds")
    parser.add_argument("--proposal-json", help="Single proposal JSON file")
    parser.add_argument("--proposals-csv", help="CSV with proposed_archetype_payload column")
    args = parser.parse_args()

    seeds_dir = Path(args.seeds_dir)
    positions = load_positions(seeds_dir)
    results: List[Dict[str, Any]] = []

    if args.proposal_json:
        proposal = json.loads(Path(args.proposal_json).read_text(encoding="utf-8"))
        results.append(audit_proposal(proposal, positions))
    elif args.proposals_csv:
        with Path(args.proposals_csv).open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                payload = json.loads(row.get("proposed_archetype_payload") or "{}")
                results.append(audit_proposal({"id": row.get("id"), "proposed_archetype_payload": payload}, positions))
    else:
        print(json.dumps({"existing_archetypes": len(positions), "hint": "pass --proposal-json or --proposals-csv"}, indent=2))
        return 0

    print(json.dumps({"audits": results}, ensure_ascii=False, indent=2))
    return 1 if any(not r["new_archetype_allowed"] for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
