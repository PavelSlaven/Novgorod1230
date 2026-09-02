import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { resolveTracePhase5Contracts } from
  '../src/runtime/lower-dvina-trace-phase-5-contracts.js';
import { resolveTraceTurn10Contracts } from
  '../src/runtime/lower-dvina-trace-turn-10-contracts.js';
import {
  createTurnAvailableActionSet,
  createTurnCommandRegistry
} from '@rus/turn';

const bundle = await loadScenarioBundle(15);
const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';

export async function turn10ActionSet(state, command, contracts) {
  const fallback = {
    command_id: 'test.turn10_fallback', option_id: 'test_fallback',
    label: 'Тестовое действие', matches: () => false,
    availability: () => ({ version: 1, schema: 'turn_availability_decision',
      status: 'available', can_attempt: true, reasons: [], check_requests: [] }),
    consequence: () => null, writeTargets: () => []
  };
  return createTurnAvailableActionSet({
    registry: createTurnCommandRegistry([command, fallback]),
    committedState: state, actorId: state.actor_id,
    policyPins: [contracts.activityPin]
  });
}

export function turn10State({ completedRest = true } = {}) {
  const state = structuredClone(fixture({ scenarioBundle: bundle }).state);
  const phase3 = resolveTracePhase3Contracts({ state, bundle });
  const camp = state.prepared_scenes.find(
    ({ location_profile_ref: ref }) => ref === phase3.ids.campLocation);
  state.position = {
    ...state.position,
    location_ref: phase3.ids.campLocation,
    g5_anchor_id: phase3.campAnchor,
    g5_node_id: camp.node.instance_id,
    zone_ref: 'working_camp'
  };
  delete state.current_visible_context;
  state.environment_snapshot = {
    environment_profile_id: 'trace_ld_v1_env_camp_fire',
    schema: 'rus.trace_environment_profile.v1', version: 1,
    facts: ['sheltered_from_wind', 'lit_fire', 'drying_place'],
    source: 'party_environment_snapshot',
    scope: {
      location_ref: state.position.location_ref,
      g5_node_id: state.position.g5_node_id,
      g5_anchor_id: state.position.g5_anchor_id,
      zone_ref: state.position.zone_ref
    },
    causal_basis: {
      kind: 'authored_terminal_environment',
      environment_profile_ref: 'trace_ld_v1_env_camp_fire',
      route_ref: 'trace_ld_v1_route_shed_to_camp_carry_onisim',
      anchor_template_ref: camp.anchor.template_id
    }
  };
  for (const npc of state.npcs) {
    if (![
      'eremey_fisher', 'ratsha_storehouse_helper', 'onisim_boatman',
      'background_fisher_1', 'background_fisher_2'
    ].includes(npc.participant_slot_ref)) continue;
    npc.anchor_id = phase3.campAnchor;
    npc.machine_state = {
      ...(npc.machine_state ?? {}),
      status: npc.participant_slot_ref === 'onisim_boatman'
        ? 'incapacitated' : 'active',
      ...(npc.participant_slot_ref === 'onisim_boatman'
        ? { spatial_zone_ref: 'fire_rest_area' } : {})
    };
  }
  const zhdanko = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  zhdanko.check_body_state = {
    health: 100,
    satiety: 100,
    energy: 50,
    active_conditions: []
  };
  zhdanko.machine_state = {
    ...(zhdanko.machine_state ?? {}),
    load_category: 'moderate'
  };
  state.phase5_treatment = { activity_execution: { status: 'completed' } };
  state.phase6_carry_execution = { status: 'completed' };
  const bodyConditions = [
    ['trace_ld_v1_condition_wet_clothing', 'wet'],
    ['trace_ld_v1_condition_cold_shivering', 'strong_shivering'],
    ['trace_ld_v1_condition_headache', 'headache'],
    ['trace_ld_v1_condition_shoulder_bruise', 'shoulder_bruise']
  ];
  state.body_state.active_conditions = bodyConditions.map(
    ([profile, condition], index) => ({
      id: condition,
      storage_condition_id: `turn10-condition-${index}`,
      condition_profile_ref: profile,
      status: 'active',
      state_version: 1
    }));
  state.body_state.energy = 35;
  if (completedRest) state.phase7_fire_rest = { status: 'completed' };
  const committed = JSON.parse(JSON.stringify(state));
  const phase5 = resolveTracePhase5Contracts({ state: committed, bundle });
  return {
    state: committed,
    contracts: resolveTraceTurn10Contracts({
      state: committed, bundle, phase3Contracts: phase3,
      phase5Contracts: phase5
    })
  };
}

export function turn10StepPlan(request, contracts) {
  const first = request.step_index === 1;
  const companionOperation = {
    op: 'emit_interaction',
    actor_ref: request.actor.actor_id,
    interaction_kind: 'request',
    target_actor_refs: [
      contracts.actors.eremey.instance_id,
      contracts.actors.participatingFisher.instance_id,
      contracts.actors.otherFisher.instance_id
    ],
    instrument_refs: [],
    content: 'попросить Еремея и рыбака пойти к Жданко'
  };
  const operation = first ? {
    op: 'request_activity',
    actor_ref: request.actor.actor_id,
    activity_kind: 'recover',
    target_refs: [request.player_safe_state.position.location_ref],
    description: 'отдохнуть у огня полчаса и подсушить одежду'
  } : companionOperation;
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation],
    check: null,
    continuation: first ? {
      remaining_intent:
        'Попросить Еремея и рыбака пойти со мной к Жданко.',
      depends_on_refs: [
        request.player_safe_state.position.location_ref,
        contracts.actors.eremey.instance_id,
        contracts.actors.participatingFisher.instance_id,
        contracts.actors.otherFisher.instance_id
      ],
      ...(request.prepared_followup_candidates?.[0] == null ? {} : {
        prepared_followup_ref:
          request.prepared_followup_candidates[0].prepared_followup_ref
      })
    } : null,
    clarification: null,
    reason_code: first ? 'rest_then_request_companions' : 'request_companions',
    reason: 'Каждая часть составной заявки передаётся её владельцу.'
  };
}

export function playerPlan(request, contracts) {
  const addressees = [
    contracts.actors.eremey,
    contracts.actors.participatingFisher,
    contracts.actors.otherFisher
  ].map(({ instance_id: id }) => ref('npc', id));
  return {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id,
    conversation_id: request.conversation_id,
    state_version: request.state_version,
    speaker_ref: request.speaker_ref,
    input_mode: 'verbatim',
    contribution_kind: 'speech',
    primary_addressee_ref: addressees[0],
    intended_addressee_refs: addressees,
    affected_actor_refs: [],
    speech: speech(request.raw_text, 'request'),
    interpretation: interpretation(),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: [],
    check: null,
    handoff: null
  };
}

export function npcPlan(request, contracts, preferredFisherRoles = null) {
  const contract = request.decision_scope.operation_contract
    .commit_route_participation;
  const preferredRole = preferredFisherRoles?.get(request.npc_ref.entity_id)
    ?? (request.npc_ref.entity_id
      === contracts.actors.participatingFisher.instance_id
      ? 'stay_with_onisim'
      : request.npc_ref.entity_id === contracts.actors.otherFisher.instance_id
        ? 'escort' : null);
  const bound = contract.allowed_bindings.find(({ role }) =>
    preferredRole === null || role === preferredRole);
  const operation = { op: 'commit_route_participation', ...bound };
  const playerRef = request.public_conversation_history.at(-1).speaker_ref;
  const asksRatsha = request.npc_ref.entity_id
    === contracts.actors.eremey.instance_id;
  const isRatsha = request.npc_ref.entity_id
    === contracts.actors.ratsha.instance_id;
  const ratshaRef = ref('npc', contracts.actors.ratsha.instance_id);
  const addressee = asksRatsha ? ratshaRef : playerRef;
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: addressee,
    intended_addressee_refs: [addressee],
    affected_actor_refs: [],
    speech: {
      ...speech(asksRatsha ? 'Ратша, повтори свой рассказ.'
        : isRatsha ? 'Возьмите меня с собой к Жданко.' : 'Согласен.',
      asksRatsha ? 'question' : isRatsha ? 'request' : 'accept'),
      response_expectation: asksRatsha ? {
        kind: 'answer_requested', target_refs: [ratshaRef]
      } : { kind: 'none', target_refs: [] }
    },
    interpretation: interpretation(),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: [operation],
    check: null,
    handoff: null,
    reason: 'Персонаж самостоятельно принимает просьбу.'
  };
}

function speech(text, dominantAct) {
  return {
    utterance_text: text,
    dominant_act: dominantAct,
    interaction_tags: [],
    topic_refs: [],
    claims: [],
    response_expectation: { kind: 'none', target_refs: [] }
  };
}

function interpretation() {
  return {
    intent: 'обсудить состав группы',
    grounded_contribution: 'обсудить состав группы',
    adaptation: 'literal'
  };
}

function activity() {
  return { duration_class: 'domain_owned', effort: 'none' };
}

export function ref(entity_kind, entity_id) {
  return { entity_kind, entity_id };
}
export { fixture, bundle, COMPOUND_TURN_10 };
