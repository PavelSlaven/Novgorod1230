import { deepFreeze, sha256, stableStringify } from '@rus/kernel';

export const MATERIALIZER_VERSION = 'code_materializer_v2';
export const RNG_VERSION = 'mulberry32_v1';

export class MaterializationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MaterializationError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function canonicalDigest(value) {
  return sha256(stableStringify(value));
}

export function deriveSeed(seedContext) {
  const digest = canonicalDigest(seedContext);
  return Object.freeze({ digest, uint32: Number.parseInt(digest.slice(0, 8), 16) >>> 0 });
}

export function createRandomSource({ seed, version = RNG_VERSION } = {}) {
  if (version !== RNG_VERSION) throw new MaterializationError('RNG_VERSION_UNSUPPORTED', `Unsupported RNG version: ${version}`);
  let state = Number(seed) >>> 0;
  let draws = 0;
  return Object.freeze({
    version,
    nextUint32() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      draws += 1;
      return (value ^ (value >>> 14)) >>> 0;
    },
    nextIndex(length) {
      if (!Number.isInteger(length) || length <= 0) throw new MaterializationError('CANDIDATE_SET_EMPTY', 'Cannot choose from an empty candidate set.');
      return this.nextUint32() % length;
    },
    get drawCount() { return draws; }
  });
}

export function deterministicInstanceId(partyId, runId, domain, slotKey, ordinal) {
  return `${domain}_${sha256(stableStringify([partyId, runId, domain, slotKey, ordinal])).slice(0, 24)}`;
}
