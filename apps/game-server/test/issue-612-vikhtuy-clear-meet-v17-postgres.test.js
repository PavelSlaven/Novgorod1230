import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { createTargetCurrentFactualContext } from
  '../src/infrastructure/postgres/target-current-factual-context.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentNaturalSourceState } from
  '../src/infrastructure/postgres/g4-current-natural-source-state.js';
import { readCurrentTargetConditions } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { readCommittedEntityExterior, readPlayerKnowledge } from
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

const SCENARIO_ID = 'novgorod_vikhtuy_work_storage_v1';
const START_REQUEST_ID = 'issue-594-pine-ridge-clear-sight-seed-000024';
const OBSERVE = 'Осматриваюсь вокруг.';

async function createProductionVisibility(env) {
  const context = await loadSpatialV3TargetProductionRelease({
    worldPool: env.worldPool,
    itemApproval: env.approvals.itemApproval,
    actorApproval: env.approvals.actorApproval,
    rootDir: env.rootDir,
  });
  const runtime = context.runtime;
  const authoredStartCatalog = createTargetAuthoredStartCatalog({ runtime, release: context.release });
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({ rootDir: env.rootDir,
    worldRevisionId: context.release.world_revision_id });
  const factualContext = createTargetCurrentFactualContext({
    partyPool: env.partyPool,
    runtime,
    committer: { async commit() { assert.fail('read-only perception probe must not commit'); } },
    authoredRuntimeBindingResolver: authoredStartCatalog.resolveRuntimeBinding,
    trustedBodyNeedsBindingPin: deriveTrustedBodyNeedsBindingPin(bodyNeedsProfile),
    trustedBodyNeedsProfile: bodyNeedsProfile,
  });
  const readCurrentEnvironment = factualContext.readCurrentEnvironment;
  const readCurrentSourceState = (args) => readCurrentNaturalSourceState({
    ...args, readCurrentEnvironment,
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
  });
  return { provider, factualContext, readCurrentEnvironment, readCurrentSourceState,
    pin: runtime.itemPin, verifiedCatalog: runtime.materialization_inputs.domain_catalog,
    worldBaseReader: runtime.worldBaseReader };
}

test('issue #612: fixed clear Vikhtuy start admits a nearby NPC through v17 perception',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: OBSERVE });
    t.after(restoreFetch);
    const visibilityDiagnostics = [];
    const { runtime, readCurrentVisibleContext } = await createPresenceProductionRoot({
      ...env, extraConfig: { onCurrentVisibilityDiagnostics: (event) => visibilityDiagnostics.push(event) }
    });
    t.after(() => runtime.close());
    const production = await createProductionVisibility(env);
    const opening = await runtime.startNewGame({ scenario_id: SCENARIO_ID,
      request_id: START_REQUEST_ID });
    assert.equal(opening.screen.schema, 'first_game_screen');
    await runtime.acknowledgeOpening(opening.party_id,
      { client_ack_id: 'issue-612-fixed-clear-start-ack' });
    await runtime.submitTurn(opening.party_id, { raw_text: OBSERVE,
      request_id: `${START_REQUEST_ID}-look` });

    const client = await env.partyPool.connect();
    let diagnostic;
    let currentVisible;
    let screen;
    let actorPositionId;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const committed = (await client.query(`SELECT snapshot.state_payload
        FROM party_runtime.parties party
        JOIN party_runtime.party_state_snapshots snapshot
          ON snapshot.party_id = party.party_id
         AND snapshot.state_version = party.state_version
        WHERE party.party_id = $1`, [opening.party_id])).rows[0];
      const state = committed?.state_payload;
      assert.ok(state, 'the fixed start must have a committed party state');
      actorPositionId = state.position.position_id;
      const actorId = state.actor_id;
      const args = { transaction: client, partyId: opening.party_id, actorId,
        pin: production.pin, verifiedCatalog: production.verifiedCatalog,
        worldBaseReader: production.worldBaseReader,
        readCurrentEnvironment: production.readCurrentEnvironment,
        readCurrentSourceState: production.readCurrentSourceState,
        observedPositionId: state.position.position_id };
      const environment = await production.readCurrentEnvironment({ transaction: client,
        partyId: opening.party_id, actorId, clock: state.clock });
      const scene = await readCurrentEntityVisibilityScene(args);
      const natural = await readCurrentNaturalPerceptionFacts(args);
      const actorG6 = scene.positions.find((row) =>
        row.id === scene.location.scene_position_id)?.g6_instance_id;
      const nearbyNpcs = scene.placements.filter((row) => row.entity_kind === 'npc'
        && scene.positions.find((position) => position.id === row.position_node_id)
          ?.g6_instance_id === actorG6);
      const target = nearbyNpcs[0] ?? null;
      const targetConditions = target == null ? null : await readCurrentTargetConditions({
        transaction: client, partyId: opening.party_id, actorId, scene, natural,
        target: { target_id: `npc:${target.entity_id}`, entity_kind: 'npc',
          entity_id: target.entity_id, position_id: target.position_node_id },
      });
      diagnostic = {
        scenario_id: SCENARIO_ID,
        current_environment: {
          light_state: environment.light_state,
          weather_visibility: environment.weather_state?.visibility,
          weather_state_id: environment.weather_state?.weather_state_id,
        },
        ambient: {
          lighting: natural.ambient_visibility?.lighting,
          weather: natural.ambient_visibility?.weather,
          stable_cover: natural.ambient_visibility?.stable_cover,
          visual_capability: natural.observer.visual_capability,
        },
        scene: {
          actor_has_nearby_npc: nearbyNpcs.length > 0,
          same_g6: target != null,
          g6_visibility_mode: scene.g6.find((row) => row.id === actorG6)?.intra_g6_visibility_mode,
          distance_band: scene.g6.find((row) => row.id === actorG6)?.default_visibility_distance_band,
          visibility_link_count: scene.visibility_links.length,
          modifier_count: scene.modifier_set.rows.length,
          target_conditions: targetConditions == null ? null : {
            lighting: targetConditions.lighting,
            stable_cover: targetConditions.stable_cover,
            dynamic_occlusion: targetConditions.dynamic_occlusion,
            concealment: targetConditions.concealment,
            weather: targetConditions.weather,
          },
        },
      };
      await writeDiagnostic(diagnostic);
      const observations = await production.provider.readEntityObservations({
        transaction: client, partyId: opening.party_id, actorId,
        observedPositionId: scene.location.scene_position_id,
      });
      diagnostic.provider_npc_count = observations.filter((row) => row.entity_kind === 'npc').length;
      currentVisible = await readCurrentVisibleContext({ partyId: opening.party_id,
        actorId, positionId: state.position.position_id, state });
      screen = (await runtime.getPartyScreen(opening.party_id)).screen;
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError],
          'The test failed and its transaction rollback also failed.', { cause: error });
      }
      throw error;
    } finally {
      client.release();
    }

    diagnostic.visible_context_npc_count = currentVisible.visible_npc.length;
    diagnostic.screen_visible_npc_count = screen.visible_context?.visible_npc?.length ?? 0;
    diagnostic.people_panel_npc_count = screen.panels?.people?.data?.visible_npcs?.length ?? 0;
    const ownerVisibility = [...visibilityDiagnostics].reverse().find((event) =>
      event.party_id === opening.party_id && event.position_id === actorPositionId);
    diagnostic.reported_visibility_conditions = ownerVisibility == null ? null : {
      weather: ownerVisibility.weather,
      local_light: ownerVisibility.local_light,
      visibility_factors: ownerVisibility.visibility_factors,
    };
    await writeDiagnostic(diagnostic);
    t.diagnostic(JSON.stringify(diagnostic));

    assert.equal(diagnostic.current_environment.light_state, 'daylight',
      'precondition: production Temporal owner returns daylight');
    assert.equal(diagnostic.current_environment.weather_visibility, 'normal',
      'precondition: production Temporal owner returns normal weather visibility');
    assert.equal(diagnostic.ambient.lighting, 'clear',
      'precondition: production natural-perception reader resolves clear ambient light');
    assert.equal(diagnostic.ambient.weather, 'clear',
      'precondition: production natural-perception reader resolves clear ambient weather');
    assert.ok(diagnostic.scene.actor_has_nearby_npc,
      'precondition: an authored NPC is committed in the actor current G6');
    assert.ok(['default_clear', 'explicit'].includes(diagnostic.scene.g6_visibility_mode));
    assert.ok(diagnostic.scene.target_conditions,
      'precondition: production target-conditions reader resolves the nearby NPC');
    assert.ok(diagnostic.provider_npc_count > 0,
      'production visibility provider admits a nearby NPC');
    assert.ok(diagnostic.visible_context_npc_count > 0,
      'production current visible context contains the nearby NPC');
    assert.ok(diagnostic.screen_visible_npc_count > 0,
      'the first-game screen includes the admitted NPC');
    assert.ok(diagnostic.people_panel_npc_count > 0,
      'the People panel includes the admitted NPC');
    assert.deepEqual(diagnostic.reported_visibility_conditions?.weather,
      { state_id: 'clear_dry_calm', visibility: 'normal' },
      'the opt-in report diagnostic reads weather from the production environment owner');
    assert.deepEqual(diagnostic.reported_visibility_conditions?.local_light,
      { state: 'daylight', visibility: 'clear' },
      'the opt-in report diagnostic reads local light from production perception');
    assert.ok(diagnostic.reported_visibility_conditions.visibility_factors.length > 0,
      'the opt-in report diagnostic includes production visibility factors');
  });

async function writeDiagnostic(diagnostic) {
  const outDir = process.env.RUS_ISSUE_612_OUT_DIR?.trim();
  if (!outDir) return;
  await mkdir(resolve(outDir), { recursive: true });
  await writeFile(resolve(outDir, 'issue-612-vikhtuy-perception.json'),
    `${JSON.stringify(diagnostic, null, 2)}\n`);
}
