import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendPhase4ActivityExecution } from './lower-dvina-trace-phase-4-activity-writes.js';
import { appendPhase3MovementTraversal } from './lower-dvina-trace-phase-3-movement-writes.js';

export function appendTemporaryDisposition({ updates, appends, partyId, state, next, factual, turnNumber, changeSetId, idemId, contracts }) {
  const priorNpcs = new Map((state.npcs ?? []).map((npc) => [npc.instance_id, npc]));
  for (const npc of (next.npcs ?? []).filter(
    (candidate) =>
      ['ratsha_storehouse_helper', 'zhdanko_storehouse_controller'].includes(candidate.participant_slot_ref) &&
      canonicalDigest(priorNpcs.get(candidate.instance_id)?.machine_state) !== canonicalDigest(candidate.machine_state),
  )) {
    updates.push(
      row('party_npcs', npc.instance_id, {
        party_id: partyId,
        npc_id: npc.instance_id,
        anchor_id: legacyNpcAnchor(state, npc),
        machine_state: structuredClone(npc.machine_state),
      }),
    );
  }
  const packet = next.items.find(({ item_id: id }) => id === contracts.packet.item_id);
  if (packet == null) throw new Error('TRACE_PHASE_9_PACKET_MISSING');
  updates.push(
    row('party_items', packet.item_id, {
      party_id: partyId,
      item_id: packet.item_id,
      quantity: packet.quantity,
      condition_state: packet.condition_state,
      legal_status: packet.legal_status,
      state: structuredClone(packet.state),
    }),
  );
  const prior = state.promise_instances?.[0];
  const promise = next.promise_instances?.[0];
  if (prior != null && promise != null) {
    updates.push(
      row('party_obligations', promise.obligation_id, {
        obligation_id: promise.obligation_id,
        party_id: partyId,
        policy_ref: structuredClone(promise.policy_ref),
        policy_version: promise.policy_version,
        promisor_ref: {
          entity_kind: 'player_character',
          entity_id: promise.promisor_actor_id,
        },
        beneficiary_ref: {
          entity_kind: 'npc',
          entity_id: promise.beneficiary_actor_id,
        },
        witness_refs: promise.witness_actor_ids.map((id) => ({
          entity_kind: 'npc',
          entity_id: id,
        })),
        scope_snapshot: structuredClone(promise.scope_snapshot),
        current_state: promise.current_state,
        current_state_fact: promise.current_state_fact,
        state_version: promise.state_version,
        created_change_set_id: promise.created_change_set_id,
        last_change_set_id: changeSetId,
      }),
    );
    const lifecycle = next.phase9.promise_outcome?.transition ?? null;
    const transitionRow = ({ ordinal, from, to, kind, causalBasis }) =>
      row('party_obligation_transitions', `${promise.obligation_id}:${ordinal}`, {
        obligation_transition_id: `${promise.obligation_id}:${ordinal}`,
        party_id: partyId,
        obligation_id: promise.obligation_id,
        transition_ordinal: ordinal,
        from_state: from,
        to_state: to,
        transition_kind: kind,
        causal_basis: causalBasis,
        witness_snapshot: promise.witness_actor_ids.map((id) => ({
          entity_kind: 'npc',
          entity_id: id,
        })),
        activity_execution_id: `activity:${partyId}:trace-phase9:${turnNumber}:temporary_disposition`,
        check_resolution_id: null,
        npc_decision_request_id: null,
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        occurred_at_turn: turnNumber,
        occurred_at_whole_minutes: factual.time_update.clock_after.whole_minutes,
        occurred_at_subminute_numerator: factual.time_update.clock_after.subminute_numerator,
        occurred_at_subminute_denominator: factual.time_update.clock_after.subminute_denominator,
      });
    const firstOrdinal = Number(prior.state_version) - 1;
    if (lifecycle != null) {
      appends.push(
        transitionRow({
          ordinal: firstOrdinal,
          from: prior.current_state,
          to: promise.current_state,
          kind: lifecycle.history_event.fact_id,
          causalBasis: structuredClone(lifecycle.causal_basis),
        }),
      );
    }
    const memoryOrdinal = firstOrdinal + (lifecycle == null ? 0 : 1);
    appends.push(
      transitionRow({
        ordinal: memoryOrdinal,
        from: promise.current_state,
        to: promise.current_state,
        kind: 'temporary_disposition_promise_memory_recorded',
        causalBasis: {
          committed_fact_ids: [promise.temporary_disposition_memory.committed_fact_id],
        },
      }),
    );
  }
}

export function appendActivity({ inserts, updates, appends, partyId, state, next, factual, turnNumber, changeSetId, idemId, contracts }) {
  const kind = factual.consequence.phase9_kind;
  const activityRef = phase9ActivityRef(kind, contracts);
  appendPhase4ActivityExecution({
    inserts,
    updates,
    appends,
    partyId,
    state,
    factual,
    next,
    root: {
      activity_ref: activityRef,
      duration_minutes: factual.consequence.duration_minutes,
    },
    id: `activity:${partyId}:trace-phase9:${turnNumber}:${kind}`,
    seriesOrdinal: 0,
    activitySeriesId: `series:${partyId}:trace-phase9:${turnNumber}`,
    attemptOrdinal: 0,
    turnNumber,
    changeSetId,
    idemId,
  });
}

export function phase9ActivityRef(kind, contracts) {
  return kind === 'return_to_camp'
    ? contracts.activities.return.profile_id
    : kind === 'onisim_testimony'
      ? contracts.binding.onisim_testimony.activity_profile.profile_id
      : kind === 'temporary_disposition'
        ? contracts.activities.disposition.profile_id
        : contracts.activities.inspect.profile_id;
}

export function appendPacket({ updates, partyId, next, phase9 }) {
  const item = next.items.find(({ item_id: id }) => id === phase9.property_transition.subject_id);
  updates.push(
    row('party_items', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      state: item.state,
    }),
    row('party_item_placements', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      anchor_id: item.placement.anchor_id ?? null,
      container_id: item.placement.container_id ?? null,
      holder_npc_id: item.placement.holder_npc_id ?? null,
      holder_character_id: item.placement.holder_character_id ?? null,
      physical_position: item.placement.physical_position ?? null,
      equipment_slot_category_id: null,
      attached_item_id: null,
    }),
    row('party_ownership', item.ownership.ownership_id ?? item.item_id, {
      party_id: partyId,
      ownership_id: item.ownership.ownership_id ?? item.item_id,
      item_id: item.item_id,
      container_id: null,
      owner_npc_id: item.ownership.owner_npc_id ?? null,
      owner_character_id: item.ownership.owner_character_id ?? null,
      owner_party: item.ownership.owner_party === true,
      owner_external_ref: item.ownership.owner_external_ref ?? null,
      controller_npc_id: item.ownership.controller_npc_id ?? null,
      controller_character_id: item.ownership.controller_character_id ?? null,
      claim_state: item.ownership.claim_state,
    }),
  );
}

export function appendMovement(input) {
  const { inserts, updates, appends, partyId, state, next, factual, turnNumber, changeSetId, idemId, contracts } = input;
  if (!usesPreparedFirstEntry(state, next.position)) {
    updates.push(
      row('party_positions', partyId, {
        party_id: partyId,
        g4_id: next.position.g4_id,
        g5_node_id: next.position.g5_node_id,
        g5_anchor_id: next.position.g5_anchor_id,
      }),
    );
  }
  const proxy = {
    ...factual,
    consequence: {
      ...factual.consequence,
      movement: factual.consequence.phase9.movement,
    },
  };
  appendPhase3MovementTraversal({
    inserts,
    updates,
    appends,
    state,
    factual: proxy,
    partyId,
    turnNumber,
    changeSetId,
    idemId,
    phase3Contracts: { route: contracts.route },
  });
  for (const npcId of factual.consequence.phase9.movement.participants.slice(1)) {
    const npc = next.npcs.find(({ instance_id: id }) => id === npcId);
    if (npc)
      updates.push(
        row('party_npcs', npcId, {
          party_id: partyId,
          npc_id: npcId,
          anchor_id: legacyNpcAnchor(state, npc),
          machine_state: npc.machine_state,
        }),
      );
  }
}

function legacyNpcAnchor(state, npc) {
  const firstEntry = state.first_entry_preparation;
  return usesPreparedFirstEntry(state, npc) ? null : npc.anchor_id;
}

function usesPreparedFirstEntry(state, position) {
  const firstEntry = state.first_entry_preparation;
  return firstEntry?.spatial_v3?.target?.status === 'prepared' && (position?.g5_anchor_id ?? position?.anchor_id) === firstEntry.scene?.anchor?.instance_id;
}
