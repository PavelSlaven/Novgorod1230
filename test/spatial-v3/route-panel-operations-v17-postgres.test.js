import assert from 'node:assert/strict';
import test from 'node:test';

import { playerSafeOrdinalLabel } from '../../apps/game-server/src/public-boundary.js';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { identifyLlmTestRole } from './llm-test-role.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

const routeLabelIsBound = (label, visibleObjects, operations) => operations.some((op) => {
  const suffix = op.label.endsWith(' — подход') ? ' — подход' : '';
  const base = suffix ? op.label.slice(0, -suffix.length) : op.label;
  const entityKind = visibleObjects.find(({ entity_ref: ref }) =>
    ref?.entity_id === (op.route ?? op.target))?.entity_ref?.entity_kind;
  const projectedLabel = `${playerSafeOrdinalLabel(base, entityKind)}${suffix}`;
  return projectedLabel === label || projectedLabel === `${label} — подход`;
});

const foreignLocalEdgeIds = (shownEdges, operations) => shownEdges.filter((id) =>
  !operations.some((op) => op.kind === 'local' && op.target === id));

test('route-panel ordinal labels still require operations bound to their edge ids', () => {
  const visibleObjects = [
    { entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge-a' } },
    { entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge-b' } },
    { entity_ref: { entity_kind: 'g5_site_connection', entity_id: 'route-a' } },
  ];
  const shownEdges = ['edge-a', 'edge-b'];
  const operations = [
    { label: 'Проход 1', kind: 'local', target: 'edge-a' },
    { label: 'Проход 2', kind: 'local', target: 'edge-b' },
    { label: 'Проход 1 — подход', kind: 'local', target: 'edge-b', route: 'route-a' },
  ];

  assert.equal(routeLabelIsBound('проход', visibleObjects, [operations[0]]), true);
  assert.equal(routeLabelIsBound('проход', visibleObjects, [operations[1]]), true);
  assert.equal(routeLabelIsBound('переход', visibleObjects, operations), true);
  assert.equal(routeLabelIsBound('ход', visibleObjects, operations), false);
  assert.deepEqual(foreignLocalEdgeIds(shownEdges, operations), []);
  assert.deepEqual(foreignLocalEdgeIds(shownEdges, [
    { ...operations[0], target: 'foreign-edge' }, operations[1], operations[2],
  ]), ['edge-a']);
});

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
      if (identifyLlmTestRole(call) === 'turn_step_planner') {
        const modelInput = JSON.parse(call.messages.find((message) => message.role === 'user').content);
        offered = turnStepOperationChoices(modelInput.request ?? modelInput)
          .filter(({ operation }) => operation.op === 'request_movement')
          .map(({ operation }) => ({ label: operation.description, kind: operation.movement_kind,
            target: operation.target_ref, route: operation.route_ref }));
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
    const bound = (label, visibleObjects) => routeLabelIsBound(label, visibleObjects, offered ?? []);
    const probe = async (context) => {
      const { screen } = await runtime.getPartyScreen(partyId);
      const shown = routeMovementLabels(screen);
      const shownEdges = (screen.visible_context?.visible_objects ?? [])
        .filter((row) => row.entity_ref.entity_kind === 'scene_movement_edge').map((row) => row.entity_ref.entity_id);
      offered = null;
      await turn('нет такого прохода'); // a turn that binds nothing still makes the planner request list its operations
      // Ordinal labels repeat between positions ("Проход 1"), so local edges are also compared by id.
      const foreign = foreignLocalEdgeIds(shownEdges, offered);
      assert.deepEqual(foreign, [], `${context}: the screen shows local edges of another position`);
      const dead = shown.filter((label) => !bound(label, screen.visible_context?.visible_objects ?? []));
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
