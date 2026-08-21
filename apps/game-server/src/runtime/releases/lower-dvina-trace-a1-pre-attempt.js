import { mergeActionProducedPhysicalFacts,
  resolveInventoryMechanicsProfile } from '@rus/items-property';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { selectActionProducedPropertySource } from
  '@rus/items-property/action-produced-transition';
import { createActionProducedTraceActionRef,
  requireActionProducedResultPlan,
  requireActionProducedResultRequest } from
  '@rus/turn/action-produced-result';

export function resolveA1OperationScope(envelope, operation, profile,
  requireEvidence) {
  const actorRef = envelope.actor?.actor_id;
  const stepIndex = envelope.request?.step_index;
  const rootTurnId = envelope.request?.root_turn_id;
  const stateVersion = Number(envelope.request?.committed_state_version);
  const turnNumber = Number(
    envelope.committed_state?.party_state?.turn_number) + 1;
  const qualitative = operation?.action_production;
  const rawSourceRefs = qualitative?.source_refs;
  const rawToolRefs = qualitative?.tool_refs;
  if (operation?.actor_ref !== actorRef || !text(actorRef)
      || !text(operation?.item_ref) || !Array.isArray(operation?.target_refs)
      || operation.target_refs.some((ref) => !text(ref))
      || new Set(operation.target_refs).size !== operation.target_refs.length
      || operation.target_refs.includes(operation.item_ref)
      || qualitative == null || !Number.isSafeInteger(stepIndex)
      || !text(rootTurnId) || !Number.isSafeInteger(stateVersion)
      || !Number.isSafeInteger(turnNumber)
      || requireEvidence && !validExecutionEvidence(envelope)
      || !refs(rawSourceRefs, false) || !refs(rawToolRefs, true)
      || !rawSourceRefs.includes(operation.item_ref)
      || rawSourceRefs.some((ref) => rawToolRefs.includes(ref))
      || !sameRefSet([...rawSourceRefs.filter((ref) =>
        ref !== operation.item_ref), ...rawToolRefs],
        operation.target_refs)
      || qualitative.requested_output_count !== null
        && (!Number.isSafeInteger(qualitative.requested_output_count)
          || qualitative.requested_output_count < 1
          || qualitative.requested_output_count > profile.max_new_entities)) {
    fail('TRACE_A1_SCOPE_INVALID');
  }
  const sourceRefs = [operation.item_ref, ...rawSourceRefs
    .filter((ref) => ref !== operation.item_ref)
    .sort((left, right) => left.localeCompare(right))];
  const toolRefs = [...rawToolRefs]
    .sort((left, right) => left.localeCompare(right));
  return { actorRef, stepIndex, rootTurnId, stateVersion, turnNumber,
    actionRef: createActionProducedTraceActionRef({
      root_turn_id: rootTurnId, step_index: stepIndex,
      approved_plan: envelope.plan
    }), qualitative, sourceRefs, toolRefs };
}

export function contextForA1Operation(base, operation, profile) {
  const envelope = { ...structuredClone(base.envelope),
    operation: structuredClone(operation) };
  const scope = resolveA1OperationScope(envelope, operation, profile, false);
  if (scope.actorRef !== base.actorRef
      || operation.item_ref !== base.envelope.operation.item_ref
      || !sameRefSet(scope.sourceRefs, base.sourceRefs)
      || !sameRefSet(scope.toolRefs, base.toolRefs)) {
    fail('TRACE_A1_SCOPE_INVALID');
  }
  const sourceByRef = new Map(base.loaded.source_snapshots.map((entry) =>
    [entry.entity_ref, entry]));
  const toolByRef = new Map(base.loaded.tool_snapshots.map((entry) =>
    [entry.entity_ref, entry]));
  return { ...base, ...scope, envelope, loaded: { ...base.loaded,
    source_snapshots: scope.sourceRefs.map((ref) =>
      structuredClone(sourceByRef.get(ref))),
    tool_snapshots: scope.toolRefs.map((ref) =>
      structuredClone(toolByRef.get(ref))) } };
}

export function admitA1PreAttempt(context, profile, requestId) {
  const { envelope, actorRef, stepIndex, rootTurnId, stateVersion,
    actionRef, qualitative, sourceRefs, toolRefs, loaded } = context;
  validateA1V1Scope(qualitative, loaded.source_snapshots);
  const request = requireActionProducedResultRequest({
    schema: 'action_produced_result_request_v1', request_id: requestId,
    root_turn_id: rootTurnId, action_ref: actionRef,
    step_index: stepIndex, committed_state_version: String(stateVersion),
    context_ref: profile.context_ref, profile_ref: profile.profile_id,
    profile_version: String(profile.revision),
    causal_mode: 'action_produced', actor_ref: actorRef,
    source_refs: sourceRefs, tool_refs: toolRefs,
    intended_transformation: envelope.plan.interpretation.grounded_attempt,
    material_extent: qualitative.material_extent,
    requested_output_count: qualitative.requested_output_count,
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
  validateCurrentFactRefs(semantic, loaded, sourceRefs[0]);
  const mechanics = new Map();
  for (const pin of loaded.row_pins) {
    mechanics.set(pin.item_id, committedMechanics(pin.item));
  }
  return { semantic, admission, mechanics };
}

function validateA1V1Scope(qualitative, sources) {
  const finite = sources.map(({ finite_resource: value }) => value !== null);
  if (qualitative.identity_mode === 'independent_outputs') {
    selectActionProducedPropertySource(sources);
    if (qualitative.result_class === 'partial_transformation'
        && finite.some(Boolean)) {
      fail('ITEM_ACTION_PRODUCED_FINITE_PARTIAL_UNSUPPORTED');
    }
  }
  if (qualitative.identity_mode === 'preserve_source'
      && finite.slice(1).some(Boolean)
      && qualitative.material_extent !== 'whole') {
    fail('ITEM_ACTION_PRODUCED_FINITE_PARTIAL_UNSUPPORTED');
  }
}

function validateCurrentFactRefs(semantic, loaded, sourceRef) {
  const descriptor = semantic.result_descriptor;
  const removed = semantic.identity_mode === 'preserve_source'
    ? descriptor.removed_physical_fact_refs ?? []
    : semantic.result_class === 'partial_transformation'
      ? descriptor.source_fact_delta?.removed_physical_fact_refs ?? [] : [];
  if (removed.length === 0) return;
  const item = loaded.row_pins.find(({ item_id: id }) => id === sourceRef)?.item;
  const metadata = item?.state?.ordinary_metadata;
  mergeActionProducedPhysicalFacts({ entity_ref: sourceRef,
    action_ref: semantic.action_ref,
    existing: metadata?.semantic_facts ?? [],
    existing_inscriptions: metadata?.physical_inscriptions ?? [],
    physical_description: null, physical_facts: [],
    removed_fact_refs: removed, inscription_text: null });
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

function validExecutionEvidence(envelope) {
  const plan = envelope.plan;
  const result = envelope.check_result;
  if (plan?.resolution === 'domain_request') {
    return plan.check === null && result === null
      && plan.activity?.owner === 'semantic';
  }
  return plan?.resolution === 'generic_check' && plan.check != null
    && plan.activity?.owner === 'semantic'
    && result != null
    && result.check_id === `${envelope.request.root_turn_id}:step:${
      envelope.request.step_index}`
    && Number.isSafeInteger(result.roll)
    && typeof result.outcome?.band === 'string';
}

function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function refs(value, allowEmpty) { return Array.isArray(value)
  && (allowEmpty || value.length > 0) && value.every(text)
  && new Set(value).size === value.length; }
function sameRefSet(left, right) { return Array.isArray(right)
  && left.length === right.length && left.every((ref) => right.includes(ref)); }
function fail(code) { throw Object.assign(new Error(code), { code }); }
