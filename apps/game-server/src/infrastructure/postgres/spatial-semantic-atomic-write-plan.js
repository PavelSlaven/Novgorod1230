import { assertSpatialSemanticRequirementsAdmitted, assertSpatialSemanticStructuralVariantAdmitted, materializeS1FormalSpatialProposal, validateSpatialSemanticResolution } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

const KEYS = ['schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'causal_identity', 'envelope_ref', 'expected_envelope_state_version',
  'resolution', 'formal_spatial_context'];

export function createSpatialSemanticAtomicWritePlan(input) {
  const plan = clone(input);
  if (!exact(plan, KEYS)
      || plan.schema !== 'spatial_semantic_atomic_write_plan_v1'
      || !text(plan.party_id) || !text(plan.change_set_id) || !text(plan.envelope_ref)
      || !integer(plan.base_party_state_version, 0)
      || !integer(plan.expected_envelope_state_version, 1)
      || !identity(plan.causal_identity) || !resolution(plan.resolution)
      || !context(plan.formal_spatial_context)
      || plan.resolution.party_id !== plan.party_id
      || plan.resolution.request_id !== plan.causal_identity.request_id
      || plan.resolution.causal_request_ref !== plan.causal_identity.action_ref
      || plan.resolution.envelope_ref !== plan.envelope_ref
      || !formalProposalBound(plan)) fail();
  try { assertSpatialSemanticStructuralVariantAdmitted(plan.formal_spatial_context.structural_variant); assertSpatialSemanticRequirementsAdmitted({
    semantic_requirements: plan.resolution.outcome.semantic_requirements,
    structural_variant: plan.formal_spatial_context.structural_variant,
    available_mechanics: plan.formal_spatial_context.available_mechanics,
    required_semantic_requirements: plan.formal_spatial_context.required_semantic_requirements
  }); } catch { fail(); }
  return freeze(plan);
}

export function spatialSemanticPhysicalKeys(input) {
  if (input == null) return [];
  const plan = createSpatialSemanticAtomicWritePlan(input);
  return [
    `party_runtime.party_spatial_semantic_envelopes:${plan.party_id}:${plan.envelope_ref}`,
    `party_runtime.party_spatial_semantic_resolutions:${plan.party_id}:${plan.causal_identity.request_id}`,
    ...spatialWrites(plan).map((write) => `party_runtime.${write.target_table}:${write.id}`)
  ];
}

export function spatialSemanticRows(input) { return spatialWrites(createSpatialSemanticAtomicWritePlan(input)); }

function spatialWrites(plan) {
  return plan.resolution.formal_spatial_proposal.rows.map(({ target_table, id, record }) => ({
    target_table, id, record: { party_id: plan.party_id, ...record,
      updated_change_set_id: plan.change_set_id,
      ...(target_table === 'entity_placements' ? {} : {
        created_change_set_id: plan.change_set_id, terminal_change_set_id: null }) }
  }));
}

function resolution(value) { try { validateSpatialSemanticResolution(value); return true; } catch { return false; } }
function identity(value) { return exact(value, ['request_id','root_turn_id','action_ref','step_index','actor_ref']) && ['request_id','root_turn_id','action_ref','actor_ref'].every((key) => text(value[key])) && integer(value.step_index, 1) && value.step_index <= 8; }
function context(value) { return exact(value, ['baseline_ref','g5_ref','kind','structural_variant','available_mechanics','required_semantic_requirements','topology'])
  && ['baseline_ref','g5_ref','kind','structural_variant'].every((key) => text(value[key]))
  && Array.isArray(value.available_mechanics) && new Set(value.available_mechanics).size === value.available_mechanics.length
  && value.available_mechanics.every((mechanic) => typeof mechanic === 'string')
  && Array.isArray(value.required_semantic_requirements)
  && new Set(value.required_semantic_requirements).size === value.required_semantic_requirements.length
  && value.required_semantic_requirements.every((requirement) => typeof requirement === 'string'); }
function formalProposalBound(plan) {
  const context = plan.formal_spatial_context;
  const actual = plan.resolution.formal_spatial_proposal;
  const expected = materializeS1FormalSpatialProposal({ party_id: plan.party_id,
    request_id: plan.causal_identity.request_id, local_ref: plan.resolution.local_ref,
    kind: context.kind, structural_variant: context.structural_variant,
    baseline_ref: context.baseline_ref, g5_ref: context.g5_ref,
    position_ref: plan.resolution.position_ref, topology: context.topology });
  return expected.ok && JSON.stringify(actual) === JSON.stringify(expected.proposal)
    && JSON.stringify(plan.resolution.formal_spatial_refs) === JSON.stringify(actual.refs);
}
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { try { return structuredClone(value); } catch { fail(); } }
function fail() { const error = new Error('SPATIAL_SEMANTIC_PLAN_INVALID'); error.code = 'SPATIAL_SEMANTIC_PLAN_INVALID'; throw error; }
