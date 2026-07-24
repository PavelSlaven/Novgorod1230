import { deepFreeze } from '@rus/kernel';
import { findForbiddenVisiblePath, inspectVisiblePackageEnvelope } from './visible-package-security.js';

export class TemporalProposalMergeError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'TemporalProposalMergeError'; this.code = code; this.details = deepFreeze(structuredClone(details)); }
}
const fail = (code, message, details) => { throw new TemporalProposalMergeError(code, message, details); };
const key = (value) => value && typeof value === 'object' ? `${value.entity_kind}:${value.entity_id}` : '';
function assertVisibleEnvelope(value) {
  const inspection = inspectVisiblePackageEnvelope(value);
  if (!inspection.ok) fail(inspection.code, inspection.message, { field: inspection.field });
}

export function mergeTemporalProposals({ proposals, expected_clock_owner_ref, available_event_ids = [] } = {}) {
  if (!Array.isArray(proposals)) fail('temporal_change_set_conflict', 'Temporal proposals must be a finite array.');
  if (!Array.isArray(available_event_ids) || available_event_ids.some((value) => typeof value !== 'string' || !value)) {
    fail('temporal_change_set_conflict', 'Available temporal event identities must be a finite stable-id array.');
  }
  const writes = new Set(), owners = new Set(), transitions = new Map(), moved = new Set(), consumed = new Set(), produced = new Set(available_event_ids);
  for (const proposal of proposals) {
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) fail('temporal_change_set_conflict', 'Temporal proposal must be an object.');
    if (proposal.write_target) { if (writes.has(proposal.write_target)) fail('temporal_change_set_conflict', 'Duplicate temporal write target.', { write_target: proposal.write_target }); writes.add(proposal.write_target); }
    if (proposal.clock_owner_ref) owners.add(key(proposal.clock_owner_ref));
    if (proposal.status_transition) { const subject = key(proposal.status_transition.subject_ref); const prior = transitions.get(subject); if (prior && (prior.from !== proposal.status_transition.from || prior.to !== proposal.status_transition.to)) fail('temporal_change_set_conflict', 'Incompatible status transition.', { subject }); transitions.set(subject, proposal.status_transition); }
    if (proposal.move) { const subject = key(proposal.move.subject_ref); if (!subject || moved.has(subject)) fail('temporal_change_set_conflict', 'A subject cannot move twice in one temporal change set.', { subject }); moved.add(subject); }
    if (proposal.resource_consumption) { const resource = key(proposal.resource_consumption.resource_ref); if (!resource || consumed.has(resource)) fail('temporal_change_set_conflict', 'Conflicting resource consumption.', { resource }); consumed.add(resource); }
    for (const eventId of proposal.produces_events ?? []) produced.add(eventId);
    for (const [field, value] of [
      ['visible_data', proposal.visible_data],
      ['visible_package', proposal.visible_package],
      ['visible_package_candidate', proposal.visible_package_candidate]
    ]) {
      if (value === undefined) continue;
      const hidden = findForbiddenVisiblePath(value, field);
      if (hidden) fail('hidden_information_leak', 'Visible temporal data includes forbidden hidden information.', { path: hidden });
      if (field === 'visible_package_candidate') assertVisibleEnvelope(value);
    }
  }
  if (owners.size > 1 || (expected_clock_owner_ref && owners.size === 1 && !owners.has(key(expected_clock_owner_ref)))) fail('time_owner_conflict', 'Temporal proposals name conflicting clock owners.');
  for (const proposal of proposals) for (const dependency of proposal.event_dependencies ?? []) if (!produced.has(dependency)) fail('temporal_change_set_conflict', 'Temporal event dependency is not produced in the change set.', { dependency });
  return deepFreeze({
    proposals: structuredClone(proposals),
    clock_owner_ref: expected_clock_owner_ref
      ? structuredClone(expected_clock_owner_ref)
      : owners.size
        ? (() => {
          const [entity_kind, entity_id] = [...owners][0].split(':');
          return { entity_kind, entity_id };
        })()
        : null
  });
}
