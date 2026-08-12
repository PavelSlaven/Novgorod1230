import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function assertPhase9NormalizedRows(pool, payload) {
  if (payload.phase9 == null) return;
  const bag = payload.containers?.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag');
  const packet = payload.items?.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_sealed_packet');
  if (!bag || !packet || Object.hasOwn(payload, 'completion_state')) fail();
  const checkpoints = new Set(payload.phase9.checkpoints?.map(
    ({ kind }) => kind));
  if (checkpoints.has('bag_recovery')) {
    await assertBag(pool, payload.party_id, bag);
  }
  if (checkpoints.has('packet_recovered')) {
    await assertPacket(pool, payload.party_id, packet);
  }
  if (payload.phase9.status === 'temporary_disposition_committed'
      && (payload.phase9.temporary_disposition?.legal_effect
        !== 'temporary_disposition_only'
        || payload.phase9.temporary_disposition?.completion !== 'forbidden')) {
    fail();
  }
}

async function assertBag(pool, partyId, expected) {
  const result = await pool.query(
    `SELECT container_id,template_id,anchor_id,parent_container_id,
            holder_npc_id,holder_character_id,physical_position,
            closure_state,state,state_version::text
       FROM party_runtime.party_containers
      WHERE party_id=$1 AND container_id=$2`,
    [partyId, expected.container_id]
  );
  const actual = result.rows[0];
  if (result.rowCount !== 1 || actual.template_id !== expected.template_id
      || actual.anchor_id !== (expected.anchor_id ?? null)
      || actual.parent_container_id !== (expected.parent_container_id ?? null)
      || actual.holder_npc_id !== (expected.holder_npc_id ?? null)
      || actual.holder_character_id !== (expected.holder_character_id ?? null)
      || actual.physical_position !== (expected.physical_position ?? null)
      || actual.closure_state !== expected.closure_state
      || Number(actual.state_version) !== expected.state_version
      || canonicalDigest(actual.state) !== canonicalDigest(expected.state)) {
    fail();
  }
}

async function assertPacket(pool, partyId, expected) {
  const result = await pool.query(
    `SELECT i.item_id,i.template_id,i.quantity,i.condition_state,
            i.legal_status,i.state,p.anchor_id,p.container_id,
            p.holder_npc_id,p.holder_character_id,p.physical_position,
            o.ownership_id,o.owner_npc_id,o.owner_character_id,
            o.owner_external_ref,o.controller_npc_id,
            o.controller_character_id,o.claim_state
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id=$2`,
    [partyId, expected.item_id]
  );
  const actual = result.rows[0];
  const placement = expected.placement ?? {};
  const ownership = expected.ownership ?? {};
  if (result.rowCount !== 1 || actual.template_id !== expected.template_id
      || Number(actual.quantity) !== expected.quantity
      || actual.condition_state !== expected.condition_state
      || actual.legal_status !== expected.legal_status
      || canonicalDigest(actual.state) !== canonicalDigest(expected.state)
      || actual.anchor_id !== (placement.anchor_id ?? null)
      || actual.container_id !== (placement.container_id ?? null)
      || actual.holder_npc_id !== (placement.holder_npc_id ?? null)
      || actual.holder_character_id !== (placement.holder_character_id ?? null)
      || actual.physical_position !== (placement.physical_position ?? null)
      || actual.ownership_id !== ownership.ownership_id
      || actual.owner_npc_id !== (ownership.owner_npc_id ?? null)
      || actual.owner_character_id !== (ownership.owner_character_id ?? null)
      || canonicalDigest(actual.owner_external_ref)
        !== canonicalDigest(ownership.owner_external_ref ?? null)
      || actual.controller_npc_id !== (ownership.controller_npc_id ?? null)
      || actual.controller_character_id
        !== (ownership.controller_character_id ?? null)
      || actual.claim_state !== ownership.claim_state) fail();
}

function fail() { throw phase2IntegrityError(); }
