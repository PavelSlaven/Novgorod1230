import { readFileSync } from 'node:fs';

// Read directly, like the pass-target labels (LW-075): no runtime digest gate. "The file is the
// approved content" is checked by candidate.test.mjs against the attestation and the derivation.
const candidate = JSON.parse(readFileSync(new URL('./candidate.json', import.meta.url)));

/** Approved connection labels keyed by binding id (every version of a binding shares its label). */
export function loadApprovedConnectionLabels() {
  return new Map(candidate.labels.map((row) => [row.binding_ref.id, row]));
}
