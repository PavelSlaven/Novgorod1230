import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  ORDINARY_MATERIALIZATION_EVAL_FIXTURES,
  assertOrdinaryMaterializationEvalFixture,
  buildOrdinaryMaterializationStageARequest,
  evaluateOrdinaryMaterializationEvalFixture,
  validateOrdinaryMaterializationEvalCorpus,
  validateOrdinaryMaterializationEvalFixture
} from '../src/ordinary-materialization-eval.js';
import { validateOrdinaryMaterializationRequestV1 } from '@rus/contracts';

const fixture = (id) => ORDINARY_MATERIALIZATION_EVAL_FIXTURES.find((entry) => entry.id === id);
const validPlan = (entry, overrides = {}) => ({
  schema: 'ordinary_materialization_plan_v1', request_id: entry.objective_context.request_id,
  resolution: 'seeded', density_band_proposal: 'sparse', background_groups: [], entities: [],
  presence_resolutions: [], reason_code: 'eval-fixture', ...overrides
});

test('eval corpus is complete, stable, immutable, and uses unique fixture ids', () => {
  const required = ['poor_hut', 'rich_hut', 'household_context', 'work_context', 'sword_prompt', 'silver_money_prompt', 'document_prompt', 'anachronism_probe', 'stage_a_candidate_leakage', 'over_enumeration', 'property_inheritance', 'identity_budget_pressure'];
  const tags = new Set(ORDINARY_MATERIALIZATION_EVAL_FIXTURES.flatMap((entry) => entry.tags));
  for (const tag of required) assert.ok(tags.has(tag), `missing ${tag}`);
  assert.equal(new Set(ORDINARY_MATERIALIZATION_EVAL_FIXTURES.map((entry) => entry.id)).size, ORDINARY_MATERIALIZATION_EVAL_FIXTURES.length);
  for (const entry of ORDINARY_MATERIALIZATION_EVAL_FIXTURES) { assert.equal(validateOrdinaryMaterializationEvalFixture(entry).length, 0); assert.ok(Object.isFrozen(entry)); assert.ok(Object.isFrozen(entry.objective_context)); }
  assert.throws(() => { ORDINARY_MATERIALIZATION_EVAL_FIXTURES[0].id = 'mutated'; }, TypeError);
});

test('Stage A builder is deterministic, contract-valid, immutable, and independent from actor probe', () => {
  const entry = fixture('stage-a-candidate-leak-v1');
  const first = buildOrdinaryMaterializationStageARequest(entry);
  const second = buildOrdinaryMaterializationStageARequest(entry);
  assert.deepEqual(first, second); assert.notStrictEqual(first, second); assert.ok(Object.isFrozen(first));
  assert.equal(validateOrdinaryMaterializationRequestV1(first).length, 0);
  assert.equal(first.mode, 'seed_scope'); assert.equal(first.candidate_query, null); assert.equal(Object.hasOwn(first, 'evidence_weight'), false);
  const raw = JSON.stringify(first); assert.equal(raw.includes('evidence_weight'), false); for (const poison of Object.values(entry.actor_probe)) assert.equal(raw.includes(poison), false);
  assert.throws(() => { first.context_refs.period_ref = 'mutated'; }, TypeError);
  const copied = assertOrdinaryMaterializationEvalFixture(entry); assert.notStrictEqual(copied, entry); assert.notStrictEqual(copied.objective_context, entry.objective_context); assert.ok(Object.isFrozen(copied));
});

test('harness reports malformed fixtures, malformed output, leakage, enumeration, and semantic expectation mismatches diagnostically', () => {
  const malformed = structuredClone(fixture('poor-hut-household-v1')); malformed.extra = true;
  assert.ok(validateOrdinaryMaterializationEvalFixture(malformed).length > 0);
  assert.throws(() => assertOrdinaryMaterializationEvalFixture(malformed), { code: 'ORDINARY_EVAL_FIXTURE_INVALID' });
  const accessor = {};
  for (const [key, value] of Object.entries(fixture('poor-hut-household-v1'))) if (key !== 'id') Object.defineProperty(accessor, key, { enumerable: true, value });
  Object.defineProperty(accessor, 'id', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.ok(validateOrdinaryMaterializationEvalFixture(accessor).length > 0);
  const leak = fixture('stage-a-candidate-leak-v1');
  const leakReport = evaluateOrdinaryMaterializationEvalFixture({ fixture: leak, stage_a_plan: validPlan(leak, { reason_code: leak.actor_probe.candidate }) });
  assert.ok(leakReport.diagnostics.some((item) => item.code === 'STAGE_A_PLAN_ACTOR_PROBE_LEAK'));
  const enumerated = fixture('over-enumeration-v1');
  const entities = [1, 2].map((number) => ({ semantic_descriptor: { semantic_type: `type-${number}`, name: `name-${number}`, facts: [] }, authority_class: 'ordinary', admission_class: 'common_mundane', availability_class: 'common', functional_bucket: 'household', presence_expectation: 'routine', supporting_basis_ref: 'eval-basis-household', causal_basis: { basis_kind: 'eval', basis_refs: ['eval-basis-household'] }, property_basis_ref: 'eval-property-household', placement_proposal: { scope_ref: 'scope', position_ref: 'position' }, mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'held', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null } }));
  const enumerationReport = evaluateOrdinaryMaterializationEvalFixture({ fixture: enumerated, stage_a_plan: validPlan(enumerated, { resolution: 'materialize', entities }) });
  assert.ok(enumerationReport.diagnostics.some((item) => item.code === 'STAGE_A_ENTITY_ENUMERATION_EXCEEDED'));
  const sword = fixture('sword-prompt-v1');
  const mismatch = evaluateOrdinaryMaterializationEvalFixture({ fixture: sword, stage_a_plan: validPlan(sword, { resolution: 'materialize', entities: [{ ...entities[0], admission_class: 'weapon_or_armament' }] }) });
  assert.ok(mismatch.diagnostics.some((item) => item.code === 'STAGE_A_FORBIDDEN_ADMISSION_CLASS'));
  const property = fixture('property-inheritance-v1');
  const propertyMismatch = evaluateOrdinaryMaterializationEvalFixture({ fixture: property, stage_a_plan: validPlan(property, { resolution: 'materialize', entities: [{ ...entities[0], property_basis_ref: 'wrong-property' }] }) });
  assert.ok(propertyMismatch.diagnostics.some((item) => item.code === 'STAGE_A_PROPERTY_EXPECTATION_MISMATCH'));
  const budget = fixture('identity-budget-pressure-v1');
  const budgetReport = evaluateOrdinaryMaterializationEvalFixture({ fixture: budget, stage_a_plan: validPlan(budget, { resolution: 'materialize', entities: Array.from({ length: 9 }, (_, index) => ({ ...structuredClone(entities[0]), semantic_descriptor: { semantic_type: `budget-${index}`, name: `budget-${index}`, facts: [] } })) }) });
  assert.ok(budgetReport.diagnostics.some((item) => item.code === 'STAGE_A_IDENTITY_BUDGET_FILL_PRESSURE'));
  const invalid = evaluateOrdinaryMaterializationEvalFixture({ fixture: sword, stage_a_plan: { malformed: true } });
  assert.ok(invalid.diagnostics.some((item) => item.code === 'STAGE_A_PLAN_INVALID'));
});

test('supplied Stage A request must exactly equal the fixture objective request', () => {
  const entry = fixture('poor-hut-household-v1');
  const request = buildOrdinaryMaterializationStageARequest(entry);
  assert.equal(evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_request: request }).pass, true);
  for (const mutate of [
    (value) => { value.request_id = 'other'; },
    (value) => { value.scope_ref.entity_id = 'other'; },
    (value) => { value.context_refs.period_ref = 'other'; },
    (value) => { value.policy_refs.density_policy_ref = 'other'; },
    (value) => { value.ordinary_state.remaining_identity_budget = 0; },
    (value) => { value.technical_limits.max_new_entities = 1; }
  ]) {
    const changed = structuredClone(request); mutate(changed);
    assert.ok(evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_request: changed }).diagnostics.some((item) => item.code === 'STAGE_A_REQUEST_OBJECTIVE_MISMATCH'));
  }
});

test('sensitive Stage A fixtures permit empty seed but diagnose attempts without inventing policy', () => {
  for (const [id, forbidden] of [['sword-prompt-v1', 'weapon_or_armament'], ['silver-money-prompt-v1', 'currency_or_precious'], ['document-informational-prompt-v1', 'document_like']]) {
    const entry = fixture(id); assert.equal(evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_plan: validPlan(entry) }).pass, true);
    const base = { semantic_descriptor: { semantic_type: 'eval', name: 'eval', facts: [] }, authority_class: 'ordinary', admission_class: 'common_mundane', availability_class: 'common', functional_bucket: 'household', presence_expectation: 'routine', supporting_basis_ref: 'eval-basis-household', causal_basis: { basis_kind: 'eval', basis_refs: ['eval-basis-household'] }, property_basis_ref: 'eval-property-household', placement_proposal: { scope_ref: 'scope', position_ref: 'position' }, mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'held', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null } };
    const common = evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_plan: validPlan(entry, { resolution: 'materialize', entities: [base] }) });
    assert.ok(common.diagnostics.some((item) => item.code === 'STAGE_A_ENTITY_ENUMERATION_EXCEEDED'));
    const restricted = evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_plan: validPlan(entry, { resolution: 'materialize', entities: [{ ...base, admission_class: forbidden }] }) });
    assert.ok(restricted.diagnostics.some((item) => item.code === 'STAGE_A_PLAN_INVALID'));
    assert.ok(restricted.diagnostics.some((item) => item.code === 'STAGE_A_FORBIDDEN_ADMISSION_CLASS'));
  }
});

test('data-only boundary is getter-free, cycle-safe, deterministic, and corpus-aware', () => {
  let reads = 0; const poisoned = {};
  Object.defineProperty(poisoned, 'fixture', { enumerable: true, get() { reads += 1; return fixture('poor-hut-household-v1'); } });
  assert.throws(() => evaluateOrdinaryMaterializationEvalFixture(poisoned), { code: 'ORDINARY_EVAL_INPUT_INVALID' }); assert.equal(reads, 0);
  const cyclic = {}; cyclic.fixture = cyclic;
  assert.throws(() => evaluateOrdinaryMaterializationEvalFixture(cyclic), { code: 'ORDINARY_EVAL_INPUT_INVALID' });
  const duplicateTags = structuredClone(ORDINARY_MATERIALIZATION_EVAL_FIXTURES); duplicateTags[0].tags.push(duplicateTags[0].tags[0]);
  assert.ok(validateOrdinaryMaterializationEvalCorpus(duplicateTags).some((item) => item.kind === 'duplicate'));
  const duplicateIds = structuredClone(ORDINARY_MATERIALIZATION_EVAL_FIXTURES); duplicateIds[1].id = duplicateIds[0].id;
  assert.ok(validateOrdinaryMaterializationEvalCorpus(duplicateIds).some((item) => item.code === 'ORDINARY_EVAL_CORPUS_DUPLICATE_ID'));
  const missing = structuredClone(ORDINARY_MATERIALIZATION_EVAL_FIXTURES).filter((entry) => !entry.tags.includes('poor_hut'));
  assert.ok(validateOrdinaryMaterializationEvalCorpus(missing).some((item) => item.code === 'ORDINARY_EVAL_CORPUS_REQUIRED_TAG_MISSING'));
  const entry = fixture('poor-hut-household-v1'); const reportA = evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_request: { extra_b: true, ...buildOrdinaryMaterializationStageARequest(entry), extra_a: true } }); const reportB = evaluateOrdinaryMaterializationEvalFixture({ fixture: entry, stage_a_request: { extra_a: true, ...buildOrdinaryMaterializationStageARequest(entry), extra_b: true } });
  assert.deepEqual(reportA, reportB);
});

test('eval subpath remains isolated from runtime production wiring', async () => {
  const source = await readFile(new URL('../src/ordinary-materialization-eval.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /@rus\/(turn|party-store|items-property)|apps\/game-server|fetch\(|Math\.random|Date\.|process\.env/i);
  const root = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(root, /ordinary-materialization-eval/);
});
