const MATCH_KINDS = Object.freeze([
  ['graph_node_id', 4],
  ['building_template_id', 3],
  ['place_template_id', 2],
  ['node_type', 1]
]);

export function resolveG4MaterializationBinding({ graph_node: graphNode, bindings = [] } = {}) {
  if (!graphNode?.id) return freeze({ status: 'missing_graph_node', binding: null, binding_ids: [] });
  const matches = bindings
    .filter((binding) => binding?.status === 'approved')
    .flatMap((binding) => {
      const matched = MATCH_KINDS.find(([field]) => binding[field] != null && binding[field] === graphNode[field === 'graph_node_id' ? 'id' : field]);
      return matched ? [{ binding, match_kind: matched[0], specificity: matched[1], priority: integer(binding.priority) }] : [];
    })
    .sort((left, right) => right.specificity - left.specificity || right.priority - left.priority || String(left.binding.id).localeCompare(String(right.binding.id)));

  if (matches.length === 0) return freeze({ status: 'missing', binding: null, binding_ids: [] });
  const best = matches[0];
  const winners = matches.filter((match) => match.specificity === best.specificity && match.priority === best.priority);
  if (winners.length > 1) {
    return freeze({
      status: 'ambiguous',
      binding: null,
      match_kind: best.match_kind,
      priority: best.priority,
      binding_ids: winners.map((match) => match.binding.id).sort()
    });
  }
  return freeze({
    status: 'resolved',
    binding: structuredClone(best.binding),
    match_kind: best.match_kind,
    priority: best.priority,
    binding_ids: [best.binding.id]
  });
}

function integer(value) { return Number.isInteger(Number(value)) ? Number(value) : 0; }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
