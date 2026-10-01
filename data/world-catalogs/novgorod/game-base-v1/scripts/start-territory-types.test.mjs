import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadPackage, validateStartTerritoryTypes } from '../places-binding/start-territory-types/validate.mjs';
import { assertEvidenceSourceMatches, buildResearchEvidence } from '../places-binding/start-territory-types/extract-research-evidence.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const extractorFixture = JSON.parse(fs.readFileSync(path.join(HERE, 'start-territory-types-extractor.fixture.json'), 'utf8'));
const extractorSpec = [{
  topic: 'synthetic',
  items: [
    { findingLocator: 'finding-alpha', checkClaim: 'Check alpha', evidenceId: 'synthetic-alpha', source: ['https://example.test/alpha'], locator: 'alpha' },
    { findingLocator: 'finding-beta', checkClaim: 'Check beta', evidenceId: 'synthetic-beta', source: ['https://example.test/beta'], locator: 'beta' },
  ],
}];

test('research extractor binds evidence to claims and verifier notes by stable IDs', () => {
  const evidence = buildResearchEvidence(extractorFixture, extractorSpec);
  assertEvidenceSourceMatches(extractorFixture, evidence, extractorSpec);

  const shuffledRecords = structuredClone(extractorFixture);
  shuffledRecords.topics[0].research.findings.reverse();
  shuffledRecords.topics[0].verification.checks.reverse();
  assert.deepEqual(buildResearchEvidence(shuffledRecords, extractorSpec), evidence);

  const shuffledEvidence = structuredClone(evidence);
  shuffledEvidence.entries.reverse();
  assert.doesNotThrow(() => assertEvidenceSourceMatches(extractorFixture, shuffledEvidence, extractorSpec));

  const changedClaim = structuredClone(extractorFixture);
  changedClaim.topics[0].research.findings[0].claim = 'Changed claim';
  assert.throws(() => assertEvidenceSourceMatches(changedClaim, evidence, extractorSpec), /source drift requires review/u);

  const changedNote = structuredClone(extractorFixture);
  changedNote.topics[0].verification.checks[0].note = 'Changed verifier note';
  assert.throws(() => assertEvidenceSourceMatches(changedNote, evidence, extractorSpec), /source drift requires review/u);
});

test('candidate start-territory type matrix covers catalog and exact G4/G5/PF references', () => {
  const result = validateStartTerritoryTypes();
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.inventory, 70);
  assert.equal(result.counts.candidates, 39);
  assert.equal(result.counts.gaps, 31);
  assert.ok(result.counts.duplicateCauseShare <= 0.2);
});

test('research evidence contains only the curated verified findings with stable source anchors', () => {
  const data = loadPackage();
  assert.deepEqual(data.researchEvidence.map((row) => row.evidence_id), [
    'bort-01', 'bort-02', 'bort-03', 'orchard-01', 'orchard-02', 'orchard-11', 'orchard-12', 'orchard-14',
    'quarry-01', 'quarry-02', 'quarry-07', 'quarry-15',
  ]);
  assert.ok(data.researchEvidence.every((row) => row.verification_status === 'verified'));
  assert.ok(data.researchEvidence.every((row) => row.source.length && row.source.every((url) => url.startsWith('https://'))));
  assert.ok(data.researchEvidence.every((row) => !row.short_quote || row.short_quote.trim().split(/\s+/u).length <= 25));
  assert.match(data.researchEvidence.find((row) => row.evidence_id === 'bort-01').note, /Сибирь, а не Урал/u);
  assert.equal(data.researchEvidence.some((row) => /1895/u.test(row.evidence_id)), false);
});

test('rejects a research-evidence anchor that is absent or not verified', () => {
  const data = loadPackage();
  const row = data.matrix.find((item) => item.type_id === 'lu_orchard_fruit_grove');
  row.source_refs = row.source_refs.replace('research-evidence.json#orchard-01', 'research-evidence.json#missing-id');
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error === `MATRIX_EVIDENCE: ${row.type_id}`));
});

test('rejects a dangling candidate node reference', () => {
  const data = loadPackage();
  data.candidates[0].candidate_G4_refs = 'g4v3__unknown@1';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('NODE_REF:')));
});

test('rejects a candidate ref with incompatible landform or water body', () => {
  const data = loadPackage();
  const row = data.candidates.find((candidate) => candidate.type_id === 'lu_fish_weir_trap_operation');
  row.candidate_G4_refs = 'g4v3__gn_nov_g3_xp017_yp026_r2_dry_pine_ridge@1';
  row.candidate_compatibility_exceptions = '[]';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('NODE_TEMPLATE_INCOMPATIBLE:')));
});

test('accepts only source-backed, exact-node compatibility exceptions', () => {
  const data = loadPackage();
  const row = data.candidates.find((candidate) => candidate.type_id === 'lu_hay_meadow_cutting');
  const exceptions = JSON.parse(row.candidate_compatibility_exceptions);
  assert.ok(exceptions.length > 0);
  assert.ok(exceptions.every((exception) => exception.node_ref && exception.dimension && exception.reason && exception.source_refs));
  assert.deepEqual(validateStartTerritoryTypes(data).errors, []);
});

test('rejects duplicate compatibility exceptions for the same node axis', () => {
  const data = loadPackage();
  const row = data.candidates.find((candidate) => candidate.type_id === 'lu_hay_meadow_cutting');
  const exceptions = JSON.parse(row.candidate_compatibility_exceptions);
  row.candidate_compatibility_exceptions = JSON.stringify([...exceptions, exceptions[0]]);
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('COMPATIBILITY_EXCEPTION_DUPLICATE:')));
});

test('rejects selector status copied from the stale PF inventory', () => {
  const data = loadPackage();
  data.matrix.find((row) => row.type_id === 'lu_dye_medicinal_crop_plot').current_regional_environment_candidate_selector = 'selected';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('SELECTOR_STATUS:')));
});

test('rejects a typed gap without a closure condition', () => {
  const data = loadPackage();
  data.gaps[0].closure_evidence_or_decision = '';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('GAP_EVIDENCE:')));
});

test('rejects templated causal reasons above the 20 percent review threshold', () => {
  const data = loadPackage();
  for (const row of data.matrix) row.reason = 'Одинаковая типовая причина отсутствия основания для проверки.';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('DUPLICATE_CAUSES:')));
});


test('rejects unresolved source refs even when another source ref resolves', () => {
  const data = loadPackage();
  const row = data.candidates.find((candidate) => candidate.type_id === 'lu_clay_extraction');
  row.source_refs += '; missing/source.csv:999';
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error === `CANDIDATE_EVIDENCE: ${row.type_id}`));
});

test('rejects exception node_binding line that belongs to another node', () => {
  const data = loadPackage();
  const row = data.candidates.find((candidate) => candidate.type_id === 'lu_hay_meadow_cutting');
  const exceptions = JSON.parse(row.candidate_compatibility_exceptions);
  const exception = exceptions.find((item) => item.source_refs.includes('node_binding.csv:'));
  exception.source_refs = exception.source_refs.replace(/node_binding\.csv:\d+/u, 'node_binding.csv:3');
  row.candidate_compatibility_exceptions = JSON.stringify(exceptions);
  assert.ok(validateStartTerritoryTypes(data).errors.some((error) => error.startsWith('COMPATIBILITY_EXCEPTION_EVIDENCE:')));
});

test('rejects matrix drift from candidate and gap assessment, reason, or refs', () => {
  const candidateData = loadPackage();
  const candidate = candidateData.candidates.find((row) => row.type_id === 'lu_clay_extraction');
  candidate.causal_reason += ' stale';
  assert.ok(validateStartTerritoryTypes(candidateData).errors.some((error) => error === `MATRIX_DETAIL_MIRROR: ${candidate.type_id}`));

  const gapData = loadPackage();
  const gap = gapData.gaps.find((row) => row.type_id === 'lu_dye_medicinal_crop_plot');
  gap.assessment = 'не применим по имеющимся данным';
  assert.ok(validateStartTerritoryTypes(gapData).errors.some((error) => error === `MATRIX_DETAIL_MIRROR: ${gap.type_id}`));

  const refsData = loadPackage();
  const matrixRow = refsData.matrix.find((row) => row.type_id === 'lu_clay_extraction');
  matrixRow.source_refs += '; infra/world-base/land_use_templates.seed.json:3';
  assert.ok(validateStartTerritoryTypes(refsData).errors.some((error) => error === `MATRIX_DETAIL_MIRROR: ${matrixRow.type_id}`));
});
