import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateLowerDvinaTraceOrdinaryStageBEval } from
  './lower-dvina-trace-ordinary-stage-b-eval.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content';
const PROFILE_FILE = 'ordinary-materialization-profile.json';
export const LOWER_DVINA_TRACE_ORDINARY_PROFILE_DIGEST =
  'd4502298cd0daf13cea86d917fdc0c6201a3cbda3e19a652d6c3f3025dbf1777';
const MANIFEST_DIGEST =
  '9023c9392d1d536ed4c7a5df3987b3d477cd3b63f9915fae157617a4a0b36923';

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
  return digest === LOWER_DVINA_TRACE_ORDINARY_PROFILE_DIGEST
    && manifestDigest === MANIFEST_DIGEST
    && manifest?.schema === 'rus.lower_dvina_trace_m7_content_manifest.v1'
    && manifest?.scenario_definition_revision === 19
    && ref?.path === PROFILE_FILE && ref?.digest === digest
    && ref?.schema === profile?.schema && ref?.id === profile?.profile_id
    && ref?.revision === profile?.revision
    && profile?.schema === 'rus.lower_dvina_trace_ordinary_materialization_profile.v2'
    && profile?.profile_id === 'lower_dvina_trace_o2a_first_entry_profile_v1'
    && profile?.revision === 2 && profile?.status === 'approved'
    && profile?.scenario_id === 'lower_dvina_trace_v1'
    && profile?.scenario_definition_revision === 19
    && exactKeys(profile, ['schema','profile_id','revision','status','scenario_id',
      'scenario_definition_revision','catalog_version','property_version','placement_version',
      'technical_limits','context_refs','policy_refs','execution',
      'stage_b_classification_eval','o2a_ambient','o2a_context_bound',
      'fallback_policy'])
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
    && JSON.stringify(profile.policy_refs.allowed_admission_classes)
      === '["common_mundane","specialized_or_valuable","weapon_or_armament","currency_or_precious","document_like","other_restricted"]'
    && JSON.stringify(profile.policy_refs.context_bound_permission_refs)
      === '["trace_ld_v1_o2a_first_entry_region_permission","trace_ld_v1_o2a_prepared_clay_permission"]'
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
      profile.stage_b_classification_eval)
    && validO2aAmbient(profile.o2a_ambient)
    && validO2aContextBound(profile.o2a_context_bound, profile);
}
function validO2aContextBound(value, profile) {
  const classes = ['weapon_or_armament','currency_or_precious',
    'document_like','other_restricted'];
  const c = value?.capability;
  return exactKeys(value, ['status','negative_admission_classes','capability'])
    && value.status === 'approved'
    && JSON.stringify(value.negative_admission_classes) === JSON.stringify(classes)
    && exactKeys(c, ['capability_ref','profile_ref','semantic_type','public_name',
      'functional_bucket','admission_class','profile_kind','condition_state',
      'basis_kind','source_basis_ref','property_basis_ref','environment_ref',
      'regional_permission_ref','resource_permission_ref',
      'mechanics_capability_ref','initial_quantity','quantity_unit_ref',
      'initial_amount_bounds'])
    && ['capability_ref','profile_ref','semantic_type','public_name',
      'functional_bucket','source_basis_ref','property_basis_ref','environment_ref',
      'regional_permission_ref','resource_permission_ref','mechanics_capability_ref']
      .every((key) => text(c[key]))
    && c.admission_class === 'specialized_or_valuable'
    && c.profile_kind === 'specialized_stock'
    && c.condition_state === 'serviceable' && c.basis_kind === 'finite_source'
    && c.initial_quantity === 2
    && exactKeys(c.quantity_unit_ref, ['kind','id'])
    && c.quantity_unit_ref.kind === 'unit' && c.quantity_unit_ref.id === 'item'
    && validBounds(c.initial_amount_bounds, 'item')
    && profile.context_refs.environment_refs.includes(c.environment_ref)
    && profile.policy_refs.context_bound_permission_refs.includes(
      c.regional_permission_ref)
    && profile.policy_refs.context_bound_permission_refs.includes(
      c.resource_permission_ref);
}
function validBounds(value, unit) {
  return exactKeys(value, ['minimum','maximum'])
    && [value.minimum,value.maximum].every((entry) =>
      exactKeys(entry, ['numerator','denominator','unit'])
        && positive(entry.numerator) && positive(entry.denominator)
        && entry.unit === unit)
    && BigInt(value.minimum.numerator) * BigInt(value.maximum.denominator)
      <= BigInt(value.maximum.numerator) * BigInt(value.minimum.denominator);
}
function validO2aAmbient(value) {
  return exactKeys(value, ['status','scope_binding','context_pin_ref','source_ref',
    'environment_ref','source_class','property_basis_ref','portion_profile','destination'])
    && value.status === 'approved'
    && exactKeys(value.scope_binding, ['position_ref','g6_ref'])
    && text(value.scope_binding.position_ref) && text(value.scope_binding.g6_ref)
    && text(value.context_pin_ref) && text(value.source_ref)
    && text(value.environment_ref) && text(value.source_class)
    && text(value.property_basis_ref)
    && exactKeys(value.portion_profile, ['profile_ref','semantic_type','display_name',
      'material_class','quantity_unit','min_quantity','max_quantity','min_mass_grams',
      'max_mass_grams','external_hand_cost','carry_form','packing_slot_cost'])
    && value.portion_profile.material_class === 'ordinary'
    && text(value.portion_profile.profile_ref)
    && text(value.portion_profile.semantic_type)
    && text(value.portion_profile.display_name)
    && text(value.portion_profile.quantity_unit)
    && positive(value.portion_profile.min_quantity)
    && positive(value.portion_profile.max_quantity)
    && value.portion_profile.min_quantity <= value.portion_profile.max_quantity
    && integer(value.portion_profile.min_mass_grams)
    && integer(value.portion_profile.max_mass_grams)
    && value.portion_profile.min_mass_grams >= 1
    && value.portion_profile.min_mass_grams <= value.portion_profile.max_mass_grams
    && [0, 1, 2].includes(value.portion_profile.external_hand_cost)
    && ['compact','regular','long','bulky'].includes(value.portion_profile.carry_form)
    && integer(value.portion_profile.packing_slot_cost)
    && value.portion_profile.packing_slot_cost >= 0
    && exactKeys(value.destination, ['kind'])
    && value.destination.kind === 'holder';
}
function text(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function integer(value) { return Number.isSafeInteger(value); }
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
