import { serverError } from '../errors.js';
import {
  REVISION_13_EXACT_TEXTS,
  REVISION_24_STATE_GATED_COMMANDS,
  STATE_GATED_COMMANDS,
  TRACE_TURN_STEP_EXPECTED as EXPECTED
} from './lower-dvina-trace-turn-step-binding-profile.js';

export function bindLowerDvinaTraceTurnStepCommands({ commands, bundle, targetRefs }) {
  if (![13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(bundle.definition_revision)) return commands;
  const records = bundle.turn_step_bindings?.domain_bindings;
  const expectedCommands = Object.entries(EXPECTED).filter(([, expected]) => (expected.minRevision ?? 13) <= bundle.definition_revision);
  const byCommand = new Map();
  if (!Array.isArray(records) || records.length !== expectedCommands.length) {
    gap();
  }
  for (const record of records) {
    if (!record?.command_id || byCommand.has(record.command_id)) gap();
    byCommand.set(record.command_id, record);
  }

  const bound = commands.map((command) => {
    const expected = EXPECTED[command.command_id];
    if (!expected || (expected.minRevision ?? 13) > bundle.definition_revision) {
      return command;
    }
    const record = byCommand.get(command.command_id);
    const targetAlternatives = bundle.definition_revision
      >= (expected.targetAlternativesMinRevision ?? Number.MAX_SAFE_INTEGER)
      ? targetRefs?.[expected.targetAlternativeKey]
      : null;
    const targetRef = targetAlternatives
      ?? (expected.targetKeys == null ? targetRefs?.[expected.targetKey]
        : expected.targetKeys.map((key) => targetRefs?.[key]));
    const actorRef = targetRefs?.actor;
    const dynamicTargetAbsent = expected.operation === 'request_combat' && targetRef == null;
    if (expected.closedSelection === true && targetRef == null) return command;
    if (
      !validRecord(record, expected, bundle.definition_revision) ||
      (expected.closedSelection === true && !validClosedSelectionOptions(targetRef)) ||
      (Array.isArray(targetRef)
        ? targetRef.some((ref) => typeof ref !== 'string' || ref.length === 0)
        : expected.closedSelection === true
          ? false
          : !dynamicTargetAbsent && (typeof targetRef !== 'string' || targetRef.length === 0)) ||
      typeof actorRef !== 'string' ||
      actorRef.length === 0
    ) {
      gap();
    }
    return {
      ...command,
      ...(bundle.definition_revision === 13 && REVISION_13_EXACT_TEXTS[command.command_id]
        ? {
            matches: ({ raw_text: rawText }) => REVISION_13_EXACT_TEXTS[command.command_id].has(normalizeExactText(rawText)),
          }
        : {}),
      semantic_binding: {
        binding_id: record.binding_id,
        operation: record.operation,
        ...(expected.operation === 'request_combat'
          && typeof targetRefs?.combatScope === 'string'
          ? { operation_dtos: combatPlannerOperations({ record, actorRef,
              targetRef, scopeRef: targetRefs.combatScope }) }
          : expected.operation === 'emit_interaction'
            ? { operation_dtos: interactionPlannerOperations({ command,
                expected, record, actorRef, targetRef,
                evidenceRef: targetRefs?.evidence }) }
          : { operation_dto: plannerOperation({ command, expected, actorRef,
              targetRef, evidenceRef: targetRefs?.evidence }) }),
        matches: ({ operation }) =>
          matchesOperation({
            operation,
            expected,
            allowedKinds: expected.operation === 'request_activity' ? [expected.kind] : (expected.runtimeKinds ?? record[expected.kindsField]),
            actorRef,
            targetRef,
            evidenceRef: targetRefs?.evidence,
            commandLabel: command.label,
          }),
      },
    };
  });
  if (
    [...byCommand.entries()].some(([commandId, record]) => {
      const command = bound.find(({ command_id: id }) => id === commandId);
      if (command?.semantic_binding) return false;
      return !(STATE_GATED_COMMANDS.has(commandId) || ([24, 25, 26, 27, 28, 29, 30, 31, 32].includes(bundle.definition_revision) && REVISION_24_STATE_GATED_COMMANDS.has(commandId))) || !validRecord(record, EXPECTED[commandId], bundle.definition_revision);
    })
  ) {
    gap();
  }
  return bound;
}
function normalizeExactText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ');
}
function validRecord(record, expected) {
  return (
    record?.operation === expected.operation &&
    Array.isArray(record[expected.kindsField]) &&
    record[expected.kindsField].includes(expected.kind) &&
    (expected.targetSemantics == null
      ? record.target_semantics?.includes(expected.targetSemantic) === true
      : expected.targetSemantics.every((semantic) => record.target_semantics?.includes(semantic) === true)) &&
    (expected.instrumentSemantic == null || record.instrument_semantics?.includes(expected.instrumentSemantic) === true)
  );
}
function plannerOperation({ command, expected, actorRef, targetRef, evidenceRef }) {
  const operation = { op: expected.operation, actor_ref: actorRef, [expected.kindField]: expected.kind };
  if (expected.operation === 'request_movement') return { ...operation,
    target_ref: targetRef, ...(expected.routeRef == null ? {} : {
      route_ref: expected.routeRef }), description: command.label };
  if (expected.operation === 'request_container_access') return { ...operation, container_ref: targetRef };
  if (expected.operation === 'request_item_use') return { ...operation, item_ref: targetRef, target_refs: [] };
  if (expected.operation === 'request_combat') return typeof targetRef !== 'string' || targetRef.length === 0 ? null
    : { ...operation, target_refs: [targetRef], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' };
  if (expected.operation === 'emit_interaction') return { ...operation, target_actor_refs: Array.isArray(targetRef) ? targetRef : [targetRef], instrument_refs: expected.instrument === 'evidence' ? [evidenceRef] : [], content: command.label };
  if (expected.operation === 'request_activity') return expected.closedSelection === true ? null
    : { ...operation, target_refs: Array.isArray(targetRef) ? targetRef : [targetRef], description: command.label };
  if (expected.operation === 'request_discovery') return { ...operation, target_refs: Array.isArray(targetRef) ? targetRef : [targetRef], query: command.label };
  return null;
}
function combatPlannerOperations({ record, actorRef, targetRef, scopeRef }) {
  return record.intent_kinds.map((intentKind) => ({
    op: 'request_combat', actor_ref: actorRef, intent_kind: intentKind,
    target_refs: ['engage', 'control'].includes(intentKind) ? [targetRef] : [],
    protected_refs: [], scope_ref: intentKind === 'hold' ? scopeRef : null,
    destination_ref: null,
    force_limit: ['engage'].includes(intentKind) ? 'ordinary'
      : intentKind === 'control' ? 'nonlethal_if_possible' : 'avoid_harm',
    risk_posture: ['engage', 'control'].includes(intentKind)
      ? 'ordinary' : 'cautious'
  }));
}
function interactionPlannerOperations({ command, expected, record, actorRef,
  targetRef, evidenceRef }) {
  const targets = expected.targetAlternativeKey == null || !Array.isArray(targetRef)
    ? [targetRef] : targetRef;
  return targets.flatMap((target) => record[expected.kindsField].map(
    (interactionKind) => plannerOperation({
      command: expected.targetAlternativeKey == null ? command : {
        ...command,
        label: 'Обратиться к видимому собеседнику'
      },
      expected: { ...expected, kind: interactionKind }, actorRef,
      targetRef: target, evidenceRef })));
}
function matchesOperation({ operation, expected, allowedKinds, actorRef,
  targetRef, evidenceRef, commandLabel }) {
  if (operation?.op !== expected.operation || operation.actor_ref !== actorRef || !allowedKinds.includes(operation[expected.kindField])) {
    return false;
  }
  if (expected.operation === 'request_movement') {
    return operation.target_ref === targetRef;
  }
  if (expected.operation === 'request_container_access') {
    return operation.container_ref === targetRef;
  }
  if (expected.operation === 'request_item_use') {
    return operation.item_ref === targetRef;
  }
  if (expected.operation === 'request_discovery'
      && operation.query !== commandLabel) return false;
  if (expected.operation === 'request_combat') {
    const noTarget = ['hold', 'protect', 'reach', 'break_contact', 'surrender', 'cease_hostility'].includes(operation.intent_kind);
    return noTarget || (operation.target_refs?.length === 1 && operation.target_refs[0] === targetRef);
  }
  if (expected.closedSelection === true) {
    return matchesClosedSelection(operation.target_refs, targetRef);
  }
  const targetField = expected.operation === 'emit_interaction' ? 'target_actor_refs' : 'target_refs';
  if (expected.targetAlternativeKey != null && Array.isArray(targetRef)) {
    if (operation[targetField]?.length !== 1
        || !targetRef.includes(operation[targetField][0])) return false;
  } else {
    const expectedTargets = Array.isArray(targetRef) ? targetRef : [targetRef];
    if (operation[targetField]?.length !== expectedTargets.length || expectedTargets.some((ref) => operation[targetField]?.includes(ref) !== true)) return false;
  }
  if (expected.instrument === 'none') {
    return operation.instrument_refs?.length === 0;
  }
  if (expected.instrument === 'evidence') {
    return typeof evidenceRef === 'string' && operation.instrument_refs?.includes(evidenceRef) === true;
  }
  return true;
}
function validClosedSelectionOptions(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['custody', 'property', 'promise'].every(
      (dimension) =>
        Array.isArray(value[dimension]) &&
        value[dimension].length > 0 &&
        value[dimension].every((id) => typeof id === 'string' && id.length > 0) &&
        new Set(value[dimension]).size === value[dimension].length,
    )
  );
}

function matchesClosedSelection(selected, eligible) {
  if (!Array.isArray(selected) || selected.length !== 3 || new Set(selected).size !== selected.length) return false;
  return ['custody', 'property', 'promise'].every((dimension) => selected.filter((id) => eligible[dimension].includes(id)).length === 1);
}
function gap() {
  throw serverError('TRACE_TURN_STEP_BINDING_INVALID', 'The active semantic revisions require exact approved command bindings.', { status: 409 });
}
