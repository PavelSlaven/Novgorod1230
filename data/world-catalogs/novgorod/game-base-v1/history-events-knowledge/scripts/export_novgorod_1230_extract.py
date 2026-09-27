"""Export the pinned persons_1230 subset from the source SQLite database."""

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

BUILDER = Path(__file__).resolve().parents[1] / "historical_figures" / "scripts" / "build_figures.cjs"
SOURCE = {
    "file_name": "novgorod_1230(1) (1).sqlite",
    "sha256": "61f679a734aea087ccd9a9b34f6c0b76753f0856380b31b6735e603ff4efc94c",
    "size_bytes": 163840,
}
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "sources" / "novgorod_1230_extract.json"


def builder_fields():
    source = BUILDER.read_text(encoding="utf-8")
    block = source.split("const sqRows =", 1)[1].split("// draft key NPC profiles", 1)[0]
    fields = tuple(sorted(set(re.findall(r"\bp\.([A-Za-z_][A-Za-z0-9_]*)", block))))
    if not fields:
        raise ValueError("no persons_1230 fields found in build_figures.cjs")
    return fields


def validate(payload):
    fields = builder_fields()
    if set(payload) != {"schema_version", "status", "source_database", "persons_1230"}:
        raise ValueError("extract has unexpected top-level fields")
    if payload["schema_version"] != "novgorod_1230_extract_v1" or payload["status"] != "candidate":
        raise ValueError("extract schema/status mismatch")
    if payload["source_database"] != SOURCE:
        raise ValueError("source pin mismatch")
    for row in payload["persons_1230"]:
        if tuple(row) != fields:
            raise ValueError(f"{row.get('id', '?')}: unexpected fields or order")
        for field, value in row.items():
            if not isinstance(value, str) or "\n" in value or len(re.findall(r"[.!?]+(?:[»”\"]*)?(?=\s|$)", value)) > 1:
                raise ValueError(f"{row['id']}.{field}: expected one sentence or less")


def export(db_path):
    db_path = db_path.resolve()
    actual = {
        "file_name": db_path.name,
        "sha256": hashlib.sha256(db_path.read_bytes()).hexdigest(),
        "size_bytes": db_path.stat().st_size,
    }
    if actual != SOURCE:
        raise ValueError(f"source database does not match pin: {actual}")
    connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        fields = builder_fields()
        rows = [dict(row) for row in connection.execute(
            f"SELECT {', '.join(fields)} FROM persons_1230 ORDER BY id"
        )]
    finally:
        connection.close()
    payload = {
        "schema_version": "novgorod_1230_extract_v1",
        "status": "candidate",
        "source_database": SOURCE,
        "persons_1230": rows,
    }
    validate(payload)
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sqlite", nargs="?", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        current = json.loads(args.output.read_text(encoding="utf-8"))
        validate(current)
        if args.sqlite and current != export(args.sqlite):
            raise ValueError("extract differs from pinned SQLite projection")
        print(f"PASS: {len(current['persons_1230'])} rows, exact fields, one sentence per text field")
        return
    if not args.sqlite:
        parser.error("sqlite path is required unless --check is used")
    payload = export(args.sqlite)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(payload['persons_1230'])} rows to {args.output}")


if __name__ == "__main__":
    main()
