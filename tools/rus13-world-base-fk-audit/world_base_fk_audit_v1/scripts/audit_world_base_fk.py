#!/usr/bin/env python3
"""
RUS13 world_base FK audit v1.

Audits staged importer data and/or an applied PostgreSQL world_base schema for
referential integrity and project-specific conditional FK rules.

The script does not create world facts. It only checks whether imported records
refer to existing records and whether conditional schema rules are satisfied.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

SCHEMA_NAME = "world_base"

FK_RULES = [
    # table, column, target_table, target_column, label
    ("regions", "parent_region_id", "regions", "id", "regions.parent_region_id -> regions.id"),
    ("region_neighbors", "region_id", "regions", "id", "region_neighbors.region_id -> regions.id"),
    ("region_neighbors", "neighbor_region_id", "regions", "id", "region_neighbors.neighbor_region_id -> regions.id"),
    ("region_landscape_templates", "region_id", "regions", "id", "region_landscape_templates.region_id -> regions.id"),
    ("region_landscape_templates", "landscape_template_id", "landscape_templates", "id", "region_landscape_templates.landscape_template_id -> landscape_templates.id"),
    ("region_water_body_templates", "region_id", "regions", "id", "region_water_body_templates.region_id -> regions.id"),
    ("region_water_body_templates", "water_body_template_id", "water_body_templates", "id", "region_water_body_templates.water_body_template_id -> water_body_templates.id"),
    ("region_land_use_templates", "region_id", "regions", "id", "region_land_use_templates.region_id -> regions.id"),
    ("region_land_use_templates", "land_use_template_id", "land_use_templates", "id", "region_land_use_templates.land_use_template_id -> land_use_templates.id"),
    ("region_place_templates", "region_id", "regions", "id", "region_place_templates.region_id -> regions.id"),
    ("region_place_templates", "place_template_id", "place_templates", "id", "region_place_templates.place_template_id -> place_templates.id"),
    ("region_social_roles", "region_id", "regions", "id", "region_social_roles.region_id -> regions.id"),
    ("region_occupations", "region_id", "regions", "id", "region_occupations.region_id -> regions.id"),
    ("region_social_roles", "social_position_archetype_id", "social_position_archetypes", "id", "region_social_roles.social_position_archetype_id -> social_position_archetypes.id"),
    ("region_social_roles", "social_class_id", "social_classes", "id", "region_social_roles.social_class_id -> social_classes.id"),
    ("region_social_roles", "role_archetype_id", "social_role_archetypes", "id", "region_social_roles.role_archetype_id -> social_role_archetypes.id"),
    ("region_social_roles", "legal_status_archetype_id", "legal_status_archetypes", "id", "region_social_roles.legal_status_archetype_id -> legal_status_archetypes.id"),
    ("region_social_roles", "dependency_archetype_id", "dependency_archetypes", "id", "region_social_roles.dependency_archetype_id -> dependency_archetypes.id"),
    ("region_social_roles", "mobility_archetype_id", "mobility_archetypes", "id", "region_social_roles.mobility_archetype_id -> mobility_archetypes.id"),
    ("region_occupations", "occupation_archetype_id", "occupation_archetypes", "id", "region_occupations.occupation_archetype_id -> occupation_archetypes.id"),
    ("social_position_archetypes", "social_class_id", "social_classes", "id", "social_position_archetypes.social_class_id -> social_classes.id"),
    ("social_position_archetypes", "role_archetype_id", "social_role_archetypes", "id", "social_position_archetypes.role_archetype_id -> social_role_archetypes.id"),
    ("social_position_archetypes", "legal_status_archetype_id", "legal_status_archetypes", "id", "social_position_archetypes.legal_status_archetype_id -> legal_status_archetypes.id"),
    ("social_position_archetypes", "dependency_archetype_id", "dependency_archetypes", "id", "social_position_archetypes.dependency_archetype_id -> dependency_archetypes.id"),
    ("social_position_archetypes", "mobility_archetype_id", "mobility_archetypes", "id", "social_position_archetypes.mobility_archetype_id -> mobility_archetypes.id"),
    ("class_role_rules", "social_class_id", "social_classes", "id", "class_role_rules.social_class_id -> social_classes.id"),
    ("class_role_rules", "role_archetype_id", "social_role_archetypes", "id", "class_role_rules.role_archetype_id -> social_role_archetypes.id"),
    ("role_occupation_rules", "role_archetype_id", "social_role_archetypes", "id", "role_occupation_rules.role_archetype_id -> social_role_archetypes.id"),
    ("role_occupation_rules", "occupation_archetype_id", "occupation_archetypes", "id", "role_occupation_rules.occupation_archetype_id -> occupation_archetypes.id"),
    ("occupation_skill_defaults", "occupation_archetype_id", "occupation_archetypes", "id", "occupation_skill_defaults.occupation_archetype_id -> occupation_archetypes.id"),
    ("universal_archetype_proposals", "source_region_id", "regions", "id", "universal_archetype_proposals.source_region_id -> regions.id"),
    ("graph_nodes", "parent_node_id", "graph_nodes", "id", "graph_nodes.parent_node_id -> graph_nodes.id"),
    ("graph_nodes", "region_id", "regions", "id", "graph_nodes.region_id -> regions.id"),
    ("graph_nodes", "primary_landscape_template_id", "landscape_templates", "id", "graph_nodes.primary_landscape_template_id -> landscape_templates.id"),
    ("graph_nodes", "primary_water_body_template_id", "water_body_templates", "id", "graph_nodes.primary_water_body_template_id -> water_body_templates.id"),
    ("graph_nodes", "place_template_id", "place_templates", "id", "graph_nodes.place_template_id -> place_templates.id"),
    ("graph_edges", "from_node_id", "graph_nodes", "id", "graph_edges.from_node_id -> graph_nodes.id"),
    ("graph_edges", "to_node_id", "graph_nodes", "id", "graph_edges.to_node_id -> graph_nodes.id"),
    ("graph_edges", "reverse_edge_id", "graph_edges", "id", "graph_edges.reverse_edge_id -> graph_edges.id"),
    ("graph_edges", "route_template_id", "route_templates", "id", "graph_edges.route_template_id -> route_templates.id"),
    ("graph_edges", "landscape_template_id", "landscape_templates", "id", "graph_edges.landscape_template_id -> landscape_templates.id"),
    ("graph_edges", "water_body_template_id", "water_body_templates", "id", "graph_edges.water_body_template_id -> water_body_templates.id"),
    ("historical_anchors", "region_id", "regions", "id", "historical_anchors.region_id -> regions.id"),
]

JSON_REF_RULES = [
    # table, column, target_table, label
    ("graph_nodes", "secondary_landscape_template_ids", "landscape_templates", "graph_nodes.secondary_landscape_template_ids[] -> landscape_templates.id"),
    ("graph_nodes", "secondary_water_body_template_ids", "water_body_templates", "graph_nodes.secondary_water_body_template_ids[] -> water_body_templates.id"),
    ("graph_nodes", "land_use_template_ids", "land_use_templates", "graph_nodes.land_use_template_ids[] -> land_use_templates.id"),
    ("region_occupations", "allowed_social_roles", "region_social_roles", "region_occupations.allowed_social_roles[] -> region_social_roles.id"),
    ("region_social_roles", "allowed_occupations", "region_occupations", "region_social_roles.allowed_occupations[] -> region_occupations.id"),
]

EDGE_TYPE_ROUTE_REQUIRED = {"road", "path", "forest_track", "winter_road", "portage", "corridor_segment"}
EDGE_TYPE_WATER_REQUIRED = {"river", "lake_route", "sea_route", "ford", "ferry", "bridge"}
EDGE_TYPE_LANDSCAPE_REQUIRED = {"offroad_crossing"}

REQUIRED_NOT_NULL = {
    "source_records": ["id"],
    "graph_scale_rules": ["id", "scale_level"],
    "graph_edge_modifiers": ["id"],
    "landscape_templates": ["id", "slug", "title", "base_environment"],
    "water_body_templates": ["id", "slug", "title", "water_body_type", "salinity"],
    "route_templates": ["id", "slug", "title"],
    "land_use_templates": ["id", "slug", "title"],
    "place_templates": ["id", "slug", "title"],
    "regions": ["id"],
    "region_neighbors": ["id", "region_id", "neighbor_region_id"],
    "region_landscape_templates": ["id", "region_id", "landscape_template_id"],
    "region_water_body_templates": ["id", "region_id", "water_body_template_id"],
    "region_land_use_templates": ["id", "region_id", "land_use_template_id"],
    "region_place_templates": ["id", "region_id", "place_template_id"],
    "region_social_roles": ["id", "region_id", "title"],
    "region_occupations": ["id", "region_id", "title"],
    "graph_nodes": ["id", "node_type", "scale_level", "region_id"],
    "graph_edges": ["id", "from_node_id", "to_node_id"],
    "historical_anchors": ["id", "region_id"],
}

G1_REGION_CELL_REQUIRED = [
    "grid_x", "grid_y", "grid_z", "cell_size_km", "crossing_base_gu",
    "crossing_base_time_hours", "region_cell_status", "primary_landscape_template_id",
]

@dataclass
class Violation:
    severity: str
    table: str
    rule: str
    row_id: Optional[str]
    column: Optional[str]
    value: Any
    detail: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "table": self.table,
            "rule": self.rule,
            "row_id": self.row_id,
            "column": self.column,
            "value": self.value,
            "detail": self.detail,
        }


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if value == [] or value == {}:
        return True
    return False


def normalize_json_list(value: Any) -> List[Any]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    if isinstance(value, str):
        s = value.strip()
        if s == "":
            return []
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            try:
                parsed = json.loads(s)
            except json.JSONDecodeError:
                return [s]
            if isinstance(parsed, list):
                return parsed
            return [parsed]
        if ";" in s:
            return [x.strip() for x in s.split(";") if x.strip()]
        return [s]
    return [value]


def looks_like_id(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not s:
        return False
    if " " in s or "," in s or ":" in s:
        return False
    # Project IDs usually contain underscores or compact Latin/Russian identifiers.
    return "_" in s or s.startswith(("lt", "wb", "rt", "pt", "lu", "role", "occ", "region"))


def load_staged_data(input_root: Path, importer_root: Path, manifest: Optional[Path]) -> Dict[str, List[Dict[str, Any]]]:
    scripts_dir = importer_root / "scripts"
    sys.path.insert(0, str(scripts_dir))
    try:
        import import_world_base as importer  # type: ignore
    except Exception as exc:
        raise SystemExit(f"Cannot import importer module from {scripts_dir}: {exc}") from exc
    manifest_path = manifest or (importer_root / "config" / "world_base_import_manifest_v1.json")
    batches = importer.load_all(input_root, manifest_path)
    stub_batch = importer.materialize_missing_source_records(batches)
    if stub_batch is not None:
        batches.append(stub_batch)
    tables: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for batch in batches:
        tables[batch.table].extend(batch.rows)
    return dict(tables)


def load_database_data(database_url: str, tables: Iterable[str]) -> Dict[str, List[Dict[str, Any]]]:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit("Missing dependency: psycopg. Install with: pip install psycopg[binary]") from exc
    data: Dict[str, List[Dict[str, Any]]] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            for table in tables:
                cur.execute(f"SELECT * FROM {SCHEMA_NAME}.{table}")
                data[table] = [dict(row) for row in cur.fetchall()]
    return data


def build_id_sets(tables: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Set[str]]:
    out: Dict[str, Set[str]] = defaultdict(set)
    for table, rows in tables.items():
        for row in rows:
            rid = row.get("id")
            if not is_missing(rid):
                out[table].add(str(rid))
    return dict(out)


def audit_required(tables: Dict[str, List[Dict[str, Any]]]) -> List[Violation]:
    violations: List[Violation] = []
    seen: Dict[str, Set[str]] = defaultdict(set)
    for table, rows in tables.items():
        for idx, row in enumerate(rows, start=1):
            rid = row.get("id")
            for col in REQUIRED_NOT_NULL.get(table, []):
                if is_missing(row.get(col)):
                    violations.append(Violation("error", table, "required_not_null", str(rid) if rid else None, col, row.get(col), f"Required column {col} is empty at row {idx}."))
            if not is_missing(rid):
                rid_s = str(rid)
                if rid_s in seen[table]:
                    violations.append(Violation("error", table, "duplicate_primary_id", rid_s, "id", rid_s, "Duplicate id inside audited data."))
                seen[table].add(rid_s)
    return violations


def audit_fk(tables: Dict[str, List[Dict[str, Any]]], ids: Dict[str, Set[str]]) -> List[Violation]:
    violations: List[Violation] = []
    for table, column, target_table, target_column, label in FK_RULES:
        for row in tables.get(table, []):
            value = row.get(column)
            if is_missing(value):
                continue
            if str(value) not in ids.get(target_table, set()):
                violations.append(Violation("error", table, label, str(row.get("id")) if row.get("id") else None, column, value, f"Referenced value is missing in {target_table}.{target_column}."))
    return violations


def audit_json_refs(tables: Dict[str, List[Dict[str, Any]]], ids: Dict[str, Set[str]]) -> List[Violation]:
    violations: List[Violation] = []
    for table, column, target_table, label in JSON_REF_RULES:
        target_ids = ids.get(target_table, set())
        for row in tables.get(table, []):
            for value in normalize_json_list(row.get(column)):
                if isinstance(value, dict):
                    continue
                if not looks_like_id(str(value)):
                    # Skip prose lists; keep audit strict only for values that look like project ids.
                    continue
                if str(value) not in target_ids:
                    violations.append(Violation("error", table, label, str(row.get("id")) if row.get("id") else None, column, value, f"Referenced JSON value is missing in {target_table}.id."))
    return violations


def audit_sources(tables: Dict[str, List[Dict[str, Any]]], ids: Dict[str, Set[str]]) -> List[Violation]:
    violations: List[Violation] = []
    source_ids = ids.get("source_records", set())
    for table, rows in tables.items():
        if table == "source_records":
            continue
        for row in rows:
            for value in normalize_json_list(row.get("sources")):
                if isinstance(value, dict):
                    value = value.get("id") or value.get("source_id")
                if is_missing(value):
                    continue
                if str(value) not in source_ids:
                    violations.append(Violation("warning", table, "sources[] -> source_records.id", str(row.get("id")) if row.get("id") else None, "sources", value, "Source id is not present in source_records."))
    return violations


def audit_conditional_rules(tables: Dict[str, List[Dict[str, Any]]]) -> List[Violation]:
    violations: List[Violation] = []
    for row in tables.get("graph_edges", []):
        rid = str(row.get("id")) if row.get("id") else None
        edge_type = row.get("edge_type")
        if edge_type in EDGE_TYPE_ROUTE_REQUIRED and is_missing(row.get("route_template_id")):
            violations.append(Violation("error", "graph_edges", "edge_type_requires_route_template", rid, "route_template_id", None, f"edge_type={edge_type} requires route_template_id."))
        if edge_type in EDGE_TYPE_WATER_REQUIRED and is_missing(row.get("water_body_template_id")):
            violations.append(Violation("error", "graph_edges", "edge_type_requires_water_body_template", rid, "water_body_template_id", None, f"edge_type={edge_type} requires water_body_template_id."))
        if edge_type in EDGE_TYPE_LANDSCAPE_REQUIRED and is_missing(row.get("landscape_template_id")):
            violations.append(Violation("error", "graph_edges", "edge_type_requires_landscape_template", rid, "landscape_template_id", None, f"edge_type={edge_type} requires landscape_template_id."))
    for row in tables.get("graph_nodes", []):
        if row.get("scale_level") == "G1" and row.get("node_type") == "region_cell":
            rid = str(row.get("id")) if row.get("id") else None
            for col in G1_REGION_CELL_REQUIRED:
                if is_missing(row.get(col)):
                    violations.append(Violation("error", "graph_nodes", "g1_region_cell_required_fields", rid, col, row.get(col), f"G1 region_cell requires {col}."))
    return violations


def table_summary(tables: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    rows = []
    for table in sorted(tables):
        rows.append({"table": table, "rows": len(tables[table])})
    return rows


def rule_summary(violations: List[Violation]) -> List[Dict[str, Any]]:
    counter = Counter((v.severity, v.table, v.rule) for v in violations)
    rows = []
    for (severity, table, rule), count in sorted(counter.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        rows.append({"severity": severity, "table": table, "rule": rule, "count": count})
    return rows


def run_audit(tables: Dict[str, List[Dict[str, Any]]], mode: str) -> Dict[str, Any]:
    ids = build_id_sets(tables)
    violations: List[Violation] = []
    violations.extend(audit_required(tables))
    violations.extend(audit_fk(tables, ids))
    violations.extend(audit_json_refs(tables, ids))
    violations.extend(audit_sources(tables, ids))
    violations.extend(audit_conditional_rules(tables))
    error_count = sum(1 for v in violations if v.severity == "error")
    warning_count = sum(1 for v in violations if v.severity == "warning")
    return {
        "mode": mode,
        "summary": {
            "tables": len(tables),
            "rows": sum(len(rows) for rows in tables.values()),
            "errors": error_count,
            "warnings": warning_count,
        },
        "table_summary": table_summary(tables),
        "rule_summary": rule_summary(violations),
        "violations": [v.to_dict() for v in violations],
        "audited_rules": {
            "direct_fk_rules": len(FK_RULES),
            "json_ref_rules": len(JSON_REF_RULES),
            "source_ref_rule": "all non-source_records tables with sources[]",
            "conditional_edge_rules": {
                "route_template_required_for": sorted(EDGE_TYPE_ROUTE_REQUIRED),
                "water_body_template_required_for": sorted(EDGE_TYPE_WATER_REQUIRED),
                "landscape_template_required_for": sorted(EDGE_TYPE_LANDSCAPE_REQUIRED),
            },
            "g1_region_cell_required_fields": G1_REGION_CELL_REQUIRED,
        },
    }


def write_json(report: Dict[str, Any], path: Path) -> None:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(rows: List[Dict[str, Any]], path: Path) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    keys = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(report: Dict[str, Any], path: Path) -> None:
    s = report["summary"]
    lines = [
        "# world_base FK audit v1",
        "",
        f"Mode: `{report['mode']}`",
        "",
        "## Summary",
        "",
        f"- Tables audited: {s['tables']}",
        f"- Rows audited: {s['rows']}",
        f"- Errors: {s['errors']}",
        f"- Warnings: {s['warnings']}",
        "",
        "## Table counts",
        "",
        "| Table | Rows |",
        "|---|---:|",
    ]
    for row in report["table_summary"]:
        lines.append(f"| `{row['table']}` | {row['rows']} |")
    lines.extend(["", "## Rule summary", ""])
    if report["rule_summary"]:
        lines.extend(["| Severity | Table | Rule | Count |", "|---|---|---|---:|"])
        for row in report["rule_summary"]:
            lines.append(f"| {row['severity']} | `{row['table']}` | `{row['rule']}` | {row['count']} |")
    else:
        lines.append("No FK, JSON reference, source reference, or conditional edge-rule violations were found.")
    lines.extend(["", "## Audit scope", ""])
    lines.append(f"- Direct FK rules: {report['audited_rules']['direct_fk_rules']}")
    lines.append(f"- JSON reference rules: {report['audited_rules']['json_ref_rules']}")
    lines.append("- Source references: checked for all non-source tables with `sources` arrays.")
    lines.append("- Conditional graph edge rules: checked for route, water, and offroad edge requirements.")
    lines.append("- G1 `region_cell` required fields: checked.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Audit FK integrity for staged or applied world_base data.")
    p.add_argument("--mode", choices=["staged", "database"], default="staged")
    p.add_argument("--input-root", default="/mnt/data")
    p.add_argument("--importer-root", default="/mnt/data/world_base_importer_v1")
    p.add_argument("--manifest", default=None)
    p.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    p.add_argument("--out-json", default="world_base_fk_audit_report_v1.json")
    p.add_argument("--out-md", default="world_base_fk_audit_report_v1.md")
    p.add_argument("--out-violations-csv", default="world_base_fk_violations_v1.csv")
    p.add_argument("--out-rule-summary-csv", default="world_base_fk_rule_summary_v1.csv")
    args = p.parse_args(argv)

    if args.mode == "staged":
        tables = load_staged_data(Path(args.input_root), Path(args.importer_root), Path(args.manifest) if args.manifest else None)
    else:
        if not args.database_url:
            raise SystemExit("--database-url or DATABASE_URL is required for --mode database")
        all_tables = sorted(set(REQUIRED_NOT_NULL) | {r[0] for r in FK_RULES} | {r[2] for r in FK_RULES})
        tables = load_database_data(args.database_url, all_tables)

    report = run_audit(tables, args.mode)
    write_json(report, Path(args.out_json))
    write_markdown(report, Path(args.out_md))
    write_csv(report["violations"], Path(args.out_violations_csv))
    write_csv(report["rule_summary"], Path(args.out_rule_summary_csv))

    print(f"Audited {report['summary']['rows']} rows across {report['summary']['tables']} tables.")
    print(f"FK audit: {report['summary']['errors']} errors, {report['summary']['warnings']} warnings.")
    print(f"Report: {args.out_md}")
    return 1 if report["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
