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
RICHNESS = ROOT / "data/world-catalogs/novgorod/m2c-natural/nature-richness-candidate-v1.json"
KNOWLEDGE = ROOT / "data/world-catalogs/novgorod/world-knowledge/production-v1"
MEMBER_BASE = "nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED"
KINDS = {
    "landscape": ("landscape_template_id", "landscape_templates", ("dominant_vegetation", "forest_type", "soil_ground_type")),
    "water_body": ("water_body_template_id", "water_body_templates", ("water_body_type", "flow_type", "salinity")),
    "land_use": ("land_use_template_id", "land_use_templates", ("land_use_kind", "seasonal_pattern")),
    "place": ("place_template_id", "place_templates", ("place_kind", "summary")),
}
NATURE_SHARDS = {
    "flora_fungi": ("wild-flora.json", "gameplay-flora-ecology-v3.json"),
    "soil_geology_materials": ("terrain.json", "gameplay-granular-materials-v3.json"),
    "medieval_regional_context": ("environment-ecology.json",),
}


def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    profiles = read_json(NATURAL)["natural_profiles"]
    richness = read_json(RICHNESS)
    exact_profiles = {p["g4_ref"]["id"]: p for p in profiles}
    candidate_by_g4 = {}
    weights = richness["weight_policy"]["weights"]
    if richness["approved"] or richness["import_authorized"] or richness["activation_authorized"]:
        raise ValueError("nature richness candidate must remain inactive")
    if weights != {"dominant": 8, "common": 4, "occasional": 2, "rare": 1}:
        raise ValueError("unexpected nature richness editorial weight policy")
    for group in richness["profiles"]:
        for candidate in group["selection_candidates"]:
            if candidate["category"] not in weights or not candidate["source_keys"]:
                raise ValueError("nature candidate missing weight category or source")
            if any(key not in richness["source_register"] for key in candidate["source_keys"]):
                raise ValueError("nature candidate has unknown source key")
        for g4_id in group["g4_ids"]:
            if g4_id in candidate_by_g4 or g4_id not in exact_profiles:
                raise ValueError("duplicate or unknown nature candidate G4: " + g4_id)
            if exact_profiles[g4_id]["template_refs"]["landscape_template_id"] != group["landscape_template_id"]:
                raise ValueError("nature candidate landscape mismatch: " + g4_id)
            layers = exact_profiles[g4_id]["natural_profile"]["layer_applicability"]
            for candidate in group["selection_candidates"]:
                if candidate["layer"] in layers and layers[candidate["layer"]]["applicability"] not in ("present", "not_applicable"):
                    raise ValueError("unsupported nature layer applicability: " + g4_id)
            candidate_by_g4[g4_id] = group
    by_template = defaultdict(list)
    for profile in profiles:
        for kind, (key, _, _) in KINDS.items():
            template_id = profile["template_refs"].get(key)
            if template_id:
                by_template[(kind, template_id)].append(profile)

    entries = []
    seed_by_kind = {}
    with tarfile.open(ARCHIVE, "r:gz") as archive:
        for kind, (id_key, seed_name, fields) in KINDS.items():
            seed_path = f"infra/world-base/{seed_name}.seed.json"
            seed = {row["id"]: row for row in read_json(ROOT / seed_path)}
            seed_by_kind[kind] = seed
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
                    "species_materialization": "typed_gap_exact_type_reference_required",
                    "exact_applicability": "exact_g4_template_ref" if matched else "unresolved_for_m2c_g4",
                })

    profile_comparison = []
    for profile in profiles:
        layers = profile["natural_profile"]["layer_applicability"]
        refs = profile["template_refs"]
        landscape_id = refs["landscape_template_id"]
        water_id = refs.get("water_body_template_id")
        profile_comparison.append({
            "g4_id": profile["g4_ref"]["id"],
            "landscape_template_id": landscape_id,
            "water_body_template_id": water_id,
            "reference_landscape": {
                field: normalized(seed_by_kind["landscape"][landscape_id][field])
                for field in KINDS["landscape"][2]
                if seed_by_kind["landscape"][landscape_id].get(field)
            },
            "authored_flora_material_layers": {
                layer: {
                    "applicability": layers[layer]["applicability"],
                    "value": layers[layer].get("value"),
                    "directness": layers[layer].get("directness"),
                }
                for layer in ("tree_layer", "shrub_layer", "ground_cover", "riparian_vegetation", "natural_materials")
            },
            "authored_fauna_layer": "fauna" in layers,
            "authored_taxon_claim_count": sum(
                len((value.get("value") or {}).get("taxon_claims", [])) for value in layers.values()
            ),
            "species_materialization": "typed_gap_exact_g4_era_and_season_evidence_required",
            "richness_candidate": [
                {"kind": row["kind"], "taxon": row["taxon"], "layer": row["layer"],
                 "category": row["category"], "editorial_weight": weights[row["category"]]}
                for row in candidate_by_g4.get(profile["g4_ref"]["id"], {}).get("selection_candidates", [])
                if row["layer"] not in layers or layers[row["layer"]]["applicability"] == "present"
            ],
        })

    # runtime-bundle.json repeats source-shard claims; count claim identities once.
    fragments = [(path, read_json(path)) for path in sorted(KNOWLEDGE.glob("*.json"))]
    concepts = {concept["concept_ref"] for _, data in fragments for concept in data.get("concepts", [])
                if ":fauna-" in concept["concept_ref"]}
    concept_sources = defaultdict(set)
    concept_claims = Counter()
    context_scopes = Counter()
    relevant_files = set()
    seen_claims = set()
    for path, data in fragments:
        evidence_sources = {e["evidence_ref"]: e["source_ref"] for e in data.get("evidence", [])}
        for claim in data.get("claims", []):
            if claim["subject_ref"] in concepts:
                relevant_files.add(path.name)
                if claim["claim_ref"] in seen_claims:
                    continue
                seen_claims.add(claim["claim_ref"])
                concept_claims[claim["subject_ref"]] += 1
                context_scopes[claim.get("applicability", {}).get("context_scope", "unspecified")] += 1
                concept_sources[claim["subject_ref"]].update(
                    evidence_sources[ref] for ref in claim.get("evidence_refs", []) if ref in evidence_sources
                )

    ecology = read_json(KNOWLEDGE / "environment-ecology.json")
    ecology_sources = {e["evidence_ref"]: e["source_ref"] for e in ecology["evidence"]}
    historical_flora_context = [
        {
            "claim_ref": claim["claim_ref"],
            "source_refs": sorted({ecology_sources[ref] for ref in claim["evidence_refs"]}),
            "applicability": claim["applicability"],
        }
        for claim in ecology["claims"]
        if claim["claim_ref"] in {
            "claim:troitsky-nonwood-plant-remains-probably-local",
            "claim:troitsky-gathered-plants-probably-link-to-southern-deciduous-woodland",
            "claim:troitsky-bilberry-incidence-indicates-northern-heath-clearing-exploitation",
        }
    ]
    nature_shards = {}
    for topic, names in NATURE_SHARDS.items():
        shard_data = [read_json(KNOWLEDGE / name) for name in names]
        claims = {
            claim["claim_ref"]: claim
            for data in shard_data
            for claim in data.get("claims", [])
        }
        evidence = {
            row["evidence_ref"]: row["source_ref"]
            for data in shard_data for row in data.get("evidence", [])
        }
        nature_shards[topic] = {
            "files": list(names),
            "claim_count": len(claims),
            "concept_refs": sorted({claim["subject_ref"] for claim in claims.values()}),
            "source_refs": sorted({
                evidence[ref] for claim in claims.values()
                for ref in claim.get("evidence_refs", []) if ref in evidence
            }),
            "context_scopes": dict(sorted(Counter(
                claim.get("applicability", {}).get("context_scope", "unspecified")
                for claim in claims.values()
            ).items())),
        }
    counts = Counter((entry["kind"], entry["coverage"]) for entry in entries)
    result = {
        "schema": "m2c_nature_coverage_report_v2",
        "scope": "archived Novgorod regional template links versus exact M2c G4 natural profiles",
        "source_status_warning": "Regional links are draft G1-G3 evidence; this report does not approve type presence at G4 or infer taxa from universal claims.",
        "inputs": [str(ARCHIVE.relative_to(ROOT)).replace("\\", "/"), str(NATURAL.relative_to(ROOT)).replace("\\", "/"), str(RICHNESS.relative_to(ROOT)).replace("\\", "/"), str(KNOWLEDGE.relative_to(ROOT)).replace("\\", "/")],
        "counts": {kind: {status: counts[(kind, status)] for status in ("exact_g4_profile", "no_exact_m2c_binding")} for kind in KINDS},
        "m2c_g4_count": len(profiles),
        "nature_richness_candidate": {
            "status": richness["status"],
            "weight_policy": richness["weight_policy"],
            "covered_g4_count": len(candidate_by_g4),
            "uncovered_g4_ids": sorted(set(exact_profiles) - set(candidate_by_g4)),
            "candidate_rows_by_kind": dict(sorted(Counter(
                row["kind"] for group in richness["profiles"] for row in group["selection_candidates"]
            ).items())),
        },
        "m2c_g4_without_fauna_layer": sum("fauna" not in p["natural_profile"]["layer_applicability"] for p in profiles),
        "world_knowledge_fauna_concepts": len(concept_sources),
        "world_knowledge_fauna_claims": sum(concept_claims.values()),
        "world_knowledge_context_scopes": dict(sorted(context_scopes.items())),
        "world_knowledge_source_map": [
            {"concept_ref": ref, "claim_count": concept_claims[ref], "source_refs": sorted(sources)}
            for ref, sources in sorted(concept_sources.items())
        ],
        "world_knowledge_files": sorted(relevant_files),
        "historical_flora_context": historical_flora_context,
        "world_knowledge_nature_shards": nature_shards,
        "exact_g4_profile_comparison": sorted(profile_comparison, key=lambda entry: entry["g4_id"]),
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
