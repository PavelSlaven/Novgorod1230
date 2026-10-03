import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createOrdinaryGeneratedFirstEntryProposal } from
  '../src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';

const WORLD = 'world-rev';
const candidateBytes = JSON.stringify({ candidate_id: 'unit_natural_authoring', version: 1,
  target: { world_revision_id: WORLD }, gameplay_access_policy: { policy_id: 'policy', operations: [] },
  natural_finite_source_profiles: [],
  family_profiles: [{ exact_match: { world_revision_id: WORLD, g5_generation_template_id: 'tpl',
    g5_generation_template_version: 1, g4_refs: [{ id: 'g4', version: 1 }], scene_template_refs: ['scene@1'] },
  natural_finite_source_profile_refs: [] }] });
const approval = { decision: 'APPROVE_M2C_ITEMS_AUTHORING_V1',
  approval_scope: 'items_and_finite_stocks_authoring_data_only',
  candidate_sha256: createHash('sha256').update(candidateBytes).digest('hex'),
  candidate_ref: 'unit_natural_authoring@1' };

test('generated first-entry adapter forwards the party id and scope to the presence resolver', async () => {
  const partyId = 'party-forward';
  const proposal = { target_site_id: 'site', inserts: [
    { target_table: 'party_g5_sites', id: 'site', record: { id: 'site', party_id: partyId, origin: 'generated',
      status: 'active', parent_g4_id: 'g4', generated_template_ref: { entity_id: 'tpl', authoring_version: 1 } } },
    { target_table: 'party_scene_baselines', id: 'base', record: { id: 'base', party_id: partyId,
      host_kind: 'g5_site', host_id: 'site', status: 'active' } },
    { target_table: 'party_g6_instances', id: 'g6', record: { id: 'g6', party_id: partyId, host_kind: 'g5_site',
      host_id: 'site', status: 'active', scene_baseline_id: 'base', scene_slot_key: 'main',
      source_scene_template_ref: { entity_id: 'scene', authoring_version: 1 } } },
    { target_table: 'scene_position_nodes', id: 'pos', record: { id: 'pos', party_id: partyId, g6_instance_id: 'g6',
      status: 'active', template_slot_key: 'focus' } },
  ] };
  const seen = [];
  const sentinel = Object.assign(new Error('stop after resolver'), { code: 'RESOLVER_REACHED' });
  const prepare = createOrdinaryGeneratedFirstEntryProposal({ profile: {},
    naturalSourceAuthoring: { candidateBytes, approval }, readNaturalSourceProperty: async () => null,
    resolvePresenceRulesFirstArrival: async (input) => { seen.push(input); throw sentinel; } });
  const transaction = { async query() { return { rows: [{ world_revision_id: WORLD }] }; } };
  await assert.rejects(prepare({ transaction, request: { party_id: partyId,
    g4: { id: 'g4', version: 1, world_revision_id: WORLD } }, proposal, change_set_id: 'change' }), sentinel);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].partyId, partyId);
  assert.deepEqual(seen[0].scope, { entity_kind: 'g6', entity_id: 'g6' });
  assert.equal(seen[0].site.id, 'site');
  assert.equal(seen[0].change_set_id, 'change');
});
