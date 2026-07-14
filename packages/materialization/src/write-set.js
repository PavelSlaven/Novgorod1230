import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';

export function buildExecutableWriteSet(input, domain, trace, validationReport) {
  const partyId = input.party_id;
  const runId = input.run_id;
  const rows = {
    party_materialization_runs: [{
      party_id: partyId, run_id: runId, g4_id: input.g4_id,
      run_kind: ['new_game', 'first_entry'].includes(input.trigger) ? 'baseline' : input.trigger,
      occurrence: input.occurrence, seed_digest: trace.seed_digest, input_digest: trace.input_digest,
      catalog_digest: trace.catalog_digest, materializer_version: trace.materializer_version, rng_version: trace.rng_version,
      result_digest: trace.result_digest, supersedes_run_id: trace.repair?.previous_run_id ?? null, repair_reason: trace.repair?.repair_reason ?? null,
      idempotency_key: `materialization:${partyId}:${runId}`,
      status: 'committed', validation_report: structuredClone(validationReport), trace: structuredClone(trace),
      created_refs: createdRefs(domain)
    }],
    party_materialization_choices: trace.choices.map((choice) => ({
      party_id: partyId, run_id: runId, choice_ordinal: choice.choice_ordinal, slot_key: choice.slot_key,
      candidate_set_digest: choice.candidate_set_digest, candidate_ids: JSON.stringify(choice.candidate_ids),
      selected_id: choice.selected_id, rng_draw: choice.rng_draw
    })),
    party_g5_nodes: domain.g5_nodes.map((instance) => ({
      party_id: partyId, g5_node_id: instance.instance_id, run_id: runId, parent_g4_id: input.g4_id,
      template_id: requiredInstanceValue(instance, instance.template_id, 'template_id'), slot_key: instance.slot_key,
      state: graphSemanticState(instance)
    })),
    party_g5_anchors: domain.g5_anchors.map((instance) => ({
      party_id: partyId, anchor_id: instance.instance_id, g5_node_id: requiredInstanceAttribute(instance, 'g5_node_instance_id'),
      template_id: requiredInstanceValue(instance, instance.template_id, 'template_id'), slot_key: instance.slot_key,
      npc_capacity: integerInstanceAttribute(instance, 'npc_capacity', 0), item_capacity: integerInstanceAttribute(instance, 'item_capacity', 0),
      container_capacity: integerInstanceAttribute(instance, 'container_capacity', 0), state: graphSemanticState(instance)
    })),
    party_g5_edges: domain.g5_edges.map((instance) => ({
      party_id: partyId, g5_edge_id: instance.instance_id, from_anchor_id: requiredInstanceAttribute(instance, 'from_instance_id'),
      to_anchor_id: requiredInstanceAttribute(instance, 'to_instance_id'), template_id: requiredInstanceValue(instance, instance.template_id, 'template_id'),
      state: graphSemanticState(instance)
    })),
    party_npcs: domain.npcs.map((instance) => ({
      party_id: partyId, npc_id: instance.instance_id, run_id: runId,
      profile_set_id: requiredInstanceValue(instance, instance.profile_id, 'profile_id'),
      profile_level: enumInstanceAttribute(instance, 'profile_level', ['background', 'scene', 'key']),
      anchor_id: optionalInstanceAttribute(instance, 'anchor_instance_id'), identity_state: objectInstanceValue(instance, 'identity_state'),
      machine_state: objectInstanceValue(instance, 'machine_state'), semantic_state: {
        presence_reason: instance.attributes?.presence_reason,
        access_state: structuredClone(instance.attributes?.access_state), visibility_state: structuredClone(instance.attributes?.visibility_state),
        causal_basis: structuredClone(instance.attributes?.causal_basis), source_trace: structuredClone(instance.attributes?.source_trace ?? [])
      }
    })),
    party_npc_traits: domain.npcs.flatMap((instance) => arrayInstanceAttribute(instance, 'traits').map((trait) => ({
      party_id: partyId, npc_id: instance.instance_id,
      trait_domain: requiredNestedValue(instance, trait, 'trait_domain', 'traits'),
      category_id: requiredNestedValue(instance, trait, 'category_id', 'traits'),
      source_profile_id: requiredNestedValue(instance, trait, 'source_profile_id', 'traits')
    }))),
    party_npc_relations: domain.relations.map((instance) => ({
      party_id: partyId, from_npc_id: requiredInstanceAttribute(instance, 'from_npc_instance_id'),
      to_npc_id: requiredInstanceAttribute(instance, 'to_npc_instance_id'),
      relation_category_id: requiredInstanceAttribute(instance, 'relation_category_id'), state: objectInstanceValue(instance, 'state')
    })),
    party_npc_knowledge: domain.npcs.flatMap((instance) => arrayInstanceAttribute(instance, 'knowledge').map((record) => ({
      party_id: partyId, npc_id: instance.instance_id,
      fact_id: requiredNestedValue(instance, record, 'fact_id', 'knowledge'),
      knowledge_state: requiredNestedValue(instance, record, 'knowledge_state', 'knowledge')
    }))),
    party_npc_schedules: domain.schedules.map((instance) => ({
      party_id: partyId, npc_id: requiredInstanceAttribute(instance, 'npc_instance_id'),
      time_band: requiredInstanceAttribute(instance, 'time_band'),
      schedule_profile_id: requiredInstanceValue(instance, instance.profile_id ?? instance.attributes?.schedule_profile_id, 'schedule_profile_id'),
      g5_node_id: optionalInstanceAttribute(instance, 'g5_node_instance_id')
    })),
    party_containers: orderContainersForPersistence(domain.containers).map((instance) => ({
      party_id: partyId, container_id: instance.instance_id, run_id: runId,
      template_id: requiredInstanceValue(instance, instance.template_id, 'template_id'),
      anchor_id: optionalInstanceAttribute(instance, 'anchor_instance_id'),
      parent_container_id: optionalInstanceAttribute(instance, 'parent_container_instance_id'),
      holder_npc_id: optionalInstanceAttribute(instance, 'holder_npc_instance_id'),
      holder_character_id: optionalInstanceAttribute(instance, 'holder_character_id'),
      state: materializedResourceState(instance)
    })),
    party_items: domain.items.map((instance) => ({
      party_id: partyId, item_id: instance.instance_id, run_id: runId,
      template_id: requiredInstanceValue(instance, instance.template_id, 'template_id'),
      profile_id: requiredInstanceValue(instance, instance.profile_id, 'profile_id'),
      category_id: requiredInstanceAttribute(instance, 'item_category_id'),
      quantity: integerInstanceAttribute(instance, 'quantity', 1), condition_state: requiredInstanceAttribute(instance, 'condition_state'),
      legal_status: requiredInstanceAttribute(instance, 'legal_status'), state: materializedResourceState(instance)
    })),
    party_item_placements: domain.items.map((instance) => itemPlacementRow(partyId, instance)),
    party_ownership: domain.ownership.map((instance) => ownershipRow(partyId, instance))
  };
  const writeOrder = Object.keys(rows);
  return deepFreeze({
    version: 2, schema: 'party_runtime_write_set_v2',
    transaction: { isolation: 'serializable', atomic: true, write_order: writeOrder.map((table) => `materialization_${table}`) },
    write_batches: writeOrder.map((table) => ({ batch_id: `materialization_${table}`, target_schema: 'party_runtime', target_table: table, operation_mode: 'insert_only', records: rows[table] }))
  });
}

function orderContainersForPersistence(containers) {
  const byId = new Map(containers.map((instance) => [instance.instance_id, instance]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (instance) => {
    if (visited.has(instance.instance_id)) return;
    if (visiting.has(instance.instance_id)) throw new MaterializationError('MATERIALIZATION_CONTAINER_CYCLE', `Container ${instance.instance_id} participates in a parent cycle.`);
    visiting.add(instance.instance_id);
    const parentId = instance.attributes?.parent_container_instance_id;
    if (parentId != null) {
      const parent = byId.get(parentId);
      if (!parent) throw new MaterializationError('MATERIALIZATION_CONTAINER_PARENT_INVALID', `Container ${instance.instance_id} references an unknown parent container.`);
      if (parentId === instance.instance_id) throw new MaterializationError('MATERIALIZATION_CONTAINER_CYCLE', `Container ${instance.instance_id} cannot contain itself.`);
      visit(parent);
    }
    visiting.delete(instance.instance_id);
    visited.add(instance.instance_id);
    ordered.push(instance);
  };
  for (const instance of containers) visit(instance);
  return ordered;
}

function graphSemanticState(instance) {
  return { ...objectInstanceValue(instance, 'state'), access_state: structuredClone(instance.attributes?.access_state), visibility_state: structuredClone(instance.attributes?.visibility_state) };
}

function createdRefs(domain) {
  return Object.entries(domain).flatMap(([domainName, instances]) => instances.map((instance) => ({ domain: domainName, instance_id: instance.instance_id, candidate_id: instance.candidate_id, rule_id: instance.rule_id })));
}

function materializedResourceState(instance) {
  return {
    ...objectInstanceValue(instance, 'state'),
    item_category_id: instance.attributes?.item_category_id ?? null,
    causal_basis: structuredClone(instance.attributes?.causal_basis),
    property_state: structuredClone(instance.attributes?.property_state),
    access_state: structuredClone(instance.attributes?.access_state),
    visibility_state: structuredClone(instance.attributes?.visibility_state),
    risk_state: structuredClone(instance.attributes?.risk_state)
  };
}

function itemPlacementRow(partyId, instance) {
  const placement = instance.attributes?.placement;
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) throw instanceValueError(instance, 'placement');
  const mapping = { anchor_instance_id: 'anchor_id', container_instance_id: 'container_id', holder_npc_instance_id: 'holder_npc_id', holder_character_id: 'holder_character_id' };
  const targets = Object.entries(mapping).filter(([source]) => typeof placement[source] === 'string' && placement[source].trim());
  if (targets.length !== 1) throw new MaterializationError('MATERIALIZATION_INSTANCE_VALUE_INVALID', `Item ${instance.instance_id} must have exactly one approved placement target.`);
  return { party_id: partyId, item_id: instance.instance_id, [targets[0][1]]: placement[targets[0][0]] };
}

function ownershipRow(partyId, instance) {
  const targetMapping = { item_instance_id: 'item_id', container_instance_id: 'container_id' };
  const ownerMapping = { owner_npc_instance_id: 'owner_npc_id', owner_character_id: 'owner_character_id', owner_party: 'owner_party' };
  const target = Object.entries(targetMapping).filter(([source]) => instance.attributes?.[source]);
  const owner = Object.entries(ownerMapping).filter(([source]) => source === 'owner_party' ? instance.attributes?.[source] === true : instance.attributes?.[source]);
  if (target.length !== 1 || owner.length !== 1) throw new MaterializationError('MATERIALIZATION_INSTANCE_VALUE_INVALID', `Ownership ${instance.instance_id} must have exactly one target and owner.`);
  return {
    party_id: partyId, ownership_id: instance.instance_id,
    [target[0][1]]: instance.attributes[target[0][0]], [owner[0][1]]: instance.attributes[owner[0][0]],
    controller_npc_id: optionalInstanceAttribute(instance, 'controller_npc_instance_id'),
    claim_state: requiredInstanceAttribute(instance, 'claim_state')
  };
}

function requiredInstanceAttribute(instance, key) { return requiredInstanceValue(instance, instance.attributes?.[key], key); }
function optionalInstanceAttribute(instance, key) {
  const value = instance.attributes?.[key];
  if (value == null) return null;
  return requiredInstanceValue(instance, value, key);
}
function requiredInstanceValue(instance, value, key) {
  if (typeof value !== 'string' || !value.trim()) throw instanceValueError(instance, key);
  return value;
}
function objectInstanceValue(instance, key) {
  const value = instance.attributes?.[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw instanceValueError(instance, key);
  return structuredClone(value);
}
function arrayInstanceAttribute(instance, key) {
  const value = instance.attributes?.[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw instanceValueError(instance, key);
  return value;
}
function integerInstanceAttribute(instance, key, minimum) {
  const value = instance.attributes?.[key];
  if (!Number.isInteger(value) || value < minimum) throw instanceValueError(instance, key);
  return value;
}
function enumInstanceAttribute(instance, key, allowed) {
  const value = requiredInstanceAttribute(instance, key);
  if (!allowed.includes(value)) throw instanceValueError(instance, key);
  return value;
}
function requiredNestedValue(instance, record, key, collection) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record[key] !== 'string' || !record[key].trim()) throw instanceValueError(instance, `${collection}.${key}`);
  return record[key];
}
function instanceValueError(instance, key) {
  return new MaterializationError('MATERIALIZATION_INSTANCE_VALUE_INVALID', `Approved ${instance.domain} candidate ${instance.candidate_id} requires ${key}.`, { instance_id: instance.instance_id, candidate_id: instance.candidate_id, key });
}
