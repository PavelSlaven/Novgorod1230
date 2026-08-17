import { DIRECT_OPS, DOMAIN_OPS } from './constants.js';
import {
  COMBAT_FORCE_LIMITS,
  COMBAT_INTENT_KINDS,
  COMBAT_RISK_POSTURES
} from '@rus/contracts/combat-v1';
import {
  add,
  constant,
  enumValue,
  integer,
  knownRef,
  mutableRef,
  newTemp,
  plain,
  refs,
  requiredText,
  strict
} from './validation.js';

export function validateOperations(value, path, errors, trace, {
  directOnly
}) {
  if (!Array.isArray(value)) {
    add(errors, path, 'type', 'must be an array');
    return [];
  }
  const kinds = [];
  value.forEach((operation, index) => {
    const operationPath = `${path}[${index}]`;
    if (!plain(operation)) {
      add(errors, operationPath, 'type', 'must be an object');
      return;
    }
    const kind = operation.op;
    kinds.push(kind);
    if (!DIRECT_OPS.has(kind) && !DOMAIN_OPS.has(kind)) {
      add(errors, `${operationPath}.op`, 'enum',
        'is not an allowed operation');
      return;
    }
    if (directOnly && !DIRECT_OPS.has(kind)) {
      add(errors, `${operationPath}.op`, 'resolution',
        'check outcomes permit only direct operations');
    }
    validateOperation(operation, operationPath, errors, trace);
  });
  return kinds;
}

function validateOperation(operation, path, errors, trace) {
  const validators = {
    create_entity: validateCreateEntity,
    move_entity: validateMoveEntity,
    change_entity_facts: validateChangeFacts,
    set_entity_mechanics: validateSetMechanics,
    retire_entity: validateRetire,
    apply_body_event: validateBodyEvent,
    request_discovery: validateDiscovery,
    request_container_access: validateContainerAccess,
    request_movement: validateMovement,
    request_item_use: validateItemUse,
    request_activity: validateRequestedActivity,
    emit_interaction: validateInteraction,
    request_combat: validateCombatRequest,
    request_world_process: validateWorldProcess
  };
  validators[operation.op]?.(operation, path, errors, trace);
}

function validateWorldProcess(value, path, errors, trace) {
  if (!strict(value, path, [
    'op', 'actor_ref', 'process_action', 'process_ref', 'process_kind',
    'source_refs', 'target_refs', 'description'
  ], errors)) return;
  constant(value.op, 'request_world_process', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  enumValue(value.process_action, ['start', 'affect'],
    `${path}.process_action`, errors);
  if (value.process_action === 'start') {
    constant(value.process_ref, null, `${path}.process_ref`, errors);
  } else {
    knownRef(value.process_ref, `${path}.process_ref`, errors, trace);
  }
  constant(value.process_kind, 'fire', `${path}.process_kind`, errors);
  refs(value.source_refs, `${path}.source_refs`, errors, trace, { min: 1 });
  refs(value.target_refs, `${path}.target_refs`, errors, trace,
    value.process_action === 'start' ? { min: 1 } : { allowEmpty: true });
  if (value.process_action === 'affect' && Array.isArray(value.target_refs)) {
    constant(value.target_refs.length, 0, `${path}.target_refs.length`, errors);
  }
  requiredText(value.description, `${path}.description`, errors);
}

function validateCreateEntity(value, path, errors, trace) {
  if (!strict(value, path, [
    'op', 'temp_ref', 'semantic_type', 'name', 'origin', 'facts', 'mechanics',
    'placement'
  ], errors)) return;
  constant(value.op, 'create_entity', `${path}.op`, errors);
  newTemp(value.temp_ref, `${path}.temp_ref`, errors, trace);
  requiredText(value.semantic_type, `${path}.semantic_type`, errors);
  requiredText(value.name, `${path}.name`, errors);
  if (strict(value.origin, `${path}.origin`, ['kind', 'source_refs'], errors)) {
    enumValue(value.origin.kind,
      ['direct_partition', 'ambient_ordinary', 'crafted'],
      `${path}.origin.kind`, errors);
    refs(value.origin.source_refs, `${path}.origin.source_refs`, errors, trace,
      { min: 1 });
  }
  validateFacts(value.facts, `${path}.facts`, errors, trace);
  validateMechanics(value.mechanics, `${path}.mechanics`, errors);
  validatePlacement(value.placement, `${path}.placement`, errors, trace,
    value.temp_ref);
  if (typeof value.temp_ref === 'string' && value.temp_ref.trim()) {
    trace.knownRefs.add(value.temp_ref);
    assignPlacement(value.temp_ref, value.placement,
      `${path}.placement`, errors, trace);
  }
}

function validateMoveEntity(value, path, errors, trace) {
  if (!strict(value, path, ['op', 'entity_ref', 'placement'], errors)) return;
  constant(value.op, 'move_entity', `${path}.op`, errors);
  knownRef(value.entity_ref, `${path}.entity_ref`, errors, trace);
  validatePlacement(value.placement, `${path}.placement`, errors, trace,
    value.entity_ref);
  assignPlacement(value.entity_ref, value.placement,
    `${path}.placement`, errors, trace);
}

function validateChangeFacts(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'entity_ref', 'remove_fact_refs', 'add_facts'], errors)) return;
  constant(value.op, 'change_entity_facts', `${path}.op`, errors);
  mutableRef(value.entity_ref, `${path}.entity_ref`, errors, trace);
  refs(value.remove_fact_refs, `${path}.remove_fact_refs`, errors, trace,
    { allowEmpty: true });
  validateFacts(value.add_facts, `${path}.add_facts`, errors, trace);
}

function validateSetMechanics(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'entity_ref', 'mechanics', 'reason'], errors)) return;
  constant(value.op, 'set_entity_mechanics', `${path}.op`, errors);
  mutableRef(value.entity_ref, `${path}.entity_ref`, errors, trace);
  validateMechanics(value.mechanics, `${path}.mechanics`, errors);
  requiredText(value.reason, `${path}.reason`, errors);
}

function validateRetire(value, path, errors, trace) {
  if (!strict(value, path, ['op', 'entity_ref', 'reason'], errors)) return;
  constant(value.op, 'retire_entity', `${path}.op`, errors);
  mutableRef(value.entity_ref, `${path}.entity_ref`, errors, trace);
  requiredText(value.reason, `${path}.reason`, errors);
  if (typeof value.entity_ref === 'string') trace.retired.add(value.entity_ref);
}

function validateBodyEvent(value, path, errors, trace) {
  if (!strict(value, path, [
    'op', 'actor_ref', 'mechanism', 'severity', 'body_part_ref', 'description'
  ], errors)) return;
  constant(value.op, 'apply_body_event', `${path}.op`, errors);
  mutableRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  enumValue(value.mechanism, [
    'impact', 'cut', 'puncture', 'burn', 'strain', 'crush', 'fall', 'cold',
    'heat', 'suffocation', 'poison', 'other'
  ], `${path}.mechanism`, errors);
  enumValue(value.severity,
    ['minor', 'moderate', 'severe', 'critical'],
    `${path}.severity`, errors);
  if (value.body_part_ref !== null) {
    knownRef(value.body_part_ref, `${path}.body_part_ref`, errors, trace);
  }
  requiredText(value.description, `${path}.description`, errors);
}

function validateDiscovery(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'actor_ref', 'discovery_kind', 'target_refs', 'query'],
    errors)) return;
  constant(value.op, 'request_discovery', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  enumValue(value.discovery_kind,
    ['look', 'inspect', 'search', 'listen', 'remember', 'dig'],
    `${path}.discovery_kind`, errors);
  refs(value.target_refs, `${path}.target_refs`, errors, trace, { min: 1 });
  requiredText(value.query, `${path}.query`, errors);
}

function validateContainerAccess(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'actor_ref', 'container_ref', 'access_kind'], errors)) return;
  constant(value.op, 'request_container_access', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  knownRef(value.container_ref, `${path}.container_ref`, errors, trace);
  enumValue(value.access_kind,
    ['open', 'close', 'unlock', 'force', 'open_and_view'],
    `${path}.access_kind`, errors);
}

function validateMovement(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'actor_ref', 'target_ref', 'movement_kind'], errors)) return;
  constant(value.op, 'request_movement', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  knownRef(value.target_ref, `${path}.target_ref`, errors, trace);
  enumValue(value.movement_kind, ['local', 'route', 'long_course'],
    `${path}.movement_kind`, errors);
}

function validateItemUse(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'actor_ref', 'item_ref', 'use_kind', 'target_refs'],
    errors)) return;
  constant(value.op, 'request_item_use', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  knownRef(value.item_ref, `${path}.item_ref`, errors, trace);
  enumValue(value.use_kind,
    ['consume', 'apply', 'operate', 'equip', 'unequip', 'other'],
    `${path}.use_kind`, errors);
  refs(value.target_refs, `${path}.target_refs`, errors, trace,
    { allowEmpty: true });
}

function validateRequestedActivity(value, path, errors, trace) {
  if (!strict(value, path,
    ['op', 'actor_ref', 'activity_kind', 'target_refs', 'description'],
    errors)) return;
  constant(value.op, 'request_activity', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  enumValue(value.activity_kind,
    ['wait', 'sleep', 'work', 'recover', 'carry', 'other'],
    `${path}.activity_kind`, errors);
  refs(value.target_refs, `${path}.target_refs`, errors, trace,
    { allowEmpty: true });
  requiredText(value.description, `${path}.description`, errors);
}

function validateInteraction(value, path, errors, trace) {
  if (!strict(value, path, [
    'op', 'actor_ref', 'target_actor_refs', 'interaction_kind', 'content',
    'instrument_refs'
  ], errors)) return;
  constant(value.op, 'emit_interaction', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  refs(value.target_actor_refs, `${path}.target_actor_refs`, errors, trace,
    { min: 1 });
  enumValue(value.interaction_kind,
    ['speech', 'gesture', 'offer', 'request', 'threat', 'attack', 'aid', 'other'],
    `${path}.interaction_kind`, errors);
  requiredText(value.content, `${path}.content`, errors);
  refs(value.instrument_refs, `${path}.instrument_refs`, errors, trace,
    { allowEmpty: true });
}

function validateCombatRequest(value, path, errors, trace) {
  if (!strict(value, path, [
    'op', 'actor_ref', 'intent_kind', 'target_refs', 'protected_refs',
    'scope_ref', 'destination_ref', 'force_limit', 'risk_posture'
  ], errors)) return;
  constant(value.op, 'request_combat', `${path}.op`, errors);
  knownRef(value.actor_ref, `${path}.actor_ref`, errors, trace);
  enumValue(value.intent_kind, COMBAT_INTENT_KINDS,
    `${path}.intent_kind`, errors);
  refs(value.target_refs, `${path}.target_refs`, errors, trace,
    { allowEmpty: true });
  refs(value.protected_refs, `${path}.protected_refs`, errors, trace,
    { allowEmpty: true });
  validateNullableKnownRef(value.scope_ref, `${path}.scope_ref`, errors, trace);
  validateNullableKnownRef(
    value.destination_ref,
    `${path}.destination_ref`,
    errors,
    trace
  );
  enumValue(value.force_limit, COMBAT_FORCE_LIMITS,
    `${path}.force_limit`, errors);
  enumValue(value.risk_posture, COMBAT_RISK_POSTURES,
    `${path}.risk_posture`, errors);
  validateCombatIntentShape(value, path, errors);
}

function validateNullableKnownRef(value, path, errors, trace) {
  if (value !== null) knownRef(value, path, errors, trace);
}

function validateCombatIntentShape(value, path, errors) {
  const targets = value.target_refs?.length ?? 0;
  const protectedCount = value.protected_refs?.length ?? 0;
  const kind = value.intent_kind;
  let valid = false;
  if (['engage', 'control'].includes(kind)) {
    valid = targets === 1 && protectedCount === 0
      && value.scope_ref === null && value.destination_ref === null;
  } else if (kind === 'protect') {
    valid = targets === 0 && value.destination_ref === null
      && (protectedCount > 0 || value.scope_ref !== null);
  } else if (kind === 'hold') {
    valid = targets === 0 && protectedCount === 0
      && value.scope_ref !== null && value.destination_ref === null;
  } else if (kind === 'reach') {
    valid = targets === 0 && protectedCount === 0
      && value.scope_ref === null && value.destination_ref !== null;
  } else if (kind === 'break_contact') {
    valid = targets === 0 && protectedCount === 0 && value.scope_ref === null;
  } else if (['surrender', 'cease_hostility'].includes(kind)) {
    valid = targets === 0 && protectedCount === 0
      && value.scope_ref === null && value.destination_ref === null;
  }
  if (!valid) {
    add(errors, path, 'combat_intent_shape',
      'refs must match the selected combat intent kind');
  }
}

function validateFacts(value, path, errors, trace) {
  if (!Array.isArray(value)) {
    add(errors, path, 'type', 'must be an array');
    return;
  }
  value.forEach((fact, index) => {
    const factPath = `${path}[${index}]`;
    if (!strict(fact, factPath, ['temp_ref', 'text'], errors)) return;
    newTemp(fact.temp_ref, `${factPath}.temp_ref`, errors, trace);
    requiredText(fact.text, `${factPath}.text`, errors);
    if (typeof fact.temp_ref === 'string' && fact.temp_ref.trim()) {
      trace.knownRefs.add(fact.temp_ref);
    }
  });
}

function validateMechanics(value, path, errors) {
  if (!strict(value, path, [
    'mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost',
    'quantity', 'container'
  ], errors)) return;
  integer(value.mass_grams, 0, `${path}.mass_grams`, errors);
  enumValue(value.external_hand_cost, [0, 1, 2],
    `${path}.external_hand_cost`, errors);
  enumValue(value.carry_form, ['compact', 'regular', 'long', 'bulky'],
    `${path}.carry_form`, errors);
  integer(value.packing_slot_cost, 0, `${path}.packing_slot_cost`, errors);
  if (value.quantity !== null
      && strict(value.quantity, `${path}.quantity`, ['value', 'unit'], errors)) {
    if (typeof value.quantity.value !== 'number'
        || !Number.isFinite(value.quantity.value)
        || value.quantity.value <= 0) {
      add(errors, `${path}.quantity.value`, 'range',
        'must be a finite number > 0');
    }
    requiredText(value.quantity.unit, `${path}.quantity.unit`, errors);
  }
  constant(value.container, null, `${path}.container`, errors);
}

function validatePlacement(value, path, errors, trace, entityRef) {
  if (!strict(value, path, ['relation', 'target_ref'], errors)) return;
  enumValue(value.relation,
    ['held_by', 'worn_by', 'inside', 'located_at', 'attached_to'],
    `${path}.relation`, errors);
  knownRef(value.target_ref, `${path}.target_ref`, errors, trace);
  if (entityRef && value.target_ref === entityRef) {
    add(errors, `${path}.target_ref`, 'cycle',
      'entity cannot contain or attach to itself');
  }
}

function assignPlacement(entityRef, placement, path, errors, trace) {
  if (typeof entityRef !== 'string' || !plain(placement)) return;
  if (trace.placements.has(entityRef)) {
    add(errors, path, 'duplicate_placement',
      'entity has more than one final placement');
  }
  trace.placements.set(entityRef, placement);
  if (placement.relation !== 'inside'
      || typeof placement.target_ref !== 'string') return;
  trace.inside.set(entityRef, placement.target_ref);
  let cursor = placement.target_ref;
  const visited = new Set([entityRef]);
  while (trace.inside.has(cursor)) {
    if (visited.has(cursor)) {
      add(errors, path, 'container_cycle',
        'placement creates a container cycle');
      return;
    }
    visited.add(cursor);
    cursor = trace.inside.get(cursor);
  }
  if (visited.has(cursor)) {
    add(errors, path, 'container_cycle',
      'placement creates a container cycle');
  }
}
