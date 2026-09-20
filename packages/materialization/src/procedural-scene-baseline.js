import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, createRandomSource, deriveSeed, MaterializationError,
  RNG_VERSION } from './core.js';

export function materializeProceduralSceneBaseline({ party_id, scope_ref,
  profile, seed_context } = {}) {
  validate(profile);
  if (!text(party_id) || !text(scope_ref?.entity_kind)
      || !text(scope_ref?.entity_id) || seed_context?.party_id !== party_id
      || seed_context?.profile_id !== profile.profile_id
      || seed_context?.scope_ref?.entity_kind !== scope_ref.entity_kind
      || seed_context?.scope_ref?.entity_id !== scope_ref.entity_id
      || seed_context?.rng_algorithm_id !== RNG_VERSION) {
    throw error('PROCEDURAL_SCENE_BASELINE_INPUT_INVALID');
  }
  const seed = deriveSeed(seed_context);
  const random = createRandomSource({ seed: seed.uint32 });
  const selected = [...profile.required_components];
  const selectedIds = new Set(selected.map(({ component_id }) => component_id));
  const choices = [];
  for (const candidate of [...profile.optional_components]
    .sort((a, b) => a.component_id.localeCompare(b.component_id))) {
    const draw = random.nextUint32();
    const present = draw % (candidate.presence_weight + candidate.absence_weight)
      < candidate.presence_weight;
    const compatible = (candidate.excludes ?? []).every((id) => !selectedIds.has(id));
    if (present && compatible) {
      selected.push(candidate);
      selectedIds.add(candidate.component_id);
    }
    choices.push({ component_id: candidate.component_id, draw, present,
      selected: present && compatible });
  }
  const components = selected.sort((a, b) => a.component_id.localeCompare(b.component_id))
    .map((component) => deepFreeze({ ...structuredClone(component),
      component_ref: `scene_component_${canonicalDigest({ scope_ref,
        profile_id: profile.profile_id, component_id: component.component_id })
        .slice(0, 24)}` }));
  return deepFreeze({ schema: 'rus.procedural_scene_baseline_result.v1',
    version: 1, party_id, scope_ref: structuredClone(scope_ref),
    profile_id: profile.profile_id, family: profile.family,
    seed_digest: seed.digest, rng_algorithm_id: RNG_VERSION,
    rng_draw_count: random.drawCount, choices, components,
    result_digest: canonicalDigest({ party_id, scope_ref,
      profile_id: profile.profile_id, components }) });
}

function validate(profile) {
  if (profile?.schema !== 'rus.procedural_scene_baseline_profile.v1'
      || profile.version !== 1 || profile.status !== 'approved'
      || !text(profile.profile_id) || !text(profile.family)
      || !Array.isArray(profile.required_components)
      || profile.required_components.length === 0
      || !Array.isArray(profile.optional_components)) {
    throw error('PROCEDURAL_SCENE_BASELINE_PROFILE_INVALID');
  }
  const all = [...profile.required_components, ...profile.optional_components];
  const ids = new Set();
  for (const component of all) {
    if (!text(component?.component_id) || ids.has(component.component_id)
        || !text(component.layer) || !text(component.descriptor)
        || !['group', 'finite_source', 'ambient_source'].includes(component.kind)
        || component.required !== profile.required_components.includes(component)
        || component.kind === 'finite_source' && (!Number.isSafeInteger(
          component.initial_quantity) || component.initial_quantity <= 0)
        || component.kind !== 'group' && !text(component.quantity_unit)
        || (profile.optional_components.includes(component)
          && (!Number.isSafeInteger(component.presence_weight)
            || component.presence_weight <= 0
            || !Number.isSafeInteger(component.absence_weight)
            || component.absence_weight <= 0
            || !Array.isArray(component.excludes)))) {
      throw error('PROCEDURAL_SCENE_BASELINE_PROFILE_INVALID');
    }
    ids.add(component.component_id);
  }
  if (profile.optional_components.some(({ excludes }) =>
    excludes.some((id) => !ids.has(id)))) {
    throw error('PROCEDURAL_SCENE_BASELINE_PROFILE_INVALID');
  }
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function error(code) {
  return new MaterializationError(code, code);
}
