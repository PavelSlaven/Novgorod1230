import assert from 'node:assert/strict';
import test from 'node:test';
import { planApprovedPropertyTransition } from '../src/index.js';

const refs = {
  player_clerk: 'player-1',
  zhdanko_storehouse_controller: 'npc-zhdanko',
  trace_ld_v1_external_owner_savva_tverdich: 'external:savva'
};

test('approved property owner transfers container control without changing owner', () => {
  const result = planApprovedPropertyTransition({
    party_id: 'party-1',
    state_version: 7,
    expected_state_version: 7,
    subject: {
      container_id: 'bag-1',
      template_id: 'bag-template',
      holder_npc_id: 'npc-zhdanko',
      controller_npc_id: 'npc-zhdanko',
      owner_external_ref: 'external:savva',
      state: { location_ref: 'storehouse', zone_ref: 'yard' }
    },
    approved_transition: {
      transition_profile_id: 'recover-bag',
      owner: '@rus/items-property',
      subject_ref: 'bag-template',
      owner_change: 'forbidden',
      admission_variants: [{ variant_id: 'after-restraint',
        requires_committed_fact: 'bag-recovery-admitted',
        source_holder_ref: 'zhdanko_storehouse_controller',
        source_controller_ref: 'zhdanko_storehouse_controller' }],
      variant_selection_policy:
        'select_exactly_one_variant_from_committed_facts_and_source_state',
      requires_common: { owner_ref:
        'trace_ld_v1_external_owner_savva_tverdich',
      location_ref: 'storehouse' },
      writes: { holder_ref: 'player_clerk', controller_ref: 'player_clerk',
        position_transition: 'preserve_committed_location_and_zone' }
    },
    committed_fact_ids: ['bag-recovery-admitted'],
    resolved_actor_refs: refs
  });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.equal(result.proposal.subject_kind, 'container');
  assert.equal(result.proposal.next.owner_external_ref, 'external:savva');
  assert.equal(result.proposal.next.holder_character_id, 'player-1');
  assert.equal(result.proposal.next.controller_character_id, 'player-1');
  assert.equal(result.proposal.next.physical_position, 'hands');
  assert.equal(result.proposal.next.state.location_ref, 'storehouse');
});

test('approved property owner extracts a sealed item but preserves owner and seal', () => {
  const result = planApprovedPropertyTransition({
    party_id: 'party-1', state_version: 8, expected_state_version: 8,
    subject: { item_id: 'packet-1', template_id: 'packet-template',
      placement: { container_id: 'bag-1' },
      ownership: { owner_external_ref: 'external:savva',
        controller_npc_id: 'npc-zhdanko' },
      state: { seal_state: 'intact', document_contents_state: 'sealed' } },
    parent_container: { container_id: 'bag-1', template_id: 'bag-template',
      closure_state: 'open', holder_character_id: 'player-1',
      controller_character_id: 'player-1' },
    approved_transition: { transition_profile_id: 'recover-packet',
      owner: '@rus/items-property', subject_ref: 'packet-template',
      owner_change: 'forbidden',
      requires: { physical_parent_ref: 'bag-template',
        parent_closure_state: 'open', parent_holder_ref: 'player_clerk',
        parent_controller_ref: 'player_clerk', seal_state: 'intact' },
      writes: { physical_parent_ref: null, holder_ref: 'player_clerk',
        controller_ref: 'player_clerk',
        position_derivation: 'held_by_player_at_committed_bag_zone',
        seal_state: 'preserve_committed' },
      container_relation_change: 'exact_remove_from_road_bag_only' },
    committed_fact_ids: [], resolved_actor_refs: refs
  });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.equal(result.proposal.subject_kind, 'item');
  assert.equal(result.proposal.next.placement.container_id, null);
  assert.equal(result.proposal.next.placement.holder_character_id, 'player-1');
  assert.equal(result.proposal.next.ownership.owner_external_ref,
    'external:savva');
  assert.equal(result.proposal.next.state.seal_state, 'intact');
  assert.equal(result.proposal.next.state.document_contents_state, 'sealed');
});

test('approved property owner opens only a controlled committed container', () => {
  const result = planApprovedPropertyTransition({
    state_version: 8, expected_state_version: 8,
    actor_ref: 'player_clerk', resolved_actor_refs: refs,
    subject: { container_id: 'bag-1', template_id: 'bag-template',
      holder_character_id: 'player-1', controller_character_id: 'player-1',
      closure_state: 'tied', state: { owner_external_ref: 'external:savva' } },
    approved_transition: { transition_profile_id: 'open-bag',
      owner: '@rus/items-property', subject_ref: 'bag-template',
      requires: { closure_state: 'tied',
        holder_ref_rule: 'bound_actor_is_committed_holder',
        controller_ref_rule: 'bound_actor_is_committed_controller' },
      writes: { closure_state: 'open', content_access_state:
        'physically_accessible_to_bound_controller' },
      owner_change: 'forbidden', holder_change: 'forbidden',
      controller_change: 'forbidden' }
  });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.equal(result.proposal.next.closure_state, 'open');
  assert.equal(result.proposal.next.contents_state, 'visible_if_materialized');
  assert.equal(result.proposal.next.state.owner_external_ref, 'external:savva');
});

test('approved property owner fails closed on stale state and mismatched facts', () => {
  const base = { party_id: 'party-1', state_version: 2,
    expected_state_version: 1, subject: {}, approved_transition: {},
    committed_fact_ids: [], resolved_actor_refs: refs };
  assert.equal(planApprovedPropertyTransition(base).pass, false);
  const noFact = planApprovedPropertyTransition({ ...base,
    expected_state_version: 2,
    subject: { container_id: 'bag-1', template_id: 'bag-template',
      holder_npc_id: 'npc-zhdanko', controller_npc_id: 'npc-zhdanko',
      owner_external_ref: 'external:savva', state: {
        location_ref: 'storehouse' } },
    approved_transition: { transition_profile_id: 'recover-bag',
      owner: '@rus/items-property', subject_ref: 'bag-template',
      owner_change: 'forbidden', admission_variants: [{ variant_id: 'v',
        requires_committed_fact: 'required',
        source_holder_ref: 'zhdanko_storehouse_controller',
        source_controller_ref: 'zhdanko_storehouse_controller' }],
      variant_selection_policy:
        'select_exactly_one_variant_from_committed_facts_and_source_state',
      requires_common: { owner_ref:
        'trace_ld_v1_external_owner_savva_tverdich',
      location_ref: 'storehouse' },
      writes: { holder_ref: 'player_clerk', controller_ref: 'player_clerk',
        position_transition: 'preserve_committed_location_and_zone' } } });
  assert.equal(noFact.pass, false);
});
