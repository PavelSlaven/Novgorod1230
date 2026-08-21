import { deepFreeze } from '@rus/kernel';

const SNAPSHOT_SCHEMA = 'rus.items.runtime_instance_mechanics_snapshot.v1';
const ORDINARY_WORLD_SNAPSHOT_SCHEMA =
  'rus.items.runtime_instance_mechanics_snapshot.v2';
const SNAPSHOT_FIELDS = [
  'schema', 'version', 'provenance', 'mechanics'
];
const PROVENANCE_FIELDS = [
  'source_kind', 'root_turn_id', 'step_index', 'operation_ref',
  'origin_kind', 'source_refs'
];
const ORDINARY_WORLD_PROVENANCE_FIELDS = [
  'source_kind', 'causal_ref', 'request_id', 'candidate_key', 'coverage_key',
  'context_version', 'policy_ref', 'source_refs'
];
const MECHANICS_FIELDS = [
  'mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost',
  'quantity', 'container'
];
const QUANTITY_FIELDS = ['value', 'unit'];
const ORIGIN_KINDS = new Set([
  'direct_partition', 'ambient_ordinary', 'crafted',
  'existing_container_ordinary'
]);
const SOURCE_KINDS = new Set([
  'ordinary_direct_action_result', 'ordinary_world_materialization'
]);
const CARRY_FORMS = new Set(['compact', 'regular', 'long', 'bulky']);
const PHYSICAL_CONDITIONS = new Set(['serviceable', 'damaged']);

export function resolvePhysicalItemCondition(item) {
  const state = item?.state;
  if (state?.lifecycle_status === 'retired'
      || item?.condition_state === 'retired') return null;
  if (PHYSICAL_CONDITIONS.has(state?.condition_state)) {
    return state.condition_state;
  }
  if (PHYSICAL_CONDITIONS.has(item?.condition_state)) {
    return item.condition_state;
  }
  if (item?.condition_state !== 'ordinary_runtime_instance'
      || state?.damage != null || state?.damage_state != null) return null;
  const resolved = resolveInventoryMechanicsProfile({
    instance: { template_id: null,
      runtime_instance_mechanics_snapshot:
        state?.runtime_instance_mechanics_snapshot },
    profiles: []
  });
  return resolved.pass && resolved.source === 'runtime_instance_snapshot'
    ? 'serviceable' : null;
}

export function createRuntimeInstanceMechanicsSnapshot(value) {
  if (!exactObject(value, SNAPSHOT_FIELDS)
      || value.schema !== SNAPSHOT_SCHEMA
      || value.version !== 1
      || !validProvenance(value.provenance)
      || !validMechanics(value.mechanics)) {
    fail('ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

/** Validates the committed O1 snapshot without widening direct-action v1. */
export function createOrdinaryWorldRuntimeInstanceMechanicsSnapshot(value) {
  if (!exactObject(value, SNAPSHOT_FIELDS)
      || value.schema !== ORDINARY_WORLD_SNAPSHOT_SCHEMA
      || value.version !== 2
      || !validOrdinaryWorldProvenance(value.provenance)
      || !validOrdinaryWorldMechanics(value.mechanics)) {
    fail('ITEM_ORDINARY_WORLD_RUNTIME_MECHANICS_SNAPSHOT_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

export function resolveInventoryMechanicsProfile({ instance, profiles } = {}) {
  if (!plain(instance)) {
    return failed('ITEM_INVENTORY_INSTANCE_INVALID');
  }
  const templateId = exactText(instance.template_id);
  const hasTemplate = instance.template_id != null;
  const hasSnapshot = Object.hasOwn(
    instance,
    'runtime_instance_mechanics_snapshot'
  );
  if (hasTemplate) {
    if (hasSnapshot) return failed('ITEM_MECHANICS_SOURCE_CONFLICT');
    if (!templateId) {
      return failed('ITEM_INVENTORY_PROFILE_NOT_FOUND', {
        template_id: instance.template_id
      }, 'authored_profile');
    }
    const profile = profileFor(profiles, templateId);
    if (!plain(profile)) {
      return failed('ITEM_INVENTORY_PROFILE_NOT_FOUND', {
        template_id: templateId
      }, 'authored_profile');
    }
    return resolved('authored_profile', profile, null);
  }
  if (!hasSnapshot) {
    return failed('ITEM_RUNTIME_MECHANICS_SNAPSHOT_REQUIRED', {},
      'runtime_instance_snapshot');
  }
  let snapshot;
  let source;
  try {
    const value = instance.runtime_instance_mechanics_snapshot;
    if (value?.schema === ORDINARY_WORLD_SNAPSHOT_SCHEMA) {
      snapshot = createOrdinaryWorldRuntimeInstanceMechanicsSnapshot(value);
      source = 'ordinary_world_materialization_snapshot';
    } else {
      snapshot = createRuntimeInstanceMechanicsSnapshot(value);
      source = 'runtime_instance_snapshot';
    }
  } catch (error) {
    return failed(
      error?.code ?? 'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID',
      error?.details ?? {},
      'runtime_instance_snapshot'
    );
  }
  return resolved(source, {
    ...snapshot.mechanics,
    packing_bundle_size: 1
  }, snapshot);
}

function validOrdinaryWorldProvenance(value) {
  return exactObject(value, ORDINARY_WORLD_PROVENANCE_FIELDS)
    && value.source_kind === 'ordinary_world_materialization'
    && exactText(value.causal_ref)
    && exactText(value.request_id)
    && exactText(value.candidate_key)
    && exactText(value.coverage_key)
    && exactText(value.context_version)
    && exactText(value.policy_ref)
    && validCanonicalRefs(value.source_refs);
}

function validProvenance(value) {
  return exactObject(value, PROVENANCE_FIELDS)
    && SOURCE_KINDS.has(value.source_kind)
    && exactText(value.root_turn_id)
    && Number.isInteger(value.step_index)
    && value.step_index >= 1
    && value.step_index <= 8
    && exactText(value.operation_ref)
    && ORIGIN_KINDS.has(value.origin_kind)
    && validRefs(value.source_refs);
}


function validMechanics(value) {
  return exactObject(value, MECHANICS_FIELDS)
    && Number.isSafeInteger(value.mass_grams)
    && value.mass_grams >= 0
    && [0, 1, 2].includes(value.external_hand_cost)
    && CARRY_FORMS.has(value.carry_form)
    && Number.isSafeInteger(value.packing_slot_cost)
    && value.packing_slot_cost >= 0
    && validQuantity(value.quantity)
    && value.container === null;
}

function validOrdinaryWorldMechanics(value) {
  return validMechanics(value)
    && value.mass_grams >= 1
    && value.quantity != null
    && Number.isSafeInteger(value.quantity.value)
    && value.quantity.value >= 1
    && value.quantity.unit === 'item';
}

function validQuantity(value) {
  return value === null
    || exactObject(value, QUANTITY_FIELDS)
      && typeof value.value === 'number'
      && Number.isFinite(value.value)
      && value.value > 0
      && Boolean(exactText(value.unit));
}

function validRefs(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => Boolean(exactText(entry)))
    && new Set(value).size === value.length;
}

function validCanonicalRefs(value) {
  return validRefs(value)
    && value.every((entry, index) => index === 0
      || value[index - 1].localeCompare(entry) < 0);
}

function resolved(source, profile, snapshot) {
  return deepFreeze({
    pass: true,
    source,
    profile: structuredClone(profile),
    snapshot,
    errors: []
  });
}

function failed(code, details = {}, source = null) {
  return deepFreeze({
    pass: false,
    source,
    profile: null,
    snapshot: null,
    errors: [issue(code, details)]
  });
}

function issue(code, details = {}) {
  return deepFreeze({
    code,
    category: 'data_gap',
    retryable: false,
    message: code,
    details: structuredClone(details)
  });
}

function profileFor(collection, templateId) {
  return Array.isArray(collection)
    ? collection.find((value) => value?.template_id === templateId) ?? null
    : collection?.[templateId] ?? null;
}

function exactObject(value, fields) {
  return plain(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : '';
}


function fail(code, details = {}) {
  throw Object.assign(new TypeError(code), {
    code,
    details: deepFreeze(structuredClone(details))
  });
}
