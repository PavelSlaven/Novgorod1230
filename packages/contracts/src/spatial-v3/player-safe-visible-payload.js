const issue = (code, field, message) => ({ code, field, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const stableId = (value) => typeof value === 'string' && value.trim().length > 0;

const hiddenPayloadKey = /(?:^|_)(?:hidden|future|unperceived|motive|motives|raw_options?|trace|traces|roll|rolls|dc|state_patch|state_patches)(?:_|$)/i;
export const PLAYER_SAFE_VISIBLE_PAYLOAD_KEYS = Object.freeze([
  'schema',
  'perceived_scene',
  'perceived_changes',
  'sensory_details',
  'visible_npcs',
  'visible_objects',
  'known_context',
  'uncertainties',
  'hypotheses',
  'player_safe_interruption',
  'allowed_action_affordances'
]);
const playerSafeVisiblePayloadKeySet = new Set(PLAYER_SAFE_VISIBLE_PAYLOAD_KEYS);
const playerSafeEntityKeys = Object.freeze([
  'entity_ref', 'display_label', 'recognition', 'visible_status',
  'observable_cues'
]);
const playerSafeAffordanceKeys = Object.freeze(['action_id', 'label', 'command_kind']);
const playerSafeRecognition = new Set(['unrecognized', 'recognized', 'known']);

function findHiddenPayloadPaths(value, path = 'visible_payload', seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return [];
  if (seen.has(value)) return [path];
  seen.add(value);
  const entries = Array.isArray(value) ? value.map((entry, index) => [String(index), entry]) : Object.entries(value);
  const paths = entries.flatMap(([key, entry]) => {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    return [...(hiddenPayloadKey.test(key) ? [childPath] : []), ...findHiddenPayloadPaths(entry, childPath, seen)];
  });
  seen.delete(value);
  return paths;
}

function validatePlayerSafeStringList(value, path) {
  if (!Array.isArray(value)) return [issue('generated_schema_mismatch', path, `${path} must be an array of non-empty player-safe strings.`)];
  return value.flatMap((entry, index) => stableId(entry)
    ? []
    : [issue('generated_schema_mismatch', `${path}[${index}]`, `${path}[${index}] must be a non-empty player-safe string.`)]);
}

function validatePlayerSafeEntityList(value, path, observableCues = false) {
  if (!Array.isArray(value)) return [issue('generated_schema_mismatch', path, `${path} must be an array of player-safe entity summaries.`)];
  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(entry)) return [issue('generated_schema_mismatch', entryPath, `${entryPath} must be a player-safe entity summary.`)];
    const errors = Object.keys(entry)
      .filter((key) => !playerSafeEntityKeys.includes(key))
      .map((key) => issue('hidden_information_leak', `${entryPath}.${key}`, `${entryPath} forbids non-player-safe field ${key}.`));
    if (!isObject(entry.entity_ref) || !hasOnly(entry.entity_ref, ['entity_kind', 'entity_id']) || !stableId(entry.entity_ref.entity_kind) || !stableId(entry.entity_ref.entity_id)) {
      errors.push(issue('generated_schema_mismatch', `${entryPath}.entity_ref`, `${entryPath}.entity_ref requires exact entity_kind and entity_id.`));
    }
    if (!stableId(entry.display_label)) errors.push(issue('generated_schema_mismatch', `${entryPath}.display_label`, `${entryPath}.display_label must be a non-empty player-safe label.`));
    if (!playerSafeRecognition.has(entry.recognition)) errors.push(issue('generated_schema_mismatch', `${entryPath}.recognition`, `${entryPath}.recognition must be unrecognized, recognized or known.`));
    if (entry.visible_status != null && !stableId(entry.visible_status)) errors.push(issue('generated_schema_mismatch', `${entryPath}.visible_status`, `${entryPath}.visible_status must be a non-empty player-safe string when present.`));
    if (entry.observable_cues != null) {
      if (observableCues) errors.push(...validateObservableCues(
        entry.observable_cues, `${entryPath}.observable_cues`));
      else errors.push(issue('hidden_information_leak',
        `${entryPath}.observable_cues`,
        `${entryPath} forbids person cues on a visible object.`));
    }
    return errors;
  });
}

function validateObservableCues(value, path) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be a player-safe observable cue object.`)];
  const errors = unexpected(value,
    ['identity', 'equipment', 'outward_presentation'], path);
  if (value.identity != null) errors.push(...validateObservableIdentity(
    value.identity, `${path}.identity`));
  if (value.equipment != null) errors.push(...validateObservableEquipment(
    value.equipment, `${path}.equipment`));
  if (value.outward_presentation != null) errors.push(...validateEnumRecord(
    value.outward_presentation, `${path}.outward_presentation`, {
      emotion: PORTRAIT_SPEC_V1_ENUMS.expression.emotion,
      intensity: PORTRAIT_SPEC_V1_ENUMS.expression.intensity,
      gaze: PORTRAIT_SPEC_V1_ENUMS.eyes.gaze,
      body_pose: PORTRAIT_SPEC_V1_ENUMS.pose.body,
      head_pose: PORTRAIT_SPEC_V1_ENUMS.pose.head,
      background: PORTRAIT_SPEC_V1_ENUMS.background
    }));
  return errors;
}

function validateObservableIdentity(value, path) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be a player-safe identity cue.`)];
  const errors = unexpected(value,
    ['display_name', 'sex_category', 'age_category', 'appearance'], path);
  optionalText(value, 'display_name', path, errors);
  optionalEnum(value, 'sex_category', PORTRAIT_SPEC_V1_ENUMS.person.sex,
    path, errors);
  optionalEnum(value, 'age_category', PORTRAIT_SPEC_V1_ENUMS.person.age,
    path, errors);
  if (value.appearance != null) errors.push(...validateAppearance(
    value.appearance, `${path}.appearance`));
  return errors;
}

function validateAppearance(value, path) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be a player-safe appearance cue.`)];
  const errors = unexpected(value,
    ['build', 'skin_tone', 'face_shape', 'hair', 'eyes'], path);
  for (const [key, values] of Object.entries({
    build: PORTRAIT_SPEC_V1_ENUMS.person.build,
    skin_tone: PORTRAIT_SPEC_V1_ENUMS.person.skin_tone,
    face_shape: PORTRAIT_SPEC_V1_ENUMS.person.face_shape
  })) optionalEnum(value, key, values, path, errors);
  if (value.hair != null) errors.push(...validateEnumRecord(value.hair,
    `${path}.hair`, PORTRAIT_SPEC_V1_ENUMS.hair));
  if (value.eyes != null) errors.push(...validateEnumRecord(value.eyes,
    `${path}.eyes`, { color: PORTRAIT_SPEC_V1_ENUMS.eyes.color }));
  return errors;
}

function validateObservableEquipment(value, path) {
  if (!Array.isArray(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be an array of visible equipment cues.`)];
  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(entry)) return [issue('generated_schema_mismatch',
      entryPath, `${entryPath} must be a visible equipment cue.`)];
    const errors = unexpected(entry, ['physical_position',
      'equipment_slot_category_id', 'visual_profile_snapshot'], entryPath);
    optionalText(entry, 'physical_position', entryPath, errors);
    optionalText(entry, 'equipment_slot_category_id', entryPath, errors);
    if (entry.visual_profile_snapshot != null) errors.push(
      ...validateVisualProfile(entry.visual_profile_snapshot,
        `${entryPath}.visual_profile_snapshot`));
    return errors;
  });
}

function validateVisualProfile(value, path) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be a visible equipment profile.`)];
  const keys = ['schema', 'version', 'equipment_slot', 'neckline',
    'sleeve_form', 'outer_form', 'visible_fabric', 'trim',
    'main_visible_color', 'secondary_visible_color', 'headwear_kind'];
  const errors = unexpected(value, keys, path);
  optionalText(value, 'schema', path, errors);
  if (value.version != null && !Number.isFinite(value.version)) errors.push(
    issue('generated_schema_mismatch', `${path}.version`,
      `${path}.version must be finite.`));
  optionalText(value, 'equipment_slot', path, errors);
  for (const [key, values] of Object.entries({
    neckline: PORTRAIT_SPEC_V1_ENUMS.clothing.neckline,
    sleeve_form: PORTRAIT_SPEC_V1_ENUMS.clothing.sleeve,
    outer_form: PORTRAIT_SPEC_V1_ENUMS.clothing.outer,
    visible_fabric: PORTRAIT_SPEC_V1_ENUMS.clothing.fabric,
    trim: PORTRAIT_SPEC_V1_ENUMS.clothing.trim,
    main_visible_color: PORTRAIT_SPEC_V1_ENUMS.clothing.main_color,
    secondary_visible_color: PORTRAIT_SPEC_V1_ENUMS.clothing.secondary_color,
    headwear_kind: PORTRAIT_SPEC_V1_ENUMS.clothing.headwear
  })) optionalEnum(value, key, values, path, errors);
  return errors;
}

function validateEnumRecord(value, path, fields) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path,
    `${path} must be a player-safe cue record.`)];
  const errors = unexpected(value, Object.keys(fields), path);
  for (const [key, values] of Object.entries(fields)) {
    optionalEnum(value, key, values, path, errors);
  }
  return errors;
}

function unexpected(value, allowed, path) {
  return Object.keys(value).filter((key) => !allowed.includes(key)).map(
    (key) => issue('hidden_information_leak', `${path}.${key}`,
      `${path} forbids non-player-safe field ${key}.`));
}

function optionalText(value, key, path, errors) {
  if (value[key] != null && !stableId(value[key])) errors.push(issue(
    'generated_schema_mismatch', `${path}.${key}`,
    `${path}.${key} must be a non-empty player-safe string.`));
}

function optionalEnum(value, key, allowed, path, errors) {
  if (value[key] != null && !allowed.includes(value[key])) errors.push(issue(
    'generated_schema_mismatch', `${path}.${key}`,
    `${path}.${key} is outside the player-safe vocabulary.`));
}

function validatePlayerSafeAffordances(value, path) {
  if (!Array.isArray(value)) return [issue('generated_schema_mismatch', path, `${path} must be an array of already-calculated action affordances.`)];
  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(entry)) return [issue('generated_schema_mismatch', entryPath, `${entryPath} must be a player-safe action affordance.`)];
    const errors = Object.keys(entry)
      .filter((key) => !playerSafeAffordanceKeys.includes(key))
      .map((key) => issue('hidden_information_leak', `${entryPath}.${key}`, `${entryPath} forbids non-player-safe field ${key}.`));
    for (const key of playerSafeAffordanceKeys) {
      if (!stableId(entry[key])) errors.push(issue('generated_schema_mismatch', `${entryPath}.${key}`, `${entryPath}.${key} must be a non-empty string.`));
    }
    return errors;
  });
}

export function validatePlayerSafeVisiblePayload(value, path = 'visible_payload') {
  if (!isObject(value)) return [issue('generated_schema_mismatch', path, `${path} must be an object owned by the player-safe projector.`)];
  const errors = Object.keys(value)
    .filter((key) => !playerSafeVisiblePayloadKeySet.has(key))
    .map((key) => issue('hidden_information_leak', `${path}.${key}`, `${path} forbids non-player-safe field ${key}.`));
  for (const key of PLAYER_SAFE_VISIBLE_PAYLOAD_KEYS) {
    if (!Object.hasOwn(value, key)) errors.push(issue('generated_schema_mismatch', `${path}.${key}`, `${path}.${key} is required by temporal_visible_package.v1.`));
  }
  if (value.schema !== 'temporal_visible_package.v1') errors.push(issue('generated_schema_mismatch', `${path}.schema`, `${path}.schema must be temporal_visible_package.v1.`));
  if (!stableId(value.perceived_scene)) errors.push(issue('generated_schema_mismatch', `${path}.perceived_scene`, `${path}.perceived_scene must be a non-empty player-safe string.`));
  for (const key of ['perceived_changes', 'sensory_details', 'known_context', 'uncertainties', 'hypotheses']) errors.push(...validatePlayerSafeStringList(value[key], `${path}.${key}`));
  errors.push(
    ...validatePlayerSafeEntityList(value.visible_npcs,
      `${path}.visible_npcs`, true),
    ...validatePlayerSafeEntityList(value.visible_objects, `${path}.visible_objects`),
    ...validatePlayerSafeAffordances(value.allowed_action_affordances, `${path}.allowed_action_affordances`)
  );
  if (value.player_safe_interruption != null && !stableId(value.player_safe_interruption)) errors.push(issue('generated_schema_mismatch', `${path}.player_safe_interruption`, `${path}.player_safe_interruption must be null or a non-empty player-safe string.`));
  return errors;
}

export function validateVisiblePackageEnvelope(value) {
  if (!isObject(value) || !isObject(value.visible_payload)) return [];
  const blacklistErrors = findHiddenPayloadPaths(value.visible_payload).map((path) => issue(
    'hidden_information_leak',
    path,
    'Visible factual packages must not contain hidden, future, unperceived, decision-trace, roll, DC or state-patch data.'
  ));
  return [...blacklistErrors, ...validatePlayerSafeVisiblePayload(value.visible_payload)];
}
import { PORTRAIT_SPEC_V1_ENUMS } from '../portrait-spec-v1.js';
