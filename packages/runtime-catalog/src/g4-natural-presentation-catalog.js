import { createHash } from 'node:crypto';
import { G4_NATURAL_LAYERS } from '@rus/materialization';
import { canonicalStringify } from './canonical-records.js';
import { loadApprovedG4NaturalCatalog } from './g4-natural-catalog.js';
import { deepFreeze, fail } from './shared.js';

/** Descriptor membership is verified by the existing activated catalog owner. */
export function loadApprovedG4NaturalPresentationCatalog({ verifiedCatalog, pin } = {}) {
  const natural = loadApprovedG4NaturalCatalog({ verifiedCatalog, pin });
  const records = (verifiedCatalog.records_by_table?.procedural_scene_compiled_records ?? [])
    .filter((row) => row.payload?.schema === 'rus.g4_natural_presentation_profile.v1');
  if (!records.length) invalid('records');
  const seen = new Set();
  const profiles = records.map((row) => {
    const profile = row.payload;
    const ref = profile.natural_profile_ref;
    const matches = natural.profiles.filter(({ payload, payload_digest }) =>
      payload.profile_id === ref?.id && payload.profile_version === ref?.version
      && payload_digest === ref?.payload_digest
      && canonicalStringify(payload.g4_ref) === canonicalStringify(profile.g4_ref));
    if (typeof profile.id !== 'string' || !profile.id.trim()
      || row.record_kind !== 'profile' || row.record_id !== `profile:${profile.id}`
      || !Number.isSafeInteger(profile.version) || profile.version < 1
      || Number(row.version) !== profile.version
      || row.status !== 'approved_authoring_not_runtime_selectable'
      || row.payload_digest !== createHash('sha256').update(canonicalStringify(profile)).digest('hex')
      || matches.length !== 1 || seen.has(ref.id)
      || !Array.isArray(profile.layers) || profile.layers.length !== G4_NATURAL_LAYERS.length
      || G4_NATURAL_LAYERS.some((name) => profile.layers.filter((layer) => layer.layer === name).length !== 1)
      || profile.layers.some((layer) => !validDescriptor(layer))) invalid('profile');
    seen.add(ref.id);
    return { ...structuredClone(profile), status: 'approved' };
  });
  return deepFreeze({ schema: 'rus.verified_g4_natural_presentation_catalog.v1',
    verified: true, pin: structuredClone(pin), profiles });
}

function validDescriptor(layer) {
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  if (layer.channel === 'none') return layer.clear_text == null && layer.partial_text == null;
  return ['visual', 'acoustic'].includes(layer.channel) && text(layer.clear_text)
    && (layer.partial_text == null || text(layer.partial_text))
    && (layer.channel !== 'acoustic' || (Number.isInteger(layer.loudness) && layer.loudness >= 0));
}
function invalid(reason) { fail('G4_NATURAL_PRESENTATION_CATALOG_INVALID',
  'Exact activated natural presentation membership is required.', { reason }); }
