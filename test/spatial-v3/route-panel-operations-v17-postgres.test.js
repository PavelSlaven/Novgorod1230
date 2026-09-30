import assert from 'node:assert/strict';
import test from 'node:test';

import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

// LW-097 / rt-lines phase 0.1: every passage the player is shown has a movement operation the
// planner can bind to it; a label without one is a button that only answers "not achieved".
// The operations are read from the planner's own request (never from text), the labels from the
// route panel of the screen the player sees.
test('v17 production walk: every passage label of the route panel is a planner movement operation',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
    t.after(() => restoreFetch());
    const base = globalThis.fetch;
    let offered = null;
    globalThis.fetch = async (url, init) => {
      const call = JSON.parse(init.body);
      if (call.messages[0].content.includes('semantic choice for one turn step')) {
        const modelInput = JSON.parse(call.messages.find((message) => message.role === 'user').content);
        offered = turnStepOperationChoices(modelInput.request ?? modelInput)
          .filter(({ operation }) => operation.op === 'request_movement')
          .map(({ operation }) => ({ label: operation.description, kind: operation.movement_kind, target: operation.target_ref }));
      }
      return base(url, init);
    };
    t.after(() => { globalThis.fetch = base; });
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_household_cluster_v1');
    let step = 0;
    const turn = (raw_text) => runtime.submitTurn(partyId, { raw_text, request_id: `panel-${partyId}-${step++}` });
    // A shown connection may be bound by its approach operation ("<label> — подход").
    const bound = (label) => (offered ?? []).some((op) => op.label === label || op.label === `${label} — подход`);
    const probe = async (context) => {
      const { screen } = await runtime.getPartyScreen(partyId);
      const shown = routeMovementLabels(screen);
      const shownEdges = (screen.visible_context?.visible_objects ?? [])
        .filter((row) => row.entity_ref.entity_kind === 'scene_movement_edge').map((row) => row.entity_ref.entity_id);
      offered = null;
      await turn('нет такого прохода'); // a turn that binds nothing still makes the planner request list its operations
      // Ordinal labels repeat between positions ("Проход 1"), so local edges are also compared by id.
      const foreign = shownEdges.filter((id) => !offered.some((op) => op.kind === 'local' && op.target === id));
      assert.deepEqual(foreign, [], `${context}: the screen shows local edges of another position`);
      const dead = shown.filter((label) => !bound(label));
      assert.deepEqual(dead, [], `${context}: shown ${shown.join(' | ')}; offered ${(offered ?? []).map((op) => op.label).join(' | ')}`);
      return offered.find((op) => op.kind === 'local')?.label;
    };

    await probe('start');
    const hop = await probe('after the first turn');
    assert.ok(hop, 'a local hop is offered');
    await turn(hop);
    const back = await probe('after the hop to the next position');
    assert.ok(back, 'a local hop back is offered');
    await turn(back);
    await probe('after the hop back');
  });
