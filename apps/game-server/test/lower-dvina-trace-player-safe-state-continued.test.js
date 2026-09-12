import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { richCommittedState } from
  './lower-dvina-trace-player-safe-state-fixture.js';

test('nested hidden states and secret children of open containers stay private', () => {
  const committedState = richCommittedState();
  committedState.items = [{
    item_id: 'open-box',
    visible: true,
    open_state: 'open',
    access_state: { access: 'open' },
    contents: [
      { item_id: 'visible-child' },
      {
        item_id: 'secret-inline-child',
        visibility_state: { visibility: 'concealed_requires_search' }
      }
    ]
  }, {
    item_id: 'opaque-box',
    visible: true,
    open_state: 'open',
    contents_opaque: true,
    contents: [{ item_id: 'opaque-secret-child' }]
  }, {
    item_id: 'visible-child',
    visible: true,
    placement: { container_id: 'open-box' }
  }, {
    item_id: 'secret-normalized-child',
    visible: true,
    visibility_state: { visibility: 'secret' },
    placement: { container_id: 'open-box' }
  }, {
    item_id: 'nested-hidden-object',
    visible: true,
    state: {
      visibility_state: { state: 'hidden' }
    },
    placement: { location_ref: 'shed' }
  }];

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.player_safe_state.items.map(({ item_id: id }) => id),
    ['open-box', 'opaque-box', 'visible-child']);
  assert.deepEqual(result.player_safe_state.items[0].contents,
    [{ item_id: 'visible-child' }]);
  assert.equal(serialized.includes('secret-inline-child'), false);
  assert.equal(serialized.includes('opaque-secret-child'), false);
  assert.equal(serialized.includes('secret-normalized-child'), false);
  assert.equal(serialized.includes('nested-hidden-object'), false);
});

test('attached items inherit visibility only through the current host and cycles reject', () => {
  const committedState = richCommittedState();
  committedState.items = [{
    item_id: 'visible-host',
    visible: true,
    placement: { location_ref: 'shed' }
  }, {
    item_id: 'visible-attachment',
    visible: true,
    placement: { attached_item_id: 'visible-host' }
  }, {
    item_id: 'remote-host',
    visible: true,
    placement: { location_ref: 'elsewhere' }
  }, {
    item_id: 'remote-attachment',
    visible: true,
    placement: { attached_item_id: 'remote-host' }
  }, {
    item_id: 'cycle-a',
    visible: true,
    placement: { attached_item_id: 'cycle-b' }
  }, {
    item_id: 'cycle-b',
    visible: true,
    placement: { attached_item_id: 'cycle-a' }
  }];

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.deepEqual(result.player_safe_state.items.map(({ item_id: id }) => id),
    ['visible-host', 'visible-attachment']);
  assert.equal(JSON.stringify(result).includes('remote-attachment'), false);
  assert.equal(JSON.stringify(result).includes('cycle-a'), false);
});

test('working projection cannot inject ungrounded committed refs or contents', () => {
  const committedState = richCommittedState();

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: {
      items: [{
        item_id: 'invented-box',
        open_state: 'open',
        contents: [{ item_id: 'secret-child' }]
      }],
      visible_npcs: ['invented-npc'],
      knowledge: ['invented-fact'],
      routes: [{ route_id: 'invented-route' }]
    },
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
});

test('code-owned authority admits only its exact working projection', () => {
  const committedState = richCommittedState();
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const working = structuredClone(initial.player_safe_state);
  working.items.push({
    item_id: 'direct-result',
    placement: { holder_character_id: 'mikula' },
    state: { condition_state: 'serviceable' }
  });
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const admitted = authority.admit(working);

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: admitted,
    working_projection_authority: authority,
    actor_id: 'mikula'
  });

  assert.equal(result.player_safe_state.items.at(-1).item_id,
    'direct-result');
  assert.equal(Object.isFrozen(admitted), true);
  assert.notEqual(admitted, working);
  assert.equal(JSON.stringify(authority), '{}');
  assert.doesNotThrow(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: structuredClone(admitted),
    working_projection_authority: authority,
    actor_id: 'mikula'
  }));
  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: structuredClone(admitted),
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
});

test('internal perception work survives the chain without entering player-safe state', () => {
  const committedState = richCommittedState();
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const working = {
    ...structuredClone(initial.player_safe_state),
    perception_boundary_work_items: [{ private_npc_context: 'hidden' }],
    npc_decision_signal_descriptors: [{ private_npc_intent: 'hidden' }],
    pending_npc_decision_request: { private_candidates: ['hidden'] }
  };

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: working,
    actor_id: 'mikula'
  });

  assert.equal(Object.hasOwn(result.player_safe_state,
    'perception_boundary_work_items'), false);
  assert.equal(Object.hasOwn(result.player_safe_state,
    'npc_decision_signal_descriptors'), false);
  assert.equal(Object.hasOwn(result.player_safe_state,
    'pending_npc_decision_request'), false);
});

test('working projection authority is identity-bound and mutation-safe', () => {
  const committedState = richCommittedState();
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const working = structuredClone(initial.player_safe_state);
  working.items.push({
    item_id: 'direct-result',
    placement: { holder_character_id: 'mikula' }
  });
  const authorityA = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const authorityB = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  authorityA.admit(working);

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: working,
    working_projection_authority: authorityB,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });

  working.items.push({
    item_id: 'post-admission-mutation',
    placement: { holder_character_id: 'mikula' }
  });
  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: working,
    working_projection_authority: authorityA,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
});

test('working authority does not weaken scalar or container visibility rules', () => {
  const committedState = richCommittedState();
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const hiddenScalar = structuredClone(initial.player_safe_state);
  hiddenScalar.items[0].state = {
    property_state: { hidden_truth: 'must-reject' }
  };

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: authority.admit(hiddenScalar),
    working_projection_authority: authority,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });

  const closedContainer = structuredClone(initial.player_safe_state);
  closedContainer.items.push({
    item_id: 'new-closed-box',
    open_state: 'closed',
    contents_state: 'unknown',
    placement: { holder_character_id: 'mikula' }
  }, {
    item_id: 'new-secret-child',
    placement: {
      container_id: 'new-closed-box',
      holder_character_id: 'mikula'
    }
  });
  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: authority.admit(closedContainer),
    working_projection_authority: authority,
    actor_id: 'mikula'
  });
  assert.equal(result.player_safe_state.items.some(({ item_id: id }) =>
    id === 'new-closed-box'), true);
  assert.equal(JSON.stringify(result).includes('new-secret-child'), false);
});

test('nested scalar records retain only their explicit player-safe keys', () => {
  const committedState = richCommittedState();
  committedState.items[0].state = {
    property_state: {
      owner_ref: 'mikula',
      holder_ref: 'mikula',
      hidden_truth: 'must-not-project'
    }
  };
  committedState.clock_weather_light.weather = {
    precipitation: 'rain',
    hidden_seed: 'must-not-project'
  };

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.deepEqual(result.player_safe_state.items[0].state.property_state, {
    owner_ref: 'mikula', holder_ref: 'mikula'
  });
  assert.deepEqual(result.player_safe_state.clock_weather_light.weather, {
    precipitation: 'rain'
  });
  assert.equal(JSON.stringify(result).includes('must-not-project'), false);

  const working = structuredClone(result.player_safe_state);
  working.items[0].state.property_state.hidden_truth = 'must-reject';
  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: working,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
});

test('real revision 13 NPC mechanics project from canonical machine_state',
  async () => {
    const bundle13 = await loadScenarioBundle(13);
    const f = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13
    });
    const shed = f.state.prepared_scenes.find(({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_old_drying_shed');
    f.state.position = {
      ...f.state.position,
      location_ref: shed.location_profile_ref,
      g5_node_id: shed.node.instance_id,
      g5_anchor_id: shed.anchor.instance_id
    };

    const result = projectLowerDvinaTracePlayerSafeState({
      committed_state: f.state,
      actor_id: f.state.actor_id
    });
    const bySlot = new Map(result.player_safe_state.npcs.map((npc) => [
      npc.participant_slot_ref, npc
    ]));

    assert.equal(bySlot.get('onisim_boatman').body_condition,
      'injured_unable_to_walk');
    assert.equal(bySlot.get('ratsha_storehouse_helper').surrender_state,
      'not_surrendered');
    assert.equal(bySlot.get('ratsha_storehouse_helper').restraint_state,
      'not_restrained');
  });

test('missing committed actor ownership fails closed', () => {
  const committedState = richCommittedState();
  delete committedState.actor_id;

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_PROJECTION_ACTOR_MISMATCH' });
});

function preparedScene(locationRef, nodeId, anchorId, entryRouteRef) {
  return {
    location_profile_ref: locationRef,
    ...(entryRouteRef ? { entry_route_ref: entryRouteRef } : {}),
    node: { instance_id: nodeId },
    anchor: { instance_id: anchorId }
  };
}
