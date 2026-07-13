import { sha256 } from '@rus/kernel';

export function computeCanonicalDigest(value) {
  return `sha256:${sha256(value)}`;
}

export const computeVisibleContextPackageDigest = computeCanonicalDigest;
export const computeNarratorStartingProseDigest = computeCanonicalDigest;
export const computeStage25ArtifactDigest = computeCanonicalDigest;
export const computeStage26ScreenDigest = computeCanonicalDigest;
