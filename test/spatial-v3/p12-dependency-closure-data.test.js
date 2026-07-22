import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const bundle = join(root, "data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1");
const json = (path) => JSON.parse(readFileSync(join(bundle, path), "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("P12 dependency closure generator is reproducible and validates exact counts", () => {
  const bindingPath = join(bundle, "subject-commit-binding.json");
  const evidenceBinding = existsSync(bindingPath) ? readFileSync(bindingPath) : null;
  try {
    execFileSync(process.execPath, [join(root, "scripts/generate-p12-dependency-closure.mjs")], { cwd: root });
    const firstManifest = readFileSync(join(bundle, "manifest.json"), "utf8");
    execFileSync(process.execPath, [join(root, "scripts/generate-p12-dependency-closure.mjs")], { cwd: root });
    assert.equal(readFileSync(join(bundle, "manifest.json"), "utf8"), firstManifest);
    execFileSync(process.execPath, [join(bundle, "scripts/validate-bundle.mjs")], { cwd: root });
    assert.deepEqual(json("reports/count-ledger.json").actual, json("reports/count-ledger.json").expected);
    assert.equal(json("reports/dependency-coverage.json").hard_gap, 0);
    assert.equal(json("import-manifest.json").bundle_kind, "dependency_closure");
    assert.equal(json("import-manifest.json").data_gaps.length, 0);
    const gridCells = json("datasets/spatial_v3_g1_grid_cells.json");
    assert.equal(gridCells.length, 1);
    assert.equal(gridCells[0].grid_convention, "grid_east_north_v1");
    const reapproval = json("REAPPROVAL_REQUEST.json");
    assert.equal(reapproval.status, "PENDING_INDEPENDENT_REAPPROVAL");
    assert.equal(reapproval.exact_changed_contract.new_value, "grid_east_north_v1");
    assert.equal(reapproval.exact_changed_contract.sha256, sha(readFileSync(join(bundle, reapproval.exact_changed_contract.path))));
    assert.equal(json("APPROVAL_DECISION.json").status, "APPROVED_FOR_P12_DEPENDENCY_CLOSURE");
    assert.match(json("APPROVAL_DECISION.json").independent_audit, /^PASS_FOR_SUBJECT_/u);
  } finally {
    // Evidence-only commits add this file outside the deterministic subject
    // bundle. Generator tests must not leave an approved checkout dirty.
    if (evidenceBinding) writeFileSync(bindingPath, evidenceBinding);
  }
});

test("technical DDL digest-only drift preserves an existing approval", () => {
  const trackedMetadata = ["APPROVAL_DECISION.json", "manifest.json", "manifest.sha256", "subject-commit-binding.json"];
  const saved = new Map(trackedMetadata.filter((path) => existsSync(join(bundle, path))).map((path) => [path, readFileSync(join(bundle, path))]));
  try {
    const staleManifest = json("manifest.json");
    staleManifest.pins.current_ddl_sha256 = "0".repeat(64);
    const staleManifestBytes = `${JSON.stringify(staleManifest, null, 2)}\n`;
    writeFileSync(join(bundle, "manifest.json"), staleManifestBytes);
    writeFileSync(join(bundle, "manifest.sha256"), `${sha(staleManifestBytes)}  manifest.json\n`);

    execFileSync(process.execPath, [join(root, "scripts/generate-p12-dependency-closure.mjs")], { cwd: root });
    assert.equal(json("APPROVAL_DECISION.json").status, "APPROVED_FOR_P12_DEPENDENCY_CLOSURE");
    assert.match(json("APPROVAL_DECISION.json").independent_audit, /^PASS_FOR_SUBJECT_/u);
    assert.notEqual(json("manifest.json").pins.current_ddl_sha256, "0".repeat(64));
    const manifestBytes = readFileSync(join(bundle, "manifest.json"));
    assert.equal(readFileSync(join(bundle, "manifest.sha256"), "utf8"), `${sha(manifestBytes)}  manifest.json\n`);
    assert.equal(json("manifest.json").files.find((entry) => entry.path === "APPROVAL_DECISION.json").sha256, sha(readFileSync(join(bundle, "APPROVAL_DECISION.json"))));
  } finally {
    for (const [path, bytes] of saved) writeFileSync(join(bundle, path), bytes);
  }
});

test("self-consistent approval tamper cannot replace the committed authority", () => {
  const trackedMetadata = ["APPROVAL_DECISION.json", "manifest.json", "manifest.sha256", "subject-commit-binding.json"];
  const saved = new Map(trackedMetadata.filter((path) => existsSync(join(bundle, path))).map((path) => [path, readFileSync(join(bundle, path))]));
  try {
    const forgedApproval = json("APPROVAL_DECISION.json");
    forgedApproval.independent_audit = "PASS_FOR_SUBJECT_FORGED";
    writeFileSync(join(bundle, "APPROVAL_DECISION.json"), `${JSON.stringify(forgedApproval, null, 2)}\n`);
    const forgedManifest = json("manifest.json");
    forgedManifest.files.find((entry) => entry.path === "APPROVAL_DECISION.json").sha256 = sha(readFileSync(join(bundle, "APPROVAL_DECISION.json")));
    const forgedManifestBytes = `${JSON.stringify(forgedManifest, null, 2)}\n`;
    writeFileSync(join(bundle, "manifest.json"), forgedManifestBytes);
    writeFileSync(join(bundle, "manifest.sha256"), `${sha(forgedManifestBytes)}  manifest.json\n`);

    execFileSync(process.execPath, [join(root, "scripts/generate-p12-dependency-closure.mjs")], { cwd: root });
    assert.equal(json("APPROVAL_DECISION.json").status, "PROPOSED_FOR_P12_DEPENDENCY_CLOSURE");
    assert.equal(json("APPROVAL_DECISION.json").independent_audit, "pending_reapproval");
  } finally {
    for (const [path, bytes] of saved) writeFileSync(join(bundle, path), bytes);
  }
});

test("semantic content drift demotes approval and remains fail-closed", () => {
  const trackedMetadata = ["APPROVAL_DECISION.json", "manifest.json", "manifest.sha256", "subject-commit-binding.json"];
  const saved = new Map(trackedMetadata.filter((path) => existsSync(join(bundle, path))).map((path) => [path, readFileSync(join(bundle, path))]));
  try {
    const semanticPath = join(bundle, "data/category-decision-ledger.json");
    const semantic = JSON.parse(readFileSync(semanticPath, "utf8"));
    semantic.records[0].decision = `${semantic.records[0].decision ?? "approved"}_tampered`;
    writeFileSync(semanticPath, `${JSON.stringify(semantic, null, 2)}\n`);
    const tamperedManifest = json("manifest.json");
    tamperedManifest.files.find((entry) => entry.path === "data/category-decision-ledger.json").sha256 = sha(readFileSync(semanticPath));
    const tamperedManifestBytes = `${JSON.stringify(tamperedManifest, null, 2)}\n`;
    writeFileSync(join(bundle, "manifest.json"), tamperedManifestBytes);
    writeFileSync(join(bundle, "manifest.sha256"), `${sha(tamperedManifestBytes)}  manifest.json\n`);

    execFileSync(process.execPath, [join(root, "scripts/generate-p12-dependency-closure.mjs")], { cwd: root });
    assert.equal(json("APPROVAL_DECISION.json").status, "PROPOSED_FOR_P12_DEPENDENCY_CLOSURE");
    assert.equal(json("APPROVAL_DECISION.json").independent_audit, "pending_reapproval");
    assert.equal(json("APPROVAL_DECISION.json").production_activation, "blocked");
    assert.equal(json("APPROVAL_DECISION.json").p28_status, "blocked");
  } finally {
    for (const [path, bytes] of saved) writeFileSync(join(bundle, path), bytes);
  }
});

test("generator inputs are tracked clean-clone artifacts and never local extraction paths", () => {
  const generatorSource = readFileSync(join(root, "scripts/generate-p12-dependency-closure.mjs"), "utf8");
  assert.doesNotMatch(generatorSource, /(?:\.tmp-|Downloads|AppData)/u);
  const inputs = [
    "data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md",
    "data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/data/approved-scene-template-families.json",
    "data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/data/provenance.json",
    "data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/source-snapshots/gn_nov_g1_xp017_yp026_rebuild_002_approved_local.zip",
    "data/world-catalogs/novgorod/spatial-v3/target-contract-spec/P12_TARGET_CONTRACT_COMPILATION_SPEC_V1.zip",
    "data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip",
    "infra/world-base/schema.sql"
  ];
  const schemaEntry = readFileSync(join(root, "infra/world-base/schema.sql"), "utf8");
  for (const match of schemaEntry.matchAll(/^\\ir\s+(.+)$/gmu)) inputs.push(`infra/world-base/${match[1].trim()}`);
  for (const input of inputs) {
    assert.doesNotThrow(() => execFileSync("git", ["ls-files", "--error-unmatch", input], { cwd: root, stdio: "pipe" }), input);
    assert.doesNotThrow(() => readFileSync(join(root, input)), input);
  }
});

test("G3 classification is explicit, complete and conservative", () => {
  const rows = json("data/g3-classification-decision.json").records;
  assert.equal(rows.length, 32);
  assert.equal(new Set(rows.map((row) => row.g3_id)).size, 32);
  assert.equal(rows.find((r) => r.g3_id.endsWith("zaostrovye_settlement_center")).approved_target_class, "spatial.g3.settlement");
  assert.equal(rows.find((r) => r.g3_id.endsWith("zaostrovye_burial_area")).approved_target_class, "spatial.g3.built_site");
  assert.equal(rows.find((r) => r.g3_id.endsWith("vikhtuy_resource_edge")).approved_target_class, "spatial.g3.resource_site");
  assert.equal(rows.find((r) => r.g3_id.endsWith("vikhtuy_locality")).approved_target_class, "spatial.g3.recurrent_site");
  assert.ok(rows.every((row) => row.reasoning.length > 40 && row.forbidden_stronger_classifications.length > 0));
});

test("categories are exact, decision-backed, and never claim runtime activation", () => {
  const categories = json("data/universal-categories.json").records;
  const decisions = json("data/category-decision-ledger.json").records;
  assert.equal(categories.length, 57);
  assert.equal(new Set(categories.map((row) => row.id)).size, 57);
  assert.equal(new Set(categories.map((row) => row.definition)).size, 57);
  assert.equal(new Set(categories.map((row) => row.scope_note)).size, 57);
  assert.equal(new Set(categories.map((row) => row.inclusion_rules[0])).size, 57);
  assert.equal(new Set(categories.map((row) => row.exclusion_rules[0])).size, 57);
  assert.equal(new Set(categories.map((row) => row.title)).size, 57);
  assert.ok(categories.every((row) => row.basis_anchors.length >= 1));
  assert.equal(decisions.length, 57);
  assert.ok(decisions.every((row) => row.basis_anchors.length >= 1 && row.forbidden_inferences.length >= 2));
  assert.ok(categories.every((row) => row.definition.length > 60 && row.inclusion_rules.length && row.exclusion_rules.length));
  assert.equal(json("APPROVAL_DECISION.json").production_activation, "blocked");
  assert.equal(json("APPROVAL_DECISION.json").p28_status, "blocked");
});

test("category, template, and rule provenance uses exact repository anchors", () => {
  const links = json("data/record-sources.json").records.filter((row) => ["universal_category", "regional_scene_template", "scene_rule"].includes(row.record_kind));
  assert.equal(links.length, 76);
  assert.ok(links.every((row) => row.source_id === "prov_p12_g1_r2_r3_v1"));
  assert.ok(links.every((row) => (row.basis_anchor || row.basis_anchors) && row.support_summary));
  assert.ok(links.every((row) => row.source_id !== "SRC_G1R2_MAP_RULES"));
});

test("all 57 category anchors resolve uniquely and match raw digests", () => {
  const categories = json("data/universal-categories.json").records;
  for (const category of categories) {
    for (const anchor of category.basis_anchors) {
      const canonical = join(root, anchor.canonical_path);
      const archiveOrFile = readFileSync(canonical);
      assert.equal(sha(archiveOrFile), anchor.raw_sha256, `${category.id}: canonical digest`);
      if (anchor.anchor_kind === "repository_line_range") {
        const lines = archiveOrFile.toString("utf8").split(/\r?\n/);
        assert.ok(anchor.start_line >= 1 && anchor.end_line <= lines.length && anchor.start_line <= anchor.end_line);
        assert.ok(lines.slice(anchor.start_line - 1, anchor.end_line).join("\n").includes(anchor.required_text), `${category.id}: required line text`);
        continue;
      }
      assert.equal(anchor.anchor_kind, "immutable_zip_json_record");
      const member = execFileSync("tar", ["-xOf", canonical, anchor.internal_path], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
      assert.equal(sha(member), anchor.internal_raw_sha256, `${category.id}: member digest`);
      let selected = JSON.parse(member.toString("utf8"));
      for (const token of anchor.json_pointer.split("/").filter(Boolean)) selected = selected[token.replaceAll("~1", "/").replaceAll("~0", "~")];
      assert.ok(Array.isArray(selected), `${category.id}: pointer must select an array`);
      const matches = selected.filter((row) => row?.[anchor.record_predicate.field] === anchor.record_predicate.equals);
      assert.equal(matches.length, 1, `${category.id}: record predicate must be unique`);
    }
  }
});

test("source ledger and parent graph preserve exact approved identities", () => {
  const sources = json("data/source-records.json").records;
  const nodes = json("data/spatial-nodes.json").records;
  const parents = json("data/node-parents.json").records;
  assert.equal(sources.filter((row) => row.source_id).length, 11);
  assert.equal(sources.find((row) => row.id === "prov_p12_g1_r2_r3_v1").record_kind, "repository_provenance");
  assert.deepEqual(nodes.reduce((acc, row) => ({ ...acc, [row.scale]: (acc[row.scale] ?? 0) + 1 }), {}), { G0: 1, G1: 1, G2: 15, G3: 32 });
  assert.equal(parents.length, 48);
  assert.equal(parents.filter((r) => r.parent_id === "region_novgorod_land").length, 1);
  assert.equal(parents.filter((r) => r.parent_id === "gn_nov_g1_xp017_yp026").length, 15);
});
