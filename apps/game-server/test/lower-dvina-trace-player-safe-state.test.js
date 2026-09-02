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

test('canonical NPC names stay hidden without player-safe acquisition', () => {
  const state = richCommittedState();
  state.npcs = [{ instance_id: 'unknown-npc', location_ref:
    state.position.location_ref, identity_state: {
      canonical_name: 'Скрытое каноническое имя'
    } }];
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(JSON.stringify(projected).includes(
    'Скрытое каноническое имя'), false);
});

test('NPC-held items require current perceptual evidence, not co-location', () => {
  const state = richCommittedState();
  state.items.push({ item_id: 'npc-knife', category_id: 'utility_knife',
    placement: { holder_npc_id: 'onisim', physical_position: 'worn_quick' } });
  state.current_visible_context = { visible_scene: 'Старая сушильня',
    visible_npc: [], visible_objects: [] };

  const hidden = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(JSON.stringify(hidden).includes('npc-knife'), false);

  state.current_visible_context.visible_npc.push({
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'мужчина'
  });
  const visible = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(visible.items.some(({ item_id: id }) => id === 'npc-knife'),
    true);
});

test('projects a committed player-safe item display name from item state', () => {
  const state = richCommittedState();
  state.items.push({ item_id: 'held-clue', placement: {
    holder_character_id: state.actor_id, physical_position: 'hands'
  }, state: { semantic_category: 'textile_clue',
    display_name: 'клочок окрашенной шерсти' } });
  const item = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: state.actor_id
  }).player_safe_state.items.find(({ item_id: id }) => id === 'held-clue');
  assert.equal(item.name, 'клочок окрашенной шерсти');
  assert.equal(item.state.display_name, 'клочок окрашенной шерсти');
});

test('combat projection does not disclose private NPC intents', () => {
  const committedState = richCommittedState();
  committedState.combat_sessions = [{ combat_id: 'combat-1',
    status: 'paused_for_player',
    scope_ref: { entity_kind: 'location', entity_id: 'shed' },
    participant_refs: [
      { entity_kind: 'player_character', entity_id: 'mikula' },
      { entity_kind: 'npc', entity_id: 'ratsha' }
    ], participant_states: [{ actor_ref: { entity_kind: 'player_character',
      entity_id: 'mikula' }, combat_status: 'active', current_intent: null },
    { actor_ref: { entity_kind: 'npc', entity_id: 'ratsha' },
      combat_status: 'active', current_intent: { intent_kind: 'engage',
        target_refs: [{ entity_kind: 'player_character', entity_id: 'mikula' }],
        force_limit: 'ordinary', risk_posture: 'reckless' } }],
    exchange_ordinal: 0, player_response_required: true }];
  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState, actor_id: 'mikula' });
  const serialized = JSON.stringify(result.player_safe_state.combat_sessions);
  assert.equal(serialized.includes('current_intent'), false);
  assert.equal(serialized.includes('engage'), false);
  assert.equal(serialized.includes('reckless'), false);
});

test('does not serialize hidden state or unknown closed contents', () => {
  const committedState = richCommittedState();
  const hiddenSentinel = 'HIDDEN_SENTINEL_MUST_NOT_SERIALIZE';
  committedState.relevant_hidden_state = { culprit: hiddenSentinel };
  committedState.materialization_trace = { result: hiddenSentinel };
  committedState.sealed_selections = [{ selected_id: hiddenSentinel }];
  committedState.policy_pins = { internal: hiddenSentinel };
  committedState.body_state.active_conditions = [{
    id: 'wet',
    status: 'active',
    source_body_profile_ref: { record_digest: hiddenSentinel }
  }];
  committedState.items[0].state = {
    condition: 'serviceable',
    hidden_truth: hiddenSentinel,
    private_motive: hiddenSentinel
  };
  committedState.items[2].contents = [{ item_id: hiddenSentinel }];
  committedState.npcs.push({
    instance_id: hiddenSentinel,
    anchor_id: 'shed-anchor',
    visibility_state: 'hidden'
  });
  committedState.npcs[0].knowledge_profile_snapshot = {
    allowed_categories: [hiddenSentinel]
  };
  committedState.npcs[0].profile_candidate_set_digest = hiddenSentinel;
  committedState.npcs[0].arbitrary_internal_field = hiddenSentinel;
  committedState.items.push({
    item_id: hiddenSentinel,
    placement: { location_ref: 'another-place' }
  });
  committedState.items.push({
    item_id: 'retired-runtime-history-row',
    visible: true,
    condition_state: 'retired',
    state: { lifecycle_status: 'retired' },
    placement: { holder_character_id: 'mikula' }
  });
  committedState.player_profile.inventory.items.push(
    hiddenSentinel,
    'retired-runtime-history-row'
  );
  committedState.routes.push({
    route_id: hiddenSentinel,
    knowledge_state: 'closed_until_disclosed'
  });
  committedState.knowledge.push({
    fact_id: hiddenSentinel,
    disclosure_state: 'private'
  });

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.equal(JSON.stringify(result).includes(hiddenSentinel), false);
  assert.equal('hidden_truth' in result.player_safe_state.items[0].state,
    false);
  assert.equal('contents' in result.player_safe_state.items[2], false);
  assert.equal(JSON.stringify(result).includes(
    'retired-runtime-history-row'), false);
});

test('returns detached deeply frozen JSON without mutating committed state', () => {
  const committedState = richCommittedState();
  const before = structuredClone(committedState);

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.deepEqual(committedState, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.actor.attributes.strength), true);
  assert.equal(Object.isFrozen(result.player_safe_state.items[0]), true);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  assert.throws(() => {
    result.actor.attributes.strength.value = 100;
  }, TypeError);
  assert.equal(committedState.player_profile.attributes.strength.value, 9);
});

test('projects only committed prepared destinations admitted by route knowledge', () => {
  const committedState = richCommittedState();
  committedState.position = {
    location_ref: 'wreck', g5_anchor_id: 'wreck-anchor'
  };
  committedState.prepared_scenes = [
    preparedScene('camp', 'camp-node', 'camp-anchor'),
    preparedScene('shed', 'shed-node', 'shed-anchor', 'camp-shed'),
    preparedScene('hidden-cave', 'cave-node', 'cave-anchor', 'secret-route')
  ];
  committedState.route_knowledge = ['shore-camp', 'camp-shed'];

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.deepEqual(result.player_safe_state.destination_refs, [
    'camp', 'shed'
  ]);
  assert.equal(JSON.stringify(result).includes('hidden-cave'), false);
  assert.equal(JSON.stringify(result).includes('secret-route'), false);
});

test('nested internal metadata never crosses a player-safe allowlist', () => {
  const committedState = richCommittedState();
  const hiddenSentinel = 'NESTED_INTERNAL_SENTINEL';
  committedState.player_profile.inventory.items = [{
    item_profile_candidate_id: hiddenSentinel,
    owner: 'mikula',
    holder: 'mikula',
    access: 'quick',
    weight: { grams: 400, source_profile_id: hiddenSentinel }
  }];
  committedState.visible_context.visible_objects = [{
    entity_ref: { entity_kind: 'item', entity_id: 'knife' },
    display_label: 'нож',
    metadata: { source_digest: hiddenSentinel }
  }];
  committedState.prepared_scenes = [{
    ...preparedScene('camp', 'camp-node', 'camp-anchor'),
    source_digest: hiddenSentinel,
    anchor: {
      instance_id: 'camp-anchor',
      state: { policy_internal: hiddenSentinel }
    }
  }];

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.equal(JSON.stringify(result).includes(hiddenSentinel), false);
  assert.deepEqual(result.player_safe_state.inventory.items, []);
  assert.deepEqual(result.player_safe_state.visible_context.visible_objects,
    [{
      entity_ref: { entity_kind: 'item', entity_id: 'knife' },
      display_label: 'нож'
    }]);
});

test('working projection updates safe state but not committed actor ownership', () => {
  const committedState = richCommittedState();
  committedState.position = {
    location_ref: 'wreck', g5_node_id: 'wreck-node',
    g5_anchor_id: 'wreck-anchor'
  };
  committedState.prepared_scenes = [
    preparedScene('camp', 'camp-node', 'camp-anchor')
  ];
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  const workingProjection = structuredClone(initial.player_safe_state);
  workingProjection.position = {
    location_ref: 'camp', g5_node_id: 'camp-node',
    g5_anchor_id: 'camp-anchor'
  };
  workingProjection.visible_context = {
    visible_scene: 'Микула уже в стане.',
    visible_changes: ['arrived-at-camp'],
    visible_npc: [],
    visible_objects: []
  };

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: workingProjection,
    actor_id: 'mikula'
  });

  assert.deepEqual(result.player_safe_state.position, {
    location_ref: 'camp', g5_node_id: 'camp-node',
    g5_anchor_id: 'camp-anchor'
  });
  assert.equal(result.player_safe_state.visible_context.visible_scene,
    'Микула уже в стане.');
  assert.deepEqual(result.player_safe_state.destination_refs, []);
  assert.equal(result.actor.attributes.strength.value, 9);
  assert.equal(Object.isFrozen(result.player_safe_state.position), true);
  workingProjection.position.location_ref = 'forged-after-projection';
  assert.equal(result.player_safe_state.position.location_ref, 'camp');
  assert.equal(committedState.position.location_ref, 'wreck');
});

test('working projection rejects unknown nested fields and invented positions', () => {
  const committedState = richCommittedState();
  committedState.prepared_scenes = [
    preparedScene('camp', 'camp-node', 'camp-anchor')
  ];

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: {
      visible_context: {
        visible_scene: 'Подмена',
        hidden_metadata: { secret: true }
      }
    },
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: {
      position: {
        location_ref: 'invented', g5_node_id: 'invented-node',
        g5_anchor_id: 'invented-anchor'
      }
    },
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_POSITION_INVALID' });
});

test('committed first-entry scene remains an admitted movement destination after transient status is stripped', () => {
  const committedState = richCommittedState();
  committedState.first_entry_preparation = {
    spatial_v3: { target: { scene_baseline_id: 'camp-baseline' } },
    scene: preparedScene('camp', 'camp-node', 'camp-anchor')
  };
  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: {
      position: {
        location_ref: 'camp', g5_node_id: 'camp-node',
        g5_anchor_id: 'camp-anchor'
      }
    },
    actor_id: 'mikula'
  });
  assert.equal(result.player_safe_state.position.location_ref, 'camp');
});

test('normalized children of closed containers never enter player-safe items', () => {
  const committedState = richCommittedState();
  committedState.items = [{
    item_id: 'closed-box',
    visible: true,
    open_state: 'closed',
    contents_state: 'unknown',
    placement: { holder_character_id: 'mikula' }
  }, {
    item_id: 'secret-child',
    template_id: 'secret-template',
    placement: {
      container_id: 'closed-box',
      holder_character_id: 'mikula'
    }
  }];

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });

  assert.deepEqual(result.player_safe_state.items.map(({ item_id: id }) => id),
    ['closed-box']);
  assert.equal(JSON.stringify(result).includes('secret-child'), false);

  committedState.items[0].open_state = 'open';
  committedState.items[0].contents_state = 'known';
  const opened = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  });
  assert.deepEqual(opened.player_safe_state.items.map(({ item_id: id }) => id),
    ['closed-box', 'secret-child']);
  assert.equal(opened.player_safe_state.items[1].placement.container_id,
    'closed-box');
});

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
