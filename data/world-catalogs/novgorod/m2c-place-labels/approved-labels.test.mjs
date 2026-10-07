import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { approvedPlaceLabelsFromAttestation, loadApprovedPlaceLabels } from './approved-labels.mjs';
import * as approvedLabelModule from './approved-labels.mjs';

const candidateBytes = readFileSync(new URL('./candidate.json', import.meta.url));
const candidate = JSON.parse(candidateBytes);
const approval = JSON.parse(readFileSync(new URL('./approval-attestation.json', import.meta.url)));
const naturalCandidateBytes = readFileSync(new URL('../m2c-natural/candidate.json', import.meta.url));
const successorCandidateBytes = readFileSync(new URL('../m2c-natural/nature-successor-candidate-v2.json', import.meta.url));
const successorApproval = JSON.parse(readFileSync(new URL('../m2c-natural/nature-successor-data-approval.json', import.meta.url)));

function naturalSuccessorInputs(overrides = {}) {
  return { naturalCandidateBytes, successorCandidateBytes, successorApproval,
    ...overrides };
}

function naturalSuccessorAliases(inputs) {
  const load = approvedLabelModule.approvedPlaceLabelsWithNaturalSuccessors;
  assert.equal(typeof load, 'function', 'approved successor resolver is available');
  return load(candidateBytes, approval, inputs);
}

test('reader exposes the seven D107 G5 labels and 320 approved natural labels', () => {
  const labels = approvedPlaceLabelsFromAttestation(candidateBytes, approval);
  assert.equal(labels.size, 327);
  assert.equal(approval.approved_rows.filter((row) => row.canonical_g5_id).length, 7);
  assert.equal(approval.approved_rows.filter((row) => row.natural_place_ref).length, 320);
  assert.deepEqual(approval.decision_refs, ['D107', 'D112', 'D118', 'A03']);
  assert.deepEqual(approval.natural_label_decision_refs, ['D112', 'D118', 'A03']);
  for (const row of approval.approved_rows) {
    const key = row.canonical_g5_id
      ? `${row.canonical_g5_id}@${row.canonical_g5_version}`
      : `natural:${row.natural_place_ref.natural_profile_ref.id}@${row.natural_place_ref.natural_profile_ref.version}|${row.natural_place_ref.scene_template_ref.id}@${row.natural_place_ref.scene_template_ref.version}`;
    assert.equal(labels.get(key).display_label, row.display_label);
  }
  const loaded = loadApprovedPlaceLabels();
  assert.ok(loaded instanceof Map);
  assert.equal(loaded.size, 647);
  for (const [key, value] of labels) assert.deepEqual(loaded.get(key), value);
});

test('approved natural labels inherit to exact v2 successors across all 320 rows', () => {
  const labels = loadApprovedPlaceLabels();
  const natural = approval.approved_rows.filter((row) => row.natural_place_ref);
  assert.equal(natural.length, 320);
  assert.equal(labels.size, 647);
  for (const row of natural) {
    const { natural_profile_ref: profile, scene_template_ref: template } = row.natural_place_ref;
    const key = `natural:${profile.id}@2|${template.id}@${template.version}`;
    assert.equal(labels.get(key)?.display_label, row.display_label, key);
  }

  const identitySha = approvedLabelModule.naturalSuccessorIdentitySha256(successorCandidateBytes);
  assert.equal(identitySha, '68c61cb44dffa6a70bbb9e08b6b9ecab9a3dd7cd7be0f7e2ea1106576646f700');
});

test('natural successor aliases fail closed for a changed G4, source pin, or missing approval', () => {
  const successor = JSON.parse(successorCandidateBytes);
  successor.natural_profiles[0].g4_ref.id = 'foreign_g4';
  const changedG4 = naturalSuccessorAliases(naturalSuccessorInputs({
    successorCandidateBytes: Buffer.from(JSON.stringify(successor))
  }));
  assert.equal(changedG4.size, 327);
  assert.ok(changedG4.diagnostics.some(({ code }) => code === 'natural_successor_lineage_unverified'));

  const changedPinCandidate = JSON.parse(successorCandidateBytes);
  changedPinCandidate.source_pins.natural.sha256 = '0'.repeat(64);
  const changedPin = naturalSuccessorAliases(naturalSuccessorInputs({
    successorCandidateBytes: Buffer.from(JSON.stringify(changedPinCandidate))
  }));
  assert.equal(changedPin.size, 327);
  assert.ok(changedPin.diagnostics.some(({ code }) => code === 'natural_successor_lineage_unverified'));

  const noApproval = naturalSuccessorAliases(naturalSuccessorInputs({ successorApproval: null }));
  assert.equal(noApproval.size, 327);
  assert.ok(noApproval.diagnostics.some(({ code }) => code === 'natural_successor_lineage_unverified'));
});

test('reader fails closed on changed hash, candidate, row, or approval reference', () => {
  assert.equal(approvedPlaceLabelsFromAttestation(candidateBytes,
    { ...approval, candidate_sha256: '0'.repeat(64) }), null);
  assert.equal(approvedPlaceLabelsFromAttestation(candidateBytes,
    { ...approval, decision_ref: 'D106' }), null);
  assert.equal(approvedPlaceLabelsFromAttestation(candidateBytes,
    { ...approval, approved_rows: approval.approved_rows.slice(1) }), null);
  assert.equal(approvedPlaceLabelsFromAttestation(candidateBytes,
    { ...approval, natural_label_decision_refs: ['D118'] }), null);
  const changedRows = structuredClone(approval);
  changedRows.approved_rows[0].display_label = 'Окрестности.';
  assert.equal(approvedPlaceLabelsFromAttestation(candidateBytes, changedRows), null);
  assert.equal(approvedPlaceLabelsFromAttestation(Buffer.from('{'), approval), null);
});

test('reader accepts an attested natural G4/template label key in fixture data', () => {
  const naturalPlaceRef = { natural_profile_ref: { id: 'natural_profile_fixture', version: 2 },
    scene_template_ref: { id: 'scene_template_fixture', version: 3 } };
  const fixture = structuredClone(candidate);
  fixture.labels.push({ natural_place_ref: naturalPlaceRef, display_label: 'У лесного ручья',
    approval_basis: 'approved_natural_label_source', status: 'candidate_approval_pending' });
  const fixtureBytes = Buffer.from(JSON.stringify(fixture));
  const fixtureApproval = { ...approval,
    candidate_sha256: createHash('sha256').update(fixtureBytes).digest('hex'),
    approved_rows: [...approval.approved_rows, { natural_place_ref: naturalPlaceRef,
      display_label: 'У лесного ручья' }] };

  const labels = approvedPlaceLabelsFromAttestation(fixtureBytes, fixtureApproval);
  assert.equal(labels.size, 328);
  assert.equal(labels.get('natural:natural_profile_fixture@2|scene_template_fixture@3').display_label,
    'У лесного ручья');
  assert.equal(loadApprovedPlaceLabels().size, 647);
});
