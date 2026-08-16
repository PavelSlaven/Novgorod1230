import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';

test('nested containers inherit the factual parent closure boundary',
  async () => {
    const bundle = await loadScenarioBundle(17);
    const committedState = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle }).state;
    committedState.items = [];
    committedState.containers = [{
      container_id: 'outer-bag', template_id: 'outer-template',
      closure_state: 'closed', contents_state: 'unknown',
      holder_character_id: committedState.actor_id
    }, {
      container_id: 'nested-case', template_id: 'nested-template',
      parent_container_id: 'outer-bag', closure_state: 'closed',
      visibility_state: 'visible'
    }];

    const closed = projectLowerDvinaTracePlayerSafeState({
      committed_state: committedState, actor_id: committedState.actor_id
    });
    assert.deepEqual(closed.player_safe_state.items.map(({ item_id: id }) => id),
      ['outer-bag']);
    assert.equal(JSON.stringify(closed).includes('nested-case'), false);

    committedState.containers[0].closure_state = 'open';
    committedState.containers[0].contents_state = 'known';
    const opened = projectLowerDvinaTracePlayerSafeState({
      committed_state: committedState, actor_id: committedState.actor_id
    });
    assert.deepEqual(opened.player_safe_state.items.map(({ item_id: id }) => id),
      ['outer-bag', 'nested-case']);
    assert.equal(opened.player_safe_state.items[1].placement.container_id,
      'outer-bag');
  });

test('actor-held containers preserve nested concealment at the player-safe boundary',
  async () => {
    const bundle = await loadScenarioBundle(17);
    const committedState = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle }).state;
    committedState.items = [];
    committedState.npcs = [{
      instance_id: 'visible-npc', visible: true,
      identity_state: { canonical_name: 'Видимый NPC' }
    }];
    committedState.containers = [{
      container_id: 'concealed-bag', template_id: 'bag-template',
      holder_npc_id: 'visible-npc', physical_position: 'worn_quick',
      state: { visibility_state: 'concealed', access_state: 'private' }
    }];
    committedState.container_placements = [{
      container_id: 'concealed-bag', holder_npc_id: 'visible-npc',
      physical_position: 'worn_quick'
    }];

    const projected = projectLowerDvinaTracePlayerSafeState({
      committed_state: committedState, actor_id: committedState.actor_id
    });
    assert.equal(projected.player_safe_state.items.some(({ item_id: itemId }) =>
      itemId === 'concealed-bag'), false);
  });
