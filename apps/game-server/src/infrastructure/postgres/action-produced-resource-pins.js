import { actionProducedText as text,
  failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function bindActionProducedResourcePins(rows, sourceRefs) {
  const output = new Map();
  for (const row of rows) {
    const itemId = row.source_resource_ref?.entity_id;
    if (!sourceRefs.includes(itemId) || output.has(itemId)) {
      fail('ACTION_PRODUCED_RESOURCE_AMBIGUOUS');
    }
    const numerator = numeric(row.quantity_numerator);
    const denominator = numeric(row.quantity_denominator);
    const stateVersion = numeric(row.state_version);
    const unit = row.quantity_unit_ref?.entity_id;
    if (row.source_resource_ref?.entity_kind !== 'party_item'
        || Object.keys(row.source_resource_ref).sort().join(',')
          !== 'entity_id,entity_kind'
        || !text(unit) || numerator < 0 || denominator < 1
        || stateVersion < 1 || row.lifecycle_state !== 'active') {
      fail('ACTION_PRODUCED_RESOURCE_INVALID');
    }
    output.set(itemId, {
      snapshot: {
        schema: 'rus.items.finite_resource_snapshot.v1',
        commit_state: 'committed',
        source_resource_node_id: row.resource_node_id,
        state_version: stateVersion, lifecycle_state: row.lifecycle_state,
        quantity: { numerator, denominator, unit }
      },
      persisted_row: {
        resource_node_id: row.resource_node_id,
        source_resource_ref: row.source_resource_ref,
        quantity_numerator: numerator, quantity_denominator: denominator,
        quantity_unit_ref: row.quantity_unit_ref,
        lifecycle_state: row.lifecycle_state, state_version: stateVersion,
        position_node_id: row.position_node_id,
        property_basis_ref: row.property_basis_ref
      }
    });
  }
  return output;
}

function numeric(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail('ACTION_PRODUCED_NUMERIC_INVALID');
  return number;
}
