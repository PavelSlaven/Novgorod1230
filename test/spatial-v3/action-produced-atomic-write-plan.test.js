import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { deriveActionProducedOutputProperty } from '@rus/items-property';
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
import { loadActionProducedCommittedContext } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-committed-context-loader.js';

test('A1 write plan is sealed, detached and rejects hostile boundaries unread', () => {
  const request = fixture();
  const plan = createActionProducedAtomicWritePlan(request);
  assert.equal(plan.schema, 'action_production_atomic_write_plan_v1');
  assert.equal(Object.isFrozen(plan.source_updates[0].after_item.state), true);
  assert.equal(plan.source_updates[0].item_id, 'item:pole');
  assert.equal(plan.result_items.length, 0);
  request.transition_proposal.result_class = 'forged';
  assert.equal(plan.result_class, 'ordinary_physical_result');
  assert.deepEqual(createActionProducedAtomicWritePlan(plan), plan);
  const recomposed = structuredClone(plan);
  recomposed.source_updates[0].after_item.state.action_production
    .result_class = 'waste';
  recomposed.write_plan_digest = digest(Object.fromEntries(
    Object.entries(recomposed).filter(([key]) => key !== 'write_plan_digest')));
  assert.throws(() => createActionProducedAtomicWritePlan(recomposed),
    { code: 'ACTION_PRODUCED_PLAN_INVALID' });
  const forgedActor = structuredClone(plan);
  forgedActor.actor_ref = 'actor:other';
  forgedActor.write_plan_digest = digest(Object.fromEntries(
    Object.entries(forgedActor)
      .filter(([key]) => key !== 'write_plan_digest')));
  assert.throws(() => createActionProducedAtomicWritePlan(forgedActor),
    { code: 'ACTION_PRODUCED_AUTHORITY_INVALID' });
  const forgedAuthority = structuredClone(plan);
  forgedAuthority.context_pin.profile_ref = 'profile:forged';
  forgedAuthority.transition_proposal.context_pin.profile_ref =
    'profile:forged';
  forgedAuthority.transition_proposal.technical_policy_pin.policy_ref =
    'policy:forged';
  forgedAuthority.transition_proposal.technical_policy_pin.max_new_entities = 8;
  forgedAuthority.write_plan_digest = digest(Object.fromEntries(
    Object.entries(forgedAuthority)
      .filter(([key]) => key !== 'write_plan_digest')));
  assert.throws(() => createActionProducedAtomicWritePlan(forgedAuthority),
    { code: 'ACTION_PRODUCED_AUTHORITY_INVALID' });
  const forgedOutputAuthority = structuredClone(plan);
  forgedOutputAuthority.transition_proposal.results[0].output_authority.mode =
    'new_non_authoritative';
  forgedOutputAuthority.write_plan_digest = digest(Object.fromEntries(
    Object.entries(forgedOutputAuthority)
      .filter(([key]) => key !== 'write_plan_digest')));
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

    assert.equal(first.action_production_atomic_write_plan.write_plan_digest,
      differentRoll.action_production_atomic_write_plan.write_plan_digest);
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
      if (sql.includes('party_action_production_authorities')) {
        return { rows: [authorityRow()] };
      }
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
    assert.notEqual(changed.source_snapshots[0].property_state_ref,
      loaded.source_snapshots[0].property_state_ref);
    assert.notEqual(changed.source_snapshots[0].placement_state_ref,
      loaded.source_snapshots[0].placement_state_ref);

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
    await assert.rejects(loadActionProducedCommittedContext(
      loaderClient([controlledButBorrowed]), loadInput()),
    { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });

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

test('sealed proposal requires exact one-to-one source and tool coverage', () => {
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
      mechanics_state_ref: `mechanics:${itemId}`,
      property_state_ref: `property:${itemId}`,
      placement_state_ref: `placement:${itemId}`,
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
    destination_kind: 'party_current_anchor', ...destinationValue,
    destination_digest: digest(destinationValue)
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
  const outputProperty = deriveActionProducedOutputProperty(
    sourceOwnership, 'result:token');
  const result = { entity_ref: 'result:token', source_ref: 'item:coin-source',
    holder_ref: null, controller_ref: 'actor:mikula',
    placement_state_ref: digest(placement),
    property_state_ref: outputProperty.property_state_ref,
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
    output_class: 'money_like_token' } };
  const item = deriveActionProducedResultItem(result, sourcePins,
    proposalValue, 'change:token', destinationPin);

  assert.equal(item.item_row.legal_status,
    'action_produced_non_authoritative');
  assert.equal(item.item_row.state.property_state, null);
  assert.equal(item.item_row.state.action_production.output_class,
    'money_like_token');
  assert.equal(item.ownership_row.owner_character_id, 'actor:mikula');
  assert.equal(result.property_state_ref, digest({
    property_state: item.item_row.state.property_state,
    ownership: item.ownership_row
  }));
  assert.deepEqual(Object.keys(item).sort(), [
    'item_id', 'item_row', 'material_allocations', 'mechanics_snapshot',
    'ownership_row', 'placement_evidence', 'placement_row', 'source_ref'
  ]);
  assert.equal('currency' in item.item_row.state.action_production, false);
  assert.equal('official_seal' in item.item_row.state.action_production, false);
});

test('written A1 state persists inscription without truth or knowledge', () => {
  const request = fixture();
  const authority = request.committed_load.authority_pin.persisted_row;
  authority.allowed_result_classes = [
    ...authority.allowed_result_classes, 'written_carrier'
  ];
  const authorityInput = Object.fromEntries(Object.entries(authority)
    .filter(([key]) => key !== 'authority_digest'));
  authority.authority_digest = digest(authorityInput);
  request.committed_load.authority_pin.authority_digest =
    authority.authority_digest;
  request.committed_load.authority_pin.persisted_row_digest =
    digest(authority);
  request.committed_load.admission_profile.allowed_result_classes =
    [...authority.allowed_result_classes];
  const proposalValue = request.transition_proposal;
  proposalValue.result_class = 'written_carrier';
  proposalValue.qualitative_result.output_class = 'written_carrier';
  proposalValue.results[0].inscription_text = 'Я князь.';
  proposalValue.qualitative_result.result_descriptor.inscription_text =
    'Я князь.';

  const plan = createActionProducedAtomicWritePlan(request);
  const state = plan.source_updates[0].after_item.state.action_production;
  assert.equal(state.inscription_text, 'Я князь.');
  assert.equal('objective_truth' in state, false);
  assert.equal('knowledge' in state, false);
  assert.deepEqual(Object.keys(state).sort(), [
    'causal_identity', 'inscription_text', 'output_class', 'physical_facts',
    'result_class', 'schema'
  ]);
});

function loaderClient(itemRows, resourceRows = []) {
  return { query: async (sql) => {
    if (sql.includes('FROM party_runtime.parties')) {
      return { rows: [{ state_version: 7 }] };
    }
    if (sql.includes('FROM party_runtime.party_items')) {
      return { rows: itemRows };
    }
    if (sql.includes('party_resource_nodes')) return { rows: resourceRows };
    if (sql.includes('party_action_production_authorities')) {
      return { rows: [authorityRow()] };
    }
    return { rows: [] };
  } };
}

function stateFromEntity(value) {
  return { state_version: value.state_version,
    mechanics_state_ref: value.mechanics_state_ref,
    property_state_ref: value.property_state_ref,
    placement_state_ref: value.placement_state_ref,
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
    action_production_atomic_write_plan: actionPlan,
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
  const mechanicsStateRef = digest({
    runtime_instance_mechanics_snapshot: null,
    template_id: item.template_id, profile_id: item.profile_id,
    category_id: item.category_id, quantity: item.quantity
  });
  const propertyStateRef = digest({ property_state: null, ownership });
  const { ownership_id: ignoredOwnershipId, ...ownershipBasis } = ownership;
  void ignoredOwnershipId;
  const placementStateRef = digest(placement);
  const entity = {
    schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role: 'source', entity_ref: 'item:pole',
    state_version: '7', lifecycle_state: 'active',
    access_state: 'immediate', holder_ref: 'actor:mikula',
    controller_ref: 'actor:mikula',
    mechanics_state_ref: mechanicsStateRef,
    property_state_ref: propertyStateRef,
    ownership_state_ref: digest(ownership),
    ownership_basis_ref: digest(ownershipBasis),
    property_basis_ref: digest(null),
    ownership_snapshot: structuredClone(ownership),
    placement_state_ref: placementStateRef, finite_resource: null
  };
  const rowPin = {
    role: 'source', item_id: 'item:pole', item, placement, ownership,
    item_digest: digest(item), placement_digest: digest(placement),
    ownership_digest: digest(ownership), entity_snapshot: entity,
    finite_resource_row: null
  };
  const authority = authorityRow();
  const authorityPin = { schema: 'action_production_committed_authority_pin_v1',
    authority_digest: authority.authority_digest,
    persisted_row_digest: digest(authority), persisted_row: authority };
  return {
    schema: 'action_production_atomic_write_request_v1', party_id: 'party-1',
    base_party_state_version: 7, change_set_id: 'change-8',
    committed_load: {
      schema: 'action_produced_committed_context_load_v1',
      party_id: 'party-1', party_state_version: 7,
      authority_pin: authorityPin, output_destination_pin: null,
      output_destination: null,
      admission_profile: admissionProfile(),
      technical_policy: technicalPolicy(),
      committed_context: {
        schema: 'rus.items.action_produced_committed_context.v1',
        context_ref: 'context-7', state_version: '7',
        commit_state: 'committed', root_turn_id: 'turn-8',
        action_ref: 'action-1', step_index: 1, actor_ref: 'actor:mikula',
        entities: [{ entity_ref: 'item:pole', state_version: '7',
          lifecycle_state: 'active', access_state: 'immediate',
          accessible_actor_ref: 'actor:mikula', holder_ref: 'actor:mikula',
          controller_ref: 'actor:mikula', role_membership: ['source'],
          mechanics_state_ref: entity.mechanics_state_ref,
          property_state_ref: entity.property_state_ref,
          ownership_state_ref: entity.ownership_state_ref,
          ownership_basis_ref: entity.ownership_basis_ref,
          property_basis_ref: entity.property_basis_ref,
          placement_state_ref: entity.placement_state_ref }]
      },
      source_snapshots: [structuredClone(entity)], tool_snapshots: [],
      row_pins: [rowPin]
    },
    transition_proposal: proposal({ mechanicsStateRef, propertyStateRef,
      placementStateRef })
  };
}

function authorityRow() {
  const input = { party_id: 'party-1', actor_ref: 'actor:mikula',
    context_ref: 'context-7', profile_ref: 'profile-a1',
    profile_version: '1', policy_ref: 'policy-a1', policy_version: 1,
    max_new_entities: 4, allowed_access_states: ['immediate', 'quick'],
    allowed_identity_modes: ['preserve_source', 'independent_outputs',
      'no_useful_result'], allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: ['ordinary_physical_result',
      'no_useful_result'], authority_state_version: 1, status: 'committed' };
  return { ...input, authority_digest: digest(input) };
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

function proposal({ mechanicsStateRef = 'mechanics:item:pole:7',
  propertyStateRef = 'property:item:pole:7',
  placementStateRef = 'placement:item:pole:7' } = {}) {
  const mechanics = mechanicsSnapshot();
  const before = {
    state_version: '7', mechanics_state_ref: mechanicsStateRef,
    property_state_ref: propertyStateRef,
    placement_state_ref: placementStateRef,
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula'
  };
  return {
    schema: 'rus.items.action_produced_transition_proposal.v1', version: 1,
    status: 'sealed', causal_identity: {
      request_id: 'request-1', root_turn_id: 'turn-8',
      action_ref: 'action-1', step_index: 1
    },
    context_pin: { context_ref: 'context-7', context_state_version: '7',
      profile_ref: 'profile-a1', profile_version: '1' },
    technical_policy_pin: { policy_ref: 'policy-a1', version: 1,
      max_new_entities: 4 },
    identity_mode: 'preserve_source', origin: null,
    result_class: 'ordinary_physical_result',
    source_transitions: [{ entity_ref: 'item:pole', before,
      after: { state_version: '8', mechanics_snapshot: structuredClone(mechanics),
        property_state_ref: before.property_state_ref,
        placement_state_ref: before.placement_state_ref,
        holder_ref: before.holder_ref, controller_ref: before.controller_ref },
      finite_resource_transition: null }],
    tool_state_pins: [],
    results: [{ entity_ref: 'item:pole', identity_kind: 'preserved_source',
      source_ref: 'item:pole', mechanics_snapshot: mechanics,
      property_state_ref: before.property_state_ref,
      placement_state_ref: before.placement_state_ref,
      holder_ref: before.holder_ref, controller_ref: before.controller_ref,
      physical_facts: ['sharpened'], inscription_text: null,
      output_authority: {
        schema: 'rus.items.action_produced_output_authority.v1',
        mode: 'preserve_existing'
      } }],
    known_waste: [], qualitative_result: {
      intended_transformation: 'sharpen the end',
      output_class: 'ordinary_mundane',
      result_descriptor: { display_name: 'sharpened pole',
        physical_description: 'one end is sharpened',
        qualitative_facts: ['sharpened'], inscription_text: null }
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
    context_ref: 'context-7', expected_party_state_version: 7,
    source_refs: ['item:pole'], tool_refs: [] };
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
