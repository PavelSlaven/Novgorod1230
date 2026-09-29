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
