import { createHash } from 'node:crypto';
import { NEEDS_CHECK_BLOCKER } from './needs-check-blocker.js';
import { canonicalStringify } from './canonical-records.js';
import { deepFreeze, fail } from './shared.js';

const SNAPSHOT_SCHEMA = 'rus.needs_check_blockers.v2';
const RECORD_ID = 'profile:needs_check_blockers';
const BINDING_ID = 'profile:needs_check_blockers_binding';

/** True only when this exact verified import carries the blocker requirement binding. */
export function needsCheckBlockerSnapshotRequired({ verifiedCatalog, pin } = {}) {
  assertVerifiedPin(verifiedCatalog, pin);
  const rows = (verifiedCatalog.records_by_table?.procedural_scene_compiled_records ?? [])
    .filter((row) => row.record_id === BINDING_ID);
  if (rows.length === 0) return false;
  if (rows.length !== 1) invalid('duplicate_binding');
  const row = rows[0];
  const payload = row.payload;
  if (row.record_kind !== 'profile' || Number(row.version) !== 1
      || row.status !== 'approved_authoring_not_runtime_selectable'
      || row.payload_digest !== createHash('sha256')
        .update(canonicalStringify(payload)).digest('hex')
      || payload?.schema !== 'rus.needs_check_blocker_binding.v1'
      || payload.required !== true
      || payload.snapshot_record_id !== RECORD_ID
      || payload.snapshot_version !== 2) invalid('binding');
  return true;
}

/** Reads only the exact blocker profile in a verified immutable catalog import. */
export function loadApprovedNeedsCheckBlockerSnapshot({ verifiedCatalog, pin } = {}) {
  assertVerifiedPin(verifiedCatalog, pin);

  const rows = (verifiedCatalog.records_by_table?.procedural_scene_compiled_records ?? [])
    .filter((row) => row.payload?.schema === SNAPSHOT_SCHEMA);
  if (!rows.length) return null;
  if (rows.length !== 1) invalid('duplicate_snapshot');
  const row = rows[0];
  if (row.record_id !== RECORD_ID || row.record_kind !== 'profile'
    || Number(row.version) !== 2 || row.status !== 'approved_authoring_not_runtime_selectable'
    || row.payload_digest !== createHash('sha256')
      .update(canonicalStringify(row.payload)).digest('hex')) invalid('record');
  try {
    NEEDS_CHECK_BLOCKER.validateSnapshot(row.payload);
  } catch {
    invalid('snapshot');
  }
  return deepFreeze(structuredClone(row.payload));
}

function assertVerifiedPin(verifiedCatalog, pin) {
  if (verifiedCatalog?.schema !== 'rus.verified_item_catalog.v2'
    || verifiedCatalog.verified !== true || !pin
    || canonicalStringify(pin) !== canonicalStringify(verifiedCatalog.pin)
    || !pin.compatible_world_revision_id || !pin.compatible_world_catalog_digest) invalid('pin');
}

function invalid(reason) {
  fail('NEEDS_CHECK_BLOCKER_CATALOG_INVALID',
    'Exact immutable needs-check blocker catalog membership is required.', { reason });
}
