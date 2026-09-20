import assert from 'node:assert/strict';
import test from 'node:test';
import { attachApprovedProceduralNpc } from
  '../src/stages/stage-15-npc-placement/index.js';
import { materializeInitialActorEquipment } from
  '../src/stages/stage-16-item-placement/materialize-initial-actor-equipment.js';
import { approvedNpcBodyRows } from
  '../src/stages/stage-24-party-db-write-plan/code/actor-write-boundary.js';

const visual = { schema: 'item_visual_profile_snapshot_v1', version: 1,
  equipment_slot: 'base_garment', garment_kind: 'shirt', neckline: 'round',
  sleeve_form: 'long', outer_form: 'straight', visible_fabric: 'linen',
  trim: 'none', main_visible_color: 'undyed',
  secondary_visible_color: 'undyed', headwear_kind: 'none' };
const candidate = { equipment_candidate_id: 'shirt:worker', status: 'approved',
  item_template_ref: 'shirt', inventory_profile_ref: 'shirt:inventory',
  visual_profile_ref: 'shirt:visual', target_actor_slot_ref: 'worker:1',
  owner_ref: 'worker:1', holder_ref: 'worker:1', controller_ref: 'worker:1',
  physical_position: 'equipped', equipment_slot_category_id: 'base_garment',
  instance_key: 'worker-shirt', condition_state: 'serviceable',
  legal_status: 'owned', claim_state: 'established' };
const catalog = { activation: { status: 'active' },
  catalog_digest: 'c'.repeat(64), item_templates: [{ item_template_id: 'shirt',
    semantic_category: 'clothing', display_name: 'рубаха', status: 'approved' }],
  item_inventory_profiles: [{ inventory_profile_id: 'shirt:inventory',
    item_template_ref: 'shirt', mass_grams: 300, external_hand_cost: 0,
    status: 'approved' }], item_visual_profiles: [{
    visual_profile_id: 'shirt:visual', item_template_ref: 'shirt',
    visual_profile_snapshot: visual, status: 'approved' }] };
const party = { version: 3, schema: 'test_party_materialization',
  status: 'materialized', party_id: 'party', run_id: 'run',
  request_identity: { world_revision_id: 'world',
    idempotency_key: 'request' }, immediate: {
    player: { instance_id: 'player' }, npcs: [], items: [],
    spatial: { position: { g4_id: 'g4' } } },
  hidden_truth: {}, sealed_selections: [], policy_profile_pins: [],
  validation_report: { pass: true }, trace: { choices: [], result_digest: 'old' } };
const procedural = { schema: 'rus.approved_procedural_npc_result.v1',
  npc: { instance_id: 'npc', participant_slot_ref: 'worker:1' },
  choices: [], environment: { schema: 'rus.approved_initial_environment.v1' },
  initial_equipment_candidates: [candidate] };

test('Stage 15 handoff and Stage 16 create exact active NPC equipment', () => {
  const staged = attachApprovedProceduralNpc({ party_materialization: party,
    procedural_npc: procedural, equipment_catalog: catalog });
  const completed = materializeInitialActorEquipment(staged);
  assert.equal(completed.immediate.npcs[0].instance_id, 'npc');
  const shirt = completed.immediate.items[0];
  assert.equal(shirt.holder_npc_id, 'npc');
  assert.equal(shirt.physical_position, 'equipped');
  assert.deepEqual(shirt.state.visual_profile_snapshot, visual);
  assert.equal(completed.initial_actor_equipment_handoff, undefined);
});

test('Stage 15 rejects non-active equipment rows', () => {
  assert.throws(() => attachApprovedProceduralNpc({
    party_materialization: party, procedural_npc: procedural,
    equipment_catalog: { ...catalog, activation: { status: 'approved' } } }),
  { code: 'PROCEDURAL_NPC_EQUIPMENT_DATA_GAP' });
});

test('Stage 24 maps procedural NPC body into canonical actor body rows', () => {
  const rows = approvedNpcBodyRows([{ instance_id: 'npc', body: {
    profile_id: 'ordinary-adult', schema: 'rus.body_state.profile.v1',
    version: 1, record_digest: 'd'.repeat(64),
    values: { health: 100, energy: 80, satiety: 70 } } }],
  'party', 'change');
  assert.deepEqual(rows[0], { party_id: 'party', actor_kind: 'npc',
    actor_id: 'npc', body_profile_ref: { id: 'ordinary-adult',
      schema: 'rus.body_state.profile.v1', revision: 1,
      digest: 'd'.repeat(64) }, health: 100, energy: 80, satiety: 70,
    state_version: 1, updated_change_set_id: 'change' });
});
