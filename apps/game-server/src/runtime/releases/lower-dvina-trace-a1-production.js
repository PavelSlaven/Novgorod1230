import { resolveInventoryMechanicsProfile } from '@rus/items-property';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { createActionProducedOutputIdentity,
  createActionProducedTransitionPlanner } from
  '@rus/items-property/action-produced-transition';
import { requireActionProducedResultPlan,
  requireActionProducedResultRequest,
  createActionProducedTraceActionRef } from
  '@rus/turn/action-produced-result';
import { createActionProducedAtomicWritePlan } from
  '../../infrastructure/postgres/action-produced-atomic-write-plan.js';
import { loadActionProducedCommittedContext } from
  '../../infrastructure/postgres/action-produced-committed-context-loader.js';
import { INVALID_ACTION_PRODUCED_DATA,
  snapshotActionProducedPersistenceData as snapshot } from
  '../../infrastructure/postgres/action-produced-persistence-boundary.js';

export function createLowerDvinaTraceA1ProductionResolverFactory({
  pool, loadedProfile
} = {}) {
  const profile = validateLoadedProfile(loadedProfile);
  if (!pool?.query) {
    throw new TypeError('A1 production resolver dependencies are required.');
  }
  return ({ partyId, requestId }) => async function resolveA1(rawEnvelope) {
    const envelope = snapshot(rawEnvelope);
    if (envelope === INVALID_ACTION_PRODUCED_DATA) fail('TRACE_A1_SCOPE_INVALID');
    const operation = envelope.operation;
    const actorRef = envelope.actor?.actor_id;
    const stepIndex = envelope.request?.step_index;
    const rootTurnId = envelope.request?.root_turn_id;
    const stateVersion = Number(envelope.request?.committed_state_version);
    const turnNumber = Number(envelope.committed_state?.party_state?.turn_number)
      + 1;
    if (operation?.actor_ref !== actorRef || !text(actorRef)
        || !text(operation.item_ref) || !Array.isArray(operation.target_refs)
        || operation.target_refs.some((ref) => !text(ref))
        || new Set(operation.target_refs).size !== operation.target_refs.length
        || operation.target_refs.includes(operation.item_ref)
        || operation.action_production == null
        || !Number.isSafeInteger(stepIndex) || !text(rootTurnId)
        || !Number.isSafeInteger(stateVersion)
        || !Number.isSafeInteger(turnNumber)
        || !validExecutionEvidence(envelope)) {
      fail('TRACE_A1_SCOPE_INVALID');
    }
    const actionRef = createActionProducedTraceActionRef({
      root_turn_id: rootTurnId, step_index: stepIndex,
      approved_plan: envelope.plan
    });
    const sourceRefs = [operation.item_ref];
    const toolRefs = operation.target_refs;
    const loaded = await loadActionProducedCommittedContext(pool, {
      party_id: partyId, actor_ref: actorRef, root_turn_id: rootTurnId,
      action_ref: actionRef, step_index: stepIndex,
      context_ref: profile.context_ref,
      expected_party_state_version: stateVersion,
      source_refs: sourceRefs, tool_refs: toolRefs
    });
    const mechanics = new Map();
    for (const pin of loaded.row_pins) {
      mechanics.set(pin.item_id, committedMechanics(pin.item));
    }
    const qualitative = operation.action_production;
    const request = requireActionProducedResultRequest({
      schema: 'action_produced_result_request_v1', request_id: requestId,
      root_turn_id: rootTurnId, action_ref: actionRef,
      step_index: stepIndex, committed_state_version: String(stateVersion),
      context_ref: profile.context_ref, profile_ref: profile.profile_id,
      profile_version: String(profile.revision),
      causal_mode: 'action_produced', actor_ref: actorRef,
      source_refs: sourceRefs, tool_refs: toolRefs,
      intended_transformation: envelope.plan.interpretation.grounded_attempt,
      output_class: qualitative.output_class
    });
    const semantic = requireActionProducedResultPlan({
      ...structuredClone(request), schema: 'action_produced_result_plan_v1',
      identity_mode: qualitative.identity_mode, origin: qualitative.origin,
      result_class: qualitative.result_class,
      result_descriptor: structuredClone(qualitative.result_descriptor)
    }, { request });
    if (!profile.allowed_identity_modes.includes(semantic.identity_mode)
        || !profile.allowed_result_classes.includes(semantic.result_class)
        || semantic.origin !== null
          && !profile.allowed_origins.includes(semantic.origin)
        || semantic.output_class !== null
          && !profile.allowed_output_classes.includes(semantic.output_class)) {
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
        mechanicsRequest, mechanics
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
  const source = mechanicsRequest.source_inputs[0];
  const sourceMechanics = mechanics.get(source.entity_ref);
  if (sourceMechanics == null
      || mechanicsRequest.tool_inputs.some(({ entity_ref: ref }) =>
        mechanics.get(ref) == null)) fail('TRACE_A1_ITEM_MECHANICS_INVALID');
  const mode = mechanicsRequest.identity_mode;
  const noResult = mode === 'no_useful_result';
  const independent = mode === 'independent_outputs';
  const sourceRefs = mechanicsRequest.source_inputs.map(
    ({ entity_ref: ref }) => ref);
  const mechanicsSnapshot = (mechanicsValue, operationRef) => ({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: mechanicsRequest.causal_identity.root_turn_id,
      step_index: mechanicsRequest.causal_identity.step_index,
      operation_ref: operationRef,
      origin_kind: mechanicsRequest.origin ?? 'crafted',
      source_refs: sourceRefs
    }, mechanics: structuredClone(mechanicsValue)
  });
  const finite = source.finite_resource;
  if (independent && finite == null) {
    fail('TRACE_A1_FINITE_SOURCE_REQUIRED');
  }
  const decrement = independent ? { numerator: 1, denominator: 1,
    unit: finite.quantity.unit } : null;
  const outputRef = independent ? createActionProducedOutputIdentity({
    root_turn_id: mechanicsRequest.causal_identity.root_turn_id,
    action_ref: mechanicsRequest.causal_identity.action_ref, ordinal: 1
  }) : null;
  const outputMechanics = independent ? {
    ...structuredClone(sourceMechanics),
    quantity: { value: 1, unit: finite.quantity.unit }
  } : null;
  return {
    schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: mode,
    source_effects: [{ source_ref: source.entity_ref,
      requested_decrement: structuredClone(decrement),
      mechanics_snapshot_after: noResult || independent ? null
        : mechanicsSnapshot(sourceMechanics,
          mechanicsRequest.causal_identity.action_ref) }],
    outputs: independent ? [{ ordinal: 1,
      property_source_ref: source.entity_ref,
      mechanics_snapshot: mechanicsSnapshot(outputMechanics, outputRef),
      material_allocations: [{ source_ref: source.entity_ref,
        quantity: structuredClone(decrement) }] }] : [],
    known_waste: []
  };
}

function committedMechanics(item) {
  const state = item?.state;
  const templateId = item?.template_id;
  const instance = templateId == null
    ? { template_id: null, runtime_instance_mechanics_snapshot:
      state?.runtime_instance_mechanics_snapshot }
    : { template_id: templateId };
  const profiles = templateId == null ? [] : [{
    ...structuredClone(state?.inventory_profile_snapshot),
    template_id: templateId
  }];
  const resolved = resolveInventoryMechanicsProfile({ instance, profiles });
  if (!resolved.pass || resolved.profile.container !== null) {
    fail('TRACE_A1_ITEM_MECHANICS_INVALID');
  }
  const { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity, container } = resolved.profile;
  if (!Number.isSafeInteger(mass_grams) || mass_grams < 0
      || ![0, 1, 2].includes(external_hand_cost)
      || !['compact', 'regular', 'long', 'bulky'].includes(carry_form)
      || !Number.isSafeInteger(packing_slot_cost) || packing_slot_cost < 0
      || quantity !== null && (!Number.isFinite(quantity?.value)
        || quantity.value <= 0 || !text(quantity.unit))
      || container !== null) fail('TRACE_A1_ITEM_MECHANICS_INVALID');
  return { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity: structuredClone(quantity), container };
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

function validExecutionEvidence(envelope) {
  const plan = envelope.plan;
  const result = envelope.check_result;
  return plan?.resolution === 'generic_check'
    && plan.check != null && plan.activity?.owner === 'semantic'
    && result != null
    && result.check_id === `${envelope.request.root_turn_id}:step:${
      envelope.request.step_index}`
    && Number.isSafeInteger(result.roll)
    && typeof result.outcome?.band === 'string';
}
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
