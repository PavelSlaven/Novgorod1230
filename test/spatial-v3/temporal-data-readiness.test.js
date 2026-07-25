import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assessTemporalDataReadiness,
  assessTemporalDataReadinessForActivation,
  TEMPORAL_DATA_READINESS_PATH,
  TEMPORAL_REQUIRED_DATA_FAMILIES
} from '../../tools/spatial-v3/temporal-data-readiness.mjs';
import { temporalDataReadinessP28Blockers } from '../../tools/spatial-v3/p28-activation-gate.mjs';

const manifest = JSON.parse(await readFile(TEMPORAL_DATA_READINESS_PATH, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function approvedFamily(family, approval) {
  return {
    ...family,
    existing_status: 'complete',
    approved: true,
    import_paths: ['tools/temporal-v4/import-approved-data.mjs'],
    approval,
    blockers: []
  };
}

function approvalActivationFixture() {
  const files = new Map();
  const importerPath = 'tools/temporal-v4/import-approved-data.mjs';
  const schemaPath = 'infra/world-base/SCHEMA_REFERENCE.md';
  files.set(importerPath, Buffer.from('export const importApprovedTemporalData = true;\n'));
  files.set(schemaPath, Buffer.from('# Generated schema\n'));

  const families = manifest.families.map((family) => {
    const base = `data/world-catalogs/novgorod/temporal-v4`;
    const recordId = `record:${family.id}`;
    const provenanceId = `provenance:${family.id}`;
    const referenceId = `reference:${family.id}`;
    const sourceId = `source:${family.id}`;
    const decisionId = `decision:${family.id}:fixture`;
    const sourcePath = `${base}/sources/${family.id}.md`;
    const datasetPath = `${base}/datasets/${family.id}.json`;
    const provenancePath = `${base}/source-approval/${family.id}.provenance.json`;
    const referencesPath = `${base}/datasets/${family.id}.references.json`;
    const historyPath = `${base}/source-approval/${family.id}.sources.json`;
    const approvalPath = `${base}/approvals/${family.id}.json`;
    const decisionPath =
      `docs/work/temporal-world-v4/external-data-audit/decisions/${family.id}.decision.json`;
    const sourceBytes = Buffer.from(`# Source for ${family.id}\n`);
    const records = [{
      record_id: recordId,
      family_id: family.id,
      status: 'approved',
      version: '1',
      applicability: ['novgorod'],
      provenance_refs: [provenanceId],
      normalized_reference_ids: [referenceId],
      source_history_refs: [sourceId]
    }];
    const provenance = [{
      provenance_id: provenanceId,
      status: 'approved',
      source_ids: [sourceId],
      decision_id: decisionId
    }];
    const references = [{
      reference_id: referenceId,
      status: 'approved',
      table: 'universal_categories',
      record_id: `category:${family.id}`
    }];
    const history = [{
      source_id: sourceId,
      status: 'approved',
      source_path: sourcePath,
      source_sha256: sha256(sourceBytes)
    }];
    const encoded = {
      dataset: Buffer.from(JSON.stringify(records)),
      provenance: Buffer.from(JSON.stringify(provenance)),
      normalized_references: Buffer.from(JSON.stringify(references)),
      source_history: Buffer.from(JSON.stringify(history))
    };
    files.set(sourcePath, sourceBytes);
    files.set(datasetPath, encoded.dataset);
    files.set(provenancePath, encoded.provenance);
    files.set(referencesPath, encoded.normalized_references);
    files.set(historyPath, encoded.source_history);
    const decisionBytes = Buffer.from(JSON.stringify({
      schema: 'rus.temporal-world-v4.external-auditor-family-decision.v1',
      version: 1,
      family_id: family.id,
      verdict: 'approved',
      approved_record_ids: [recordId],
      source_ids_reviewed: [sourceId],
      applicability: ['novgorod'],
      data_gaps: [],
      decision_id: decisionId
    }));
    files.set(decisionPath, decisionBytes);

    const approvalManifest = {
      schema: 'rus.temporal-world-v4.data-family-approval.v1',
      version: 1,
      family_id: family.id,
      status: 'approved',
      record_version: '1',
      applicability: ['novgorod'],
      record_ids: [recordId],
      data_gaps: [],
      external_audit_decision: {
        path: decisionPath,
        sha256: sha256(decisionBytes),
        decision_id: decisionId
      },
      artifacts: {
        dataset: { path: datasetPath, sha256: sha256(encoded.dataset) },
        provenance: { path: provenancePath, sha256: sha256(encoded.provenance) },
        normalized_references: { path: referencesPath, sha256: sha256(encoded.normalized_references) },
        source_history: { path: historyPath, sha256: sha256(encoded.source_history) },
        deterministic_import: { path: importerPath, sha256: sha256(files.get(importerPath)) },
        generated_schema: { path: schemaPath, sha256: sha256(files.get(schemaPath)) }
      }
    };
    const approvalBytes = Buffer.from(JSON.stringify(approvalManifest));
    files.set(approvalPath, approvalBytes);
    return approvedFamily(family, {
      status: 'approved',
      version: '1',
      applicability: ['novgorod'],
      manifest_path: approvalPath,
      manifest_sha256: sha256(approvalBytes)
    });
  });

  return {
    candidate: { ...manifest, activation_status: 'ready', families },
    files
  };
}

test('Temporal v4 readiness matrix covers the exact 13 normative families and blocks activation honestly', () => {
  assert.equal(TEMPORAL_REQUIRED_DATA_FAMILIES.length, 13);
  assert.deepEqual(
    manifest.families.map(({ id }) => id),
    TEMPORAL_REQUIRED_DATA_FAMILIES.map(({ id }) => id)
  );

  const assessment = assessTemporalDataReadiness(manifest);
  assert.equal(assessment.valid, true);
  assert.equal(assessment.activation_ready, false);
  assert.equal(new Set(assessment.blockers.map(({ family_id }) => family_id)).size, 13);
});

test('Temporal v4 readiness audit references existing repository evidence, imports, and tests', async () => {
  const referencedPaths = new Set([
    manifest.normative_source,
    ...manifest.families.flatMap((family) => [
      ...family.import_paths,
      ...family.tests,
      ...family.evidence_paths
    ])
  ]);
  await Promise.all([...referencedPaths].map((path) => access(path)));
});

test('Temporal v4 readiness rejects missing, duplicate, unknown, and reordered family coverage', () => {
  const missing = { ...manifest, families: manifest.families.slice(1) };
  const duplicate = { ...manifest, families: [manifest.families[0], ...manifest.families.slice(0, -1)] };
  const unknown = {
    ...manifest,
    families: manifest.families.map((family, index) => index === 0 ? { ...family, id: 'unknown_family' } : family)
  };
  const reordered = { ...manifest, families: [...manifest.families].reverse() };

  for (const candidate of [missing, duplicate, unknown, reordered]) {
    assert.equal(assessTemporalDataReadiness(candidate).valid, false);
  }
});

test('Temporal v4 readiness requires a typed blocker for every unapproved family', () => {
  const candidate = {
    ...manifest,
    activation_status: 'blocked',
    families: manifest.families.map((family, index) => index === 0 ? {
      ...family,
      existing_status: 'absent',
      approved: false,
      approval: null,
      blockers: []
    } : family)
  };
  const assessment = assessTemporalDataReadiness(candidate);
  assert.equal(assessment.valid, false);
  assert(assessment.errors.some(({ code, family_id }) =>
    code === 'temporal_data_readiness_blocker_missing' &&
    family_id === manifest.families[0].id
  ));
});

test('Temporal v4 readiness cannot approve records without complete authoring and import evidence', () => {
  const candidate = {
    ...manifest,
    families: manifest.families.map((family, index) => index === 0
      ? { ...family, existing_status: 'complete', approved: true, blockers: [], approval: null }
      : family)
  };
  const assessment = assessTemporalDataReadiness(candidate);
  assert.equal(assessment.valid, false);
  assert(assessment.errors.some(({ code, family_id }) =>
    code === 'temporal_data_readiness_approval_evidence_invalid' &&
    family_id === manifest.families[0].id
  ));
});

test('Temporal v4 readiness does not activate a structurally approved fixture before external evidence verification', () => {
  const { candidate } = approvalActivationFixture();
  const assessment = assessTemporalDataReadiness(candidate);
  assert.equal(assessment.valid, true);
  assert.equal(assessment.activation_ready, false);
  assert.deepEqual(assessment.errors, []);
  assert.equal(new Set(assessment.blockers.map(({ family_id }) => family_id)).size, 13);
  assert(assessment.blockers.every(({ gap_code }) =>
    gap_code === 'temporal_data_approval_evidence_unverified'));
});

test('Temporal v4 activation verifies complete source-backed approval bundles and their SHA-256 bytes', async () => {
  const { candidate, files } = approvalActivationFixture();
  const assessment = await assessTemporalDataReadinessForActivation(candidate, {
    readRepositoryFile: async (path) => {
      if (!files.has(path)) throw new Error(`missing fixture: ${path}`);
      return files.get(path);
    }
  });
  assert.equal(assessment.valid, true);
  assert.equal(assessment.activation_ready, true);
  assert.deepEqual(assessment.errors, []);
  assert.deepEqual(assessment.blockers, []);
});

test('Temporal v4 activation rejects fixture, legacy, vocabulary, and DDL substitutes as approval evidence', async () => {
  const { candidate, files } = approvalActivationFixture();
  const first = candidate.families[0];
  const approvalBytes = files.get(first.approval.manifest_path);
  const approvalManifest = JSON.parse(approvalBytes.toString('utf8'));
  approvalManifest.artifacts = {
    ...approvalManifest.artifacts,
    dataset: { path: 'fixtures/not-approved.json', sha256: 'a'.repeat(64) },
    provenance: { path: 'legacy/rows.sql', sha256: 'b'.repeat(64) },
    normalized_references: { path: 'vocabulary.json', sha256: 'c'.repeat(64) },
    generated_schema: { path: 'ddl.sql', sha256: 'd'.repeat(64) }
  };
  const replacedBytes = Buffer.from(JSON.stringify(approvalManifest));
  files.set(first.approval.manifest_path, replacedBytes);
  first.approval.manifest_sha256 = sha256(replacedBytes);

  const assessment = await assessTemporalDataReadinessForActivation(candidate, {
    readRepositoryFile: async (path) => files.get(path)
  });
  assert.equal(assessment.activation_ready, false);
  assert(assessment.errors.some(({ code, family_id }) =>
    code === 'temporal_data_readiness_approval_artifact_invalid' &&
    family_id === first.id
  ));
});

test('Temporal v4 activation rejects a tampered external audit decision', async () => {
  const { candidate, files } = approvalActivationFixture();
  const first = candidate.families[0];
  const approvalManifest = JSON.parse(
    files.get(first.approval.manifest_path).toString('utf8')
  );
  const decisionPath = approvalManifest.external_audit_decision.path;
  files.set(decisionPath, Buffer.from('{"verdict":"approved"}'));

  const assessment = await assessTemporalDataReadinessForActivation(candidate, {
    readRepositoryFile: async (path) => files.get(path)
  });
  assert.equal(assessment.activation_ready, false);
  assert(assessment.errors.some(({ code, family_id }) =>
    code === 'temporal_data_readiness_external_decision_digest_mismatch' &&
    family_id === first.id
  ));
});

test('Temporal v4 activation verifies immutable prior decisions before accepting inherited provenance', async () => {
  const historicalPath =
    'docs/work/temporal-world-v4/external-data-audit/historical-decisions/npc_temporal_profiles_policies.2026-07-24-reaudit-2.decision.json';
  const assessment = await assessTemporalDataReadinessForActivation(manifest, {
    readRepositoryFile: async (path) => path === historicalPath
      ? Buffer.from('{"verdict":"approved"}')
      : readFile(path)
  });

  assert.equal(assessment.activation_ready, false);
  assert(assessment.errors.some(({ code, family_id }) =>
    code === 'temporal_data_readiness_external_decision_invalid'
    && family_id === 'npc_temporal_profiles_policies'
  ));
});

test('P28 converts every unresolved Temporal family into a fail-closed activation blocker', async () => {
  const blockedManifest = {
    ...manifest,
    activation_status: 'blocked',
    families: manifest.families.map((family, index) => ({
      ...family,
      existing_status: 'absent',
      approved: false,
      approval: null,
      blockers: [{
        code: TEMPORAL_REQUIRED_DATA_FAMILIES[index].gap_codes[0],
        reason: 'Deliberately unresolved test fixture.'
      }]
    }))
  };
  const blockers = await temporalDataReadinessP28Blockers(blockedManifest);
  assert.equal(new Set(blockers.map(({ family_id }) => family_id)).size, 13);
  assert(blockers.every(({ code, gap_code }) =>
    code === 'temporal_required_data_gap' &&
    typeof gap_code === 'string' &&
    gap_code.length > 0
  ));
});

test('P28 emits no Temporal data blockers for the byte-verified approved matrix', async () => {
  assert.deepEqual(await temporalDataReadinessP28Blockers(manifest), []);
});
