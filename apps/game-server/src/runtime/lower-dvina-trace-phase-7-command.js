import { resolveTracePhase7FireRestConsequence } from
  './lower-dvina-trace-phase-7-command-consequence.js';

const PRECONDITION = 'phase7_fire_rest_admission';

const EXACT = new Set([
  'отдохнуть у огня полчаса и подсушить одежду.',
  'отдохнуть у огня полчаса и подсушить одежду'
]);

export function createTracePhase7FireRestCommand({
  contracts,
  preparedFollowupRef = null,
  inputDigest,
  npcAutonomousModel,
  semanticActivityScheduleOwner,
  genericCheckContextOwner,
  localFireProfile,
  worldProcessResolver,
  projectNpcWorldProcessCapability,
  npcOwnerCapabilities,
  directHandlers,
  directOperationContract,
  createBoundaryNpcOwnerCapabilities,
  createBoundaryNpcDirectOperations,
  randomSource,
  temporalAdvanceOwner,
  revalidateStateVersion,
  conversationBindings = null,
  conversationActivity = null,
  runNpcConversationExchange = null
}) {
  return Object.freeze({
    command_id: 'lower_dvina_trace.rest_by_fire_and_dry_clothing',
    option_id: 'rest_by_fire_and_dry_clothing',
    label: 'Отдохнуть у огня полчаса и подсушить одежду',
    target_id: contracts.campLocationRef,
    approved_record: contracts.activityPin,
    preconditions: [{ kind: PRECONDITION }],
    expected_cost: { kind: 'exact_time', value: 30 },
    known_risks: [],
    reason_visible_to_actor:
      'После переноски у огня можно немного обсохнуть и восстановить силы.',
    ...(typeof preparedFollowupRef === 'string' && preparedFollowupRef.length > 0
      ? { prepared_followup_ref: preparedFollowupRef } : {}),
    mode: {
      selected_primary_mode: 'body_recovery',
      secondary_modes: ['time_progression', 'npc_interaction'],
      resolution_plan: {
        subsystems: [
          'body_state', 'time_progression', 'npc_interaction',
          'movement', 'item_access', 'visible_context_projection'
        ],
        checks_to_run: ['physical_access', 'body_state', 'time_cost'],
        expected_writes: [
          'party_state', 'party_npcs', 'party_items',
          'party_visible_context_package'
        ],
        state_blocks_to_load: [
          'party_state', 'current_position', 'clock_weather_light',
          'relevant_items', 'relevant_npcs', 'relevant_events',
          'recent_changes_log'
        ]
      }
    },
    matches({ raw_text: rawText }) {
      return EXACT.has(String(rawText ?? '').trim().toLowerCase()
        .replace(/\s+/gu, ' '));
    },
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      return available(admitted(state, contracts));
    },
    async consequence({ retrievedState: state, playerInput,
      semanticPlan = null,
      modeResolution = null, rootTurnId = null }) {
      return resolveTracePhase7FireRestConsequence({
        state, playerInput, semanticPlan, modeResolution, rootTurnId,
        contracts, preparedFollowupRef, inputDigest, npcAutonomousModel,
        semanticActivityScheduleOwner, genericCheckContextOwner, localFireProfile,
        worldProcessResolver, projectNpcWorldProcessCapability, npcOwnerCapabilities,
        directHandlers, directOperationContract,
        createBoundaryNpcOwnerCapabilities, randomSource, temporalAdvanceOwner,
        createBoundaryNpcDirectOperations,
        revalidateStateVersion, runNpcConversationExchange,
        conversationBindings, conversationActivity, admitted
      });
    },
    writeTargets(input) {
      return [{
        target: 'party_state',
        value: {
          player_input: input.playerInput,
          mode_resolution: input.modeResolution,
          availability: input.availability,
          consequence: input.consequence,
          time_update: input.timeUpdate,
          body_update: input.bodyUpdate,
          hidden_update: input.hiddenUpdate
        }
      }, {
        target: 'party_visible_context_package',
        value: input.visibleContext
      }];
    }
  });
}

export function tracePhase7PreconditionSatisfied(
  precondition,
  state,
  contracts
) {
  return precondition?.kind === PRECONDITION && admitted(state, contracts);
}

function admitted(state, contracts) {
  const carry = state?.phase6_carry_execution;
  const atCamp = state?.position?.location_ref === contracts.campLocationRef;
  const onisim = (state?.npcs ?? []).find(
    ({ participant_slot_ref: slot }) => slot === 'onisim_boatman'
  );
  const alreadyCompleted = state?.phase7_fire_rest?.status === 'completed'
    || (state?.body_effect_history ?? []).some(
      ({ effect_ref: ref }) => ref === contracts.bodyEffect.effect_profile_id
    );
  return carry?.status === 'completed'
    && atCamp
    && onisim?.machine_state?.spatial_zone_ref === 'fire_rest_area'
    && contracts.zhdanko?.machine_state?.status !== 'incapacitated'
    && !alreadyCompleted;
}

function available(ok) {
  return {
    version: 1,
    schema: 'turn_availability_decision',
    status: ok ? 'available' : 'blocked',
    can_attempt: ok,
    reasons: ok ? [] : ['phase7_fire_rest_precondition_failed'],
    check_requests: []
  };
}
