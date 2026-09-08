import { serverError } from '../errors.js';
import { evaluateLowerDvinaTraceOrdinaryStageBModelOutputs,
  lowerDvinaTraceOrdinaryStageBQualificationCases } from
  '../internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { buildOrdinaryMaterializationPresenceRequest } from
  './ordinary-materialization-seed-request.js';
import { validateOrdinaryMaterializationPlanV1 } from
  '@rus/contracts/ordinary-materialization-v1';
import { buildOrdinaryMaterializationMessages, ordinaryMaterializationResponseOf } from
  './ordinary-materialization-llm.js';
import { bindOrdinaryMaterializationPlan } from
  './ordinary-materialization-plan.js';

export function createOrdinaryMaterializationStageBQualifier({ roleRunner,
  evalContract } = {}) {
  return async (candidate) => {
    const result = await runOrdinaryMaterializationStageBQualification({
      roleRunner, evalContract, candidate });
    if (!result.report.pass) throw qualificationError(result.report.failed_case_ids);
    return result.identity;
  };
}

export async function runOrdinaryMaterializationStageBQualification({ roleRunner,
  evalContract, candidate } = {}) {
  if (typeof roleRunner?.run !== 'function' || typeof roleRunner?.describe !== 'function') {
    throw new TypeError('Stage B qualification requires LLM role transport.');
  }
  const invocation = { scope: 'turn_runtime', role_id: 'ordinary_materialization',
    overrides: { temperature: 0, maxTokens: 20_000, requestTimeoutMs: 120_000 }, provider_snapshot: candidate };
  const identity = roleRunner.describe(invocation);
  try {
    const probes = lowerDvinaTraceOrdinaryStageBQualificationCases(evalContract);
    if (probes == null) throw new Error('eval contract');
    const outputs = await Promise.all(probes.map(async (probe) => {
        const request = presenceRequest(probe);
        const output = await qualifiedOutput({ roleRunner, invocation, identity,
          request });
        return { id: probe.id,
          resolution: validateOrdinaryMaterializationPlanV1(output, request).length === 0
            ? output.resolution : null,
          entities: output.entities };
      }));
    const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
      eval_contract: evalContract, outputs });
    return Object.freeze({ identity, outputs: Object.freeze(outputs), report });
  } catch (error) {
    if (error?.code === 'LLM_SETTINGS_ORDINARY_STAGE_B_QUALIFICATION_FAILED') throw error;
    throw qualificationError([]);
  }
}

async function qualifiedOutput({ roleRunner, invocation, identity, request }) {
  const first = await invoke({ roleRunner, invocation, identity, request,
    repair: null, mechanicsPolicy: qualificationMechanicsPolicy() });
  const errors = validateOrdinaryMaterializationPlanV1(first, request);
  if (errors.length === 0) return first;
  return invoke({ roleRunner, invocation, identity, request,
    mechanicsPolicy: qualificationMechanicsPolicy(), repair: {
    schema: 'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: errors
  } });
}

async function invoke({ roleRunner, invocation, identity, request, repair,
  mechanicsPolicy }) {
  const response = await roleRunner.run({ ...invocation, repair: repair !== null,
    messages: buildOrdinaryMaterializationMessages(request, { repair,
      mechanicsPolicy }) });
  const outputResponse = ordinaryMaterializationResponseOf(response);
  if (!sameIdentity(identity, outputResponse.provider_record)) throw new Error('identity');
  return bindOrdinaryMaterializationPlan(request, outputResponse.output);
}
function qualificationMechanicsPolicy() {
  return { policy_ref: 'stage-b', max_mass_grams: 20_000,
    allowed_external_hand_costs: [0, 1, 2],
    allowed_carry_forms: ['compact', 'regular', 'long', 'bulky'],
    max_packing_slot_cost: 16, max_quantity: 1 };
}

function qualificationError(failedCaseIds) {
  return serverError('LLM_SETTINGS_ORDINARY_STAGE_B_QUALIFICATION_FAILED',
    'Custom LLM settings failed ordinary-materialization qualification.', {
      status: 422, details: { failed_case_ids: failedCaseIds }
    });
}
function sameIdentity(expected, actual) {
  return ['provider', 'model', 'scope', 'role_id', 'config_hash'].every((key) =>
    expected?.[key] === actual?.[key]);
}
function presenceRequest(probe) {
  const { id, query } = probe;
  const scope_ref = { entity_kind: 'g6', entity_id: 'stage-b-qualification' };
  return buildOrdinaryMaterializationPresenceRequest({ objective_context: {
    request_id: `llm-settings:ordinary-stage-b:${id}`, scope_ref: { ...scope_ref },
    context_refs: { period_ref: 'stage-b', region_ref: 'stage-b', function_refs: [],
      environment_refs: [], occupation_household_refs: [], economic_context_ref: 'stage-b',
      occupancy_state_ref: 'stage-b', material_culture_refs: [], property_context_ref: 'stage-b' },
    policy_refs: { authority_policy_ref: 'stage-b', density_policy_ref: 'stage-b',
      ordinary_presence_policy_ref: 'stage-b', runtime_item_mechanics_policy_ref: 'stage-b',
      allowed_admission_classes: ['common_mundane'], context_bound_permission_refs: [],
      allowed_supporting_bases: [{ basis_ref: 'stage-b', basis_state: 'committed' }] },
    ordinary_state: { seeded: true, density_band: 'ordinary', remaining_identity_budget: 1,
      background_groups: [], presence_resolutions: [], closed_observation_scopes: [] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 4 }, ordinary_state_version: 1,
    property_placement_context: { scope_ref: { ...scope_ref }, item_kind: 'man_made',
      property_catalog_version_ref: 'stage-b', placement_catalog_version_ref: 'stage-b',
      personal_communal_refs: [], occupied_site_refs: ['stage-b'], unowned_cause_refs: [],
      placement_context_refs: ['stage-b'], property_catalog: [{ property_basis_ref: 'stage-b',
        state: 'committed', scope_ref: { ...scope_ref }, basis_class: 'occupied_site_default',
        source_ref: 'stage-b', unowned_cause_ref: null }], placement_catalog: [{
        position_ref: 'stage-b', state: 'committed', scope_ref: { ...scope_ref }, g6_ref: 'stage-b',
        containment_depth: 1, placement_context_ref: 'stage-b' }] }
  }, candidate_context: { normalized_candidate_ref: `stage-b-qualification:${id}`,
    normalizer_version: 'stage-b', semantic_type: 'ordinary_object_candidate',
    candidate_hint: query, functional_bucket: 'other_ordinary',
    admission_class: 'common_mundane', availability_class: 'common',
    coverage_kind: 'visible_surface', coverage_ref: `stage-b:${id}`, policy_version: 'stage-b' },
  selected_supporting_basis_ref: 'stage-b' }).request;
}
