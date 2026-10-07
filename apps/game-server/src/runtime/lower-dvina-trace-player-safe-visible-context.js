import {
  assertAllowedKeys,
  compact,
  finite,
  plain,
  projectionError,
  text,
  textArray,
  optionalVisibleText
} from './lower-dvina-trace-player-safe-json.js';
import { playerSafeOrdinalLabel } from '../public-boundary.js';
import { resolveVisibleItemLabel } from './lower-dvina-trace-visible-item-label.js';
import { serverError } from '../errors.js';

const VISIBLE_CONTEXT_KEYS = new Set([
  'version', 'schema', 'visible_scene', 'visible_changes', 'sensory_details',
  'visible_npc', 'visible_objects', 'known_context', 'uncertainties'
]);
const AMBIENT_ORDINARY_CAPABILITY = 'ambient_ordinary_capability';
const AMBIENT_PORTION_BOUND_KEYS = new Set([
  'quantity_unit', 'min_quantity', 'max_quantity', 'min_mass_grams',
  'max_mass_grams'
]);

export function projectPhase2VisibleContext(payload) {
  const visibleContext = projectVisibleContext({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: [],
    sensory_details: structuredClone(payload.sensory_details),
    visible_npc: structuredClone(payload.visible_npcs),
    visible_objects: structuredClone(payload.visible_objects),
    known_context: structuredClone(payload.known_context),
    uncertainties: structuredClone(payload.uncertainties)
  }, { path: 'visible_context' });
  return {
    ...visibleContext,
    visible_changes: Array.isArray(payload.perceived_changes)
      ? payload.perceived_changes.map((entry, index) => typeof entry === 'string'
        ? optionalVisibleText(entry, { path: `visible_context.visible_changes[${index}]`,
          code: invalidCode() })
        : structuredClone(entry)).filter((entry) => entry != null) : [],
    allowed_tensions: [],
    do_not_imply: [],
    ...(payload.current_light_phase == null ? {} : {
      current_light_phase: payload.current_light_phase })
  };
}

export function projectVisibleContextForPlayerPackage(value, {
  onLabelGapsOmitted = null, requireScene = false
} = {}) {
  const playerSafeContext = projectVisibleContext(value, {
    path: 'visible_context'
  });
  if (requireScene && (typeof playerSafeContext?.visible_scene !== 'string'
    || !playerSafeContext.visible_scene.trim())) {
    throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
      'A safe player-visible scene is required.', {
        status: 409,
        details: { reason: 'player_safe_visible_scene_required' }
      });
  }
  const visibleObjects = Array.isArray(value?.visible_objects)
    ? value.visible_objects : null;
  const projectedVisibleObjects = Array.isArray(playerSafeContext?.visible_objects)
    ? playerSafeContext.visible_objects : null;
  const itemLabelGap = (item) => item?.entity_ref?.entity_kind === 'item'
    && item?.label_gap?.code === 'player_safe_item_label_required';
  const omittedCount = projectedVisibleObjects == null ? 0
    : projectedVisibleObjects.filter(itemLabelGap).length;
  const safeObjects = visibleObjects?.flatMap((item, index) => {
    const projectedItem = projectVisibleRefs([item], false,
      `visible_context.visible_objects[${index}]`)[0];
    if (itemLabelGap(projectedItem)) return [];
    if (item?.label_gap?.code === 'player_safe_item_label_required') {
      return [structuredClone(item)];
    }
    return projectedItem == null ? [] : [projectedItem];
  });
  if (omittedCount > 0 && typeof onLabelGapsOmitted === 'function') {
    try { onLabelGapsOmitted(omittedCount); }
    catch { /* Diagnostics must not affect visible package construction. */ }
  }
  const safeContext = { ...value, ...playerSafeContext,
    ...(safeObjects == null ? {} : { visible_objects: safeObjects }) };
  if (!Object.hasOwn(playerSafeContext ?? {}, 'visible_scene')) {
    delete safeContext.visible_scene;
  }
  return {
    visible_context: safeContext,
    omitted_label_gap_count: omittedCount
  };
}

export function projectVisibleContext(value, {
  strict = false, path = 'visible_context'
} = {}) {
  if (!plain(value)) return undefined;
  if (strict) assertAllowedKeys(value, VISIBLE_CONTEXT_KEYS, path, invalidCode());
  const visibleScene = optionalVisibleText(value.visible_scene, {
    path: `${path}.visible_scene`, code: invalidCode()
  });
  return compact({
    version: finite(value.version), schema: text(value.schema),
    visible_scene: visibleScene,
    visible_changes: textArray(value.visible_changes, {
      strict, path: `${path}.visible_changes`, visible: true,
      code: invalidCode()
    }),
    sensory_details: textArray(value.sensory_details, {
      strict, path: `${path}.sensory_details`, visible: true,
      code: invalidCode()
    }),
    visible_npc: projectVisibleRefs(value.visible_npc, strict,
      `${path}.visible_npc`),
    visible_objects: projectVisibleRefs(value.visible_objects, strict,
      `${path}.visible_objects`),
    known_context: textArray(value.known_context, {
      strict, path: `${path}.known_context`, visible: true,
      code: invalidCode()
    }),
    uncertainties: textArray(value.uncertainties, {
      strict, path: `${path}.uncertainties`, visible: true,
      code: invalidCode()
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
    const entityRef = projectEntityRef(record.entity_ref, strict, path);
    const isAmbientCapability = entityRef?.entity_kind
      === AMBIENT_ORDINARY_CAPABILITY;
    const allowed = new Set([
      'entity_ref', 'display_label', 'label_gap', 'recognition', 'visible_status',
      'observable_cues', ...(isAmbientCapability ? ['ambient_portion_bounds'] : [])
    ]);
    if (strict) assertAllowedKeys(record, allowed, `${path}[]`, invalidCode());
    const labelGap = projectItemLabelGap(record.label_gap, entityRef, strict,
      `${path}[].label_gap`);
    const resolvedItemLabel = entityRef?.entity_kind === 'item'
      ? resolveVisibleItemLabel({ name: record.display_label }) : null;
    const effectiveLabelGap = labelGap ?? (resolvedItemLabel?.kind === 'gap'
      ? { code: resolvedItemLabel.code } : undefined);
    return compact({
      entity_ref: entityRef,
      display_label: effectiveLabelGap ? undefined : optionalVisibleText(
        playerSafeOrdinalLabel(record.display_label, entityRef?.entity_kind), {
        path: `${path}[].display_label`, label: true, code: invalidCode()
      }) ?? safeGenericLabel(entityRef?.entity_kind),
      label_gap: effectiveLabelGap,
      recognition: text(record.recognition),
      visible_status: optionalVisibleText(record.visible_status, {
        path: `${path}[].visible_status`, statusField: true,
        code: invalidCode()
      }),
      observable_cues: projectObservableCues(record.observable_cues, strict,
        `${path}[].observable_cues`),
      ambient_portion_bounds: isAmbientCapability
        ? projectAmbientPortionBounds(record.ambient_portion_bounds, strict,
          `${path}[].ambient_portion_bounds`) : undefined
    });
  }).filter(Boolean);
}

function projectItemLabelGap(value, entityRef, strict, path) {
  if (value === undefined) return undefined;
  const valid = entityRef?.entity_kind === 'item'
    && plain(value)
    && Object.keys(value).length === 1
    && value.code === 'player_safe_item_label_required';
  if (!valid && strict) {
    throw projectionError(invalidCode(), `${path} is invalid.`);
  }
  return valid ? { code: value.code } : undefined;
}

function projectAmbientPortionBounds(value, strict, path) {
  if (!plain(value)) {
    if (strict) throw projectionError(invalidCode(), `${path} is invalid.`);
    return undefined;
  }
  if (strict) assertAllowedKeys(value, AMBIENT_PORTION_BOUND_KEYS, path,
    invalidCode());
  const projected = compact({
    quantity_unit: text(value.quantity_unit),
    min_quantity: finite(value.min_quantity),
    max_quantity: finite(value.max_quantity),
    min_mass_grams: finite(value.min_mass_grams),
    max_mass_grams: finite(value.max_mass_grams)
  });
  const valid = ['min_quantity', 'max_quantity', 'min_mass_grams',
    'max_mass_grams'].every((key) => typeof value[key] === 'number'
      && Number.isFinite(value[key]))
    && Object.keys(projected).length === 5
    && projected.quantity_unit.trim()
    && projected.min_quantity > 0
    && projected.max_quantity >= projected.min_quantity
    && Number.isSafeInteger(projected.min_mass_grams)
    && projected.min_mass_grams > 0
    && Number.isSafeInteger(projected.max_mass_grams)
    && projected.max_mass_grams >= projected.min_mass_grams;
  if (!valid && strict) {
    throw projectionError(invalidCode(), `${path} is invalid.`);
  }
  return valid ? projected : undefined;
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
      `${path}.ordinary_remainder`, true)
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
    display_name: optionalVisibleText(value.display_name, {
      path: `${path}.display_name`, code: invalidCode()
    }),
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
    'garment_kind', 'equipment_slot', 'neckline', 'sleeve_form', 'outer_form',
    'visible_fabric', 'trim', 'main_visible_color',
    'secondary_visible_color', 'headwear_kind'
  ];
  const allowed = new Set([...textKeys, 'schema', 'version']);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  return compact({
    schema: text(value.schema),
    ...Object.fromEntries(textKeys.map((key) => [key, text(value[key])])),
    version: finite(value.version)
  });
}

function projectTextRecord(value, keys, strict, path, visible = false) {
  if (!plain(value)) return undefined;
  const allowed = new Set(keys);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  const projected = compact(Object.fromEntries(keys.map((key) => [key, visible
    ? optionalVisibleText(value[key], { path: `${path}.${key}`,
      code: invalidCode() })
    : text(value[key])])));
  return Object.keys(projected).length ? projected : undefined;
}

function safeGenericLabel(entityKind) {
  if (entityKind === 'npc') return 'человек';
  if (entityKind === 'item') return 'предмет';
  if (entityKind === 'scene_movement_edge'
      || entityKind === 'g5_site_connection') return 'переход';
  return undefined;
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
