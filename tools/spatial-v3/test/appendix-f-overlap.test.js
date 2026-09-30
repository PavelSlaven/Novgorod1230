import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { preparationSnapshotMemberOverlapErrors } from '../appendix-f-overlap.mjs';

const documents = 'data/knowledge-source/corpus/DOCUMENTS/';
const temporal = await readFile(`${documents}temporal_world_and_interruptible_activities.md`, 'utf8');
const standard = await readFile(`${documents}spatial_architecture_standard_g0_g6.md`, 'utf8');

test('the repository keeps the temporal A.7 block a subset of the Appendix F block', () => {
  assert.deepEqual(preparationSnapshotMemberOverlapErrors(temporal, standard), []);
});

test('a field dropped from Appendix F is reported', () => {
  const split = standard.indexOf('# Приложение F.');
  const broken = standard.slice(0, split) + standard.slice(split).replace(/^ {2}prepared_scene_materialization: .*\n/m, '');
  assert.notEqual(broken, standard);
  const errors = preparationSnapshotMemberOverlapErrors(temporal, broken);
  assert.ok(errors.some((error) => error.includes('prepared_scene_materialization')), errors.join('\n'));
});

test('a changed temporal block that Appendix F does not mirror is reported', () => {
  const changed = temporal.replace('  share_mode: required enum[execution_exclusive, reusable]', '  share_mode: required enum[execution_exclusive, reusable, other]');
  assert.notEqual(changed, temporal);
  assert.ok(preparationSnapshotMemberOverlapErrors(changed, standard).some((error) => error.includes('share_mode')));
  const extraInvariant = temporal.replace('  - Duplicate member_kind plus dependency-pin digest is forbidden within one snapshot.', '  - Duplicate member_kind plus dependency-pin digest is forbidden within one snapshot.\n  - A new temporal invariant.');
  assert.ok(preparationSnapshotMemberOverlapErrors(extraInvariant, standard).some((error) => error.includes('new temporal invariant')));
});

// rt-lines (D56): the second overlap - F.1.1 copies the Temporal A.6 result block and adds turn_back / returned_to_departure.
const interval = { name: 'party_traversal_interval_result', stems: ['  - Existing six traversal outcomes'] };

test('the repository keeps the temporal A.6 interval result block a subset of the Appendix F block', () => {
  assert.deepEqual(preparationSnapshotMemberOverlapErrors(temporal, standard, interval.name, interval.stems), []);
});

test('a field of the temporal interval result dropped from Appendix F, or a lost enum value, is reported', () => {
  const split = standard.indexOf('# Приложение F.');
  const tail = standard.slice(split);
  const noField = standard.slice(0, split) + tail.replace(/^ {2}actual_elapsed: .*\n/m, '');
  assert.ok(preparationSnapshotMemberOverlapErrors(temporal, noField, interval.name, interval.stems).some((error) => error.includes('actual_elapsed')));
  const noEnum = standard.slice(0, split) + tail.replace('stranded, blocked_before_progress]\n  result_code', 'blocked_before_progress]\n  result_code');
  assert.notEqual(noEnum, standard);
  assert.ok(preparationSnapshotMemberOverlapErrors(temporal, noEnum, interval.name, interval.stems).some((error) => error.includes('lost enum value stranded')));
});

test('a changed temporal interval result that Appendix F does not mirror is reported', () => {
  const changed = temporal.replace('  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]\n  synchronized_time_slice_result_id: optional stable_id\n  execution_context_snapshot',
    '  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock, other]\n  synchronized_time_slice_result_id: optional stable_id\n  execution_context_snapshot');
  assert.notEqual(changed, temporal);
  assert.ok(preparationSnapshotMemberOverlapErrors(changed, standard, interval.name, interval.stems).some((error) => error.includes('clock_commit_mode')));
  const extra = temporal.replace('  - direct_party_clock owns one clock update; shared_root_transport_clock owns none.', '  - direct_party_clock owns one clock update; shared_root_transport_clock owns none.\n  - A new temporal invariant.');
  assert.ok(preparationSnapshotMemberOverlapErrors(extra, standard, interval.name, interval.stems).some((error) => error.includes('new temporal invariant')));
  // without the declared stem the extended "six outcomes" invariant of F is not the same line as A.6's
  assert.ok(preparationSnapshotMemberOverlapErrors(temporal, standard, interval.name).some((error) => error.includes('Existing six traversal outcomes')));
});

test('Appendix F keeps the three revised blocks and leaves the frozen Appendix B and Temporal A.6 alone', () => {
  const blocks = (text) => Object.fromEntries([...text.matchAll(/```yaml\r?\ncontract_name: (\w+)\r?\n[\s\S]*?```/g)].map((match) => [match[1], match[0]]));
  const tail = blocks(standard.slice(standard.indexOf('# Приложение F.')));
  for (const name of ['dynamic_recheck_policy', 'traveller_travel_state', 'party_traversal_interval_result']) assert.ok(tail[name], `${name} in F`);
  assert.match(tail.traveller_travel_state, /mirrored: required boolean/u);
  assert.match(tail.dynamic_recheck_policy, /fixed_time_interval/u);
  const appendixB = standard.slice(standard.indexOf('# Приложение B.'), standard.indexOf('# Приложение C.'));
  for (const forbidden of ['mirrored', 'turn_back', 'returned_to_departure', 'fixed_time_interval', 'interval_minutes']) assert.ok(!appendixB.includes(forbidden), `Appendix B stays frozen: no ${forbidden}`);
});
