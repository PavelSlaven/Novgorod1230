import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { withLowerDvinaTraceCurrentScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  PRESENCE_E2E_MOVE_TEXT,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

const LOOK = 'Осматриваюсь вокруг.';
const TOPOLOGY_TITLE = 'Название из topology не является представлением сцены.';

async function currentSnapshot(pool, partyId) {
  const { rows } = await pool.query(
    `SELECT s.state_version, s.state_payload FROM party_runtime.party_state_snapshots s
       JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
      WHERE s.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return { version: Number(rows[0].state_version), state: rows[0].state_payload };
}

async function currentSiteOrigin(pool, partyId, state) {
  const { rows } = await pool.query(
    'SELECT origin FROM party_runtime.party_g5_sites WHERE party_id=$1 AND id=$2',
    [partyId, state.position?.site_id]);
  return rows[0]?.origin ?? null;
}

test('authored generated-site arrival commits with its fresh Spatial title and no scene presentation',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: LOOK });
    t.after(restoreFetch);
    let productionSpatialProjector = null;
    const root = await createPresenceProductionRoot({ ...env, extraConfig: {
      onCurrentSpatialContextProjector: (projector) => {
        productionSpatialProjector = projector;
      },
    } });
    t.after(() => root.runtime.close());
    const { runtime } = root;
    let arrival = null;

    // Seed alternatives cover fog without swallowing a failed production turn.
    for (let attempt = 0; attempt < 6 && arrival == null; attempt += 1) {
      const opening = await runtime.startNewGame({
        scenario_id: 'novgorod_riverbank_approach_v1',
        request_id: `generated-scene-start-${attempt}`,
      });
      await runtime.acknowledgeOpening(opening.party_id, {
        client_ack_id: `generated-scene-ack-${attempt}`,
      });
      await runtime.submitTurn(opening.party_id, { raw_text: LOOK,
        request_id: `generated-scene-look-${attempt}` });
      for (let step = 0; step < 8 && arrival == null; step += 1) {
        const screen = (await runtime.getPartyScreen(opening.party_id)).screen;
        if (routeMovementLabels(screen).length === 0) break;
        const before = await currentSnapshot(env.partyPool, opening.party_id);
        const response = await runtime.submitTurn(opening.party_id, {
          raw_text: PRESENCE_E2E_MOVE_TEXT,
          request_id: `generated-scene-move-${attempt}-${step}`,
        });
        const after = await currentSnapshot(env.partyPool, opening.party_id);
        assert.equal(after.version, before.version + 1,
          'the movement turn commits exactly once');
        if (await currentSiteOrigin(env.partyPool, opening.party_id, after.state) === 'generated') {
          arrival = { partyId: opening.party_id, response, snapshot: after };
        }
      }
    }
    assert.ok(arrival, 'production submitTurn reaches a generated destination');
    assert.equal(typeof productionSpatialProjector, 'function');
    assert.equal(arrival.snapshot.state.scene_presentation ?? null, null,
      'authored/live-world state has no legacy scene presentation');
    assert.equal(arrival.snapshot.state.scenario_id, 'novgorod_riverbank_approach_v1');

    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool,
      projectCurrentSpatialContext: productionSpatialProjector,
      readCurrentVisibleContext: root.readCurrentVisibleContext,
      readLocalEdgeDisclosure: root.readLocalEdgeDisclosure,
      readCurrentExitDisclosure: root.readCurrentExitDisclosure,
      readCurrentConnectionDisclosure: root.readCurrentConnectionDisclosure,
      committer: { async commit() { throw new Error('read-only'); } },
    });
    const loaded = await repository.loadPhase2State(arrival.partyId);
    const fresh = await productionSpatialProjector({ partyId: arrival.partyId,
      actorId: loaded.actor_id, state: loaded });
    assert.ok(typeof fresh.visible_scene === 'string' && fresh.visible_scene.trim());
    assert.equal(arrival.response.screen.visible_context.visible_scene, fresh.visible_scene,
      'the committed arrival title comes from the destination Spatial owner');
    const rebuilt = withLowerDvinaTraceCurrentScene({ committedState: loaded,
      scenePresentation: null, locationProfiles: [{
        location_profile_id: loaded.position.location_ref,
        display_name: TOPOLOGY_TITLE,
      }] }).current_visible_context;
    assert.equal(rebuilt.visible_scene, fresh.visible_scene);
    assert.notEqual(rebuilt.visible_scene, TOPOLOGY_TITLE,
      'locationProfiles cannot supply the scene title');
    const persisted = await env.partyPool.query(
      `SELECT visible_payload FROM party_runtime.party_visible_packages
        WHERE party_id=$1 ORDER BY committed_state_version::bigint DESC LIMIT 1`,
      [arrival.partyId]);
    assert.equal(persisted.rows[0].visible_payload.perceived_scene, fresh.visible_scene);
    for (const field of ['current_spatial_context', 'current_spatial_context_is_fresh',
      'current_spatial_context_filters_entities']) {
      assert.equal(Object.hasOwn(arrival.snapshot.state, field), false,
        `${field} remains transient`);
    }
  });
