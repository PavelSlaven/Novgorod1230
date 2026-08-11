import {
  buildCombatInitializationDecisionContexts,
  createCombatSession,
  initializeCombatSession
} from '@rus/turn';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { resolveTraceCombatSpatialAffordances } from
  './lower-dvina-trace-combat-position-owner.js';
import { restrictTraceCombatSpatialIntents } from
  './lower-dvina-trace-combat-position-owner.js';

export async function initializeTracePhase4Combat({
  state,
  contracts,
  semanticExchange,
  playerInput,
  npcCombatModel,
  revalidateStateVersion
}) {
  return initializeTraceCombatHandoff({ state, binding: contracts.combatBindings,
    actor: contracts.actors.ratsha_storehouse_helper,
    participantBindings: [], semanticExchange, playerInput, npcCombatModel,
    revalidateStateVersion, combatLabel: 'ratsha',
    movementBindings: contracts.combatMovementBindings,
    perceivedChangeSummary:
      'Ратша видит, что разговор перешёл к непосредственному боевому противостоянию.' });
}

export async function initializeTraceCombatHandoff({ state, binding, actor,
  participantBindings = [], semanticExchange, playerInput, npcCombatModel,
  revalidateStateVersion, combatLabel, perceivedChangeSummary,
  movementBindings }) {
  if (semanticExchange?.response_kind !== 'combat_handoff'
      || semanticExchange.combat_handoff?.kind !== 'combat') {
    return null;
  }
  if (!binding || typeof npcCombatModel !== 'function') {
    fail('TRACE_COMBAT_HANDOFF_DEPENDENCY_MISSING');
  }
  const startedAt = semanticExchange.clock_after;
  const rootTurnId = [
    'turn', state.party_id, Number(state.party_state.turn_number) + 1
  ].join(':');
  const combatId = [
    'combat', state.party_id, Number(state.party_state.turn_number) + 1,
    combatLabel
  ].join('-').replace(/[^A-Za-z0-9._-]/gu, '-');
  const participants = [{ actor, binding, perceivedChangeSummary },
    ...participantBindings];
  const session = createCombatSession({
    combat_id: combatId,
    started_at: startedAt,
    scope_ref: ref('location', binding.scope_location_ref),
    participant_refs: [
      ref('player_character', state.actor_id),
      ref('npc', actor.instance_id),
      ...participantBindings.map(({ actor: participant }) =>
        ref('npc', participant.instance_id))
    ]
  });
  const batchRef = ref('temporal_batch', `${combatId}:initial`);
  const exchangeId = semanticExchange.exchange?.exchange_id
    ?? semanticExchange.exchange_id;
  const contexts = buildCombatInitializationDecisionContexts({
    session,
    same_time_batch_ref: batchRef,
    party_id: state.party_id,
    root_turn_id: rootTurnId,
    decided_at: startedAt,
    signal_descriptors: participants.map(({ actor: subject,
      perceivedChangeSummary: summary }) => ({
      occurred_at: startedAt,
      category: binding.signal_descriptor.category,
      significance: binding.signal_descriptor.significance,
      source_event_ref: ref(
        'conversation_exchange',
        exchangeId ?? `${combatId}:handoff`
      ),
      subject_ref: ref('npc', subject.instance_id),
      perception_required: binding.signal_descriptor.perception_required,
      perceived_change_summary: summary
    })),
    npc_contexts: participants.map(({ actor: subject,
      binding: subjectBinding }) => {
      const operation = operationContract(subjectBinding,
        subject.instance_id === actor.instance_id
          ? [ref('player_character', state.actor_id),
            ...participantBindings.map(({ actor: other }) =>
              ref('npc', other.instance_id))]
          : [ref('npc', actor.instance_id)],
        subject.instance_id === actor.instance_id ? [] : [
          ref('player_character', state.actor_id)], subject, state,
        movementBindings);
      return {
      npc_ref: ref('npc', subject.instance_id),
      state_version: String(state.party_state.state_version),
      current_intent: null,
      npc_subjective_state: projectNpcSubjectiveState(subject),
      perceived_combat_state: {
        scope: ref('location', binding.scope_location_ref),
        visible_opponents: subject.instance_id === actor.instance_id
          ? [ref('player_character', state.actor_id),
            ...participantBindings.map(({ actor: ally }) =>
              ref('npc', ally.instance_id))]
          : [ref('npc', actor.instance_id)],
        visible_allies: subject.instance_id === actor.instance_id ? []
          : [ref('player_character', state.actor_id),
            ...participantBindings.filter(({ actor: ally }) =>
              ally.instance_id !== subject.instance_id)
              .map(({ actor: ally }) => ref('npc', ally.instance_id))],
        visible_neutral_actors: [],
        recognized_weapons: [],
        known_positions: [],
        known_exits: structuredClone(
          operation.break_contact_destination_refs),
        visible_cover: [],
        perceived_hazards: [],
        recent_perceived_events: [],
        uncertainties: []
      },
      relevant_memory: [],
      operation_contract: operation,
      validate_plan: validateNpcCombatPlanApplicability,
      semantic_model: npcCombatModel
    }; })
  });
  const initialized = await initializeCombatSession({
    session,
    decision_contexts: contexts,
    semantic_model: npcCombatModel,
    revalidate_state_version: revalidateStateVersion
  });
  const decisionRecords = initialized.decision_results.map((proposal) => {
    const context = contexts.find(({ request }) =>
      request.request_id === proposal.plan?.request_id);
    if (!context || !['planned', 'replayed'].includes(proposal.status)) {
      fail('TRACE_PHASE_4_COMBAT_DECISION_INVALID');
    }
    return {
      request: context.request,
      boundary: context.boundary,
      orderedSignals: context.ordered_signals,
      proposal
    };
  });
  return {
    ...initialized,
    decision_records: decisionRecords,
    root_turn_id: rootTurnId,
    player_request_id: playerInput.request_id,
    signal_records: contexts.flatMap((context) => context.ordered_signals)
  };
}

function operationContract(binding, opponents, protectable, actor, state,
  movementBindings) {
  const base = structuredClone(binding.operation_contract);
  const spatial = resolveTraceCombatSpatialAffordances({
    actorRef: ref('npc', actor.instance_id), state, movementBindings
  });
  return restrictTraceCombatSpatialIntents({
    ...base,
    engageable_actor_refs: opponents,
    controllable_actor_refs: opponents,
    protectable_refs: protectable,
    holdable_scope_refs: [ref('location', binding.scope_location_ref)]
  }, spatial);
}

function projectNpcSubjectiveState(actor) {
  const profile = actor.semantic_profile ?? actor.profile ?? {};
  return {
    identity: {
      name_or_label: profile.identity?.canonical_name
        ?? actor.participant_slot_ref ?? 'NPC'
    },
    social_role: structuredClone(profile.social_role ?? {}),
    combat_experience: profile.combat_experience ?? 'limited',
    attributes: structuredClone(profile.attributes ?? []),
    skills: structuredClone(profile.skills ?? []),
    body: structuredClone(profile.body ?? {}),
    mood: structuredClone(profile.mood ?? {}),
    temperament: structuredClone(profile.temperament ?? []),
    goals: structuredClone(profile.goals ?? []),
    fears: structuredClone(profile.fears ?? []),
    obligations: structuredClone(profile.obligations ?? []),
    relationships: structuredClone(profile.relationships ?? []),
    available_equipment: []
  };
}

function ref(entity_kind, entity_id) {
  return { entity_kind, entity_id };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
