import { createRandomSource, deriveSeed, RNG_VERSION } from './core.js';
import {
  derivePresenceRuleSeedContext,
  presenceRuleSubjectKey,
  rollPresenceRulePpm,
  rollUniformPresenceCount,
} from './presence-rules-first-arrival.js';

const VERSION = 'place_people_first_arrival_v1';
const PEOPLE_SUBJECT_KINDS = new Set(['occupation', 'social_role']);

function weighted(entries, draw) {
  let remaining = draw % entries.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of entries) { if (remaining < entry.weight) return entry; remaining -= entry.weight; }
  throw new Error('PLACE_PEOPLE_WEIGHT_INVALID');
}

/**
 * Who stands at a canonical place on first arrival: D-2 composition groups plus the approved presence rules
 * for occupations and roles. Pure and deterministic by party, place and group/rule. A subject that has no
 * single approved profile, or whose role or occupation is not in the actor bundle, creates nobody and is
 * reported as a gap; people beyond `capacity` are reported, never created.
 */
export function decidePlacePeople({ party_id: partyId, scope_instance_ref: scopeRef, composition = null, rules = [],
  period_number: periodNumber = null, candidates = [], bundle, capacity = 0 } = {}) {
  const wanted = [];
  const trace = { version: VERSION, composition_ref: composition?.composition_ref ?? null, groups: [], rules: [] };
  const owned = new Set();
  for (const group of [...(composition?.population_groups ?? [])].sort((a, b) => a.group_id.localeCompare(b.group_id))) {
    for (const subject of group.weighted_subjects ?? []) owned.add(`${subject.subject_kind}:${subject.subject_ref}`);
    const counts = (group.count_weights ?? []).map((weight, index) => ({ count: group.min_count + index, weight }));
    if (!counts.length || !(group.weighted_subjects ?? []).length) continue;
    const seed = deriveSeed({ version: VERSION, rng_version: RNG_VERSION, party_id: partyId,
      scope_instance_ref: scopeRef, group_id: group.group_id });
    const random = createRandomSource({ seed: seed.uint32 });
    const { count } = weighted(counts, random.nextUint32());
    trace.groups.push({ group_id: group.group_id, count });
    for (let i = 0; i < count; i += 1) {
      const subject = weighted(group.weighted_subjects, random.nextUint32());
      wanted.push({ origin: 'composition', group_key: group.group_id, subject_kind: subject.subject_kind,
        subject_ref: subject.subject_ref, profile_id: subject.profile_ref ?? null });
    }
  }
  const peopleRules = rules.filter((rule) => PEOPLE_SUBJECT_KINDS.has(rule.subject_kind)
    && !owned.has(`${rule.subject_kind}:${rule.subject_ref}`))
    .sort((a, b) => presenceRuleSubjectKey(a).localeCompare(presenceRuleSubjectKey(b)));
  for (const rule of peopleRules) {
    const period = rule.refresh_class === 'by_year_season' ? periodNumber : null;
    const seed = deriveSeed(derivePresenceRuleSeedContext({ party_id: partyId, scope_instance_ref: scopeRef,
      subject_kind: rule.subject_kind, subject_ref: rule.subject_ref, period_number: period }));
    const random = createRandomSource({ seed: seed.uint32, version: RNG_VERSION });
    const present = rollPresenceRulePpm(random, rule.presence_probability_ppm);
    const count = present ? rollUniformPresenceCount(random, rule.count_limit) : 0;
    trace.rules.push({ rule_ref: `${rule.rule_id}@${rule.rule_version}`, count });
    for (let i = 0; i < count; i += 1) {
      wanted.push({ origin: 'presence_rule', group_key: `${rule.rule_id}@${rule.rule_version}`,
        subject_kind: rule.subject_kind, subject_ref: rule.subject_ref, profile_id: null });
    }
  }
  const people = [];
  const gaps = [];
  for (const want of wanted) {
    const { profile_id: exactId, ...subject } = want;
    // Approved profiles keep older versions next to the newest one: the newest version of an id is the profile.
    const newest = new Map();
    for (const row of candidates) if (!newest.has(row.id) || newest.get(row.id).version < row.version) newest.set(row.id, row);
    const matches = [...newest.values()].filter((row) => (exactId != null ? row.id === exactId
      : (subject.subject_kind === 'social_role' ? row.role_ref : row.occupation_ref) === subject.subject_ref));
    const gap = (code) => gaps.push({ code, group_key: subject.group_key, subject_kind: subject.subject_kind,
      subject_ref: subject.subject_ref });
    if (matches.length === 0) { gap('people_profile_missing'); continue; }
    if (matches.length > 1) { gap('people_profile_ambiguous'); continue; }
    const [profile] = matches;
    if (!(bundle?.roles ?? []).some((role) => role.role_id === profile.role_ref)
      || !(bundle?.occupations ?? []).some((row) => row.occupation_id === profile.occupation_ref)) {
      gap('people_actor_bundle_missing'); continue;
    }
    if (people.length >= capacity) { gap('people_position_capacity'); continue; }
    people.push({ ordinal: people.length, ...subject, profile_ref: { id: profile.id, version: profile.version } });
  }
  return { people, gaps, trace };
}

