import { readFileSync } from 'node:fs';

// Read directly, without a runtime digest gate; movement-availability-policy.test.js checks the file
// against its attestation and against the condition sets the approved data names. This is not the
// LW-075 label pattern: the file sits beside world_base.spatial_v3_traversal_availability_policies
// (LW-094).
const policy = JSON.parse(readFileSync(new URL(
  '../../../../../data/world-catalogs/novgorod/live-world-runtime-v17/movement-availability-policy.v1.json',
  import.meta.url)));
const listed = new Set(policy.condition_sets.map((row) => row.condition_set_ref));

/** `id@version` of a stored ref (versioned ref object or already a string); null stays null. */
export function conditionSetString(ref) {
  if (ref == null) return null;
  return typeof ref === 'string' ? ref : `${ref.entity_id}@${ref.authoring_version}`;
}

/** Approved availability of one condition set: `open` with the policy's reason, or null when the
 * set is not listed (the caller turns that into a data gap). Light and visibility are not inputs. */
export function evaluateConditionSet(ref) {
  const conditionSetRef = conditionSetString(ref);
  if (conditionSetRef == null || !listed.has(conditionSetRef)) return null;
  return { condition_set_ref: conditionSetRef, status: 'open', reason_code: policy.reason_code };
}
