import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  evaluateLowerDvinaTraceOrdinaryStageBModelOutputs,
  lowerDvinaTraceOrdinaryStageBQualificationCases,
  validateLowerDvinaTraceOrdinaryStageBEval
} from '../src/internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { bindOrdinaryMaterializationPlan,
  createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { buildOrdinaryMaterializationMessages } from
  '../src/runtime/ordinary-materialization-llm.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { validateOrdinaryMaterializationPlanV1 } from '@rus/contracts';
import { absentPlan, modelIdentity, presenceRequest } from
  './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';
import { enabled as discoveryEnabled, group as discoveryGroup,
  request as discoveryRequest } from './lower-dvina-trace-o1-fixture.js';

const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m7-content/'
  + 'ordinary-materialization-profile.json', import.meta.url);
const frozenRoleRequestsUrl = new URL('../../../data/model-evals/llm-runtime/'
  + 'frozen-role-requests-v1.json', import.meta.url);

async function evalContract() {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  return profile.stage_b_classification_eval;
}
function qualifiedOutputs(contract) {
  return lowerDvinaTraceOrdinaryStageBQualificationCases(contract).map((probe) =>
    probe.id === 'common-mundane-positive'
      ? { id: probe.id, resolution: 'materialize', entities: [{
        admission_class: 'common_mundane' }] }
      : { id: probe.id, resolution: probe.allowed_resolutions?.[0] ?? 'no_change',
        entities: [] });
}

test('production O1 binds incomplete Flash output to its request envelope', async () => {
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const request = { ...presenceRequest('верёвка'), policy_refs: {
    ...presenceRequest('верёвка').policy_refs,
    allowed_supporting_bases: [{ basis_ref: 'stage-b', basis_state: 'committed' }]
  }, authority_envelope: { ...presenceRequest('верёвка').authority_envelope,
    allowed_supporting_bases: [{ basis_ref: 'stage-b', basis_state: 'committed' }],
    selected_supporting_basis_ref: 'stage-b'
  } };
  const roleRunner = { async run() { return { provider_record: modelIdentity(),
    output: { resolution: 'materialize', semantic_materialization_kind: 'standalone_item', semantic_admission_class: 'common_mundane',
      reason_code: 'found', entities: [{
      semantic_descriptor: { semantic_type: 'cordage', name: 'верёвка', facts: [] },
      presence_expectation: 'routine', supporting_basis_ref: 'stage-b',
      causal_basis: { basis_kind: 'ordinary_presence', basis_refs: ['stage-b'] },
      placement_proposal: { position_ref: 'bench' }, mechanics_proposal: {
        mass_grams: 350, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null
      } }] } }; } };
  const output = await createOrdinaryMaterializationModel({ roleRunner,
    stageBApprovalReceipt: approval })(request, { repair: null });
  assert.equal(output.schema, 'ordinary_materialization_plan_v1');
  assert.equal(output.entities[0].admission_class, 'common_mundane');
  assert.equal(output.entities[0].property_basis_ref, 'property');
  assert.equal(output.entities[0].semantic_descriptor.name, 'верёвка');
});

test('ordinary assembly does not invent an omitted semantic reason', () => {
  const request = presenceRequest('верёвка');
  const plan = bindOrdinaryMaterializationPlan(request, {
    resolution: 'absent' });
  assert.equal(plan.reason_code, undefined);
  assert.notDeepEqual(validateOrdinaryMaterializationPlanV1(plan), []);
});

test('O1 production path drops unsupported provenance before preparing item', async () => {
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const enabled = discoveryEnabled();
  enabled.execution_context.stage_b_classification_eval = await evalContract();
  let calls = 0;
  const model = createOrdinaryMaterializationModel({ stageBApprovalReceipt: approval,
    roleRunner: { async run() { return { provider_record: modelIdentity(), output:
      ++calls === 1 ? { resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [{ descriptor: discoveryGroup().descriptor }],
        reason_code: 'seed' } : { resolution: 'materialize', reason_code: 'found',
        semantic_materialization_kind: 'standalone_item', semantic_admission_class: 'common_mundane',
        entities: [{ semantic_descriptor: { semantic_type: 'ordinary_wood',
          name: 'обломок доски', facts: ['фрагмент недавнего груза с разбитой телеги'] },
        presence_expectation: 'routine', mechanics_proposal: { mass_grams: 350,
          external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null } }] } }; } }
  });
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'unsupported-provenance', loadEnablement: async () => enabled,
    ordinaryMaterializationModel: model });
  const plan = (await resolver(discoveryRequest('найти обломок доски')))
    .ordinary_materialization_atomic_write_plan;
  assert.equal(calls, 2);
  assert.deepEqual(plan.item.item_proposal.semantic_descriptor, {
    semantic_type: 'ordinary_wood', name: 'обломок доски', facts: []
  });
});

test('production O1 assembles a semantic Stage A no_change choice', async () => {
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const request = { ...presenceRequest('ложка'), mode: 'seed_scope',
    candidate_query: null };
  const output = await createOrdinaryMaterializationModel({
    stageBApprovalReceipt: approval, roleRunner: { async run() {
      return { provider_record: modelIdentity(), output: {
        resolution: 'no_change', reason_code: 'no_change' } };
    } }
  })(request, { repair: null });
  assert.deepEqual(output, { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'no_change',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [], reason_code: 'no_change' });
});

test('Stage B eval boundary rejects accessors without reading them', async () => {
  const contract = await evalContract();
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'eval_contract', { enumerable: true,
    get() { reads += 1; return contract; } });
  Object.defineProperty(hostile, 'outputs', { enumerable: true, value: [] });
  const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs(hostile);
  assert.equal(report.pass, false);
  assert.equal(reads, 0);
});

test('production O1 model verifies the activation receipt without live probes',
  async () => {
    const contract = await evalContract();
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const calls = [];
    const roleRunner = { describe() { return modelIdentity(); }, async run(input) {
      calls.push(input);
      const request = JSON.parse(input.messages[1].content);
      return { output: { ...absentPlan(request),
        semantic_materialization_kind: 'standalone_item',
        semantic_admission_class: 'common_mundane' }, provider_record: modelIdentity() };
    } };
    const model = createOrdinaryMaterializationModel({ roleRunner,
      stageBApprovalReceipt: approval });
    const receipt = await model.verifyStageBCutover({
      eval_contract: contract });
    assert.equal(receipt.schema,
      'rus.ordinary_materialization_stage_b_approval_receipt.v1');
    assert.equal(receipt.model_identity.config_hash, modelIdentity().config_hash);
    assert.equal(calls.length, 0, 'gameplay cutover performs no eval calls');
    const request = presenceRequest('ложка');
    await model(request, { repair: null });
    await model(request, { repair: { schema:
      'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }] } });
    assert.equal(calls.length, 2, 'one normal call and one structural repair');
    assert.match(calls[1].messages[0].content, /single structural repair/u);
    await assert.rejects(model(request, { repair: { schema:
      'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }] } }), {
      code: 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID'
    });
    assert.equal(calls.length, 2, 'a repeated direct repair never reaches the LLM');
  });
