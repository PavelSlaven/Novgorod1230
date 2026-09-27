/**
 * Presence rule conflict helpers for primary∪secondary place_family scopes (CR #158 F4).
 * Runtime: primary wins on shared subjects; secondary may only add missing subjects.
 * Import validator rejects secondary subjects already covered by primary and overlapping seasons.
 */

function seasonSet(seasons) {
  if (!Array.isArray(seasons)) return new Set();
  return new Set(seasons.map(String));
}

export function seasonsOverlap(a, b) {
  const left = seasonSet(a);
  const right = seasonSet(b);
  if (left.size === 0 || right.size === 0) return false;
  if (left.has('all') || right.has('all')) return true;
  for (const s of left) if (right.has(s)) return true;
  return false;
}

/** Same subject under same region with overlapping seasons → conflict. */
export function presenceRuleSeasonConflict(a, b) {
  if (!a || !b) return false;
  if (a.scope_kind !== b.scope_kind || a.scope_ref !== b.scope_ref) return false;
  if (String(a.region_id ?? '') !== String(b.region_id ?? '')) return false;
  if (a.subject_kind !== b.subject_kind || a.subject_ref !== b.subject_ref) return false;
  return seasonsOverlap(a.allowed_seasons, b.allowed_seasons);
}

/**
 * Subject overlap is keyed by subject only: the norm compares subjects of the
 * node's primary and secondary place families, not regions.
 * @param {object[]} primaryRules rules for primary place_family
 * @param {object[]} secondaryRules rules for secondary place_family
 * @returns {string[]} failure messages
 */
export function validatePrimarySecondaryPresenceSubjects(primaryRules, secondaryRules) {
  const failures = [];
  const primaryKeys = new Set();
  for (const rule of primaryRules ?? []) {
    primaryKeys.add(`${rule.subject_kind}\0${rule.subject_ref}`);
  }
  for (const rule of secondaryRules ?? []) {
    if (primaryKeys.has(`${rule.subject_kind}\0${rule.subject_ref}`)) {
      failures.push(
        `secondary subject already on primary: ${rule.subject_kind}/${rule.subject_ref}`
      );
    }
  }
  return failures;
}

export function findOverlappingPresenceRules(rules) {
  const failures = [];
  const list = rules ?? [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (presenceRuleSeasonConflict(list[i], list[j])) {
        failures.push(
          `overlapping seasons: ${list[i].rule_id ?? i} vs ${list[j].rule_id ?? j}`
        );
      }
    }
  }
  return failures;
}
