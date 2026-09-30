import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { targetCanonicalStartFixture } from '../../../test/spatial-v3/target-canonical-start-fixture.js';
import { createTargetGeneratedFirstEntry } from
  '../src/infrastructure/postgres/target-generated-first-entry.js';

const fixture = await targetCanonicalStartFixture();
const itemPin = fixture.domain_catalog_pin;
const actorProfile = fixture.actor_base_attributes_runtime_profile;
const actorPin = { ...itemPin, ...Object.fromEntries(['catalog_scope', 'catalog_revision_id', 'catalog_digest',
  'activation_event_id', 'import_id', 'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest']
  .map((key) => [key, actorProfile[key]])) };
const rule = {
  rule_id: 'pr_unit_fixture', rule_version: 1, status: 'approved', scope_kind: 'place_family',
  scope_ref: 'pf_unit', region_id: null, subject_kind: 'category', subject_ref: 'cat_fixture',
  presence_probability_ppm: 1_000_000, count_limit: 1, allowed_seasons: ['all'], refresh_class: 'none',
  entry_exposed_weight: 1, search_concealed_weight: 0,
};
const rulesContext = { partyId: 'party-c', scopeInstanceRef: 'g5:site', rules: [rule], parentById: new Map(),
  periodNumber: 4, requestIdentityPrefix: 'presence-first-arrival:site' };
const scene = (id) => ({ target_table: 'party_g6_instances', id,
  record: { id, host_id: 'site', scene_slot_key: 'main' } });

function setup({ scenes = [scene('g6')], resolve = async () => rulesContext, profile = { technical_limits: { max_resolution_records: 8 } },
  withResolver = true, siteRecord = {}, canonicalFiniteApplicability = null,
  prepareNatural = async () => { throw new Error('canonical path only'); } } = {}) {
  const options = {
    verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin,
      runtime_profile: actorProfile },
    approvedActorTemporalBundle: fixture.approved_actor_temporal_bundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async () => { throw new Error('canonical path only'); } },
    prepareNaturalFirstEntry: prepareNatural,
    canonicalFiniteApplicability,
    readFactualContext: async () => { throw new Error('canonical path only'); },
    finiteFirstEntryProfile: profile,
    ...(withResolver ? { resolvePresenceRulesFirstArrival: resolve } : {}),
  };
  const context = {
    transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: 'party-c', g4: { id: 'g4', version: 1, world_revision_id: fixture.world_revision_id } },
    change_set_id: 'change',
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: 'g4' },
      version_pin: { pin_kind: 'authoring_version', authoring_version: '1' } }],
    canonical_digest: canonicalDigest('fixture-pins') },
    proposal: { target_site_id: 'site', inserts: [
      { target_table: 'party_g5_sites', id: 'site', record: { id: 'site', party_id: 'party-c', origin: 'canonical', ...siteRecord } },
      ...scenes] },
  };
  return createTargetGeneratedFirstEntry(options)(context);
}

test('canonical arrival with presence rules writes one presence aggregate for the main scene', async () => {
  const result = await setup();
  assert.equal(result.ok, true);
  const [write] = result.approved_write_sets[0].inserts;
  assert.equal(write.target_table, 'party_ordinary_materialization_aggregates');
  assert.equal(write.record.scope_id, 'g6');
  assert.equal(write.record.aggregate_payload.presence_resolutions.length, 1);
});

test('canonical arrival with empty presence is a legal empty result', async () => {
  const result = await setup({ resolve: async () => ({ partyId: 'party-c', rules: [],
    presence_gap: 'no_place_family_binding' }) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.approved_write_sets, []);
});

test('canonical arrival fails closed instead of silently skipping presence', async () => {
  const cases = [
    ['target_first_entry_presence_resolver_required', { withResolver: false }],
    ['target_first_entry_presence_scene_required', { scenes: [] }],
    ['target_first_entry_presence_scene_required', { scenes: [scene('g6-a'), scene('g6-b')] }],
    ['target_first_entry_presence_profile_required', { profile: { technical_limits: {} } }],
    ['target_first_entry_presence_profile_required', { profile: null }],
  ];
  for (const [reason, options] of cases) {
    const result = await setup(options);
    assert.equal(result.ok, false, reason);
    assert.equal(result.error.code, 'authoring_dependency_pin_missing');
    assert.equal(result.error.diagnostics.reason, reason);
  }
});

const naturalWrites = [{ inserts: [{ target_table: 'party_resource_nodes', id: 'source', record: {} }],
  updates: [], appends: [] }];

test('canonical arrival at approved commons takes its finite sources from the natural owner', async () => {
  const canonicalFiniteApplicability = { rows: [{ canonical_g5_ref: { id: 'cg5-water', version: 1 },
    g4_ref: { id: 'g4', version: 1 }, natural_finite_source_profile_refs: ['m2c_finite_driftwood_v1'] }] };
  const natural = { ok: true, approved_write_sets: naturalWrites, expected_state_versions: [],
    commit_rechecks: [], recheck: async () => ({ ok: true }) };
  const result = await setup({ canonicalFiniteApplicability,
    siteRecord: { canonical_g5_ref: { entity_id: 'cg5-water', authoring_version: '1' } },
    prepareNatural: async () => natural });
  assert.equal(result.ok, true);
  assert.equal(result.approved_write_sets, naturalWrites);
  // A canonical place that is not an approved row keeps the presence-only write.
  const other = await setup({ canonicalFiniteApplicability,
    siteRecord: { canonical_g5_ref: { entity_id: 'cg5-yard', authoring_version: '1' } } });
  assert.equal(other.approved_write_sets[0].inserts[0].target_table,
    'party_ordinary_materialization_aggregates');
});

test('a failing natural owner fails the canonical arrival closed', async () => {
  const result = await setup({ canonicalFiniteApplicability: { rows: [{ canonical_g5_ref: { id: 'cg5-x', version: 1 },
      g4_ref: { id: 'g4', version: 1 }, natural_finite_source_profile_refs: ['m2c_finite_deadwood_v1'] }] },
    siteRecord: { canonical_g5_ref: { entity_id: 'cg5-x', authoring_version: '1' } },
    prepareNatural: async () => ({ ok: false }) });
  assert.equal(result.ok, false);
  assert.equal(result.error.diagnostics.reason, 'target_first_entry_natural_proposal_required');
});
