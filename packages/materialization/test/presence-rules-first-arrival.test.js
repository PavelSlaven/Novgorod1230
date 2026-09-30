import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOrdinaryAggregateTransition,
  applyPresenceRulesFirstArrival,
  createOrdinaryAggregate,
  createRandomSource,
  derivePresenceRuleSeedContext,
  encodePresenceRulePeriodNumber,
  deriveSeed,
  isO1PresenceRecord,
  mergePlaceFamilyPresenceRules,
  presenceRuleSubjectKey,
  RNG_VERSION,
} from '../src/index.js';
import { presenceRuleReplayKey } from '../src/ordinary-materialization-foundation-internal.js';

const rule = (overrides = {}) => ({
  rule_id: 'pr_test',
  rule_version: 1,
  status: 'approved',
  scope_kind: 'place_family',
  scope_ref: 'pf_test',
  region_id: null,
  subject_kind: 'category',
  subject_ref: 'cat_child',
  presence_probability_ppm: 1_000_000,
  count_limit: 2,
  allowed_seasons: ['all'],
  refresh_class: 'none',
  entry_exposed_weight: 1,
  search_concealed_weight: 0,
  ...overrides,
});

test('mergePlaceFamilyPresenceRules prefers primary subjects and regional override', () => {
  const global = rule({ rule_id: 'pr_global', subject_ref: 'cat_a', region_id: null });
  const regional = rule({ rule_id: 'pr_reg', subject_ref: 'cat_a', region_id: 'region_nov' });
  const secondaryOnly = rule({ rule_id: 'pr_sec', subject_ref: 'cat_b' });
  const merged = mergePlaceFamilyPresenceRules({
    primaryRules: [global, regional],
    secondaryRules: [secondaryOnly, rule({ subject_ref: 'cat_a', rule_id: 'pr_dup_sec' })],
    regionId: 'region_nov',
    season: 'summer',
  });
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.subject_ref === 'cat_a').rule_id, 'pr_reg');
  assert.ok(merged.some((row) => row.subject_ref === 'cat_b'));
});

test('presenceRuleSubjectKey and derivePresenceRuleSeedContext match §3A.1', () => {
  assert.equal(presenceRuleSubjectKey(rule()), 'category:cat_child');
  const seed = derivePresenceRuleSeedContext({
    party_id: 'party-1',
    scope_instance_ref: 'g5:site-a',
    subject_kind: 'category',
    subject_ref: 'cat_child',
    period_number: 4,
  });
  assert.equal(seed.rng_algorithm_id, RNG_VERSION);
  assert.equal(seed.period_number, 4);
  assert.deepEqual(Object.keys(seed).sort(), [
    'party_id', 'period_number', 'rng_algorithm_id', 'scope_instance_ref', 'subject_kind', 'subject_ref',
  ]);
});

test('applyPresenceRulesFirstArrival persists empty count and replays by presenceRuleReplayKey', () => {
  const parentById = new Map([['cat_child', 'cat_parent']]);
  const aggregate = applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-a' }, resolution_record_cap: 8 }),
    transition: {
      kind: 'seed',
      request_identity: 'seed',
      expected_state_version: 0,
      density_band: 'ordinary',
      identity_budget: 2,
      background_groups: [],
    },
  });
  const alwaysMiss = rule({ presence_probability_ppm: 0, count_limit: 3 });
  const afterMiss = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-a',
    rules: [alwaysMiss],
    parentById,
  });
  assert.equal(afterMiss.presence_resolutions.length, 1);
  assert.equal(afterMiss.presence_resolutions[0].count, 0);
  assert.strictEqual(applyPresenceRulesFirstArrival({
    aggregate: afterMiss,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-a',
    rules: [alwaysMiss],
    parentById,
  }), afterMiss);
});

test('LW-071: resolved ancestor category skips descendant presence roll', () => {
  const parentById = new Map([['cat_child', 'cat_parent']]);
  let aggregate = applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-b' }, resolution_record_cap: 8 }),
    transition: {
      kind: 'seed',
      request_identity: 'seed',
      expected_state_version: 0,
      density_band: 'ordinary',
      identity_budget: 2,
      background_groups: [],
    },
  });
  aggregate = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-b',
    rules: [rule({ rule_id: 'pr_parent', subject_ref: 'cat_parent' })],
    parentById,
  });
  const after = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-b',
    rules: [rule({ rule_id: 'pr_child', subject_ref: 'cat_child' })],
    parentById,
  });
  assert.equal(after.presence_resolutions.length, 1);
});

test('LW-071: child rule after parent even when alphabet favors child first', () => {
  const parentById = new Map([['cat_z_child', 'cat_a_parent']]);
  let aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-z' }, resolution_record_cap: 8 });
  aggregate = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-z',
    rules: [
      rule({ rule_id: 'pr_child', subject_ref: 'cat_z_child' }),
      rule({ rule_id: 'pr_parent', subject_ref: 'cat_a_parent' }),
    ],
    parentById,
  });
  assert.equal(aggregate.presence_resolutions.length, 1);
  assert.equal(aggregate.presence_resolutions[0].subject_ref, 'cat_a_parent');
});

test('unseen-equivalent category uses the same resolve_presence_rule path', () => {
  const unseen = rule({
    rule_id: 'pr_unseen',
    subject_ref: 'cat_obscure_xyz_not_in_fixture_sets',
    presence_probability_ppm: 1_000_000,
    count_limit: 1,
  });
  const aggregate = applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-c' }, resolution_record_cap: 8 }),
    transition: {
      kind: 'seed',
      request_identity: 'seed',
      expected_state_version: 0,
      density_band: 'ordinary',
      identity_budget: 1,
      background_groups: [],
    },
  });
  const after = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-c',
    rules: [unseen],
    parentById: new Map(),
  });
  const record = after.presence_resolutions[0];
  assert.equal(record.subject_ref, 'cat_obscure_xyz_not_in_fixture_sets');
  assert.equal(presenceRuleReplayKey(record), presenceRuleReplayKey({
    scope_instance_ref: 'g5:site-c',
    subject_kind: 'category',
    subject_ref: 'cat_obscure_xyz_not_in_fixture_sets',
    period_number: null,
  }));
});

test('encodePresenceRulePeriodNumber distinguishes seasons within the same year', () => {
  const year = 1230;
  const summer = encodePresenceRulePeriodNumber({ year, season: 'summer' });
  const winter = encodePresenceRulePeriodNumber({ year, season: 'winter' });
  assert.notEqual(summer, winter);
  assert.equal(summer, year * 4 + 2);
  assert.equal(winter, year * 4);
});

test('period_number enters replay key for seasonal refresh_class', () => {
  const seasonal = rule({
    rule_id: 'pr_season',
    subject_ref: 'cat_seasonal',
    refresh_class: 'by_year_season',
    presence_probability_ppm: 1_000_000,
    count_limit: 1,
  });
  const aggregate = applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-d' }, resolution_record_cap: 8 }),
    transition: {
      kind: 'seed',
      request_identity: 'seed',
      expected_state_version: 0,
      density_band: 'ordinary',
      identity_budget: 1,
      background_groups: [],
    },
  });
  const first = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-d',
    rules: [seasonal],
    parentById: new Map(),
    periodNumber: 2,
  });
  const second = applyPresenceRulesFirstArrival({
    aggregate: first,
    partyId: 'party-1',
    scopeInstanceRef: 'g5:site-d',
    rules: [seasonal],
    parentById: new Map(),
    periodNumber: 3,
  });
  assert.equal(second.presence_resolutions.length, 2);
  const seedA = deriveSeed(derivePresenceRuleSeedContext({
    party_id: 'party-1',
    scope_instance_ref: 'g5:site-d',
    subject_kind: 'category',
    subject_ref: 'cat_seasonal',
    period_number: 2,
  }));
  const seedB = deriveSeed(derivePresenceRuleSeedContext({
    party_id: 'party-1',
    scope_instance_ref: 'g5:site-d',
    subject_kind: 'category',
    subject_ref: 'cat_seasonal',
    period_number: 3,
  }));
  assert.notEqual(seedA.uint32, seedB.uint32);
  assert.equal(createRandomSource({ seed: seedA.uint32 }).nextUint32(),
    createRandomSource({ seed: seedA.uint32 }).nextUint32());
});

test('occupation and social_role rules store their outcome in the same aggregate; O1 projections do not see them (§3A.1)', () => {
  const scope = { entity_kind: 'g6', entity_id: 'g6-people' };
  const rules = [rule({ rule_id: 'pr_fisher', subject_kind: 'occupation', subject_ref: 'nov_occ_fisher', count_limit: 1 }),
    rule({ rule_id: 'pr_householder', subject_kind: 'social_role', subject_ref: 'nov_role_smerd_householder', count_limit: 1,
      presence_probability_ppm: 0, refresh_class: 'by_year_season' }),
    rule({ rule_id: 'pr_cat', subject_kind: 'category', subject_ref: 'cat_a' })];
  const run = () => applyPresenceRulesFirstArrival({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 4 }),
    partyId: 'party', scopeInstanceRef: 'g5:site', rules, periodNumber: 4920, requestIdentityPrefix: 'presence-first-arrival:site' });
  const aggregate = run();
  const people = aggregate.presence_resolutions.filter((record) => ['occupation', 'social_role'].includes(record.subject_kind));
  assert.deepEqual(people.map((record) => [record.subject_ref, record.count, record.rule_ref, record.period_number]).sort(),
    [['nov_occ_fisher', 1, 'pr_fisher@1', null], ['nov_role_smerd_householder', 0, 'pr_householder@1', 4920]]);
  assert.equal(aggregate.presence_resolutions.length, 3);
  assert.deepEqual(aggregate.presence_resolutions.filter(isO1PresenceRecord), [], 'no projection lists a rule outcome as an O1 resolution');
  assert.deepEqual(run(), aggregate, 'the outcome is a function of party, scope, subject and period');
  // replay: applying the same rules to the stored aggregate adds nothing
  assert.deepEqual(applyPresenceRulesFirstArrival({ aggregate, partyId: 'party', scopeInstanceRef: 'g5:site', rules,
    periodNumber: 4920, requestIdentityPrefix: 'presence-first-arrival:site' }), aggregate);
});
