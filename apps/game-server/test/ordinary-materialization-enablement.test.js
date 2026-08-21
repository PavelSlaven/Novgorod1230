import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest } from '@rus/items-property';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../src/infrastructure/postgres/ordinary-materialization-enablement.js';

const scope = { entity_kind: 'g6', entity_id: 'scope-a' };
const objective = {
  request_id: 'ordinary-enable-a', scope_ref: scope,
  context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [], environment_refs: [], occupation_household_refs: [], economic_context_ref: 'economy', occupancy_state_ref: 'occupied', material_culture_refs: [], property_context_ref: 'property' },
  policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics', allowed_admission_classes: ['common_mundane'], context_bound_permission_refs: [], allowed_supporting_bases: [] },
  technical_limits: { max_new_entities: 1, max_new_background_groups: 1, max_resolution_records: 1 }
};
const property = { scope_ref: scope, item_kind: 'man_made', property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1', personal_communal_refs: [], occupied_site_refs: [], unowned_cause_refs: [], placement_context_refs: [], property_catalog: [], placement_catalog: [] };
const propertyDigest = ordinaryWorldPropertyPlacementContextDigest({ ...property,
  supporting_basis_ref: 'ordinary_enablement_context_digest',
  causal_basis_refs: ['ordinary_enablement_context_digest'],
  requested_position_ref: 'ordinary_enablement_context_digest' });

test('enabled scope is reconstructed only from committed 021/022/023 rows', async () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 });
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: { query: async () => ({ rowCount: 1, rows: [{ enabled: true,
      objective_snapshot: objective, objective_digest: canonicalDigest(objective),
      aggregate_payload: aggregate, ordinary_state_version: 0,
      property_placement_base_snapshot: property,
      property_placement_context_digest: propertyDigest }] }) }
  });
  const loaded = await repository.load({ partyId: 'party-a', scopeRef: scope });
  assert.equal(loaded.objective_context.ordinary_state.seeded, false);
  assert.deepEqual(loaded.objective_context.ordinary_state.background_groups, []);
  assert.equal(loaded.property_placement_context.item_kind, 'man_made');
});

test('missing or tampered enablement fails closed', async () => {
  const disabled = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: { query: async () => ({ rowCount: 0, rows: [] }) }
  });
  assert.equal(await disabled.load({ partyId: 'party-a', scopeRef: scope }), null);
  const invalid = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: { query: async () => ({ rowCount: 1, rows: [{ enabled: true,
      objective_snapshot: objective, objective_digest: 'tampered',
      aggregate_payload: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 }),
      ordinary_state_version: 0, property_placement_base_snapshot: property,
      property_placement_context_digest: 'placement-digest' }] }) }
  });
  await assert.rejects(() => invalid.load({ partyId: 'party-a', scopeRef: scope }),
    { code: 'ORDINARY_ENABLEMENT_INVALID' });
});

test('constrained profile gets its finite source from the same committed repository boundary', async () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 });
  const profile = { schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
    profile_ref: 'profile', state: 'committed', scope_ref: scope, environment_ref: 'environment',
    semantic_type: 'unseen', functional_bucket: 'other_ordinary',
    admission_class: 'specialized_or_valuable', regional_permission_ref: 'region',
    resource_permission_ref: 'resource', source_basis_ref: 'node',
    public_name: 'обычный кусок материала', finite_source: {
      source_resource_node_id: 'node',
      quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'position',
      property_basis_ref: 'property', initial_amount_bounds: {
        minimum: { numerator: 1, denominator: 1, unit: 'item' },
        maximum: { numerator: 8, denominator: 1, unit: 'item' }
      } } };
  const snapshot = { ...objective, context_refs: { ...objective.context_refs,
    environment_refs: ['environment'] }, policy_refs: { ...objective.policy_refs,
    allowed_admission_classes: ['specialized_or_valuable'],
    context_bound_permission_refs: ['region', 'resource'] }, execution_context: {
    constrained_natural_resource_profile: profile } };
  let calls = 0;
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: { query: async () => {
      calls += 1;
      if (calls === 1) return { rowCount: 1, rows: [{ enabled: true,
        objective_snapshot: snapshot, objective_digest: canonicalDigest(snapshot),
        aggregate_payload: aggregate, ordinary_state_version: 0,
        property_placement_base_snapshot: property,
        property_placement_context_digest: propertyDigest }] };
      return { rowCount: 1, rows: [{ resource_node_id: 'node', state_version: 4,
        lifecycle_state: 'active', quantity_numerator: 2, quantity_denominator: 1,
        quantity_unit_ref: { kind: 'unit', id: 'item' }, position_node_id: 'position',
        property_basis_ref: 'property' }] };
    } }
  });
  const loaded = await repository.load({ partyId: 'party-a', scopeRef: scope });
  assert.equal(calls, 2);
  assert.deepEqual(loaded.execution_context.committed_finite_source, {
    source_resource_node_id: 'node', state_version: 4, lifecycle_state: 'active',
    quantity: { numerator: 2, denominator: 1, unit: 'item' },
    quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'position',
    property_basis_ref: 'property'
  });
});

test('each context-bound capability gets its own committed finite source', async () => {
  const aggregate = createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 });
  const finiteProfile = (id) => ({ finite_source: {
    source_resource_node_id: id, quantity_unit_ref: { kind: 'unit', id: 'item' },
    position_ref: `position-${id}`, property_basis_ref: `property-${id}`,
    initial_amount_bounds: { minimum: { numerator: 1, denominator: 1, unit: 'item' },
      maximum: { numerator: 8, denominator: 1, unit: 'item' } }
  } });
  const snapshot = { ...objective, execution_context: {
    context_bound_capabilities: ['node-a', 'node-b'].map((id) => ({
      constrained_natural_resource_profile: finiteProfile(id)
    }))
  } };
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: { query: async (sql) => {
      if (sql.includes('party_ordinary_materialization_enablements')) {
        return { rowCount: 1, rows: [{ enabled: true,
          objective_snapshot: snapshot, objective_digest: canonicalDigest(snapshot),
          aggregate_payload: aggregate, ordinary_state_version: 0,
          property_placement_base_snapshot: property,
          property_placement_context_digest: propertyDigest }] };
      }
      return { rowCount: 2, rows: ['node-a', 'node-b'].map((id, index) => ({
        resource_node_id: id, state_version: 4 + index, lifecycle_state: 'active',
        quantity_numerator: 2 + index, quantity_denominator: 1,
        quantity_unit_ref: { kind: 'unit', id: 'item' },
        position_node_id: `position-${id}`, property_basis_ref: `property-${id}`
      })) };
    } }
  });
  const loaded = await repository.load({ partyId: 'party-a', scopeRef: scope });
  assert.deepEqual(loaded.execution_context.committed_finite_sources.map((source) => [
    source.source_resource_node_id, source.quantity.numerator
  ]), [['node-a', 2], ['node-b', 3]]);
});
