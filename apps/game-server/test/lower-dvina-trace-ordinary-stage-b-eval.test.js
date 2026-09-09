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

test('active O1 cutover pins the complete adversarial Stage B corpus', async () => {
  const contract = await evalContract();
  assert.equal(validateLowerDvinaTraceOrdinaryStageBEval(contract), true);
  assert.deepEqual(contract.cases.map(({ id }) => id).sort(), [
    'anachronism', 'evidence-clue', 'letter-document',
    'misleading-common-name', 'significant-hidden', 'silver-currency',
    'sword-weapon'
  ]);
  const outputs = qualifiedOutputs(contract);
  assert.deepEqual(evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
    eval_contract: contract, outputs
  }), { pass: true, failed_case_ids: [] });
  assert.deepEqual(lowerDvinaTraceOrdinaryStageBQualificationCases(contract)
    .map(({ id }) => id).sort(), [...contract.cases.map(({ id }) => id),
    'boot-print-trace', 'puddle-surface', 'shadow-observation',
    'smoke-condition', 'common-mundane-positive'].sort());
});

test('Stage B eval catches sensitive materialization hidden behind common fields', async () => {
  const contract = await evalContract();
  for (const probe of contract.cases) {
    const outputs = qualifiedOutputs(contract);
    const output = outputs.find(({ id }) => id === probe.id);
    output.resolution = 'materialize';
    output.entities = [{ authority_class: 'ordinary',
      admission_class: 'common_mundane', functional_bucket: 'household',
      semantic_descriptor: { name: probe.query } }];
    const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
      eval_contract: contract, outputs
    });
    assert.equal(report.pass, false, probe.id);
    assert.deepEqual(report.failed_case_ids, [probe.id]);
  }
});

test('Stage B eval requires one bound common-positive result', async () => {
  const contract = await evalContract();
  const outputs = qualifiedOutputs(contract);
  const positive = outputs.find(({ id }) => id === 'common-mundane-positive');
  positive.entities[0].admission_class = 'weapon_or_armament';
  const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
    eval_contract: contract, outputs
  });
  assert.deepEqual(report, { pass: false,
    failed_case_ids: ['common-mundane-positive'] });
});

test('ordinary materialization prompt keeps a supported free candidate materializable', () => {
  const request = presenceRequest('ложка');
  const prompt = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(prompt, /seed_scope permits only seeded or no_change/u);
  assert.match(prompt, /resolve_presence permits materialize, absent, no_change, or authority_required/u);
  assert.match(prompt, /Decide only whether and how the supplied ordinary candidate is semantically realized/u);
  assert.match(prompt, /Lack of a pre-supplied descriptor alone is not a reason for absent/u);
  assert.match(prompt, /candidate_query\.candidate_hint identifies what is sought, not evidence/u);
  assert.match(prompt, /never promote an unsupported presupposition from the query into a fact/u);
  assert.match(prompt, /general question about people, current activity, or the situation is not an ordinary item candidate/u);
  assert.match(prompt, /never turn a person, event, place, or question into an item name or item fact/u);
  assert.match(prompt, /semantic_materialization_kind/u);
  assert.match(prompt, /sought referent in complete candidate_hint/u);
  assert.match(prompt, /environmental trace, surface condition, spatial state/u);
  assert.match(prompt, /server assembles/u);
  assert.match(prompt, /availability_class is common or context_bound/u);
  assert.match(prompt, /authority_envelope/u);
  assert.doesNotMatch(prompt, /простая верёвка|cordage/u);
  assert.doesNotMatch(prompt, /Schema-valid fallback skeleton/u);
});

test('ordinary materialization prompt exposes exact code-owned mechanics bounds', () => {
  const prompt = buildOrdinaryMaterializationMessages(presenceRequest('обломок доски'), {
    mechanicsPolicy: { policy_ref: 'mechanics', max_mass_grams: 20_000,
      allowed_external_hand_costs: [0, 1, 2],
      allowed_carry_forms: ['compact', 'regular', 'long', 'bulky'],
      max_packing_slot_cost: 16, max_quantity: 1 }
  })[0].content;
  assert.match(prompt, /mass_grams is an integer from 1 to 20000/u);
  assert.match(prompt, /external_hand_cost is exactly one of \[0,1,2\]/u);
  assert.match(prompt,
    /carry_form is exactly one of \["compact","regular","long","bulky"\]/u);
  assert.match(prompt, /packing_slot_cost is an integer from 0 to 16/u);
  assert.match(prompt, /quantity\.value is an integer from 1 to 1/u);
  assert.match(prompt, /Never invent another carry_form/u);
});

test('ordinary materialization absent prompt permits only its exact absent plan', () => {
  const source = presenceRequest('ложка');
  const request = { ...source, authority_envelope: { ...source.authority_envelope,
    selected_supporting_basis_ref: null } };
  const prompt = buildOrdinaryMaterializationMessages(request, { repair: {
    schema: 'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }]
  } })[0].content;
  assert.match(prompt, /Return exactly/u);
  assert.match(prompt, /"resolution":"absent"/u);
  assert.match(prompt, /Validation errors: \[\{"path":"resolution","keyword":"enum"\}\]/u);
  assert.doesNotMatch(prompt, /seed_scope|materialize|descriptor|mechanics|authority_required|no_change/u);
});

test('frozen ordinary probes carry code-owned Stage A and Stage B envelopes', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  const fixtures = corpus.fixtures.filter(({ role_id }) =>
    role_id === 'ordinary_materialization');
  for (const fixture of fixtures) {
    const request = fixture.repair ? fixture.request.request
      : JSON.parse(fixture.messages.at(-1).content);
    assert.equal(Object.hasOwn(request, 'authority_envelope'), true);
  }
  const common = fixtures.find(({ id }) => id === 'ordinary-stage-b-common-cordage');
  const commonRequest = JSON.parse(common.messages.at(-1).content);
  assert.deepEqual(commonRequest.authority_envelope.candidate, {
    semantic_type: 'cordage', functional_bucket: 'other_ordinary',
    admission_class: 'common_mundane', availability_class: 'common',
    coverage_kind: 'visible_surface', coverage_ref: 'bench'
  });
  for (const id of ['ordinary-stage-b-sword-absent',
    'ordinary-stage-b-silver-absent', 'ordinary-stage-b-letter-absent']) {
    const fixture = fixtures.find((candidate) => candidate.id === id);
    const request = JSON.parse(fixture.messages.at(-1).content);
    assert.notEqual(request.authority_envelope.candidate.admission_class,
      'common_mundane');
  }
});

test('ordinary materialization prompt maps Stage A to its candidate-free fallback', () => {
  const stageB = presenceRequest('ложка');
  const request = { ...stageB, mode: 'seed_scope', candidate_query: null,
    authority_envelope: { stage: 'seed_scope', density_bands: ['ordinary'],
      disclosure_policy_refs: ['disclosure'], group_bases: [{ basis_ref: 'basis',
        basis_state: 'committed', functional_buckets: ['other_ordinary'],
        allowed_admission_classes: ['common_mundane'], permission_refs: [] }] } };
  const prompt = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(prompt, /seed_scope permits only seeded or no_change/u);
  assert.match(prompt, /"resolution":"seeded"/u);
  assert.match(prompt, /"descriptor":null/u);
  assert.match(prompt, /Never copy angle-bracket placeholders/u);
  assert.match(prompt, /natural Russian suitable for later player-facing prose/u);
  assert.match(prompt, /"basis_refs":\["basis"\]/u);
  assert.doesNotMatch(prompt, /ordinary_candidate_/u);
});

test('ordinary seed prompt receives a player-safe scene basis without reading refs', () => {
  const source = presenceRequest('ложка');
  const request = { ...source, mode: 'seed_scope', candidate_query: null,
    ordinary_state: { ...source.ordinary_state, seeded: false,
      density_band: null },
    authority_envelope: { stage: 'seed_scope', density_bands: ['ordinary'],
      disclosure_policy_refs: ['disclosure'], group_bases: [{
        basis_ref: 'basis', basis_state: 'committed',
        functional_buckets: ['other_ordinary'],
        allowed_admission_classes: ['common_mundane'], permission_refs: [] }] }
  };
  const prompt = buildOrdinaryMaterializationMessages(request, {
    semanticContext: { visible_scene: 'речной берег',
      sensory_details: ['У воды лежат обломки досок.'],
      visible_objects: [] }
  })[0].content;
  assert.match(prompt, /All refs and IDs are opaque/u);
  assert.match(prompt, /У воды лежат обломки досок/u);
  assert.match(prompt, /one to three concrete co-present mundane physical groups/u);
  assert.match(prompt, /Never answer with an abstract category/u);
  assert.match(prompt, /never invent a visit, owner, action, purpose, origin, or past event/u);
  assert.match(prompt, /propose one distinct new ordinary group/u);
  assert.match(prompt, /do not restate, paraphrase, combine, or summarize/u);
});

test('ordinary materialization prompt carries complete code-owned Stage B shapes', () => {
  const source = presenceRequest('любой предмет');
  const preparedBasis = 'ordinary_group_prepared';
  const request = { ...source, policy_refs: { ...source.policy_refs,
    allowed_supporting_bases: [{ basis_ref: 'generic_basis', basis_state: 'committed' },
      { basis_ref: preparedBasis, basis_state: 'prepared_seed' }] },
  ordinary_state: { ...source.ordinary_state, background_groups: [preparedBasis] },
  authority_envelope: { ...source.authority_envelope,
    allowed_supporting_bases: [{ basis_ref: 'generic_basis', basis_state: 'committed' },
      { basis_ref: preparedBasis, basis_state: 'prepared_seed' }],
    selected_supporting_basis_ref: preparedBasis } };
  const admitted = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(admitted, /"resolution":"materialize"/u);
  assert.match(admitted, /"admission_class":"common_mundane"/u);
  assert.match(admitted, /semantic_admission_class/u);
  assert.match(admitted, /semantic_materialization_kind/u);
  assert.match(admitted, /"property_basis_ref":"property"/u);
  assert.match(admitted, /"position_ref":"bench"/u);
  assert.match(admitted, /"supporting_basis_ref":"ordinary_group_prepared"/u);
  assert.match(admitted, /"mass_grams":"<semantic_integer_mass_grams>"/u);
  assert.match(admitted, /"external_hand_cost":"<semantic_integer_external_hand_cost>"/u);
  assert.match(admitted, /"packing_slot_cost":"<semantic_integer_packing_slot_cost>"/u);
  assert.match(admitted,
    /never copy the player's intended use, action, goal, or hoped-for result/u);
  assert.doesNotMatch(admitted, /"mass_grams":1/u);
});

test('Stage B fails closed when its semantic admission differs from the candidate', () => {
  const request = presenceRequest('подходящий предмет');
  const plan = bindOrdinaryMaterializationPlan(request, {
    resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'weapon_or_armament',
    reason_code: 'found', entities: [{
      semantic_descriptor: { semantic_type: 'free_descriptor',
        name: 'свободное описание', facts: [] },
      presence_expectation: 'plausible', mechanics_proposal: {
        mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 0, quantity: { value: 1, unit: 'item' },
        container: null
      }
    }]
  });
  assert.equal(plan.resolution, 'absent');
  assert.deepEqual(plan.entities, []);
  assert.equal(plan.reason_code, 'semantic_admission_mismatch');
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, request), []);
});

test('Stage B checks semantic admission before a missing materialization kind', () => {
  const request = presenceRequest('подходящий предмет');
  const plan = bindOrdinaryMaterializationPlan(request, {
    resolution: 'no_change', semantic_admission_class: 'other_restricted',
    reason_code: 'not_an_item'
  });
  assert.equal(plan.resolution, 'absent');
  assert.equal(plan.reason_code, 'semantic_admission_mismatch');
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, request), []);
});

test('Stage B binds environmental details to no_change before item mechanics', () => {
  for (const query of ['след сапога на мокром песке', 'лужа на дороге',
    'колея в грязи', 'дым над берегом', 'сырость на досках', 'тень под навесом']) {
    const request = presenceRequest(query);
    assert.equal(request.authority_envelope.candidate.admission_class,
      'common_mundane');
    const plan = bindOrdinaryMaterializationPlan(request, {
      resolution: 'materialize', semantic_materialization_kind: 'non_item_detail',
      semantic_admission_class: 'common_mundane', reason_code: 'observed',
      entities: [{ semantic_descriptor: { semantic_type: 'ordinary_object_candidate',
        name: query, facts: [] }, presence_expectation: 'plausible',
      mechanics_proposal: { mass_grams: 100, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 0,
        quantity: { value: 1, unit: 'item' }, container: null } }]
    });
    assert.equal(plan.resolution, 'no_change', query);
    assert.deepEqual(plan.entities, [], query);
    assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, request), [], query);
  }
});

test('Stage B requires a materialization kind and accepts a standalone common item', () => {
  const request = presenceRequest('обычная верёвка');
  const missing = bindOrdinaryMaterializationPlan(request, {
    resolution: 'materialize', semantic_admission_class: 'common_mundane',
    reason_code: 'found', entities: []
  });
  assert.equal(missing.semantic_materialization_kind, null);
  assert.notDeepEqual(validateOrdinaryMaterializationPlanV1(missing, request), []);
  const plan = bindOrdinaryMaterializationPlan(request, {
    resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'common_mundane', reason_code: 'found', entities: [{
      semantic_descriptor: { semantic_type: 'cordage', name: 'обычная верёвка', facts: [] },
      presence_expectation: 'routine', mechanics_proposal: { mass_grams: 350,
        external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null }
    }]
  });
  assert.equal(plan.resolution, 'materialize');
  assert.equal(plan.entities.length, 1);
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, request), []);
});

test('grounded Stage B materializes only with a claim ref from its current slice',
  async () => {
    const request = presenceRequest('обычная верёвка');
    const claimRef = 'claim:test-cordage';
    const grounded = { ...request, world_knowledge: {
      facts: [{ claim_ref: claimRef }], hard_constraints: []
    } };
    const semantic = { resolution: 'materialize',
      semantic_materialization_kind: 'standalone_item',
      semantic_admission_class: 'common_mundane', reason_code: 'found',
      entities: [{ semantic_descriptor: { semantic_type: 'cordage',
        name: 'обычная верёвка', facts: [] }, presence_expectation: 'routine',
      mechanics_proposal: { mass_grams: 350, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null } }] };
    for (const refs of [undefined, ['claim:not-in-current-slice']]) {
      const rejected = bindOrdinaryMaterializationPlan(grounded,
        { ...semantic, ...(refs == null ? {} : {
          world_knowledge_claim_refs: refs }) });
      assert.notDeepEqual(validateOrdinaryMaterializationPlanV1(rejected,
        request), []);
    }
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const model = createOrdinaryMaterializationModel({
      stageBApprovalReceipt: approval,
      worldKnowledgeGrounder: { async ground(input, purpose) {
        assert.equal(purpose, 'materialization_support');
        return { ...input, world_knowledge: grounded.world_knowledge };
      } },
      roleRunner: { async run(input) {
        const supplied = JSON.parse(input.messages[1].content);
        assert.deepEqual(supplied.world_knowledge, grounded.world_knowledge);
        return { provider_record: modelIdentity(), output: { ...semantic,
          world_knowledge_claim_refs: [claimRef] } };
      } }
    });
    const admitted = await model(request, { repair: null });
    assert.equal(admitted.resolution, 'materialize');
    assert.equal(admitted.entities[0].semantic_descriptor.name,
      'обычная верёвка');
    assert.deepEqual(validateOrdinaryMaterializationPlanV1(admitted, request), []);
  });

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
