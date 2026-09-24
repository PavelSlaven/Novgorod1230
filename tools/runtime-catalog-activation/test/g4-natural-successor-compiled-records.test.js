import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildG4NaturalCompiledRecords, reportNaturalSuccessorRows } from '../src/g4-natural-compiled-records.js';
import { buildG4NaturalPresentationCompiledRecords } from '../src/g4-natural-presentation-compiled-records.js';
import { buildG4NaturalPlacementCompiledRecords } from '../src/g4-natural-placement-compiled-records.js';

const root = resolve(import.meta.dirname, '../../..');
const base = 'data/world-catalogs/novgorod/';
const naturalBytes = readFileSync(resolve(root, `${base}m2c-natural/nature-successor-candidate-v2.json`), 'utf8');
const presentationBytes = readFileSync(resolve(root, `${base}m2c-natural-presentation/nature-successor-candidate-v2.json`), 'utf8');
const approval = JSON.parse(readFileSync(resolve(root, `${base}m2c-natural/nature-successor-data-approval.json`)));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const approvedNaturalBytes = execFileSync('git', ['show', 'ae212e78:data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000 });
const approvedPresentationBytes = execFileSync('git', ['show', 'ae212e78:data/world-catalogs/novgorod/m2c-natural-presentation/nature-successor-candidate-v2.json'],
  { cwd: root, encoding: 'utf8' });

test('successor import remains blocked when exact approved bytes differ', () => {
  assert.notEqual(sha(naturalBytes), approval.candidates.natural.sha256);
  assert.notEqual(sha(presentationBytes), approval.candidates.presentation.sha256);
  assert.equal(sha(approvedNaturalBytes), approval.candidates.natural.sha256);
  assert.equal(sha(approvedPresentationBytes), approval.candidates.presentation.sha256);
  assert.throws(() => buildG4NaturalCompiledRecords({ candidateBytes: naturalBytes, approvedCandidateBytes: naturalBytes, approval }),
    /Exact independently approved natural successor bytes/);
  assert.throws(() => buildG4NaturalPresentationCompiledRecords({ candidateBytes: presentationBytes,
    approvedCandidateBytes: presentationBytes, approval }),
    /Exact independently approved natural presentation bytes/);
});

test('derived import carries exact source and layer-season evidence; typed gaps stay candidate', () => {
  const candidate = JSON.parse(naturalBytes);
  assert.deepEqual(reportNaturalSuccessorRows(candidate), {
    derived_layer_season: 1484,
    current_water_source_state_owner_required: 120,
    not_applicable: 60,
    m2c_nature_type_reference_required: 128,
    fauna_live_entity_owner_required: 0
  });
  execFileSync(process.execPath, [resolve(root, 'scripts/generate-m2c-nature-successors.mjs'), '--check'], { cwd: root });
  const natural = buildG4NaturalCompiledRecords({ candidateBytes: naturalBytes,
    approvedCandidateBytes: approvedNaturalBytes, approval });
  const presentation = buildG4NaturalPresentationCompiledRecords({ candidateBytes: presentationBytes,
    approvedCandidateBytes: approvedPresentationBytes, naturalCandidateBytes: naturalBytes,
    approvedNaturalCandidateBytes: approvedNaturalBytes, approval, naturalRecords: natural });
  assert.equal(natural.length, 32);
  assert.equal(presentation.length, 32);
  const placement = buildG4NaturalPlacementCompiledRecords({
    candidateBytes: readFileSync(resolve(root, `${base}m2c-natural-placement/candidate.json`), 'utf8'),
    approval: JSON.parse(readFileSync(resolve(root, `${base}m2c-sol-data-approval.json`))),
    naturalRecords: natural, presentationRecords: presentation
  })[0];
  assert.equal(placement.version, 2);
  for (const row of placement.payload.placements) {
    const source = natural.find((record) => record.payload.profile_id === row.natural_profile_ref.id);
    const descriptor = presentation.find((record) => record.payload.id === row.presentation_profile_ref.id);
    assert.deepEqual(row.natural_profile_ref, { id: source.payload.profile_id,
      version: 2, payload_digest: source.payload_digest });
    assert.deepEqual(row.presentation_profile_ref, { id: descriptor.payload.id, version: 2 });
    assert.ok(row.unprojected_layers.includes('fauna'));
    for (const layer of descriptor.payload.layers) {
      const group = layer.channel === 'visual' ? ['visual_layers', 'unplaced_visual_layers']
        : [layer.channel === 'acoustic' ? 'acoustic_layers' : 'unprojected_layers'];
      assert.equal(group.flatMap((key) => row[key]).filter((name) => name === layer.layer).length, 1);
    }
  }
  for (const record of natural) {
    for (const [season, rows] of Object.entries(record.payload.natural_profile.season_matrix)) {
      assert.equal(rows.fauna, undefined);
      for (const [name, row] of Object.entries(rows)) {
        assert.equal(row.source_condition, 'derived_layer_season');
        assert.equal(row.evidence.season_window, season);
        assert.ok(row.evidence.layer_ref.endsWith(`/layer_applicability/${name}`));
        assert.equal(row.evidence.source_candidate_sha256, approval.candidates.natural.sha256);
        assert.equal(row.incompatibility.status, 'resolved');
        for (const member of row.members.filter((item) => !item.member_ref.startsWith('baseline:'))) {
          assert.equal(member.eligibility, 'derived_layer_season');
          assert.equal(member.season_eligibility.status, 'derived_layer_season');
          assert.deepEqual(member.season_eligibility.evidence, row.evidence);
        }
      }
    }
  }
  for (const row of presentation) {
    const corresponding = natural.find((record) => record.payload.profile_id === row.payload.natural_profile_ref.id);
    assert.equal(row.payload.natural_profile_ref.payload_digest, corresponding.payload_digest);
    assert.equal(row.payload.layers.find((layer) => layer.layer === 'fauna').channel, 'none');
  }
});
