"""Export the PR98 fields consumed by build.py from a pinned Git commit."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from build import PIN, read_pinned

COMMIT = "63ef38c30d4c6c118257be318418e4ff85ad0e32"
SOURCE_DIR = "data/world-catalogs/novgorod/m2c-npc/"


def source(repo, name):
    path = SOURCE_DIR + name
    raw = subprocess.check_output(["git", "-C", str(repo), "show", f"{COMMIT}:{path}"])
    return json.loads(raw), {"path": path, "sha256": hashlib.sha256(raw).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", metavar="SOURCE_REPO", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.export:
        candidate, candidate_source = source(args.export, "candidate.json")
        bindings, binding_source = source(args.export, "runtime-bindings.json")
        extract = {
            "source_commit": COMMIT,
            "sources": {"candidate.json": candidate_source, "runtime-bindings.json": binding_source},
            "candidate": {
                "appearance_policy": candidate["appearance_policy"],
                "g4_compositions_count": len(candidate["g4_compositions"]),
                "regional_context_profiles": candidate["regional_context_profiles"],
                "profiles": [{key: profile[key] for key in (
                    "profile_id", "occupation_ref", "role_ref", "status",
                    "appearance_profile_source_ref", "appearance_target_binding",
                    "equipment_authoring_source_ref", "equipment_scope", "typed_gaps",
                    "regional_context_candidate_refs")}
                             for profile in candidate["profiles"]],
            },
            "runtime_bindings": {"profiles": [{key: profile.get(key) for key in (
                "profile_id", "clothing_binding", "property_binding", "routine_binding")}
                                                for profile in bindings["profiles"]]},
        }
        PIN.write_text(json.dumps(extract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"exported {len(extract['candidate']['profiles'])} PR98 profiles")
    if args.check:
        extract = read_pinned()
        assert len({p["profile_id"] for p in extract["candidate"]["profiles"]}) == 9
        assert {p["profile_id"] for p in extract["candidate"]["profiles"]} == {
            p["profile_id"] for p in extract["runtime_bindings"]["profiles"]}
        assert all(entry["path"] == SOURCE_DIR + name and len(entry["sha256"]) == 64
                   for name, entry in extract["sources"].items())
        print("OK: pinned PR98 extract")


if __name__ == "__main__":
    main()
