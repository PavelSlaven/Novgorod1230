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
  if (payload.phase9.status === 'temporary_disposition_committed') {
    await assertTemporaryDisposition(pool, payload, packet);
  }
}

async function assertTemporaryDisposition(pool, payload, packet) {
  const custody = payload.phase9.custody_state;
  const property = payload.phase9.property_handover_plan;
  const promiseMemory = payload.phase9.promise_memory;
  const promiseOutcome = payload.phase9.promise_outcome;
  const held = (payload.npcs ?? []).filter(
    ({ machine_state: state }) => state?.temporary_custody === true);
  if (custody?.schema !== 'temporary_custody_state_v1'
      || custody.status !== 'temporary'
      || property?.schema !== 'temporary_property_handover_plan_v1'
      || property.status !== 'temporary'
      || promiseMemory?.schema !== 'temporary_promise_memory_v1'
      || promiseMemory.status !== 'recorded'
      || !['no_active_promise', 'terminal_state_recognized',
        'lifecycle_transition'].includes(promiseOutcome?.kind)
      || canonicalDigest(held.map(({ participant_slot_ref: slot }) => slot)
        .sort()) !== canonicalDigest([...custody.party_slots].sort())
      || canonicalDigest(packet.state?.property_state
        ?.temporary_handover_plan) !== canonicalDigest(property)
      || ((payload.promise_instances ?? []).length > 0
        && !payload.promise_instances.some((promise) => canonicalDigest(
          promise.temporary_disposition_memory)
          === canonicalDigest(promiseMemory)))) fail();
  const ids = held.map(({ instance_id: id }) => id).sort();
  const result = await pool.query(
    `SELECT npc_id,machine_state
       FROM party_runtime.party_npcs
      WHERE party_id=$1 AND npc_id = ANY($2::text[])
      ORDER BY npc_id`, [payload.party_id, ids]);
  if (result.rowCount !== ids.length
      || result.rows.some((row, index) => row.npc_id !== ids[index]
        || canonicalDigest(row.machine_state)
          !== canonicalDigest(held.find(
            ({ instance_id: id }) => id === row.npc_id)?.machine_state))) {
    fail();
  }
  if ((payload.promise_instances ?? []).length > 0) {
    const promise = payload.promise_instances.find((entry) => canonicalDigest(
      entry.temporary_disposition_memory) === canonicalDigest(promiseMemory));
    const normalized = await pool.query(
      `SELECT o.state_version::text,o.last_change_set_id,
              t.transition_ordinal,t.from_state,t.to_state,
              t.transition_kind,t.causal_basis
         FROM party_runtime.party_obligations o
         JOIN party_runtime.party_obligation_transitions t
           ON t.party_id=o.party_id AND t.obligation_id=o.obligation_id
        WHERE o.party_id=$1 AND o.obligation_id=$2
          AND t.change_set_id=o.last_change_set_id
        ORDER BY t.transition_ordinal DESC LIMIT 2`,
      [payload.party_id, promise?.obligation_id]);
    const memoryRow = normalized.rows[0];
    const lifecycle = promiseOutcome.transition ?? null;
    if (normalized.rowCount !== (lifecycle == null ? 1 : 2)
        || Number(memoryRow.state_version) !== Number(promise.state_version)
        || memoryRow.last_change_set_id !== promise.last_change_set_id
        || memoryRow.transition_ordinal !== Number(promise.state_version) - 2
        || memoryRow.from_state !== promise.current_state
        || memoryRow.to_state !== promise.current_state
        || memoryRow.transition_kind
          !== 'temporary_disposition_promise_memory_recorded'
        || canonicalDigest(memoryRow.causal_basis) !== canonicalDigest({
          committed_fact_ids: [promiseMemory.committed_fact_id] })) fail();
    if (lifecycle != null) {
      const lifecycleRow = normalized.rows[1];
      if (lifecycleRow.transition_ordinal
          !== Number(promise.state_version) - 3
          || lifecycleRow.from_state !== 'active'
          || lifecycleRow.to_state !== promise.current_state
          || lifecycleRow.transition_kind !== lifecycle.history_event.fact_id
          || canonicalDigest(lifecycleRow.causal_basis)
            !== canonicalDigest(lifecycle.causal_basis)
          || promise.current_state_fact
            !== lifecycle.current_state_projection.next_fact
          || !(payload.phase9.committed_facts ?? []).includes(
            promiseOutcome.basis_fact_id)) fail();
    }
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
