import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function compareRefs(left, right) {
  return `${left.entity_kind}\u0000${left.entity_id}`.localeCompare(
    `${right.entity_kind}\u0000${right.entity_id}`
  );
}

export function fail() { throw phase2IntegrityError(); }
