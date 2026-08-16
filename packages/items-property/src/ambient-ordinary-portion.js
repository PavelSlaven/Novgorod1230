import { deepFreeze } from '@rus/kernel';
import { createRuntimeInstanceMechanicsSnapshot } from './runtime-instance-mechanics.js';
import { createHash } from 'node:crypto';

const INPUT = ['operation_identity', 'request'];
const OPERATION = ['root_turn_id', 'step_index', 'operation_ref'];
const CONTEXT = ['schema', 'version', 'context_pin_ref', 'scope_ref', 'ambient_sources', 'finite_portion_profiles', 'property_bases', 'destinations'];
const LOADED = ['context_pin_ref', 'context_digest', 'snapshot'];
const SOURCE = ['source_ref', 'state', 'basis_kind', 'scope_ref', 'environment_ref', 'source_class', 'property_basis_ref', 'finite_portion_profile_refs', 'topology_claims', 'hazard_claims'];
const PROFILE = ['profile_ref', 'state', 'source_class', 'semantic_type', 'display_name', 'material_class', 'quantity_unit', 'min_quantity', 'max_quantity', 'min_mass_grams', 'max_mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost'];
const PROPERTY = ['property_basis_ref', 'state', 'scope_ref', 'environment_ref'];
const DESTINATION = ['destination_ref', 'state', 'kind', 'target_ref', 'scope_ref'];
const REQUEST = ['context_pin_ref', 'source_ref', 'portion_profile_ref', 'quantity', 'mass_grams', 'destination_ref'];
const QUANTITY = ['value', 'unit'];

/**
 * Admits a finite direct-action portion from a server-owned committed snapshot.
 * Callers must not build that snapshot from player/LLM input; persistence must
 * revalidate all pins and committed refs before writing. This owner does not
 * create an item for the whole environment or decrement its source.
 */
export function createAmbientOrdinaryPortionAdmission({ loadCommittedContext } = {}) {
  if (typeof loadCommittedContext !== 'function') throw new TypeError('ITEM_AMBIENT_ORDINARY_CONTEXT_LOADER_REQUIRED');
  return async function admitAmbientOrdinaryPortion(input = {}) {
  const copied = copyBoundary(input), args = copied && record(copied, INPUT);
  const operation = args && record(args.operation_identity, OPERATION);
  const rawRequest = args && record(args.request, REQUEST);
  const quantity = rawRequest && record(rawRequest.quantity, QUANTITY);
  if (!operation || !rawRequest || !validOperation(operation) || !validRequestedPortion(rawRequest, quantity)) return failed('ITEM_AMBIENT_ORDINARY_PORTION_INVALID');
  let loaded;
  const loaderOperation = deepFreeze(structuredClone(operation));
  try { loaded = copyBoundary(await loadCommittedContext(loaderOperation)); }
  catch { return failed('ITEM_AMBIENT_ORDINARY_CONTEXT_LOAD_FAILED'); }
  const port = loaded && record(loaded, LOADED);
  const context = port && record(port.snapshot, CONTEXT);
  if (!port || !context || !digest(port.snapshot) || !hex(port.context_digest)
      || digest(port.snapshot) !== port.context_digest || !validContext(context)) return failed('ITEM_AMBIENT_ORDINARY_CONTEXT_INVALID');
  const selectedRequest = selectCommittedRequest(rawRequest, context);
  if (!selectedRequest || !validRequest(selectedRequest, record(selectedRequest.quantity, QUANTITY))
      || port.context_pin_ref !== selectedRequest.context_pin_ref
      || context.context_pin_ref !== selectedRequest.context_pin_ref) return failed('ITEM_AMBIENT_ORDINARY_CONTEXT_INVALID');
  const request = selectedRequest;
  const source = one(context.ambient_sources, (value) => value.source_ref === request.source_ref);
  if (!source || source.state !== 'committed' || source.basis_kind !== 'ambient_ordinary_source'
      || !sameScope(source.scope_ref, context.scope_ref) || !exactText(source.source_class)
      || !empty(source.topology_claims) || !empty(source.hazard_claims)) return failed('ITEM_AMBIENT_ORDINARY_PORTION_SOURCE_INVALID');
  const profile = one(context.finite_portion_profiles, (value) => value.profile_ref === request.portion_profile_ref);
  const property = one(context.property_bases, (value) => value.property_basis_ref === source.property_basis_ref);
  const destination = one(context.destinations, (value) => value.destination_ref === request.destination_ref);
  if (!profile || !property || !destination || !validSelection(context, source, profile, property, destination, request, quantity)) return failed('ITEM_AMBIENT_ORDINARY_PORTION_NOT_APPROVED');
  const mechanics = { mass_grams: request.mass_grams, external_hand_cost: profile.external_hand_cost, carry_form: profile.carry_form, packing_slot_cost: profile.packing_slot_cost, quantity: structuredClone(quantity), container: null };
  const sourceRefs = canonicalRefs([context.context_pin_ref, port.context_digest, source.source_ref, source.environment_ref, property.property_basis_ref, profile.profile_ref, destination.destination_ref]);
  let snapshot;
  try { snapshot = createRuntimeInstanceMechanicsSnapshot({ schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1, provenance: { source_kind: 'ordinary_direct_action_result', root_turn_id: operation.root_turn_id, step_index: operation.step_index, operation_ref: operation.operation_ref, origin_kind: 'ambient_ordinary', source_refs: sourceRefs }, mechanics }); } catch { return failed('ITEM_AMBIENT_ORDINARY_PORTION_INVALID'); }
  return deepFreeze({ pass: true, proposal: deepFreeze({ schema: 'ambient_ordinary_portion_proposal_v2', context_pin_ref: context.context_pin_ref, context_digest: port.context_digest, scope_ref: structuredClone(context.scope_ref), source_ref: source.source_ref, environment_ref: source.environment_ref, source_class: source.source_class, source_provenance: { basis_kind: source.basis_kind, property_basis_ref: property.property_basis_ref }, portion_profile_ref: profile.profile_ref, semantic_descriptor: { semantic_type: profile.semantic_type, name: profile.display_name }, quantity: structuredClone(quantity), mass_grams: request.mass_grams, placement: placement(destination) }), runtime_instance_mechanics_snapshot: snapshot, errors: [] });
  };
}

export function ambientOrdinaryCommittedContextDigest(snapshot) { const copied = copyBoundary(snapshot); return copied && validContext(record(copied, CONTEXT)) ? digest(copied) : null; }

function validContext(value) { return value && value.schema === 'rus.items.ambient_ordinary_committed_context.v1' && value.version === 1 && exactText(value.context_pin_ref) && validScope(value.scope_ref) && validRecords(value.ambient_sources, SOURCE, validSource) && validRecords(value.finite_portion_profiles, PROFILE, validProfile) && validRecords(value.property_bases, PROPERTY, validProperty) && validRecords(value.destinations, DESTINATION, validDestination); }
function validOperation(value) { return exactText(value.root_turn_id) && Number.isInteger(value.step_index) && value.step_index >= 1 && value.step_index <= 8 && exactText(value.operation_ref); }
function validRequestedPortion(value, quantity) { return ['committed', value.context_pin_ref]
  .includes(value.context_pin_ref) && ['committed', value.source_ref].includes(value.source_ref)
  && ['committed', value.portion_profile_ref].includes(value.portion_profile_ref)
  && validQuantity(quantity) && positiveMass(value.mass_grams) && exactText(value.destination_ref); }
function validRequest(value, quantity) { return exactText(value.context_pin_ref) && exactText(value.source_ref) && exactText(value.portion_profile_ref) && validQuantity(quantity) && positiveMass(value.mass_grams) && exactText(value.destination_ref); }
function selectCommittedRequest(request, context) {
  const source = request.source_ref === 'committed'
    ? one(context.ambient_sources, (value) => sameScope(value.scope_ref, context.scope_ref))
    : { source_ref: request.source_ref };
  const profile = source && request.portion_profile_ref === 'committed'
    ? one(context.finite_portion_profiles, (value) => source.finite_portion_profile_refs?.includes(value.profile_ref))
    : { profile_ref: request.portion_profile_ref };
  if (!source || !profile) return null;
  return { ...request,
    context_pin_ref: request.context_pin_ref === 'committed' ? context.context_pin_ref : request.context_pin_ref,
    source_ref: source.source_ref, portion_profile_ref: profile.profile_ref };
}
function validSource(value) { return exactText(value.source_ref) && value.state === 'committed' && value.basis_kind === 'ambient_ordinary_source' && validScope(value.scope_ref) && exactText(value.environment_ref) && exactText(value.source_class) && exactText(value.property_basis_ref) && refs(value.finite_portion_profile_refs) && empty(value.topology_claims) && empty(value.hazard_claims); }
function validProfile(value) { return exactText(value.profile_ref) && value.state === 'committed' && exactText(value.source_class) && exactText(value.semantic_type) && exactText(value.display_name) && value.material_class === 'ordinary' && exactText(value.quantity_unit) && positive(value.min_quantity) && positive(value.max_quantity) && value.min_quantity <= value.max_quantity && positiveMass(value.min_mass_grams) && positiveMass(value.max_mass_grams) && value.min_mass_grams <= value.max_mass_grams && [0, 1, 2].includes(value.external_hand_cost) && ['compact', 'regular', 'long', 'bulky'].includes(value.carry_form) && Number.isSafeInteger(value.packing_slot_cost) && value.packing_slot_cost >= 0; }
function validProperty(value) { return exactText(value.property_basis_ref) && value.state === 'committed' && validScope(value.scope_ref) && exactText(value.environment_ref); }
function validDestination(value) { return exactText(value.destination_ref) && value.state === 'committed' && ['holder', 'existing_container', 'placement'].includes(value.kind) && exactText(value.target_ref) && validScope(value.scope_ref); }
function validSelection(context, source, profile, property, destination, request, quantity) { return source.source_class === profile.source_class && source.finite_portion_profile_refs.includes(profile.profile_ref) && property.state === 'committed' && sameScope(property.scope_ref, context.scope_ref) && property.environment_ref === source.environment_ref && destination.state === 'committed' && sameScope(destination.scope_ref, context.scope_ref) && quantity.unit === profile.quantity_unit && quantity.value >= profile.min_quantity && quantity.value <= profile.max_quantity && request.mass_grams >= profile.min_mass_grams && request.mass_grams <= profile.max_mass_grams; }
function placement(value) { return value.kind === 'holder' ? { holder_ref: value.target_ref } : value.kind === 'existing_container' ? { container_ref: value.target_ref } : { placement_ref: value.target_ref }; }
function one(values, match) { const found = values.filter(match); return found.length === 1 ? found[0] : null; }
function validRecords(values, fields, valid) { return Array.isArray(values) && values.length > 0 && values.every((value) => { const result = record(value, fields); return result && valid(result); }); }
function validScope(value) { const scope = record(value, ['entity_kind', 'entity_id']); return scope && exactText(scope.entity_kind) && exactText(scope.entity_id); }
function sameScope(left, right) { const a = record(left, ['entity_kind', 'entity_id']), b = record(right, ['entity_kind', 'entity_id']); return a && b && a.entity_kind === b.entity_kind && a.entity_id === b.entity_id; }
function validQuantity(value) { return value && positive(value.value) && exactText(value.unit); }
function positive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function positiveMass(value) { return Number.isSafeInteger(value) && value >= 1; }
function empty(value) { return Array.isArray(value) && value.length === 0; }
function refs(value) { return Array.isArray(value) && value.length > 0 && value.every(exactText) && new Set(value).size === value.length; }
function canonicalRefs(values) { return [...new Set(values)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); }
function record(value, fields) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) return null; const names = Object.getOwnPropertyNames(value); if (names.length !== fields.length || fields.some((field) => !names.includes(field))) return null; const result = {}; for (const field of fields) { const descriptor = Object.getOwnPropertyDescriptor(value, field); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null; result[field] = descriptor.value; } return result; }
function copyBoundary(value) { const seen = new WeakSet(); function visit(entry) { if (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number' && Number.isFinite(entry)) return entry; if (!entry || typeof entry !== 'object' || seen.has(entry) || Object.getOwnPropertySymbols(entry).length) return null; const array = Array.isArray(entry); if (array ? Object.getPrototypeOf(entry) !== Array.prototype : Object.getPrototypeOf(entry) !== Object.prototype) return null; seen.add(entry); const names = Object.getOwnPropertyNames(entry); if (array && (names.length !== entry.length + 1 || !names.includes('length'))) return null; const output = array ? [] : {}; for (const key of names) { if (array && key === 'length') continue; const descriptor = Object.getOwnPropertyDescriptor(entry, key); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null; const child = visit(descriptor.value); if (child === null && descriptor.value !== null) return null; if (array) { if (key !== String(output.length)) return null; output.push(child); } else output[key] = child; } return output; } return visit(value); }
function exactText(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : ''; }
function hex(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function digest(value) { return createHash('sha256').update('rus.items.ambient_ordinary_committed_context.v1\u0000' + canonical(value)).digest('hex'); }
function canonical(value) { if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; }
function failed(code) { return deepFreeze({ pass: false, proposal: null, runtime_instance_mechanics_snapshot: null, errors: [{ code, category: 'data_gap', retryable: false, message: code, details: {} }] }); }
