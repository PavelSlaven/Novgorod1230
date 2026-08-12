import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPhase9NormalizedRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-9-read.js';

test('Phase 9 restart verifies recovered container and packet projections',
  async () => {
    const payload = fixturePayload();
    await assert.doesNotReject(() => assertPhase9NormalizedRows(
      poolFor(payload), payload));
  });

test('Phase 9 restart rejects normalized property drift and completion writes',
  async () => {
    const payload = fixturePayload();
    const tampered = poolFor(payload, { packetHolder: 'other-player' });
    await assert.rejects(() => assertPhase9NormalizedRows(tampered, payload),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const completed = structuredClone(payload);
    completed.completion_state = 'full';
    await assert.rejects(() => assertPhase9NormalizedRows(
      poolFor(completed), completed),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

function fixturePayload() {
  return { party_id: 'party-1', completion_candidate: undefined,
    phase9: { status: 'temporary_disposition_committed', checkpoints: [
      { kind: 'bag_recovery' }, { kind: 'packet_recovered' }],
    temporary_disposition: { legal_effect: 'temporary_disposition_only',
      completion: 'forbidden' } }, containers: [{ container_id: 'bag-1',
      template_id: 'trace_ld_v1_container_road_bag', anchor_id: null,
      parent_container_id: null, holder_npc_id: null,
      holder_character_id: 'player-1', physical_position: 'hands',
      closure_state: 'open', state_version: 3,
      state: { owner_external_ref: 'savva', closure_state: 'open' } }],
  items: [{ item_id: 'packet-1',
    template_id: 'trace_ld_v1_item_sealed_packet', quantity: 1,
    condition_state: 'sealed_intact', legal_status: 'entrusted_service_item',
    state: { seal_state: 'intact', document_contents_access: 'forbidden' },
    placement: { anchor_id: null, container_id: null, holder_npc_id: null,
      holder_character_id: 'player-1', physical_position: 'hands' },
    ownership: { ownership_id: 'ownership-packet-1', owner_npc_id: null,
      owner_character_id: null, owner_external_ref: { entity_kind:
        'external_owner', entity_id: 'savva' }, controller_npc_id: null,
      controller_character_id: 'player-1', claim_state: 'entrusted' } }] };
}

function poolFor(payload, { packetHolder = 'player-1' } = {}) {
  return { async query(sql) {
    if (sql.includes('party_containers')) {
      const bag = payload.containers[0];
      return { rowCount: 1, rows: [{ ...structuredClone(bag),
        state_version: String(bag.state_version) }] };
    }
    const packet = payload.items[0];
    return { rowCount: 1, rows: [{ item_id: packet.item_id,
      template_id: packet.template_id, quantity: packet.quantity,
      condition_state: packet.condition_state,
      legal_status: packet.legal_status, state: structuredClone(packet.state),
      ...structuredClone(packet.placement), holder_character_id: packetHolder,
      ...structuredClone(packet.ownership) }] };
  } };
}
