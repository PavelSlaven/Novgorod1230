import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from
  './lower-dvina-trace-s1-bundle-utils.js';

const DEFINITION_PATH = `${ROOT}/phase-m20-content/definition.json`;
const PROFILE_PATH =
  `${ROOT}/phase-m20-content/a1-authored-item-mechanics-profile.json`;
const DEFINITION_DIGEST =
  '40f41b40edda801ca9e7fc2b0bac049ab298708a3d19f4329736378e84d84951';
const PROFILE_DIGEST =
  '5a98b0e914427da95f7d674d4e7be7c782ff524916160b40a07fafef316bef36';

export async function loadLowerDvinaTraceRevision32Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [definition, mechanics] = await Promise.all([
    readBundleArtifact(rootDir, DEFINITION_PATH),
    readBundleArtifact(rootDir, PROFILE_PATH)
  ]);
  if (historicalBundle?.definition_revision !== 31
      || definition.digest !== DEFINITION_DIGEST
      || definition.value?.revision !== 32
      || definition.value?.supersedes_definition_ref?.digest
        !== historicalBundle.artifact_pins.definition.digest
      || mechanics.digest !== PROFILE_DIGEST
      || !validProfile(mechanics.value)
      || definition.value?.immutable_content_refs
        ?.a1_authored_item_mechanics_profile?.digest !== mechanics.digest) {
    return fail('TRACE_REVISION_32_CONTENT_INVALID');
  }
  const bundle = structuredClone(historicalBundle);
  for (const entry of mechanics.value.profiles) {
    const matches = [
      ...(bundle.item_container_set.item_inventory_profiles ?? []),
      ...(bundle.item_inventory_profiles ?? [])
    ].filter((profile) => profileRef(profile) === entry.profile_ref);
    if (matches.length !== 1 || !validBaseMechanics(matches[0])) {
      return fail('TRACE_REVISION_32_ITEM_MECHANICS_INVALID');
    }
  }
  bundle.definition_revision = 32;
  bundle.definition = definition.value;
  bundle.a1_authored_item_mechanics_profile = mechanics.value;
  bundle.artifact_pins = { ...bundle.artifact_pins,
    definition: pin('definition', DEFINITION_PATH, definition),
    a1_authored_item_mechanics_profile:
      pin('a1_authored_item_mechanics_profile', PROFILE_PATH, mechanics) };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function validProfile(value) {
  const rows = value?.profiles;
  return exact(value, ['schema', 'profile_id', 'revision', 'status',
    'scenario_id', 'scenario_definition_revision', 'mechanics_owner',
    'fallback_policy', 'profiles'])
    && value.schema
      === 'rus.lower_dvina_trace_a1_authored_item_mechanics_profile.v1'
    && value.profile_id === 'lower_dvina_trace_a1_authored_item_mechanics_v1'
    && value.revision === 1 && value.status === 'approved'
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 32
    && value.mechanics_owner === '@rus/items-property'
    && value.fallback_policy === 'forbidden'
    && Array.isArray(rows) && rows.length > 0
    && new Set(rows.map(({ profile_ref: ref }) => ref)).size === rows.length
    && rows.every((row) => exact(row, ['profile_ref', 'packing_slot_cost',
      'quantity', 'container']) && text(row.profile_ref)
      && Number.isSafeInteger(row.packing_slot_cost)
      && row.packing_slot_cost >= 0 && row.quantity === null
      && row.container === null);
}

function validBaseMechanics(value) {
  return Number.isSafeInteger(value?.mass_grams) && value.mass_grams >= 0
    && [0, 1, 2].includes(value.external_hand_cost)
    && ['compact', 'regular', 'long', 'bulky'].includes(value.carry_form);
}

function profileRef(value) {
  return value?.inventory_profile_id ?? value?.id ?? null;
}

function pin(key, path, loaded) {
  return { key, path, digest: loaded.digest,
    canonical_digest: canonicalDigest(loaded.value),
    schema: loaded.value.schema, revision: loaded.value.revision };
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}
