import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrdinaryAggregate } from '@rus/materialization';
import { GameServerError } from '../src/errors.js';
import { applyResolvedPresenceRulesFirstArrival,
  createApprovedO1TemplateBackedItemRefs, createTargetPresenceRulesFirstArrivalResolver } from
  '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

const REV = 'novgorod_spatial_v3_target_contract_approval_001';
const DIGEST = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';

function buildGateAwareReader({ bindingRows, presenceRuleRows = [] }) {
  return {
    read: async (sql, params) => {
      if (sql.includes('spatial_v3_world_revisions')) {
        return { rows: [{ id: REV, catalog_digest: DIGEST, status: 'approved' }] };
      }
      if (sql.includes('world_base.world_revisions')) {
        return { rows: [{ id: REV, catalog_digest: DIGEST, status: 'approved' }] };
      }
      if (sql.includes('runtime_catalog_activation_events')) {
        return { rows: [{
          event_type: 'activate',
          catalog_scope: 'item_container_materialization_v2',
          catalog_revision_id: 'item_container_spatial_v3_target_001',
          catalog_digest: DIGEST,
          compatible_world_revision_id: REV,
          compatible_world_catalog_digest: DIGEST,
        }] };
      }
      if (sql.includes('spatial_node_place_family_bindings')) {
        return { rows: bindingRows };
      }
      if (sql.includes('FROM world_base.presence_rules')) {
        return { rows: presenceRuleRows };
      }
      if (sql.includes('parent_category_id')) {
        return { rows: [] };
      }
      if (sql.includes('WITH RECURSIVE chain')) {
        return { rows: [{ id: 'region_novgorod_land' }] };
      }
      if (sql.includes('spatial_v3_nodes')) {
        return { rows: [{ version: 1, canonical_digest: 'a'.repeat(64) }] };
      }
      return { rows: [] };
    },
  };
}

const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'item_container_spatial_v3_target_001',
  catalog_digest: DIGEST,
  compatible_world_revision_id: REV,
  compatible_world_catalog_digest: DIGEST,
};

const approvedO1Mappings = [
  ['it_hh_awl', 'item_tpl_nov_awl_v1'],
  ['it_hh_firesteel', 'item_tpl_nov_firesteel_v1'],
  ['it_hh_flint', 'item_tpl_nov_striking_flint_v1'],
  ['it_hh_hollowed_bowl', 'item_tpl_nov_wooden_bowl_v1'],
  ['it_hh_kindling', 'item_tpl_nov_kindling_bundle_v1'],
  ['it_hh_kitchen_knife', 'item_tpl_nov_utility_knife_v1'],
  ['it_hh_pestle', 'item_tpl_nov_pestle_v1'],
  ['it_hh_rope', 'item_tpl_nov_rope_v1'],
  ['it_hh_tinder', 'item_tpl_nov_tinder_v1'],
  ['it_hh_trough', 'item_tpl_nov_trough_v1'],
  ['it_hh_wooden_spoon', 'item_tpl_nov_wooden_spoon_v1'],
  ['it_ps_bark_sheet_blank', 'item_tpl_nov_birch_bark_sheet_v1'],
];

function verifiedO1Catalog(mappings = approvedO1Mappings) {
  return {
    schema: 'rus.verified_item_catalog.v2',
    verified: true,
    records_by_table: { item_templates: mappings.map(([, id]) => ({ id })) },
  };
}

test('P1-4: target presence resolver forwards partyId to calendar read', async () => {
  const calendarParties = [];
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({
      bindingRows: [{ place_family_id: 'pf_rural_yard', binding_role: 'primary' }],
      presenceRuleRows: [{
        rule_id: 'pr_unit_fixture',
        rule_version: 1,
        world_revision_id: REV,
        scope_kind: 'place_family',
        scope_ref: 'pf_rural_yard',
        region_id: null,
        subject_kind: 'category',
        subject_ref: 'cat_fixture',
        presence_probability_ppm: 0,
        count_limit: 1,
        allowed_seasons: ['all'],
        status: 'approved',
      }],
    }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async ({ partyId }) => {
      calendarParties.push(partyId);
      return { season: 'summer', periodNumber: 4920 };
    },
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'party-forward-presence',
    site: {
      id: 'g5-site',
      origin: 'canonical',
      parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 1 },
    },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.ok(result?.rules?.length >= 0);
  assert.equal(Object.hasOwn(result, 'requireTemplateBackedItemRefs'), false);
  assert.deepEqual(calendarParties, ['party-forward-presence']);
});

test('no bindings returns empty presence with diagnostic gap (no calendar read)', async () => {
  const calendarParties = [];
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async ({ partyId }) => {
      calendarParties.push(partyId);
      return { season: 'summer', periodNumber: 4920 };
    },
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'party-gap',
    site: { id: 'g5-site', origin: 'canonical', parent_g4_id: 'g4-node' },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.equal(result.presence_gap, 'no_place_family_binding');
  assert.equal(Object.hasOwn(result, 'requireTemplateBackedItemRefs'), false);
  assert.deepEqual(calendarParties, []);
});

test('target resolver carries exactly the approved O1 item closure and fails closed on every other item ref', async () => {
  const templateBackedItemRefs = createApprovedO1TemplateBackedItemRefs(verifiedO1Catalog());
  assert.deepEqual([...templateBackedItemRefs].sort(), approvedO1Mappings.map(([ref]) => ref).sort());

  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [{ place_family_id: 'pf_rural_yard', binding_role: 'primary' }] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    templateBackedItemRefs,
    requireTemplateBackedItemRefs: true,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
  });
  const context = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'party-o1-template-closure',
    site: { id: 'g5-site', origin: 'canonical', parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 1 } },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.deepEqual([...context.templateBackedItemRefs].sort(), approvedO1Mappings.map(([ref]) => ref).sort());
  assert.equal(context.requireTemplateBackedItemRefs, true);

  const aggregate = () => createOrdinaryAggregate({
    scope_ref: { entity_kind: 'g5', entity_id: 'g5-site' }, resolution_record_cap: 8,
  });
  const itemRule = (overrides = {}) => ({
    rule_id: 'pr_o1_guard_fixture', rule_version: 1, status: 'approved',
    scope_kind: 'place_family', scope_ref: 'pf_rural_yard', subject_kind: 'category',
    subject_ref: 'cat_o1_fixture', item_ref: 'it_hh_awl', presence_probability_ppm: 1_000_000,
    count_limit: 1, allowed_seasons: ['all'], refresh_class: 'none',
    entry_visible_if: 'placed_exposed', search_only_if: 'placed_concealed',
    entry_exposed_weight: 1, search_concealed_weight: 0, ...overrides,
  });

  const accepted = applyResolvedPresenceRulesFirstArrival({
    aggregate: aggregate(), context: { ...context, rules: [itemRule()] },
  });
  assert.equal(accepted.presence_resolutions.length, 1);

  for (const badRule of [
    itemRule({ item_ref: 'it_hh_ash_scoop', presence_probability_ppm: Symbol('rng must not run') }),
    itemRule({ variants: [{ item_ref: 'it_hh_awl' }, { item_ref: 'it_hh_ash_scoop' }],
      presence_probability_ppm: Symbol('rng must not run') }),
  ]) {
    const before = aggregate();
    assert.throws(() => applyResolvedPresenceRulesFirstArrival({
      aggregate: before, context: { ...context, rules: [badRule] },
    }), (error) => error.code === 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'
      && error.details.reason === 'template_missing'
      && error.details.missing_item_refs.includes('it_hh_ash_scoop'));
    assert.deepEqual(before.presence_resolutions, []);
  }
});

test('approved O1 closure requires all mapped targets in a verified item catalog', () => {
  assert.throws(() => createApprovedO1TemplateBackedItemRefs(verifiedO1Catalog(
    approvedO1Mappings.slice(1),
  )), (error) => error instanceof GameServerError
    && error.code === 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'
    && error.details.missing_template_ids.includes('item_tpl_nov_awl_v1'));
  assert.throws(() => createApprovedO1TemplateBackedItemRefs({
    schema: 'rus.verified_item_catalog.v2', verified: false,
    records_by_table: { item_templates: [] },
  }), (error) => error.code === 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'
    && error.details.reason === 'verified_item_catalog_missing');
});
