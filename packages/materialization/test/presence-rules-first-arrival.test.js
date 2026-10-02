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
import { choosePresenceDiscoveryMode } from '../src/presence-rules-first-arrival.js';

const rule = (overrides = {}) => ({
  rule_id: 'pr_test',
  rule_version: 1,
  status: 'approved',
  scope_kind: 'place_family',
  scope_ref: 'pf_test',
  region_id: null,
  subject_kind: 'category',
  subject_ref: 'cat_child',
  item_ref: 'it_test',
  presence_probability_ppm: 1_000_000,
  count_limit: 2,
  allowed_seasons: ['all'],
  refresh_class: 'none',
  entry_visible_if: 'placed_exposed',
  search_only_if: 'placed_concealed',
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

test('presence discovery mode applies weighted defaults and fails closed on invalid rules', () => {
  const choose = (overrides, value = 0) => {
    let calls = 0;
    const mode = choosePresenceDiscoveryMode({
    item_ref: 'it_test',
    entry_visible_if: 'placed_exposed',
    search_only_if: 'placed_concealed',
    entry_exposed_weight: null,
    search_concealed_weight: null,
    ...overrides,
    }, { nextUint32: () => { calls += 1; return value; } });
    return { mode, calls };
  };

  assert.deepEqual(choose({}, 0), { mode: 'exposed', calls: 1 });
  assert.deepEqual(choose({}, 1), { mode: 'concealed', calls: 1 });
  assert.deepEqual(choose({ entry_exposed_weight: 1, search_concealed_weight: 0 }), { mode: 'exposed', calls: 1 });
  assert.deepEqual(choose({ entry_exposed_weight: 0, search_concealed_weight: 1 }), { mode: 'concealed', calls: 1 });
  assert.deepEqual(choose({ entry_exposed_weight: null, search_concealed_weight: 4 }, 0), { mode: 'exposed', calls: 1 });
  assert.deepEqual(choose({ entry_exposed_weight: null, search_concealed_weight: 4 }, 1), { mode: 'concealed', calls: 1 });
  assert.deepEqual(choose({ entry_exposed_weight: 4, search_concealed_weight: null }, 4), { mode: 'concealed', calls: 1 });
  assert.deepEqual(choose({ search_only_if: null, entry_exposed_weight: null,
    search_concealed_weight: null }, 1), { mode: 'exposed', calls: 0 });
  assert.deepEqual(choose({ entry_visible_if: null, entry_exposed_weight: null,
    search_concealed_weight: null }, 1), { mode: 'concealed', calls: 0 });
  assert.throws(() => choosePresenceDiscoveryMode({
    rule_id: 'pr_invalid', rule_version: 2, item_ref: 'it_test', entry_visible_if: null, search_only_if: null,
  }, { nextUint32: () => assert.fail('invalid rule must not draw') }), {
    code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
    details: { rule_ref: 'pr_invalid@2', reason: 'modes' },
  });
  assert.throws(() => choosePresenceDiscoveryMode({
    rule_id: 'pr_zero', rule_version: 1, item_ref: 'it_test', entry_visible_if: 'placed_exposed',
    search_only_if: 'placed_concealed', entry_exposed_weight: 0, search_concealed_weight: 0,
  }, { nextUint32: () => assert.fail('zero-weight rule must not draw') }), {
    code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
    details: { rule_ref: 'pr_zero@1', reason: 'weights' },
  });
  for (const overrides of [
    { entry_visible_if: 'placed_exposed', search_only_if: null },
    { entry_visible_if: null, search_only_if: 'placed_concealed' },
  ]) {
    assert.throws(() => choosePresenceDiscoveryMode({
      rule_id: 'pr_single_zero', rule_version: 1, item_ref: 'it_test',
      entry_exposed_weight: 0, search_concealed_weight: 0, ...overrides,
    }, { nextUint32: () => assert.fail('single-mode zero-weight rule must not draw') }), {
      code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
      details: { rule_ref: 'pr_single_zero@1', reason: 'weights' },
    });
  }
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

test('presence-rule mode gap is reported before draws, even when count would be zero', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-gap' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-gap',
    scopeInstanceRef: 'g5:site-gap',
    rules: [rule({ presence_probability_ppm: 0, entry_visible_if: null, search_only_if: null })],
  }), {
    code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'modes' },
  });
  assert.equal(aggregate.presence_resolutions.length, 0);
});

test('non-item presence rule resolves exposed without a discovery-mode choice', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-non-item' }, resolution_record_cap: 8 });
  const after = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-non-item',
    scopeInstanceRef: 'g5:site-non-item',
    rules: [rule({ item_ref: null, variants: [], entry_visible_if: null, search_only_if: null,
      entry_exposed_weight: null, search_concealed_weight: null, count_limit: 1 })],
  });
  assert.equal(after.presence_resolutions[0].count, 1);
  assert.equal(after.presence_resolutions[0].discovery_mode, 'exposed');
});

test('non-item presence rule rejects any configured discovery field', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-non-item-invalid' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-non-item-invalid',
    scopeInstanceRef: 'g5:site-non-item-invalid',
    rules: [rule({ item_ref: null, variants: [], entry_visible_if: null, search_only_if: null,
      entry_exposed_weight: 0, search_concealed_weight: null })],
  }), {
    code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'non_item_fields' },
  });
});

test('positive presence-rule replay preserves saved discovery mode after rule drift', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-replay' }, resolution_record_cap: 8 });
  const first = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-replay',
    scopeInstanceRef: 'g5:site-replay',
    rules: [rule({ presence_probability_ppm: 1_000_000, count_limit: 1,
      entry_exposed_weight: 1, search_concealed_weight: 0 })],
  });
  const saved = first.presence_resolutions[0];
  assert.equal(saved.count, 1);
  assert.equal(saved.discovery_mode, 'exposed');
  const replay = applyPresenceRulesFirstArrival({
    aggregate: first,
    partyId: 'party-replay',
    scopeInstanceRef: 'g5:site-replay',
    rules: [rule({ presence_probability_ppm: 1_000_000, count_limit: 1,
      entry_exposed_weight: 0, search_concealed_weight: 0 })],
  });
  assert.strictEqual(replay, first);
  assert.equal(replay.presence_resolutions[0].discovery_mode, saved.discovery_mode);
});

test('O1 template closure rejects a missing item_ref before recording presence', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-gap' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-gap',
    scopeInstanceRef: 'g5:template-gap',
    rules: [rule({ presence_probability_ppm: Symbol('roll_must_not_run'), item_ref: 'it_missing' })],
    templateBackedItemRefs: new Set(['it_other']),
    requireTemplateBackedItemRefs: true,
  }), {
    code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'template_missing', missing_item_refs: ['it_missing'] },
  });
  assert.deepEqual(aggregate.presence_resolutions, []);
});

test('O1 template closure rejects an unmapped variant instead of filtering it', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-variant-gap' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-variant-gap',
    scopeInstanceRef: 'g5:template-variant-gap',
    rules: [rule({ presence_probability_ppm: Symbol('roll_must_not_run'), item_ref: 'it_base',
      variants: [{ item_ref: 'it_mapped' }, { item_ref: 'it_missing' }] })],
    templateBackedItemRefs: new Set(['it_base', 'it_mapped']),
    requireTemplateBackedItemRefs: true,
  }), {
    code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'template_missing', missing_item_refs: ['it_missing'] },
  });
  assert.deepEqual(aggregate.presence_resolutions, []);
});

test('O1 template closure rejects malformed variant refs as a typed gap', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-malformed' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-malformed',
    scopeInstanceRef: 'g5:template-malformed',
    rules: [rule({ presence_probability_ppm: Symbol('roll_must_not_run'), variants: 'it_invalid' })],
    templateBackedItemRefs: new Set(['it_test']),
    requireTemplateBackedItemRefs: true,
  }), {
    code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'item_refs_invalid', missing_item_refs: [] },
  });
  assert.deepEqual(aggregate.presence_resolutions, []);
});

test('O1 template closure is required only on target callers and does not invalidate non-item rules', () => {
  const nonItem = rule({ item_ref: null, variants: [], entry_visible_if: null, search_only_if: null,
    entry_exposed_weight: null, search_concealed_weight: null, count_limit: 1 });
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-non-item' }, resolution_record_cap: 8 });
  const result = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-non-item',
    scopeInstanceRef: 'g5:template-non-item',
    rules: [nonItem],
    templateBackedItemRefs: new Set(),
    requireTemplateBackedItemRefs: true,
  });
  assert.equal(result.presence_resolutions[0].count, 1);
  assert.equal(result.presence_resolutions[0].discovery_mode, 'exposed');
});

test('saved O1 presence replay survives later template-closure drift', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-replay' }, resolution_record_cap: 8 });
  const first = applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-replay',
    scopeInstanceRef: 'g5:template-replay',
    rules: [rule({ presence_probability_ppm: 1_000_000, count_limit: 1 })],
    templateBackedItemRefs: new Set(['it_test']),
    requireTemplateBackedItemRefs: true,
  });
  const replay = applyPresenceRulesFirstArrival({
    aggregate: first,
    partyId: 'party-template-replay',
    scopeInstanceRef: 'g5:template-replay',
    rules: [rule({ presence_probability_ppm: 1_000_000, count_limit: 1 })],
    templateBackedItemRefs: new Set(),
    requireTemplateBackedItemRefs: true,
  });
  assert.strictEqual(replay, first);
});

test('O1 callers fail closed when the exact template closure is omitted', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-template-closure-missing' }, resolution_record_cap: 8 });
  assert.throws(() => applyPresenceRulesFirstArrival({
    aggregate,
    partyId: 'party-template-closure-missing',
    scopeInstanceRef: 'g5:template-closure-missing',
    rules: [rule({ presence_probability_ppm: Symbol('roll_must_not_run') })],
    requireTemplateBackedItemRefs: true,
  }), {
    code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
    details: { rule_ref: 'pr_test@1', reason: 'template_closure_invalid' },
  });
  assert.deepEqual(aggregate.presence_resolutions, []);
});

test('single-mode 0/0 discovery weights fail before O1 seed or transition', () => {
  for (const overrides of [
    { entry_visible_if: 'placed_exposed', search_only_if: null },
    { entry_visible_if: null, search_only_if: 'placed_concealed' },
  ]) {
    const aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'g6-single-zero' }, resolution_record_cap: 8 });
    assert.throws(() => applyPresenceRulesFirstArrival({
      aggregate,
      partyId: 'party-single-zero',
      scopeInstanceRef: 'g5:single-zero',
      rules: [rule({ presence_probability_ppm: Symbol('seed_must_not_run'),
        entry_exposed_weight: 0, search_concealed_weight: 0, ...overrides })],
      templateBackedItemRefs: new Set(['it_test']),
      requireTemplateBackedItemRefs: true,
    }), {
      code: 'PRESENCE_RULE_DISCOVERY_MODE_DATA_GAP',
      details: { rule_ref: 'pr_test@1', reason: 'weights' },
    });
    assert.deepEqual(aggregate.presence_resolutions, []);
  }
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
