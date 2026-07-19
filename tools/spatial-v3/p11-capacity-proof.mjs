// Finite, deterministic max-flow proof for P11 expansion authoring.
// Slots are demand nodes; template limits are capacity nodes.  The returned
// flow is a proof artifact, never a materialization decision.
export function proveExpansionCapacity({ slots, limits, allowed }) {
  const sortedSlots = [...slots].sort((left, right) => left.id.localeCompare(right.id));
  const sortedLimits = [...limits].sort((left, right) => left.template.localeCompare(right.template));
  const limitByTemplate = new Map();
  for (const limit of sortedLimits) {
    if (!Number.isSafeInteger(limit.maxCount) || limit.maxCount <= 0 || limitByTemplate.has(limit.template)) {
      return { ok: false, code: 'generated_schema_mismatch', reason: 'invalid_template_limit' };
    }
    limitByTemplate.set(limit.template, limit.maxCount);
  }
  const demandBySlot = new Map();
  for (const slot of sortedSlots) {
    if (!Number.isSafeInteger(slot.maxInstances) || slot.maxInstances <= 0 || demandBySlot.has(slot.id)) {
      return { ok: false, code: 'generated_schema_mismatch', reason: 'invalid_slot_demand' };
    }
    demandBySlot.set(slot.id, slot.maxInstances);
  }
  const candidates = new Map();
  for (const slot of sortedSlots) {
    const values = [...new Set(allowed.get(slot.id) ?? [])].sort();
    if (values.length === 0) return { ok: false, code: 'controlled_vocabulary_gap', slotId: slot.id };
    if (values.some((template) => !limitByTemplate.has(template))) {
      return { ok: false, code: 'generated_schema_mismatch', slotId: slot.id, reason: 'candidate_without_limit' };
    }
    candidates.set(slot.id, values);
  }

  const source = '__source__'; const sink = '__sink__';
  const graph = new Map();
  const addEdge = (from, to, capacity) => {
    if (!graph.has(from)) graph.set(from, []); if (!graph.has(to)) graph.set(to, []);
    const forward = { to, capacity, initial: capacity, reverse: graph.get(to).length };
    const reverse = { to: from, capacity: 0, initial: 0, reverse: graph.get(from).length };
    graph.get(from).push(forward); graph.get(to).push(reverse);
  };
  for (const slot of sortedSlots) {
    addEdge(source, `slot:${slot.id}`, slot.maxInstances);
    for (const template of candidates.get(slot.id)) addEdge(`slot:${slot.id}`, `template:${template}`, slot.maxInstances);
  }
  for (const limit of sortedLimits) addEdge(`template:${limit.template}`, sink, limit.maxCount);
  let flow = 0;
  while (true) {
    const level = new Map([[source, 0]]); const queue = [source];
    for (let index = 0; index < queue.length; index += 1) for (const edge of graph.get(queue[index]) ?? []) {
      if (edge.capacity > 0 && !level.has(edge.to)) { level.set(edge.to, level.get(queue[index]) + 1); queue.push(edge.to); }
    }
    if (!level.has(sink)) break;
    const cursor = new Map();
    const send = (node, available) => {
      if (node === sink) return available;
      const edges = graph.get(node) ?? [];
      for (let index = cursor.get(node) ?? 0; index < edges.length; index += 1) {
        cursor.set(node, index); const edge = edges[index];
        if (edge.capacity <= 0 || level.get(edge.to) !== level.get(node) + 1) continue;
        const pushed = send(edge.to, Math.min(available, edge.capacity));
        if (pushed > 0) { edge.capacity -= pushed; graph.get(edge.to)[edge.reverse].capacity += pushed; return pushed; }
      }
      return 0;
    };
    for (let pushed = send(source, Number.MAX_SAFE_INTEGER); pushed > 0; pushed = send(source, Number.MAX_SAFE_INTEGER)) flow += pushed;
  }
  const requiredCapacity = [...demandBySlot.values()].reduce((total, value) => total + value, 0);
  const assignments = {};
  for (const slot of sortedSlots) for (const edge of graph.get(`slot:${slot.id}`) ?? []) {
    if (!edge.to.startsWith('template:')) continue;
    const used = edge.initial - edge.capacity;
    if (used > 0) assignments[`${slot.id}:${edge.to.slice('template:'.length)}`] = used;
  }
  if (flow !== requiredCapacity) return { ok: false, code: 'generated_schema_mismatch', requiredCapacity, committedCapacity: flow, assignments };
  return { ok: true, requiredCapacity, committedCapacity: flow, assignments };
}
