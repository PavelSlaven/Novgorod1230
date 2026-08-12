import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPhase9NormalizedRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-9-read.js';
import { assertPhase4SemanticPromiseAndSurrender } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-read-obligation.js';

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

test('Phase 9 restart accepts terminal promise recognition without transition',
  async () => {
    const payload = fixturePayload();
    const promise = payload.promise_instances[0];
    Object.assign(promise, { current_state: 'broken',
      current_state_fact: 'promise_current_broken', state_version: 5 });
    payload.phase9.promise_outcome = { kind: 'terminal_state_recognized',
      transition: null, recognized_current_state: 'broken',
      basis_fact_id: null };
    payload.phase9.promise_memory.option_id = 'recognize_broken_promise';
    promise.temporary_disposition_memory = structuredClone(
      payload.phase9.promise_memory);
    await assert.doesNotReject(() => assertPhase9NormalizedRows(
      poolFor(payload, { terminalRecognition: true }), payload));
  });

test('Phase 4 semantic read keeps activation history after promise fulfillment',
  () => {
    const promise = terminalPromiseFixture();
    const statementRef = (id) => ({
      entity_kind: 'conversation_statement', entity_id: id
    });
    const commitment = {
      schema: 'party_local_commitment_proposal_v1', status: 'active',
      policy_ref: { entity_kind: 'promise_policy', entity_id: 'policy-1' },
      parties: { promisor_ref: { entity_kind: 'player_character',
        entity_id: 'player-1' }, beneficiary_refs: [{ entity_kind: 'npc',
        entity_id: 'ratsha-1' }] }, witness_refs: [{ entity_kind: 'npc',
        entity_id: 'eremey-1' }], terms: { obligation_summary: 'protect',
        conditions: ['return'] }, offer_statement_refs: [statementRef('offer')],
      acceptance_statement_refs: [statementRef('accept')],
      causal_statement_refs: [statementRef('offer'), statementRef('accept')]
    };
    const entry = { turn_number: 7, consequence: { negotiation: {
      participating_fisher_id: 'fisher-1',
      semantic_exchange_projection: { request_id: 'request-1', commitment,
        surrender: { fact_id:
          'ratsha_surrender_without_further_harm_committed',
        source_statement_ref: statementRef('accept') },
      knife_transition_eligibility: { eligible: true } } } } };
    assert.doesNotThrow(() => assertPhase4SemanticPromiseAndSurrender({
      payload: { promise_instances: [promise], ratsha_surrendered: true,
        conversation_statements: [
          { statement_id: 'offer' }, { statement_id: 'accept' }
        ], npcs: [{ instance_id: 'ratsha-1',
          participant_slot_ref: 'ratsha_storehouse_helper' }], items: [{
          template_id: 'trace_ld_v1_item_ratsha_knife',
          placement: { physical_position: 'belt' }, state: { sharp: true }
        }] }, negotiationHistory: [entry], obligations: [{
        obligation_id: promise.obligation_id, policy_ref: promise.policy_ref,
        policy_version: promise.policy_version, promisor_ref: {
          entity_id: promise.promisor_actor_id }, beneficiary_ref: {
          entity_id: promise.beneficiary_actor_id }, witness_refs: [{
          entity_id: 'eremey-1' }], scope_snapshot: promise.scope_snapshot,
        current_state: promise.current_state,
        current_state_fact: promise.current_state_fact,
        state_version: promise.state_version,
        created_change_set_id: promise.created_change_set_id,
        last_change_set_id: promise.last_change_set_id
      }], transitions: terminalPromiseTransitions(promise), knife: { rows: [{
        holder_npc_id: 'fisher-1', holder_character_id: null,
        physical_position: 'belt', owner_npc_id: 'ratsha-1',
        owner_character_id: null, controller_npc_id: 'fisher-1',
        controller_character_id: null, state: { sharp: true }
      }], rowCount: 1 }, npcTransitions: [{ npc_id: 'ratsha-1',
        transition_kind: 'surrendered_without_further_harm', machine_state: {
          surrender_state: 'surrendered_without_further_harm' },
        semantic_state: { surrender_fact:
          'ratsha_surrender_without_further_harm_committed' } }], knowledge: [{
        fact_id: 'ratsha_surrender_without_further_harm_committed',
        knowledge_state: 'known_from_committed_source',
        evidence: ['request-1'] }, {
        fact_id: 'promise_activation_basis_committed'
      }]
    }));
  });

function fixturePayload() {
  return { party_id: 'party-1', completion_candidate: undefined,
    phase9: { status: 'temporary_disposition_committed', checkpoints: [
      { kind: 'bag_recovery' }, { kind: 'packet_recovered' }],
    temporary_disposition: { legal_effect: 'temporary_disposition_only',
      completion: 'forbidden' }, custody_state: {
      schema: 'temporary_custody_state_v1', option_id: 'hold-both',
      status: 'temporary', party_slots: ['ratsha_storehouse_helper'],
      committed_fact_id: 'custody-fact' }, property_handover_plan: {
      schema: 'temporary_property_handover_plan_v1', option_id: 'preserve',
      status: 'temporary', owner_must_remain: 'savva',
      property_mutation: null, committed_fact_id: 'property-fact' },
    promise_memory: { schema: 'temporary_promise_memory_v1',
      option_id: 'preserve-promise', status: 'recorded', scope: 'scope',
      committed_fact_id: 'promise-fact' }, promise_outcome: {
      kind: 'lifecycle_transition',
      basis_fact_id: 'promise_fulfillment_basis_committed',
      recognized_current_state: null, transition: {
        history_event: { fact_id: 'promise_fulfilled' },
        causal_basis: { committed_fact_ids: [
          'promise_fulfillment_basis_committed'] },
        current_state_projection: {
          next_fact: 'promise_current_fulfilled' } } }, committed_facts: [
      'promise_fulfillment_basis_committed'] }, npcs: [{ instance_id: 'ratsha-1',
      participant_slot_ref: 'ratsha_storehouse_helper', machine_state: {
        temporary_custody: true, temporary_custody_state: {
          schema: 'temporary_custody_state_v1', option_id: 'hold-both',
          status: 'temporary', party_slots: ['ratsha_storehouse_helper'],
          committed_fact_id: 'custody-fact' } } }],
  promise_instances: [{ obligation_id: 'promise-1', current_state: 'fulfilled',
    current_state_fact: 'promise_current_fulfilled', state_version: 5,
    last_change_set_id: 'change-memory',
    temporary_disposition_memory: {
    schema: 'temporary_promise_memory_v1', option_id: 'preserve-promise',
    status: 'recorded', scope: 'scope', committed_fact_id: 'promise-fact' } }],
  containers: [{ container_id: 'bag-1',
      template_id: 'trace_ld_v1_container_road_bag', anchor_id: null,
      parent_container_id: null, holder_npc_id: null,
      holder_character_id: 'player-1', physical_position: 'hands',
      closure_state: 'open', state_version: 3,
      state: { owner_external_ref: 'savva', closure_state: 'open' } }],
  items: [{ item_id: 'packet-1',
    template_id: 'trace_ld_v1_item_sealed_packet', quantity: 1,
    condition_state: 'sealed_intact', legal_status: 'entrusted_service_item',
    state: { seal_state: 'intact', document_contents_access: 'forbidden',
      property_state: { temporary_handover_plan: {
        schema: 'temporary_property_handover_plan_v1', option_id: 'preserve',
        status: 'temporary', owner_must_remain: 'savva',
        property_mutation: null, committed_fact_id: 'property-fact' } } },
    placement: { anchor_id: null, container_id: null, holder_npc_id: null,
      holder_character_id: 'player-1', physical_position: 'hands' },
    ownership: { ownership_id: 'ownership-packet-1', owner_npc_id: null,
      owner_character_id: null, owner_external_ref: { entity_kind:
        'external_owner', entity_id: 'savva' }, controller_npc_id: null,
      controller_character_id: 'player-1', claim_state: 'entrusted' } }] };
}

function terminalPromiseFixture() {
  return { obligation_id: 'promise-1', policy_ref: { id: 'policy-1' },
    policy_version: 1, promisor_actor_id: 'player-1',
    beneficiary_actor_id: 'ratsha-1', witness_actor_ids: ['eremey-1'],
    scope_snapshot: { obligation: 'protect', conditions: ['return'] },
    current_state: 'fulfilled', current_state_fact: 'promise_current_fulfilled',
    state_version: 5, created_change_set_id: 'change-1',
    last_change_set_id: 'change-2', temporary_disposition_memory: {
      committed_fact_id: 'promise-memory' } };
}

function terminalPromiseTransitions(promise) {
  const common = { obligation_id: promise.obligation_id,
    witness_snapshot: [{ entity_id: 'eremey-1' }] };
  return [{ ...common, from_state: 'not_offered', to_state: 'offered',
    transition_kind: 'promise_offered', causal_basis: { committed_fact_ids: [
      'promisor_offer_committed', 'required_witnesses_present'
    ] }, check_resolution_id: null, npc_decision_request_id: null },
  { ...common, from_state: 'offered', to_state: 'active',
    transition_kind: 'promise_activated', causal_basis: {
      committed_fact_ids: ['promise_activation_basis_committed'] },
    check_resolution_id: 'check:7', npc_decision_request_id: 'request-1' },
  { ...common, from_state: 'active', to_state: 'fulfilled',
    transition_kind: 'promise_fulfilled', causal_basis: {
      committed_fact_ids: ['promise_fulfillment_basis_committed'] },
    check_resolution_id: null, npc_decision_request_id: null },
  { ...common, transition_ordinal: 3, from_state: 'fulfilled',
    to_state: 'fulfilled', transition_kind:
      'temporary_disposition_promise_memory_recorded', causal_basis: {
      committed_fact_ids: ['promise-memory'] }, check_resolution_id: null,
    npc_decision_request_id: null }];
}

function poolFor(payload, { packetHolder = 'player-1',
  terminalRecognition = false } = {}) {
  return { async query(sql) {
    if (sql.includes('party_obligations o')) {
      if (terminalRecognition) return { rowCount: 1, rows: [{
        state_version: '5', last_change_set_id: 'change-memory',
        transition_ordinal: 3, from_state: 'broken', to_state: 'broken',
        transition_kind: 'temporary_disposition_promise_memory_recorded',
        causal_basis: { committed_fact_ids: ['promise-fact'] } }] };
      return { rowCount: 2, rows: [{ state_version: '5',
        last_change_set_id: 'change-memory', transition_ordinal: 3,
        from_state: 'fulfilled', to_state: 'fulfilled', transition_kind:
          'temporary_disposition_promise_memory_recorded', causal_basis: {
          committed_fact_ids: ['promise-fact'] } }, { state_version: '5',
        last_change_set_id: 'change-memory', transition_ordinal: 2,
        from_state: 'active', to_state: 'fulfilled', transition_kind:
          'promise_fulfilled', causal_basis: { committed_fact_ids: [
            'promise_fulfillment_basis_committed'] } }] };
    }
    if (sql.includes('party_npcs')) {
      const npc = payload.npcs[0];
      return { rowCount: 1, rows: [{ npc_id: npc.instance_id,
        machine_state: structuredClone(npc.machine_state) }] };
    }
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
