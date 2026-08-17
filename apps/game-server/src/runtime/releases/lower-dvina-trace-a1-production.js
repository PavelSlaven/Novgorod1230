import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { createActionProducedTransitionPlanner } from
  '@rus/items-property/action-produced-transition';
import { requireActionProducedResultPlan,
  requireActionProducedResultRequest,
  createActionProducedTraceActionRef } from
  '@rus/turn/action-produced-result';
import { createActionProducedAtomicWritePlan } from
  '../../infrastructure/postgres/action-produced-atomic-write-plan.js';
import { loadActionProducedCommittedContext } from
  '../../infrastructure/postgres/action-produced-committed-context-loader.js';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';

export function createLowerDvinaTraceA1ProductionResolverFactory({
  pool, loadedProfile, actionProducedModel
} = {}) {
  const profile = validateLoadedProfile(loadedProfile);
  if (!pool?.query || typeof actionProducedModel !== 'function') {
    throw new TypeError('A1 production resolver dependencies are required.');
  }
  return ({ partyId, requestId }) => async function resolveA1(envelope) {
    const operation = envelope.operation;
    const actorRef = envelope.actor?.actor_id;
    const stepIndex = envelope.request?.step_index;
    const rootTurnId = envelope.request?.root_turn_id;
    const stateVersion = Number(envelope.request?.committed_state_version);
    const turnNumber = Number(envelope.committed_state?.party_state?.turn_number)
      + 1;
    if (operation?.actor_ref !== actorRef || !text(actorRef)
        || !text(operation.item_ref) || operation.target_refs?.length !== 1
        || !Number.isSafeInteger(stepIndex) || !text(rootTurnId)
        || !Number.isSafeInteger(stateVersion)
        || !Number.isSafeInteger(turnNumber)
        || !validExecutionEvidence(envelope, profile)) {
      fail('TRACE_A1_SCOPE_INVALID');
    }
    const toolRef = operation.target_refs[0];
    const actionRef = createActionProducedTraceActionRef({
      root_turn_id: rootTurnId, step_index: stepIndex,
      approved_plan: envelope.plan
    });
    const loaded = await loadActionProducedCommittedContext(pool, {
      party_id: partyId, actor_ref: actorRef, root_turn_id: rootTurnId,
      action_ref: actionRef, step_index: stepIndex,
      context_ref: profile.context_ref,
      expected_party_state_version: stateVersion,
      source_refs: [operation.item_ref], tool_refs: [toolRef]
    });
    const sourceRow = loaded.row_pins.find(({ role }) => role === 'source');
    const toolRow = loaded.row_pins.find(({ role }) => role === 'tool');
    const sourceProfile = profile.source_profiles.find(({ template_id: id }) =>
      id === sourceRow?.item?.template_id);
    const toolProfile = profile.tool_profiles.find(({ template_id: id }) =>
      id === toolRow?.item?.template_id);
    if (sourceProfile == null
        || sourceRow.item.profile_id !== sourceProfile.inventory_profile_id
        || toolProfile == null
        || toolRow.item.profile_id !== toolProfile.inventory_profile_id
        || sourceRow.entity_snapshot.finite_resource !== null
        || toolRow.entity_snapshot.finite_resource !== null
        || !committedMechanicsMatch(sourceRow.item.state, sourceProfile)
        || !committedMechanicsMatch(toolRow.item.state, toolProfile)) {
      fail('TRACE_A1_SOURCE_PROFILE_DENIED');
    }
    const request = requireActionProducedResultRequest({
      schema: 'action_produced_result_request_v1', request_id: requestId,
      root_turn_id: rootTurnId, action_ref: actionRef,
      step_index: stepIndex, committed_state_version: String(stateVersion),
      context_ref: profile.context_ref, profile_ref: profile.profile_id,
      profile_version: String(profile.revision),
      causal_mode: 'action_produced', actor_ref: actorRef,
      source_refs: [operation.item_ref], tool_refs: [toolRef],
      intended_transformation: envelope.request.remaining_intent,
      output_class: 'ordinary_mundane'
    });
    const semantic = requireActionProducedResultPlan(
      await actionProducedModel(request), { request });
    if (!profile.allowed_identity_modes.includes(semantic.identity_mode)
        || !profile.allowed_result_classes.includes(semantic.result_class)
        || semantic.origin !== null
        || semantic.output_class !== (semantic.identity_mode
          === 'no_useful_result' ? null : 'ordinary_mundane')) {
      fail('TRACE_A1_SEMANTIC_PROFILE_DENIED');
    }
    const admission = admitActionProducedResult({
      committed_context: loaded.committed_context,
      profile: loaded.admission_profile,
      proposal: semantic
    });
    if (admission.pass !== true) fail('TRACE_A1_ADMISSION_DENIED');
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: (mechanicsRequest) => ownerResolution({
        mechanicsRequest, mechanics: sourceProfile.mechanics
      })
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
    const atomicPlan = createActionProducedAtomicWritePlan({
      schema: 'action_production_atomic_write_request_v1',
      party_id: partyId, base_party_state_version: stateVersion,
      change_set_id: `change:${partyId}:turn-step:${turnNumber}`,
      committed_load: loaded, transition_proposal: proposal
    });
    return Object.freeze({
      working_projection: structuredClone(envelope.working_projection),
      summary: semantic.identity_mode === 'no_useful_result'
        ? 'action_production:no_useful_result'
        : 'action_production:physical_change',
      write_fragments: [],
      action_production_atomic_write_plan: atomicPlan,
      player_response_boundary: true
    });
  };
}

function ownerResolution({ mechanicsRequest, mechanics }) {
  const noResult = mechanicsRequest.identity_mode === 'no_useful_result';
  const source = mechanicsRequest.source_inputs[0];
  return {
    schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: mechanicsRequest.identity_mode,
    source_effects: [{ source_ref: source.entity_ref,
      requested_decrement: null,
      mechanics_snapshot_after: noResult ? null : {
        schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
        provenance: {
          source_kind: 'ordinary_direct_action_result',
          root_turn_id: mechanicsRequest.causal_identity.root_turn_id,
          step_index: mechanicsRequest.causal_identity.step_index,
          operation_ref: mechanicsRequest.causal_identity.action_ref,
          origin_kind: 'crafted',
          source_refs: mechanicsRequest.source_inputs.map(
            ({ entity_ref: ref }) => ref)
        }, mechanics: structuredClone(mechanics)
      } }],
    outputs: [], known_waste: []
  };
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
function validExecutionEvidence(envelope, profile) {
  const required = profile.required_execution;
  const plan = envelope.plan;
  const check = plan?.check;
  const activity = plan?.activity;
  const result = envelope.check_result;
  return plan?.resolution === required.resolution
    && check?.attribute_ref === required.attribute_ref
    && check.skill_ref === required.skill_ref
    && check.difficulty_id === required.difficulty_id
    && activity?.owner === 'semantic'
    && activity.duration_class === required.duration_class
    && activity.effort === required.effort
    && result != null
    && result.check_id === `${envelope.request.root_turn_id}:step:${
      envelope.request.step_index}`
    && Number.isSafeInteger(result.roll)
    && typeof result.outcome?.band === 'string';
}
function committedMechanicsMatch(state, profile) {
  const inventory = state?.inventory_profile_snapshot;
  const snapshot = state?.action_production_mechanics_snapshot;
  if (inventory?.inventory_profile_id !== profile.inventory_profile_id
      && inventory?.id !== profile.inventory_profile_id) return false;
  return snapshot?.schema
      === 'rus.items.action_production_committed_mechanics_snapshot.v1'
    && snapshot.profile_ref === 'lower_dvina_trace_a1_personal_tool_profile_v1'
    && snapshot.profile_version === '1'
    && snapshot.template_id === profile.template_id
    && snapshot.inventory_profile_id === profile.inventory_profile_id
    && digest(snapshot.mechanics) === digest(profile.mechanics)
    && inventory.mass_grams === profile.mechanics.mass_grams
    && inventory.external_hand_cost === profile.mechanics.external_hand_cost
    && inventory.carry_form === profile.mechanics.carry_form;
}
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
