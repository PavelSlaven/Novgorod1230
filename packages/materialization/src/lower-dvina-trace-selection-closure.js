import { canonicalDigest, MaterializationError } from './core.js';

const REQUIRED_SELECTION_KINDS = Object.freeze([
  'participants',
  'locations',
  'items',
  'containers',
  'clue_placements',
  'evidence',
  'knowledge',
  'lies_and_statements',
  'memories',
  'activities',
  'checks',
  'consequences',
  'npc_decisions',
  'npc_schedules',
  'movement',
  'body',
  'environment',
  'promise',
  'completion',
  'epilogue',
  'audience'
]);

export function assertLowerDvinaTraceSelectionClosure(groups, inventory) {
  const specifications = inventory?.required_groups;
  const sourceDigests = inventory?.source_artifact_digests;
  if (inventory?.schema !== 'rus.lower_dvina_trace_sealed_selection_inventory.v1'
    || inventory?.inventory_id !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v3'
    || inventory?.status !== 'approved'
    || inventory?.record_proof_contract !== 'canonical_sha256_sorted_record_id_and_record_digest_v1'
    || !sourceDigests
    || !hasExactKinds(specifications)
    || !hasExactKinds(groups)
    || specifications.some((value) => !/^[a-f0-9]{64}$/.test(sourceDigests[value.source_artifact_key] ?? ''))) {
    fail('The approved sealed-selection inventory or materialized group inventory is incomplete.');
  }

  const specificationByKind = new Map(specifications.map((value) => [value.selection_kind, value]));
  for (const group of groups) {
    const specification = specificationByKind.get(group.selection_kind);
    const records = Array.isArray(group.records) ? group.records : [];
    const allowedRecordDigests = specification.allowed_records_digests
      ?? [specification.required_records_digest];
    const recordProofs = records.map((record) => ({
      record_id: sealedRecordId(record),
      record_digest: record?.record_digest
    })).sort((left, right) => left.record_id.localeCompare(right.record_id));
    if (!group.source_pin
      || group.source_pin.key !== specification.source_artifact_key
      || group.source_pin.digest !== sourceDigests[specification.source_artifact_key]
      || !Number.isInteger(specification.required_record_count)
      || specification.required_record_count < 1
      || !Array.isArray(allowedRecordDigests)
      || allowedRecordDigests.length < 1
      || new Set(allowedRecordDigests).size !== allowedRecordDigests.length
      || allowedRecordDigests.some((digest) => !/^[a-f0-9]{64}$/.test(digest ?? ''))
      || records.length !== specification.required_record_count
      || recordProofs.some((record) => !record.record_id || !/^[a-f0-9]{64}$/.test(record.record_digest ?? ''))
      || new Set(recordProofs.map((record) => record.record_id)).size !== recordProofs.length
      || !allowedRecordDigests.includes(canonicalDigest(recordProofs))) {
      fail(`Sealed selection ${group.selection_kind} does not match its exact approved record inventory.`);
    }
  }
}

function hasExactKinds(values) {
  if (!Array.isArray(values) || values.length !== REQUIRED_SELECTION_KINDS.length) return false;
  const kinds = values.map((value) => value?.selection_kind);
  return new Set(kinds).size === kinds.length
    && REQUIRED_SELECTION_KINDS.every((kind) => kinds.includes(kind));
}

function sealedRecordId(value) {
  return typeof value?.selected_id === 'string' ? value.selected_id : '';
}

function fail(message) {
  throw new MaterializationError('LATE_SELECTIONS_INCOMPLETE', message);
}
