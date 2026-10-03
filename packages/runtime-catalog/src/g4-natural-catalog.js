import { createHash } from 'node:crypto';
import { validateG4NaturalProfile } from '@rus/materialization';
import { canonicalStringify } from './canonical-records.js';
import { deepFreeze, fail } from './shared.js';

/** Uses the existing verified import/activation owner, never authoring files. */
export function loadApprovedG4NaturalCatalog({ verifiedCatalog, pin } = {}) {
  if (verifiedCatalog?.schema !== 'rus.verified_item_catalog.v2' || verifiedCatalog.verified !== true
    || !pin || canonicalStringify(pin) !== canonicalStringify(verifiedCatalog.pin)
    || !pin.compatible_world_revision_id || !pin.compatible_world_catalog_digest) invalid('pin');
  const rows = verifiedCatalog.records_by_table?.procedural_scene_compiled_records ?? [];
  const allProfiles = rows
    .filter((row) => row.payload?.schema === 'rus.g4_natural_baseline_profile.v1');
  const seen = new Set();
  if (!allProfiles.length) invalid('records');
  for (const row of allProfiles) {
    const payload = row.payload;
    validateG4NaturalProfile(payload);
    const key = `${payload.g4_ref.id}@${payload.g4_ref.version}:${payload.profile_version}`;
    if (row.record_kind !== 'profile' || Number(row.version) !== payload.profile_version
      || row.status !== 'approved_authoring_not_runtime_selectable'
      || payload.g4_ref.world_revision_id !== pin.compatible_world_revision_id
      || seen.has(key) || row.payload_digest !== createHash('sha256')
        .update(canonicalStringify(payload)).digest('hex')) invalid('profile');
    seen.add(key);
  }
  const placement = rows.filter((row) => row.payload?.schema === 'rus.g4_natural_placement_catalog.v1');
  const refs = placement.length === 1 ? placement[0].payload.placements.map((row) => row.natural_profile_ref) : null;
  const profiles = refs ? allProfiles.filter((row) => refs.some((ref) =>
    ref.id === row.payload.profile_id && ref.version === row.payload.profile_version
    && ref.payload_digest === row.payload_digest)) : allProfiles;
  return deepFreeze({ schema: 'rus.verified_g4_natural_catalog.v1', verified: true,
    pin: structuredClone(pin), profiles: structuredClone(profiles) });
}
function invalid(reason) { fail('G4_NATURAL_CATALOG_INVALID',
  'Exact activated natural catalog membership is required.', { reason }); }
