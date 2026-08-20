import { deepFreeze, sha256 } from '@rus/kernel';

// Revision 21 uses this exact contract through the optional A1 remainder;
// broader result modes remain closed unless an active profile admits them.
const REQUEST_SCHEMA = 'action_produced_result_request_v1';
const PLAN_SCHEMA = 'action_produced_result_plan_v1';
const REQUEST_KEYS = [
  'schema', 'request_id', 'root_turn_id', 'action_ref',
  'step_index',
  'committed_state_version', 'context_ref', 'profile_ref', 'profile_version',
  'causal_mode', 'actor_ref', 'source_refs', 'tool_refs',
  'intended_transformation', 'output_class'
];
const PLAN_KEYS = [
  'schema', 'request_id', 'root_turn_id', 'action_ref',
  'step_index',
  'committed_state_version', 'context_ref', 'profile_ref', 'profile_version',
  'causal_mode', 'actor_ref', 'source_refs', 'tool_refs', 'identity_mode',
  'origin', 'intended_transformation', 'result_class', 'result_descriptor',
  'output_class'
];
const DESCRIPTOR_KEYS = [
  'display_name', 'physical_description', 'qualitative_facts',
  'inscription_text'
];
const WEAPON_CLASSES = new Set([
  'improvised_puncture_light', 'improvised_impact_light',
  'improvised_cutting_light', 'improvised_two_hand_heavy'
]);
const IDENTITY_MODES = new Set([
  'preserve_source', 'independent_outputs', 'no_useful_result'
]);
const ORIGINS = new Set(['direct_partition', 'crafted']);
const RESULT_CLASSES = new Set([
  'ordinary_physical_result', 'partial_transformation',
  'nonworking_construction', 'waste', 'written_carrier',
  'no_useful_result'
]);
const OUTPUT_CLASSES = new Set([
  'ordinary_mundane', 'weapon_capable', 'money_like_token',
  'written_carrier'
]);

export function validateActionProducedResultRequest(value) {
  const snapshot = snapshotBoundary(value);
  if (snapshot == null) return invalid('request must be strict plain JSON data');
  const errors = validateRequestSnapshot(snapshot);
  return validation(errors, snapshot);
}

export function validateActionProducedResultPlan(value, options) {
  const snapshot = snapshotBoundary(value);
  if (snapshot == null) return invalid('plan must be strict plain JSON data');
  const errors = validatePlanSnapshot(snapshot);
  const planOptions = snapshotPlanOptions(options);
  if (!planOptions.ok) {
    errors.push('plan options must contain only an optional own-data request');
  } else if (planOptions.hasRequest) {
    const requestValidation = validateActionProducedResultRequest(
      planOptions.request);
    if (!requestValidation.ok) {
      errors.push('request echo source is invalid');
    } else {
      validateEcho(snapshot, requestValidation.value, errors);
    }
  }
  return validation(errors, snapshot);
}

export function requireActionProducedResultRequest(value) {
  return requireValid(validateActionProducedResultRequest(value),
    'TURN_ACTION_PRODUCED_REQUEST_INVALID');
}

export function requireActionProducedResultPlan(value, options) {
  return requireValid(validateActionProducedResultPlan(value, options),
    'TURN_ACTION_PRODUCED_PLAN_INVALID');
}

export function createActionProducedTraceActionRef({ root_turn_id,
  step_index, approved_plan } = {}) {
  if (!exactTextValue(root_turn_id) || !Number.isSafeInteger(step_index)
      || step_index < 1 || step_index > 8 || !record(approved_plan)) {
    throw Object.assign(new TypeError('TURN_ACTION_PRODUCED_IDENTITY_INVALID'),
      { code: 'TURN_ACTION_PRODUCED_IDENTITY_INVALID' });
  }
  return `turn_step_action:${sha256({
    schema: 'action_production_trace_action_identity_v1',
    root_turn_id, step_index, approved_plan
  }).slice(0, 32)}`;
}

function validateRequestSnapshot(value) {
  const errors = [];
  exact(value, REQUEST_KEYS, 'request', errors);
  equal(value.schema, REQUEST_SCHEMA, 'request.schema', errors);
  exactText(value.request_id, 'request.request_id', errors);
  exactText(value.root_turn_id, 'request.root_turn_id', errors);
  exactText(value.action_ref, 'request.action_ref', errors);
  stepIndex(value.step_index, 'request.step_index', errors);
  exactText(value.committed_state_version,
    'request.committed_state_version', errors);
  exactText(value.context_ref, 'request.context_ref', errors);
  exactText(value.profile_ref, 'request.profile_ref', errors);
  exactText(value.profile_version, 'request.profile_version', errors);
  equal(value.causal_mode, 'action_produced',
    'request.causal_mode', errors);
  exactText(value.actor_ref, 'request.actor_ref', errors);
  refs(value.source_refs, 'request.source_refs', errors, false);
  refs(value.tool_refs, 'request.tool_refs', errors, true);
  disjoint(value.source_refs, value.tool_refs, 'request refs', errors);
  exactText(value.intended_transformation,
    'request.intended_transformation', errors);
  nullableMember(value.output_class, OUTPUT_CLASSES,
    'request.output_class', errors);
  return errors;
}

function validatePlanSnapshot(value) {
  const errors = [];
  exact(value, PLAN_KEYS, 'plan', errors);
  equal(value.schema, PLAN_SCHEMA, 'plan.schema', errors);
  exactText(value.request_id, 'plan.request_id', errors);
  exactText(value.root_turn_id, 'plan.root_turn_id', errors);
  exactText(value.action_ref, 'plan.action_ref', errors);
  stepIndex(value.step_index, 'plan.step_index', errors);
  exactText(value.committed_state_version,
    'plan.committed_state_version', errors);
  exactText(value.context_ref, 'plan.context_ref', errors);
  exactText(value.profile_ref, 'plan.profile_ref', errors);
  exactText(value.profile_version, 'plan.profile_version', errors);
  equal(value.causal_mode, 'action_produced', 'plan.causal_mode', errors);
  exactText(value.actor_ref, 'plan.actor_ref', errors);
  refs(value.source_refs, 'plan.source_refs', errors, false);
  refs(value.tool_refs, 'plan.tool_refs', errors, true);
  disjoint(value.source_refs, value.tool_refs, 'plan refs', errors);
  member(value.identity_mode, IDENTITY_MODES, 'plan.identity_mode', errors);
  nullableMember(value.origin, ORIGINS, 'plan.origin', errors);
  exactText(value.intended_transformation,
    'plan.intended_transformation', errors);
  member(value.result_class, RESULT_CLASSES, 'plan.result_class', errors);
  descriptor(value.result_descriptor, errors);
  nullableMember(value.output_class, OUTPUT_CLASSES,
    'plan.output_class', errors);
  validateCausalShape(value, errors);
  return errors;
}

function descriptor(value, errors) {
  if (!record(value)) {
    errors.push('plan.result_descriptor must be an object');
    return;
  }
  exact(value, descriptorKeys(value), 'plan.result_descriptor', errors);
  nullableText(value.display_name,
    'plan.result_descriptor.display_name', errors);
  nullableText(value.physical_description,
    'plan.result_descriptor.physical_description', errors);
  refs(value.qualitative_facts,
    'plan.result_descriptor.qualitative_facts', errors, true);
  nullableText(value.inscription_text,
    'plan.result_descriptor.inscription_text', errors);
  nullableMember(value.weapon_qualitative_class ?? null, WEAPON_CLASSES,
    'plan.result_descriptor.weapon_qualitative_class', errors);
}

function validateCausalShape(value, errors) {
  const descriptorValue = value.result_descriptor;
  if (!record(descriptorValue)) return;
  if (value.identity_mode === 'preserve_source') {
    if (value.source_refs?.length !== 1) {
      errors.push('preserve_source requires exactly one source ref');
    }
    if (value.origin !== null) {
      errors.push('preserve_source must not replace the source origin');
    }
  }
  if (value.identity_mode === 'independent_outputs'
      && !ORIGINS.has(value.origin)) {
    errors.push('independent_outputs requires a produced origin');
  }
  if (value.identity_mode === 'independent_outputs'
      && !exactTextValue(descriptorValue.display_name)) {
    errors.push('independent_outputs requires a safe display name');
  }
  if (value.identity_mode === 'no_useful_result') {
    if (value.origin !== null
        || value.result_class !== 'no_useful_result'
        || descriptorValue.display_name !== null
        || descriptorValue.physical_description !== null
        || descriptorValue.qualitative_facts?.length !== 0
        || descriptorValue.inscription_text !== null
        || value.output_class !== null) {
      errors.push('no_useful_result must not propose a physical result');
    }
  } else if (value.result_class === 'no_useful_result') {
    errors.push('no_useful_result class requires matching identity mode');
  }
  if (value.result_class === 'written_carrier') {
    if (value.identity_mode !== 'preserve_source'
        || !exactTextValue(descriptorValue.inscription_text)
        || value.output_class !== 'written_carrier') {
      errors.push('written_carrier requires one preserved carrier and text');
    }
  } else if (descriptorValue.inscription_text !== null) {
    errors.push('inscription text is allowed only for written_carrier');
  } else if (value.identity_mode !== 'no_useful_result'
      && (value.output_class === null
        || value.output_class === 'written_carrier')) {
    errors.push('physical results require a compatible output class');
  }
  if (value.output_class === 'money_like_token'
      && value.identity_mode !== 'independent_outputs') {
    errors.push('money_like_token must be a new non-authoritative output');
  }
  const weaponClass = descriptorValue.weapon_qualitative_class ?? null;
  if ((value.output_class === 'weapon_capable') !== (weaponClass !== null)) {
    errors.push('weapon_capable requires one closed combat class');
  }
}

function descriptorKeys(value) {
  return Object.hasOwn(value, 'weapon_qualitative_class')
    ? [...DESCRIPTOR_KEYS, 'weapon_qualitative_class'] : DESCRIPTOR_KEYS;
}

function validateEcho(plan, request, errors) {
  for (const key of [
    'request_id', 'root_turn_id', 'action_ref', 'step_index',
    'committed_state_version',
    'context_ref', 'profile_ref', 'profile_version', 'causal_mode',
    'actor_ref', 'source_refs', 'tool_refs', 'intended_transformation'
  ]) {
    if (!same(plan[key], request[key])) {
      errors.push(`plan.${key} must exactly echo request.${key}`);
    }
  }
  if (plan.identity_mode === 'no_useful_result') {
    if (plan.output_class !== null) {
      errors.push('no-useful-result plan must clear requested output_class');
    }
  } else if (!same(plan.output_class, request.output_class)) {
    errors.push('plan.output_class must exactly echo request.output_class');
  }
}

function snapshotBoundary(value) {
  try {
    return copy(value, new WeakSet());
  } catch {
    return null;
  }
}

function snapshotPlanOptions(value) {
  if (value === undefined) return { ok: true, hasRequest: false };
  const snapshot = snapshotBoundary(value);
  if (!record(snapshot)) return { ok: false };
  const keys = Object.keys(snapshot);
  if (keys.length === 0) return { ok: true, hasRequest: false };
  if (keys.length !== 1 || keys[0] !== 'request') return { ok: false };
  return { ok: true, hasRequest: true, request: snapshot.request };
}

function copy(value, seen) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new TypeError('unsupported value');
  if (seen.has(value)) throw new TypeError('cycle or alias');
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype
        || Object.getOwnPropertySymbols(value).length !== 0
        || Object.getOwnPropertyNames(value).length !== value.length + 1) {
      throw new TypeError('invalid array');
    }
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptorValue = Object.getOwnPropertyDescriptor(
        value, String(index));
      if (descriptorValue?.enumerable !== true
          || !Object.hasOwn(descriptorValue, 'value')) {
        throw new TypeError('invalid array entry');
      }
      output.push(copy(descriptorValue.value, seen));
    }
    return output;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null
      || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError('invalid object');
  }
  const output = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptorValue = Object.getOwnPropertyDescriptor(value, key);
    if (descriptorValue?.enumerable !== true
        || !Object.hasOwn(descriptorValue, 'value')) {
      throw new TypeError('invalid property');
    }
    output[key] = copy(descriptorValue.value, seen);
  }
  return output;
}

function exact(value, keys, path, errors) {
  if (!record(value) || Object.keys(value).length !== keys.length
      || !keys.every((key) => Object.hasOwn(value, key))) {
    errors.push(`${path} must contain only exact v1 fields`);
  }
}
function refs(value, path, errors, allowEmpty) {
  if (!Array.isArray(value) || !allowEmpty && value.length === 0
      || value.some((entry) => !exactTextValue(entry))
      || new Set(value).size !== value.length) {
    errors.push(`${path} must contain unique canonical text values`);
  }
}
function disjoint(left, right, path, errors) {
  if (Array.isArray(left) && Array.isArray(right)
      && left.some((ref) => right.includes(ref))) {
    errors.push(`${path} must assign disjoint source and tool roles`);
  }
}
function exactText(value, path, errors) {
  if (!exactTextValue(value)) errors.push(`${path} must be canonical text`);
}
function stepIndex(value, path, errors) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 8) {
    errors.push(`${path} must be a safe integer from 1 to 8`);
  }
}
function nullableText(value, path, errors) {
  if (value !== null && !exactTextValue(value)) {
    errors.push(`${path} must be null or canonical text`);
  }
}
function exactTextValue(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function equal(value, expected, path, errors) {
  if (value !== expected) errors.push(`${path} must equal ${expected}`);
}
function member(value, set, path, errors) {
  if (!set.has(value)) errors.push(`${path} is invalid`);
}
function nullableMember(value, set, path, errors) {
  if (value !== null && !set.has(value)) errors.push(`${path} is invalid`);
}
function record(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function invalid(message) { return deepFreeze({ ok: false, errors: [message] }); }
function validation(errors, value) {
  return errors.length === 0
    ? deepFreeze({ ok: true, errors: [], value })
    : deepFreeze({ ok: false, errors });
}
function requireValid(result, code) {
  if (!result.ok) {
    throw Object.assign(new TypeError(code), { code, details: {
      errors: [...result.errors]
    } });
  }
  return result.value;
}
