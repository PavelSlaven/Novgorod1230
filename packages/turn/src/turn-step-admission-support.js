import { TURN_STEP_OPERATION_BATCH_TARGET } from './turn-step-operation-batch.js';

export function activeConversationOperations(operations, playerSafeState) {
  const target = playerSafeState?.active_interlocutor?.entity_ref?.entity_id;
  return operations.filter((operation) => operation?.op !== 'emit_interaction'
    || (typeof target === 'string'
      && ['speech', 'request'].includes(operation.interaction_kind)
      && operation.target_actor_refs?.length === 1
      && operation.target_actor_refs[0] === target
      && operation.instrument_refs?.length === 0));
}
export function currentStepText({ plan, request }) {
  const current = request.remaining_intent;
  const remainder = plan.continuation?.remaining_intent;
  if (typeof current === 'string' && typeof remainder === 'string'
      && current.endsWith(remainder) && current.length > remainder.length) {
    const prefix = current.slice(0, -remainder.length)
      .replace(/[\s,;:—-]+$/u, '').trim();
    if (prefix) return prefix;
  }
  return plan.interpretation?.grounded_attempt ?? current;
}
export function commandWithDraftWrites({ command, registry, loopResult }) {
  const draftWrites = loopResult.write_fragments.length > 0
    ? [TURN_STEP_OPERATION_BATCH_TARGET] : [];
  if (loopResult.clarification) draftWrites.push('party_player_visible_message');
  const mode = command?.mode ?? { selected_primary_mode: 'combined',
    secondary_modes: [], resolution_plan: {
      subsystems: ['visible_context_projection'], checks_to_run: [],
      expected_writes: [], state_blocks_to_load: registry.stateBlocks() } };
  return { ...(command ?? { command_id: 'turn_step_execution_draft',
      option_id: 'turn_step_execution_draft' }), mode: { ...mode,
      resolution_plan: { ...mode.resolution_plan,
        expected_writes: [...new Set([
          ...(mode.resolution_plan?.expected_writes ?? []), ...draftWrites])] } } };
}
export function initialPreparedFollowupCandidates(semanticBindings,
  availableOptions) {
  const candidates = [];
  for (const { command, binding } of semanticBindings) {
    const ref = command.prepared_followup_ref;
    if (!availableOptions.has(command.option_id) || binding.operation_dto == null
        || typeof ref !== 'string' || ref.length === 0) continue;
    const successors = semanticBindings.filter(({ command: candidate }) =>
      candidate.command_id === ref);
    const successorOperations = successors.flatMap(({ binding: successor }) =>
      bindingOperations(successor));
    if (successors.length !== 1 || successorOperations.length !== 1) continue;
    candidates.push({ prepared_followup_ref: ref,
      precursor_operation: structuredClone(binding.operation_dto),
      operation: successorOperations[0] });
  }
  return candidates;
}
export function bindingOperations(binding) {
  const operations = binding.operation_dtos
    ?? (binding.operation_dto == null ? [] : [binding.operation_dto]);
  return operations.map((operation) => structuredClone(operation));
}
