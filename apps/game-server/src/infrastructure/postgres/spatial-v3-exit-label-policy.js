import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { serverError } from '../../errors.js';
import { loadApprovedExitLineLabels } from '../../../../../data/world-catalogs/novgorod/m2c-exit-line-labels/approved-labels.mjs';
import { withPassTargetDisambiguation } from '../../../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';

export { loadApprovedExitLineLabels };

const legacyCatalogPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url);
const legacyApprovalPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/approval-attestation.json', import.meta.url);
const keyOf = (id, version) => `${id}@${version}`;
export const hasExitOrdinalLabel = (label) =>
  /(?<![\p{L}\p{N}])выход\s+\d+(?![\p{L}\p{N}])/iu.test(label);

/** The previously active exit-label catalog remains the final approved fallback. */
export function loadApprovedLegacyExitLabels() {
  const bytes = readFileSync(legacyCatalogPath);
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(readFileSync(legacyApprovalPath));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
    || approval.candidate_sha256 !== createHash('sha256').update(bytes).digest('hex')
    || !Array.isArray(candidate.labels)) return null;
  const labels = new Map();
  for (const row of candidate.labels) {
    const key = keyOf(row.directional_exit_ref?.id, row.directional_exit_ref?.version);
    if (!row.directional_exit_ref?.id || !Number.isInteger(row.directional_exit_ref?.version)
      || labels.has(key) || typeof row.display_label !== 'string'
      || !row.display_label.trim() || !Number.isInteger(row.editorial_choice_ordinal)) return null;
    labels.set(key, row);
  }
  return labels;
}

/** Select one disclosed label for each already-admitted exit using the F3 precedence. */
export function resolveSpatialV3ExitLabels(rows, { lineLabels = loadApprovedExitLineLabels(),
  legacyLabels = loadApprovedLegacyExitLabels(), placeId = null,
  worldRevisionId = null, g4Id = null } = {}) {
  const targetCounts = new Map();
  for (const row of rows) {
    const description = row.pass_target_description;
    if (typeof description === 'string' && description.trim()) {
      targetCounts.set(description, (targetCounts.get(description) ?? 0) + 1);
    }
  }
  const previousLabels = withPassTargetDisambiguation(rows.map((row) => {
    const legacy = legacyLabels?.get(keyOf(row.directional_exit_id, row.directional_exit_version));
    const isExactLegacy = legacy?.world_revision_id === worldRevisionId
      && legacy.g4_ref?.id === g4Id
      && legacy.directional_exit_ref?.id === row.directional_exit_id
      && legacy.directional_exit_ref?.version === row.directional_exit_version
      && legacy.directional_exit_ref?.canonical_digest === row._exit_canonical_digest
      && legacy.direction_context_ref?.id === row.direction_context_id;
    return { ...row,
      pass_target_description: isExactLegacy ? row.pass_target_description : null,
      display_label: isExactLegacy ? legacy.display_label : null,
      editorial_choice_ordinal: isExactLegacy ? legacy.editorial_choice_ordinal : null };
  }));
  return rows.map((row, index) => {
    const key = keyOf(row.directional_exit_id, row.directional_exit_version);
    const description = row.pass_target_description;
    const exact = (label) => label?.world_revision_id === worldRevisionId
      && label.g4_ref?.id === g4Id
      && label.directional_exit_ref?.id === row.directional_exit_id
      && label.directional_exit_ref?.version === row.directional_exit_version
      && label.directional_exit_ref?.canonical_digest === row._exit_canonical_digest
      && label.direction_context_ref?.id === row.direction_context_id;
    const candidateLine = lineLabels?.get(key);
    const candidateLegacy = legacyLabels?.get(key);
    const line = exact(candidateLine) ? candidateLine : null;
    const legacy = exact(candidateLegacy) ? candidateLegacy : null;
    const previousLabel = previousLabels[index]?.display_label;
    const uniqueTarget = typeof description === 'string' && description.trim()
      && targetCounts.get(description) === 1;
    const previousIsOrdinal = hasExitOrdinalLabel(previousLabel ?? '');
    const displayLabel = uniqueTarget ? description
      : line && (!hasExitOrdinalLabel(line.display_label) || !previousLabel || previousIsOrdinal)
        ? line.display_label : previousLabel ?? legacy?.display_label ?? line?.display_label;
    if (typeof displayLabel !== 'string' || !displayLabel.trim()) {
      throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
        'An approved label is required for this disclosed exit.', { status: 409,
          details: { reason: 'approved_exit_label_required', place_id: placeId,
            directional_exit_id: row.directional_exit_id } });
    }
    const { _exit_canonical_digest, pass_target_description, ...disclosed } = row;
    return { ...disclosed, display_label: displayLabel };
  });
}
