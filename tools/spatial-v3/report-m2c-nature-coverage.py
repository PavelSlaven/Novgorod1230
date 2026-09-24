"""Report source-backed nature coverage without promoting draft links to authority.

Usage: python tools/spatial-v3/report-m2c-nature-coverage.py --output path.json
"""

import csv
import io
import json
import sys
import tarfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data/world-base-sources/rus13-base-v1.tar.gz"
NATURAL = ROOT / "data/world-catalogs/novgorod/m2c-natural/candidate.json"
KNOWLEDGE = ROOT / "data/world-catalogs/novgorod/world-knowledge/production-v1"
MEMBER_BASE = "nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED"
KINDS = {
    "landscape": ("landscape_template_id", "landscape_templates", ("dominant_vegetation", "forest_type", "soil_ground_type")),
    "water_body": ("water_body_template_id", "water_body_templates", ("water_body_type", "flow_type", "salinity")),
    "land_use": ("land_use_template_id", "land_use_templates", ("land_use_kind", "seasonal_pattern")),
    "place": ("place_template_id", "place_templates", ("place_kind", "summary")),
}


def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    profiles = read_json(NATURAL)["natural_profiles"]
    by_template = defaultdict(list)
    for profile in profiles:
        for kind, (key, _, _) in KINDS.items():
            template_id = profile["template_refs"].get(key)
            if template_id:
                by_template[(kind, template_id)].append(profile)

    entries = []
    with tarfile.open(ARCHIVE, "r:gz") as archive:
        for kind, (id_key, seed_name, fields) in KINDS.items():
            seed_path = f"infra/world-base/{seed_name}.seed.json"
            seed = {row["id"]: row for row in read_json(ROOT / seed_path)}
            member = f"{MEMBER_BASE}/novgorod_region_{seed_name}.tsv"
            stream = io.TextIOWrapper(archive.extractfile(member), encoding="utf-8-sig", newline="")
            for row in csv.DictReader(stream, delimiter="\t"):
                template_id = row[id_key]
                template = seed[template_id]
                matched = by_template[(kind, template_id)]
                entries.append({
                    "kind": kind,
                    "template_id": template_id,
                    "regional_link_id": row["id"],
                    "regional_status": row["status"],
                    "regional_confidence": row["confidence"],
                    "regional_sources": json.loads(row["sources"]),
                    "regional_scales": json.loads(row["allowed_scale_levels"]),
                    "reference": {field: normalized(template[field]) for field in fields if template.get(field)},
                    "reference_source": seed_path + "#" + template_id,
                    "exact_m2c_g4": sorted(profile["g4_ref"]["id"] for profile in matched),
                    "m2c_layers": sorted({
                        layer for profile in matched
                        for layer, value in profile["natural_profile"]["layer_applicability"].items()
                        if value["applicability"] == "present"
                    }),
                    "m2c_taxon_claim_count": sum(
                        len((value.get("value") or {}).get("taxon_claims", []))
                        for profile in matched
                        for value in profile["natural_profile"]["layer_applicability"].values()
                    ),
                    "coverage": "exact_g4_profile" if matched else "no_exact_m2c_binding",
                })

    fragments = [(path, read_json(path)) for path in sorted(KNOWLEDGE.glob("*.json"))]
    concepts = {concept["concept_ref"] for _, data in fragments for concept in data.get("concepts", [])
                if ":fauna-" in concept["concept_ref"]}
    concept_sources = defaultdict(set)
    concept_claims = Counter()
    context_scopes = Counter()
    relevant_files = set()
    for path, data in fragments:
        evidence_sources = {e["evidence_ref"]: e["source_ref"] for e in data.get("evidence", [])}
        for claim in data.get("claims", []):
            if claim["subject_ref"] in concepts:
                relevant_files.add(path.name)
                concept_claims[claim["subject_ref"]] += 1
                context_scopes[claim.get("applicability", {}).get("context_scope", "unspecified")] += 1
                concept_sources[claim["subject_ref"]].update(
                    evidence_sources[ref] for ref in claim.get("evidence_refs", []) if ref in evidence_sources
                )

    counts = Counter((entry["kind"], entry["coverage"]) for entry in entries)
    result = {
        "schema": "m2c_nature_coverage_report_v1",
        "scope": "archived Novgorod regional template links versus exact M2c G4 natural profiles",
        "source_status_warning": "Regional links are draft G1-G3 evidence; this report does not approve type presence at G4 or infer taxa from universal claims.",
        "inputs": [str(ARCHIVE.relative_to(ROOT)).replace("\\", "/"), str(NATURAL.relative_to(ROOT)).replace("\\", "/"), str(KNOWLEDGE.relative_to(ROOT)).replace("\\", "/")],
        "counts": {kind: {status: counts[(kind, status)] for status in ("exact_g4_profile", "no_exact_m2c_binding")} for kind in KINDS},
        "m2c_g4_count": len(profiles),
        "m2c_g4_without_fauna_layer": sum("fauna" not in p["natural_profile"]["layer_applicability"] for p in profiles),
        "world_knowledge_fauna_concepts": len(concept_sources),
        "world_knowledge_fauna_claims": sum(concept_claims.values()),
        "world_knowledge_context_scopes": dict(sorted(context_scopes.items())),
        "world_knowledge_source_map": [
            {"concept_ref": ref, "claim_count": concept_claims[ref], "source_refs": sorted(sources)}
            for ref, sources in sorted(concept_sources.items())
        ],
        "world_knowledge_files": sorted(relevant_files),
        "entries": sorted(entries, key=lambda entry: (entry["kind"], entry["template_id"])),
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if len(sys.argv) == 3 and sys.argv[1] == "--output":
        (ROOT / sys.argv[2]).write_bytes(rendered.encode("utf-8"))
    elif len(sys.argv) == 3 and sys.argv[1] == "--check":
        if (ROOT / sys.argv[2]).read_bytes() != rendered.encode("utf-8"):
            raise SystemExit("coverage report is stale")
    elif len(sys.argv) == 1:
        print(rendered, end="")
    else:
        raise SystemExit("usage: report-m2c-nature-coverage.py [--output|--check repository-relative.json]")


if __name__ == "__main__":
    main()
