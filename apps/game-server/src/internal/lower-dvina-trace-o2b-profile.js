import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m8-content';
const FILE = 'ordinary-container-contents-profile.json';
const CONTAINER_FILE = 'initial-ordinary-container.json';
const MANIFEST_FILE = 'manifest.json';
const MANIFEST_DIGEST =
  '3b2ec8edf55c2db80290a63c1d96946cd8f82d251d481259f4f337704780706b';

export async function loadLowerDvinaTraceO2bProfile({
  rootDir = process.cwd()
} = {}) {
  const [manifestRaw, profileRaw, containerRaw] = await Promise.all([
    readFile(resolve(rootDir, ROOT, MANIFEST_FILE)),
    readFile(resolve(rootDir, ROOT, FILE)),
    readFile(resolve(rootDir, ROOT, CONTAINER_FILE))
  ]);
  const manifest = JSON.parse(manifestRaw);
  const profile = JSON.parse(profileRaw);
  const initialContainer = JSON.parse(containerRaw);
  const digest = createHash('sha256').update(profileRaw).digest('hex');
  const containerDigest = createHash('sha256').update(containerRaw).digest('hex');
  const manifestDigest = createHash('sha256').update(manifestRaw).digest('hex');
  const ref = manifest?.content_refs?.ordinary_container_contents_profile;
  const containerRef = manifest?.content_refs?.initial_ordinary_container;
  if (manifestDigest !== MANIFEST_DIGEST
      || manifest?.schema !== 'rus.lower_dvina_trace_m8_content_manifest.v1'
      || manifest.package_id !== 'lower_dvina_trace_m8_content_v1'
      || manifest.scenario_definition_revision !== 20
      || manifest.revision !== 1 || manifest.status !== 'approved'
      || manifest.fallback_policy !== 'forbidden' || ref?.path !== FILE
      || ref.digest !== digest || ref.schema !== profile.schema
      || ref.id !== profile.profile_id || ref.revision !== profile.revision
      || containerRef?.path !== CONTAINER_FILE
      || containerRef.digest !== containerDigest
      || containerRef.schema !== initialContainer.schema
      || containerRef.id !== initialContainer.container_id
      || containerRef.revision !== initialContainer.revision
      || !validProfile(profile) || !validInitialContainer(initialContainer, profile)) fail();
  return freeze({ schema:'rus.lower_dvina_trace_o2b_loaded_profile.v1',
    artifact_digest:digest, profile, initial_container:initialContainer });
}

export function validLowerDvinaTraceO2bLoadedProfile(value) {
  const legacy = exact(value, ['schema','artifact_digest','profile']);
  const active = exact(value,
    ['schema','artifact_digest','profile','initial_container']);
  return (legacy || active)
    && value.schema === 'rus.lower_dvina_trace_o2b_loaded_profile.v1'
    && hex(value.artifact_digest) && validProfile(value.profile)
    && (!active || validInitialContainer(value.initial_container,
      value.profile));
}

function validProfile(value) {
  const active = value?.schema
    === 'rus.lower_dvina_trace_o2b_existing_container_profile.v2';
  const keys = ['schema','profile_id','revision','status','scenario_id',
    'scenario_definition_revision','policy','container_bindings',
    ...(active ? ['provisioning'] : []),'fallback_policy'];
  if (!exact(value, keys)
      || !active && value.schema !== 'rus.lower_dvina_trace_o2b_existing_container_profile.v1'
      || value.profile_id !== (active
        ? 'lower_dvina_trace_o2b_existing_container_profile_v2'
        : 'lower_dvina_trace_o2b_existing_container_profile_v1')
      || value.revision !== (active ? 2 : 1) || value.status !== 'approved'
      || value.scenario_id !== 'lower_dvina_trace_v1'
      || value.scenario_definition_revision !== (active ? 20 : 19)
      || value.fallback_policy !== 'forbidden') return false;
  const policy = value.policy;
  return exact(policy, ['policy_ref','required_context_schema',
    'ordinary_policy_schema','max_new_entities_cap','allowed_authority_classes',
    'allowed_admission_classes','allowed_availability_classes',
    'allowed_disclosure_states'])
    && text(policy.policy_ref)
    && policy.required_context_schema
      === 'rus.items.existing_container_ordinary_context.v1'
    && policy.ordinary_policy_schema
      === 'rus.items.existing_container_ordinary_policy.v2'
    && Number.isSafeInteger(policy.max_new_entities_cap)
    && policy.max_new_entities_cap >= 1 && policy.max_new_entities_cap <= 8
    && same(policy.allowed_authority_classes, ['ordinary'])
    && same(policy.allowed_admission_classes, ['common_mundane'])
    && same(policy.allowed_availability_classes, ['common'])
    && same(policy.allowed_disclosure_states, ['concealed'])
    && Array.isArray(value.container_bindings)
    && value.container_bindings.every(validBinding)
    && (!active || value.container_bindings.length === 1
      && validProvisioning(value.provisioning, value.container_bindings[0]))
    && new Set(value.container_bindings.map(({ container_ref: ref }) => ref))
      .size === value.container_bindings.length;
}

function validProvisioning(value, binding) {
  if (!exact(value, ['container_ref','template_id','category_id',
    'mechanics_profile_ref','owner_controller_ref','property_ref',
    'site_function_ref','economic_context_ref','context_bound_permission_refs',
    'ordinary_policy','authoritative_status','container_inventory_profile',
    'container_compatibility','mechanics_policy','objective_context_refs',
    'identity_budget','resolution_record_cap'])) return false;
  const basis = {owner_controller_ref:value.owner_controller_ref,
    property_ref:value.property_ref,site_function_ref:value.site_function_ref,
    economic_context_ref:value.economic_context_ref,
    context_bound_permission_refs:value.context_bound_permission_refs,
    ordinary_policy:value.ordinary_policy,
    authoritative_status:value.authoritative_status,
    container_inventory_profile:value.container_inventory_profile,
    container_compatibility:value.container_compatibility,
    mechanics_policy:value.mechanics_policy};
  return value.container_ref === binding.container_ref
    && value.template_id === binding.template_id
    && value.mechanics_profile_ref === binding.mechanics_profile_ref
    && canonicalDigest(value.container_inventory_profile)
      === binding.mechanics_profile_digest
    && canonicalDigest(value.ordinary_policy) === binding.ordinary_policy_digest
    && canonicalDigest(basis) === binding.context_digest
    && value.authoritative_status === 'absent'
    && Array.isArray(value.context_bound_permission_refs)
    && value.context_bound_permission_refs.length === 0
    && Number.isSafeInteger(value.identity_budget)
    && value.identity_budget >= 0
    && value.identity_budget
      <= value.ordinary_policy.technical_limits.max_new_entities
    && Number.isSafeInteger(value.resolution_record_cap)
    && value.resolution_record_cap >= value.identity_budget + 2;
}

function validInitialContainer(value, profile) {
  const binding = profile?.container_bindings?.[0];
  return exact(value, ['schema','container_id','revision','status','scenario_id',
    'scenario_definition_revision','template_ref','first_entry_placement',
    'container_state','fallback_policy'])
    && value.schema === 'rus.trace_initial_ordinary_container.v1'
    && value.container_id === binding?.container_ref
    && value.revision === 1 && value.status === 'approved'
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 20
    && value.template_ref?.template_id === binding.template_id
    && value.template_ref?.mechanics_profile_ref
      === binding.mechanics_profile_ref
    && value.template_ref?.mechanics_profile_digest
      === binding.mechanics_profile_digest
    && value.first_entry_placement?.holder_rule
      === 'first_entry_player_character'
    && value.first_entry_placement?.owner_rule
      === 'first_entry_player_character'
    && value.first_entry_placement?.controller_rule
      === 'first_entry_player_character'
    && value.first_entry_placement?.position_rule
      === 'sealed_first_entry_position'
    && value.container_state?.authoritative_contents_status === 'absent'
    && value.fallback_policy === 'forbidden';
}
function validBinding(value) {
  return exact(value, ['binding_id','container_ref','template_id',
    'mechanics_profile_ref','mechanics_profile_digest','context_digest',
    'ordinary_policy_digest','status'])
    && [value.binding_id,value.container_ref,value.template_id,
      value.mechanics_profile_ref].every(text)
    && [value.mechanics_profile_digest,value.context_digest,
      value.ordinary_policy_digest].every(hex)
    && value.status === 'approved';
}
function exact(value, keys) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.trim() === value
  && value.length > 0; }
function hex(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function same(left, right) { return Array.isArray(left)
  && left.length === right.length
  && left.every((value, index) => value === right[index]); }
function freeze(value) { if (value && typeof value === 'object'
  && !Object.isFrozen(value)) { Object.values(value).forEach(freeze);
  Object.freeze(value); } return value; }
function fail() { throw Object.assign(new Error(
  'TRACE_O2B_PROFILE_INVALID'), { code:'TRACE_O2B_PROFILE_INVALID' }); }
