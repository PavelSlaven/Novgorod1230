import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadApprovedExitLineLabels } from
  '../../data/world-catalogs/novgorod/m2c-exit-line-labels/approved-labels.mjs';

import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { withLowerDvinaTraceCurrentScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { identifyLlmTestRole } from './llm-test-role.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

const approvedLineLabels = loadApprovedExitLineLabels();
const reedBackwaterApprovedRows = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/m2c-exit-line-labels/approval-attestation.json',
  import.meta.url), 'utf8')).approved_rows.filter(({ from_place }) =>
  from_place === 'reed_backwater_entrance');

// Reed-specific coverage: visible G4 rows must have approved, distinct labels and appear in the
// route panel. This test does not assert G4 operation binding; local passage binding is checked
// below, and the strict route-panel-operations test checks shown-passage binding at Vikhtuy.
// Operations come from the planner request (never inferred from label text).
test('v17 production submitTurn uses approved, non-ordinal G4 exit labels',
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
          .map(({ operation }) => ({ label: operation.description, kind: operation.movement_kind, target: operation.target_ref }));
      }
      return base(url, init);
    };
    t.after(() => { globalThis.fetch = base; });
    let productionSpatialProjector = null;
    const { runtime, readCurrentVisibleContext, readLocalEdgeDisclosure,
      readCurrentExitDisclosure, readCurrentConnectionDisclosure } = await createPresenceProductionRoot({ ...env,
      extraConfig: { onCurrentSpatialContextProjector: (projector) => {
        productionSpatialProjector = projector;
      } }
    });
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_reed_backwater_entrance_v1');
    let step = 0;
    const turn = (raw_text) => runtime.submitTurn(partyId, { raw_text, request_id: `panel-${partyId}-${step++}` });
    // A shown connection may be bound by its approach operation ("<label> — подход").
    const bound = (label) => (offered ?? []).some((op) => op.label === label || op.label === `${label} — подход`);
    const probe = async (context) => {
      offered = null;
      const { screen } = await turn('нет такого прохода'); // refreshes the production menu without traversing an exit
      const shown = routeMovementLabels(screen);
      for (const row of reedBackwaterApprovedRows) {
        const expected = approvedLineLabels.get(`${row.directional_exit_id}@1`);
        assert.ok(expected, `approved exit row ${row.directional_exit_id} loads`);
        const visible = screen.visible_context?.visible_objects?.find((item) =>
          item.entity_ref?.entity_kind === 'g4_directional_exit'
            && item.entity_ref.entity_id === row.directional_exit_id);
        assert.ok(visible, `${context}: approved G4 exit ${row.directional_exit_id} is disclosed`);
        assert.equal(visible.display_label, expected.display_label,
          `${context}: production screen uses the approved line label`);
        assert.ok(shown.includes(expected.display_label),
          `${context}: route panel includes ${expected.display_label}`);
      }
      const visibleExitLabels = (screen.visible_context?.visible_objects ?? [])
        .filter((item) => item.entity_ref?.entity_kind === 'g4_directional_exit')
        .map((item) => item.display_label);
      assert.equal(new Set(visibleExitLabels).size, visibleExitLabels.length,
        `${context}: visible G4 exits have distinct labels`);
      assert.ok(visibleExitLabels.every((label) => !/(?<![\p{L}\p{N}])выход\s+\d+(?![\p{L}\p{N}])/iu.test(label)),
        `${context}: G4 labels contain no ordinal service wording`);
      const shownEdges = (screen.visible_context?.visible_objects ?? [])
        .filter((row) => row.entity_ref.entity_kind === 'scene_movement_edge').map((row) => row.entity_ref.entity_id);
      // Ordinal labels repeat between positions ("Проход 1"), so local edges are also compared by id.
      const foreign = shownEdges.filter((id) => !offered.some((op) => op.kind === 'local' && op.target === id));
      assert.deepEqual(foreign, [], `${context}: the screen shows local edges of another position`);
      const dead = shown.filter((label) => !bound(label) && !visibleExitLabels.includes(label));
      assert.deepEqual(dead, [], `${context}: shown ${shown.join(' | ')}; offered ${(offered ?? []).map((op) => op.label).join(' | ')}`);
      return offered.find((op) => op.kind === 'local')?.label;
    };

    await probe('start');
    assert.equal(typeof productionSpatialProjector, 'function');
    const repository = createLowerDvinaTracePhase2PostgresRepository({ partyPool: env.partyPool,
      readCurrentVisibleContext,
      projectCurrentSpatialContext: productionSpatialProjector,
      readLocalEdgeDisclosure, readCurrentExitDisclosure, readCurrentConnectionDisclosure,
      committer: { async commit() { throw new Error('read-only'); } } });
    const readback = await repository.loadPhase2State(partyId);
    const currentExits = readback.current_visible_context.visible_objects.filter((row) =>
      row.entity_ref?.entity_kind === 'g4_directional_exit');
    assert.ok(currentExits.length > 0, 'repository readback contains fresh disclosed G4 exits');
    const rebuilt = withLowerDvinaTraceCurrentScene({ committedState: readback }).current_visible_context;
    assert.deepEqual(rebuilt.visible_objects.filter((row) =>
      row.entity_ref?.entity_kind === 'g4_directional_exit'), currentExits,
    'current-scene projection preserves fresh repository G4 exit disclosures and labels');
    const hop = await probe('after the first turn');
    assert.ok(hop, 'a local hop is offered');
    await turn(hop);
    const back = await probe('after the hop to the next position');
    assert.ok(back, 'a local hop back is offered');
    await turn(back);
    await probe('after the hop back');
  });
