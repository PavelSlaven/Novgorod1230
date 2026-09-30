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

// rt-lines a6 (REVIEW rt-lines-5): the outcomes of a turn_back interval are read from the F.1.1 text, by the direction after commit.
const turnBackRule = (text) => {
  const block = text.slice(text.indexOf('# Приложение F.')).match(/```yaml\r?\ncontract_name: party_traversal_interval_result\r?\n[\s\S]*?```/)[0];
  const rule = block.split(/\r?\n/).find((line) => line.startsWith('  - turn_back is true only'));
  const plain = rule.match(/permits the outcomes ([a-z_, ]+?)(?:, plus exactly one terminal outcome|;)/);
  const terminal = rule.match(/mirrored true after commit permits (\w+), mirrored false after commit.*? permits (\w+)/);
  return { plain: plain[1].split(/,| and /).map((value) => value.trim()).filter(Boolean), terminalIfMirrored: terminal?.[1], terminalIfForward: terminal?.[2], rule };
};
/** Outcomes the norm permits for a turn_back interval whose travel state has `mirrored` after the commit. */
const turnBackOutcomes = (text, mirroredAfter) => {
  const { plain, terminalIfMirrored, terminalIfForward } = turnBackRule(text);
  return new Set([...plain, mirroredAfter ? terminalIfMirrored : terminalIfForward].filter(Boolean));
};
const terminalInvariants = (text) => {
  const block = text.slice(text.indexOf('# Приложение F.')).match(/```yaml\r?\ncontract_name: party_traversal_interval_result\r?\n[\s\S]*?```/)[0];
  return block.match(/segment_completed requires actual_progress_after_ppm one million and travel-state mirrored false after commit; returned_to_departure requires actual_progress_after_ppm one million and mirrored true after commit/) !== null;
};

test('a repeated turn back that finishes the segment in its first interval has a legal outcome (segment_completed)', () => {
  // mirrored side paused at p = 750 000; the second "back" flips to mirrored=false, progress_before = 250 000, the interval reaches 1 000 000
  assert.ok(terminalInvariants(standard), 'segment_completed needs mirrored false, returned_to_departure mirrored true');
  const afterSecondTurnBack = turnBackOutcomes(standard, false);
  assert.ok(afterSecondTurnBack.has('segment_completed'));
  assert.ok(!afterSecondTurnBack.has('returned_to_departure'));
  const afterFirstTurnBack = turnBackOutcomes(standard, true);
  assert.ok(afterFirstTurnBack.has('returned_to_departure'));
  assert.ok(!afterFirstTurnBack.has('segment_completed'));
});

test('interruption and stranding are legal in a turn_back interval on both sides, a refusal never is', () => {
  for (const mirrored of [true, false]) {
    const outcomes = turnBackOutcomes(standard, mirrored);
    for (const outcome of ['progressed', 'paused_in_transit', 'interrupted_at_anchor', 'stranded']) assert.ok(outcomes.has(outcome), `${outcome} (mirrored after commit ${mirrored})`);
    assert.ok(!outcomes.has('blocked_before_progress'));
  }
});

test('the turn_back outcome check fails on the earlier text that forbade the second turn back to finish', () => {
  const old = standard.replace(/ permits the outcomes progressed, paused_in_transit, interrupted_at_anchor and stranded, plus exactly one terminal outcome[^;]*;/u,
    ' permits the outcomes progressed, paused_in_transit and returned_to_departure;');
  assert.notEqual(old, standard);
  assert.throws(() => turnBackOutcomes(old, false).has('segment_completed') || assert.fail('no legal outcome'), /no legal outcome/u);
});
