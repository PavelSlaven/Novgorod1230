import { calculatePackingSlots } from '@rus/world-catalog-workflow';
import { concern } from '../shared/utils.js';

const CAPACITY_POLICY = Object.freeze({ version: 1, mode: 'packing_slots', unit: 'packing_slot' });

export function evaluateStage16ContainerPacking(draft, input) {
  const concerns = [];
  const itemCandidates = new Map((input?.item_profile_candidate_set?.item_profile_candidates ?? []).map((candidate) => [candidate.item_profile_candidate_id ?? candidate.candidate_id ?? candidate.id, candidate]));
  const containerCandidates = new Map((input?.item_profile_candidate_set?.container_profile_candidates ?? []).map((candidate) => [candidate.container_profile_candidate_id ?? candidate.candidate_id ?? candidate.id, candidate]));
  const items = Array.isArray(draft?.item_instances) ? draft.item_instances : [];
  const containers = Array.isArray(draft?.container_instances) ? draft.container_instances : [];
  const containerById = new Map(containers.map((container) => [container?.container_instance_id, container]));
  const traces = [];

  for (const container of containers) {
    const candidate = containerCandidates.get(container?.container_profile_candidate_id);
    const containerId = container?.container_instance_id ?? null;
    if (!candidate || !isPositiveInteger(candidate.capacity) || !isPositiveInteger(candidate.packing_slot_cost) || !hasExactCapacityPolicy(candidate.capacity_policy)) {
      concerns.push(concern('CONTAINER_PACKING_METADATA_INVALID', 'Selected container must provide exact packing_slots v1 capacity metadata.', { container_instance_id: containerId, container_template_id: candidate?.container_template_id ?? null }));
      continue;
    }
    const line_breakdown = [];
    for (const item of items.filter((value) => value?.placement?.container_instance_id === containerId)) {
      const itemCandidate = itemCandidates.get(item?.item_profile_candidate_id);
      const calculation = calculatePackingSlots({
        quantity: item?.quantity,
        packing_slot_cost: itemCandidate?.packing_slot_cost,
        packing_bundle_size: itemCandidate?.packing_bundle_size
      });
      if (!itemCandidate?.item_template_id || !calculation.pass) {
        concerns.push(concern('ITEM_PACKING_METADATA_INVALID', 'A selected item inside a container requires an approved size-band packing binding.', { item_instance_id: item?.item_instance_id ?? null, item_template_id: itemCandidate?.item_template_id ?? null }));
        continue;
      }
      line_breakdown.push(Object.freeze({ item_template_id: itemCandidate.item_template_id, quantity: item.quantity, packing_slot_cost: itemCandidate.packing_slot_cost, packing_bundle_size: itemCandidate.packing_bundle_size, required_slots: calculation.required_slots }));
    }
    for (const nested of containers.filter((value) => value?.placement?.container_instance_id === containerId)) {
      const nestedCandidate = containerCandidates.get(nested?.container_profile_candidate_id);
      if (!nestedCandidate?.container_template_id || !isPositiveInteger(nestedCandidate.packing_slot_cost) || !hasExactCapacityPolicy(nestedCandidate.capacity_policy)) {
        concerns.push(concern('CONTAINER_PACKING_METADATA_INVALID', 'A nested container requires exact packing_slots v1 metadata.', { container_instance_id: nested?.container_instance_id ?? null, container_template_id: nestedCandidate?.container_template_id ?? null }));
        continue;
      }
      line_breakdown.push(Object.freeze({ item_template_id: nestedCandidate.container_template_id, quantity: 1, packing_slot_cost: nestedCandidate.packing_slot_cost, packing_bundle_size: 1, required_slots: nestedCandidate.packing_slot_cost, nested_container: true }));
    }
    const usedSlots = line_breakdown.reduce((sum, line) => sum + line.required_slots, 0);
    const trace = Object.freeze({ capacity_policy_version: CAPACITY_POLICY.version, container_template_id: candidate.container_template_id, capacity: candidate.capacity, used_slots: usedSlots, remaining_slots: candidate.capacity - usedSlots, line_breakdown: Object.freeze(line_breakdown) });
    traces.push(trace);
    if (usedSlots > candidate.capacity) concerns.push(concern('CONTAINER_CAPACITY_EXCEEDED', 'Selected container content exceeds its packing-slot capacity.', { container_template_id: candidate.container_template_id, capacity: candidate.capacity, required_slots: usedSlots, line_breakdown: trace.line_breakdown }));
  }
  return Object.freeze({ concerns: Object.freeze(concerns), traces: Object.freeze(traces) });
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function hasExactCapacityPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === 'mode' && keys[1] === 'unit' && keys[2] === 'version'
    && value.version === CAPACITY_POLICY.version && value.mode === CAPACITY_POLICY.mode && value.unit === CAPACITY_POLICY.unit;
}
