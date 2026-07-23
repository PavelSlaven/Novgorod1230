import assert from 'node:assert/strict';
import test from 'node:test';

import { compileV5CanonicalCatalog } from '../src/index.js';

const base = {
  source_records: [{ id: 'base_source', title: 'Base', source_type: 'project_policy', summary: 'Base source.', status: 'draft', confidence: 'medium' }],
  universal_categories: [category('cat_item_hammer', 'item', 'object_type'), category('cat_container_box', 'container', 'container_form')],
  region_category_options: [],
  item_templates: [{ id: 'item_hammer', world_revision_id: 'revision_v1', region_id: 'region_novgorod_land', category_id: 'cat_item_hammer', source_id: 'base_source', title: 'hammer', status: 'draft' }],
  container_templates: [{ id: 'container_box', world_revision_id: 'revision_v1', region_id: 'region_novgorod_land', category_id: 'cat_container_box', source_id: 'base_source', capacity: 2, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, access_policy: { version: 1, mode: 'manual' }, status: 'draft' }],
  item_template_category_bindings: [{ id: 'bind_object', item_template_id: 'item_hammer', category_id: 'cat_item_hammer', binding_kind: 'object_type', packing_slot_cost: null, packing_bundle_size: null, exclusivity_group: null, requires_regional_permission: false, status: 'draft' }],
  container_template_facet_bindings: [],
  item_template_inventory_profiles: [{ id: 'physical_item_hammer', item_template_id: 'item_hammer', world_revision_id: 'revision_v1', source_id: 'base_source', mass_grams: 1, carry_form: 'compact', external_hand_cost: 0, status: 'draft' }],
  container_template_inventory_profiles: [{ id: 'physical_container_box', container_template_id: 'container_box', world_revision_id: 'revision_v1', source_id: 'base_source', mass_grams: 1, carry_form: 'compact', external_hand_cost: 0, inventory_role: 'quick_container', status: 'draft' }],
  item_template_source_bindings: [], container_template_source_bindings: [],
  quantity_unit_definitions: [], item_template_quantity_profiles: [],
  container_content_profiles: [{ id: 'content_container_box', container_template_id: 'container_box', empty_allowed: true, status: 'draft' }],
  container_content_profile_entries: [], container_content_category_relations: [],
  item_profile_sets: [], item_profile_entries: [], property_profiles: [], property_profile_rules: [],
  g4_item_materialization_rules: [], g4_container_materialization_rules: []
};

const v5 = {
  templates: { templates: [
    { id: 'item_hammer', kind: 'item', title: 'hammer', materials: ['iron'], construction_methods: ['forged'], materialization_profile_id: 'profile_craft', access_policy_id: 'access_item_hammer' },
    { id: 'container_box', kind: 'container', title: 'box', materials: ['wood'], construction_methods: ['joined'], materialization_profile_id: 'profile_craft', access_policy_id: 'access_container_box' }
  ] },
  sources: { sources: [{ id: 'v5_source', title: 'Source', coverage: 'Coverage', kind: 'peer_reviewed_article', region: 'novgorod_direct', period: [1200, 1250] }, { id: 'src_gameplay_physical_policy_v3', title: 'Policy', coverage: 'Gameplay ranges', kind: 'gameplay_policy', region: 'project_policy', period: [1230, 1230] }] },
  historical_evidence: { evidence: [
    { id: 'e_item', template_id: 'item_hammer', support_level: 'direct_novgorod_evidence', confidence: 'high', source_period_years: [1200, 1250] },
    { id: 'e_container', template_id: 'container_box', support_level: 'direct_novgorod_evidence', confidence: 'high', source_period_years: [1200, 1250] }
  ] },
  claim_bindings: { bindings: ['item_hammer', 'container_box'].flatMap((templateId) => ['historical_presence', 'material', 'construction', 'physical_parameter'].map((scope) => ({ id: `claim_${scope}_${templateId}`, template_id: templateId, claim_scope: scope, source_id: 'v5_source', evidence_id: templateId === 'item_hammer' ? 'e_item' : 'e_container', review_status: 'reviewed_for_content', status: 'content_ready' }))) },
  physical_profiles: { profiles: [
    { id: 'physical_item_hammer', template_id: 'item_hammer', kind: 'item', mass_grams: { typical: 750 }, external_dimensions_mm: { length: { typical: 250 }, width: { typical: 80 }, height: { typical: 40 } }, carry_form: 'hand_or_belt', external_hand_cost: 1, packing_slot_cost: 2, packing_bundle_size: 1 },
    { id: 'physical_container_box', template_id: 'container_box', kind: 'container', empty_mass_grams: { typical: 900 }, external_dimensions_mm: { length: { typical: 300 }, width: { typical: 200 }, height: { typical: 150 } }, carry_form: 'portable', external_hand_cost: 1, packing_slot_cost: 2, packing_bundle_size: 1, closure_model: 'lid', access_model: 'open_lid', mobility: 'portable' }
  ] },
  quantity_units: { units: [{ id: 'piece', dimension: 'count', canonical_unit: 'piece', conversion_factor: 1 }] },
  quantity_profiles: { profiles: [{ id: 'quantity_item_hammer', template_id: 'item_hammer', quantity_unit_id: 'piece', dimension: 'count', minimum_quantity: 1, maximum_quantity: 2, mass_or_volume_per_unit: 750, mass_or_volume_unit: 'grams', stackable: false, partial_consumption_allowed: false, default_quantity_policy: 'explicit_only' }] },
  access_policies: { policies: [
    { id: 'access_item_hammer', template_id: 'item_hammer', commonness: 'common', regional_weight: 50, social_access: ['craft'], role_occupation_binding: 'craft_work', household_or_trade_context: 'craft_work', restrictions: ['causal_place_or_owner_basis_required'], seasonality: 'year_round_or_context_specific' },
    { id: 'access_container_box', template_id: 'container_box', commonness: 'common', regional_weight: 40, social_access: ['craft'], role_occupation_binding: 'craft_work', household_or_trade_context: 'craft_work', restrictions: ['causal_place_or_owner_basis_required'], seasonality: 'year_round_or_context_specific' }
  ] },
  materialization_profiles: { profiles: [{ id: 'profile_craft', context_domain: 'craft_work', region_id: 'region_novgorod_land', period: { from: '1200-01-01', to: '1250-12-31' }, status: 'content_ready' }] },
  materialization_rules: { rules: [{ id: 'rule_item_hammer', template_id: 'item_hammer', profile_id: 'profile_craft', weight: 50, status: 'content_ready' }, { id: 'rule_container_box', template_id: 'container_box', profile_id: 'profile_craft', weight: 40, status: 'content_ready' }] },
  content_categories: { categories: [{ id: 'content_tools', label: 'tools', status: 'content_ready' }, { id: 'content_liquid', label: 'liquid', status: 'content_ready' }] },
  container_compatibility: { profiles: [{ id: 'compat_box', container_template_id: 'container_box', allowed_content_category_ids: ['content_tools'], forbidden_content_category_ids: ['content_liquid'], unlisted_content_policy: 'forbidden', closure_model: 'lid', access_model: 'open_lid', status: 'content_ready' }] }
};

test('V5 compiler maps reviewed evidence, physical facts, profile membership and fail-closed compatibility into canonical records', () => {
  const result = compileV5CanonicalCatalog({ base_records_by_table: base, v5_datasets: v5, world_revision_id: 'revision_v1', region_id: 'region_novgorod_land' });
  assert.deepEqual(result.errors, []);
  const records = result.records_by_table;
  assert.equal(records.item_template_source_bindings.filter((row) => row.item_template_id === 'item_hammer' && row.review_status === 'reviewed').length, 4);
  assert.equal(records.container_template_source_bindings.filter((row) => row.container_template_id === 'container_box' && row.review_status === 'reviewed').length, 4);
  assert.equal(records.item_template_inventory_profiles.find((row) => row.item_template_id === 'item_hammer').mass_grams, 750);
  assert.equal(records.container_template_inventory_profiles.find((row) => row.container_template_id === 'container_box').mass_grams, 900);
  assert.ok(records.item_template_category_bindings.some((row) => row.item_template_id === 'item_hammer' && row.binding_kind === 'material'));
  assert.ok(records.item_template_category_bindings.some((row) => row.item_template_id === 'item_hammer' && row.binding_kind === 'manufacturing_technique'));
  assert.ok(records.universal_category_relations.some((row) => row.from_category_id === 'cat_container_box' && row.to_category_id === 'cat_item_manufacturing_joined_v1'));
  assert.equal(records.item_profile_entries.find((row) => row.item_template_id === 'item_hammer').weight, 50);
  assert.equal(records.container_content_category_relations.find((row) => row.content_category_id === 'content_tools').compatibility, 'allowed');
  assert.equal(records.container_content_category_relations.find((row) => row.content_category_id === 'content_liquid').compatibility, 'forbidden');
  assert.equal(records.container_templates[0].access_policy.unlisted_content_policy, 'forbidden');
});

test('V5 compiler blocks quantity resources without a known unit and unknown container compatibility', () => {
  const broken = structuredClone(v5);
  broken.quantity_profiles.profiles[0].quantity_unit_id = 'missing_unit';
  broken.container_compatibility.profiles[0].unlisted_content_policy = 'unknown';
  const result = compileV5CanonicalCatalog({ base_records_by_table: base, v5_datasets: broken, world_revision_id: 'revision_v1', region_id: 'region_novgorod_land' });
  assert.ok(result.errors.includes('QUANTITY_UNIT_UNKNOWN:item_hammer:missing_unit'));
  assert.ok(result.errors.includes('CONTAINER_COMPATIBILITY_NOT_FAIL_CLOSED:container_box'));
});

test('V5 compiler preserves a fractional grams-per-volume unit mass without rounding', () => {
  const fractional = structuredClone(v5);
  fractional.quantity_units.units.push({ id: 'millilitre', dimension: 'volume', canonical_unit: 'millilitre', conversion_factor: 1 });
  Object.assign(fractional.quantity_profiles.profiles[0], { quantity_unit_id: 'millilitre', dimension: 'volume', minimum_quantity: 100, maximum_quantity: 5000, mass_or_volume_per_unit: 1.4, mass_or_volume_unit: 'grams_per_millilitre' });
  const result = compileV5CanonicalCatalog({ base_records_by_table: base, v5_datasets: fractional, world_revision_id: 'revision_v1', region_id: 'region_novgorod_land' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.records_by_table.item_template_quantity_profiles.find((row) => row.item_template_id === 'item_hammer').mass_grams_per_unit, 1.4);
});

function category(id, domain, facet) { return { id, domain, parent_category_id: null, stable_code: id, facet, preferred_label: id, definition: id, scope_note: id, inclusion_rules: id, exclusion_rules: id, replaced_by_category_id: null, title: id, status: 'draft' }; }
