import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, executeBoundedDecision, issueBoundedDecisionRequest, materializeWorldInstances, MaterializationError, repairWorldInstances, validateBoundedDecisionResult } from '../src/index.js';
const applicability = { status: 'approved', world_revision_id: 'rev', region_id: 'region', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'] };

function request() {
  const attributes = { profile_level: 'background', anchor_slot_key: 'entry', identity_state: { visibility: 'anonymous' }, machine_state: { mode: 'idle' }, presence_reason: 'approved_place_function', access_state: { access: 'present' }, visibility_state: { visibility: 'visible' }, causal_basis: { causal_basis_type: 'regional_profile', causal_basis_id: 'profile-rule' } };
  const catalog_bundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [
      { ...applicability, rule_id: 'node-rule', slot_key: 'main', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['node'] },
      { ...applicability, rule_id: 'anchor-rule', slot_key: 'entry', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['anchor'] },
      { ...applicability, rule_id: 'rule-a', slot_key: 'yard', domain: 'npc', min_count: 2, max_count: 2, candidate_ids: ['b', 'a'] }
    ],
    candidates: [
      { ...applicability, candidate_id: 'node', domain: 'g5_node', template_id: 'node-template', weight: 1, attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { ...applicability, candidate_id: 'anchor', domain: 'g5_anchor', template_id: 'anchor-template', weight: 1, attributes: { g5_node_slot_key: 'main', entry_role: 'start_and_exit', npc_capacity: 4, item_capacity: 4, container_capacity: 2, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { ...applicability, candidate_id: 'a', domain: 'npc', template_id: 't-a', profile_id: 'p-a', weight: 1, attributes },
      { ...applicability, candidate_id: 'b', domain: 'npc', template_id: 't-b', profile_id: 'p-b', weight: 1, attributes }
    ]
  };
  const seed_context = { party_id: 'party', world_revision_id: 'rev', g1_id: 'g1', g4_id: 'g4', trigger: 'new_game', occurrence: 0, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1' };
  return { version: 2, schema: 'world_materialization_request_v2', party_id: 'party', run_id: 'run', world_revision_id: 'rev', region_id: 'region', historical_frame: { calendar: { year: 1230, season: 'spring' } }, g1_id: 'g1', g4_id: 'g4', trigger: 'new_game', occurrence: 0, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1', seed_context, existing_party_state: { state_version: 0, baseline_exists: false }, catalog_bundle, catalog_digest: canonicalDigest(catalog_bundle) };
}
function decisionOption(optionId, commandId, stateVersion = 3) { return { option_id: optionId, command_id: commandId, actor_id: 'npc1', target_id: 'scene1', preconditions: [], expected_cost: { kind: 'time', value: 0 }, known_risks: [], reason_visible_to_actor: 'Разрешённое действие.', state_version: stateVersion, metadata: {} }; }

test('materializer is deterministic and traces every choice', () => {
  const left = materializeWorldInstances(request());
  const right = materializeWorldInstances(request());
  assert.deepEqual(left, right);
  assert.equal(left.instances.length, 4);
  assert.equal(left.trace.choices.length, 4);
  assert.equal(left.trace.rng_version, 'mulberry32_v1');
  assert.equal(left.proposed_write_set.schema, 'party_runtime_write_set_v2');
  assert.equal(left.proposed_write_set.write_batches.find((batch) => batch.target_table === 'party_npcs').records.length, 2);
  assert.ok(left.proposed_write_set.write_batches.every((batch) => batch.target_schema === 'party_runtime' && batch.operation_mode === 'insert_only'));
});

test('materializer keeps the domain pin distinct from the immutable projection digest', () => {
  const input = request();
  input.catalog_bundle_digest = canonicalDigest(input.catalog_bundle);
  input.catalog_digest = 'd'.repeat(64);
  const result = materializeWorldInstances(input);
  assert.equal(result.trace.catalog_digest, input.catalog_digest);
  assert.equal(result.trace.catalog_bundle_digest, input.catalog_bundle_digest);

  input.catalog_bundle_digest = 'f'.repeat(64);
  assert.throws(
    () => materializeWorldInstances(input),
    (error) => error.code === 'CATALOG_BUNDLE_DIGEST_MISMATCH'
  );
});

test('required empty candidate set blocks instead of inventing a value', () => {
  const input = request();
  input.catalog_bundle.candidates = [];
  input.catalog_digest = canonicalDigest(input.catalog_bundle);
  assert.throws(() => materializeWorldInstances(input), (error) => error instanceof MaterializationError && error.code === 'MATERIALIZATION_BLOCKED_BY_GAPS');
});

test('baseline materialization cannot be repeated for an existing party/G4 baseline', () => {
  const input = request();
  input.existing_party_state.baseline_exists = true;
  assert.throws(() => materializeWorldInstances(input), (error) => error.code === 'BASELINE_ALREADY_MATERIALIZED');
});

test('repair binds the full previous result, identity and replacement digest', () => {
  const previous = materializeWorldInstances(request());
  const replacement = request();
  replacement.run_id = 'repair-run';
  replacement.trigger = 'expansion';
  replacement.seed_context = { ...replacement.seed_context, trigger: 'expansion' };
  replacement.existing_party_state.baseline_exists = true;
  const repairRequest = { version: 2, schema: 'world_materialization_repair_request_v2', repair_reason: 'approved invariant repair', previous_result: previous, previous_result_digest: previous.trace.result_digest, replacement_request_digest: canonicalDigest(replacement), repair_history: [{ previous_run_id: previous.run_id }], replacement_request: replacement };
  const repaired = repairWorldInstances(repairRequest);
  assert.equal(repaired.status, 'repaired');
  assert.equal(repaired.trace.repair.previous_run_id, previous.run_id);
  assert.equal(repaired.proposed_write_set.write_batches[0].records[0].supersedes_run_id, previous.run_id);
  const tampered = structuredClone(repairRequest);
  tampered.previous_result.instances[0].candidate_id = 'tampered';
  assert.throws(() => repairWorldInstances(tampered), (error) => error.code === 'MATERIALIZATION_REPAIR_PREVIOUS_RESULT_TAMPERED');
});

test('rules and candidates are rejected outside the pinned revision, region, year or season', () => {
  for (const mutate of [
    (input) => { input.catalog_bundle.rules[0].world_revision_id = 'other-revision'; },
    (input) => { input.catalog_bundle.rules[0].region_id = 'other-region'; },
    (input) => { input.catalog_bundle.rules[0].valid_from_year = 1240; },
    (input) => { input.catalog_bundle.candidates[0].allowed_seasons = ['winter']; }
  ]) {
    const input = request();
    mutate(input);
    input.catalog_digest = canonicalDigest(input.catalog_bundle);
    assert.throws(() => materializeWorldInstances(input), (error) => error.code === 'MATERIALIZATION_APPLICABILITY_MISMATCH');
  }
});

test('generic materializer rejects disconnected G5 and anchor capacity overflow', () => {
  const disconnected = request();
  disconnected.catalog_bundle.rules.push({ ...applicability, rule_id: 'anchor-rule-2', slot_key: 'side', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['anchor-side'] });
  disconnected.catalog_bundle.candidates.push({ ...applicability, candidate_id: 'anchor-side', domain: 'g5_anchor', template_id: 'anchor-template', weight: 1, attributes: { g5_node_slot_key: 'main', entry_role: 'exit', npc_capacity: 1, item_capacity: 1, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: {} } });
  disconnected.catalog_digest = canonicalDigest(disconnected.catalog_bundle);
  assert.throws(() => materializeWorldInstances(disconnected), (error) => error.code === 'MATERIALIZATION_INVARIANT_FAILED' && error.details.concerns.some((item) => item.code === 'G5_GRAPH_DISCONNECTED'));

  const overflow = request();
  overflow.catalog_bundle.candidates.find((candidate) => candidate.candidate_id === 'anchor').attributes.npc_capacity = 1;
  overflow.catalog_digest = canonicalDigest(overflow.catalog_bundle);
  assert.throws(() => materializeWorldInstances(overflow), (error) => error.code === 'MATERIALIZATION_INVARIANT_FAILED' && error.details.concerns.some((item) => item.code === 'G5_ANCHOR_CAPACITY_EXCEEDED'));
});

test('generic materializer rejects orphan G5 nodes and closed passages to required exits', () => {
  const orphan = request();
  orphan.catalog_bundle.rules.push({ ...applicability, rule_id: 'orphan-node-rule', slot_key: 'orphan', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['orphan-node'] });
  orphan.catalog_bundle.candidates.push({ ...applicability, candidate_id: 'orphan-node', domain: 'g5_node', template_id: 'node-template', weight: 1, attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } });
  orphan.catalog_digest = canonicalDigest(orphan.catalog_bundle);
  assert.throws(() => materializeWorldInstances(orphan), (error) => error.code === 'MATERIALIZATION_INVARIANT_FAILED' && error.details.concerns.some((item) => item.code === 'G5_NODE_ORPHANED'));

  const closed = request();
  closed.catalog_bundle.rules.push(
    { ...applicability, rule_id: 'exit-anchor-rule', slot_key: 'exit', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['exit-anchor'] },
    { ...applicability, rule_id: 'closed-edge-rule', slot_key: 'closed-passage', domain: 'g5_edge', min_count: 1, max_count: 1, candidate_ids: ['closed-edge'] }
  );
  closed.catalog_bundle.candidates.push(
    { ...applicability, candidate_id: 'exit-anchor', domain: 'g5_anchor', template_id: 'anchor-template', weight: 1, attributes: { g5_node_slot_key: 'main', entry_role: 'exit', npc_capacity: 1, item_capacity: 1, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
    { ...applicability, candidate_id: 'closed-edge', domain: 'g5_edge', template_id: 'edge-template', weight: 1, attributes: { from_anchor_slot_key: 'entry', to_anchor_slot_key: 'exit', access_state: { access: 'closed' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } }
  );
  closed.catalog_digest = canonicalDigest(closed.catalog_bundle);
  assert.throws(() => materializeWorldInstances(closed), (error) => error.code === 'MATERIALIZATION_INVARIANT_FAILED' && error.details.concerns.some((item) => item.code === 'G5_EXIT_UNREACHABLE'));
});

test('generic materializer rejects an item without an approved ownership instance', () => {
  const input = request();
  input.catalog_bundle.rules.push({ ...applicability, rule_id: 'item-rule', slot_key: 'tool', domain: 'item', min_count: 1, max_count: 1, candidate_ids: ['item'] });
  input.catalog_bundle.candidates.push({
    ...applicability, candidate_id: 'item', domain: 'item', template_id: 'item-template', profile_id: 'item-profile', weight: 1,
    attributes: { item_category_id: 'tool', quantity: 1, condition_state: 'intact', legal_status: 'party', placement: { anchor_slot_key: 'entry' }, causal_basis: { type: 'place_function' }, property_state: { owner_model: 'party' }, access_state: { access: 'free' }, visibility_state: { visibility: 'visible' }, risk_state: {}, state: {} }
  });
  input.catalog_digest = canonicalDigest(input.catalog_bundle);
  assert.throws(() => materializeWorldInstances(input), (error) => error.code === 'MATERIALIZATION_INVARIANT_FAILED' && error.details.concerns.some((item) => item.code === 'INSTANCE_OWNERSHIP_INVALID'));
});

test('generic materializer preserves anchor, nested, NPC-held and player-held container placements', () => {
  const input = request();
  input.catalog_bundle.rules.push(
    { ...applicability, rule_id: 'container-rule', slot_key: 'box', domain: 'container', min_count: 1, max_count: 1, candidate_ids: ['container'] },
    { ...applicability, rule_id: 'nested-container-rule', slot_key: 'pouch', domain: 'container', min_count: 1, max_count: 1, candidate_ids: ['nested-container'] },
    { ...applicability, rule_id: 'npc-container-rule', slot_key: 'npc-bag', domain: 'container', min_count: 1, max_count: 1, candidate_ids: ['npc-container'] },
    { ...applicability, rule_id: 'player-container-rule', slot_key: 'player-bag', domain: 'container', min_count: 1, max_count: 1, candidate_ids: ['player-container'] },
    { ...applicability, rule_id: 'guard-rule', slot_key: 'guard', domain: 'npc', min_count: 1, max_count: 1, candidate_ids: ['guard'] },
    { ...applicability, rule_id: 'item-rule', slot_key: 'tool', domain: 'item', min_count: 1, max_count: 1, candidate_ids: ['item'] },
    { ...applicability, rule_id: 'container-owner-rule', slot_key: 'box-owner', domain: 'ownership', min_count: 1, max_count: 1, candidate_ids: ['container-owner'] },
    { ...applicability, rule_id: 'nested-owner-rule', slot_key: 'pouch-owner', domain: 'ownership', min_count: 1, max_count: 1, candidate_ids: ['nested-owner'] },
    { ...applicability, rule_id: 'npc-container-owner-rule', slot_key: 'npc-bag-owner', domain: 'ownership', min_count: 1, max_count: 1, candidate_ids: ['npc-container-owner'] },
    { ...applicability, rule_id: 'player-container-owner-rule', slot_key: 'player-bag-owner', domain: 'ownership', min_count: 1, max_count: 1, candidate_ids: ['player-container-owner'] },
    { ...applicability, rule_id: 'item-owner-rule', slot_key: 'tool-owner', domain: 'ownership', min_count: 1, max_count: 1, candidate_ids: ['item-owner'] }
  );
  const resourceState = { causal_basis: { causal_basis_type: 'place_function', causal_basis_id: 'approved-rule' }, property_state: { owner_model: 'party' }, access_state: { access: 'free' }, visibility_state: { visibility: 'visible' }, risk_state: { risk_basis: [] }, state: { state_version: 1 } };
  const npcAttributes = { profile_level: 'background', anchor_slot_key: 'entry', identity_state: { visibility: 'anonymous' }, machine_state: { mode: 'idle' }, presence_reason: 'approved_place_function', access_state: { access: 'present' }, visibility_state: { visibility: 'visible' }, causal_basis: { causal_basis_type: 'regional_profile', causal_basis_id: 'guard-profile' } };
  input.catalog_bundle.candidates.push(
    { ...applicability, candidate_id: 'container', domain: 'container', template_id: 'container-template', weight: 1, attributes: { ...structuredClone(resourceState), anchor_slot_key: 'entry' } },
    { ...applicability, candidate_id: 'nested-container', domain: 'container', template_id: 'container-template', weight: 1, attributes: { ...structuredClone(resourceState), parent_container_slot_key: 'box' } },
    { ...applicability, candidate_id: 'npc-container', domain: 'container', template_id: 'container-template', weight: 1, attributes: { ...structuredClone(resourceState), holder_npc_slot_key: 'guard' } },
    { ...applicability, candidate_id: 'player-container', domain: 'container', template_id: 'container-template', weight: 1, attributes: { ...structuredClone(resourceState), holder_character_id: 'player-character' } },
    { ...applicability, candidate_id: 'guard', domain: 'npc', template_id: 'guard-template', profile_id: 'guard-profile', weight: 1, attributes: npcAttributes },
    { ...applicability, candidate_id: 'item', domain: 'item', template_id: 'item-template', profile_id: 'item-profile', weight: 1, attributes: { ...structuredClone(resourceState), item_category_id: 'tool-category', quantity: 1, condition_state: 'intact', legal_status: 'party', placement: { container_slot_key: 'pouch' } } },
    { ...applicability, candidate_id: 'container-owner', domain: 'ownership', weight: 1, attributes: { container_slot_key: 'box', owner_party: true, claim_state: 'party' } },
    { ...applicability, candidate_id: 'nested-owner', domain: 'ownership', weight: 1, attributes: { container_slot_key: 'pouch', owner_party: true, claim_state: 'party' } },
    { ...applicability, candidate_id: 'npc-container-owner', domain: 'ownership', weight: 1, attributes: { container_slot_key: 'npc-bag', owner_party: true, claim_state: 'party' } },
    { ...applicability, candidate_id: 'player-container-owner', domain: 'ownership', weight: 1, attributes: { container_slot_key: 'player-bag', owner_party: true, claim_state: 'party' } },
    { ...applicability, candidate_id: 'item-owner', domain: 'ownership', weight: 1, attributes: { item_slot_key: 'tool', owner_party: true, claim_state: 'party' } }
  );
  input.catalog_digest = canonicalDigest(input.catalog_bundle);
  const result = materializeWorldInstances(input);
  const containers = new Map(result.containers.map((container) => [container.slot_key, container]));
  const item = result.items[0];
  assert.equal(item.template_id, 'item-template');
  assert.equal(item.profile_id, 'item-profile');
  assert.equal(item.attributes.item_category_id, 'tool-category');
  assert.equal(item.attributes.placement.container_instance_id, containers.get('pouch').instance_id);
  const batches = new Map(result.proposed_write_set.write_batches.map((batch) => [batch.target_table, batch.records]));
  const containerRows = new Map(batches.get('party_containers').map((row) => [row.container_id, row]));
  assert.equal(containerRows.get(containers.get('box').instance_id).anchor_id, result.player_start_position.g5_anchor_id);
  assert.equal(containerRows.get(containers.get('pouch').instance_id).parent_container_id, containers.get('box').instance_id);
  assert.equal(containerRows.get(containers.get('npc-bag').instance_id).holder_npc_id, result.npcs.find((npc) => npc.slot_key === 'guard').instance_id);
  assert.equal(containerRows.get(containers.get('player-bag').instance_id).holder_character_id, 'player-character');
  assert.ok(batches.get('party_containers').findIndex((row) => row.container_id === containers.get('box').instance_id) < batches.get('party_containers').findIndex((row) => row.container_id === containers.get('pouch').instance_id));
  assert.equal(batches.get('party_item_placements')[0].container_id, containers.get('pouch').instance_id);
  assert.equal(batches.get('party_ownership').length, 5);
});

test('bounded decision rejects an option not offered by code', () => {
  const decision = issueBoundedDecisionRequest({ requestId: 'd1', partyId: 'p1', actorId: 'npc1', policyId: 'pol1', policyVersion: '1', stateVersion: 3, issuedAt: '2029-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', secret: 'secret', options: [decisionOption('wait', 'wait'), decisionOption('leave', 'leave')] });
  assert.throws(() => validateBoundedDecisionResult({ request: decision, result: { version: 2, schema: 'bounded_decision_result_v2', request_id: 'd1', state_version: 3, option_id: 'invent', command_token: 'bad' }, secret: 'secret', now: '2029-01-01T00:00:00.000Z' }), (error) => error.code === 'DECISION_OPTION_NOT_ALLOWED');
});

test('bounded decision rejects prose fields and unvalidated handler output', () => {
  const decision = issueBoundedDecisionRequest({ requestId: 'd2', partyId: 'p1', actorId: 'npc1', policyId: 'pol1', policyVersion: '1', stateVersion: 3, issuedAt: '2029-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', secret: 'secret', options: [decisionOption('wait', 'wait'), decisionOption('leave', 'leave')] });
  const result = { version: 2, schema: 'bounded_decision_result_v2', request_id: 'd2', state_version: 3, option_id: 'wait', command_token: decision.options[0].command_token, prose: 'invented' };
  assert.throws(() => validateBoundedDecisionResult({ request: decision, result, secret: 'secret', now: '2029-01-01T00:00:00.000Z' }), (error) => error.code === 'DECISION_RESULT_INVALID');
  assert.throws(() => executeBoundedDecision({ validatedResult: { command_id: 'wait' }, handlers: { wait: () => ({ patch: [] }) }, context: {}, validateChangeSet: () => true }), (error) => error.code === 'DECISION_CHANGE_SET_INVALID');
});

test('bounded decision rejects malformed and non-forward RFC3339 expiry', () => {
  const common = { requestId: 'd3', partyId: 'p1', actorId: 'npc1', policyId: 'pol1', policyVersion: '1', stateVersion: 3, issuedAt: '2029-01-01T00:00:00.000Z', secret: 'secret', options: [decisionOption('wait', 'wait'), decisionOption('leave', 'leave')] };
  assert.throws(() => issueBoundedDecisionRequest({ ...common, expiresAt: 'not-a-date' }), (error) => error.code === 'DECISION_EXPIRY_INVALID');
  assert.throws(() => issueBoundedDecisionRequest({ ...common, expiresAt: '2029-01-01T00:00:00.000Z' }), (error) => error.code === 'DECISION_EXPIRY_INVALID');
});
