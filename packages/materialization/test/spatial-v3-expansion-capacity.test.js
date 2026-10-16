import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSpatialV3ExpansionCapacity } from '../src/spatial-v3.js';

test('normalized max-flow respects shared templates, forced slots, leases and permanent generated usage', () => {
  const closure = { slots: [{ id: 'a', version: 1, max_instances: 1 }, { id: 'b', version: 1, max_instances: 1 }],
    template_limits: [{ template_id: 'x', template_version: 1, max_count: 1 }, { template_id: 'y', template_version: 1, max_count: 1 }],
    slot_templates: [{ slot_id: 'a', slot_version: 1, template_id: 'x', template_version: 1 },
      { slot_id: 'a', slot_version: 1, template_id: 'y', template_version: 1 },
      { slot_id: 'b', slot_version: 1, template_id: 'x', template_version: 1 }] };
  const snapshot = { sites: [], reservations: [] };
  const read = () => deriveSpatialV3ExpansionCapacity({ closure, snapshot, now: Date.parse('2026-01-01T00:00:00Z') });
  assert.equal(read().committed_residual_capacity, 2);
  assert.deepEqual(read().available_candidates.map((row) => `${row.slot_id}:${row.template_id}`), ['a:y', 'b:x']);
  snapshot.reservations.push({ status: 'reserved', expires_at: '2027-01-01T00:00:00Z',
    slot_ref: { entity_id: 'a', authoring_version: '1' }, selected_template_ref: { entity_id: 'y', authoring_version: '1' } });
  assert.equal(read().committed_residual_capacity, 2);
  assert.equal(read().reservable_residual_capacity, 1);
  snapshot.reservations[0].expires_at = '2025-01-01T00:00:00Z';
  assert.equal(read().reservable_residual_capacity, 2);
  snapshot.sites.push({ origin: 'generated', status: 'destroyed', expansion_slot_ref: { entity_id: 'a', authoring_version: '1' }, generated_template_ref: { entity_id: 'y', authoring_version: '1' } });
  assert.equal(read().committed_residual_capacity, 1);
  snapshot.sites[0].generated_template_ref.entity_id = 'unknown';
  assert.throws(read, /outside the pinned profile/);
});
