import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalDigest } from '@rus/materialization';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { createProductionWorldKnowledgeGrounder } from '../src/runtime/world-knowledge-grounding.js';
import { createOrdinaryMaterializationModel } from '../src/runtime/ordinary-materialization-llm.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { projectPreparedOrdinaryItem } from '../src/runtime/lower-dvina-trace-phase-2-player-safe.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { modelIdentity } from './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';
import { enabled, request as discoveryRequest } from './lower-dvina-trace-o1-fixture.js';
import { requestTurnStepPlanWithRepair } from '../../../packages/turn/src/turn-step-loop.js';
import { createLowerDvinaTraceTurnStepModel, assembleTurnStepPlan } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { turnStepRepairSpecificInstructions } from '../src/runtime/lower-dvina-trace-turn-step-repair-prompt.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

const sceneCatalog = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v28/scene-presentation-v3.json', import.meta.url), 'utf8'));
export const ordinaryCases = [
  { intent: 'Поднимаю длинную ветвь и осторожно прощупываю дно у берега.',
    query: 'длинная ветвь', location: 'trace_ld_v1_loc_wreck_shore',
    reason: 'Вещь пока не доступна для этого действия.' },
  { intent: 'Беру короткую жердь и подпираю ею мокрый свёрток.',
    query: 'короткая жердь', location: 'trace_ld_v1_loc_old_drying_shed',
    reason: 'Задуманное пока не имеет предметной опоры.' }
].map((entry) => {
  const scene = sceneCatalog.locations.find(({ location_ref }) => location_ref === entry.location);
  assert.ok(scene);
  return { ...entry, scene, sensory: [...scene.player_visible_physical_facts, scene.ordinary_background_descriptor],
    background: scene.ordinary_background_descriptor };
});

function inputFor(entry) {
  return request({ root_player_action: entry.intent, remaining_intent: entry.intent,
    player_safe_state: { position: { location_ref: entry.location },
      ordinary_resolution: { discovery_available: true, container_resolution_available: false,
        scene_seed_available: false }, current_visible_context: {
        visible_scene: entry.scene.display_name, sensory_details: entry.sensory } } });
}

test('actual focused search keeps its activity while full material intent binds inspect', () => {
  const input = inputFor(ordinaryCases[0]);
  const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'search', target_refs: [ordinaryCases[0].location], query: input.remaining_intent };
  const semantic = { ...output(), resolution: 'domain_request', operations: [operation], continuation: null };
  assert.equal(assembleTurnStepPlan(semantic, input).operations[0].discovery_kind, 'search');
  for (const discovery_kind of ['search', 'look']) {
    const prerequisite = assembleTurnStepPlan({ ...semantic,
      operations: [{ ...operation, discovery_kind, query: 'длинная ветвь' }],
      continuation: { remaining_intent: input.remaining_intent, depends_on_refs: [] } }, input);
    assert.equal(prerequisite.operations[0].discovery_kind, 'inspect');
  }
  const prepared = assembleTurnStepPlan({ ...semantic,
    operations: [{ ...operation, query: 'длинная ветвь' }],
    continuation: { remaining_intent: input.remaining_intent, depends_on_refs: [],
      prepared_followup_ref: 'prepared:later-step' } }, input);
  assert.equal(prepared.operations[0].discovery_kind, 'search');
  const repeated = assembleTurnStepPlan({ ...semantic,
    operations: [{ ...operation, query: `  ${input.remaining_intent.toUpperCase().replaceAll(' ', '  ')}  ` }],
    continuation: { remaining_intent: input.remaining_intent, depends_on_refs: [] } }, input);
  assert.equal(repeated.operations[0].discovery_kind, 'search');
  assert.equal(repeated.continuation, null);
});

export async function repairedOrdinaryPrerequisite(entry, { capturedWrongVerdict = false } = {}) {
  const input = inputFor(entry);
  const calls = [];
  const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: [entry.location], query: entry.query };
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    const payload = JSON.parse(call.messages[1].content);
    if (call.role_id === 'turn_step_planner') return { output: { ...output(),
      interpretation: { player_goal: entry.intent, grounded_attempt: entry.intent,
        adaptation: 'literal' }, reason_code: entry.reason_code ?? 'semantic_plan', reason: entry.reason } };
    if (call.role_id === 'turn_step_planner_repair') {
      const tail = turnStepRepairSpecificInstructions(payload, input).at(-1);
      assert.ok(call.messages[0].content.endsWith(tail));
      assert.match(tail, /Required literal denial repair:[\s\S]*MUST use ordinary_material_prerequisite/u);
      assert.match(tail, /replace the original operations, activity, goal_result and continuation together/u);
      assert.doesNotMatch(call.messages[0].content, /Re-plan only fields named|Otherwise use direct without operations/u);
      const shape = JSON.parse(tail.split("For a missing referent only, return this semantic mapping with its nominal query and current refs filled from the request: ").at(-1));
      assert.equal(shape.resolution, "domain_request");
      assert.equal(shape.operations[0].discovery_kind, "inspect");
      assert.equal(shape.continuation.remaining_intent, entry.intent);
      assert.deepEqual(payload.structural_errors.map(({ path, code }) => ({ path, code })),
        [{ path: '$.resolution', code: 'operation_semantic_grounding' }]);
      return { output: { ...output(), resolution: 'domain_request',
        interpretation: { player_goal: entry.intent, grounded_attempt: entry.intent,
          adaptation: 'literal' },
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ ...operation, discovery_kind: 'search' }], continuation: {
          remaining_intent: entry.intent, depends_on_refs: [] }, reason_code: 'semantic_plan' } };
    }
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    assert.ok(payload.operation, 'initial generic auditor is forbidden');
    assert.deepEqual(payload.operation, operation);
    assert.deepEqual(payload.continuation, { remaining_intent: entry.intent, depends_on_refs: [] });
    assert.match(call.messages[0].content, /continuation.remaining_intent точно равен полному remaining_intent[\s\S]*обязательно выбери mode="material_prerequisite" и consumed_intent=null/u);
    if (capturedWrongVerdict) return { output: { mode: 'focused_discovery', consumed_intent: entry.query } };
    // Captured auditor treated a nominal prerequisite as an executed discovery prefix.
    return { output: payload.correction_candidate === 'proposed_material_prerequisite'
      ? { mode: 'material_prerequisite', consumed_intent: null }
      : { mode: 'focused_discovery', consumed_intent: entry.query } };
  } };
  const validator = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner });
  const accepted = [];
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator: async (context) => {
      const audit = await validator({ ...context,
        resolved_domain_operations: [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }] });
      accepted.push(audit);
      return audit;
    } });
  assert.equal(accepted.length, 1);
  assert.deepEqual(accepted[0].corrected_plan, result.plan);
  assert.equal(result.repaired, true);
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_planner_repair', 'turn_step_grounding_auditor']);
  assert.equal(result.plan.continuation.remaining_intent, entry.intent);
  assert.notEqual(result.plan.operations[0].query, entry.intent);
  assert.deepEqual(result.plan.operations, [operation]);
  return { input, plan: result.plan };
}

for (const entry of ordinaryCases) test(`unreferenced ordinary prerequisite: ${entry.query}`,
  async () => { await repairedOrdinaryPrerequisite(entry); });

test('reality-limited, make-believe and disabled discovery need no audit or repair', async () => {
  for (const mode of ['reality_limited', 'make_believe', 'disabled']) {
    const input = inputFor(ordinaryCases[0]);
    if (mode === 'disabled') input.player_safe_state.ordinary_resolution.discovery_available = false;
    const roles = [];
    const roleRunner = { async run(call) {
      roles.push(call.role_id);
      assert.equal(call.role_id, 'turn_step_planner');
      return { output: { ...output(), interpretation: {
        player_goal: input.remaining_intent, grounded_attempt: input.remaining_intent,
        adaptation: mode === 'disabled' ? 'literal' : mode } } };
    } };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
      semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
    assert.equal(result.repaired, false);
    assert.equal(result.plan.goal_result, 'not_achieved');
    assert.deepEqual(roles, ['turn_step_planner']);
  }
});

test('literal denial with a reality-limited missing-operation rationale repairs its whole causal shape', async () => {
  for (const [entry, intent, query] of [
    [ordinaryCases[0], 'и длинной ветвью осторожно прощупываю воду между обломками.', 'длинная ветвь'],
    [ordinaryCases[1], 'мягким мхом обкладываю глиняную чашку.', 'мягкий мох']
  ]) await repairedOrdinaryPrerequisite({ ...entry, intent, query,
    reason_code: 'reality_limited_no_operation',
    reason: 'No code-owned operation for the later physical action using an unlisted environmental object.' });
});

test('repeated literal denial fails closed after the only repair without auditor calls', async () => {
  const roles = [];
  const roleRunner = { async run(call) {
    roles.push(call.role_id);
    assert.notEqual(call.role_id, 'turn_step_grounding_auditor');
    return { output: output() };
  } };
  await assert.rejects(requestTurnStepPlanWithRepair({ request: inputFor(ordinaryCases[0]),
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) }),
  { code: 'TURN_STEP_PLAN_INVALID' });
  assert.deepEqual(roles, ['turn_step_planner', 'turn_step_planner_repair']);
});

test('domain owner unavailable repairs to lawful reality-limited direct attempt', async () => {
  const input = inputFor(ordinaryCases[0]);
  const roles = [];
  const roleRunner = { async run(call) {
    roles.push(call.role_id);
    if (call.role_id === 'turn_step_planner_repair') {
      assert.match(call.messages[0].content, /For domain_owner_unavailable,.*direct reality_limited/u);
      return { output: { ...output(), interpretation: {
        player_goal: input.remaining_intent, grounded_attempt: input.remaining_intent,
        adaptation: 'reality_limited' } } };
    }
    return { output: { ...output(), resolution: 'domain_request',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
        discovery_kind: 'inspect', target_refs: [ordinaryCases[0].location], query: 'ветвь' }] } };
  } };
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator(context) {
      if (context.plan.resolution === 'domain_request') throw Object.assign(new Error('Owner unavailable'), {
        code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{ path: '$.operations.0',
          code: 'domain_owner_unavailable', rule: 'domain_owner_unavailable', message: 'owner unavailable' }] } });
      return validate(context);
    } });
  assert.equal(result.plan.interpretation.adaptation, 'reality_limited');
  assert.deepEqual(roles, ['turn_step_planner', 'turn_step_planner_repair']);
});

test('domain owner repair uses already visible NPC activities directly', () => {
  const lines = turnStepRepairSpecificInstructions({ structural_errors: [{
    path: '$.operations.0', code: 'domain_owner_unavailable'
  }] }, inputFor(ordinaryCases[0]));
  assert.match(lines.join(' '),
    /visible_npc visible_status values already answer[\s\S]*direct player_safe_observation[\s\S]*no assessment/u);
});

test('repaired prerequisites reach O1 with catalog support, zero query evidence and materialized projections', async () => {
  const bundle = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json', import.meta.url), 'utf8'));
  const profile = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content/ordinary-materialization-profile.json', import.meta.url), 'utf8'));
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const claims = ['claim:final-nature-channel-flow-can-transport-large-woody-debris',
    'claim:population-material-wood-loading'];
  for (const [index, entry] of ordinaryCases.entries()) {
    const { input, plan } = await repairedOrdinaryPrerequisite(entry);
    const claim = bundle.claims.find(({ claim_ref }) => claim_ref === claims[index]);
    assert.ok(claim, 'probe uses the existing production catalog');
    const roles = [];
    const roleRunner = { async run(call) {
      roles.push(call.role_id);
      const payload = JSON.parse(call.messages[1].content);
      if (call.role_id === 'world_knowledge_query_planner') return { output: {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'ru', domains: [claim.domain],
        focus_refs: [claim.subject_ref], requested_predicates: [], search_hints: [entry.query]
      } };
      assert.equal(call.role_id, 'ordinary_materialization');
      for (const sensory of entry.sensory) assert.ok(call.messages[0].content.includes(sensory), 'O1 sees exact committed sensory basis');
      assert.ok(call.messages[0].content.includes(entry.background), `${payload.mode} receives the catalog ordinary background`);
      assert.ok(payload.world_knowledge.facts.some(({ claim_ref }) => claim_ref === claim.claim_ref),
        'required material relationship reaches the semantic materializer');
      if (payload.mode === 'seed_scope') return { provider_record: modelIdentity(), output: {
        resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [{ descriptor: entry.background }], reason_code: 'seeded' } };
      assert.equal(payload.candidate_query.evidence_weight, 0);
      assert.equal(payload.candidate_query.candidate_hint, entry.query);
      return { provider_record: modelIdentity(), output: {
        resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
        semantic_admission_class: 'common_mundane', world_knowledge_claim_refs: [claim.claim_ref],
        entities: [{ semantic_type: 'ordinary_material', name: entry.query,
          presence_expectation: 'plausible',
        mechanics_proposal: { mass_grams: 350, external_hand_cost: 1, carry_form: 'regular',
          packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null } }],
        reason_code: 'materialize' } };
    } };
    const worldKnowledgeGrounder = createProductionWorldKnowledgeGrounder({
      worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
        encoder: { encode: async () => new Float32Array(1024) },
        vector_index: { search: () => new Map([[claim.claim_ref, 1]]) } },
      year: 1230, placeRefs: ['region_novgorod_land'], roleRunner });
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: `denial-o1-${index}`,
      loadEnablement: async () => {
        const value = JSON.parse(JSON.stringify(enabled()).replaceAll('shore', entry.location));
        value.objective_digest = canonicalDigest(value.objective_context);
        value.version_pins.property_placement_context_digest = canonicalDigest({ domain: 'rus.items.ordinary_world_property_placement_context.v1', ...value.property_placement_context });
        value.version_pins.supporting_basis_catalog_digest = canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: value.execution_context.supporting_bases });
        value.execution_context.stage_b_classification_eval = profile.stage_b_classification_eval;
        return value;
      }, ordinaryMaterializationModel: createOrdinaryMaterializationModel({
        roleRunner, stageBApprovalReceipt: approval, worldKnowledgeGrounder }) });
    const call = JSON.parse(JSON.stringify(discoveryRequest(entry.query)).replaceAll('shore', entry.location));
    call.committed_state.position.location_ref = entry.location;
    call.request = { ...input, root_turn_id: call.request.root_turn_id };
    call.operation = plan.operations[0];
    call.plan = plan;
    const result = await resolver(call);
    const atomic = result.ordinary_materialization_atomic_write_plan;
    assert.equal(atomic.resolution, 'materialize');
    assert.deepEqual(result.consequence_fragment.visible_seed.ordinary_presence_seed, {
      kind: 'ordinary_presence_seed', resolution: 'materialized',
      query: entry.query, display_name: atomic.item.item_proposal.semantic_descriptor.name
    });
    assert.equal(atomic.item.item_proposal.semantic_descriptor.name,
      entry.query);
    assert.equal(atomic.item.item_proposal.semantic_descriptor.semantic_type,
      'ordinary_material');
    assert.deepEqual(atomic.item.runtime_placement, { scene_position_id: `${entry.location}-position` });
    assert.equal(result.player_response_boundary, false);
    assert.equal(plan.continuation.remaining_intent, entry.intent);
    const projected = projectPreparedOrdinaryItem(input.player_safe_state, atomic);
    assert.equal(projected.items[0].name, entry.query);
    assert.equal(atomic.item.item_id, projected.items[0].item_id);
    assert.equal(atomic.item.item_id, projected.current_visible_context.visible_objects[0].entity_ref.entity_id);
    assert.equal(projected.current_visible_context.visible_objects[0].display_label,
      entry.query);
    assert.deepEqual(roles, ['world_knowledge_query_planner', 'ordinary_materialization',
      'world_knowledge_query_planner', 'ordinary_materialization']);
  }
});


test('literal denial repair tail binds only the exact single error and keeps an unseen full intent', async () => {
  const entry = { ...ordinaryCases[1], query: 'мягкий мох',
    intent: 'Собираю мягкий мох и обкладываю им глиняную чашку.' };
  await repairedOrdinaryPrerequisite(entry);
  const error = { path: '$.resolution', code: 'operation_semantic_grounding' };
  const tail = turnStepRepairSpecificInstructions({ structural_errors: [error] }, inputFor(entry)).at(-1);
  assert.match(tail, /query must be only a nominal description/u);
  assert.match(tail, /query must not equal or copy request.remaining_intent/u);
  assert.ok(tail.includes(JSON.stringify({ remaining_intent: entry.intent, depends_on_refs: [] })));
  for (const errors of [[{ ...error, path: '$.operations.0' }],
    [{ ...error, code: 'domain_owner_unavailable' }], [error, { path: '$.check', code: 'type' }]]) {
    assert.equal(turnStepRepairSpecificInstructions({ structural_errors: errors }, inputFor(entry))
      .some((line) => line.startsWith('Required literal denial repair:')), false);
  }
});

test('repaired whole-action discovery query fails focused audit before O1 or commit', async () => {
  const input = inputFor(ordinaryCases[0]);
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    const payload = JSON.parse(call.messages[1].content);
    if (call.role_id === 'turn_step_planner') return { output: output() };
    if (call.role_id === 'turn_step_planner_repair') return { output: { ...output(),
      resolution: 'domain_request', activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula', discovery_kind: 'inspect',
        target_refs: [ordinaryCases[0].location], query: input.remaining_intent }],
      continuation: { remaining_intent: input.remaining_intent, depends_on_refs: [] } } };
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    assert.equal(payload.operation.query, input.remaining_intent);
    assert.equal(payload.effect_contract.may_use_referent, false);
    return { output: { mode: 'different_action', consumed_intent: null } };
  } };
  const validator = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner });
  const reached = [];
  await assert.rejects(async () => {
    await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
      semanticPlanValidator: (context) => validator({ ...context,
        resolved_domain_operations: [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }] }) });
    reached.push('ordinary_materialization', 'commit');
  }, { code: 'TURN_STEP_PLAN_INVALID' });
  assert.deepEqual(reached, []);
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_planner_repair', 'turn_step_grounding_auditor']);
});


test('focused material audit receives continuation but never overrides a rejected or missing relation', async () => {
  const intent = 'Поднимаю длинную ветвь и осторожно прощупываю дно у берега.';
  const query = 'длинная ветвь';
  const request = { request_id: 'material-continuation', remaining_intent: intent,
    player_safe_state: { position: { location_ref: 'shore' },
      ordinary_resolution: { discovery_available: true, container_resolution_available: false, scene_seed_available: false } } };
  const operation = { op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'inspect',
    target_refs: ['shore'], query };
  const owner = [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }];
  for (const continuation of [null, { remaining_intent: 'Осторожно прощупываю дно.', depends_on_refs: [] }]) {
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { return { output: { mode: 'material_prerequisite', consumed_intent: null } }; } } });
    await assert.rejects(validate({ request, plan: { operations: [operation], continuation },
      resolved_domain_operations: owner }), { code: 'TURN_STEP_PLAN_INVALID' });
  }
  for (const mode of ['different_action', 'focused_discovery']) {
    const continuation = { remaining_intent: intent, depends_on_refs: [] };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: { async run(call) {
      const payload = JSON.parse(call.messages[1].content);
      assert.deepEqual(payload.continuation, continuation);
      assert.equal(payload.operation.query, query);
      return { output: { mode, consumed_intent: mode === 'focused_discovery' ? query : null } };
    } } });
    await assert.rejects(validate({ request, plan: { operations: [operation], continuation },
      resolved_domain_operations: owner }), { code: 'TURN_STEP_PLAN_INVALID' });
  }
});


test('captured focused_discovery verdict cannot consume a repaired material prerequisite', async () => {
  for (const entry of ordinaryCases) {
    await assert.rejects(repairedOrdinaryPrerequisite(entry, { capturedWrongVerdict: true }), error =>
      error.code === 'TURN_STEP_PLAN_INVALID' && error.details.repair_attempted === true
      && error.details.errors.some(({ code }) => code === 'operation_semantic_grounding'));
  }
});
