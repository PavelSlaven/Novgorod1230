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
const PHASE_3_REQUIRED_SELECTION_KINDS = Object.freeze([
  ...REQUIRED_SELECTION_KINDS,
  'interaction_persistence_mappings',
  'speaker_memory_templates',
  'player_journal_templates'
]);

export function assertLowerDvinaTraceSelectionClosure(groups, inventory) {
  const specifications = inventory?.required_groups;
  const sourceDigests = inventory?.source_artifact_digests;
  const requiredKinds = inventory?.inventory_id ===
    'lower_dvina_trace_phase_1a_sealed_selection_inventory_v4'
    || inventory?.inventory_id ===
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v5'
    || inventory?.inventory_id ===
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v6'
    || inventory?.inventory_id ===
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v7'
    || inventory?.inventory_id ===
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
    || inventory?.inventory_id ===
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v10'
    ? PHASE_3_REQUIRED_SELECTION_KINDS
    : REQUIRED_SELECTION_KINDS;
  if (inventory?.schema !== 'rus.lower_dvina_trace_sealed_selection_inventory.v1'
    || ![
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v3',
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v4',
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v5',
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v6',
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v7',
      'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
      ,'lower_dvina_trace_phase_1a_sealed_selection_inventory_v10'
    ].includes(inventory?.inventory_id)
    || inventory?.status !== 'approved'
    || inventory?.record_proof_contract !== 'canonical_sha256_sorted_record_id_and_record_digest_v1'
    || !sourceDigests
    || !hasExactKinds(specifications, requiredKinds)
    || !hasExactKinds(groups, requiredKinds)
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
      fail(
        `Sealed selection ${group.selection_kind} does not match its exact approved record inventory.`,
        {
          selection_kind: group.selection_kind,
          actual_record_count: records.length,
          actual_records_digest: canonicalDigest(recordProofs)
        }
      );
    }
  }
}

function hasExactKinds(values, requiredKinds) {
  if (!Array.isArray(values) || values.length !== requiredKinds.length) return false;
  const kinds = values.map((value) => value?.selection_kind);
  return new Set(kinds).size === kinds.length
    && requiredKinds.every((kind) => kinds.includes(kind));
}

function sealedRecordId(value) {
  return typeof value?.selected_id === 'string' ? value.selected_id : '';
}

function fail(message, details = {}) {
  throw new MaterializationError(
    'LATE_SELECTIONS_INCOMPLETE', message, details
  );
}
