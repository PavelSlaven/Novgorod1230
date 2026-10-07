#!/usr/bin/env python3
"""Build the narrow approved material correction view over the immutable master input."""
import argparse
import csv
import hashlib
import json
import os
import tempfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
GAME_BASE = SCRIPT_DIR.parent
REPO = GAME_BASE.parents[3]
SOURCE = REPO / "data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv"
OVERLAY = GAME_BASE / "source-overlays/master-material-materials.csv"
OUTPUT = GAME_BASE / "generated/master-material-material-view.json"
EXPECTED_SOURCE_SHA256 = "c338980b40594e1eaa2da00c547bb12152f1d0cf417f78cc146fc8c4fcbd9ede"
OVERLAY_FIELDS = [
    "item_id", "primary_material_before", "primary_material", "materials_before", "materials", "approval_ref",
]
VIEW_FIELDS = ["item_id", "primary_material", "materials"]
EXPECTED_ROWS = 22


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def build_view(source_bytes, source_rows, overlay_bytes, overlay_rows, expected_source_sha=EXPECTED_SOURCE_SHA256,
               expected_count=EXPECTED_ROWS):
    source_sha = sha256(source_bytes)
    if expected_source_sha and source_sha != expected_source_sha:
        raise ValueError(f"master material source sha256 mismatch: {source_sha}")
    source_by_id = {}
    for row in source_rows:
        item_id = row.get("item_id", "")
        if not item_id or item_id in source_by_id:
            raise ValueError(f"missing or duplicate master material item_id: {item_id}")
        source_by_id[item_id] = row

    seen = set()
    view_rows = []
    for correction in overlay_rows:
        item_id = correction.get("item_id", "")
        if not item_id or item_id in seen:
            raise ValueError(f"missing or duplicate material correction item_id: {item_id}")
        seen.add(item_id)
        source = source_by_id.get(item_id)
        if source is None:
            raise ValueError(f"material correction source row missing: {item_id}")
        for field in ("primary_material", "materials"):
            expected = correction[f"{field}_before"]
            if source.get(field, "") != expected:
                raise ValueError(f"material correction guard failed for {item_id}.{field}: expected {expected!r}, found {source.get(field, '')!r}")
        expected_ref = f"#n1230:material_item:{item_id.lower()}"
        if not correction.get("approval_ref", "").endswith(expected_ref):
            raise ValueError(f"invalid approval reference for {item_id}")
        if not correction.get("primary_material") or correction["materials"] == correction["materials_before"]:
            raise ValueError(f"empty or unchanged material correction: {item_id}")
        try:
            materials = json.loads(correction["materials"])
        except json.JSONDecodeError as error:
            raise ValueError(f"invalid materials JSON for {item_id}: {error}") from error
        if not isinstance(materials, list) or not materials or any(not isinstance(value, str) for value in materials):
            raise ValueError(f"materials must be a non-empty string array for {item_id}")
        view_rows.append({field: correction[field] if field != "item_id" else item_id for field in VIEW_FIELDS})
    if len(view_rows) != expected_count:
        raise ValueError(f"expected {expected_count} material corrections, found {len(view_rows)}")
    view_rows.sort(key=lambda row: row["item_id"])
    return {
        "source_sha256": source_sha,
        "overlay_sha256": sha256(overlay_bytes),
        "rows": view_rows,
    }


def build_bytes(source_path=SOURCE, overlay_path=OVERLAY, expected_source_sha=EXPECTED_SOURCE_SHA256,
                expected_count=EXPECTED_ROWS):
    source_bytes = Path(source_path).read_bytes()
    overlay_bytes = Path(overlay_path).read_bytes()
    source_fields, source_rows = read_csv(source_path)
    overlay_fields, overlay_rows = read_csv(overlay_path)
    if "item_id" not in (source_fields or []):
        raise ValueError("master material source lacks item_id column")
    if overlay_fields != OVERLAY_FIELDS:
        raise ValueError(f"material overlay header mismatch: {overlay_fields}")
    view = build_view(source_bytes, source_rows, overlay_bytes, overlay_rows, expected_source_sha, expected_count)
    return (json.dumps(view, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_atomically(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def build_and_write(source_path=SOURCE, overlay_path=OVERLAY, output_path=OUTPUT,
                    expected_source_sha=EXPECTED_SOURCE_SHA256, expected_count=EXPECTED_ROWS):
    expected = build_bytes(source_path, overlay_path, expected_source_sha, expected_count)
    write_atomically(output_path, expected)
    row_count = len(json.loads(expected)["rows"])
    print(f"built material view: {output_path} ({row_count} rows)")
    return expected


def self_test():
    from contextlib import redirect_stdout
    import io

    source_rows = [{"item_id": f"OMI{i:05d}", "primary_material": "old", "materials": '["old"]'} for i in range(22)]
    overlay_rows = [{
        "item_id": f"OMI{i:05d}", "primary_material_before": "old", "primary_material": "new",
        "materials_before": '["old"]', "materials": '["new"]',
        "approval_ref": f"test/out/final-verdict.json#n1230:material_item:omi{i:05d}",
    } for i in range(22)]
    def csv_bytes(fields, rows):
        output = io.StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue().encode()
    source_bytes = csv_bytes(["item_id", "primary_material", "materials"], source_rows)
    overlay_bytes = csv_bytes(OVERLAY_FIELDS, overlay_rows)
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        source_path, overlay_path, output_path = temp / "source.csv", temp / "overlay.csv", temp / "view.json"
        source_path.write_bytes(source_bytes)
        overlay_path.write_bytes(overlay_bytes)
        first = build_bytes(source_path, overlay_path, None, 22)
        write_atomically(output_path, first)
        second = build_bytes(source_path, overlay_path, None, 22)
        if first != second or output_path.read_bytes() != second:
            raise AssertionError("repeated view builds are not byte-identical")
        bad = [dict(row) for row in overlay_rows]
        bad[0]["primary_material_before"] = "not-old"
        overlay_path.write_bytes(csv_bytes(OVERLAY_FIELDS, bad))
        before = output_path.read_bytes()
        stdout = io.StringIO()
        try:
            with redirect_stdout(stdout):
                build_and_write(source_path, overlay_path, output_path, None, 22)
        except ValueError:
            pass
        else:
            raise AssertionError("mismatched before-value unexpectedly passed")
        if stdout.getvalue():
            raise AssertionError("before-value guard failure wrote to stdout")
        if output_path.read_bytes() != before:
            raise AssertionError("guard failure changed existing output")
        overlay_path.write_bytes(overlay_bytes)
        stdout = io.StringIO()
        try:
            with redirect_stdout(stdout):
                build_and_write(source_path, overlay_path, output_path, "stale-source-sha", 22)
        except ValueError as error:
            if "source sha256 mismatch" not in str(error):
                raise
        else:
            raise AssertionError("stale source hash unexpectedly passed")
        if stdout.getvalue():
            raise AssertionError("stale source hash failure wrote to stdout")
        if output_path.read_bytes() != before:
            raise AssertionError("stale source hash changed existing output")
    print("material view self-test: guards, no partial output, deterministic rebuild PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare expected view bytes without writing")
    parser.add_argument("--self-test", action="store_true", help="run stdlib self-tests")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.check:
        expected = build_bytes()
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != expected:
            raise SystemExit(f"stale material view: {OUTPUT}")
        print(f"material view current: {OUTPUT}")
        return 0
    build_and_write()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
