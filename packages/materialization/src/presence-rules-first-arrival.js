import { createRandomSource, deriveSeed, MaterializationError, RNG_VERSION } from './core.js';
import { applyOrdinaryAggregateTransition } from './ordinary-materialization-foundation.js';
import { ruleAllowedInSeason } from './presence-rule-conflicts.js';
import {
  isPresenceRuleRecord,
  presenceRuleReplayKey,
} from './ordinary-materialization-foundation-internal.js';

// Every presence rule stores its outcome in the one aggregate (§3A.1): nature, things and people. The category
// ancestor logic below stays category-only.
const PRESENCE_RULE_SUBJECT_KINDS = new Set(['category', 'social_role', 'occupation']);

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

export { ruleAllowedInSeason };

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

function categoryTopologyDepth(subjectRef, parentById) {
  let depth = 0;
  let current = parentById.get(subjectRef) ?? null;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parentById.get(current) ?? null;
  }
  return depth;
}

export function sortPresenceRulesForFirstArrival(rules, parentById = new Map()) {
  return [...rules].sort((left, right) => {
    if (left.subject_kind === 'category' && right.subject_kind === 'category') {
      const byDepth = categoryTopologyDepth(left.subject_ref, parentById)
        - categoryTopologyDepth(right.subject_ref, parentById);
      if (byDepth !== 0) return byDepth;
    }
    return presenceRuleSubjectKey(left).localeCompare(presenceRuleSubjectKey(right));
  });
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

export const PRESENCE_RULE_GAMEPLAY_SEASONS = Object.freeze([
  'winter', 'spring', 'summer', 'autumn',
]);

/** §3A.1 seasonal key: one draw per (year, season), not year alone. */
export function encodePresenceRulePeriodNumber({ year, season }) {
  const seasonIndex = PRESENCE_RULE_GAMEPLAY_SEASONS.indexOf(season);
  if (!Number.isInteger(year) || year < 1 || seasonIndex < 0) {
    throw new Error('PRESENCE_RULE_PERIOD_INVALID');
  }
  return year * 4 + seasonIndex;
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

export function isPresenceRuleItemProducing(rule) {
  return rule?.item_ref != null
    || (Array.isArray(rule?.variants) && rule.variants.length > 0)
    || (rule?.variants != null && !Array.isArray(rule.variants));
}

export function presenceDiscoveryModeConfiguration(rule) {
  if (!isPresenceRuleItemProducing(rule)) {
    const hasDiscoveryFields = [rule?.entry_visible_if, rule?.search_only_if,
      rule?.entry_exposed_weight, rule?.search_concealed_weight].some((value) => value != null);
    return hasDiscoveryFields
      ? { ok: false, reason: 'non_item_fields' }
      : { ok: true, mode: 'exposed', itemProducing: false };
  }
  const exposedAllowed = rule.entry_visible_if === 'placed_exposed';
  const concealedAllowed = rule.search_only_if === 'placed_concealed';
  if (!exposedAllowed && !concealedAllowed) return { ok: false, reason: 'modes' };
  if (rule.entry_exposed_weight === 0 && rule.search_concealed_weight === 0) {
    return { ok: false, reason: 'weights' };
  }
  if (exposedAllowed !== concealedAllowed) {
    return { ok: true, mode: exposedAllowed ? 'exposed' : 'concealed', itemProducing: true };
  }

  const exposed = rule.entry_exposed_weight ?? 1;
  const concealed = rule.search_concealed_weight ?? 1;
  if (![exposed, concealed].every((weight) => Number.isInteger(weight) && weight >= 0)) {
    return { ok: false, reason: 'weights' };
  }
  const total = exposed + concealed;
  if (total === 0) return { ok: false, reason: 'weights' };
  return { ok: true, exposed, concealed, total, itemProducing: true };
}

export function choosePresenceDiscoveryMode(rule, random) {
  const config = presenceDiscoveryModeConfiguration(rule);
  if (!config.ok) {
    throw new MaterializationError('PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
      'Presence rule has no valid discovery-mode choice.', {
        rule_ref: `${rule.rule_id}@${rule.rule_version}`,
        reason: config.reason,
      });
  }
  if (config.mode) return config.mode;
  return random.nextUint32() % config.total < config.exposed ? 'exposed' : 'concealed';
}

function assertPresenceRuleTemplateCoverage(rule, templateBackedItemRefs, required) {
  if (templateBackedItemRefs == null && !required) return;
  const ruleRef = `${rule.rule_id}@${rule.rule_version}`;
  if (!(templateBackedItemRefs instanceof Set)
      || [...templateBackedItemRefs].some((ref) => typeof ref !== 'string' || !ref.trim())) {
    throw new MaterializationError('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
      'Presence rule item template coverage is invalid.', {
        rule_ref: ruleRef,
        reason: 'template_closure_invalid',
      });
  }
  if (!isPresenceRuleItemProducing(rule)) return;

  const itemRefs = [];
  let malformed = false;
  if (Array.isArray(rule.variants) && rule.variants.length > 0 && rule.item_ref == null) {
    malformed = true;
  }
  if (rule.item_ref != null) {
    if (typeof rule.item_ref === 'string' && rule.item_ref.trim()) itemRefs.push(rule.item_ref);
    else malformed = true;
  }
  if (rule.variants != null && !Array.isArray(rule.variants)) {
    malformed = true;
  } else {
    for (const variant of rule.variants ?? []) {
      if (typeof variant?.item_ref === 'string' && variant.item_ref.trim()) itemRefs.push(variant.item_ref);
      else malformed = true;
    }
  }
  const missing = [...new Set(itemRefs.filter((ref) => !templateBackedItemRefs.has(ref)))].sort();
  if (malformed || itemRefs.length === 0 || missing.length > 0) {
    throw new MaterializationError('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
      'Presence rule references an item without an exact approved template.', {
        rule_ref: ruleRef,
        reason: malformed || itemRefs.length === 0 ? 'item_refs_invalid' : 'template_missing',
        missing_item_refs: missing,
      });
  }
}

export function applyPresenceRulesFirstArrival({
  aggregate,
  partyId,
  scopeInstanceRef,
  rules,
  parentById = new Map(),
  periodNumber = null,
  requestIdentityPrefix = 'presence-first-arrival',
  templateBackedItemRefs = null,
  requireTemplateBackedItemRefs = false,
}) {
  let current = aggregate;
  for (const rule of sortPresenceRulesForFirstArrival(rules, parentById)) {
    if (!PRESENCE_RULE_SUBJECT_KINDS.has(rule.subject_kind)) continue;
    const period = rule.refresh_class === 'by_year_season' ? periodNumber : null;
    if (rule.refresh_class === 'by_year_season' && periodNumber == null) {
      throw new Error('PRESENCE_RULE_PERIOD_REQUIRED');
    }
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
    // Target O1 callers pass the complete exact-ref closure from the approved item catalog.
    // Validating every alternative prevents a seeded draw from hiding a missing template.
    assertPresenceRuleTemplateCoverage(rule, templateBackedItemRefs, requireTemplateBackedItemRefs);
    const discoveryModeConfig = presenceDiscoveryModeConfiguration(rule);
    if (!discoveryModeConfig.ok) {
      throw new MaterializationError('PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
        'Presence rule has no valid discovery-mode choice.', {
          rule_ref: `${rule.rule_id}@${rule.rule_version}`,
          reason: discoveryModeConfig.reason,
        });
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
    const discovery_mode = count === 0 || !discoveryModeConfig.itemProducing
      ? 'exposed'
      : choosePresenceDiscoveryMode(rule, random);
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
