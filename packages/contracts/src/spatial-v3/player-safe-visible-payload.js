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
const playerSafeEntityKeys = Object.freeze(['entity_ref', 'display_label', 'recognition', 'visible_status']);
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

function validatePlayerSafeEntityList(value, path) {
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
    return errors;
  });
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
    ...validatePlayerSafeEntityList(value.visible_npcs, `${path}.visible_npcs`),
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
