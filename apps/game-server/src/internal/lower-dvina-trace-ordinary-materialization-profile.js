import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content';
const PROFILE_FILE = 'ordinary-materialization-profile.json';

export async function loadLowerDvinaTraceOrdinaryMaterializationProfile({
  rootDir = process.cwd()
} = {}) {
  const [manifestRaw, profileRaw] = await Promise.all([
    readFile(resolve(rootDir, ROOT, 'manifest.json')),
    readFile(resolve(rootDir, ROOT, PROFILE_FILE))
  ]);
  const manifest = JSON.parse(manifestRaw);
  const profile = JSON.parse(profileRaw);
  const digest = createHash('sha256').update(profileRaw).digest('hex');
  if (!valid(manifest, profile, digest)) {
    throw Object.assign(new Error('TRACE_ORDINARY_MATERIALIZATION_PROFILE_INVALID'), {
      code: 'TRACE_ORDINARY_MATERIALIZATION_PROFILE_INVALID'
    });
  }
  return freeze(profile);
}

function valid(manifest, profile, digest) {
  const ref = manifest?.content_refs?.ordinary_materialization_profile;
  return manifest?.schema === 'rus.lower_dvina_trace_m7_content_manifest.v1'
    && manifest?.scenario_definition_revision === 19
    && ref?.path === PROFILE_FILE && ref?.digest === digest
    && ref?.schema === profile?.schema && ref?.id === profile?.profile_id
    && ref?.revision === profile?.revision
    && profile?.schema === 'rus.lower_dvina_trace_ordinary_materialization_profile.v1'
    && profile?.profile_id === 'lower_dvina_trace_o1_first_entry_profile_v1'
    && profile?.revision === 1 && profile?.status === 'approved'
    && profile?.scenario_id === 'lower_dvina_trace_v1'
    && profile?.scenario_definition_revision === 19
    && exactKeys(profile, ['schema','profile_id','revision','status','scenario_id',
      'scenario_definition_revision','catalog_version','property_version','placement_version',
      'technical_limits','context_refs','policy_refs','execution','fallback_policy'])
    && profile.catalog_version === 1 && profile.property_version === 1
    && profile.placement_version === 1 && profile.fallback_policy === 'forbidden'
    && exactKeys(profile.technical_limits, ['max_new_entities','max_new_background_groups','max_resolution_records'])
    && profile.technical_limits.max_new_entities === 1
    && profile.technical_limits.max_new_background_groups === 1
    && profile.technical_limits.max_resolution_records === 4
    && exactKeys(profile.context_refs, ['period_ref','region_ref','function_refs',
      'environment_refs','occupation_household_refs','economic_context_ref',
      'occupancy_state_ref','material_culture_refs','property_context_ref'])
    && exactKeys(profile.policy_refs, ['authority_policy_ref','density_policy_ref',
      'ordinary_presence_policy_ref','runtime_item_mechanics_policy_ref',
      'allowed_admission_classes','context_bound_permission_refs'])
    && profile.policy_refs.allowed_admission_classes?.length === 1
    && profile.policy_refs.allowed_admission_classes[0] === 'common_mundane'
    && exactKeys(profile.execution, ['allowed_disclosure_policy_refs','identity_budget',
      'candidate_context','mechanics_policy','causal_ref','source_refs'])
    && profile.execution.identity_budget?.source === 'policy'
    && profile.execution.identity_budget?.identity_budget === 1
    && profile.execution.candidate_context?.functional_bucket === 'household'
    && profile.execution.candidate_context?.admission_class === 'common_mundane'
    && profile.execution.candidate_context?.availability_class === 'common'
    && profile.execution.mechanics_policy?.policy_ref
    && profile.execution.mechanics_policy?.mechanics?.container === null;
}
function exactKeys(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
