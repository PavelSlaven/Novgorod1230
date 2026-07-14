import { sha256 } from '@rus/kernel';

export function computeCanonicalDigest(value) {
  return `sha256:${sha256(value)}`;
}

const MATERIALIZATION_RESULT_FIELDS = Object.freeze([
  'version', 'schema', 'status', 'party_id', 'run_id', 'g4_id', 'instances', 'g5_graph',
  'npcs', 'items', 'containers', 'relations', 'ownership', 'schedules',
  'player_start_position', 'validation_report'
]);

export function computeMaterializationResultDigest(result) {
  const canonicalResult = Object.fromEntries(MATERIALIZATION_RESULT_FIELDS.map((field) => [field, structuredClone(result?.[field] ?? null)]));
  return sha256(canonicalResult);
}

export const computeVisibleContextPackageDigest = computeCanonicalDigest;
export const computeNarratorStartingProseDigest = computeCanonicalDigest;
export const computeStage25ArtifactDigest = computeCanonicalDigest;
export const computeStage26ScreenDigest = computeCanonicalDigest;
