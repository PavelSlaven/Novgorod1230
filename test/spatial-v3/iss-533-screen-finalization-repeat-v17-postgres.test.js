import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { projectLowerDvinaTraceRoutePanel } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { phase2VisibleContextFromPayload } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-state.js';
import { deriveTrustedBodyNeedsBindingPin } from
  '../../apps/game-server/src/runtime/body-needs-temporal.js';
import { loadTargetBodyNeedsProfile } from
  '../../apps/game-server/src/internal/target-runtime-profiles.js';
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

const movementOptions = (panel) => (panel?.data?.movement?.options ?? [])
  .map((entry) => ({ ...entry }))
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

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

async function snapshot(pool, partyId, stateVersion) {
  const { rows } = await pool.query(
    `SELECT state_payload::text AS state_payload_text,state_digest
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=$2`, [partyId, stateVersion]);
  assert.equal(rows.length, 1, 'committed snapshot exists');
  return rows[0];
}

function movementRefs(value, found = []) {
  if (Array.isArray(value)) {
    for (const entry of value) movementRefs(entry, found);
  } else if (value && typeof value === 'object') {
    if (movementKinds.has(value.entity_ref?.entity_kind)) {
      found.push(value.entity_ref);
    }
    for (const child of Object.values(value)) movementRefs(child, found);
  }
  return found;
}

function sortedMovementRefs(value) {
  return movementRefs(value)
    .map((entity_ref) => ({
      entity_kind: entity_ref.entity_kind,
      entity_id: entity_ref.entity_id,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

test('issue #533: repeated v17 screen finalization keeps current route and persisted replay stable',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFixtureFetch = installPresenceProductionE2eFetch({
      observeText: LOOK, movementPrefs: { exactMovement: true },
    });
    t.after(restoreFixtureFetch);

    let activeTurnCapture = null;
    let capturedWriterPayload = null;
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const providerPayload = JSON.parse(init.body);
      if (activeTurnCapture !== null && capturedWriterPayload === null) {
        const userMessage = providerPayload.messages?.find(({ role }) => role === 'user');
        let modelInput = null;
        try { modelInput = JSON.parse(userMessage?.content ?? ''); } catch {}
        const rawSystemPrompt = providerPayload.messages?.find(
          ({ role }) => role === 'system')?.content ?? '';
        const systemPrompt = rawSystemPrompt.replace(
          /^Return a valid json object\.\s*/u, '');
        if (systemPrompt.startsWith('Return only {"prose"')
            && modelInput?.required_current_beat) {
          const { model, messages, ...params } = providerPayload;
          capturedWriterPayload = {
            turn_index: activeTurnCapture.turn_index,
            raw_text: activeTurnCapture.raw_text,
            model, messages, params,
          };
        }
      }
      return fixtureFetch(_url, init);
    };
    t.after(() => { globalThis.fetch = fixtureFetch; });

    let productionSpatialProjector = null;
    const root = await createPresenceProductionRoot({ ...env, extraConfig: {
      onCurrentSpatialContextProjector: (projector) => {
        productionSpatialProjector = projector;
      },
    } });
    t.after(() => root.runtime.close());
    assert.equal(typeof productionSpatialProjector, 'function', 'v17 Spatial owner is wired');

    const partyId = await publicStartScenario(root.runtime,
      'novgorod_vikhtuy_work_storage_v1');
    const { rows: partyRows } = await env.partyPool.query(
      'SELECT world_revision_id FROM party_runtime.parties WHERE party_id=$1', [partyId]);
    assert.equal(partyRows.length, 1, 'party has one pinned world revision');
    const trustedBodyNeedsProfile = await loadTargetBodyNeedsProfile({
      rootDir: env.rootDir, worldRevisionId: partyRows[0].world_revision_id,
    });
    const trustedBodyNeedsBindingPin = deriveTrustedBodyNeedsBindingPin(
      trustedBodyNeedsProfile);
    let committerCalls = 0;
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool,
      trustedBodyNeedsProfile,
      trustedBodyNeedsBindingPin,
      projectCurrentSpatialContext: productionSpatialProjector,
      readCurrentVisibleContext: root.readCurrentVisibleContext,
      readLocalEdgeDisclosure: root.readLocalEdgeDisclosure,
      readCurrentExitDisclosure: root.readCurrentExitDisclosure,
      readCurrentConnectionDisclosure: root.readCurrentConnectionDisclosure,
      committer: { async commit() {
        committerCalls += 1;
        assert.fail('screen-only repeat must not call the factual committer');
      } },
    });

    let sequence = 0;
    const lookInput = { raw_text: LOOK, request_id: `iss533-repeat-look-${partyId}` };
    await root.runtime.submitTurn(partyId, lookInput);

    const destination = 'water_access';
    const origin = (await whereIs(env.partyPool, partyId)).g5;
    const binding = connections.find((row) =>
      row.from_canonical_g5_id === origin
      && row.to_canonical_g5_id === g5(destination));
    assert.ok(binding, 'approved G5 connection to water_access exists');
    const routeLabel = labels.find(({ binding_ref }) =>
      binding_ref.id === binding.id)?.display_label;
    assert.ok(routeLabel, 'approved connection has player-facing label');

    let transition = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const before = await whereIs(env.partyPool, partyId);
      if (before.g5 !== origin) break;
      const rawText = before.slot === 'departure'
        ? routeLabel : `${routeLabel} — подход`;
      const input = { raw_text: rawText,
        request_id: `iss533-repeat-move-${partyId}-${sequence++}` };
      activeTurnCapture = { turn_index: attempt, raw_text: rawText };
      capturedWriterPayload = null;
      const result = await root.runtime.submitTurn(partyId, input);
      const turnWriterPayload = capturedWriterPayload;
      activeTurnCapture = null;
      const after = await whereIs(env.partyPool, partyId);
      if (after.g5 === g5(destination)) {
        transition = { input, result, writerPayload: turnWriterPayload };
      }
    }
    assert.ok(transition, 'ordinary production movement commits the G5 transition');
    assert.ok(transition.writerPayload,
      'captured the actual gameplay narrator payload for the G5 transition');
    assert.equal(transition.writerPayload.raw_text, transition.input.raw_text,
      'captured narrator payload belongs to the committed G5 transition input');

    const initialScreen = transition.result.screen;
    assert.equal(initialScreen.screen_status, 'ready');
    const packageRows = await env.partyPool.query(
      `SELECT visible_payload,package_digest FROM party_runtime.party_visible_packages
        WHERE party_id=$1 AND package_id=$2`,
      [partyId, initialScreen.current_projection_anchor.package_id]);
    assert.equal(packageRows.rows.length, 1, 'committed visible package is readable');
    const committedVisibleContext = phase2VisibleContextFromPayload(
      packageRows.rows[0].visible_payload);
    const packageMovementRefs = movementRefs(committedVisibleContext);
    const writerInputMessage = transition.writerPayload.messages?.find(
      ({ role }) => role === 'user');
    const writerModelInput = writerInputMessage == null
      ? null : JSON.parse(writerInputMessage.content);
    const writerMovementRefs = movementRefs(writerModelInput);
    t.diagnostic(JSON.stringify({
      g5_transition_writer: transition.writerPayload,
      committed_package: {
        package_digest: packageRows.rows[0].package_digest,
        movement_count: packageMovementRefs.length,
        movement_entity_ids: packageMovementRefs.map(({ entity_id }) => entity_id).sort(),
      },
      writer_input: {
        movement_count: writerMovementRefs.length,
        movement_entity_ids: writerMovementRefs.map(({ entity_id }) => entity_id).sort(),
      },
    }));
    assert.ok(packageMovementRefs.length > 0,
      'committed package contains movement objects for the destination');
    assert.equal(writerMovementRefs.length, 0,
      'narrator writer wire contains no movement object refs');
    const state = await repository.loadPhase2State(partyId);
    const visibleContext = state.current_visible_context;
    const { player_safe_state: projection } = projectLowerDvinaTracePlayerSafeState({
      committed_state: state, actor_id: state.actor_id,
    });
    const expectedRoute = projectLowerDvinaTraceRoutePanel({
      currentPlace: visibleContext.visible_scene,
      projection,
      visibleContext,
    });
    const committedPackageMovementRefs = sortedMovementRefs(committedVisibleContext);
    const freshCurrentMovementRefs = sortedMovementRefs(visibleContext);
    const commit = {
      state_version: initialScreen.current_projection_anchor.committed_state_version,
      package_id: initialScreen.current_projection_anchor.package_id,
      package_digest: initialScreen.current_projection_anchor.package_digest,
    };
    const inputDigest = state.last_turn.input_digest;
    const persistedBefore = await snapshot(env.partyPool, partyId, commit.state_version);
    const finalization = {
      partyId,
      inputDigest,
      result: {
        turn_id: initialScreen.turn_id,
        commit,
        narration: { presentation: {
          output_digest: initialScreen.current_projection_anchor.narration_output_digest,
        } },
        screen: structuredClone(initialScreen),
      },
    };

    const first = await repository.persistPhase2Screen(finalization);
    const firstSaved = await env.partyPool.query(
      'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1', [partyId]);
    assert.equal(firstSaved.rows.length, 1, 'first finalized screen is persisted');
    assert.deepEqual(first.screen, firstSaved.rows[0].screen,
      'first result equals persisted screen');

    const second = await repository.persistPhase2Screen(finalization);
    const secondSaved = await env.partyPool.query(
      'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1', [partyId]);
    await t.test('arrival route uses fresh Spatial context', () => {
      t.diagnostic(JSON.stringify({
        arrival_route_expected: expectedRoute,
        arrival_route_actual: second.screen.panels.route,
      }));
      assert.deepEqual(second.screen.panels.route, expectedRoute,
        'route place and options use the same fresh Spatial context');
    });
    await t.test('committed arrival package refs match fresh current Spatial refs', () => {
      t.diagnostic(JSON.stringify({
        committed_package_movement_refs: committedPackageMovementRefs,
        fresh_current_movement_refs: freshCurrentMovementRefs,
      }));
      assert.deepEqual(committedPackageMovementRefs, freshCurrentMovementRefs,
        'committed package movement refs equal fresh current movement refs by kind and id');
    });
    assert.deepEqual(second.screen, first.screen,
      'repeating finalization for same commit and current Spatial yields same screen');
    assert.deepEqual(secondSaved.rows[0].screen, firstSaved.rows[0].screen,
      'repeated persist keeps the saved screen identical');
    assert.equal(second.screen.screen_digest, first.screen.screen_digest,
      'repeated persist keeps the full screen digest');

    const persistedAfter = await snapshot(env.partyPool, partyId, commit.state_version);
    assert.deepEqual(persistedAfter, persistedBefore,
      'presentation-only repeats do not rewrite snapshot JSON or digest');
    const latest = await root.runtime.getPartyScreen(partyId);
    assert.deepEqual(latest.screen, second.screen, 'GET returns the latest persisted screen');
    const replay = await root.runtime.submitTurn(partyId, transition.input);
    assert.deepEqual(replay.screen, second.screen,
      'same-key ready replay returns the persisted screen unchanged');
    assert.equal(replay.screen.screen_digest, second.screen.screen_digest);
    await root.runtime.submitTurn(partyId, {
      raw_text: LOOK, request_id: `iss533-repeat-history-look-${partyId}`,
    });
    const historicalReplay = await root.runtime.submitTurn(partyId, transition.input);
    await t.test('historical same-key replay retains arrival route', () => {
      t.diagnostic(JSON.stringify({
        historical_route_expected: expectedRoute,
        historical_route_actual: historicalReplay.screen?.panels?.route ?? null,
      }));
      assert.deepEqual(historicalReplay.screen?.panels?.route, expectedRoute,
        'historical same-key replay returns the arrival current route');
    });
    assert.equal(committerCalls, 0, 'screen-only repeats never call commit');

    t.diagnostic(JSON.stringify({
      state_version: commit.state_version,
      package_id: commit.package_id,
      current_place: visibleContext.visible_scene,
      movement_options: movementOptions(second.screen.panels.route),
      screen_digest: second.screen.screen_digest,
      snapshot_digest: persistedAfter.state_digest,
      committer_calls: committerCalls,
    }));
  });
