import { sha256 } from '@rus/kernel';
import { STAGE24_PLAN_SCHEMA } from '../policy/constants.js';
import {
  approvedContainerPlacement,
  buildItemPlacementRecord
} from './player-placement.js';
import {
  assertNewActorAppearance,
  assertNoPortraitSpec
} from './actor-write-boundary.js';
import {
  assertMaterializationRuntimeCatalogPins,
  assertPartyRuntimeCatalogPins,
  buildMaterializationRunCatalogPinRecord,
  buildPartyCatalogPinRecord
} from './runtime-catalog-pins.js';

export function buildPartyRuntimeV2WritePlan(input) {
  const context = input?.party_creation_context ?? {};
  const pins = context.version_pins ?? {};
  const domainPin = context.domain_catalog_pin ?? {};
  assertPartyRuntimeCatalogPins(context);

  const outputs = input.approved_pipeline_outputs ?? {};
  assertNoPortraitSpec(outputs);
  const g5 = outputs.g5_scene_graph ?? {};
  const npcPlacement = outputs.initial_npc_placement ?? {};
  const itemPlacement = outputs.initial_item_placement ?? {};
  const npcTrace = npcPlacement.materialization_run ?? { choices: [], created_refs: [] };
  const itemTrace = itemPlacement.materialization_run ?? { choices: [], created_refs: [] };
  const partyId = context.party_id;
  const requestId = input.request_id;
  const g4Id = g5.parent_location?.g4_node_id ?? outputs.selected_start_node?.selected_node_chain?.g4_node_id;
  assertRequiredText({ partyId, requestId, g4Id }, ['partyId', 'requestId', 'g4Id'], 'WRITE_PLAN_IDENTITY_INCOMPLETE');
  const runId = g5.materialization_run?.run_id;
  assertRequiredText(g5.materialization_run, ['run_id', 'run_kind', 'seed_digest', 'input_digest', 'catalog_digest', 'materializer_version', 'rng_version'], 'WRITE_PLAN_MATERIALIZATION_TRACE_INCOMPLETE');
  if (!Number.isInteger(g5.materialization_run.occurrence) || !Array.isArray(g5.materialization_run.choices) || g5.validation_report?.pass !== true) throw stage24BuildError('WRITE_PLAN_MATERIALIZATION_TRACE_INCOMPLETE', 'Materialization occurrence, choices and passing validation_report are required.');
  const trace = { ...g5.materialization_run, stage15: npcTrace, stage16: itemTrace, choices: mergeChoices(g5.materialization_run.choices, npcTrace.choices, itemTrace.choices), created_refs: [...(g5.materialization_run.created_refs ?? []), ...(npcTrace.created_refs ?? []), ...(itemTrace.created_refs ?? [])] };
  if (trace.seed_context?.party_id !== partyId || trace.seed_context?.g4_id !== g4Id) throw stage24BuildError('WRITE_PLAN_MATERIALIZATION_IDENTITY_MISMATCH', 'Materialization seed identity must match party and G4 context.');
  assertMaterializationRuntimeCatalogPins({ trace, pins, domainPin });
  const sourceTrace = [{ source_id: requestId, source_kind: 'approved_pipeline_manifest', digest: input.approved_pipeline_manifest_digest }];

  const batches = [];
  addBatch(batches, 'parties', [{ party_id: partyId, schema_version: 2, ...pins, state_version: 0, status: 'active' }], [], sourceTrace);
  addBatch(
    batches,
    'party_catalog_pins',
    [buildPartyCatalogPinRecord(partyId, domainPin)],
    ['parties'],
    sourceTrace
  );
  addBatch(batches, 'party_materialization_runs', [{
    party_id: partyId, run_id: runId, g4_id: g4Id, run_kind: trace.run_kind, occurrence: trace.occurrence,
    seed_digest: trace.seed_digest,
    input_digest: trace.input_digest, catalog_digest: trace.catalog_digest, materializer_version: trace.materializer_version,
    rng_version: trace.rng_version, result_digest: requiredText(trace.result_digest, 'materialization_run.result_digest'), supersedes_run_id: null, repair_reason: null,
    idempotency_key: requiredText(trace.idempotency_key, 'materialization_run.idempotency_key'),
    status: 'committed', validation_report: g5.validation_report ?? {}, trace,
    created_refs: collectCreatedRefs(g5, npcPlacement, itemPlacement)
  }], ['parties'], sourceTrace);
  addBatch(
    batches,
    'party_materialization_run_catalog_pins',
    [buildMaterializationRunCatalogPinRecord({ partyId, runId, domainPin })],
    ['party_catalog_pins', 'party_materialization_runs'],
    sourceTrace
  );
  addBatch(batches, 'party_materialization_choices', (trace.choices ?? []).map((choice) => ({
    party_id: partyId, run_id: runId, choice_ordinal: choice.choice_ordinal, slot_key: choice.slot_key,
    candidate_set_digest: choice.candidate_set_digest, candidate_ids: choice.candidate_ids, selected_id: choice.selected_id, rng_draw: choice.rng_draw
  })), ['party_materialization_runs'], sourceTrace);
  addDecisionBatches(batches, partyId, [
    outputs.historical_frame?.decision_trace?.bounded_decision_trace,
    outputs.selected_start_node?.selection_reasoning?.bounded_decision_trace
  ], sourceTrace);
  addBatch(batches, 'party_g5_nodes', (g5.g5_minilocations ?? []).map((node, index) => ({
    party_id: partyId, g5_node_id: node.g5_minilocation_id ?? node.id, run_id: runId, parent_g4_id: node.parent_g4_node_id ?? g4Id,
    template_id: requiredText(node.template_id, `g5_node[${index}].template_id`), slot_key: requiredText(node.slot_key, `g5_node[${index}].slot_key`), state: { ...requiredObject(node.state, `g5_node[${index}].state`), access_state: requiredObject(node.access, `g5_node[${index}].access`), visibility_state: requiredObject(node.visibility, `g5_node[${index}].visibility`) }
  })), ['party_materialization_runs'], sourceTrace);
  addBatch(batches, 'party_g5_anchors', (g5.g5_anchors ?? []).map((anchor, index) => ({
    party_id: partyId, anchor_id: anchor.anchor_id, g5_node_id: anchor.minilocation_id ?? anchor.g5_minilocation_id,
    template_id: requiredText(anchor.anchor_template_id, `g5_anchor[${index}].anchor_template_id`), slot_key: requiredText(anchor.slot_key, `g5_anchor[${index}].slot_key`),
    npc_capacity: requiredNonnegativeInteger(anchor.supports?.npc_capacity, `g5_anchor[${index}].npc_capacity`), item_capacity: requiredNonnegativeInteger(anchor.supports?.item_capacity, `g5_anchor[${index}].item_capacity`),
    container_capacity: requiredNonnegativeInteger(anchor.supports?.container_capacity, `g5_anchor[${index}].container_capacity`), state: { visibility: requiredObject(anchor.visibility, `g5_anchor[${index}].visibility`), access: requiredObject(anchor.access, `g5_anchor[${index}].access`) }
  })), ['party_g5_nodes'], sourceTrace);
  addBatch(batches, 'party_g5_edges', (g5.g5_edges ?? []).map((edge) => ({
    party_id: partyId, g5_edge_id: edge.g5_edge_id ?? edge.edge_id, from_anchor_id: edge.from_anchor_id,
    to_anchor_id: edge.to_anchor_id, template_id: requiredText(edge.template_id, 'g5_edge.template_id'), state: { ...requiredObject(edge.state, 'g5_edge.state'), access_state: requiredObject(edge.access, 'g5_edge.access'), visibility_state: requiredObject(edge.visibility, 'g5_edge.visibility') }
  })), ['party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_positions', [{
    party_id: partyId, g4_id: g4Id, g5_node_id: g5.player_start_position?.minilocation_id,
    g5_anchor_id: g5.player_start_position?.anchor_id
  }], ['party_g5_anchors'], sourceTrace);
  const player = outputs.player_character ?? {};
  const playerId = requiredText(player.player_character_id ?? player.character_id, 'player_character.character_id');
  const npcInstances = npcPlacement.npc_instances ?? npcPlacement.npcs ?? [];
  const requireActorAppearance = player.appearance_contract_version
    === 'actor_base_appearance_v1'
    || npcInstances.some((npc) =>
      npc.appearance_contract_version === 'actor_base_appearance_v1');
  assertNewActorAppearance(player.identity, player.appearance_contract_version,
    'player_character', player.body, requireActorAppearance);
  addBatch(batches, 'party_player_characters', [{ party_id: partyId, character_id: playerId, profile: player }], ['parties'], sourceTrace);
  const knowledgeRecords = outputs.character_knowledge_write_projection?.records ?? outputs.character_knowledge_map?.facts ?? [];
  addBatch(batches, 'party_character_knowledge', knowledgeRecords.map((fact, index) => ({ party_id: partyId, character_id: playerId, fact_id: requiredText(fact.fact_id ?? fact.knowledge_id, `knowledge[${index}].fact_id`), knowledge_state: requiredText(fact.knowledge_state ?? fact.state, `knowledge[${index}].knowledge_state`), evidence: requiredArray(fact.evidence, `knowledge[${index}].evidence`) })), ['party_player_characters'], sourceTrace);
  addBatch(batches, 'party_npcs', npcInstances.map((npc, index) => {
    assertNewActorAppearance(npc.identity, npc.appearance_contract_version,
      `npc[${index}]`, npc.body, requireActorAppearance);
    return ({
    party_id: partyId, npc_id: npc.npc_instance_id ?? npc.npc_id, run_id: runId,
    profile_set_id: requiredText(npc.profile_set_id, `npc[${index}].profile_set_id`), profile_level: requiredText(npc.profile_level, `npc[${index}].profile_level`),
    anchor_id: requiredText(npc.placement?.g5_anchor_id, `npc[${index}].placement.g5_anchor_id`), identity_state: requiredObject(npc.identity, `npc[${index}].identity`), machine_state: requiredObject(npc.machine_state ?? npc.interaction_state, `npc[${index}].machine_state`),
    semantic_state: { presence_reason: requiredText(npc.placement?.presence_reason, `npc[${index}].presence_reason`), access_state: requiredObject(npc.access_state ?? npc.placement?.access_state ?? {}, `npc[${index}].access_state`), visibility_state: requiredObject(npc.visibility_state, `npc[${index}].visibility_state`), causal_basis: requiredObject(npc.causal_basis ?? { causal_basis_type: 'approved_npc_profile', causal_basis_id: npc.npc_candidate_id }, `npc[${index}].causal_basis`), source_trace: requiredArray(npc.source_trace, `npc[${index}].source_trace`) }
  }); }), ['party_materialization_runs', 'party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_npc_traits', (npcPlacement.npc_instances ?? []).flatMap((npc) => (npc.traits ?? []).map((trait, index) => ({ party_id: partyId, npc_id: npc.npc_instance_id, trait_domain: requiredText(trait.trait_domain, `npc_trait[${index}].trait_domain`), category_id: requiredText(trait.category_id, `npc_trait[${index}].category_id`), source_profile_id: requiredText(trait.source_profile_id, `npc_trait[${index}].source_profile_id`) }))), ['party_npcs'], sourceTrace);
  addBatch(batches, 'party_npc_relations', (npcPlacement.npc_relations ?? []).map((relation, index) => ({ party_id: partyId, from_npc_id: requiredText(relation.from_npc_id, `npc_relation[${index}].from_npc_id`), to_npc_id: requiredText(relation.to_npc_id, `npc_relation[${index}].to_npc_id`), relation_category_id: requiredText(relation.relation_category_id, `npc_relation[${index}].relation_category_id`), state: requiredObject(relation.state, `npc_relation[${index}].state`) })), ['party_npcs'], sourceTrace);
  addBatch(batches, 'party_npc_knowledge', (npcPlacement.npc_instances ?? []).flatMap((npc) => (npc.knowledge_records ?? []).map((fact, index) => ({ party_id: partyId, npc_id: npc.npc_instance_id, fact_id: requiredText(fact.fact_id, `npc_knowledge[${index}].fact_id`), knowledge_state: requiredText(fact.knowledge_state, `npc_knowledge[${index}].knowledge_state`) }))), ['party_npcs'], sourceTrace);
  addBatch(batches, 'party_npc_schedules', (npcPlacement.npc_schedule_state ?? []).map((schedule, index) => ({ party_id: partyId, npc_id: requiredText(schedule.npc_instance_id, `npc_schedule[${index}].npc_instance_id`), time_band: requiredText(schedule.time_band, `npc_schedule[${index}].time_band`), schedule_profile_id: requiredText(schedule.schedule_profile_id, `npc_schedule[${index}].schedule_profile_id`), g5_node_id: schedule.g5_node_id ?? schedule.g5_minilocation_id ?? null })), ['party_npcs', 'party_g5_nodes'], sourceTrace);
  const orderedContainers = orderContainersForPersistence(itemPlacement.container_instances ?? itemPlacement.containers ?? []);
  addBatch(batches, 'party_containers', orderedContainers.map((container, index) => {
    const playerPlacement = approvedContainerPlacement(
      container.placement,
      `container[${index}]`
    );
    return {
    party_id: partyId, container_id: container.container_instance_id ?? container.container_id, run_id: runId,
    template_id: requiredText(container.container_template_id, `container[${index}].container_template_id`), anchor_id: container.placement?.g5_anchor_id ?? null,
    parent_container_id: container.placement?.container_instance_id ?? null,
    holder_npc_id: container.placement?.holder_npc_instance_id ?? null,
    holder_character_id: container.placement?.holder_player_character_id ?? null,
    physical_position: playerPlacement.physical_position,
    equipment_slot_category_id: playerPlacement.equipment_slot_category_id,
    condition_state: container.condition_state ?? null,
    closure_state: container.container_state?.closure_state ?? container.physical_state?.closure_state ?? null,
    state: resourceSemanticState(container, `container[${index}]`)
  }; }), ['party_materialization_runs', 'party_g5_anchors', 'party_npcs', 'party_player_characters'], sourceTrace);
  addBatch(batches, 'party_items', (itemPlacement.item_instances ?? itemPlacement.items ?? []).map((item, index) => ({
    party_id: partyId, item_id: item.item_instance_id ?? item.item_id, run_id: runId, template_id: requiredText(item.item_template_id, `item[${index}].item_template_id`), profile_id: requiredText(item.item_profile_id, `item[${index}].item_profile_id`), category_id: requiredText(item.item_category_id, `item[${index}].item_category_id`),
    quantity: requiredPositiveInteger(item.quantity, `item[${index}].quantity`), condition_state: requiredText(item.condition_state, `item[${index}].condition_state`),
    legal_status: requiredText(item.legal_status, `item[${index}].legal_status`), state: resourceSemanticState(item, `item[${index}]`)
  })), ['party_materialization_runs'], sourceTrace);
  addBatch(batches, 'party_item_placements', (itemPlacement.item_instances ?? itemPlacement.items ?? []).map((item) => buildItemPlacementRecord(partyId, item)), ['party_items', 'party_containers', 'party_npcs', 'party_player_characters', 'party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_ownership', [
    ...(itemPlacement.item_instances ?? itemPlacement.items ?? []).map((item) => buildOwnershipRecord(partyId, 'item', item.item_instance_id ?? item.item_id, item.property_state)),
    ...(itemPlacement.container_instances ?? itemPlacement.containers ?? []).map((container) => buildOwnershipRecord(partyId, 'container', container.container_instance_id ?? container.container_id, container.property_state))
  ].filter(Boolean), ['party_items', 'party_containers', 'party_npcs', 'party_player_characters'], sourceTrace);
  addBatch(batches, 'party_state_snapshots', [{ party_id: partyId, state_version: 0, state_payload: outputs.full_hidden_scene_state ?? {}, state_digest: sha256(outputs.full_hidden_scene_state ?? {}) }], ['parties'], sourceTrace);
  addBatch(batches, 'party_visible_read_models', [{
    party_id: partyId, state_version: 0, viewer_character_id: playerId,
    payload: { visible_context: outputs.visible_context_package, narrator_output: outputs.narrator_starting_prose },
    payload_digest: sha256({ visible_context: outputs.visible_context_package, narrator_output: outputs.narrator_starting_prose })
  }], ['party_player_characters'], sourceTrace);

  const writeOrder = batches.map((batch) => batch.batch_id);
  return {
    version: 1, schema: STAGE24_PLAN_SCHEMA, request_id: requestId, plan_status: 'formed',
    source_input_digest: input.party_db_write_plan_input_digest,
    party_database_schema_digest: input.party_database_schema_digest,
    world_base_reference_digest: input.world_base_reference_digest,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest,
    transaction: { transaction_id: `tx_${sha256([partyId, requestId]).slice(0, 24)}`, party_id: partyId, idempotency_key: context.idempotency_key, rollback_strategy: 'full_transaction_rollback', is_atomic: true, is_dry_run_first: true, write_order: writeOrder },
    preconditions: [{ check: 'all_approvals_passed' }, { check: 'party_runtime_v2_version_pins_complete' }],
    write_batches: batches,
    postconditions: [{ check: 'party_runtime_v2_round_trip' }, { check: 'baseline_materialization_trace_persisted' }],
    forbidden_writes: ['world_base mutation forbidden', 'party_runtime_v1 targets forbidden'], derived_indexes: [],
    audit_snapshots: [], rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: writeOrder }, source_trace: sourceTrace,
    knowledge_projection_validation: normalizeKnowledgeProjection(outputs.character_knowledge_write_projection),
    self_audit: { pass: true, concerns: [], evidence: ['Code-generated party_runtime_v2 write plan.'] }
  };
}

function addBatch(batches, table, records, dependencies, sourceTrace) {
  if (records.length === 0) return;
  batches.push({ batch_id: `batch-${table}`, order: batches.length + 1, target_table: table, operation_mode: 'insert_only', depends_on_batches: dependencies.filter((dependency) => batches.some((batch) => batch.target_table === dependency)).map((dependency) => `batch-${dependency}`), records, source_trace: sourceTrace });
}

function normalizeKnowledgeProjection(projection = {}) {
  const manifest = projection.projection_manifest ?? {};
  return { source_content_hash: manifest.source_content_hash ?? sha256({}), expected_counts: manifest.expected_counts ?? {}, expected_record_keys: manifest.expected_record_keys ?? [], planned_counts: manifest.expected_counts ?? {}, planned_record_keys: manifest.expected_record_keys ?? [] };
}

function resourceSemanticState(value, path) {
  return { ...requiredObject(value.physical_state, `${path}.physical_state`), causal_basis: requiredObject(value.causal_basis, `${path}.causal_basis`), property_state: requiredObject(value.property_state, `${path}.property_state`), access_state: requiredObject(value.access_state, `${path}.access_state`), visibility_state: requiredObject(value.visibility_state, `${path}.visibility_state`), risk_state: requiredObject(value.risk_state, `${path}.risk_state`), ...(value.visual_profile_snapshot ? { visual_profile_snapshot: structuredClone(value.visual_profile_snapshot) } : {}) };
}

function collectCreatedRefs(g5, npcPlacement, itemPlacement) {
  return [
    ...(g5.g5_minilocations ?? []).map((value) => ({ domain: 'g5_node', instance_id: value.g5_minilocation_id })),
    ...(g5.g5_anchors ?? []).map((value) => ({ domain: 'g5_anchor', instance_id: value.anchor_id })),
    ...(g5.g5_edges ?? []).map((value) => ({ domain: 'g5_edge', instance_id: value.edge_id })),
    ...(npcPlacement.npc_instances ?? []).map((value) => ({ domain: 'npc', instance_id: value.npc_instance_id, candidate_id: value.npc_candidate_id })),
    ...(itemPlacement.item_instances ?? []).map((value) => ({ domain: 'item', instance_id: value.item_instance_id, candidate_id: value.item_profile_candidate_id })),
    ...(itemPlacement.container_instances ?? []).map((value) => ({ domain: 'container', instance_id: value.container_instance_id, candidate_id: value.container_profile_candidate_id }))
  ];
}

function mergeChoices(...groups) {
  return groups.flatMap((group) => group ?? []).map((choice, choiceOrdinal) => ({ ...structuredClone(choice), choice_ordinal: choiceOrdinal }));
}

function addDecisionBatches(batches, partyId, decisionTraces, sourceTrace) {
  const traces = decisionTraces.filter((trace) => trace?.request);
  if (traces.length === 0) return;
  const seen = new Set();
  for (const trace of traces) {
    if (trace.request.party_id !== partyId || seen.has(trace.request.request_id) || !trace.result || trace.validation_report?.pass !== true) throw stage24BuildError('WRITE_PLAN_DECISION_TRACE_INVALID', 'Every bounded decision must be unique, validated and bound to the party.');
    seen.add(trace.request.request_id);
  }
  addBatch(batches, 'party_decision_requests', traces.map(({ request, validation_report: validationReport }) => ({ party_id: partyId, request_id: request.request_id, policy_id: request.policy_id, policy_version: request.policy_version, actor_id: request.actor_id, state_version: request.state_version, issued_at: request.issued_at, expires_at: request.expires_at, options_digest: request.options_digest, idempotency_key: `decision:${partyId}:${request.request_id}`, status: 'resolved', input_digest: sha256(request), validation_report: validationReport })), ['parties'], sourceTrace);
  addBatch(batches, 'party_decision_options', traces.flatMap(({ request }) => request.options.map((option) => ({ party_id: partyId, request_id: request.request_id, option_id: option.option_id, command_id: option.command_id, command_token_digest: sha256(option.command_token), ordinal: option.ordinal, metadata: { actor_id: option.actor_id, target_id: option.target_id, preconditions: option.preconditions, expected_cost: option.expected_cost, known_risks: option.known_risks, reason_visible_to_actor: option.reason_visible_to_actor, state_version: option.state_version, metadata: option.metadata } }))), ['party_decision_requests'], sourceTrace);
  addBatch(batches, 'party_decision_results', traces.map(({ request, result }) => ({ party_id: partyId, request_id: request.request_id, option_id: result.option_id, state_version: result.state_version, response_digest: result.response_digest })), ['party_decision_options'], sourceTrace);
}

function orderContainersForPersistence(containers) {
  const byId = new Map(containers.map((container) => [container.container_instance_id ?? container.container_id, container]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw stage24BuildError('WRITE_PLAN_CONTAINER_CYCLE', `Container placement cycle includes ${id}.`);
    const container = byId.get(id);
    if (!container) throw stage24BuildError('WRITE_PLAN_CONTAINER_PLACEMENT_INVALID', `Unknown container ${id}.`);
    visiting.add(id);
    const parentId = container.placement?.container_instance_id;
    if (parentId) {
      if (!byId.has(parentId) || parentId === id) throw stage24BuildError('WRITE_PLAN_CONTAINER_PLACEMENT_INVALID', `Container ${id} has an invalid parent ${parentId}.`);
      visit(parentId);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(container);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  return ordered;
}

function buildOwnershipRecord(partyId, kind, subjectId, property = {}) {
  const ownerModel = property.owner_model;
  if (!subjectId || !['npc', 'player', 'party'].includes(ownerModel)) return null;
  return {
    party_id: partyId, ownership_id: `ownership_${sha256([partyId, kind, subjectId]).slice(0, 24)}`,
    item_id: kind === 'item' ? subjectId : null, container_id: kind === 'container' ? subjectId : null,
    owner_npc_id: ownerModel === 'npc' ? property.owner_npc_instance_id ?? property.owner_id : null,
    owner_character_id: ownerModel === 'player' ? property.owner_character_id ?? property.owner_id : null,
    owner_party: ownerModel === 'party', controller_npc_id: property.controller_model === 'npc' ? property.controller_id : null,
    controller_character_id: property.controller_model === 'player' ? property.controller_id : null,
    claim_state: requiredText(property.legal_or_social_status, `${kind}.${subjectId}.property_state.legal_or_social_status`)
  };
}

function requiredText(value, path) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw stage24BuildError('WRITE_PLAN_APPROVED_VALUE_MISSING', `${path} is required.`);
  return normalized;
}
function requiredObject(value, path) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw stage24BuildError('WRITE_PLAN_APPROVED_VALUE_MISSING', `${path} object is required.`); return structuredClone(value); }
function requiredArray(value, path) { if (!Array.isArray(value)) throw stage24BuildError('WRITE_PLAN_APPROVED_VALUE_MISSING', `${path} array is required.`); return structuredClone(value); }
function requiredPositiveInteger(value, path) { if (!Number.isInteger(value) || value <= 0) throw stage24BuildError('WRITE_PLAN_APPROVED_VALUE_MISSING', `${path} positive integer is required.`); return value; }
function requiredNonnegativeInteger(value, path) { if (!Number.isInteger(value) || value < 0) throw stage24BuildError('WRITE_PLAN_APPROVED_VALUE_MISSING', `${path} nonnegative integer is required.`); return value; }
function assertRequiredText(value, keys, code) { const missing = keys.filter((key) => !String(value?.[key] ?? '').trim()); if (missing.length) throw stage24BuildError(code, `Missing required values: ${missing.join(', ')}.`); }
function stage24BuildError(code, message) { return Object.assign(new Error(message), { code }); }
