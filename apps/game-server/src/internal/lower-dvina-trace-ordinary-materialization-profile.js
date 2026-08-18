import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateLowerDvinaTraceOrdinaryStageBEval } from
  './lower-dvina-trace-ordinary-stage-b-eval.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content';
const PROFILE_FILE = 'ordinary-materialization-profile.json';
const PROFILE_DIGEST =
  '0a0332ec4306db02dda1cea660bd5921a6bf046d3c3edcb9f1226dbe1ca4c1cf';
const MANIFEST_DIGEST =
  '475c0c248ada37b72e7b746b042904f863510b7c007097fa15a71a03d8e73176';

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
  const manifestDigest = createHash('sha256').update(manifestRaw).digest('hex');
  if (!valid(manifest, profile, digest, manifestDigest)) {
    throw Object.assign(new Error('TRACE_ORDINARY_MATERIALIZATION_PROFILE_INVALID'), {
      code: 'TRACE_ORDINARY_MATERIALIZATION_PROFILE_INVALID'
    });
  }
  return freeze(profile);
}

function valid(manifest, profile, digest, manifestDigest) {
  const ref = manifest?.content_refs?.ordinary_materialization_profile;
  return digest === PROFILE_DIGEST && manifestDigest === MANIFEST_DIGEST
    && manifest?.schema === 'rus.lower_dvina_trace_m7_content_manifest.v1'
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
      'technical_limits','context_refs','policy_refs','execution',
      'stage_b_classification_eval','fallback_policy'])
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
    && exactKeys(profile.execution, ['allowed_disclosure_policy_refs','density_policy',
      'candidate_context','mechanics_policy','causal_ref','source_refs'])
    && exactKeys(profile.execution.density_policy, ['version','mappings'])
    && profile.execution.density_policy.version === profile.policy_refs.density_policy_ref
    && profile.execution.density_policy.mappings?.length === 1
    && profile.execution.density_policy.mappings[0]?.scope_kind === 'g6'
    && profile.execution.density_policy.mappings[0]?.function_ref === null
    && exactKeys(profile.execution.density_policy.mappings[0]?.bands,
      ['sparse','ordinary','dense'])
    && profile.execution.density_policy.mappings[0].bands.sparse === 0
    && profile.execution.density_policy.mappings[0].bands.ordinary === 1
    && profile.execution.density_policy.mappings[0].bands.dense === 1
    && exactKeys(profile.execution.candidate_context,
      ['candidate_ref_namespace','normalizer_version','semantic_type',
        'candidate_hint','functional_bucket','admission_class',
        'availability_class','coverage_kind','coverage_ref','policy_version'])
    && profile.execution.candidate_context?.candidate_ref_namespace
      === 'trace_ld_v1_o1_query_candidate'
    && profile.execution.candidate_context?.normalizer_version
      === 'trace_ld_v1_o1_candidate_normalizer_v1'
    && profile.execution.candidate_context?.semantic_type
      === 'ordinary_object_candidate'
    && profile.execution.candidate_context?.candidate_hint === null
    && profile.execution.candidate_context?.functional_bucket === 'other_ordinary'
    && profile.execution.candidate_context?.admission_class === 'common_mundane'
    && profile.execution.candidate_context?.availability_class === 'common'
    && profile.execution.candidate_context?.coverage_kind === 'visible_surface'
    && profile.execution.candidate_context?.coverage_ref
      === 'trace_ld_v1_o1_visible_surface'
    && profile.execution.candidate_context?.policy_version
      === profile.policy_refs.ordinary_presence_policy_ref
    && validMechanicsPolicy(profile.execution.mechanics_policy,
      profile.policy_refs.runtime_item_mechanics_policy_ref)
    && validateLowerDvinaTraceOrdinaryStageBEval(
      profile.stage_b_classification_eval);
}
function validMechanicsPolicy(value, policyRef) {
  return exactKeys(value, ['policy_ref','max_mass_grams',
    'allowed_external_hand_costs','allowed_carry_forms',
    'max_packing_slot_cost','max_quantity'])
    && value.policy_ref === policyRef
    && value.max_mass_grams === 20000
    && JSON.stringify(value.allowed_external_hand_costs) === '[0,1,2]'
    && JSON.stringify(value.allowed_carry_forms)
      === '["compact","regular","long","bulky"]'
    && value.max_packing_slot_cost === 16
    && value.max_quantity === 1;
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
