import { deepFreeze } from '@rus/kernel';
import { computeMaterializationResultDigest } from '@rus/contracts';
import {
  canonicalDigest, createRandomSource, deriveSeed, deterministicInstanceId,
  MATERIALIZER_VERSION, MaterializationError, RNG_VERSION
} from './core.js';
import { buildExecutableWriteSet } from './write-set.js';
import { resolveInstanceReferences, resolvePlayerStartPosition } from './reference-resolution.js';
import { validateDomainMaterialization } from './domain-validation.js';
import { assertConnectedG5Graph, assertG5TemplateBundle, chooseApprovedCount, indexApproved } from './stage-helpers.js';
import { approvedWeight, assertApplicableRecord, assertMaterializationInput, chooseCount, compareRule, partitionInstances, weightedCandidate } from './world-validation.js';

export { canonicalDigest, createRandomSource, deriveSeed, deterministicInstanceId, MATERIALIZER_VERSION, MaterializationError, RNG_VERSION } from './core.js';
export { executeBoundedDecision, issueBoundedDecisionRequest, validateBoundedDecisionResult } from './bounded-decision.js';
export { computeMaterializationResultDigest as materializationResultDigest } from '@rus/contracts';

export function materializeWorldInstances(input) {
  assertMaterializationInput(input);
  if (input.existing_party_state.baseline_exists === true && ['new_game', 'first_entry'].includes(input.trigger)) throw new MaterializationError('BASELINE_ALREADY_MATERIALIZED', 'Baseline materialization is immutable and cannot be created twice.');
  const seedContext = {
    party_id: input.party_id,
    world_revision_id: input.world_revision_id,
    g1_id: input.g1_id,
    g4_id: input.g4_id,
    trigger: input.trigger,
    occurrence: input.occurrence,
    materializer_version: input.materializer_version,
    rng_algorithm_id: input.rng_algorithm_id
  };
  if (canonicalDigest(seedContext) !== canonicalDigest(input.seed_context)) throw new MaterializationError('SEED_CONTEXT_MISMATCH', 'seed_context must exactly match the pinned materialization request.');
  const seed = deriveSeed(seedContext);
  const random = createRandomSource({ seed: seed.uint32 });
  const candidates = new Map();
  for (const candidate of input.catalog_bundle.candidates) {
    if (!candidate?.candidate_id || candidates.has(candidate.candidate_id)) {
      throw new MaterializationError('MATERIALIZATION_CANDIDATE_INVALID', 'Candidate IDs must be non-empty and unique.');
    }
    candidates.set(candidate.candidate_id, candidate);
  }
  const choices = [];
  const instances = [];
  const gaps = [];
  const rules = [...input.catalog_bundle.rules].sort(compareRule);

  for (const rule of rules) {
    assertApplicableRecord(rule, input, 'rule');
    for (const candidateId of rule.candidate_ids) if (candidates.has(candidateId)) assertApplicableRecord(candidates.get(candidateId), input, 'candidate');
    const rejected = rule.candidate_ids.map((id) => candidates.get(id)).filter((candidate) => !candidate || candidate.status !== 'approved' || candidate.domain !== rule.domain);
    const eligible = [...new Set(rule.candidate_ids)]
      .map((id) => candidates.get(id))
      .filter((candidate) => candidate && candidate.status === 'approved' && candidate.domain === rule.domain)
      .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
    const candidateSetDigest = canonicalDigest(eligible.map((candidate) => candidate.candidate_id));
    if (eligible.length === 0 && rule.min_count > 0) {
      gaps.push({ rule_id: rule.rule_id, slot_key: rule.slot_key, domain: rule.domain, code: 'REQUIRED_CANDIDATE_SET_EMPTY' });
      continue;
    }
    const count = chooseCount(rule, random, eligible.length);
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const draw = random.nextUint32();
      const selected = weightedCandidate(eligible, draw);
      const instanceId = deterministicInstanceId(input.party_id, input.run_id, rule.domain, rule.slot_key, ordinal);
      instances.push({
        instance_id: instanceId,
        domain: rule.domain,
        slot_key: rule.slot_key,
        entry_role: rule.entry_role,
        ordinal,
        candidate_id: selected.candidate_id,
        template_id: selected.template_id,
        profile_id: selected.profile_id,
        rule_id: rule.rule_id,
        attributes: structuredClone(selected.attributes ?? {})
      });
      choices.push({
        choice_ordinal: choices.length,
        choice_key: `${rule.rule_id}:${rule.slot_key}:${ordinal}`,
        rule_id: rule.rule_id,
        slot_key: rule.slot_key,
        candidate_digest: candidateSetDigest,
        candidate_set_digest: candidateSetDigest,
        candidate_ids: eligible.map((candidate) => candidate.candidate_id),
        selected_id: selected.candidate_id,
        selected_weight: approvedWeight(selected),
        rng_draw: draw,
        rng_counter: random.drawCount,
        rejection_summary: {
          rejected_count: rejected.length,
          missing_count: rejected.filter((candidate) => !candidate).length,
          unapproved_count: rejected.filter((candidate) => candidate && candidate.status !== 'approved').length,
          wrong_domain_count: rejected.filter((candidate) => candidate?.status === 'approved' && candidate.domain !== rule.domain).length
        }
      });
    }
  }

  if (gaps.length > 0) throw new MaterializationError('MATERIALIZATION_BLOCKED_BY_GAPS', 'Required catalog candidates are missing.', { gaps });
  const domain = resolveInstanceReferences(partitionInstances(instances));
  const playerStartPosition = resolvePlayerStartPosition(domain, input.g4_id, input.catalog_bundle.player_start_anchor_slot_key);
  const validationReport = validateDomainMaterialization(domain, playerStartPosition.g5_anchor_id);
  if (!validationReport.pass) throw new MaterializationError('MATERIALIZATION_INVARIANT_FAILED', 'Materialized domain graph is invalid.', validationReport);
  const trace = {
    run_id: input.run_id,
    idempotency_key: `materialization:${input.party_id}:${input.run_id}`,
    materializer_version: MATERIALIZER_VERSION,
    rng_version: RNG_VERSION,
    world_revision_id: input.world_revision_id,
    seed_context: seedContext,
    seed_digest: seed.digest,
    input_digest: canonicalDigest(input),
    catalog_digest: input.catalog_digest,
    choices,
    rng_draw_count: random.drawCount,
    created_refs: instances.map((instance) => ({ domain: instance.domain, instance_id: instance.instance_id, candidate_id: instance.candidate_id, rule_id: instance.rule_id }))
  };
  const coreOutput = {
    version: 2,
    schema: 'world_materialization_result_v2',
    status: 'materialized',
    party_id: input.party_id,
    run_id: input.run_id,
    g4_id: input.g4_id,
    instances,
    g5_graph: { nodes: domain.g5_nodes, edges: domain.g5_edges, anchors: domain.g5_anchors },
    npcs: domain.npcs,
    items: domain.items,
    containers: domain.containers,
    relations: domain.relations,
    ownership: domain.ownership,
    schedules: domain.schedules,
    player_start_position: playerStartPosition,
    validation_report: validationReport
  };
  trace.result_digest = computeMaterializationResultDigest(coreOutput);
  const output = { ...coreOutput, proposed_write_set: buildExecutableWriteSet(input, domain, trace, validationReport), trace };
  return deepFreeze(output);
}

export function repairWorldInstances(input) {
  if (input?.version !== 2 || input?.schema !== 'world_materialization_repair_request_v2' || typeof input.repair_reason !== 'string' || !input.repair_reason.trim() || !input.previous_result || typeof input.previous_result !== 'object' || !/^[a-f0-9]{64}$/.test(String(input.previous_result_digest ?? '')) || !/^[a-f0-9]{64}$/.test(String(input.replacement_request_digest ?? '')) || !Array.isArray(input.repair_history) || input.repair_history.length === 0) throw new MaterializationError('MATERIALIZATION_REPAIR_REQUEST_INVALID', 'Repair requires the persisted previous result, reason, old/new digests and non-empty repair history.');
  if (input.previous_result_digest === input.replacement_request_digest || canonicalDigest(input.replacement_request) !== input.replacement_request_digest) throw new MaterializationError('MATERIALIZATION_REPAIR_REQUEST_INVALID', 'Repair digests are invalid or do not bind the replacement request.');
  if (computeMaterializationResultDigest(input.previous_result) !== input.previous_result_digest || input.previous_result.trace?.result_digest !== input.previous_result_digest) throw new MaterializationError('MATERIALIZATION_REPAIR_PREVIOUS_RESULT_TAMPERED', 'Repair previous result does not match its persisted digest.');
  if (input.replacement_request?.trigger !== 'expansion' || input.replacement_request?.existing_party_state?.baseline_exists !== true) throw new MaterializationError('MATERIALIZATION_REPAIR_REQUEST_INVALID', 'Repair replacement must be an explicit expansion over an existing baseline.');
  if (input.previous_result.party_id !== input.replacement_request.party_id || input.previous_result.g4_id !== input.replacement_request.g4_id || input.previous_result.trace?.world_revision_id !== input.replacement_request.world_revision_id || input.previous_result.trace?.materializer_version !== input.replacement_request.materializer_version || input.previous_result.trace?.rng_version !== input.replacement_request.rng_algorithm_id) throw new MaterializationError('MATERIALIZATION_REPAIR_IDENTITY_MISMATCH', 'Repair must preserve party, G4 and version pins.');
  const result = structuredClone(materializeWorldInstances(input.replacement_request));
  result.status = 'repaired';
  result.trace.repair = { repair_reason: input.repair_reason, previous_run_id: input.previous_result.run_id, previous_result_digest: input.previous_result_digest, replacement_request_digest: input.replacement_request_digest, repair_history: structuredClone(input.repair_history) };
  result.trace.result_digest = computeMaterializationResultDigest(result);
  const runBatch = result.proposed_write_set.write_batches.find((batch) => batch.target_table === 'party_materialization_runs');
  if (runBatch?.records?.[0]) { runBatch.records[0].run_kind = 'repair'; runBatch.records[0].result_digest = result.trace.result_digest; runBatch.records[0].supersedes_run_id = input.previous_result.run_id; runBatch.records[0].repair_reason = input.repair_reason; runBatch.records[0].trace = structuredClone(result.trace); }
  return deepFreeze(result);
}

export function materializeG5Scene(input) {
  const catalogSet = input?.allowed_g5_template_set ?? {};
  const suppliedCatalogDigest = catalogSet.catalog_digest;
  const catalogSnapshot = { version: catalogSet.version, schema: catalogSet.schema, selected_g4_type_id: catalogSet.selected_g4_type_id, world_revision_id: catalogSet.world_revision_id, allowed_g5_templates: catalogSet.allowed_g5_templates };
  const actualCatalogDigest = canonicalDigest(catalogSnapshot);
  if (!/^[a-f0-9]{64}$/.test(String(suppliedCatalogDigest ?? '')) || suppliedCatalogDigest !== actualCatalogDigest) throw new MaterializationError('CATALOG_DIGEST_MISMATCH', 'Stage 13 catalog digest must bind the complete immutable allowed G5 template snapshot.');
  const suppliedTemplates = catalogSet.allowed_g5_templates ?? [];
  const selectedG4TypeId = input.selected_start_node?.selected?.selected_g4_type_id ?? catalogSet.selected_g4_type_id;
  const templates = suppliedTemplates
    .filter((item) => item?.status === 'approved' && item.enabled !== false && g5TemplateMatchesScope(item, input.materialization_context, selectedG4TypeId))
    .sort((left, right) => String(left.template_id).localeCompare(String(right.template_id)));
  if (suppliedTemplates.some((item) => item?.status === 'approved' && item.enabled !== false && !g5TemplateMatchesScope(item, input.materialization_context, selectedG4TypeId))) throw new MaterializationError('G5_TEMPLATE_SCOPE_MISMATCH', 'Allowed G5 snapshot contains a template, profile or layout outside the pinned G4 type, revision, region or historical period.');
  if (templates.length === 0) throw new MaterializationError('G5_TEMPLATE_SET_EMPTY', 'Stage 13 requires an approved G5 template.');
  const chain = input.selected_start_node?.selected_node_chain ?? {};
  const g4Id = chain.g4_node_id;
  const materializationContext = input.materialization_context ?? {};
  const placeTemplateId = input.selected_start_node?.selected?.selected_place_template_id;
  const templateCandidateDigest = canonicalDigest(templates.map((item) => item.template_id));
  const worldRevisionId = templates[0]?.materialization_profile?.world_revision_id;
  if (templates.some((template) => template.materialization_profile?.world_revision_id !== worldRevisionId)) throw new MaterializationError('G5_TEMPLATE_REVISION_MIXED', 'All allowed G5 templates must use one pinned world revision.');
  const seedContext = {
    party_id: materializationContext.party_id,
    world_revision_id: worldRevisionId,
    region_id: materializationContext.region_id,
    year: materializationContext.year,
    season: materializationContext.season,
    g1_id: materializationContext.g1_id,
    g4_id: g4Id,
    trigger: materializationContext.trigger,
    occurrence: materializationContext.occurrence,
    materializer_version: materializationContext.materializer_version,
    rng_version: materializationContext.rng_version,
    template_candidate_digest: templateCandidateDigest,
    domain: 'g5'
  };
  if (!seedContext.party_id || !seedContext.g1_id || !seedContext.world_revision_id || !seedContext.region_id || !Number.isInteger(seedContext.year) || !seedContext.season || !seedContext.trigger || !Number.isInteger(seedContext.occurrence) || seedContext.materializer_version !== MATERIALIZER_VERSION || seedContext.rng_version !== RNG_VERSION) throw new MaterializationError('G5_MATERIALIZATION_CONTEXT_INVALID', 'Stage 13 requires a complete pinned materialization context.');
  const seed = deriveSeed(seedContext);
  const random = createRandomSource({ seed: seed.uint32 });
  const templateDraw = random.nextUint32();
  const selected = templates[templateDraw % templates.length];
  assertG5TemplateBundle(selected, g4Id);
  if (selected.materialization_profile.world_revision_id !== seedContext.world_revision_id || selected.materialization_profile.region_id !== seedContext.region_id) throw new MaterializationError('G5_TEMPLATE_SCOPE_MISMATCH', 'Selected G5 template is outside the pinned revision or region.');
  const runId = `baseline_${seed.digest.slice(0, 24)}`;
  const nodeTemplates = indexApproved(selected.g5_minilocation_templates, 'template_id', 'G5_NODE_TEMPLATE_INVALID');
  const anchorTemplates = indexApproved(selected.g5_anchor_templates, 'template_id', 'G5_ANCHOR_TEMPLATE_INVALID');
  const edgeTemplates = indexApproved(selected.g5_edge_templates, 'template_id', 'G5_EDGE_TEMPLATE_INVALID');
  const nodeRules = selected.slot_rules.filter((rule) => rule.slot_domain === 'g5_node').sort(compareRule);
  const anchorRules = selected.slot_rules.filter((rule) => rule.slot_domain === 'anchor').sort(compareRule);
  const npcMaterializationSlots = selected.slot_rules.filter((rule) => rule.slot_domain === 'npc').sort(compareRule).map((rule) => structuredClone(rule));
  const itemMaterializationSlots = selected.slot_rules.filter((rule) => ['item', 'container'].includes(rule.slot_domain)).sort(compareRule).map((rule) => structuredClone(rule));
  const choices = [{ choice_ordinal: 0, choice_key: 'g5_template:approved_template:0', slot_key: 'g5_template', candidate_digest: templateCandidateDigest, candidate_set_digest: templateCandidateDigest, candidate_ids: templates.map((item) => item.template_id), selected_id: selected.template_id, selected_weight: 1, rng_draw: templateDraw, rng_counter: random.drawCount, rejection_summary: { rejected_count: 0, missing_count: 0, unapproved_count: 0, wrong_domain_count: 0 } }];
  const nodeBySlot = new Map();
  const minilocations = [];
  for (const rule of nodeRules) {
    const template = nodeTemplates.get(rule.g5_minilocation_template_id);
    if (!template) throw new MaterializationError('G5_NODE_TEMPLATE_NOT_APPROVED', `Slot ${rule.slot_key} references a missing approved node template.`);
    const count = chooseApprovedCount(rule, random, choices);
    const ids = [];
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const id = deterministicInstanceId(materializationContext.party_id, runId, 'g5_node', rule.slot_key, ordinal);
      ids.push(id);
      minilocations.push({
        g5_minilocation_id: id,
        parent_g4_node_id: g4Id,
        template_id: template.template_id,
        slot_key: rule.slot_key,
        capacity: template.capacity,
        access: structuredClone(template.access_policy),
        visibility: structuredClone(template.visibility_policy),
        state: structuredClone(template.initial_state)
      });
    }
    nodeBySlot.set(rule.slot_key, ids);
  }
  const anchors = [];
  const anchorBySlot = new Map();
  for (const rule of anchorRules) {
    const template = anchorTemplates.get(rule.g5_anchor_template_id);
    const parentIds = nodeBySlot.get(rule.parent_node_slot_key);
    if (!template || !Array.isArray(parentIds) || parentIds.length !== 1) throw new MaterializationError('G5_ANCHOR_RULE_UNRESOLVED', `Anchor slot ${rule.slot_key} has an unresolved approved template or parent node.`);
    const count = chooseApprovedCount(rule, random, choices);
    const ids = [];
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const id = deterministicInstanceId(materializationContext.party_id, runId, 'g5_anchor', rule.slot_key, ordinal);
      ids.push(id);
      anchors.push({
        anchor_id: id,
        minilocation_id: parentIds[0],
        parent_g4_node_id: g4Id,
        template_id: selected.template_id,
        anchor_template_id: template.template_id,
        slot_key: rule.slot_key,
        anchor_type: template.anchor_type,
        supports: {
          can_hold_npc: template.can_hold_npc,
          can_hold_item: template.can_hold_item,
          can_hold_container: template.can_hold_container,
          npc_capacity: template.npc_capacity,
          item_capacity: template.item_capacity,
          container_capacity: template.container_capacity
        },
        visibility: structuredClone(template.visibility_policy),
        access: structuredClone(template.access_policy)
      });
    }
    anchorBySlot.set(rule.slot_key, ids);
  }
  const edges = selected.layout_edges.map((edge, ordinal) => {
    const template = edgeTemplates.get(edge.g5_edge_template_id);
    const fromIds = anchorBySlot.get(edge.from_anchor_slot_key);
    const toIds = anchorBySlot.get(edge.to_anchor_slot_key);
    if (!template || fromIds?.length !== 1 || toIds?.length !== 1) throw new MaterializationError('G5_LAYOUT_EDGE_UNRESOLVED', `Layout edge ${edge.edge_id} has unresolved approved references.`);
    return {
      edge_id: deterministicInstanceId(materializationContext.party_id, runId, 'g5_edge', edge.edge_id, ordinal),
      from_anchor_id: fromIds[0],
      to_anchor_id: toIds[0],
      template_id: template.template_id,
      access: structuredClone(template.access_policy),
      visibility: structuredClone(template.visibility_policy),
      state: structuredClone(template.initial_state)
    };
  });
  const startIds = anchorBySlot.get(selected.player_start_anchor_slot_key);
  if (startIds?.length !== 1) throw new MaterializationError('G5_START_ANCHOR_UNRESOLVED', 'Approved player start anchor slot must resolve to one anchor.');
  if (minilocations.length > selected.materialization_profile.maximum_g5_nodes) throw new MaterializationError('G5_NODE_LIMIT_EXCEEDED', 'Approved G4 materialization profile node limit was exceeded.');
  const startAnchor = anchors.find((anchor) => anchor.anchor_id === startIds[0]);
  const exitAnchorIds = selected.slot_rules.filter((rule) => rule.slot_domain === 'anchor' && ['exit', 'start_and_exit'].includes(rule.entry_role)).flatMap((rule) => anchorBySlot.get(rule.slot_key) ?? []);
  assertConnectedG5Graph(minilocations, anchors, edges, startAnchor.anchor_id, exitAnchorIds);
  const trace = { run_id: runId, run_kind: 'baseline', occurrence: materializationContext.occurrence, world_revision_id: selected.materialization_profile.world_revision_id, materializer_version: MATERIALIZER_VERSION, rng_version: RNG_VERSION, seed_context: seedContext, seed_digest: seed.digest, input_digest: canonicalDigest(input), catalog_digest: actualCatalogDigest, idempotency_key: `materialization:${materializationContext.party_id}:${runId}`, selected_template_id: selected.template_id, profile_id: selected.materialization_profile.profile_id, layout_template_id: selected.materialization_profile.layout_template_id, choices };
  trace.result_digest = canonicalDigest({ party_id: materializationContext.party_id, run_id: runId, g4_id: g4Id, g5_minilocations: minilocations, g5_anchors: anchors, g5_edges: edges, player_start_anchor_id: startAnchor.anchor_id });
  return deepFreeze({
    version: 1,
    schema: 'g5_scene_graph_draft',
    request_id: input.request_id,
    materialization_status: 'materialized',
    frame: { weather_state: structuredClone(input.weather_state) },
    parent_location: { ...structuredClone(chain), place_template_id: placeTemplateId },
    g5_minilocations: minilocations,
    g5_anchors: anchors,
    g5_edges: edges,
    player_start_position: { location_id: g4Id, minilocation_id: startAnchor.minilocation_id, anchor_id: startAnchor.anchor_id },
    visibility_model: structuredClone(selected.visibility_model),
    access_model: structuredClone(selected.access_model),
    npc_materialization_slots: npcMaterializationSlots,
    item_materialization_slots: itemMaterializationSlots,
    unmaterialized_possible_details: [],
    downstream_constraints: {},
    source_trace: [{ source_id: selected.template_id, source_kind: 'approved_g5_template' }],
    audit_self_check: { pass: true, concerns: [], evidence: [{ kind: 'code_validation', seed_digest: seed.digest }] },
    materialization_run: trace,
    validation_report: { pass: true, checks: ['connected_graph', 'approved_profile_layout_slot_refs', 'start_anchor_reachable'] },
    write_set: { g5_nodes: minilocations.map((item) => item.g5_minilocation_id), g5_anchors: anchors.map((item) => item.anchor_id), g5_edges: edges.map((item) => item.edge_id) }
  });
}

export { materializeItemPlacement, materializeNpcPlacement } from './placement-materializers.js';

function g5TemplateMatchesScope(template, scope = {}, selectedG4TypeId) {
  if (!selectedG4TypeId || template?.g4_type_id !== selectedG4TypeId || !scope.world_revision_id || !scope.region_id || !Number.isInteger(scope.year) || typeof scope.season !== 'string' || !scope.season) return false;
  return [template, template?.materialization_profile, template?.layout_template].every((record) => record
    && record.world_revision_id === scope.world_revision_id
    && record.region_id === scope.region_id
    && Number.isInteger(record.valid_from_year)
    && Number.isInteger(record.valid_to_year)
    && scope.year >= record.valid_from_year
    && scope.year <= record.valid_to_year
    && Array.isArray(record.allowed_seasons)
    && record.allowed_seasons.length > 0
    && (record.allowed_seasons.includes('all') || record.allowed_seasons.includes(scope.season)));
}
