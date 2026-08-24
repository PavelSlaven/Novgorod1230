import { createActionProducedTransitionPlanner,
  resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';
import { createActionProducedAtomicWritePlan } from
  '../../infrastructure/postgres/action-produced-atomic-write-plan.js';
import { loadActionProducedCommittedContext } from
  '../../infrastructure/postgres/action-produced-committed-context-loader.js';
import { INVALID_ACTION_PRODUCED_DATA,
  snapshotActionProducedPersistenceData as snapshot } from
  '../../infrastructure/postgres/action-produced-persistence-boundary.js';
import { admitA1PreAttempt, contextForA1Operation,
  resolveA1OperationScope } from './lower-dvina-trace-a1-pre-attempt.js';

export function createLowerDvinaTraceA1ProductionResolverFactory({
  pool, loadedProfile
} = {}) {
  const profile = validateLoadedProfile(loadedProfile);
  if (!pool?.query) {
    throw new TypeError('A1 production resolver dependencies are required.');
  }
  return ({ partyId, requestId, applyWorkingProjection }) => {
    const load = async (rawEnvelope, requireEvidence) => {
      const envelope = snapshot(rawEnvelope);
      if (envelope === INVALID_ACTION_PRODUCED_DATA) {
        fail('TRACE_A1_SCOPE_INVALID');
      }
      const { actorRef, stepIndex, rootTurnId, stateVersion, turnNumber,
        actionRef, qualitative, sourceRefs, toolRefs } = resolveA1OperationScope(
        envelope, envelope.operation, profile, requireEvidence);
      const changeSetId = resolveChangeSetId({ envelope, partyId, rootTurnId,
        turnNumber });
      const loaded = await loadActionProducedCommittedContext(pool, {
        party_id: partyId, actor_ref: actorRef, root_turn_id: rootTurnId,
        action_ref: actionRef, step_index: stepIndex,
        context_ref: profile.context_ref,
        expected_party_state_version: stateVersion,
        source_refs: sourceRefs, tool_refs: toolRefs,
        admission_profile: admissionProfile(profile, stateVersion),
        technical_policy: technicalPolicy(profile),
        prepared_ordinary_plan: envelope
          .prepared_ordinary_materialization_atomic_write_plan ?? null,
        prepared_action_plans: envelope
          .prepared_action_production_atomic_write_plans ?? [],
        change_set_id: changeSetId
      });
      return { envelope, actorRef, stepIndex, rootTurnId, stateVersion,
        actionRef, qualitative, sourceRefs, toolRefs, changeSetId, loaded };
    };
    return Object.freeze({
      async referencesApplicable(rawInput) {
        const input = referenceApplicabilityInput(rawInput, partyId, profile);
        try {
          await loadActionProducedCommittedContext(pool, input);
          return true;
        } catch (error) {
          if (['ACTION_PRODUCED_ITEM_ACCESS_DENIED',
            'ACTION_PRODUCED_ITEM_GAP'].includes(error?.code)) return false;
          throw error;
        }
      },
      async preflight(rawEnvelope) {
        const boundary = snapshot(rawEnvelope);
        if (boundary === INVALID_ACTION_PRODUCED_DATA) {
          fail('TRACE_A1_SCOPE_INVALID');
        }
        const operations = boundary.operations ?? [boundary.operation];
        if (!Array.isArray(operations) || operations.length === 0) {
          fail('TRACE_A1_SCOPE_INVALID');
        }
        const firstEnvelope = { ...structuredClone(boundary),
          operation: structuredClone(operations[0]) };
        delete firstEnvelope.operations;
        const base = await load(firstEnvelope, false);
        for (const operation of operations) {
          admitA1PreAttempt(contextForA1Operation(base, operation, profile),
            profile, requestId);
        }
        return true;
      },
      async execute(rawEnvelope) {
        if (typeof applyWorkingProjection !== 'function') {
          fail('TRACE_A1_PROJECTION_OWNER_MISSING');
        }
        const context = await load(rawEnvelope, true);
        const { envelope, actorRef, stepIndex, rootTurnId, stateVersion,
          actionRef, qualitative, sourceRefs, toolRefs, changeSetId, loaded } =
          context;
        const { semantic, admission, mechanics } = admitA1PreAttempt(context,
          profile, requestId);
        const planner = createActionProducedTransitionPlanner({
          resolveMechanics: (mechanicsRequest) => {
            if ([...mechanicsRequest.source_inputs,
              ...mechanicsRequest.tool_inputs].some(({ entity_ref: ref }) =>
              mechanics.get(ref) == null)) {
              fail('TRACE_A1_ITEM_MECHANICS_INVALID');
            }
            const mechanicsInput = {
              mechanics_request: mechanicsRequest,
              source_mechanics: mechanicsRequest.source_inputs.map(
                ({ entity_ref: ref }) => ({ source_ref: ref,
                  mechanics: mechanics.get(ref) })),
              requested_output_count: qualitative.requested_output_count
            };
            return resolveActionProducedAllocationMechanics(
              structuredClone(mechanicsInput));
          }
        });
        const proposal = planner({
          handoff: admission.handoff,
          source_snapshots: loaded.source_snapshots,
          tool_snapshots: loaded.tool_snapshots,
          committed_entity_refs: loaded.row_pins.map(({ item_id: id }) => id),
          technical_policy: loaded.technical_policy,
          output_destination: admission.handoff.identity_mode
            === 'independent_outputs' ? loaded.output_destination : null
        });
        if (proposal.status === 'physically_infeasible') {
          return Object.freeze({
            working_projection: structuredClone(envelope.working_projection),
            summary: 'action_production:no_useful_result', write_fragments: [],
            duration_minutes: 0,
            action_production_atomic_write_plan: null
          });
        }
        const atomicPlan = createActionProducedAtomicWritePlan({
          schema: 'action_production_atomic_write_request_v1',
          party_id: partyId, base_party_state_version: stateVersion,
          change_set_id: changeSetId,
          committed_load: loaded, transition_proposal: proposal
        });
        const workingProjection = await applyWorkingProjection({
          working_projection: structuredClone(envelope.working_projection),
          actor: structuredClone(envelope.actor),
          action_production_atomic_write_plan: atomicPlan
        });
        return Object.freeze({
          working_projection: structuredClone(workingProjection),
          summary: semantic.identity_mode === 'no_useful_result'
            ? 'action_production:no_useful_result'
            : 'action_production:physical_change',
          write_fragments: [], duration_minutes: 0,
          action_production_atomic_write_plan: atomicPlan
        });
      }
    });
  };
}

function resolveChangeSetId({ envelope, partyId, rootTurnId, turnNumber }) {
  const standard = `change:${partyId}:turn-step:${turnNumber}`;
  const phase7 = `change:${partyId}:trace-phase7:${turnNumber}`;
  const requested = envelope.request?.change_set_id;
  if (requested == null) return standard;
  if (requested === standard) return requested;
  if (requested === phase7 && rootTurnId === `turn:${partyId}:${turnNumber}`) {
    return requested;
  }
  fail('TRACE_A1_SCOPE_INVALID');
}

function validateLoadedProfile(value) {
  const profile = value?.schema === 'rus.lower_dvina_trace_a1_loaded_profile.v1'
    ? value.profile : null;
  if (profile?.schema
      !== 'rus.lower_dvina_trace_action_production_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 1) {
    throw new TypeError('Exact loaded A1 profile is required.');
  }
  return profile;
}

function admissionProfile(profile, stateVersion) {
  return {
    schema: 'rus.items.action_produced_admission_profile.v1',
    profile_ref: profile.profile_id, profile_version: String(profile.revision),
    status: 'committed', context_ref: profile.context_ref,
    context_state_version: String(stateVersion),
    allowed_access_states: structuredClone(profile.allowed_access_states),
    allowed_identity_modes: structuredClone(profile.allowed_identity_modes),
    allowed_origins: structuredClone(profile.allowed_origins),
    allowed_result_classes: structuredClone(profile.allowed_result_classes)
  };
}

function technicalPolicy(profile) {
  return {
    schema: 'rus.items.action_produced_technical_policy.v1', version: 1,
    status: 'committed', policy_ref: profile.policy_ref,
    profile_ref: profile.profile_id, profile_version: String(profile.revision),
    max_new_entities: profile.max_new_entities
  };
}

function referenceApplicabilityInput(raw, partyId, profile) {
  const actorRef = raw?.actor_ref;
  const itemRef = raw?.item_ref;
  const sourceRefs = raw?.source_refs;
  const toolRefs = raw?.tool_refs;
  const stateVersion = Number(raw?.committed_state_version);
  const rootTurnId = raw?.root_turn_id;
  const stepIndex = raw?.step_index;
  if (!text(actorRef) || !text(itemRef) || !refs(sourceRefs, false)
      || !refs(toolRefs, true) || sourceRefs[0] !== itemRef
      || sourceRefs.some((ref) => toolRefs.includes(ref))
      || !Number.isSafeInteger(stateVersion) || stateVersion < 0
      || !text(rootTurnId) || !Number.isSafeInteger(stepIndex)
      || stepIndex < 1 || stepIndex > 8) fail('TRACE_A1_SCOPE_INVALID');
  return {
    party_id: partyId, actor_ref: actorRef, root_turn_id: rootTurnId,
    action_ref: `a1:references:${rootTurnId}:${stepIndex}`,
    step_index: stepIndex, context_ref: profile.context_ref,
    expected_party_state_version: stateVersion,
    source_refs: structuredClone(sourceRefs), tool_refs: structuredClone(toolRefs),
    admission_profile: admissionProfile(profile, stateVersion),
    technical_policy: technicalPolicy(profile)
  };
}

function refs(value, allowEmpty) { return Array.isArray(value)
  && (allowEmpty || value.length > 0) && value.every(text)
  && new Set(value).size === value.length; }
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }

function fail(code) { throw Object.assign(new Error(code), { code }); }
