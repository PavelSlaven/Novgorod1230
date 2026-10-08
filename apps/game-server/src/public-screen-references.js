import { serverError } from './errors.js';

const VISIBLE_ENTITY_KINDS = new Set([
  'npc', 'item', 'scene_movement_edge', 'g4_directional_exit',
  'g5_site_connection', 'spatial_local_reference', 'ambient_ordinary_capability'
]);
const REFERENCE_FIELDS = new Set(['entity_ref', 'speaker_ref', 'subject_ref']);
const text = (value) => typeof value === 'string' && value.length > 0
  && value.trim() === value;

/** Only the API copy gets screen-local keys; saved mechanics refs stay private. */
export function projectPublicScreenReferences(value) {
  const output = structuredClone(value);
  const keys = new Map();
  const internalIds = new Set();

  function project(record, path = '$', field = '') {
    if (record == null || typeof record !== 'object') {
      if (REFERENCE_FIELDS.has(field)) invalid(path);
      return record;
    }
    if (Array.isArray(record)) {
      if (REFERENCE_FIELDS.has(field)) invalid(path);
      return record.map((entry, index) => project(entry, `${path}[${index}]`));
    }
    if (REFERENCE_FIELDS.has(field) || Object.hasOwn(record, 'entity_id')) {
      if (Object.keys(record).length !== 2
          || !VISIBLE_ENTITY_KINDS.has(record.entity_kind)
          || !text(record.entity_id)) invalid(path);
      const identity = JSON.stringify([record.entity_kind, record.entity_id]);
      if (!keys.has(identity)) keys.set(identity, `e${keys.size + 1}`);
      internalIds.add(record.entity_id);
      return { entity_kind: record.entity_kind, public_key: keys.get(identity) };
    }
    // JSONB may reorder object properties. Arrays retain the saved screen order.
    const priority = (key) => key === 'screen' ? 0 : key === 'visible_context' ? 1 : 2;
    for (const key of Object.keys(record).sort((left, right) =>
      priority(left) - priority(right) || (left < right ? -1 : left > right ? 1 : 0))) {
      if (key === 'instance_id') invalid(`${path}.${key}`);
      record[key] = project(record[key], `${path}.${key}`, key);
    }
    return record;
  }

  const wrappedScreen = output != null && typeof output === 'object'
    && !Array.isArray(output) && Object.hasOwn(output, 'screen');
  const projected = project(wrappedScreen ? output.screen : output);
  function checkValues(record, path = '$', field = '') {
    if (typeof record === 'string') {
      if (!['entity_kind', 'public_key'].includes(field)
          && internalIds.has(record)) invalid(path);
    } else if (record && typeof record === 'object') {
      for (const [key, entry] of Object.entries(record)) {
        checkValues(entry, `${path}.${key}`, key);
      }
    }
  }
  checkValues(projected);
  if (wrappedScreen) {
    output.screen = projected;
    return output;
  }
  return projected;
}

function invalid(path) {
  throw serverError('PUBLIC_PAYLOAD_ENTITY_REFERENCE_INVALID',
    'Public screen requires a supported entity reference.', {
      status: 500, details: { field_path: path }
    });
}
