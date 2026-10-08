import { freeze } from './spatial-v3-validation.js';

const key = (id, version) => `${id}@${version}`;
const refKey = (ref) => key(ref?.entity_id, ref?.authoring_version);

/** Capacity is derived from normalized instances and leases, never a counter. */
export function deriveSpatialV3ExpansionCapacity({ closure, snapshot, now } = {}) {
  if (!closure?.slots?.length || !closure?.template_limits?.length
    || !Array.isArray(closure.slot_templates) || !Number.isFinite(now)
    || !Array.isArray(snapshot?.sites) || !Array.isArray(snapshot?.reservations)) {
    throw new TypeError('Exact expansion closure, normalized snapshot and lease clock are required.');
  }
  const slots = new Map(closure.slots.map((row) => [key(row.id, row.version), Number(row.max_instances)]));
  const templates = new Map(closure.template_limits.map((row) =>
    [key(row.template_id, row.template_version), Number(row.max_count)]));
  if (slots.size !== closure.slots.length || templates.size !== closure.template_limits.length
    || [...slots.values(), ...templates.values()].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('Expansion limits must be unique non-negative integers.');
  }
  const relations = closure.slot_templates.map((row) => ({
    slot: key(row.slot_id, row.slot_version), template: key(row.template_id, row.template_version)
  }));
  if (relations.some((row) => !slots.has(row.slot) || !templates.has(row.template))) {
    throw new TypeError('Expansion relation is outside the exact slot/template limits.');
  }
  const subtract = (slot, template, slotCapacity, templateCapacity) => {
    if (!relations.some((row) => row.slot === slot && row.template === template)) {
      throw new TypeError('Committed expansion instance is outside the pinned profile.');
    }
    slotCapacity.set(slot, slotCapacity.get(slot) - 1);
    templateCapacity.set(template, templateCapacity.get(template) - 1);
    if (slotCapacity.get(slot) < 0 || templateCapacity.get(template) < 0) {
      throw new TypeError('Committed expansion usage exceeds its approved capacity.');
    }
  };
  for (const site of snapshot.sites.filter((row) => row.origin === 'generated')) {
    subtract(refKey(site.expansion_slot_ref), refKey(site.generated_template_ref), slots, templates);
  }
  const reservableSlots = new Map(slots);
  const reservableTemplates = new Map(templates);
  for (const reservation of snapshot.reservations) {
    if (reservation.status !== 'reserved') continue;
    const expires = Date.parse(reservation.expires_at);
    if (!Number.isFinite(expires)) throw new TypeError('Expansion reservation has no valid lease expiry.');
    if (expires <= now) continue;
    subtract(refKey(reservation.slot_ref), refKey(reservation.selected_template_ref), reservableSlots, reservableTemplates);
  }
  const committed = maximumAssignable(slots, templates, relations);
  const reservable = maximumAssignable(reservableSlots, reservableTemplates, relations);
  return freeze({ committed_residual_capacity: committed, reservable_residual_capacity: reservable,
    available_candidates: closure.slot_templates.filter((row) => {
      const slot = key(row.slot_id, row.slot_version);
      const template = key(row.template_id, row.template_version);
      if (reservableSlots.get(slot) < 1 || reservableTemplates.get(template) < 1) return false;
      const remainingSlots = new Map(reservableSlots);
      const remainingTemplates = new Map(reservableTemplates);
      subtract(slot, template, remainingSlots, remainingTemplates);
      return maximumAssignable(remainingSlots, remainingTemplates, relations) === reservable - 1;
    }) });
}

function maximumAssignable(slots, templates, relations) {
  const residual = new Map();
  const link = (from, to, capacity) => {
    if (!residual.has(from)) residual.set(from, new Map());
    if (!residual.has(to)) residual.set(to, new Map());
    residual.get(from).set(to, capacity);
    residual.get(to).set(from, 0);
  };
  for (const [slot, capacity] of [...slots].sort()) link('source', `slot:${slot}`, capacity);
  for (const [template, capacity] of [...templates].sort()) link(`template:${template}`, 'sink', capacity);
  for (const row of [...relations].sort((a, b) => `${a.slot}:${a.template}`.localeCompare(`${b.slot}:${b.template}`))) {
    link(`slot:${row.slot}`, `template:${row.template}`, slots.get(row.slot));
  }
  let total = 0;
  for (;;) {
    const previous = new Map([['source', null]]);
    const queue = ['source'];
    for (let offset = 0; offset < queue.length && !previous.has('sink'); offset += 1) {
      for (const [next, capacity] of residual.get(queue[offset]) ?? []) {
        if (capacity <= 0 || previous.has(next)) continue;
        previous.set(next, queue[offset]); queue.push(next);
      }
    }
    if (!previous.has('sink')) return total;
    let amount = Infinity;
    for (let node = 'sink'; previous.get(node) != null; node = previous.get(node)) {
      amount = Math.min(amount, residual.get(previous.get(node)).get(node));
    }
    for (let node = 'sink'; previous.get(node) != null; node = previous.get(node)) {
      const before = previous.get(node);
      residual.get(before).set(node, residual.get(before).get(node) - amount);
      residual.get(node).set(before, residual.get(node).get(before) + amount);
    }
    total += amount;
  }
}
