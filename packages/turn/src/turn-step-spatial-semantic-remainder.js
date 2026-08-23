// S1 uses shared discovery semantics after authored/external command bindings.
export function isSpatialSemanticRemainderInScope(input) {
  const root = record(input);
  const operation = record(root?.operation);
  const playerSafeState = record(root?.playerSafeState);
  const marker = exactMarker(playerSafeState?.spatial_semantic);
  const targets = array(operation?.target_refs);
  const discovery = operation?.op === 'request_discovery'
    && ['look', 'inspect'].includes(operation.discovery_kind)
    && targets?.length === 1 && text(targets[0]);
  return discovery && (operation.discovery_kind === 'look'
    && marker?.semantic_grounding_available === true
      && marker.position_ref === targets[0]
      || visibleLocalReference(playerSafeState?.visible_objects, targets[0]));
}

export function resolveSpatialSemanticRemainder({ resolver, execution, actor,
  committedState }) {
  return resolver(deepFreeze({
    schema: 'turn_step_spatial_semantic_remainder_request_v1',
    operation: structuredClone(execution.operation), plan: structuredClone(execution.plan),
    request: structuredClone(execution.request), actor: structuredClone(actor),
    working_projection: structuredClone(execution.working_projection),
    committed_state: structuredClone(committedState)
  }));
}

function exactMarker(value) {
  const marker = record(value);
  if (marker == null) return null;
  const required = ['semantic_grounding_available', 'position_ref'];
  const names = Object.keys(marker);
  if (names.length !== required.length || !required.every((key) => names.includes(key))) return null;
  return marker;
}
function visibleLocalReference(value, target) {
  const entries = array(value);
  return entries?.some((entry) => {
    const object = record(entry);
    if (object == null || !exactKeys(object,
      ['entity_ref', 'display_label', 'recognition', 'visible_status'])
      || !text(object.display_label) || object.recognition !== 'recognized'
      || object.visible_status !== 'замечен') return false;
    const ref = record(object.entity_ref);
    return ref != null && exactKeys(ref, ['entity_kind', 'entity_id'])
      && ref.entity_kind === 'spatial_local_reference' && ref.entity_id === target;
  }) === true;
}
function exactKeys(value, keys) {
  const names = Object.keys(value);
  return names.length === keys.length && keys.every((key) => names.includes(key));
}
function record(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value'))) return null;
  return Object.fromEntries(Object.entries(descriptors)
    .map(([key, descriptor]) => [key, descriptor.value]));
}
function array(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
  }
  return value.map((_, index) => descriptors[index].value);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
import { deepFreeze } from '@rus/kernel';
