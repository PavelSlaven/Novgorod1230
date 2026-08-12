import { deepFreeze } from '@rus/kernel';

const OPERATORS = new Set(['all_of', 'min_count']);

export function resolveEvidenceConclusions(graph, committedEvidence = []) {
  const invalid = (code, details = {}) => deepFreeze({
    ok: false,
    error_code: code,
    details: structuredClone(details),
    committed_evidence_refs: [],
    supported_conclusion_refs: [],
    supported_chain_refs: [],
    applied_combination_ids: []
  });
  const validation = validateGraph(graph);
  if (!validation.ok) return invalid(validation.code, validation.details);
  if (!Array.isArray(committedEvidence)
      || committedEvidence.some((value) => !exactText(value))
      || new Set(committedEvidence).size !== committedEvidence.length) {
    return invalid('EVIDENCE_COMMITTED_REFS_INVALID');
  }

  const admittedInputs = admittedInputRefs(graph);
  const unknown = committedEvidence.filter((ref) => !admittedInputs.has(ref));
  if (unknown.length > 0) {
    return invalid('EVIDENCE_COMMITTED_REF_UNKNOWN', { refs: unknown.sort() });
  }

  const committed = [...committedEvidence].sort(compare);
  const supported = new Set(committed);
  const conclusions = new Set();
  const chains = [...graph.evidence_chains].sort((left, right) =>
    compare(left.chain_id, right.chain_id));
  const pending = chains.flatMap((chain) => chain.inference_nodes.map(
    (node) => ({ chain, node })));
  let changed = true;
  while (changed) {
    changed = false;
    for (const { node } of pending) {
      if (supported.has(node.node_ref)) continue;
      const count = node.input_refs.filter((ref) => supported.has(ref)).length;
      const applies = node.operator === 'all_of'
        ? count === node.input_refs.length
        : count >= node.min_count;
      if (!applies) continue;
      supported.add(node.node_ref);
      conclusions.add(node.node_ref);
      changed = true;
    }
  }

  const supportedChains = chains.filter((chain) =>
    supported.has(terminalNodeRef(chain)));
  const combinations = applyApprovedCombinations(graph, supportedChains,
    supported, conclusions);
  if (!combinations.ok) return invalid(combinations.code, combinations.details);

  return deepFreeze({
    ok: true,
    error_code: null,
    graph_ref: {
      graph_id: graph.clue_evidence_graph_set_id,
      revision: graph.revision
    },
    committed_evidence_refs: committed,
    supported_conclusion_refs: [...conclusions].sort(compare),
    supported_chain_refs: supportedChains.map(({ chain_id }) => chain_id)
      .sort(compare),
    applied_combination_ids: combinations.ids.sort(compare),
    rejected_or_absent_refs: []
  });
}

function validateGraph(graph) {
  const fail = (code, details = {}) => ({ ok: false, code, details });
  if (!plain(graph)
      || graph.schema !== 'rus.trace_clue_evidence_graph_set.v1'
      || !exactText(graph.clue_evidence_graph_set_id)
      || !Number.isInteger(graph.revision) || graph.revision < 1
      || graph.owner !== '@rus/visibility-knowledge-memory'
      || graph.fallback_policy !== 'forbidden'
      || graph.normalization_policy !== 'forbidden'
      || graph.alias_policy !== 'forbidden'
      || !Array.isArray(graph.evidence_records)
      || !Array.isArray(graph.evidence_chains)
      || !Array.isArray(graph.terminal_evidence_slots)
      || !Array.isArray(graph.identity_binding_evidence_slots)) {
    return fail('EVIDENCE_GRAPH_INVALID');
  }
  const evidenceIds = graph.evidence_records.map(({ evidence_id: id }) => id);
  if (evidenceIds.some((id) => !exactText(id))
      || new Set(evidenceIds).size !== evidenceIds.length) {
    return fail('EVIDENCE_GRAPH_EVIDENCE_INVALID');
  }
  const produced = new Set();
  const chainIds = new Set();
  for (const chain of graph.evidence_chains) {
    if (!plain(chain) || !exactText(chain.chain_id)
        || chainIds.has(chain.chain_id)
        || !exactText(chain.independence_class)
        || !Array.isArray(chain.leaf_evidence_refs)
        || !Array.isArray(chain.inference_nodes)
        || !exactText(chain.terminal_conclusion)) {
      return fail('EVIDENCE_GRAPH_CHAIN_INVALID');
    }
    chainIds.add(chain.chain_id);
    const chainProduced = new Set();
    for (const node of chain.inference_nodes) {
      if (!plain(node) || !exactText(node.node_ref)
          || chainProduced.has(node.node_ref) || !OPERATORS.has(node.operator)
          || !Array.isArray(node.input_refs) || node.input_refs.length === 0
          || node.input_refs.some((ref) => !exactText(ref))
          || new Set(node.input_refs).size !== node.input_refs.length
          || node.operator === 'min_count'
            && (!Number.isInteger(node.min_count) || node.min_count < 1
              || node.min_count > node.input_refs.length)
          || node.operator === 'all_of' && node.min_count != null) {
        return fail('EVIDENCE_GRAPH_INFERENCE_INVALID');
      }
      chainProduced.add(node.node_ref);
      produced.add(node.node_ref);
    }
    if (!chainProduced.has(terminalNodeRef(chain, chainProduced))) {
      return fail('EVIDENCE_GRAPH_TERMINAL_INVALID', {
        chain_id: chain.chain_id
      });
    }
  }
  const known = admittedInputRefs(graph, produced);
  for (const chain of graph.evidence_chains) {
    for (const node of chain.inference_nodes) {
      if (node.input_refs.some((ref) => !known.has(ref))) {
        return fail('EVIDENCE_GRAPH_DEPENDENCY_UNKNOWN', {
          node_ref: node.node_ref
        });
      }
    }
  }
  return { ok: true };
}

function terminalNodeRef(chain, produced = null) {
  const direct = chain.terminal_conclusion;
  const qualified = `conclusion:${direct}`;
  if (produced?.has(direct)
      || chain.inference_nodes.some(({ node_ref: ref }) => ref === direct)) {
    return direct;
  }
  return qualified;
}

function admittedInputRefs(graph, produced = null) {
  const refs = new Set(graph.evidence_records.map(({ evidence_id }) =>
    evidence_id));
  for (const slot of graph.identity_binding_evidence_slots) {
    const id = slot.binding_slot_id ?? slot.slot_id;
    if (exactText(id)) refs.add(`binding_slot:${id}`);
  }
  for (const slot of graph.terminal_evidence_slots) {
    const id = slot.terminal_slot_id ?? slot.slot_id;
    if (exactText(id)) refs.add(`terminal_slot:${id}`);
  }
  for (const ref of produced ?? graph.evidence_chains.flatMap((chain) =>
    chain.inference_nodes.map(({ node_ref }) => node_ref))) refs.add(ref);
  return refs;
}

function applyApprovedCombinations(graph, supportedChains, supported,
  conclusions) {
  const policy = graph.principal_inference_policy;
  if (policy == null) return { ok: true, ids: [] };
  const cross = policy.cross_chain_inference;
  if (!plain(policy) || !exactText(policy.conclusion)
      || !Number.isInteger(policy.minimum_independent_chain_count)
      || policy.minimum_independent_chain_count < 1
      || cross?.operator !== 'approved_combinations'
      || !Array.isArray(cross.input_chain_terminal_refs)
      || !Array.isArray(cross.approved_combinations)) {
    return { ok: false, code: 'EVIDENCE_GRAPH_CROSS_CHAIN_INVALID' };
  }
  const byId = new Map(supportedChains.map((chain) =>
    [chain.chain_id, chain]));
  const ids = [];
  for (const combination of cross.approved_combinations) {
    if (!plain(combination) || !exactText(combination.combination_id)
        || !Array.isArray(combination.chain_refs)
        || combination.chain_refs.length < policy.minimum_independent_chain_count
        || combination.chain_refs.some((ref) => !exactText(ref))
        || !exactText(combination.outcome_ref)) {
      return { ok: false, code: 'EVIDENCE_GRAPH_COMBINATION_INVALID' };
    }
    const chains = combination.chain_refs.map((ref) => byId.get(ref));
    if (chains.some((chain) => chain == null)) continue;
    if (cross.requires_distinct_independence_classes === true
        && new Set(chains.map(({ independence_class }) => independence_class))
          .size !== chains.length) continue;
    if (combination.requires_disjoint_leaf_evidence === true
        && !disjointCommittedLeaves(chains, supported)) continue;
    conclusions.add(combination.outcome_ref);
    supported.add(combination.outcome_ref);
    ids.push(combination.combination_id);
  }
  return { ok: true, ids };
}

function disjointCommittedLeaves(chains, supported) {
  const seen = new Set();
  for (const chain of chains) {
    for (const ref of chain.leaf_evidence_refs.filter((id) =>
      supported.has(id))) {
      if (seen.has(ref)) return false;
      seen.add(ref);
    }
  }
  return true;
}

function compare(left, right) {
  return left.localeCompare(right, 'en');
}
function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    ? value : '';
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
