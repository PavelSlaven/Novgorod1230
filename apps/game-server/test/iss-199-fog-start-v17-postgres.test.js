import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { createTargetCurrentFactualContext } from '../src/infrastructure/postgres/target-current-factual-context.js';
import { createLocalMovementDisclosureReader } from '../src/infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { createSpatialV3LocalMovementEligibilityReader, loadApprovedLocalMovementEligibilityPins } from
  '../src/infrastructure/postgres/spatial-v3-local-movement-eligibility.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentNaturalSourceState } from
  '../src/infrastructure/postgres/g4-current-natural-source-state.js';
import { readCurrentTargetConditions, readCommittedEntityExterior, readPlayerKnowledge } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { visibleCurrentTargets } from '../src/runtime/spatial-v3-current-visibility.js';
import { loadSpatialV3TargetProductionRelease } from '../src/composition/production-spatial-v3-release-v17.js';
import { createTargetAuthoredStartCatalog } from '../src/internal/target-authored-start-catalog.js';
import { turnStepOperationChoices } from '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  routeMovementLabels,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const { status: STARTS_STATUS, starts: TARGET_STARTS } = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json',
  import.meta.url), 'utf8'));
const FOG_SCENARIOS = [
  'novgorod_pine_ridge_approach_v1',
  'novgorod_vikhtuy_work_storage_v1',
];
const FOG_START_ATTEMPTS = 24;
const MOVE_TEXT = 'Иду по проходу.';

test('v17 dense-fog start offers first-action movement with committed retry',
  { timeout: 1_800_000 }, async (t) => {
    assert.equal(STARTS_STATUS, 'approved');
    assert.equal(TARGET_STARTS.length, 7);
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({
      movementPrefs: { exactMovement: false },
    });
    const fixtureFetch = globalThis.fetch;
    let activeMovementPartyId = null;
    const selectedMovementByParty = new Map();
    let productionVisibility = null;
    let visibilityCheckError = null;
    globalThis.fetch = async (url, init) => {
      const call = JSON.parse(init.body);
      const system = call.messages[0].content.replace(/^(?:Return a valid json object\.|Верните корректный объект JSON\.)\s*/u, '');
      const plannerCall = system.startsWith(
        'Верни только один JSON-объект с семантическим выбором для одного шага хода.');
      let movementChoices = null;
      if (plannerCall) {
        const input = JSON.parse(call.messages.find(({ role }) => role === 'user').content);
        const request = input.request ?? input;
        if (request.root_player_action === MOVE_TEXT) {
          movementChoices = turnStepOperationChoices(request).filter(({ operation }) =>
            operation.op === 'request_movement');
          assert.ok(movementChoices.length > 0,
            'first-action planner request must offer request_movement');
        }
      }
      let response = await fixtureFetch(url, init);
      if (movementChoices != null) {
        const body = await response.clone().json();
        const result = JSON.parse(body.choices[0].message.content);
        let selected = movementChoices.find(({ choice_id }) =>
          choice_id === result.operation_choice);
        if (selected?.operation.movement_kind !== 'local') {
          // This regression checks a local line; the shared fixture otherwise prefers a route.
          selected = movementChoices.find(({ operation }) => operation.movement_kind === 'local');
          assert.ok(selected, 'planner request must offer a local first-move line');
          result.operation_choice = selected.choice_id;
          result.interpretation.grounded_attempt = selected.operation.description;
          body.choices[0].message.content = JSON.stringify(result);
          response = new Response(JSON.stringify(body), {
            status: response.status, statusText: response.statusText,
            headers: response.headers,
          });
        }
        assert.ok(selected?.operation?.target_ref,
          'planner selected movement target must resolve to its local edge ID');
        productionVisibility ??= await createFogVisibilityProvider(env);
        try {
          await assertProductionResolvedFogLine({
            env, partyId: activeMovementPartyId, actorId: selected.operation.actor_ref,
            edgeId: selected.operation.target_ref,
            productionVisibility,
          });
        } catch (error) {
          visibilityCheckError = error;
          throw error;
        }
        selectedMovementByParty.set(activeMovementPartyId, selected ?? null);
      }
      return response;
    };
    t.after(() => {
      globalThis.fetch = fixtureFetch;
      restoreFetch();
    });

    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const repository = createLowerDvinaTracePhase1ARepository({
      query: env.partyPool.query.bind(env.partyPool),
    });

    const startsByScenario = new Map();
    for (const [index, start] of TARGET_STARTS.entries()) {
      const requestId = `iss199-active-start-${start.scenario_id}-${index}`;
      const opening = await runtime.startNewGame({
        scenario_id: start.scenario_id,
        request_id: requestId,
      });
      assert.equal(opening.screen.schema, 'first_game_screen', start.scenario_id);
      const internal = await repository.loadInternal(opening.party_id);
      const expectedCanonicalRef = {
        entity_id: start.canonical_g5_ref.id,
        authoring_version: String(start.canonical_g5_ref.version),
      };
      const currentCanonicalSite = await env.partyPool.query(
        `SELECT site.canonical_g5_ref
           FROM party_runtime.party_journey_locations loc
           JOIN party_runtime.scene_position_nodes pos
             ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
           JOIN party_runtime.party_g6_instances g6
             ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
           JOIN party_runtime.party_scene_baselines base
             ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
           JOIN party_runtime.party_g5_sites site
             ON site.party_id=base.party_id AND site.id=base.host_id
            AND base.host_kind='g5_site'
          WHERE loc.party_id=$1 AND loc.owner_kind='actor'
            AND loc.location_kind='scene'
            AND pos.status='active' AND g6.status='active'
            AND base.status='active' AND site.origin='canonical'
            AND site.status='active' AND site.canonical_g5_ref=$2::jsonb`,
        [opening.party_id, JSON.stringify(expectedCanonicalRef)]);
      assert.equal(currentCanonicalSite.rows.length, 1,
        `${start.scenario_id}: persisted position resolves to one exact canonical manifest site`);
      assert.deepEqual(currentCanonicalSite.rows[0].canonical_g5_ref, expectedCanonicalRef);
      assert.ok(internal.position.position_id, `${start.scenario_id}: actor position persisted`);
      const topology = await env.partyPool.query(
        `SELECT count(*)::int AS count FROM party_runtime.scene_movement_edges
          WHERE party_id=$1 AND status='active'`, [opening.party_id]);
      assert.ok(topology.rows[0].count > 0, `${start.scenario_id}: active movement topology is nonempty`);
      assert.ok(routeMovementLabels(opening.screen).length > 0,
        `${start.scenario_id}: opening route panel is ready`);
      await runtime.acknowledgeOpening(opening.party_id, {
        client_ack_id: `iss199-active-start-ack-${opening.party_id}`,
      });
      const reloaded = await runtime.getPartyScreen(opening.party_id);
      assert.deepEqual(reloaded.screen, opening.screen,
        `${start.scenario_id}: acknowledged start reloads its persisted screen`);
      startsByScenario.set(start.scenario_id, { opening, internal });
    }

    const fogStarts = [];
    for (const scenarioId of FOG_SCENARIOS) {
      let candidate = startsByScenario.get(scenarioId);
      if (candidate && !isDenseFog(candidate.internal)) candidate = null;
      if (candidate == null) {
        for (let seed = 0; seed < FOG_START_ATTEMPTS; seed += 1) {
          const opening = await runtime.startNewGame({
            scenario_id: scenarioId,
            request_id: `opening-route-${scenarioId}-${seed}`,
          });
          const internal = await repository.loadInternal(opening.party_id);
          if (isDenseFog(internal)) {
            candidate = { opening, internal };
            await runtime.acknowledgeOpening(opening.party_id, {
              client_ack_id: `iss199-fog-ack-${opening.party_id}`,
            });
            assert.deepEqual((await runtime.getPartyScreen(opening.party_id)).screen,
              opening.screen, `${scenarioId}: selected fog start reloads`);
            break;
          }
        }
      }
      assert.ok(candidate,
        `${scenarioId}: no committed dense_fog start in ${FOG_START_ATTEMPTS} request-id seeds`);
      fogStarts.push(candidate);
    }
    assert.notEqual(fogStarts[0].internal.position.g5_node_id,
      fogStarts[1].internal.position.g5_node_id,
      'fog cases must use two distinct canonical starts/environments');

    for (const { opening } of fogStarts) {
      const partyId = opening.party_id;

      const beforeMove = (await env.partyPool.query(
        `SELECT scene_position_id, state_version
           FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='actor'`, [partyId])).rows[0];
      assert.ok(beforeMove?.scene_position_id);

      activeMovementPartyId = partyId;
      const moveRequestId = `iss199-fog-move-${partyId}`;
      let firstMove;
      try {
        firstMove = await runtime.submitTurn(partyId, {
          raw_text: MOVE_TEXT,
          request_id: moveRequestId,
        });
      } catch (error) {
        throw visibilityCheckError ?? error;
      }
      activeMovementPartyId = null;
      const selected = selectedMovementByParty.get(partyId);
      assert.ok(selected?.operation, 'planner selected a real request_movement operation');
    assert.equal(selected.operation.movement_kind, 'local');

      const afterMove = (await env.partyPool.query(
        `SELECT scene_position_id, state_version
           FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='actor'`, [partyId])).rows[0];
      assert.ok(afterMove?.scene_position_id);
      assert.notEqual(afterMove.scene_position_id, beforeMove.scene_position_id);
      assert.equal(Number(afterMove.state_version), Number(beforeMove.state_version) + 1);
      const screenAfterMove = (await runtime.getPartyScreen(partyId)).screen;

      const replay = await runtime.submitTurn(partyId, {
        raw_text: MOVE_TEXT,
        request_id: moveRequestId,
      });
      assert.deepEqual(replay, firstMove, 'retry returns the committed turn result');
      const afterReplay = (await env.partyPool.query(
        `SELECT scene_position_id, state_version
           FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='actor'`, [partyId])).rows[0];
      assert.deepEqual(afterReplay, afterMove, 'retry does not commit a second movement');
      assert.deepEqual((await runtime.getPartyScreen(partyId)).screen, screenAfterMove,
        'retry leaves the persisted screen stable');
    }
  });

async function createFogVisibilityProvider(env) {
  const context = await loadSpatialV3TargetProductionRelease({
    worldPool: env.worldPool, itemApproval: env.approvals.itemApproval,
    actorApproval: env.approvals.actorApproval, rootDir: env.rootDir,
  });
  const runtime = context.runtime;
  const authoredStartCatalog = createTargetAuthoredStartCatalog({
    runtime, release: context.release,
  });
  const factualContext = createTargetCurrentFactualContext({
    partyPool: env.partyPool, runtime,
    committer: { async commit() { assert.fail('read-only visibility check cannot commit'); } },
    authoredRuntimeBindingResolver: authoredStartCatalog.resolveRuntimeBinding,
  });
  const readCurrentEnvironment = factualContext.readCurrentEnvironment;
  const readCurrentSourceState = (args) => readCurrentNaturalSourceState({
    ...args, readCurrentEnvironment,
  });
  const readLocalMovementEligibility = createSpatialV3LocalMovementEligibilityReader({
    worldPool: env.worldPool,
    pins: loadApprovedLocalMovementEligibilityPins(context.release.world_revision_id),
  });
  return {
    pin: runtime.itemPin,
    verifiedCatalog: runtime.materialization_inputs.domain_catalog,
    worldBaseReader: runtime.worldBaseReader,
    readCurrentEnvironment,
    readCurrentSourceState,
    provider: createSpatialV3CurrentVisibilityProvider({
      pool: env.partyPool,
      verifiedCatalog: runtime.materialization_inputs.domain_catalog,
      pin: runtime.itemPin,
      worldBaseReader: runtime.worldBaseReader,
      readCurrentEnvironment,
      readCurrentSourceState,
      readTargetConditions: readCurrentTargetConditions,
      readEntityExterior: readCommittedEntityExterior,
      readPlayerKnowledge,
      readLocalMovementAdmission: createLocalMovementDisclosureReader({
        readLocalMovementEligibility,
      }),
    }),
  };
}

async function assertProductionResolvedFogLine({ env, partyId, actorId, edgeId,
  productionVisibility }) {
  const { pin, verifiedCatalog, worldBaseReader, readCurrentEnvironment,
    readCurrentSourceState, provider } = productionVisibility;
  const transaction = await env.partyPool.connect();
  try {
    await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const args = { transaction, partyId, actorId, pin, verifiedCatalog,
      worldBaseReader, readCurrentEnvironment, readCurrentSourceState };
    const scene = await readCurrentEntityVisibilityScene(args);
    const natural = await readCurrentNaturalPerceptionFacts(args);
    const edge = scene.movement_edges.find((row) => row.id === edgeId
      && row.from_position_id === scene.location.scene_position_id);
    assert.ok(edge, `${partyId}: selected movement target is a current local edge`);
    const target = { target_id: edge.id, position_id: edge.to_position_id,
      entity_kind: 'local_edge' };
    const targetConditions = await readCurrentTargetConditions({ transaction,
      partyId, actorId, scene, natural, target });
    const resolved = visibleCurrentTargets({
      observer_position_id: scene.location.scene_position_id,
      observer_visual_capability: natural.observer.visual_capability,
      positions: scene.positions, g6: scene.g6, visibility_links: scene.visibility_links,
      portals: natural.scene.portals,
      targets: [{ ...target, lighting: natural.ambient_visibility.lighting,
        weather: natural.ambient_visibility.weather, ...targetConditions }],
      modifier_set: scene.modifier_set,
    });
    assert.deepEqual(resolved, [{ target_id: edgeId, visibility: 'none' }],
      `${partyId}: production visibility resolves selected first-move line to none`);
    const disclosed = await provider.readLocalEdgeDisclosure({ transaction, partyId, actorId,
      state: { party_id: partyId, actor_id: actorId,
        journey_location: { scene_position_id: scene.location.scene_position_id } } });
    assert.ok(disclosed.some((row) => row.edge_id === edgeId),
      `${partyId}: the same production provider discloses the selected movement line`);
  } finally {
    await transaction.query('ROLLBACK');
    transaction.release();
  }
}

function isDenseFog(internal) {
  const weather = internal.environment_snapshot?.weather_state;
  return weather?.weather_state_id === 'dense_fog';
}
