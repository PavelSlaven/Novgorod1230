import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestEnvelope } from '../src/artifact-contracts.js';
import {
  generateProceduralFinalCandidatePack,
  validateNoDuplicateAuthority,
  validateProceduralFinalCandidatePack
} from '../../../scripts/generate-procedural-final-candidate-pack.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');
const output = new URL(
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/candidate.json',
  import.meta.url);
const paths = {
  stale: 'data/world-catalogs/novgorod/procedural-scene-v2/import-pack-v1/candidate.json',
  regional: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/candidate.json',
  onomastics: 'data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json',
  equipment: 'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/candidate.json'
};

test('final candidate pack is deterministic, exact and non-activating',
  async () => {
    const first = await generateProceduralFinalCandidatePack(root);
    const second = await generateProceduralFinalCandidatePack(root);
    assert.deepEqual(first, second);
    assert.equal(await readFile(output, 'utf8'),
      `${JSON.stringify(first, null, 2)}\n`);
    assert.equal(validateProceduralFinalCandidatePack(first), true);
    const rows = first.candidate_rows_by_table
      .procedural_scene_compiled_records;
    assert.equal(rows.length, 21);
    assert.equal(first.record_operations_by_table[0].insert_count, 21);
    assert.equal(first.append_only_import_plan.import_authorized, false);
    assert.equal(first.activation_policy.activation_authorized, false);
    assert.equal(first.activation_policy
      .eligible_party_scope_after_separate_approval,
    'new_development_parties_only');
    assert.equal(first.activation_policy.existing_party_migration_authorized,
      false);
    assert.equal(first.activation_policy.old_save_rematerialization_authorized,
      false);
    assert.doesNotMatch(JSON.stringify(rows),
      /"(?:status|source_status|source_row_status)":"(?:pending|rejected|draft)/u);
  });

test('stale v1 cannot be promoted through final candidate generator',
  async () => {
    const stale = await json(paths.stale);
    stale.activation_authorized = true;
    await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
      [paths.stale]: stale
    }), { code: 'FINAL_PACK_STALE_V1_ACTIVATABLE' });
  });

test('source closure rejects missing approved regional member', async () => {
  const regional = await json(paths.regional);
  regional.promotions.landscape.pop();
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.regional]: regional
  }), { code: 'FINAL_PACK_REGIONAL_APPROVAL_INVALID' });
});

test('pending or rejected compiled owner rows are forbidden', async () => {
  const onomastics = await json(paths.onomastics);
  onomastics.names[0].status = 'pending';
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.onomastics]: onomastics
  }), (error) => ['FINAL_PACK_SOURCE_DIGEST_CLOSURE_INVALID',
    'FINAL_PACK_UNAPPROVED_ROW'].includes(error.code));
});

test('duplicate cache row identities are forbidden', async () => {
  const equipment = await json(paths.equipment);
  equipment.occupation_equipment_profiles[1] = structuredClone(
    equipment.occupation_equipment_profiles[0]);
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.equipment]: equipment
  }), { code: 'FINAL_PACK_ROW_INVALID' });
});

test('duplicate authority ownership is forbidden', () => {
  assert.throws(() => validateNoDuplicateAuthority([
    { authority: 'onomastics' }, { authority: 'onomastics' }
  ]), { code: 'FINAL_PACK_DUPLICATE_AUTHORITY' });
});

test('activation cannot be enabled by changing candidate flag', async () => {
  const pack = structuredClone(await generateProceduralFinalCandidatePack(root));
  pack.activation_policy.activation_authorized = true;
  const { candidate_digest: ignored, ...payload } = pack;
  pack.candidate_digest = digestEnvelope(payload);
  assert.throws(() => validateProceduralFinalCandidatePack(pack),
    { code: 'FINAL_PACK_AUTHORITY_INVALID' });
});

async function json(path) {
  return JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url),
    'utf8'));
}
