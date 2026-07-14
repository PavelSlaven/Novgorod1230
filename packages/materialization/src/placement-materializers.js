import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, deterministicInstanceId, MATERIALIZER_VERSION, MaterializationError } from './core.js';
import { materializeApprovedItems, parentScene, requireFields } from './stage-helpers.js';
import { resolveItemPlacementCandidates, resolveNpcPlacementCandidates } from './placement-resolution.js';

export function materializeNpcPlacement(input) {
  const identity = requirePlacementIdentity(input);
  const candidateSet = input?.npc_candidate_set;
  if (!Array.isArray(input?.eligible_npc_candidates) || !Array.isArray(input?.eligible_g5_anchors)) throw new MaterializationError('NPC_ELIGIBILITY_SET_MISSING', 'Stage 15 code materializer requires code-filtered candidates and anchors.');
  const anchors = new Map(input.eligible_g5_anchors.map((anchor) => [anchor.anchor_id, anchor]));
  const required = resolveNpcPlacementCandidates(input)
    .sort((left, right) => String(left.npc_candidate_id).localeCompare(String(right.npc_candidate_id)));
  if (required.length === 0 && candidateSet?.empty_allowed !== true && input.npc_placement_policy?.allow_empty_scene_if_place_supports_it !== true) throw new MaterializationError('NPC_EMPTY_NOT_APPROVED', 'An empty NPC placement requires an explicit approved empty allowance.');
  const instances = required.map((candidate, ordinal) => {
    requireFields(candidate, ['npc_candidate_id', 'npc_profile_set_id', 'profile_level', 'social_role_id', 'npc_archetype_id', 'placement', 'identity_state', 'visibility_state', 'machine_state', 'knowledge_scope', 'source_trace'], 'NPC_CANDIDATE_INCOMPLETE');
    const anchor = anchors.get(candidate.placement.g5_anchor_id);
    if (!anchor || anchor.supports?.can_hold_npc !== true || !candidate.placement.presence_reason) throw new MaterializationError('NPC_PLACEMENT_RULE_INVALID', `NPC candidate ${candidate.npc_candidate_id} has no eligible anchor or presence reason.`);
    return {
      npc_instance_id: deterministicInstanceId(identity.partyId, identity.runId, 'npc', candidate.slot_rule_id, ordinal),
      npc_candidate_id: candidate.npc_candidate_id, profile_set_id: candidate.npc_profile_set_id, profile_level: candidate.profile_level,
      base_refs: { social_role_id: candidate.social_role_id, occupation_id: candidate.occupation_id ?? null, npc_archetype_id: candidate.npc_archetype_id, key_npc_seed_id: candidate.key_npc_seed_id ?? null },
      placement: structuredClone(candidate.placement), identity: structuredClone(candidate.identity_state), visibility_state: structuredClone(candidate.visibility_state),
      access_state: structuredClone(candidate.access_state ?? {}), causal_basis: structuredClone(candidate.causal_basis ?? {}),
      interaction_state: structuredClone(candidate.machine_state), machine_state: structuredClone(candidate.machine_state), knowledge_scope: structuredClone(candidate.knowledge_scope),
      traits: structuredClone(candidate.traits ?? []), knowledge_records: structuredClone(candidate.knowledge_records ?? []), schedule_records: structuredClone(candidate.schedule_records ?? []),
      hidden_state_projection: structuredClone(candidate.hidden_state_projection ?? null), source_trace: structuredClone(candidate.source_trace)
    };
  });
  const instanceByCandidate = new Map(instances.map((instance) => [instance.npc_candidate_id, instance.npc_instance_id]));
  const relations = required.flatMap((candidate) => (candidate.relations ?? []).map((relation) => {
    const fromCandidateId = relation.from_npc_candidate_id ?? candidate.npc_candidate_id;
    const toCandidateId = relation.to_npc_candidate_id;
    const fromNpcId = instanceByCandidate.get(fromCandidateId);
    const toNpcId = instanceByCandidate.get(toCandidateId);
    requireFields(relation, ['relation_category_id', 'state'], 'NPC_RELATION_INCOMPLETE');
    if (!fromNpcId || !toNpcId || fromNpcId === toNpcId) throw new MaterializationError('NPC_RELATION_REFERENCE_INVALID', 'NPC relations must reference two different materialized candidate IDs.', { from_npc_candidate_id: fromCandidateId, to_npc_candidate_id: toCandidateId });
    return { from_npc_id: fromNpcId, to_npc_id: toNpcId, relation_category_id: relation.relation_category_id, state: structuredClone(relation.state) };
  }));
  const placementRun = buildPlacementRun(input, identity, 'npc', instances.map((instance, ordinal) => ({ ordinal, slot_key: required[ordinal].slot_rule_id, candidate_id: instance.npc_candidate_id, instance_id: instance.npc_instance_id })));
  return deepFreeze({
    version: 1, schema: 'initial_npc_placement_draft', request_id: input.request_id,
    placement_status: instances.length ? 'placed' : 'empty_allowed', parent_scene: parentScene(input), ...(instances.length ? {} : { empty_scene_reason: candidateSet.empty_reason }), npc_instances: instances,
    npc_anchor_bindings: instances.map((npc) => ({ npc_instance_id: npc.npc_instance_id, g5_anchor_id: npc.placement.g5_anchor_id, parent_g4_node_id: npc.placement.parent_g4_node_id })),
    npc_visibility_state: instances.map((npc) => ({ npc_instance_id: npc.npc_instance_id, ...structuredClone(npc.visibility_state) })),
    npc_attention_and_witness_state: instances.map((npc) => ({ npc_instance_id: npc.npc_instance_id, ...structuredClone(npc.machine_state.attention_and_witness_state) })),
    npc_schedule_state: instances.flatMap((npc) => npc.schedule_records.map((schedule) => ({ npc_instance_id: npc.npc_instance_id, ...structuredClone(schedule) }))), npc_relations: relations,
    source_trace: [{ source_id: candidateSet.catalog_digest, source_kind: 'approved_npc_candidate_set' }], downstream_constraints: {},
    audit_self_check: { pass: true, concerns: [], evidence: [{ kind: 'code_materialization', materializer_version: MATERIALIZER_VERSION }] }
    , materialization_run: placementRun, validation_report: { pass: true, domain: 'npc', created_count: instances.length }
  });
}

export function materializeItemPlacement(input) {
  const identity = requirePlacementIdentity(input);
  const candidateSet = input?.item_profile_candidate_set;
  for (const field of ['eligible_item_profile_candidates', 'eligible_container_profile_candidates', 'eligible_property_rule_candidates', 'eligible_g5_item_anchors', 'eligible_g5_container_anchors']) if (!Array.isArray(input?.[field])) throw new MaterializationError('ITEM_ELIGIBILITY_SET_MISSING', `Stage 16 code materializer requires ${field}.`);
  const anchors = new Map([...input.eligible_g5_item_anchors, ...input.eligible_g5_container_anchors].map((anchor) => [anchor.anchor_id, anchor]));
  const propertyRules = new Map(input.eligible_property_rule_candidates.map((rule) => [rule.property_rule_candidate_id ?? rule.candidate_id ?? rule.id, rule]));
  const items = materializeApprovedItems(resolveItemPlacementCandidates(input, 'item'), { input, partyId: identity.partyId, runId: identity.runId, anchors, kind: 'item' });
  const containers = materializeApprovedItems(resolveItemPlacementCandidates(input, 'container'), { input, partyId: identity.partyId, runId: identity.runId, anchors, kind: 'container' });
  const placed = items.length + containers.length > 0;
  if (!placed && candidateSet?.empty_allowed !== true && input.item_placement_policy?.allow_empty_item_scene_if_place_supports_it !== true) throw new MaterializationError('ITEM_EMPTY_NOT_APPROVED', 'An empty item placement requires an explicit approved empty allowance.');
  const propertyBindings = [...items.map((instance) => ({ instance, kind: 'item' })), ...containers.map((instance) => ({ instance, kind: 'container' }))].flatMap(({ instance, kind }) => {
    const propertyRuleId = instance.property_state?.property_rule_candidate_id;
    if (!propertyRuleId) return [];
    if (!propertyRules.has(propertyRuleId)) throw new MaterializationError('PROPERTY_RULE_NOT_ELIGIBLE', `Property rule ${propertyRuleId} was not approved by the Stage 16 eligibility gate.`);
    return [{ property_rule_candidate_id: propertyRuleId, applies_to: { [`${kind}_instance_id`]: instance[`${kind}_instance_id`] }, access_model: structuredClone(instance.access_state), risk_model: structuredClone(instance.risk_state) }];
  });
  const projectState = (field) => [...items.map((instance) => ({ item_instance_id: instance.item_instance_id, ...structuredClone(instance[field]) })), ...containers.map((instance) => ({ container_instance_id: instance.container_instance_id, ...structuredClone(instance[field]) }))];
  const resourceRefs = [...items.map((instance, ordinal) => ({ ordinal, slot_key: instance.slot_rule_id, candidate_id: instance.item_profile_candidate_id, instance_id: instance.item_instance_id })), ...containers.map((instance, ordinal) => ({ ordinal: items.length + ordinal, slot_key: instance.slot_rule_id, candidate_id: instance.container_profile_candidate_id, instance_id: instance.container_instance_id }))];
  return deepFreeze({
    version: 1, schema: 'initial_item_placement_draft', request_id: input.request_id, placement_status: placed ? 'placed' : 'empty_allowed', parent_scene: parentScene(input), ...(placed ? {} : { empty_scene_reason: candidateSet.empty_reason }),
    item_instances: items, container_instances: containers,
    item_anchor_bindings: items.map((item) => ({ item_instance_id: item.item_instance_id, g5_anchor_id: item.placement?.g5_anchor_id, parent_g4_node_id: item.placement?.parent_g4_node_id })).filter((item) => item.g5_anchor_id),
    container_anchor_bindings: containers.map((item) => ({ container_instance_id: item.container_instance_id, g5_anchor_id: item.placement?.g5_anchor_id, parent_g4_node_id: item.placement?.parent_g4_node_id })).filter((item) => item.g5_anchor_id),
    property_bindings: propertyBindings, visibility_state: projectState('visibility_state'), access_state: projectState('access_state'), risk_state: projectState('risk_state'), rejected_item_placements: [],
    source_trace: [{ source_id: candidateSet.catalog_digest, source_kind: 'approved_item_candidate_set' }], downstream_constraints: {}, audit_self_check: { pass: true, concerns: [], evidence: [{ kind: 'code_materialization', materializer_version: MATERIALIZER_VERSION }] },
    materialization_run: buildPlacementRun(input, identity, 'resource', resourceRefs), validation_report: { pass: true, domain: 'resource', created_count: resourceRefs.length }
  });
}

function buildPlacementRun(input, identity, domain, refs) {
  const choices = refs.map((ref, index) => ({ choice_ordinal: index, slot_key: ref.slot_key, candidate_set_digest: canonicalDigest([ref.candidate_id]), candidate_ids: [ref.candidate_id], selected_id: ref.candidate_id, rng_draw: 0 }));
  return { run_id: identity.runId, party_id: identity.partyId, g4_id: identity.g4Id, domain, materializer_version: MATERIALIZER_VERSION, idempotency_key: `materialization:${identity.partyId}:${identity.runId}:${domain}`, input_digest: canonicalDigest(input), choices, created_refs: refs.map((ref) => ({ domain, instance_id: ref.instance_id, candidate_id: ref.candidate_id, slot_key: ref.slot_key })), validation_report: { pass: true, created_count: refs.length } };
}

function requirePlacementIdentity(input) {
  const trace = input?.g5_scene_graph?.materialization_run;
  const partyId = trace?.seed_context?.party_id;
  const runId = trace?.run_id;
  const g4Id = input?.selected_start_node?.selected_node_chain?.g4_node_id;
  if (!partyId || !runId || !g4Id || trace?.seed_context?.g4_id !== g4Id) throw new MaterializationError('PLACEMENT_IDENTITY_MISMATCH', 'Placement materialization requires party/run/G4 identity bound to the Stage 13 seed context.');
  return { partyId, runId, g4Id };
}
