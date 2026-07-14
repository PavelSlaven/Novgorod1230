import { deepFreeze, sha256 } from '@rus/kernel';

export class ArtifactRegistry {
  #artifacts = new Map();

  put(key, value, metadata = {}) {
    if (this.#artifacts.has(key)) throw new Error(`Artifact already exists: ${key}`);
    const artifact = deepFreeze(structuredClone(value));
    const record = deepFreeze({ key, value: artifact, digest: sha256(artifact), metadata: structuredClone(metadata) });
    this.#artifacts.set(key, record);
    return record;
  }

  get(key) { return this.#artifacts.get(key) ?? null; }
  require(key) { const record = this.get(key); if (!record) throw new Error(`Missing artifact: ${key}`); return record; }
  has(key) { return this.#artifacts.has(key); }
  snapshot() { return Object.freeze(Object.fromEntries(this.#artifacts)); }
}
