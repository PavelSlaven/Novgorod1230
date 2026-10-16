import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { createTargetCurrentFactualContext } from
  '../src/infrastructure/postgres/target-current-factual-context.js';
import { createLocalMovementDisclosureReader } from
  '../src/infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { createSpatialV3LocalMovementEligibilityReader,
  loadApprovedLocalMovementEligibilityPins } from
  '../src/infrastructure/postgres/spatial-v3-local-movement-eligibility.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentNaturalSourceState } from
  '../src/infrastructure/postgres/g4-current-natural-source-state.js';
import { readCurrentActorBodyCapability } from
  '../src/infrastructure/postgres/spatial-v3-current-movement-capability.js';
import { readCurrentTargetConditions, readCommittedEntityExterior,
  readPlayerKnowledge } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { loadSpatialV3TargetProductionRelease } from
  '../src/composition/production-spatial-v3-release-v17.js';
import { createTargetAuthoredStartCatalog } from
  '../src/internal/target-authored-start-catalog.js';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { deriveTrustedBodyNeedsBindingPin } from '../src/runtime/body-needs-temporal.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const SCENARIO_ID = 'novgorod_pine_ridge_approach_v1';
const OBSERVE = 'Осмотреться';
const CLEAR_WEATHER_REQUEST_ID = 'issue-594-pine-ridge-clear-sight-seed-000024';
const RAIN_WEATHER_REQUEST_ID = 'issue-594-pine-ridge-clear-sight';

async function captureInitialEnvironment(pool, factualContext, partyId, pin = null) {
  const actorId = (await pool.query(`SELECT character_id
    FROM party_runtime.party_player_characters WHERE party_id=$1`, [partyId])).rows[0]?.character_id;
  assert.ok(actorId, 'precondition: initial party has its committed actor');
  const client = await pool.connect();
  let environment;
  let placements;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = await createLowerDvinaTracePhase1ARepository({
      query: client.query.bind(client),
    }).loadInternal(partyId);
    assert.ok(state, 'precondition: initial party has its committed snapshot');
    environment = factualContext.projectEnvironmentAtClock({ state, clock: state.timestamp });
    if (pin) {
      const scene = await readCurrentEntityVisibilityScene({
        transaction: client, partyId, actorId, pin,
      });
      const positionId = scene.location.scene_position_id;
      const actorG6 = scene.positions.find((row) => row.id === positionId)?.g6_instance_id;
      placements = {
        actor: { entity_id: actorId, position_id: positionId, g6_instance_id: actorG6 },
        npcs: scene.placements.filter((row) => row.entity_kind === 'npc').map((row) => {
          const npcG6 = scene.positions.find((position) =>
            position.id === row.position_node_id)?.g6_instance_id;
          return { entity_id: row.entity_id, position_id: row.position_node_id,
            g6_instance_id: npcG6, same_g6: npcG6 === actorG6 };
        }),
      };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { actorId, environment, placements };
}

async function createProductionVisibility(env) {
  const context = await loadSpatialV3TargetProductionRelease({
    worldPool: env.worldPool,
    itemApproval: env.approvals.itemApproval,
    actorApproval: env.approvals.actorApproval,
    rootDir: env.rootDir,
  });
  const runtime = context.runtime;
  const authoredStartCatalog = createTargetAuthoredStartCatalog({
    runtime, release: context.release,
  });
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({ rootDir: env.rootDir,
    worldRevisionId: context.release.world_revision_id });
  const factualContext = createTargetCurrentFactualContext({
    partyPool: env.partyPool,
    runtime,
    committer: { async commit() { assert.fail('read-only visibility read cannot commit'); } },
    authoredRuntimeBindingResolver: authoredStartCatalog.resolveRuntimeBinding,
    trustedBodyNeedsBindingPin: deriveTrustedBodyNeedsBindingPin(bodyNeedsProfile),
    trustedBodyNeedsProfile: bodyNeedsProfile,
  });
  const readCurrentEnvironment = factualContext.readCurrentEnvironment;
  const readCurrentSourceState = (args) => readCurrentNaturalSourceState({
    ...args, readCurrentEnvironment,
  });
  const readLocalMovementEligibility = createSpatialV3LocalMovementEligibilityReader({
    worldPool: env.worldPool,
    pins: loadApprovedLocalMovementEligibilityPins(context.release.world_revision_id),
  });
  const provider = createSpatialV3CurrentVisibilityProvider({
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
  });
  return { runtime, provider, factualContext, readCurrentEnvironment,
    readCurrentSourceState, pin: runtime.itemPin,
    verifiedCatalog: runtime.materialization_inputs.domain_catalog,
    worldBaseReader: runtime.worldBaseReader };
}

test('ожидаемо красный, issue #594: v17 Pine Ridge exposes an unobstructed close NPC through natural cover',
  { timeout: 1_800_000 }, async (t) => {
    const outDir = process.env.RUS_ISSUE_594_OUT_DIR?.trim()
      ? resolve(process.env.RUS_ISSUE_594_OUT_DIR.trim()) : null;
    const record = { scenario_id: SCENARIO_ID, phase: 'bootstrap' };
    const env = await bootstrapV17PresenceE2e(t);
    const requests = [];
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: OBSERVE,
      requestLog: requests });
    t.after(restoreFetch);
    const { runtime, readCurrentVisibleContext } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const production = await createProductionVisibility(env);

    try {
      const rainOpening = await runtime.startNewGame({ scenario_id: SCENARIO_ID,
        request_id: RAIN_WEATHER_REQUEST_ID });
      assert.equal(rainOpening.screen.schema, 'first_game_screen');
      const rainInitial = await captureInitialEnvironment(env.partyPool,
        production.factualContext, rainOpening.party_id);
      assert.equal(rainInitial.environment.weather_state.weather_state_id, 'moderate_rain',
        'precondition: fixed rain-control request resolves to moderate rain');
      await runtime.acknowledgeOpening(rainOpening.party_id,
        { client_ack_id: 'issue-594-pine-ridge-rain-control-ack' });
      await runtime.submitTurn(rainOpening.party_id,
        { raw_text: OBSERVE, request_id: 'issue-594-pine-ridge-rain-control-look' });
      const rainParty = (await env.partyPool.query(`SELECT p.state_version,s.state_payload
        FROM party_runtime.parties p JOIN party_runtime.party_state_snapshots s
          ON s.party_id=p.party_id AND s.state_version=p.state_version
        WHERE p.party_id=$1`, [rainOpening.party_id])).rows[0];
      assert.ok(rainParty?.state_payload, 'rain control commits its first-look snapshot');
      const rainClient = await env.partyPool.connect();
      let rainCurrentEnvironment;
      try {
        await rainClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        rainCurrentEnvironment = await production.factualContext.readCurrentEnvironment({
          transaction: rainClient, partyId: rainOpening.party_id,
        });
        await rainClient.query('COMMIT');
      } catch (error) {
        await rainClient.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        rainClient.release();
      }
      assert.equal(rainCurrentEnvironment.weather_state.weather_state_id, 'moderate_rain');
      assert.equal(rainCurrentEnvironment.weather_state.visibility, 'reduced');
      const rainObservations = await production.provider.readEntityObservations({
        partyId: rainOpening.party_id, actorId: rainParty.state_payload.actor_id,
        observedPositionId: rainParty.state_payload.position.position_id,
      });
      const rainNpc = rainObservations.find((row) => row.entity_kind === 'npc');
      assert.ok(rainNpc, 'rain control provider includes the nearby NPC');
      assert.equal(rainNpc.visibility, 'partial',
        'rain control: moderate rain may legitimately make the nearby NPC partial');
      record.rain_control = { request_id: RAIN_WEATHER_REQUEST_ID,
        initial_environment: rainInitial.environment,
        current_environment: rainCurrentEnvironment,
        provider_observation: { entity_id: rainNpc.entity_id,
          visibility: rainNpc.visibility } };
      console.log(`[issue-594-pg-rain-control] ${JSON.stringify(record.rain_control)}`);

      const opening = await runtime.startNewGame({ scenario_id: SCENARIO_ID,
        request_id: CLEAR_WEATHER_REQUEST_ID });
      assert.equal(opening.screen.schema, 'first_game_screen');
      record.opening = { schema: opening.screen.schema, party_id: opening.party_id };
      const { environment: initialEnvironment, placements: initialPlacements } =
        await captureInitialEnvironment(env.partyPool, production.factualContext,
          opening.party_id, production.pin);
      record.initial_environment = initialEnvironment;
      record.initial_placements = initialPlacements;
      assert.equal(initialEnvironment.weather_state.weather_state_id, 'clear_dry_calm',
        'precondition: fixed clear request resolves to approved clear initial weather');
      assert.equal(initialEnvironment.weather_state.visibility, 'normal');
      console.log(`[issue-594-pg-initial-environment] ${JSON.stringify({
        request_id: CLEAR_WEATHER_REQUEST_ID, environment: initialEnvironment,
      })}`);
      console.log(`[issue-594-pg-initial-placements] ${JSON.stringify({
        request_id: CLEAR_WEATHER_REQUEST_ID, ...initialPlacements,
      })}`);
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: 'issue-594-pine-ridge-ack' });
      await runtime.submitTurn(opening.party_id,
        { raw_text: OBSERVE, request_id: 'issue-594-pine-ridge-first-look' });
      const observed = await runtime.getPartyScreen(opening.party_id);
      const party = (await env.partyPool.query(`SELECT state_version
        FROM party_runtime.parties WHERE party_id=$1`, [opening.party_id])).rows[0];
      const snapshot = (await env.partyPool.query(`SELECT state_payload
        FROM party_runtime.party_state_snapshots
        WHERE party_id=$1 AND state_version=$2`, [opening.party_id, party.state_version])).rows[0];
      assert.ok(snapshot, 'committed first-look snapshot is required');
      const partyState = snapshot.state_payload;
      const actorId = partyState.actor_id;

      const client = await env.partyPool.connect();
      let scene;
      let natural;
      let targetConditions;
      let bodyCapability;
      let currentVisible;
      let observations;
      let nearbyNpcs;
      let targetId = null;
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const args = { transaction: client, partyId: opening.party_id, actorId,
          pin: production.pin, verifiedCatalog: production.verifiedCatalog,
          worldBaseReader: production.worldBaseReader,
          readCurrentEnvironment: production.readCurrentEnvironment,
          readCurrentSourceState: production.readCurrentSourceState,
          observedPositionId: partyState.position.position_id };
        scene = await readCurrentEntityVisibilityScene(args);
        natural = await readCurrentNaturalPerceptionFacts(args);
        bodyCapability = await readCurrentActorBodyCapability({ transaction: client,
          partyId: opening.party_id, actorId, purpose: 'perception' });
        nearbyNpcs = scene.placements.filter((row) => row.entity_kind === 'npc'
          && scene.positions.find((position) => position.id === row.position_node_id)
            ?.g6_instance_id === scene.positions.find((position) =>
              position.id === scene.location.scene_position_id)?.g6_instance_id);
        const target = nearbyNpcs[0] ?? null;
        targetId = target?.entity_id ?? null;
        if (target) targetConditions = await readCurrentTargetConditions({ transaction: client,
          partyId: opening.party_id, actorId, scene, natural,
          target: { target_id: `npc:${target.entity_id}`, entity_kind: 'npc',
            entity_id: target.entity_id, position_id: target.position_node_id } });
        observations = await production.provider.readEntityObservations({ transaction: client,
          partyId: opening.party_id, actorId, observedPositionId: scene.location.scene_position_id });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      currentVisible = await readCurrentVisibleContext({ partyId: opening.party_id,
        actorId, positionId: scene.location.scene_position_id, state: partyState });
      const targetObservation = observations.find((row) => row.entity_id === targetId);
      const visibleNpc = currentVisible.visible_npc.find((row) =>
        row.entity_ref.entity_id === targetId);
      const plannerRequest = requests.find(({ user }) =>
        (user.request ?? user).root_player_action === OBSERVE);
      const diagnostic = {
        scenario_id: SCENARIO_ID,
        opening: { schema: opening.screen.schema, acknowledged: true },
        first_look: { committed_turn: Number(party.state_version),
          screen_schema: observed.screen.schema ?? null,
          input: OBSERVE,
          planner_action: plannerRequest ? (plannerRequest.user.request ?? plannerRequest.user)
            .root_player_action : null },
        observer: { position_id: scene.location.scene_position_id,
          visual_capability: natural.observer.visual_capability,
          body_owner_visual_capability: bodyCapability.visual_capability,
          lighting: natural.ambient_visibility?.lighting,
          weather: natural.ambient_visibility?.weather,
          stable_cover: natural.ambient_visibility?.stable_cover,
          current_light_state: natural.current_environment?.light_state,
          current_weather_visibility: natural.current_environment?.weather_state?.visibility,
          current_weather_state_id: natural.current_environment?.weather_state?.weather_state_id },
        geometry: { g6_mode: scene.g6.find((row) => row.id === scene.positions.find(
          (position) => position.id === scene.location.scene_position_id)?.g6_instance_id)
          ?.intra_g6_visibility_mode,
          default_distance_band: scene.g6.find((row) => row.id === scene.positions.find(
            (position) => position.id === scene.location.scene_position_id)?.g6_instance_id)
            ?.default_visibility_distance_band,
          observer_npc_same_g6: nearbyNpcs.length > 0,
          position_count: scene.positions.length,
          visibility_link_count: scene.visibility_links.length,
          portal_count: Object.keys(natural.scene.portals ?? {}).length,
          current_modifier_count: scene.modifier_set.rows.length },
        target_conditions: targetConditions,
        provider_observation: targetObservation ? {
          entity_id: targetObservation.entity_id,
          visibility: targetObservation.visibility,
          display_label: targetObservation.display_label,
          recognition: targetObservation.display_name == null ? 'unrecognized' : 'recognized',
          has_display_name: Object.hasOwn(targetObservation, 'display_name'),
          has_appearance: Boolean(targetObservation.exterior?.appearance),
        } : null,
        visible_context_npc: visibleNpc ? {
          entity_id: visibleNpc.entity_ref.entity_id,
          display_label: visibleNpc.display_label,
          recognition: visibleNpc.recognition,
          has_observable_cues: Boolean(visibleNpc.observable_cues),
          has_appearance: Boolean(visibleNpc.observable_cues?.identity?.appearance),
          has_equipment_cues: Array.isArray(visibleNpc.observable_cues?.equipment),
          has_name: Object.hasOwn(visibleNpc.observable_cues?.identity ?? {}, 'display_name'),
        } : null,
      };
      record.phase = 'readback';
      record.readback = diagnostic;
      console.log(`[issue-594-pg-readback] ${JSON.stringify(diagnostic)}`);

      if (outDir) {
        await mkdir(outDir, { recursive: true });
        await writeFile(resolve(outDir, 'issue-594-stable-cover-v17-postgres.json'),
          `${JSON.stringify(record, null, 2)}\n`);
      }

      assert.equal(Number(observed.turn_number), 1, 'first look must be the first committed turn');
      assert.ok(nearbyNpcs.length > 0,
        'precondition: committed Pine Ridge arrival has an NPC within its current G6');
      assert.equal(natural.observer.visual_capability, 'clear',
        'precondition: production actor perception owner grants clear visual capability');
      assert.equal(natural.ambient_visibility.lighting, 'clear',
        'precondition: current Temporal light resolves to clear sight');
      assert.equal(natural.ambient_visibility.weather, 'clear',
        'precondition: current weather resolves to clear sight');
      assert.equal(natural.current_environment.light_state, 'daylight',
        'precondition: current Temporal light state is daylight');
      assert.equal(natural.current_environment.weather_state.visibility, 'normal',
        'precondition: current weather visibility is normal');
      assert.equal(scene.modifier_set.rows.length, 0,
        'precondition: no current visibility modifier affects this scene');
      assert.equal(scene.visibility_links.length, 0,
        'precondition: no pair-specific visibility barrier in the committed scene');
      assert.equal(Object.keys(natural.scene.portals ?? {}).length, 0,
        'precondition: no portal blocks this within-G6 sightline');
      const observerG6 = scene.positions.find((row) =>
        row.id === scene.location.scene_position_id)?.g6_instance_id;
      const g6 = scene.g6.find((row) => row.id === observerG6);
      assert.equal(g6?.intra_g6_visibility_mode, 'default_clear');
      assert.ok(['near', 'short'].includes(g6?.default_visibility_distance_band),
        'precondition: the NPC is within the G6 near/short default visibility band');
      assert.equal(bodyCapability.visual_capability, 'clear');
      assert.equal(natural.ambient_visibility.stable_cover, 'partial',
        'precondition: the natural source has pine-forest cover; NPC cover is the value under test');
      assert.equal(targetConditions.dynamic_occlusion, 'clear');
      assert.equal(targetConditions.concealment, 'clear');
      assert.ok(targetObservation, 'production provider includes this nearby NPC');
      assert.ok(visibleNpc, 'first-look current visible context includes the committed NPC');
      assert.equal(visibleNpc.display_label, 'человек');
      assert.equal(visibleNpc.recognition, 'unrecognized');
      assert.equal(targetObservation.visibility, 'clear',
        'issue #594: landscape openness must not downgrade an unobstructed close NPC to partial');
      assert.ok(visibleNpc.observable_cues?.identity?.appearance,
        'issue #594: unobstructed nearby NPC should expose player-safe appearance cues');
      assert.equal(Object.hasOwn(visibleNpc.observable_cues?.identity ?? {}, 'display_name'), false,
        'visual appearance does not grant an unknown NPC name');
    } catch (error) {
      record.failure = { code: error.code ?? error.name, message: error.message };
      if (outDir) {
        await mkdir(outDir, { recursive: true });
        await writeFile(resolve(outDir, 'issue-594-stable-cover-v17-postgres.json'),
          `${JSON.stringify(record, null, 2)}\n`);
      }
      throw error;
    }
  });
