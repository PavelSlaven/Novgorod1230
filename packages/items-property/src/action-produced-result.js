import { deepFreeze } from '@rus/kernel';
import { validateActionProducedOutputClass } from
  './action-produced-output-class.js';

// Revision 21 hands the admitted subset to owner-native mechanics and common
// P16 persistence; broader result modes remain profile-gated.
const INPUT_KEYS = ['committed_context', 'profile', 'proposal'];
const CONTEXT_KEYS = [
  'schema', 'context_ref', 'state_version', 'commit_state', 'root_turn_id',
  'action_ref', 'step_index', 'actor_ref', 'entities'
];
const ENTITY_KEYS = [
  'entity_ref', 'state_version', 'lifecycle_state', 'access_state',
  'accessible_actor_ref', 'holder_ref', 'controller_ref', 'role_membership',
];
const PROFILE_KEYS = [
  'schema', 'profile_ref', 'profile_version', 'status', 'context_ref',
  'context_state_version', 'allowed_access_states',
  'allowed_identity_modes', 'allowed_origins', 'allowed_result_classes'
];
const PROPOSAL_KEYS = [
  'schema', 'request_id', 'root_turn_id', 'action_ref',
  'step_index',
  'committed_state_version', 'context_ref', 'profile_ref', 'profile_version',
  'causal_mode', 'actor_ref', 'source_refs', 'tool_refs', 'identity_mode',
  'origin', 'intended_transformation', 'result_class', 'result_descriptor',
  'material_extent', 'output_class'
];
const DESCRIPTOR_KEYS = [
  'display_name', 'physical_description', 'qualitative_facts',
  'inscription_text', 'physical_form'
];
const ACCESS_STATES = new Set([
  'immediate', 'quick', 'top_bag', 'deep_bag', 'contained'
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
const ROLES = new Set(['source', 'tool']);

export function admitActionProducedResult(value) {
  const input = snapshotBoundary(value);
  if (!input || !exact(input, INPUT_KEYS)) {
    return failed('ITEM_ACTION_PRODUCED_BOUNDARY_INVALID');
  }
  const contextError = validateContext(input.committed_context);
  if (contextError) return failed(contextError);
  const profileError = validateProfile(input.profile);
  if (profileError) return failed(profileError);
  const proposalError = validateProposal(input.proposal);
  if (proposalError) return failed(proposalError);
  const context = input.committed_context;
  const profile = input.profile;
  const proposal = input.proposal;
  if (profile.context_ref !== context.context_ref
      || profile.context_state_version !== context.state_version
      || proposal.committed_state_version !== context.state_version
      || proposal.context_ref !== context.context_ref
      || proposal.profile_ref !== profile.profile_ref
      || proposal.profile_version !== profile.profile_version
      || proposal.root_turn_id !== context.root_turn_id
      || proposal.action_ref !== context.action_ref
      || proposal.step_index !== context.step_index
      || proposal.actor_ref !== context.actor_ref) {
    return failed('ITEM_ACTION_PRODUCED_CONTEXT_PIN_MISMATCH');
  }
  if (!profile.allowed_identity_modes.includes(proposal.identity_mode)
      || proposal.origin !== null
        && !profile.allowed_origins.includes(proposal.origin)
      || !profile.allowed_result_classes.includes(proposal.result_class)) {
    return failed('ITEM_ACTION_PRODUCED_PROFILE_DENIED');
  }
  const byRef = new Map(context.entities.map((entity) => [
    entity.entity_ref, entity
  ]));
  const sources = bindEntities(proposal.source_refs, 'source', byRef,
    context, profile);
  if (!sources.pass) return sources;
  const tools = bindEntities(proposal.tool_refs, 'tool', byRef,
    context, profile);
  if (!tools.pass) return tools;
  return deepFreeze({
    pass: true,
    handoff: {
      schema: 'rus.items.action_produced_pending_handoff.v1',
      status: 'pending_code_owned_mechanics',
      request_id: proposal.request_id,
      root_turn_id: proposal.root_turn_id,
      action_ref: proposal.action_ref,
      step_index: proposal.step_index,
      profile_ref: profile.profile_ref,
      profile_version: profile.profile_version,
      context_ref: context.context_ref,
      context_state_version: context.state_version,
      actor_ref: context.actor_ref,
      identity_mode: proposal.identity_mode,
      origin: proposal.origin,
      result_class: proposal.result_class,
      source_pins: sources.pins,
      tool_pins: tools.pins,
      qualitative_result: {
        intended_transformation: proposal.intended_transformation,
        material_extent: proposal.material_extent,
        result_descriptor: proposal.result_descriptor,
        output_class: proposal.output_class
      }
    },
    errors: []
  });
}

function validateContext(value) {
  if (!exact(value, CONTEXT_KEYS)
      || value.schema !== 'rus.items.action_produced_committed_context.v1'
      || !text(value.context_ref) || !text(value.state_version)
      || value.commit_state !== 'committed' || !text(value.root_turn_id)
      || !text(value.action_ref) || !validStepIndex(value.step_index)
      || !text(value.actor_ref)
      || !Array.isArray(value.entities) || value.entities.length === 0) {
    return 'ITEM_ACTION_PRODUCED_CONTEXT_INVALID';
  }
  const refs = new Set();
  for (const entity of value.entities) {
    if (!exact(entity, ENTITY_KEYS) || !text(entity.entity_ref)
        || refs.has(entity.entity_ref) || !text(entity.state_version)
        || entity.lifecycle_state !== 'active'
        || !ACCESS_STATES.has(entity.access_state)
        || entity.accessible_actor_ref !== value.actor_ref
        || !nullableText(entity.holder_ref)
        || !nullableText(entity.controller_ref)
        || !enumArray(entity.role_membership, ROLES, false)) {
      return 'ITEM_ACTION_PRODUCED_CONTEXT_INVALID';
    }
    refs.add(entity.entity_ref);
  }
  return null;
}

function validateProfile(value) {
  if (!exact(value, PROFILE_KEYS)
      || value.schema !== 'rus.items.action_produced_admission_profile.v1'
      || !text(value.profile_ref) || !text(value.profile_version)
      || value.status !== 'committed' || !text(value.context_ref)
      || !text(value.context_state_version)
      || !enumArray(value.allowed_access_states, ACCESS_STATES, false)
      || !enumArray(value.allowed_identity_modes, IDENTITY_MODES, false)
      || !enumArray(value.allowed_origins, ORIGINS, true)
      || !enumArray(value.allowed_result_classes, RESULT_CLASSES, false)) {
    return 'ITEM_ACTION_PRODUCED_PROFILE_INVALID';
  }
  return null;
}

function validateProposal(value) {
  if (!exact(value, PROPOSAL_KEYS)
      || value.schema !== 'action_produced_result_plan_v1'
      || !text(value.request_id) || !text(value.root_turn_id)
      || !text(value.action_ref) || !validStepIndex(value.step_index)
      || !text(value.committed_state_version)
      || !text(value.context_ref) || !text(value.profile_ref)
      || !text(value.profile_version)
      || value.causal_mode !== 'action_produced' || !text(value.actor_ref)
      || !textArray(value.source_refs, false)
      || !textArray(value.tool_refs, true)
      || value.source_refs.some((ref) => value.tool_refs.includes(ref))
      || !IDENTITY_MODES.has(value.identity_mode)
      || value.origin !== null && !ORIGINS.has(value.origin)
      || !text(value.intended_transformation)
      || !validMaterialExtent(value)
      || !RESULT_CLASSES.has(value.result_class)
      || !validDescriptor(value.result_descriptor)
      || !validateActionProducedOutputClass(value.output_class,
        value.result_class, value.identity_mode)
      || !validCausalShape(value)) {
    return 'ITEM_ACTION_PRODUCED_PROPOSAL_INVALID';
  }
  return null;
}

function validMaterialExtent(value) {
  if (value.identity_mode === 'preserve_source') return value.source_refs
    .length > 1 ? ['minor', 'half', 'major', 'whole']
      .includes(value.material_extent) : value.material_extent === null;
  if (value.identity_mode !== 'independent_outputs') return value
    .material_extent === null;
  return value.result_class === 'partial_transformation'
    ? ['minor', 'half', 'major'].includes(value.material_extent)
    : value.material_extent === 'whole';
}

function validDescriptor(value) {
  return exact(value, descriptorKeys(value))
    && nullableText(value.display_name)
    && nullableText(value.physical_description)
    && textArray(value.qualitative_facts, true)
    && (!Object.hasOwn(value, 'removed_physical_fact_refs')
      || textArray(value.removed_physical_fact_refs, true))
    && nullableText(value.inscription_text)
    && (value.physical_form === null
      || ['compact', 'regular', 'long', 'bulky'].includes(
        value.physical_form))
    && (value.source_fact_delta === null
      || exact(value.source_fact_delta, [
        'physical_description', 'qualitative_facts',
        'removed_physical_fact_refs', 'physical_form'
      ]) && nullableText(value.source_fact_delta.physical_description)
        && textArray(value.source_fact_delta.qualitative_facts, true)
        && textArray(value.source_fact_delta.removed_physical_fact_refs,
          true)
        && ['compact', 'regular', 'long', 'bulky'].includes(
          value.source_fact_delta.physical_form));
}

function descriptorKeys(value) {
  const keys = [...DESCRIPTOR_KEYS, 'source_fact_delta'];
  if (value != null && Object.hasOwn(value, 'removed_physical_fact_refs')) {
    keys.push('removed_physical_fact_refs');
  }
  return keys;
}

function validCausalShape(value) {
  const descriptor = value.result_descriptor;
  if (value.identity_mode === 'preserve_source'
      && value.origin !== null) return false;
  if (value.identity_mode === 'independent_outputs'
      && (!ORIGINS.has(value.origin)
        || !text(descriptor.display_name)
        || descriptor.physical_form === null)) return false;
  const partialOutput = value.identity_mode === 'independent_outputs'
    && value.result_class === 'partial_transformation';
  if (partialOutput && value.source_refs.length !== 1) return false;
  const sourceDelta = descriptor.source_fact_delta;
  if (partialOutput !== (sourceDelta !== null)
      || sourceDelta != null && sourceDelta.physical_description === null
        && sourceDelta.qualitative_facts.length === 0
        && sourceDelta.removed_physical_fact_refs.length === 0) return false;
  if (value.identity_mode === 'no_useful_result') {
    return value.origin === null && value.result_class === 'no_useful_result'
      && descriptor.display_name === null
      && descriptor.physical_description === null
      && descriptor.qualitative_facts.length === 0
      && (descriptor.removed_physical_fact_refs?.length ?? 0) === 0
      && descriptor.inscription_text === null;
  }
  if (value.result_class === 'no_useful_result') return false;
  if (value.result_class === 'written_carrier') {
    return value.identity_mode === 'preserve_source'
      && text(descriptor.inscription_text);
  }
  return descriptor.inscription_text === null;
}

function bindEntities(refs, role, byRef, context, profile) {
  const pins = [];
  for (const ref of refs) {
    const entity = byRef.get(ref);
    if (!entity || entity.state_version !== context.state_version
        || entity.accessible_actor_ref !== context.actor_ref
        || !entity.role_membership.includes(role)
        || !profile.allowed_access_states.includes(entity.access_state)) {
      return failed('ITEM_ACTION_PRODUCED_ENTITY_NOT_ADMITTED', {
        entity_ref: ref, role
      });
    }
    pins.push({
      entity_ref: entity.entity_ref,
      state_version: entity.state_version,
      access_state: entity.access_state,
      holder_ref: entity.holder_ref,
      controller_ref: entity.controller_ref
    });
  }
  return { pass: true, pins };
}

function snapshotBoundary(value) {
  try { return copy(value, new WeakSet()); } catch { return null; }
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
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor?.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('invalid array entry');
      }
      output.push(copy(descriptor.value, seen));
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
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('invalid property');
    }
    output[key] = copy(descriptor.value, seen);
  }
  return output;
}

function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function enumArray(value, allowed, allowEmpty) {
  return textArray(value, allowEmpty)
    && value.every((entry) => allowed.has(entry));
}
function textArray(value, allowEmpty) {
  return Array.isArray(value) && (allowEmpty || value.length > 0)
    && value.every(text) && new Set(value).size === value.length;
}
function nullableText(value) { return value === null || text(value); }
function validStepIndex(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 8;
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function record(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function failed(code, details = {}) {
  return deepFreeze({
    pass: false,
    handoff: null,
    errors: [{ code, category: 'data_gap', retryable: false,
      message: code, details: structuredClone(details) }]
  });
}
