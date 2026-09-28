import { createRandomSource, deriveSeed, RNG_VERSION } from './core.js';
import { applyOrdinaryAggregateTransition } from './ordinary-materialization-foundation.js';
import {
  isPresenceRuleRecord,
  presenceRuleReplayKey,
} from './ordinary-materialization-foundation-internal.js';

export function presenceRuleSubjectKey(rule) {
  return `${rule.subject_kind}:${rule.subject_ref}`;
}

export function pickRegionalPresenceRule(rules, regionId) {
  const approved = rules.filter((row) => row.status === 'approved');
  if (approved.length === 0) return null;
  const regional = regionId
    ? approved.filter((row) => row.region_id === regionId)
    : [];
  if (regional.length === 1) return regional[0];
  if (regional.length > 1) {
    return [...regional].sort((left, right) =>
      `${left.rule_id}@${left.rule_version}`.localeCompare(`${right.rule_id}@${right.rule_version}`))[0];
  }
  const global = approved.filter((row) => row.region_id == null);
  if (global.length === 0) return null;
  return [...global].sort((left, right) =>
    `${left.rule_id}@${left.rule_version}`.localeCompare(`${right.rule_id}@${right.rule_version}`))[0];
}

export function ruleAllowedInSeason(rule, season) {
  const seasons = rule.allowed_seasons ?? [];
  return seasons.length === 0 || seasons.includes(season);
}

export function mergePlaceFamilyPresenceRules({
  primaryRules = [],
  secondaryRules = [],
  regionId = null,
  season,
} = {}) {
  const primaryMap = new Map();
  for (const rule of primaryRules) {
    if (!ruleAllowedInSeason(rule, season)) continue;
    const key = presenceRuleSubjectKey(rule);
    const bucket = primaryMap.get(key) ?? [];
    bucket.push(rule);
    primaryMap.set(key, bucket);
  }
  const merged = [];
  for (const bucket of primaryMap.values()) {
    const winner = pickRegionalPresenceRule(bucket, regionId);
    if (winner) merged.push(winner);
  }
  const primaryKeys = new Set(merged.map(presenceRuleSubjectKey));
  const secondaryMap = new Map();
  for (const rule of secondaryRules) {
    if (!ruleAllowedInSeason(rule, season)) continue;
    const key = presenceRuleSubjectKey(rule);
    if (primaryKeys.has(key)) continue;
    const bucket = secondaryMap.get(key) ?? [];
    bucket.push(rule);
    secondaryMap.set(key, bucket);
  }
  for (const bucket of secondaryMap.values()) {
    const winner = pickRegionalPresenceRule(bucket, regionId);
    if (winner) merged.push(winner);
  }
  return merged.sort((left, right) => presenceRuleSubjectKey(left).localeCompare(presenceRuleSubjectKey(right)));
}

export function categoryAncestorIds(categoryId, parentById) {
  const ancestors = [];
  let current = parentById.get(categoryId) ?? null;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    ancestors.push(current);
    current = parentById.get(current) ?? null;
  }
  return ancestors;
}

export function isCategoryPresenceBlockedByAncestor({
  subjectRef,
  parentById,
  presenceResolutions,
  scopeInstanceRef,
}) {
  for (const ancestor of categoryAncestorIds(subjectRef, parentById)) {
    const resolved = presenceResolutions.some((record) => isPresenceRuleRecord(record)
      && record.scope_instance_ref === scopeInstanceRef
      && record.subject_kind === 'category'
      && record.subject_ref === ancestor);
    if (resolved) return true;
  }
  return false;
}

export function derivePresenceRuleSeedContext({
  party_id,
  scope_instance_ref,
  subject_kind,
  subject_ref,
  period_number = null,
}) {
  return Object.freeze({
    party_id,
    scope_instance_ref,
    subject_kind,
    subject_ref,
    rng_algorithm_id: RNG_VERSION,
    ...(period_number == null ? {} : { period_number }),
  });
}

export function rollPresenceRulePpm(random, ppm) {
  if (ppm <= 0) return false;
  if (ppm >= 1_000_000) return true;
  return (random.nextUint32() % 1_000_000) < ppm;
}

export function rollUniformPresenceCount(random, countLimit) {
  if (countLimit <= 0) return 0;
  return 1 + (random.nextUint32() % countLimit);
}

export function choosePresenceDiscoveryMode(rule, random) {
  const exposed = rule.entry_exposed_weight ?? 1;
  const concealed = rule.search_concealed_weight ?? 0;
  const total = exposed + concealed;
  if (total <= 0) return 'exposed';
  const draw = random.nextUint32() % total;
  return draw < exposed ? 'exposed' : 'concealed';
}

export function applyPresenceRulesFirstArrival({
  aggregate,
  partyId,
  scopeInstanceRef,
  rules,
  parentById = new Map(),
  periodNumber = null,
  requestIdentityPrefix = 'presence-first-arrival',
}) {
  let current = aggregate;
  for (const rule of rules) {
    const period = rule.refresh_class === 'by_year_season' ? periodNumber : null;
    const replayProbe = {
      scope_instance_ref: scopeInstanceRef,
      subject_kind: rule.subject_kind,
      subject_ref: rule.subject_ref,
      period_number: period,
    };
    if (current.presence_resolutions.some((record) => isPresenceRuleRecord(record)
      && presenceRuleReplayKey(record) === presenceRuleReplayKey(replayProbe))) {
      continue;
    }
    if (rule.subject_kind === 'category'
      && isCategoryPresenceBlockedByAncestor({
        subjectRef: rule.subject_ref,
        parentById,
        presenceResolutions: current.presence_resolutions,
        scopeInstanceRef,
      })) {
      continue;
    }
    const seed = deriveSeed(derivePresenceRuleSeedContext({
      party_id: partyId,
      scope_instance_ref: scopeInstanceRef,
      subject_kind: rule.subject_kind,
      subject_ref: rule.subject_ref,
      period_number: period,
    }));
    const random = createRandomSource({ seed: seed.uint32, version: RNG_VERSION });
    const present = rollPresenceRulePpm(random, rule.presence_probability_ppm);
    const count = present ? rollUniformPresenceCount(random, rule.count_limit) : 0;
    const discovery_mode = count === 0 ? 'exposed' : choosePresenceDiscoveryMode(rule, random);
    current = applyOrdinaryAggregateTransition({
      aggregate: current,
      transition: {
        kind: 'resolve_presence_rule',
        request_identity: period == null
          ? `${requestIdentityPrefix}:${rule.rule_id}@${rule.rule_version}`
          : `${requestIdentityPrefix}:${rule.rule_id}@${rule.rule_version}:p${period}`,
        expected_state_version: current.state_version,
        subject_kind: rule.subject_kind,
        subject_ref: rule.subject_ref,
        subcategory_ref: null,
        count,
        rule_ref: `${rule.rule_id}@${rule.rule_version}`,
        discovery_mode,
        scope_instance_ref: scopeInstanceRef,
        period_number: period,
      },
    });
  }
  return current;
}
