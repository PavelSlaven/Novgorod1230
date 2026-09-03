import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from
  './lower-dvina-trace-s1-bundle-utils.js';

const DEFINITION_PATH = `${ROOT}/phase-m20-content/definition.json`;
const PROFILE_PATH =
  `${ROOT}/phase-m20-content/a1-authored-item-mechanics-profile.json`;
const SCHEDULE_PATH =
  `${ROOT}/phase-m20-content/initial-npc-schedule-profile.json`;
const DEFINITION_DIGEST =
  '0c4b5d4992393ecde511cb35426933b01fb51b47552e0f5a859df2bfd359ab1f';
const PROFILE_DIGEST =
  '2e12636428e94881360dc926b2455f9a7aefefdf09c4d0d43795fdb815b35d90';
const SCHEDULE_DIGEST =
  '844321a0aeda1f45e750b22a9a5bba11217d44c3d7575f1817e3d0d621031b59';

export async function loadLowerDvinaTraceRevision32Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [definition, mechanics, schedules] = await Promise.all([
    readBundleArtifact(rootDir, DEFINITION_PATH),
    readBundleArtifact(rootDir, PROFILE_PATH),
    readBundleArtifact(rootDir, SCHEDULE_PATH)
  ]);
  if (historicalBundle?.definition_revision !== 31
      || definition.digest !== DEFINITION_DIGEST
      || definition.value?.revision !== 32
      || definition.value?.supersedes_definition_ref?.digest
        !== historicalBundle.artifact_pins.definition.digest
      || mechanics.digest !== PROFILE_DIGEST
      || !validProfile(mechanics.value)
      || schedules.digest !== SCHEDULE_DIGEST
      || !validScheduleProfile(schedules.value, historicalBundle)
      || definition.value?.immutable_content_refs
        ?.a1_authored_item_mechanics_profile?.digest !== mechanics.digest
      || definition.value?.immutable_content_refs
        ?.initial_npc_schedule_profile?.digest !== schedules.digest) {
    return fail('TRACE_REVISION_32_CONTENT_INVALID');
  }
  const bundle = structuredClone(historicalBundle);
  for (const entry of mechanics.value.profiles) {
    const matches = [
      ...(bundle.item_container_set.item_inventory_profiles ?? []),
      ...(bundle.item_inventory_profiles ?? []),
      bundle.materialization_bindings?.initial_autonomous_materialization
        ?.packet_placement?.inventory_profile
    ].filter((profile) => profileRef(profile) === entry.profile_ref);
    if (matches.length !== 1 || !validBaseMechanics(matches[0])) {
      return fail('TRACE_REVISION_32_ITEM_MECHANICS_INVALID');
    }
  }
  bundle.definition_revision = 32;
  bundle.definition = definition.value;
  bundle.a1_authored_item_mechanics_profile = mechanics.value;
  bundle.initial_npc_schedule_profile = schedules.value;
  bundle.artifact_pins = { ...bundle.artifact_pins,
    definition: pin('definition', DEFINITION_PATH, definition),
    a1_authored_item_mechanics_profile:
      pin('a1_authored_item_mechanics_profile', PROFILE_PATH, mechanics),
    initial_npc_schedule_profile:
      pin('initial_npc_schedule_profile', SCHEDULE_PATH, schedules) };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function validScheduleProfile(value, historical) {
  const entries = value?.entries;
  const participantProfiles = new Set(
    historical?.participant_profile_set?.profiles?.map(({ profile_id: id }) => id)
  );
  return exact(value, ['schema', 'profile_id', 'revision', 'status',
    'scenario_id', 'scenario_definition_revision', 'owner',
    'fallback_policy', 'entries'])
    && value.schema
      === 'rus.lower_dvina_trace_initial_npc_schedule_profile.v1'
    && value.profile_id === 'lower_dvina_trace_initial_npc_schedules_v1'
    && value.revision === 1 && value.status === 'approved'
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 32
    && value.owner === '@rus/npc-runtime'
    && value.fallback_policy === 'forbidden'
    && Array.isArray(entries) && entries.length > 0
    && new Set(entries.map(({ participant_profile_ref: ref }) => ref)).size
      === entries.length
    && entries.every((entry) => validScheduleEntry(entry)
      && participantProfiles.has(entry.participant_profile_ref));
}

function validScheduleEntry(value) {
  const activity = value?.current_activity;
  return exact(value, ['participant_profile_ref', 'schedule_state',
    'time_band', 'schedule_profile_id', 'current_activity'])
    && text(value.participant_profile_ref) && text(value.schedule_state)
    && text(value.time_band) && text(value.schedule_profile_id)
    && exact(activity, ['activity_ref', 'summary', 'status',
      'can_continue_automatically'])
    && activity.activity_ref === value.schedule_profile_id
    && text(activity.summary) && text(activity.status)
    && typeof activity.can_continue_automatically === 'boolean';
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
