import assert from 'node:assert/strict';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';

export const bundle = await loadScenarioBundle(16);
export const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';

export function phase8CampState(scenarioBundle = bundle) {
  const seed = fixture({ scenarioBundle, materializationBundle: scenarioBundle });
  const state = structuredClone(seed.state);
  const camp = state.prepared_scenes.find(
    ({ location_profile_ref }) =>
      location_profile_ref === 'trace_ld_v1_loc_fishing_camp');
  state.position = { g5_node_id: camp.node.instance_id,
    g5_anchor_id: camp.anchor.instance_id,
    location_ref: camp.location_profile_ref, zone_ref: 'fire_side' };
  const ids = actorIds(state);
  for (const npc of state.npcs) {
    if ([ids.eremey, ids.ratsha, ids.fisher, ids.onisim]
      .includes(npc.instance_id)) {
      npc.anchor_id = camp.anchor.instance_id;
      npc.location_profile_ref = camp.location_profile_ref;
      npc.zone_ref = 'fire_side';
      npc.machine_state = { ...npc.machine_state,
        location_ref: camp.location_profile_ref, spatial_zone_ref: 'fire_side' };
    }
  }
  state.route_knowledge = ['trace_ld_v1_route_camp_to_storehouse'];
  state.container_placements = state.containers.map((container) => ({
    party_id: state.party_id, container_id: container.container_id,
    anchor_id: container.anchor_id, holder_npc_id: container.holder_npc_id,
    physical_position: 'external_load'
  }));
  state.route_participant_commitments = [
    { npc_ref: ref(ids.eremey), role: 'guide' },
    { npc_ref: ref(ids.ratsha), role: 'witness' },
    { npc_ref: ref(ids.fisher), role: 'escort' }
  ];
  state.player_response_boundary = null;
  return state;
}

export function actorIds(state) {
  const bySlot = Object.fromEntries(state.npcs.map((npc) => [
    npc.participant_slot_ref, npc.instance_id
  ]));
  return { player: state.actor_id,
    zhdanko: bySlot.zhdanko_storehouse_controller,
    eremey: bySlot.eremey_fisher,
    ratsha: bySlot.ratsha_storehouse_helper,
    onisim: bySlot.onisim_boatman,
    fisher: bySlot.background_fisher_1 };
}

export function phase8Plan(request, ids, combatIntentKind = 'control') {
  const combat = request.player_safe_state.combat_sessions?.length > 0;
  const hold = combatIntentKind === 'hold';
  const operation = combat ? {
    op: 'request_combat', actor_ref: request.actor.actor_id,
    intent_kind: combatIntentKind,
    target_refs: hold ? [] : [ids.zhdanko], protected_refs: [],
    scope_ref: hold ? 'trace_ld_v1_loc_zhdanko_storehouse' : null,
    destination_ref: null,
    force_limit: combatIntentKind === 'engage'
      ? 'ordinary' : hold ? 'avoid_harm' : 'nonlethal_if_possible',
    risk_posture: 'ordinary'
  } : { op: 'emit_interaction', actor_ref: request.actor.actor_id,
    target_actor_refs: [ids.zhdanko], interaction_kind: 'request',
    content: 'предъявить обвинение и потребовать вернуть дорожную сумку',
    instrument_refs: [] };
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null,
    clarification: null, reason_code: combat ? 'combat_response' : 'accusation',
    reason: 'Передать действие утверждённому владельцу домена.' };
}

export function phase8StartPlan(request, ids) {
  const combat = request.available_domain_operations?.some(({ op,
    target_refs: targets }) => op === 'request_combat' && targets.includes(ids.zhdanko));
  if (combat) return phase8Plan({ ...request, player_safe_state: {
    ...request.player_safe_state, combat_sessions: [{}] } }, ids);
  return phase8Plan(request, ids);
}

export function combatPlan(request, ids, choices = {}) {
  const postDisarm = request.decision_reasons.perceived_changes.some(
    (summary) => summary.includes('оруж'));
  const postReach = request.decision_reasons.perceived_changes.some(
    (summary) => summary.includes('достиг выбранного'));
  let intentKind = 'hold', targetRefs = [], scopeRef = {
    entity_kind: 'location', entity_id: 'trace_ld_v1_loc_zhdanko_storehouse'
  }, forceLimit = 'avoid_harm';
  if (request.npc_ref.entity_id === ids.zhdanko) {
    intentKind = postDisarm ? 'surrender' : choices.zhdanko ?? 'engage';
    targetRefs = postDisarm ? [] : [{ entity_kind: 'player_character',
      entity_id: ids.player }];
    scopeRef = null;
    forceLimit = 'ordinary';
    if (intentKind === 'break_contact') targetRefs = [];
  } else if ([ids.eremey, ids.fisher, ...(ids.escorts ?? [])]
    .includes(request.npc_ref.entity_id)) {
    intentKind = choices.companions ?? 'control';
    if (intentKind === 'control') {
      targetRefs = [{ entity_kind: 'npc', entity_id: ids.zhdanko }];
      scopeRef = null;
      forceLimit = 'nonlethal_if_possible';
    }
  } else if (request.npc_ref.entity_id === ids.ratsha
      && choices.ratsha === 'reach' && !postReach) {
    intentKind = 'reach';
    targetRefs = [];
    scopeRef = null;
    forceLimit = 'avoid_harm';
  }
  const destinationRef = intentKind === 'reach'
    ? request.operation_contract.reachable_destination_refs[0]
    : intentKind === 'break_contact'
      ? request.operation_contract.break_contact_destination_refs[0] : null;
  const plan = { schema: 'npc_combat_intent_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    state_version: request.state_version, combat_id: request.combat_id,
    npc_ref: request.npc_ref, decision: {
      intent_summary: 'Resist the immediate attempt to restrain me.',
      grounded_goal: 'Keep control of the weapon and current position.',
      adaptation: 'literal' }, operation: {
      op: 'set_combat_intent', intent_kind: intentKind,
      target_refs: targetRefs, protected_refs: [], scope_ref: scopeRef,
      destination_ref: destinationRef, force_limit: forceLimit,
      risk_posture: 'ordinary' }, combat_statement: null,
    reason: postDisarm ? 'Сопротивление более невозможно.'
      : 'Участник выбирает ближайшее допустимое действие.' };
  assert.deepEqual(validateNpcCombatPlanApplicability(plan, request),
    { pass: true, errors: [] });
  return plan;
}

export async function openPhase8Combat(runtime, prefix) {
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
    request_id: `${prefix}-route`, idempotency_key: `${prefix}-route`,
    raw_text: ROUTE_TEXT } });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
    request_id: `${prefix}-accusation`, idempotency_key: `${prefix}-accusation`,
    raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
}

export function ref(entityId) {
  return { entity_kind: 'npc', entity_id: entityId };
}
