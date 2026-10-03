import { createRandomSource, deriveSeed, RNG_VERSION } from './core.js';

const VERSION = 'place_people_first_arrival_v1';
const PEOPLE_SUBJECT_KINDS = new Set(['occupation', 'social_role']);

function weighted(entries, draw) {
  let remaining = draw % entries.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of entries) { if (remaining < entry.weight) return entry; remaining -= entry.weight; }
  throw new Error('PLACE_PEOPLE_WEIGHT_INVALID');
}

/**
 * Who is wanted at a canonical place on first arrival (D49), before any profile is looked up: the D-2 composition
 * groups (rolled here, they are not presence rules) and the outcomes the R-2a engine already stored in the presence
 * aggregate for occupation/social_role rules (§3A.1; read here, never rolled again). A subject the composition names
 * is not taken from a rule. Pure and deterministic by party, place and group.
 * `compositions`: [{ composition_ref: {id, version, world_revision_id}, population_groups }].
 * `rule_outcomes`: [{ rule_id, rule_version, scope_ref, subject_kind, subject_ref, count }].
 */
export function wantPlacePeople({ party_id: partyId, scope_instance_ref: scopeRef, compositions = [], rule_outcomes: outcomes = [] } = {}) {
  const wanted = [];
  const trace = { version: VERSION, groups: [], rules: [] };
  const owned = new Set();
  const groups = compositions.flatMap((composition) => (composition.population_groups ?? [])
    .map((group) => ({ group, composition_ref: composition.composition_ref })))
    .sort((a, b) => a.group.group_id.localeCompare(b.group.group_id));
  for (const { group, composition_ref: compositionRef } of groups) {
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
      wanted.push({ origin: 'composition', group_id: group.group_id, subject_kind: subject.subject_kind,
        subject_ref: subject.subject_ref, profile_id: subject.profile_ref ?? null, place_family_id: compositionRef.id,
        place_population_composition_ref: { id: compositionRef.id, version: compositionRef.version,
          world_revision_id: compositionRef.world_revision_id } });
    }
  }
  const byRule = [...outcomes].filter((outcome) => PEOPLE_SUBJECT_KINDS.has(outcome.subject_kind)
    && !owned.has(`${outcome.subject_kind}:${outcome.subject_ref}`))
    .sort((a, b) => `${a.subject_kind}:${a.subject_ref}:${a.rule_id}`.localeCompare(`${b.subject_kind}:${b.subject_ref}:${b.rule_id}`));
  for (const outcome of byRule) {
    trace.rules.push({ rule_ref: `${outcome.rule_id}@${outcome.rule_version}`, count: outcome.count });
    for (let i = 0; i < outcome.count; i += 1) {
      wanted.push({ origin: 'presence_rule', group_id: null, subject_kind: outcome.subject_kind,
        subject_ref: outcome.subject_ref, profile_id: null, place_family_id: outcome.scope_ref,
        presence_rule_ref: { rule_id: outcome.rule_id, rule_version: outcome.rule_version } });
    }
  }
  return { wanted, trace };
}

/**
 * Bind wanted subjects to approved profiles. A subject with no single approved profile (`profile_id` or the one
 * `npc_binding` with the same role/occupation; of several versions of one id the newest approved one), with a role or
 * occupation missing from the actor bundle, or beyond `capacity`, creates nobody and is reported as a gap.
 */
export function resolvePlacePeople({ wanted = [], candidates = [], bundle, capacity = 0 } = {}) {
  const newest = new Map();
  for (const row of candidates) if (!newest.has(row.id) || newest.get(row.id).version < row.version) newest.set(row.id, row);
  const people = [];
  const gaps = [];
  for (const want of wanted) {
    const { profile_id: exactId, ...subject } = want;
    const matches = [...newest.values()].filter((row) => (exactId != null ? row.id === exactId
      : (subject.subject_kind === 'social_role' ? row.role_ref : row.occupation_ref) === subject.subject_ref));
    const gap = (code) => gaps.push({ code, group_key: subject.group_id ?? `${subject.presence_rule_ref?.rule_id}@${subject.presence_rule_ref?.rule_version}`,
      subject_kind: subject.subject_kind, subject_ref: subject.subject_ref });
    if (matches.length === 0) { gap('people_profile_missing'); continue; }
    if (matches.length > 1) { gap('people_profile_ambiguous'); continue; }
    const [profile] = matches;
    if (!(bundle?.roles ?? []).some((role) => role.role_id === profile.role_ref)
      || !(bundle?.occupations ?? []).some((row) => row.occupation_id === profile.occupation_ref)) {
      gap('people_actor_bundle_missing'); continue;
    }
    if (people.length >= capacity) { gap('people_position_capacity'); continue; }
    people.push({ ordinal: people.length, ...subject, profile_ref: { id: profile.id, version: profile.version },
      candidate_refs: [...newest.values()].filter((row) => row.id === profile.id || (exactId == null
        && (subject.subject_kind === 'social_role' ? row.role_ref : row.occupation_ref) === subject.subject_ref))
        .map(({ id, version }) => ({ id, version })) });
  }
  return { people, gaps };
}

/** wantPlacePeople + resolvePlacePeople in one call. */
export function decidePlacePeople({ party_id, scope_instance_ref, compositions, rule_outcomes, candidates, bundle, capacity } = {}) {
  const { wanted, trace } = wantPlacePeople({ party_id, scope_instance_ref, compositions, rule_outcomes });
  const { people, gaps } = resolvePlacePeople({ wanted, candidates, bundle, capacity });
  return { people, gaps, trace };
}
