import { serverError } from '../errors.js';
import { TRACE_PHASE9_TURN_STEP_EXPECTED } from
  './lower-dvina-trace-phase-9-turn-step-bindings.js';

const EXPECTED = Object.freeze({
  'lower_dvina_trace.inspect_wreck_in_detail': {
    operation: 'request_discovery',
    kindField: 'discovery_kind',
    kindsField: 'discovery_kinds',
    kind: 'inspect',
    runtimeKinds: ['inspect', 'search'],
    targetKey: 'wreck',
    targetSemantic: 'wreck_shore'
  },
  'lower_dvina_trace.follow_path_to_fishing_camp': {
    operation: 'request_movement',
    kindField: 'movement_kind',
    kindsField: 'movement_kinds',
    kind: 'route',
    targetKey: 'fishingCamp',
    targetSemantic: 'fishing_camp'
  },
  'lower_dvina_trace.ask_eremey_about_wreck': {
    operation: 'emit_interaction',
    kindField: 'interaction_kind',
    kindsField: 'interaction_kinds',
    kind: 'request',
    targetKey: 'eremey',
    targetSemantic: 'eremey_fisher',
    instrument: 'none'
  },
  'lower_dvina_trace.show_clue_and_seek_eremey_cooperation': {
    operation: 'emit_interaction',
    kindField: 'interaction_kind',
    kindsField: 'interaction_kinds',
    kind: 'offer',
    targetKey: 'eremey',
    targetSemantic: 'eremey_fisher',
    instrument: 'evidence',
    instrumentSemantic: 'blue_wool_evidence'
  },
  'lower_dvina_trace.follow_known_route_to_drying_shed': {
    operation: 'request_movement',
    kindField: 'movement_kind',
    kindsField: 'movement_kinds',
    kind: 'route',
    targetKey: 'dryingShed',
    targetSemantic: 'old_drying_shed'
  },
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender': {
    operation: 'emit_interaction',
    kindField: 'interaction_kind',
    kindsField: 'interaction_kinds',
    kind: 'offer',
    targetKey: 'ratsha',
    targetSemantic: 'ratsha_storehouse_helper',
    instrument: 'none'
  },
  'lower_dvina_trace.attempt_risky_first_aid_onisim': {
    operation: 'request_activity',
    kindField: 'activity_kind',
    kindsField: 'activity_kinds',
    kind: 'recover',
    targetKey: 'onisim',
    targetSemantic: 'onisim_boatman'
  },
  'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp': {
    operation: 'request_activity',
    kindField: 'activity_kind',
    kindsField: 'activity_kinds',
    kind: 'carry',
    targetKey: 'onisim',
    targetSemantic: 'onisim_boatman'
  },
  'lower_dvina_trace.rest_by_fire_and_dry_clothing': {
    minRevision: 15,
    operation: 'request_activity',
    kindField: 'activity_kind',
    kindsField: 'activity_kinds',
    kind: 'recover',
    targetKey: 'fishingCamp',
    targetSemantic: 'camp_fire'
  },
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse': {
    minRevision: 15,
    operation: 'emit_interaction',
    kindField: 'interaction_kind',
    kindsField: 'interaction_kinds',
    kind: 'request',
    targetKeys: ['eremey', 'participatingFisher', 'otherFisher'],
    targetSemantics: [
      'eremey_fisher', 'participating_fisher', 'other_fisher'
    ],
    instrument: 'none'
  },
  'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse': {
    minRevision: 16,
    operation: 'request_movement', kindField: 'movement_kind',
    kindsField: 'movement_kinds', kind: 'route',
    targetKey: 'zhdankoStorehouse', targetSemantic: 'zhdanko_storehouse'
  },
  'lower_dvina_trace.accuse_zhdanko_at_storehouse': {
    minRevision: 16,
    operation: 'emit_interaction', kindField: 'interaction_kind',
    kindsField: 'interaction_kinds', kind: 'speech',
    targetKey: 'zhdanko', targetSemantic: 'zhdanko_storehouse_controller',
    instrument: 'none'
  },
  'lower_dvina_trace.respond_in_active_combat': {
    minRevision: 16,
    operation: 'request_combat', kindField: 'intent_kind',
    kindsField: 'intent_kinds', kind: 'engage',
    targetKey: 'activeHostileNpc', targetSemantic: 'active_hostile_npc'
  },
  ...TRACE_PHASE9_TURN_STEP_EXPECTED
});

const REVISION_13_EXACT_TEXTS = Object.freeze({
  'lower_dvina_trace.follow_known_route_to_drying_shed': new Set([
    'пройти известной тропой к старой сушильне.'
  ]),
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender':
    new Set([
      'предложить ратше условную защиту и потребовать сдачи.'
    ]),
  'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp': new Set([
    'сделать носилки и отнести онисима в стан.'
  ]),
  'lower_dvina_trace.rest_by_fire_and_dry_clothing': new Set([
    'отдохнуть у огня полчаса и подсушить одежду.',
    'отдохнуть у огня полчаса и подсушить одежду'
  ])
});
const STATE_GATED_COMMANDS = new Set([
  'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse',
  'lower_dvina_trace.accuse_zhdanko_at_storehouse',
  ...Object.keys(EXPECTED).filter((id) => EXPECTED[id].minRevision === 17)
]);

export function bindLowerDvinaTraceTurnStepCommands({
  commands,
  bundle,
  targetRefs
}) {
  if (![13, 14, 15, 16, 17, 18, 19, 20, 21].includes(bundle.definition_revision)) return commands;
  const records = bundle.turn_step_bindings?.domain_bindings;
  const expectedCommands = Object.entries(EXPECTED).filter(
    ([, expected]) => (expected.minRevision ?? 13) <= bundle.definition_revision
  );
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
    if (!expected
        || (expected.minRevision ?? 13) > bundle.definition_revision) {
      return command;
    }
    const record = byCommand.get(command.command_id);
    const targetRef = expected.targetKeys == null
      ? targetRefs?.[expected.targetKey]
      : expected.targetKeys.map((key) => targetRefs?.[key]);
    const actorRef = targetRefs?.actor;
    const dynamicTargetAbsent = expected.operation === 'request_combat'
      && targetRef == null;
    if (expected.closedSelection === true && targetRef == null) return command;
    if (!validRecord(record, expected)
        || (expected.closedSelection === true
          && !validClosedSelectionOptions(targetRef))
        || (Array.isArray(targetRef)
          ? targetRef.some((ref) => typeof ref !== 'string' || ref.length === 0)
          : expected.closedSelection === true ? false
          : !dynamicTargetAbsent
            && (typeof targetRef !== 'string' || targetRef.length === 0))
        || typeof actorRef !== 'string' || actorRef.length === 0) {
      gap();
    }
    return {
      ...command,
      ...(REVISION_13_EXACT_TEXTS[command.command_id] ? {
        matches: ({ raw_text: rawText }) =>
          REVISION_13_EXACT_TEXTS[command.command_id].has(
            normalizeExactText(rawText)
          )
      } : {}),
      semantic_binding: {
        binding_id: record.binding_id,
        operation: record.operation,
        matches: ({ operation }) => matchesOperation({
          operation,
          expected,
          allowedKinds: expected.operation === 'request_activity'
            ? [expected.kind]
            : expected.runtimeKinds ?? record[expected.kindsField],
          actorRef,
          targetRef,
          evidenceRef: targetRefs?.evidence
        })
      }
    };
  });
  if ([...byCommand.entries()].some(([commandId, record]) => {
    const command = bound.find(({ command_id: id }) => id === commandId);
    if (command?.semantic_binding) return false;
    return !STATE_GATED_COMMANDS.has(commandId)
      || !validRecord(record, EXPECTED[commandId]);
  })) {
    gap();
  }
  return bound;
}
function normalizeExactText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function validRecord(record, expected) {
  return record?.operation === expected.operation
    && Array.isArray(record[expected.kindsField])
    && record[expected.kindsField].includes(expected.kind)
    && (expected.targetSemantics == null
      ? record.target_semantics?.includes(expected.targetSemantic) === true
      : expected.targetSemantics.every((semantic) =>
        record.target_semantics?.includes(semantic) === true))
    && (expected.instrumentSemantic == null
      || record.instrument_semantics?.includes(
        expected.instrumentSemantic
      ) === true);
}

function matchesOperation({ operation, expected, allowedKinds, actorRef,
  targetRef, evidenceRef }) {
  if (operation?.op !== expected.operation
      || operation.actor_ref !== actorRef
      || !allowedKinds.includes(operation[expected.kindField])) {
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
  if (expected.operation === 'request_combat') {
    const noTarget = ['hold', 'protect', 'reach', 'break_contact',
      'surrender', 'cease_hostility'].includes(operation.intent_kind);
    return noTarget || operation.target_refs?.length === 1
      && operation.target_refs[0] === targetRef;
  }
  if (expected.closedSelection === true) {
    return matchesClosedSelection(operation.target_refs, targetRef);
  }
  const targetField = expected.operation === 'emit_interaction'
    ? 'target_actor_refs'
    : 'target_refs';
  const expectedTargets = Array.isArray(targetRef) ? targetRef : [targetRef];
  if (operation[targetField]?.length !== expectedTargets.length
      || expectedTargets.some((ref) =>
    operation[targetField]?.includes(ref) !== true)) return false;
  if (expected.instrument === 'none') {
    return operation.instrument_refs?.length === 0;
  }
  if (expected.instrument === 'evidence') {
    return typeof evidenceRef === 'string'
      && operation.instrument_refs?.includes(evidenceRef) === true;
  }
  return true;
}
function validClosedSelectionOptions(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && ['custody', 'property', 'promise'].every((dimension) =>
      Array.isArray(value[dimension]) && value[dimension].length > 0
      && value[dimension].every((id) =>
        typeof id === 'string' && id.length > 0)
      && new Set(value[dimension]).size === value[dimension].length);
}

function matchesClosedSelection(selected, eligible) {
  if (!Array.isArray(selected) || selected.length !== 3
      || new Set(selected).size !== selected.length) return false;
  return ['custody', 'property', 'promise'].every((dimension) =>
    selected.filter((id) => eligible[dimension].includes(id)).length === 1);
}

function gap() {
  throw serverError(
    'TRACE_TURN_STEP_BINDING_INVALID',
    'The active semantic revisions require exact approved command bindings.',
    { status: 409 }
  );
}
