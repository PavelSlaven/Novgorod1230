import {
  assertAllowedKeys,
  compact,
  finite,
  plain,
  projectionError,
  text,
  textArray
} from './lower-dvina-trace-player-safe-json.js';

const VISIBLE_CONTEXT_KEYS = new Set([
  'version', 'schema', 'visible_scene', 'visible_changes', 'sensory_details',
  'visible_npc', 'visible_objects', 'known_context', 'uncertainties'
]);

export function projectVisibleContext(value, {
  strict = false, path = 'visible_context'
} = {}) {
  if (!plain(value)) return undefined;
  if (strict) assertAllowedKeys(value, VISIBLE_CONTEXT_KEYS, path, invalidCode());
  return compact({
    version: finite(value.version), schema: text(value.schema),
    visible_scene: text(value.visible_scene),
    visible_changes: textArray(value.visible_changes, {
      strict, path: `${path}.visible_changes`
    }),
    sensory_details: textArray(value.sensory_details, {
      strict, path: `${path}.sensory_details`
    }),
    visible_npc: projectVisibleRefs(value.visible_npc, strict,
      `${path}.visible_npc`),
    visible_objects: projectVisibleRefs(value.visible_objects, strict,
      `${path}.visible_objects`),
    known_context: textArray(value.known_context, {
      strict, path: `${path}.known_context`
    }),
    uncertainties: textArray(value.uncertainties, {
      strict, path: `${path}.uncertainties`
    })
  });
}

function projectVisibleRefs(records, strict, path) {
  if (!Array.isArray(records)) return undefined;
  return records.map((record) => {
    if (typeof record === 'string') return record;
    if (!plain(record)) {
      if (strict) throw projectionError(invalidCode(), `${path} is invalid.`);
      return undefined;
    }
    const allowed = new Set([
      'entity_ref', 'display_label', 'recognition', 'visible_status',
      'observable_cues'
    ]);
    if (strict) assertAllowedKeys(record, allowed, `${path}[]`, invalidCode());
    return compact({
      entity_ref: projectEntityRef(record.entity_ref, strict, path),
      display_label: text(record.display_label),
      recognition: text(record.recognition),
      visible_status: text(record.visible_status),
      observable_cues: projectObservableCues(record.observable_cues, strict,
        `${path}[].observable_cues`)
    });
  }).filter(Boolean);
}

function projectObservableCues(value, strict, path) {
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'identity', 'equipment', 'outward_presentation', 'ordinary_remainder'
  ]);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  return compact({
    identity: projectObservableIdentity(value.identity, strict,
      `${path}.identity`),
    equipment: projectObservableEquipment(value.equipment, strict,
      `${path}.equipment`),
    outward_presentation: projectTextRecord(value.outward_presentation,
      ['emotion', 'intensity', 'gaze', 'body_pose', 'head_pose', 'background'],
      strict, `${path}.outward_presentation`),
    ordinary_remainder: projectTextRecord(value.ordinary_remainder,
      ['ordinary_descriptor', 'ordinary_activity'], strict,
      `${path}.ordinary_remainder`)
  });
}

function projectObservableIdentity(value, strict, path) {
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'display_name', 'sex_category', 'age_category', 'appearance'
  ]);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  const appearance = value.appearance;
  return compact({
    display_name: text(value.display_name),
    sex_category: text(value.sex_category),
    age_category: text(value.age_category),
    appearance: !plain(appearance) ? undefined : compact({
      build: text(appearance.build),
      skin_tone: text(appearance.skin_tone),
      face_shape: text(appearance.face_shape),
      hair: projectTextRecord(appearance.hair,
        ['color', 'length', 'style', 'facial_hair'], strict,
        `${path}.appearance.hair`),
      eyes: projectTextRecord(appearance.eyes, ['color'], strict,
        `${path}.appearance.eyes`)
    })
  });
}

function projectObservableEquipment(value, strict, path) {
  if (!Array.isArray(value)) return undefined;
  return value.map((item, index) => {
    if (!plain(item)) return undefined;
    const itemPath = `${path}[${index}]`;
    const allowed = new Set([
      'physical_position', 'equipment_slot_category_id',
      'visual_profile_snapshot'
    ]);
    if (strict) assertAllowedKeys(item, allowed, itemPath, invalidCode());
    return compact({
      physical_position: text(item.physical_position),
      equipment_slot_category_id: text(item.equipment_slot_category_id),
      visual_profile_snapshot: projectVisualProfile(
        item.visual_profile_snapshot, strict,
        `${itemPath}.visual_profile_snapshot`)
    });
  }).filter(Boolean);
}

function projectVisualProfile(value, strict, path) {
  if (!plain(value)) return undefined;
  const textKeys = [
    'schema', 'equipment_slot', 'neckline', 'sleeve_form', 'outer_form',
    'visible_fabric', 'trim', 'main_visible_color',
    'secondary_visible_color', 'headwear_kind'
  ];
  const allowed = new Set([...textKeys, 'version']);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  return compact({
    ...Object.fromEntries(textKeys.map((key) => [key, text(value[key])])),
    version: finite(value.version)
  });
}

function projectTextRecord(value, keys, strict, path) {
  if (!plain(value)) return undefined;
  const allowed = new Set(keys);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  return compact(Object.fromEntries(keys.map((key) => [key, text(value[key])])));
}

function projectEntityRef(value, strict, path) {
  if (!plain(value)) return undefined;
  const allowed = new Set(['entity_kind', 'entity_id']);
  if (strict) {
    assertAllowedKeys(value, allowed, `${path}.entity_ref`, invalidCode());
  }
  return compact({
    entity_kind: text(value.entity_kind), entity_id: text(value.entity_id)
  });
}

function invalidCode() {
  return 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID';
}
