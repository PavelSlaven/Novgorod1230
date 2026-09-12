import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from
  './lower-dvina-trace-s1-bundle-utils.js';

const DEFINITION_PATH = `${ROOT}/phase-m22-content/definition.json`;
const PROFILE_PATH =
  `${ROOT}/phase-m22-content/post-action-perception-profile.json`;
const DEFINITION_DIGEST =
  'c04d7032bfbea2fb7e1458fb59014e8168a258a3a2890475628a983702568b0f';
const PROFILE_DIGEST =
  'fd5fb3007e992aa471f6bd208f18a74ef01db3b506324fea748d2a3d5efce8e2';

export async function loadLowerDvinaTraceRevision34Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [definition, profile] = await Promise.all([
    readBundleArtifact(rootDir, DEFINITION_PATH),
    readBundleArtifact(rootDir, PROFILE_PATH)
  ]);
  if (historicalBundle?.definition_revision !== 33
      || definition.digest !== DEFINITION_DIGEST
      || definition.value?.revision !== 34
      || definition.value?.supersedes_definition_ref?.digest
        !== historicalBundle.artifact_pins.definition.digest
      || profile.digest !== PROFILE_DIGEST
      || !validProfile(profile.value)
      || definition.value?.immutable_content_refs
        ?.post_action_perception_profile?.digest !== profile.digest) {
    return fail('TRACE_REVISION_34_CONTENT_INVALID');
  }
  const bundle = structuredClone(historicalBundle);
  bundle.definition_revision = 34;
  bundle.definition = definition.value;
  bundle.post_action_perception_profile = profile.value;
  bundle.artifact_pins = { ...bundle.artifact_pins,
    definition: pin('definition', DEFINITION_PATH, definition),
    post_action_perception_profile:
      pin('post_action_perception_profile', PROFILE_PATH, profile) };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function validProfile(value) {
  const attention = value?.attention;
  const environment = value?.environment;
  const runtime = value?.runtime_attention;
  const policy = value?.perception_policy;
  return value?.schema
      === 'rus.lower_dvina_trace_post_action_perception_profile.v1'
    && value.profile_id === 'lower_dvina_trace_post_action_perception_v1'
    && value.revision === 1 && value.status === 'approved'
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 34
    && value.owner === '@rus/turn' && value.fallback_policy === 'forbidden'
    && same(value.channels, ['acoustic'])
    && value.listener_scope_relation === 'same_scene_position'
    && value.required_schedule_status === 'active'
    && same(runtime?.awake_statuses, ['available'])
    && same(runtime?.sleeping_statuses, ['sleeping'])
    && same(runtime?.unavailable_statuses, ['unavailable'])
    && same(attention?.awake_channels, ['acoustic', 'visual'])
    && same(attention?.sleeping_channels, [])
    && attention?.observer_azimuth_mdeg === 0
    && attention?.observer_vertical_direction === 'level'
    && attention?.visual_capability_level === 3
    && attention?.acoustic_capability_level === 3
    && environment?.light_state_id === 'bright'
    && environment?.weather_visibility_result === 'clear'
    && environment?.weather_acoustic_loss === '0'
    && environment?.transient_visibility_result === 'clear'
    && environment?.transient_acoustic_loss === '0'
    && value.recognition_outcome === 'unidentified'
    && versioned(policy?.recognition_policy_ref)
    && versioned(policy?.visibility_policy_ref)
    && versioned(policy?.acoustic_policy_ref)
    && versioned(policy?.provenance_ref)
    && policy?.status === 'approved'
    && policy?.darkness_visual_result_cap === 'perceived_partial'
    && same(policy?.sleeping_attention_channels, []);
}

function versioned(value) {
  return text(value?.entity_ref?.entity_kind)
    && text(value?.entity_ref?.entity_id)
    && text(value?.authoring_version);
}
function pin(key, path, loaded) {
  return { key, path, digest: loaded.digest,
    canonical_digest: canonicalDigest(loaded.value),
    schema: loaded.value.schema, revision: loaded.value.revision };
}
function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}
