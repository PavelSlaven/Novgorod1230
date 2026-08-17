import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActorBaseAppearance } from '@rus/actors';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import { materializeInitialActorEquipment } from '@rus/new-game';
import {
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import { projectActorPortraitSpecV1 } from '@rus/visibility-knowledge-memory';
import { lowerDvinaTracePhase1ADomainPin } from
  '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 19
});
const revision20 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 20
});
const revision21 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 21
});
const revision22 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 22
});

test('revision 22 provisions exact authored whole fuel units and ignition authority', () => {
  const authored = materializeAuthored('party:revision22-fire', revision22, 22);
  assert.equal(authored.request_identity.scenario_definition_revision, 22);
  assert.equal(authored.local_fire_authority.context_ref,
    'lower_dvina_trace:f1:local_exact_fire');
  const fuels = authored.immediate.items.filter((item) =>
    item.state.local_fire_fuel?.fuel_class === 'ordinary_solid_fuel_unit');
  assert.equal(fuels.length, 2);
  assert.deepEqual(authored.local_fire_authority.approved_fuel_item_ids,
    fuels.map(({ instance_id: id }) => id));
  assert.equal(fuels.every((item) => item.quantity === 1
    && item.state.local_fire_fuel.whole_unit === true), true);
  const ignition = authored.immediate.items.find(({ instance_id: id }) =>
    id === authored.local_fire_authority.ignition_basis_item_id);
  assert.equal(ignition.state.local_fire_ignition_basis.ignition_kind,
    'authored_manual');
});

test('revision 20 adds only the authored ordinary pouch and keeps revision 19 immutable', () => {
  assert.equal(bundle.definition_revision,19);
  assert.equal(Object.hasOwn(bundle,'initial_ordinary_container'),false);
  assert.equal(revision20.definition_revision,20);
  assert.equal(revision20.phase_1a_manifest.package_id,
    'lower_dvina_trace_phase_1a_v16');
  assert.equal(revision20.initial_ordinary_container.container_id,
    'trace_ld_v1_container_player_small_pouch');
  assert.equal(revision20.initial_ordinary_container.template_ref.template_id,
    'container_tpl_nov_small_soft_bag_v1');
  assert.equal(revision20.ordinary_container_contents_profile
    .container_bindings.length,1);
  assert.equal(revision20.item_container_set.container_templates.some(
    ({container_template_id:id}) =>
      id === 'trace_ld_v1_container_road_bag'),true);
});

test('revision 21 activates open A1 authority over ordinary item mechanics', () => {
  const exact = materializeAuthored(
    'party:revision20-materialization', revision20, 20
  );
  assert.equal(exact.request_identity.scenario_definition_revision, 20);
  assert.ok(exact.initial_actor_equipment_handoff);
  assert.equal(exact.policy_profile_pins.some(
    ({ key }) => key === 'initial_ordinary_container'), true);
  assert.equal(exact.policy_profile_pins.some(
    ({ key }) => key === 'ordinary_container_contents_profile'), true);
  assert.equal(roadBagProfile(exact).capacity, 4);

  const missingProfilePin = structuredClone(revision20);
  delete missingProfilePin.artifact_pins.ordinary_container_contents_profile;
  assert.throws(() => materializeAuthored(
    'party:revision20-missing-profile', missingProfilePin, 20
  ), { code: 'TRACE_SCENARIO_ARTIFACT_INVALID' });

  const authored = materializeAuthored(
    'party:revision21-action-production', revision21, 21);
  assert.equal(roadBagProfile(authored).capacity, 4);
  assert.equal(Object.hasOwn(authored, 'action_production_authority'), false);
  const knife = authored.immediate.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_mikula_knife');
  assert.equal(Object.hasOwn(knife.state,
    'action_production_mechanics_snapshot'), false);
  assert.ok(knife.state.inventory_profile_snapshot);
  const completed = materializeInitialActorEquipment(authored);
  const garment = completed.immediate.items.find(({ template_id: id,
    holder_character_id: holder }) =>
    id === 'trace_ld_v1_item_working_outer_garment'
      && holder === completed.immediate.player.instance_id);
  assert.equal(Object.hasOwn(garment.state,
    'action_production_mechanics_snapshot'), false);
  assert.ok(garment.state.inventory_profile_snapshot);
});

function roadBagProfile(result) {
  return result.immediate.containers.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag')
    .state.inventory_profile_snapshot;
}

test('revision 19 creates six complete NPC identities and real equipped garments deterministically', () => {
  const first = materialize('party:appearance-contract');
  const replay = materialize('party:appearance-contract');
  assert.deepEqual(replay, first);
  assert.equal(first.immediate.npcs.length, 6);
  assert.deepEqual(first.immediate.npcs.map(({ participant_slot_ref: slot }) => slot).sort(), [
    'background_fisher_1', 'background_fisher_2', 'eremey_fisher',
    'onisim_boatman', 'ratsha_storehouse_helper', 'zhdanko_storehouse_controller'
  ]);
  assert.equal(validateActorBaseAppearance(
    first.immediate.player.dossier.identity, { requireComplete: true }).ok, true);
  for (const npc of first.immediate.npcs) {
    assert.equal(validateActorBaseAppearance(npc.identity_state,
      { requireComplete: true }).ok, true, npc.participant_slot_ref);
    assert.equal(Object.hasOwn(npc.identity_state, 'clothing'), false);
  }
  const garments = first.immediate.items.filter((item) =>
    item.equipment_slot_category_id != null);
  assert.equal(garments.length, 14);
  assert.equal(garments.every((item) => item.physical_position === 'equipped'
    && item.state?.visual_profile_snapshot != null), true);
  const roadBag = first.immediate.containers.find(({ template_id: templateId }) =>
    templateId === 'trace_ld_v1_container_road_bag');
  assert.equal(roadBag.physical_position, 'worn_quick');
  assert.equal(roadBag.claim_state,
    bundle.item_container_set.container_templates.find(
      ({ container_template_id: templateId }) =>
        templateId === roadBag.template_id
    ).accessibility_contract.initial_access);
  assert.equal(JSON.stringify(first).includes('portrait_spec_v1'), false);
});

test('Ratsha caftan keeps its exact clue origin and portrait follows visible equipment', () => {
  const result = materialize('party:ratsha-caftan');
  const ratsha = result.immediate.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'ratsha_storehouse_helper');
  const caftan = result.immediate.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_ratsha_caftan');
  const ratshaBase = actorGarments(result, ratsha.instance_id, 'npc')
    .find(({ equipment_slot_category_id: slot }) => slot === 'base_garment');
  assert.ok(caftan);
  assert.equal(caftan.owner_npc_id, ratsha.instance_id);
  assert.equal(caftan.holder_npc_id, ratsha.instance_id);
  assert.equal(caftan.controller_npc_id, ratsha.instance_id);
  assert.equal(caftan.equipment_slot_category_id, 'outer_garment');
  const fragment = bundle.item_container_set.item_templates.find(({ item_template_id: id }) =>
    id === 'trace_ld_v1_item_blue_wool_fragment');
  assert.equal(fragment.origin_item_ref, 'trace_ld_v1_item_ratsha_caftan');

  const before = projectActorPortraitSpecV1({
    identity: ratsha.identity_state,
    visible_equipment: [ratshaBase, caftan]
  });
  const afterRatsha = projectActorPortraitSpecV1({
    identity: ratsha.identity_state,
    visible_equipment: [ratshaBase]
  });
  assert.equal(before.clothing.main_color, 'dark_blue');
  assert.equal(afterRatsha.clothing.outer, 'none');
});

test('Stage 16 resolves item-owned visual profiles and rejects inline snapshots',
  () => {
    assert.equal(bundle.item_container_set.initial_equipment_candidates.every(
      (candidate) => candidate.visual_profile_ref
        && candidate.visual_profile_snapshot == null), true);
    const authored = structuredClone(materializeAuthored(
      'party:inline-visual-owner-rejected'));
    authored.initial_actor_equipment_handoff.initial_equipment_candidates[0]
      .visual_profile_snapshot = {
        schema: 'item_visual_profile_snapshot_v1', version: 1,
        equipment_slot: 'base_garment'
      };
    assert.throws(() => materializeInitialActorEquipment(authored), {
      code: 'INITIAL_ACTOR_EQUIPMENT_CANDIDATE_INVALID'
    });
  });

function actorGarments(result, actorId, kind) {
  const holderField = kind === 'npc' ? 'holder_npc_id' : 'holder_character_id';
  return result.immediate.items.filter((item) => item[holderField] === actorId
    && item.equipment_slot_category_id != null);
}

function materialize(partyId) {
  const authored = materializeAuthored(partyId);
  assert.ok(authored.initial_actor_equipment_handoff);
  assert.equal(authored.immediate.items.some((item) =>
    item.equipment_slot_category_id != null), false);
  return materializeInitialActorEquipment(authored);
}

function materializeAuthored(partyId, scenarioBundle = bundle,
  scenarioDefinitionRevision = 19) {
  const spatial = scenarioBundle.location_topology_set.spatial_source_ref;
  const authored = materializeLowerDvinaTracePartyInstance({
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: scenarioDefinitionRevision,
    scenario_manifest_digest: scenarioBundle.manifest_digest,
    world_revision_id: spatial.world_revision_id,
    world_catalog_digest: spatial.world_revision_catalog_digest,
    domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(scenarioBundle),
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
    idempotency_key: `phase1a:${partyId}`,
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: scenarioBundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
  });
  return authored;
}
