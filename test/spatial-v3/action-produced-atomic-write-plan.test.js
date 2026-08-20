import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { actionProducedPhysicalKeys, createActionProducedAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-atomic-write-plan.js';
import { actionProducedTraceActionRef } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-causal-binding.js';
import { validateSpatialV3CombinedWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-write-plan-validation.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { deriveActionProducedResultItem } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-result-item.js';
import { validateActionProducedAtomicProposal } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-atomic-write-plan-validation.js';
import { validateActionProducedRowPins } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-atomic-write-plan-pins.js';
import { loadActionProducedCommittedContext } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-committed-context-loader.js';
import { batchInput } from
  '../../apps/game-server/test/ordinary-materialization-container-batch-plan.test.js';
import { applyActionProductionProjection } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-action-production-projection.js';
import { projectItems } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-items.js';

test('A1 write plan is validated, detached and rejects hostile boundaries unread', () => {
  const request = fixture();
  const plan = createActionProducedAtomicWritePlan(request);
  assert.equal(plan.schema, 'action_production_atomic_write_plan_v1');
  assert.equal(Object.isFrozen(plan.source_updates[0].after_item.state), true);
  assert.equal(plan.source_updates[0].item_id, 'item:pole');
  assert.equal(plan.result_items.length, 0);
  request.transition_proposal.result_class = 'forged';
  assert.equal(plan.transition_proposal.result_class,
    'ordinary_physical_result');
  assert.deepEqual(createActionProducedAtomicWritePlan(plan), plan);
  const recomposed = structuredClone(plan);
  recomposed.source_updates[0].after_item.state.action_production
    .result_class = 'waste';
  assert.throws(() => createActionProducedAtomicWritePlan(recomposed),
    { code: 'ACTION_PRODUCED_PLAN_INVALID' });
  const forgedActor = structuredClone(plan);
  forgedActor.actor_ref = 'actor:other';
  assert.throws(() => createActionProducedAtomicWritePlan(forgedActor),
    { code: 'ACTION_PRODUCED_PLAN_INVALID' });
  const forgedOutputAuthority = structuredClone(plan);
  forgedOutputAuthority.transition_proposal.results[0].output_authority.mode =
    'new_non_authoritative';
  assert.throws(() => createActionProducedAtomicWritePlan(
    forgedOutputAuthority), { code: 'ACTION_PRODUCED_RESULT_INVALID' });

  let reads = 0;
  const hostile = fixture();
  Object.defineProperty(hostile, 'transition_proposal', {
    enumerable: true, get() { reads += 1; return proposal(); }
  });
  assert.throws(() => createActionProducedAtomicWritePlan(hostile),
    { code: 'ACTION_PRODUCED_PLAN_INVALID' });
  assert.equal(reads, 0);
  for (const mutate of [
    (value) => { value[Symbol('hidden')] = true; },
    (value) => { Object.setPrototypeOf(value, { forged: true }); },
    (value) => { value.self = value; },
    (value) => { value.alias = value.committed_load; }
  ]) {
    const invalid = fixture(); mutate(invalid);
    assert.throws(() => createActionProducedAtomicWritePlan(invalid),
      { code: 'ACTION_PRODUCED_PLAN_INVALID' });
  }
});

test('common trace P16 binds A1 to exact check and activity-time evidence',
  async () => {
    const approvedPlan = { schema: 'turn_step_plan_v1', request_id: 'request-1',
      step_index: 1, resolution: 'generic_check', activity: {
        owner: 'semantic', duration_class: 'short', effort: 'light'
      }, check: { attribute_ref: 'dexterity', skill_ref: null,
        difficulty_id: 'standard' } };
    const request = fixture();
    const actionRef = actionProducedTraceActionRef({ rootTurnId: 'turn-8',
      stepIndex: 1, approvedPlan });
    request.committed_load.committed_context.action_ref = actionRef;
    request.transition_proposal.causal_identity.action_ref = actionRef;
    request.transition_proposal.source_transitions[0].after
      .mechanics_snapshot.provenance.operation_ref = actionRef;
    request.transition_proposal.results[0].mechanics_snapshot
      .provenance.operation_ref = actionRef;
    const actionPlan = createActionProducedAtomicWritePlan(request);
    const first = await buildCausalCombinedPlan({ actionPlan, approvedPlan,
      roll: 12, band: 'success', durationMinutes: 5 });
    const differentRoll = await buildCausalCombinedPlan({ actionPlan,
      approvedPlan, roll: 18, band: 'clean_success', durationMinutes: 5 });
    const differentActivity = await buildCausalCombinedPlan({ actionPlan,
      approvedPlan, roll: 12, band: 'success', durationMinutes: 10 });

    assert.deepEqual(first.action_production_atomic_write_plans,
      differentRoll.action_production_atomic_write_plans);
    assert.notEqual(first.write_set_digest, differentRoll.write_set_digest);
    assert.notEqual(first.write_set_digest, differentActivity.write_set_digest);
    assert.equal(validateSpatialV3CombinedWritePlan(first), true);
    assert.equal(validateSpatialV3CombinedWritePlan(differentRoll), true);
    assert.equal(validateSpatialV3CombinedWritePlan(differentActivity), true);
    const forgedCheck = structuredClone(first);
    forgedCheck.appends.find(({ target_table: table }) =>
      table === 'party_check_resolutions').record.roll_value = 20;
    assert.equal(validateSpatialV3CombinedWritePlan(forgedCheck), false);
    const forgedTime = structuredClone(first);
    forgedTime.updates.find(({ target_table: table }) =>
      table === 'party_clocks').record.whole_minutes = 99;
    assert.equal(validateSpatialV3CombinedWritePlan(forgedTime), false);
    let transactionCalls = 0;
    const rejected = await createSpatialV3CombinedAtomicCommitter({
      withTransaction: async () => { transactionCalls += 1; },
      recheck: async () => ({ ok: true })
    }).commit({ plan: forgedTime });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'generated_schema_mismatch');
    assert.equal(transactionCalls, 0);
  });

test('A1 loader derives committed access pins and rejects stale/hostile input',
  async () => {
    const queries = [];
    const client = { query: async (sql) => {
      queries.push(sql);
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: 7 }] };
      }
      if (sql.includes('FROM party_runtime.party_items')) {
        return { rows: [dbRow()] };
      }
      if (sql.includes('SELECT p.g5_anchor_id')) return { rows: [] };
      return { rows: [] };
    } };
    const loaded = await loadActionProducedCommittedContext(client,
      loadInput());
    assert.equal(loaded.committed_context.entities[0].access_state,
      'immediate');
    assert.equal(loaded.source_snapshots[0].holder_ref, 'actor:mikula');
    assert.equal(loaded.row_pins[0].item.state_version, 2);
    assert.match(queries.find((sql) => sql.includes(
      'party_resource_nodes')), /entity_kind'='party_item'/u);

    const changedRow = dbRow();
    changedRow.state = { ...changedRow.state,
      property_state: { material: 'wood' } };
    changedRow.physical_position = 'external';
    const changed = await loadActionProducedCommittedContext(
      loaderClient([changedRow]), loadInput());
    assert.equal(changed.source_snapshots[0].access_state, 'quick');
    assert.notDeepEqual(changed.row_pins[0].item.state,
      loaded.row_pins[0].item.state);
    assert.notDeepEqual(changed.row_pins[0].placement,
      loaded.row_pins[0].placement);

    const groundedRow = dbRow();
    groundedRow.anchor_id = 'anchor:workbench';
    groundedRow.holder_character_id = null;
    groundedRow.physical_position = null;
    const grounded = await loadActionProducedCommittedContext(
      loaderClient([groundedRow], [], 'anchor:workbench'), loadInput());
    assert.equal(grounded.source_snapshots[0].access_state, 'quick');
    assert.equal(grounded.source_snapshots[0].holder_ref, null);

    const containedRow = dbRow();
    containedRow.container_id = 'container:pouch';
    containedRow.holder_character_id = null;
    containedRow.physical_position = null;
    const accessContainer = dbContainerRow();
    const contained = await loadActionProducedCommittedContext(
      loaderClient([containedRow], [], null, [accessContainer]), loadInput());
    assert.equal(contained.source_snapshots[0].access_state, 'quick');
    assert.equal(contained.row_pins[0].access_container.container_id,
      'container:pouch');
    validateActionProducedRowPins(contained.row_pins, 'source',
      'actor:mikula', '7', { root_turn_id: 'turn-8', step_index: 1 });
    await assert.rejects(loadActionProducedCommittedContext(
      loaderClient([containedRow], [], null, [{ ...accessContainer,
        closure_state: 'closed' }]), loadInput()),
    { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });

    const toolInput = { ...loadInput(), tool_refs: ['item:tool'] };
    const toolRow = { ...dbRow(), item_id: 'item:tool',
      ownership_id: 'ownership:tool' };
    const withTool = await loadActionProducedCommittedContext(
      loaderClient([dbRow(), toolRow]), toolInput);
    assert.equal(withTool.tool_snapshots[0].role, 'tool');

    const inaccessible = dbRow();
    inaccessible.holder_character_id = 'actor:other';
    await assert.rejects(loadActionProducedCommittedContext(
      loaderClient([inaccessible]), loadInput()),
    { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });

    const controlledButBorrowed = dbRow();
    controlledButBorrowed.owner_character_id = 'actor:other';
    controlledButBorrowed.claim_state = 'entrusted';
    const borrowed = await loadActionProducedCommittedContext(
      loaderClient([controlledButBorrowed]), loadInput());
    assert.equal(borrowed.row_pins[0].ownership.owner_character_id,
      'actor:other');

    const mismatchedResourceClient = loaderClient([dbRow()], [{
      resource_node_id: 'resource:pole', source_resource_ref: {
        entity_kind: 'party_item', entity_id: 'item:pole' },
      quantity_numerator: 2, quantity_denominator: 1,
      quantity_unit_ref: { entity_id: 'piece' }, lifecycle_state: 'active',
      state_version: 1, position_node_id: 'remote-position',
      property_basis_ref: 'remote-property'
    }]);
    await assert.rejects(loadActionProducedCommittedContext(
      mismatchedResourceClient, loadInput()),
    { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });

    await assert.rejects(loadActionProducedCommittedContext({
      query: async () => ({ rows: [{ state_version: 8 }] })
    }, loadInput()), { code: 'ACTION_PRODUCED_PARTY_STALE' });
    let reads = 0; let calls = 0;
    const hostile = loadInput();
    Object.defineProperty(hostile, 'source_refs', {
      enumerable: true, get() { reads += 1; return ['item:pole']; }
    });
    await assert.rejects(loadActionProducedCommittedContext({
      query: async () => { calls += 1; return { rows: [] }; }
    }, hostile), { code: 'ACTION_PRODUCED_LOAD_INVALID' });
    assert.equal(reads, 0); assert.equal(calls, 0);
  });

test('A1 loader accepts only one validated same-root ordinary overlay', async () => {
  const ordinary = batchInput({ masses: [800], party: 'party-1',
    partyStateVersion: 7, ownerControllerRef: 'actor:mikula',
    rootTurnId: 'turn-8', stepIndex: 1 });
  const itemId = ordinary.items[0].item_id;
  const loaded = await loadActionProducedCommittedContext(loaderClient([]), {
    ...loadInput(), step_index: 2, source_refs: [itemId],
    prepared_ordinary_plan: ordinary,
    prepared_action_plans: [],
    change_set_id: 'change-8'
  });
  assert.equal(loaded.source_snapshots[0].entity_ref, itemId);
  assert.equal(loaded.source_snapshots[0].access_state, 'quick');
  assert.deepEqual(loaded.row_pins[0].prepared_ordinary, {
    schema: 'action_production_prepared_ordinary_pin_v1',
    request_identity: ordinary.request_identity,
    root_turn_id: 'turn-8', step_index: 1
  });
  assert.throws(() => validateActionProducedRowPins(loaded.row_pins, 'source',
    'actor:mikula', '7', { root_turn_id: 'turn:other', step_index: 2 }), {
    code: 'ACTION_PRODUCED_PLAN_INVALID'
  });
  assert.deepEqual(loaded.row_pins[0].item.state.ordinary_metadata, {
    semantic_type: 'household_supply', name: 'ordinary item 0',
    origin: { kind: 'ordinary_container_contents', source_refs:
      ordinary.items[0].mechanics_snapshot.provenance.source_refs },
    semantic_facts: ['ordinary'], operation_history: []
  });
  const concealed = batchInput({ masses: [800], party: 'party-1',
    partyStateVersion: 7, ownerControllerRef: 'actor:mikula', reveal: false,
    rootTurnId: 'turn-8', stepIndex: 1 });
  await assert.rejects(loadActionProducedCommittedContext(loaderClient([]), {
    ...loadInput(), step_index: 2,
    source_refs: [concealed.items[0].item_id],
    prepared_ordinary_plan: concealed, prepared_action_plans: [],
    change_set_id: 'change-8'
  }), { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });
  const wrongRoot = batchInput({ masses: [800], party: 'party-1',
    partyStateVersion: 7, ownerControllerRef: 'actor:mikula',
    rootTurnId: 'turn:other', stepIndex: 1 });
  await assert.rejects(loadActionProducedCommittedContext(loaderClient([]), {
    ...loadInput(), step_index: 2,
    source_refs: [wrongRoot.items[0].item_id],
    prepared_ordinary_plan: wrongRoot, prepared_action_plans: [],
    change_set_id: 'change-8'
  }), { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });
});

test('validated proposal requires exact one-to-one source and tool coverage', () => {
  const sourceRequest = fixture();
  const sourceLoad = structuredClone(sourceRequest.committed_load);
  const sourceProposal = structuredClone(sourceRequest.transition_proposal);
  const secondSource = structuredClone(sourceLoad.row_pins[0]);
  secondSource.item_id = 'item:second-source';
  secondSource.entity_snapshot.entity_ref = secondSource.item_id;
  sourceLoad.row_pins.push(secondSource);
  sourceProposal.identity_mode = 'no_useful_result';
  sourceProposal.result_class = 'no_useful_result';
  sourceProposal.results = [];
  sourceProposal.source_transitions.push(structuredClone(
    sourceProposal.source_transitions[0]));
  assert.throws(() => validateActionProducedAtomicProposal(
    sourceProposal, sourceLoad), {
    code: 'ACTION_PRODUCED_PROPOSAL_INVALID'
  });

  const toolRequest = fixture();
  const toolLoad = structuredClone(toolRequest.committed_load);
  const toolProposal = structuredClone(toolRequest.transition_proposal);
  const toolPin = (itemId) => ({ role: 'tool', item_id: itemId,
    entity_snapshot: { entity_ref: itemId, state_version: '7',
      holder_ref: 'actor:mikula', controller_ref: 'actor:mikula' } });
  const firstTool = toolPin('item:tool-a');
  toolLoad.row_pins.push(firstTool, toolPin('item:tool-b'));
  const state = { entity_ref: firstTool.item_id,
    before: stateFromEntity(firstTool.entity_snapshot),
    after: stateFromEntity(firstTool.entity_snapshot) };
  toolProposal.tool_state_pins = [state, structuredClone(state)];
  assert.throws(() => validateActionProducedAtomicProposal(
    toolProposal, toolLoad), {
    code: 'ACTION_PRODUCED_PROPOSAL_INVALID'
  });
});

test('independent A1 output cannot inherit currency or official state', () => {
  const placement = { anchor_id: 'output-anchor', container_id: null,
    holder_npc_id: null, holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null, attached_item_id: null };
  const destinationValue = { anchor_id: 'output-anchor', item_capacity: 4,
    used_item_ids: [] };
  const destinationPin = {
    schema: 'action_production_output_destination_pin_v1',
    destination_kind: 'party_current_anchor', ...destinationValue
  };
  const sourceOwnership = { ownership_id: 'ownership:source',
    owner_npc_id: null, owner_character_id: 'actor:mikula',
    owner_party: false, controller_npc_id: null,
    controller_character_id: 'actor:mikula', claim_state: 'owned' };
  const sourcePins = [{ item_id: 'item:coin-source', item: {
    condition_state: 'serviceable', legal_status: 'currency',
    state: { property_state: { currency: true, legal_tender: true,
      official_seal: true } }
  }, ownership: sourceOwnership, entity_snapshot: {
    controller_ref: 'actor:mikula', ownership_snapshot: sourceOwnership } }];
  const result = { entity_ref: 'result:token', source_ref: 'item:coin-source',
    holder_ref: null, controller_ref: 'actor:mikula',
    mechanics_snapshot: {},
    physical_facts: ['имеет сходство с жетоном'], inscription_text: null,
    output_authority: {
      schema: 'rus.items.action_produced_output_authority.v1',
      mode: 'new_non_authoritative', canonical_identity_status: 'absent',
      currency_status: 'not_currency',
      legal_tender_status: 'not_legal_tender', official_status: 'not_official',
      objective_truth_status: 'not_projected',
      knowledge_status: 'not_projected'
    },
    material_allocations: [] };
  const proposalValue = { causal_identity: { request_id: 'request:token',
    root_turn_id: 'turn:token', action_ref: 'action:token', step_index: 1 },
  result_class: 'ordinary_physical_result', qualitative_result: {
    material_extent: 'whole', output_class: 'money_like_token', result_descriptor: {
      display_name: 'деревянный счётный жетон',
      physical_description: null,
      qualitative_facts: ['имеет сходство с жетоном'],
      inscription_text: null, physical_form: 'compact',
      source_fact_delta: null } } };
  const item = deriveActionProducedResultItem(result, sourcePins,
    proposalValue, 'change:token', destinationPin, 'actor:mikula');

  assert.equal(item.item_row.legal_status,
    'action_produced_non_authoritative');
  assert.equal(item.item_row.state.property_state, null);
  assert.equal(item.item_row.state.action_production.output_class,
    'money_like_token');
  assert.deepEqual(item.item_row.state.ordinary_metadata, {
    semantic_type: 'money_like_token', name: 'деревянный счётный жетон',
    origin: { kind: 'action_produced', source_refs: ['item:coin-source'] },
    semantic_facts: [{ fact_id: 'action:token:fact:1',
      text: 'имеет сходство с жетоном', operation_id: 'action:token' }],
    operation_history: []
  });
  assert.equal(item.ownership_row.owner_character_id, 'actor:mikula');
  assert.deepEqual(Object.keys(item).sort(), [
    'item_id', 'item_row', 'material_allocations', 'mechanics_snapshot',
    'ownership_row', 'placement_row', 'source_ref'
  ]);
  assert.equal('currency' in item.item_row.state.action_production, false);
  assert.equal('official_seal' in item.item_row.state.action_production, false);
  const next = { items: [] };
  applyActionProductionProjection({ next, plan: { source_updates: [],
    result_items: [item] } });
  const playerSafe = projectItems(next.items, { actorId: 'actor:mikula',
    position: { anchor_id: 'output-anchor' } });
  assert.equal(playerSafe[0].name, 'деревянный счётный жетон');
  assert.equal(playerSafe[0].semantic_type, 'money_like_token');
});

test('written A1 state persists inscription without truth or knowledge', () => {
  const request = fixture();
  request.committed_load.admission_profile.allowed_result_classes =
    [...request.committed_load.admission_profile.allowed_result_classes,
      'written_carrier'];
  const proposalValue = request.transition_proposal;
  proposalValue.result_class = 'written_carrier';
  proposalValue.qualitative_result.output_class = 'written_carrier';
  proposalValue.results[0].inscription_text = 'Я князь.';
  proposalValue.qualitative_result.result_descriptor.inscription_text =
    'Я князь.';

  const plan = createActionProducedAtomicWritePlan(request);
  const state = plan.source_updates[0].after_item.state.action_production;
  assert.equal('inscription_text' in state, false);
  assert.equal(plan.source_updates[0].after_item.state.ordinary_metadata
    .semantic_facts.some(({ text }) => text === 'Я князь.'), true);
  assert.equal('objective_truth' in state, false);
  assert.equal('knowledge' in state, false);
  assert.deepEqual(Object.keys(state).sort(), [
    'causal_identity', 'output_class', 'physical_form',
    'result_class', 'schema'
  ]);
});

test('weapon-capable A1 state persists no combat classification or damage',
  () => {
    const request = fixture();
    request.transition_proposal.qualitative_result.output_class =
      'weapon_capable';
    const state = createActionProducedAtomicWritePlan(request)
      .source_updates[0].after_item.state.action_production;
    assert.equal(state.output_class, 'weapon_capable');
    for (const key of [
      'weapon_qualitative_class', 'weapon_danger', 'damage',
      'canonical_weapon_identity'
    ]) assert.equal(key in state, false);
  });

function loaderClient(itemRows, resourceRows = [], accessAnchorId = null,
  containerRows = []) {
  return { query: async (sql) => {
    if (sql.includes('FROM party_runtime.parties')) {
      return { rows: [{ state_version: 7 }] };
    }
    if (sql.includes('FROM party_runtime.party_items')) {
      return { rows: itemRows };
    }
    if (sql.includes('FROM party_runtime.party_containers')) {
      return { rows: containerRows };
    }
    if (sql.includes('party_resource_nodes')) return { rows: resourceRows };
    if (sql.includes('SELECT p.g5_anchor_id')) return { rows:
      accessAnchorId == null ? [] : [{ anchor_id: accessAnchorId,
        item_capacity: 8 }] };
    if (sql.includes('FROM party_runtime.party_item_placements')) {
      return { rows: [] };
    }
    return { rows: [] };
  } };
}

function stateFromEntity(value) {
  return { state_version: value.state_version,
    holder_ref: value.holder_ref, controller_ref: value.controller_ref };
}

async function buildCausalCombinedPlan({ actionPlan, approvedPlan, roll,
  band, durationMinutes }) {
  const partyId = actionPlan.party_id;
  const changeSetId = actionPlan.change_set_id;
  const checkId = 'turn-8:step:1';
  const snapshot = { schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    last_turn: { turn_step_commit: { root_turn_id: 'turn-8', checks: {
      requests: [{ check_id: checkId, difficulty: 15 }],
      results: [{ check_id: checkId, roll, outcome: { band } }]
    }, consequence: { state_changes: [{ kind: 'semantic_activity',
      duration_class: 'short', effort: 'light' }] }, time_update: {
      clock_before: { whole_minutes: 10 },
      clock_after: { whole_minutes: 10 + durationMinutes },
      exact_elapsed: { exact_minutes: { numerator: String(durationMinutes),
        denominator: '1' } }
    } } } };
  const writes = { inserts: [{ target_table: 'party_state_snapshots',
    id: `${partyId}:8`, record: { party_id: partyId, state_version: 8,
      state_payload: snapshot, state_digest: digest(snapshot) } }],
  updates: [{ target_table: 'parties', id: partyId,
    record: { party_id: partyId, status: 'active' } },
  { target_table: 'party_clocks', id: partyId, record: { party_id: partyId,
    whole_minutes: 10 + durationMinutes, subminute_numerator: 0,
    subminute_denominator: 1, updated_change_set_id: changeSetId } }],
  appends: [{ target_table: 'party_v3_change_sets', id: changeSetId,
    record: { id: changeSetId, party_id: partyId,
      operation_kind: 'trace_turn_step', idempotency_record_id: 'idem-1' } },
  { target_table: 'party_check_resolutions', id: 'check-resolution-1',
    record: { check_resolution_id: 'check-resolution-1', party_id: partyId,
      check_scope_kind: 'immediate_action', check_scope_key: {
        root_turn_id: 'turn-8', check_id: checkId,
        idempotency_record_id: 'idem-1' }, check_policy_ref: {},
      deterministic_roll_input_digest: digest({ checkId, roll }),
      roll_value: roll, modifier_snapshot: {}, target_value: 15,
      result_kind: band === 'clean_success' || band === 'success'
        ? 'success' : 'failure', consequence_policy_ref: {},
      result_change_set_id: changeSetId,
      canonical_digest: digest({ checkId, roll, band, changeSetId }) } }],
  deletes: [] };
  const visiblePayload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: [] };
  const dependencyPins = [{ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'activity_profile', entity_id: 'a1-short' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1',
      state_version: null } }];
  const physicalKeys = Object.values(writes).flat().map((write) =>
    `party_runtime.${write.target_table}:${write.id}`);
  const built = await buildCombinedWritePlan({ plan_id: 'plan-a1-evidence',
    party_id: partyId, write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_turn_step',
    canonical_input_digest: `sha256:${'a'.repeat(64)}`,
    expected_state_versions: [
      { target_table: 'parties', id: partyId, state_version: 7 },
      { target_table: 'party_clocks', id: partyId, state_version: 3 }
    ], validation_report: { status: 'pass', digest: digest(snapshot) },
    idempotency: { id: 'idem-1', key: 'idem-key', request_id: 'request-1',
      semantic_command_snapshot: { schema:
        'rus.lower_dvina_trace_turn_step_command_snapshot.v1',
      semantic_trace: { step_traces: [{ step_index: 1,
        approved_plan: approvedPlan }] } }, semantic_command_digest: null,
      semantic_dependency_pins: null },
    change_set: { id: changeSetId },
    visible_package_envelope: { package_id: 'visible-a1-evidence',
      party_id: partyId, turn_id: 'turn-8', committed_state_version: '8',
      change_set_id: changeSetId, package_digest: digest(visiblePayload),
      visible_payload: visiblePayload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind:
        'visibility_modifier', entity_id: 'projection-a1' },
      authoring_version: '1' }, dependency_pins: { pins: dependencyPins,
        canonical_digest: digest(dependencyPins).replace('sha256:', '') },
      idempotency_record_id: 'idem-1' }, approved_write_sets: [writes],
    lock_context: { owner_keys: ['actor:actor:mikula'], execution_keys: [],
      g4_keys: [], physical_keys: [...physicalKeys,
        ...actionProducedPhysicalKeys(actionPlan)] },
    action_production_atomic_write_plans: [actionPlan],
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route',
      'capacity', 'time', 'change_set'].map((kind) => ({ kind,
      digest: `sha256:${'b'.repeat(64)}` }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}

function fixture() {
  const item = {
    item_id: 'item:pole', run_id: null, template_id: null,
    profile_id: null, category_id: null, quantity: 1,
    condition_state: 'serviceable', legal_status: 'owned',
    state: { lifecycle_status: 'active' }, state_version: 2
  };
  const placement = {
    anchor_id: null, container_id: null, holder_npc_id: null,
    holder_character_id: 'actor:mikula', physical_position: 'hands',
    equipment_slot_category_id: null, attached_item_id: null
  };
  const ownership = {
    ownership_id: 'ownership:pole', owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned'
  };
  const entity = {
    schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role: 'source', entity_ref: 'item:pole',
    state_version: '7', lifecycle_state: 'active',
    access_state: 'immediate', holder_ref: 'actor:mikula',
    controller_ref: 'actor:mikula',
    ownership_snapshot: structuredClone(ownership),
    finite_resource: null
  };
  const rowPin = {
    role: 'source', item_id: 'item:pole', item, placement, ownership,
    entity_snapshot: entity,
    finite_resource_row: null
  };
  return {
    schema: 'action_production_atomic_write_request_v1', party_id: 'party-1',
    base_party_state_version: 7, change_set_id: 'change-8',
    committed_load: {
      schema: 'action_produced_committed_context_load_v1',
      party_id: 'party-1', party_state_version: 7,
      output_destination_pin: null,
      output_destination: null,
      admission_profile: admissionProfile(),
      technical_policy: technicalPolicy(),
      committed_context: {
        schema: 'rus.items.action_produced_committed_context.v1',
        context_ref: 'lower_dvina_trace:a1:personal_tool_transform',
        state_version: '7',
        commit_state: 'committed', root_turn_id: 'turn-8',
        action_ref: 'action-1', step_index: 1, actor_ref: 'actor:mikula',
        entities: [{ entity_ref: 'item:pole', state_version: '7',
          lifecycle_state: 'active', access_state: 'immediate',
          accessible_actor_ref: 'actor:mikula', holder_ref: 'actor:mikula',
          controller_ref: 'actor:mikula', role_membership: ['source'] }]
      },
      source_snapshots: [structuredClone(entity)], tool_snapshots: [],
      row_pins: [rowPin]
    },
    transition_proposal: proposal()
  };
}

function authorityRow() {
  return { context_ref: 'lower_dvina_trace:a1:personal_tool_transform',
    profile_ref: 'lower_dvina_trace_a1_open_physical_action_profile_v1',
    profile_version: '1',
    policy_ref: 'lower_dvina_trace:a1:personal_tool_policy_v1',
    max_new_entities: 4, allowed_access_states: ['immediate', 'quick'],
    allowed_identity_modes: ['preserve_source', 'independent_outputs',
      'no_useful_result'], allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: ['ordinary_physical_result',
      'no_useful_result'] };
}
function admissionProfile() {
  const row = authorityRow();
  return { schema: 'rus.items.action_produced_admission_profile.v1',
    profile_ref: row.profile_ref, profile_version: row.profile_version,
    status: 'committed', context_ref: row.context_ref,
    context_state_version: '7',
    allowed_access_states: row.allowed_access_states,
    allowed_identity_modes: row.allowed_identity_modes,
    allowed_origins: row.allowed_origins,
    allowed_result_classes: row.allowed_result_classes };
}
function technicalPolicy() {
  const row = authorityRow();
  return { schema: 'rus.items.action_produced_technical_policy.v1', version: 1,
    status: 'committed', policy_ref: row.policy_ref,
    profile_ref: row.profile_ref, profile_version: row.profile_version,
    max_new_entities: row.max_new_entities };
}

function proposal() {
  const mechanics = mechanicsSnapshot();
  const before = {
    state_version: '7',
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula'
  };
  return {
    schema: 'rus.items.action_produced_transition_proposal.v1', version: 1,
    causal_identity: {
      request_id: 'request-1', root_turn_id: 'turn-8',
      action_ref: 'action-1', step_index: 1
    },
    context_pin: {
      context_ref: 'lower_dvina_trace:a1:personal_tool_transform',
      context_state_version: '7',
      profile_ref: 'lower_dvina_trace_a1_open_physical_action_profile_v1',
      profile_version: '1' },
    technical_policy_pin: {
      policy_ref: 'lower_dvina_trace:a1:personal_tool_policy_v1', version: 1,
      max_new_entities: 4 },
    identity_mode: 'preserve_source', origin: null,
    result_class: 'ordinary_physical_result',
    source_transitions: [{ entity_ref: 'item:pole', before,
      after: { state_version: '8', mechanics_snapshot: structuredClone(mechanics),
        holder_ref: before.holder_ref, controller_ref: before.controller_ref },
      finite_resource_transition: null }],
    tool_state_pins: [],
    results: [{ entity_ref: 'item:pole', identity_kind: 'preserved_source',
      source_ref: 'item:pole', mechanics_snapshot: mechanics,
      holder_ref: before.holder_ref, controller_ref: before.controller_ref,
      physical_facts: ['sharpened'], inscription_text: null,
      output_authority: {
        schema: 'rus.items.action_produced_output_authority.v1',
        mode: 'preserve_existing'
      } }],
    known_waste: [], qualitative_result: {
      intended_transformation: 'sharpen the end',
      material_extent: null,
      output_class: 'ordinary_mundane',
      result_descriptor: { display_name: 'sharpened pole',
        physical_description: 'one end is sharpened',
        qualitative_facts: ['sharpened'], inscription_text: null,
        physical_form: 'long', source_fact_delta: null }
    }
  };
}

function mechanicsSnapshot() {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: {
      source_kind: 'ordinary_direct_action_result', root_turn_id: 'turn-8',
      step_index: 1, operation_ref: 'action-1', origin_kind: 'crafted',
      source_refs: ['item:pole']
    }, mechanics: { mass_grams: 500, external_hand_cost: 1,
      carry_form: 'long', packing_slot_cost: 1, quantity: null,
      container: null } };
}

function loadInput() {
  return { party_id: 'party-1', actor_ref: 'actor:mikula',
    root_turn_id: 'turn-8', action_ref: 'action-1', step_index: 1,
    context_ref: 'lower_dvina_trace:a1:personal_tool_transform',
    expected_party_state_version: 7,
    source_refs: ['item:pole'], tool_refs: [],
    admission_profile: admissionProfile(),
    technical_policy: technicalPolicy() };
}
function dbRow() {
  return { item_id: 'item:pole', run_id: null, template_id: null,
    profile_id: null, category_id: null, quantity: 1,
    condition_state: 'serviceable', legal_status: 'owned',
    state: { lifecycle_status: 'active' }, state_version: 2,
    anchor_id: null, container_id: null, holder_npc_id: null,
    holder_character_id: 'actor:mikula', physical_position: 'hands',
    equipment_slot_category_id: null, attached_item_id: null,
    ownership_id: 'ownership:pole', owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
function dbContainerRow() {
  return { container_id: 'container:pouch', anchor_id: null,
    parent_container_id: null, holder_npc_id: null,
    holder_character_id: 'actor:mikula', physical_position: 'hands',
    equipment_slot_category_id: null, condition_state: 'serviceable',
    closure_state: 'open', state: { access_state: { access: 'open' } },
    state_version: 2, ownership_id: 'ownership:pouch', owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
