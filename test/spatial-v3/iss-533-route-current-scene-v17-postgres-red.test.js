import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { loadTargetBodyNeedsProfile } from
  '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { deriveTrustedBodyNeedsBindingPin } from
  '../../apps/game-server/src/runtime/body-needs-temporal.js';
import { phase2VisibleContextFromPayload } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { projectLowerDvinaTraceRoutePanel } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-state.js';
import {
  bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';

const LOOK = 'Осматриваюсь вокруг.';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const connections = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const labels = read('../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json').labels;
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const movementKinds = new Set(['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection']);
const movementRows = (context) => (context?.visible_objects ?? [])
  .filter(({ entity_ref: ref }) => movementKinds.has(ref?.entity_kind))
  .map(({ entity_ref, display_label, visible_status }) => ({
    entity_ref, display_label, visible_status: visible_status ?? null,
  })).sort((a, b) => a.entity_ref.entity_id.localeCompare(b.entity_ref.entity_id));
const options = (panel) => (panel?.data?.movement?.options ?? [])
  .map((entry) => ({ ...entry })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

async function whereIs(pool, partyId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(site.canonical_g5_ref->>'entity_id',site.canonical_g5_ref->>'id') AS g5,
            pos.template_slot_key AS slot
       FROM party_runtime.party_journey_locations loc
       JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
       JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
      WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId]);
  assert.equal(rows.length, 1, 'one committed actor journey location');
  return rows[0];
}

// Provider responses are fixed; movement, commit, Spatial and screen finalization are real v17.
// No SQL mutations, custom scene results, live model calls or default capture paths.
test('issue #533: v17 route freshness on movement/replay/recovery — ожидаемо красный при stale options',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({
      observeText: LOOK, movementPrefs: { exactMovement: true },
    });
    t.after(restoreFetch);
    const fixtureFetch = globalThis.fetch;
    let rejectNarration = false;
    let rejectedCalls = 0;
    globalThis.fetch = async (url, init) => {
      const call = JSON.parse(init.body);
      const input = JSON.parse(call.messages.find(({ role }) => role === 'user').content);
      const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
      if (rejectNarration && input.required_current_beat
          && system.startsWith('Return only {"prose"')) {
        rejectedCalls += 1;
        throw new Error('issue #533: deterministic turn narrator outage');
      }
      return fixtureFetch(url, init);
    };
    t.after(() => { globalThis.fetch = fixtureFetch; });
    let productionSpatialProjector = null;
    const root = await createPresenceProductionRoot({ ...env, extraConfig: {
      onCurrentSpatialContextProjector: (projector) => { productionSpatialProjector = projector; },
    } });
    t.after(() => root.runtime.close());
    assert.equal(typeof productionSpatialProjector, 'function', 'the v17 Spatial owner is wired');
    const partyId = await publicStartScenario(root.runtime, 'novgorod_vikhtuy_work_storage_v1');
    const { rows: partyRows } = await env.partyPool.query(
      'SELECT world_revision_id FROM party_runtime.parties WHERE party_id=$1', [partyId]);
    const trustedBodyNeedsProfile = await loadTargetBodyNeedsProfile({
      rootDir: env.rootDir,
      worldRevisionId: partyRows[0].world_revision_id,
    });
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool, projectCurrentSpatialContext: productionSpatialProjector,
      trustedBodyNeedsProfile,
      trustedBodyNeedsBindingPin: deriveTrustedBodyNeedsBindingPin(trustedBodyNeedsProfile),
      readCurrentVisibleContext: root.readCurrentVisibleContext,
      readLocalEdgeDisclosure: root.readLocalEdgeDisclosure,
      readCurrentExitDisclosure: root.readCurrentExitDisclosure,
      readCurrentConnectionDisclosure: root.readCurrentConnectionDisclosure,
      committer: { async commit() { throw new Error('read-only probe repository'); } },
    });
    const captures = [];
    const mismatches = [];
    let sequence = 0;
    async function inspect(result, phase, input) {
      assert.equal(result.screen.screen_status, 'ready', `${phase}: presentation reaches ready`);
      const state = await repository.loadPhase2State(partyId);
      const fresh = state.current_visible_context;
      const { rows } = await env.partyPool.query(
        'SELECT visible_payload FROM party_runtime.party_visible_packages WHERE party_id=$1 AND package_id=$2',
        [partyId, state.last_turn.visible_package.package_id]);
      assert.equal(rows.length, 1, `${phase}: committed package readback succeeds`);
      const previous = phase2VisibleContextFromPayload(rows[0].visible_payload);
      const { player_safe_state: projection } = projectLowerDvinaTracePlayerSafeState({
        committed_state: state, actor_id: state.actor_id,
      });
      const expected = projectLowerDvinaTraceRoutePanel({
        currentPlace: fresh.visible_scene, projection, visibleContext: fresh,
      });
      const capture = {
        phase, input, state_version: state.party_state.state_version,
        position_id: state.position.position_id,
        package_id: state.last_turn.visible_package.package_id,
        package_place: previous.visible_scene, current_place: fresh.visible_scene,
        screen_place: result.screen.panels.route?.data.current_place,
        package_movement: movementRows(previous), current_movement: movementRows(fresh),
        actual_options: options(result.screen.panels.route), expected_options: options(expected),
      };
      captures.push(capture);
      t.diagnostic(JSON.stringify(capture));
      assert.equal(capture.screen_place, capture.current_place,
        `${phase}: place comes from the freshly read Spatial context`);
      if (JSON.stringify(capture.actual_options) !== JSON.stringify(capture.expected_options)) {
        mismatches.push(capture);
      }
      const saved = await env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1', [partyId]);
      assert.deepEqual(saved.rows[0].screen.panels.route, result.screen.panels.route,
        `${phase}: returned route agrees with the persisted screen`);
      return state;
    }
    async function turn(text, phase) {
      const input = { raw_text: text, request_id: `iss533-${partyId}-${sequence++}` };
      const result = await root.runtime.submitTurn(partyId, input);
      const state = await inspect(result, phase, input);
      return { result, state, input };
    }
    const control = await turn(LOOK, 'same-scene-control');
    assert.deepEqual(control.result.screen.panels.route.data.movement.options,
      (await root.runtime.submitTurn(partyId, control.input)).screen.panels.route.data.movement.options,
      'ready replay keeps the same route');
    await inspect(await root.runtime.submitTurn(partyId, control.input), 'ready-replay', control.input);
    for (const destination of ['water_access', 'forest_path', 'meeting_area']) {
      const origin = (await whereIs(env.partyPool, partyId)).g5;
      const binding = connections.find((row) =>
        row.from_canonical_g5_id === origin && row.to_canonical_g5_id === g5(destination));
      assert.ok(binding, `approved connection to ${destination} exists`);
      const label = labels.find((row) => row.binding_ref.id === binding.id)?.display_label;
      assert.ok(label, 'the approved connection has a player-facing label');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const at = await whereIs(env.partyPool, partyId);
        if (at.g5 !== origin) break;
        await turn(at.slot === 'departure' ? label : `${label} — подход`,
          `movement-${destination}-${attempt}`);
      }
      assert.equal((await whereIs(env.partyPool, partyId)).g5, g5(destination),
        'production movement commits the requested destination');
    }
    const beforeRecovery = await repository.loadPhase2State(partyId);
    rejectNarration = true;
    let pending;
    try {
      pending = await root.runtime.submitTurn(partyId, {
        raw_text: LOOK, request_id: `iss533-pending-${partyId}`,
      });
    } finally {
      rejectNarration = false;
    }
    assert.ok(rejectedCalls > 0, 'only the turn narration provider was made unavailable');
    assert.equal(pending.screen.screen_status, 'committed_presentation_pending',
      'the narrator outage leaves a real committed pending screen');
    const pendingState = await repository.loadPhase2State(partyId);
    assert.equal(pendingState.party_state.state_version, beforeRecovery.party_state.state_version + 1,
      'the pending turn commits once');
    const recovered = await root.runtime.recoverPendingPresentation(partyId);
    const afterRecovery = await inspect(recovered, 'pending-recovery', { raw_text: LOOK });
    assert.equal(afterRecovery.party_state.state_version, pendingState.party_state.state_version,
      'recovery does not recommit the turn');
    if (process.env.RUS_ISS533_CAPTURE_DIR) {
      await mkdir(process.env.RUS_ISS533_CAPTURE_DIR, { recursive: true });
      await writeFile(join(process.env.RUS_ISS533_CAPTURE_DIR, 'production-route-captures.json'),
        `${JSON.stringify(captures, null, 2)}\n`);
    }
    t.diagnostic(JSON.stringify({ captures: captures.length, mismatches: mismatches.length,
      rejected_narrator_calls: rejectedCalls }));
    assert.deepEqual(mismatches, [],
      'ожидаемо красный, issue #533: current place and movement options must use the same current scene');
  });
