import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, createRandomSource, deriveSeed, MaterializationError } from './core.js';

export const G4_NATURAL_LAYERS = Object.freeze(['surface', 'relief', 'water_body',
  'bank_structure', 'tree_layer', 'shrub_layer', 'ground_cover', 'riparian_vegetation',
  'natural_materials', 'seasonal_state', 'light', 'weather', 'audible_context']);

/** Static authoring payload; approval and activated membership belong to P12. */
export function validateG4NaturalProfile(profile) {
  const layers = profile?.natural_profile?.layer_applicability;
  if (!text(profile?.profile_id) || !positive(profile.profile_version)
    || !text(profile.g4_ref?.id) || !positive(profile.g4_ref.version)
    || !text(profile.g4_ref.world_revision_id) || !object(layers)
    || Object.keys(layers).length !== G4_NATURAL_LAYERS.length
    || G4_NATURAL_LAYERS.some((key) => {
      const row = layers[key];
      return !['present', 'not_applicable'].includes(row?.applicability)
        || !text(row.limits) || !Array.isArray(row.source_refs) || !row.source_refs.length
        || !row.source_refs.every(text)
        || (row.applicability === 'present' ? !object(row.value) || !Object.keys(row.value).length : row.value !== null);
    }) || !Array.isArray(profile.exact_scene_features?.canonical_scene_template_refs)
    || !profile.exact_scene_features.canonical_scene_template_refs.length
    || !profile.exact_scene_features.canonical_scene_template_refs.every(text)) gap('PROFILE_INVALID');
  if (['seasonal_state', 'light', 'weather'].some((key) => layers[key].applicability !== 'present')
    || !text(layers.seasonal_state.value.calendar_profile_ref)
    || !text(layers.seasonal_state.value.weather_profile_ref)
    || !text(layers.light.value.calendar_profile_ref)
    || !text(layers.weather.value.weather_profile_ref)
    || !positive(layers.seasonal_state.value.calendar_profile_version)
    || !positive(layers.seasonal_state.value.weather_profile_version)
    || !positive(layers.light.value.calendar_profile_version)
    || !positive(layers.weather.value.weather_profile_version)) gap('TEMPORAL_PROFILE_REFS_MISSING');
  return true;
}

/** Machine baseline only. Perception must authorize any player-visible subset. */
export function materializeG4NaturalBaseline({ catalog, g4_ref, scene_template_ref,
  current_environment: environment } = {}) {
  if (catalog?.schema !== 'rus.verified_g4_natural_catalog.v1' || catalog.verified !== true
    || catalog.pin?.compatible_world_revision_id !== g4_ref?.world_revision_id
    || !Array.isArray(catalog.profiles)) gap('CATALOG_PIN_MISSING');
  const matches = catalog.profiles.filter(({ payload }) => payload.g4_ref.id === g4_ref.id
    && payload.g4_ref.version === g4_ref.version
    && payload.g4_ref.world_revision_id === g4_ref.world_revision_id);
  if (matches.length !== 1) gap('EXACT_G4_PROFILE_MISSING');
  const record = matches[0]; const profile = record.payload;
  validateG4NaturalProfile(profile);
  if (!profile.exact_scene_features.canonical_scene_template_refs
    .includes(`${scene_template_ref?.id}@${scene_template_ref?.version}`)) gap('SCENE_TEMPLATE_MISMATCH');
  const rows = profile.natural_profile.layer_applicability;
  if (environment?.schema !== 'rus.approved_initial_environment.v1'
    || !text(environment.season) || !text(environment.light_state)
    || !object(environment.weather_state)
    || !positive(Number(environment.calendar_record_ref?.version))
    || !positive(Number(environment.weather_record_ref?.version))
    || environment.calendar_record_ref?.id !== rows.seasonal_state.value?.calendar_profile_ref
    || environment.calendar_record_ref?.id !== rows.light.value?.calendar_profile_ref
    || environment.weather_record_ref?.id !== rows.weather.value?.weather_profile_ref
    || environment.weather_record_ref?.id !== rows.seasonal_state.value?.weather_profile_ref
    || Number(environment.calendar_record_ref.version) !== rows.seasonal_state.value.calendar_profile_version
    || Number(environment.calendar_record_ref.version) !== rows.light.value.calendar_profile_version
    || Number(environment.weather_record_ref.version) !== rows.weather.value.weather_profile_version
    || Number(environment.weather_record_ref.version) !== rows.seasonal_state.value.weather_profile_version) gap('CURRENT_TEMPORAL_STATE_MISSING');
  const layers = G4_NATURAL_LAYERS.map((layer) => {
    const { applicability, value, limits } = rows[layer];
    const resolved = structuredClone(value);
    if (layer === 'seasonal_state') resolved.current_season = environment.season;
    if (layer === 'light') resolved.current_light_state = environment.light_state;
    if (layer === 'weather') resolved.current_weather_state = structuredClone(environment.weather_state);
    if (resolved) {
      delete resolved.current_state_from_world_time;
      delete resolved.resolve_from_current_world_time;
      delete resolved.resolve_from_current_world_state;
      delete resolved.weather_state_contract;
    }
    return { layer, applicability, value: resolved, limits };
  });
  return deepFreeze({ schema: 'rus.g4_natural_baseline.v1', version: 1,
    profile_ref: { id: profile.profile_id, version: profile.profile_version,
      record_id: record.record_id, payload_digest: record.payload_digest },
    g4_ref: structuredClone(g4_ref), scene_template_ref: structuredClone(scene_template_ref),
    layers, gameplay_materialization_llm_calls: 0 });
}

/** Pure choice over members already admitted by the current source-state owner. */
export function selectG4NaturalMembers({ profile, frequency_weight_policy: policy, party_id,
  g5_site_id, season, eligible_member_refs = [] } = {}) {
  if (!text(party_id) || !text(g5_site_id) || !text(season)
    || !text(profile?.profile_id) || !positive(profile.profile_version)
    || !text(profile.g4_ref?.world_revision_id) || !positive(policy?.version)
    || !object(policy.weights) || !Array.isArray(eligible_member_refs)
    || !eligible_member_refs.every(text)) gap('MEMBER_SELECTION_INPUT_INVALID');
  const matrix = profile.natural_profile?.season_matrix?.[season];
  if (!object(matrix)) gap('SEASON_MATRIX_MISSING');
  const identity = { world_revision_id: profile.g4_ref.world_revision_id,
    profile_id: profile.profile_id, profile_version: profile.profile_version,
    party_id, g5_site_id, season, weight_policy_version: policy.version };
  const eligible = new Set(eligible_member_refs);
  const layers = [];
  for (const layer of Object.keys(matrix).sort()) {
    const row = matrix[layer];
    const seed = deriveSeed({ ...identity, layer });
    const random = createRandomSource({ seed: seed.uint32, version: 'mulberry32_v1' });
    if (!Array.isArray(row?.members) || !Array.isArray(row.mandatory_member_refs)
      || !Array.isArray(row.excluded_candidate_refs)
      || !Array.isArray(row.incompatibility?.member_refs)
      || row.incompatibility.status !== 'resolved') gap('MEMBER_RULES_UNRESOLVED');
    const byRef = new Map(row.members.map((member) => [member.member_ref, member]));
    if (byRef.size !== row.members.length || row.members.some((member) => !text(member.member_ref))) {
      gap('MEMBER_RULES_INVALID');
    }
    const mandatory = new Set(row.mandatory_member_refs);
    for (const member of row.members) {
      if (member.frequency_category === 'dominant' && eligible.has(member.member_ref)) {
        if (member.editorial_weight !== policy.weights.dominant || !positive(policy.weights.dominant)) {
          gap('MEMBER_WEIGHT_INVALID');
        }
        mandatory.add(member.member_ref);
      }
    }
    const excluded = new Set(row.excluded_candidate_refs);
    if ([...mandatory].some((ref) => !byRef.has(ref) || excluded.has(ref)
      || (byRef.get(ref).eligibility !== 'approved_broad_context' && !eligible.has(ref)))) {
      gap('MANDATORY_MEMBER_UNAVAILABLE');
    }
    const conflicts = row.incompatibility.member_refs;
    if (conflicts.some((group) => !Array.isArray(group) || group.length < 2
      || group.some((ref) => !byRef.has(ref)))) gap('MEMBER_RULES_INVALID');
    const incompatible = (ref, selected) => conflicts.some((group) =>
      group.includes(ref) && group.some((other) => other !== ref && selected.has(other)));
    if ([...mandatory].some((ref) => incompatible(ref, mandatory))) gap('MANDATORY_MEMBER_INCOMPATIBLE');
    const choices = row.members.filter((member) => eligible.has(member.member_ref)
      && !mandatory.has(member.member_ref) && !excluded.has(member.member_ref)
      && !incompatible(member.member_ref, mandatory));
    let total = 0;
    const weights = choices.map((member) => {
      const weight = policy.weights[member.frequency_category];
      if (!positive(weight) || member.editorial_weight !== weight) gap('MEMBER_WEIGHT_INVALID');
      total += weight;
      return weight;
    });
    const selected = [...mandatory];
    if (total) {
      let draw = random.nextUint32() % total;
      for (let index = 0; index < choices.length; index += 1) {
        draw -= weights[index];
        if (draw < 0) { selected.push(choices[index].member_ref); break; }
      }
    }
    layers.push({ layer, seed_digest: seed.digest, member_refs: selected.sort() });
  }
  const result = { schema: 'rus.g4_natural_member_selection.v1', identity,
    algorithm: 'mulberry32_v1', layers };
  return deepFreeze({ ...result, selection_digest: canonicalDigest(result) });
}

function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function gap(reason) { throw new MaterializationError('G4_NATURAL_BASELINE_DATA_GAP',
  'Exact approved natural baseline is unavailable.', { reason }); }
