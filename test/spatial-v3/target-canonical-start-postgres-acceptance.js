import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { createLowerDvinaTracePhase1BProductionAdapter } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import { loadSpatialV3TargetProductionRelease } from '../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { deriveActivatedReleaseFromReadback } from '../../apps/game-server/src/composition/production-v2-activation-state.js';
import { createSpatialV3ProductionCompositionRoot } from '../../apps/game-server/src/composition/production-spatial-v3.js';
import { loadTargetRuntimeProfiles } from '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from '../../apps/game-server/src/runtime/releases/lower-dvina-trace-a1-production.js';
import { assertTargetNpcSemanticReadback } from './target-n1-postgres-acceptance.js';
import { createLowerDvinaTracePhase2PostgresRepository } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createTargetAuthoredStartCatalog } from '../../apps/game-server/src/internal/target-authored-start-catalog.js';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { loadTargetStartWorldReadback } from './target-start-world-readback-fixture.js';
import { loadTargetAuthoredStartRuntime } from '../../apps/game-server/src/infrastructure/postgres/target-authored-start-runtime.js';
import { readCurrentNaturalPerceptionFacts } from '../../apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readInitialCanonicalNaturalSourceState } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-initial-state.js';
import { prepareG4NaturalScenePerceptionInput, projectG4NaturalPerception } from '../../apps/game-server/src/runtime/g4-natural-perception.js';
import { createTargetCurrentFactualContext } from '../../apps/game-server/src/infrastructure/postgres/target-current-factual-context.js';
import { serveTargetHttpBrowserSmoke } from './target-http-browser-smoke.js';
import { createLlmSettingsFileStore } from '../../apps/game-server/src/infrastructure/filesystem/llm-settings-file.js';
import { createLlmSettingsOwner } from '../../apps/game-server/src/runtime/llm-settings.js';

/** Run after the isolated operator has issued, applied and read back exact target pins. */
export async function assertTargetCanonicalStartPostgres({ pool, itemPin, actorBinding, releaseInputs }) {
  const overlay = await approvedSevenStartsOverlay();
  try {
  const input = await targetCanonicalStartFixture();
  const worldReadback = await loadTargetStartWorldReadback({ pool, start: input.scenario_bundle.canonical_start.start });
  const runtime = await loadTargetAuthoredStartRuntime({ worldPool: pool, itemPin, actorBinding });
  Object.assign(input, runtime.materialization_inputs);
  const profile = runtime.profile;
  const domainCatalog = input.domain_catalog;
  const releaseContext = await loadSpatialV3TargetProductionRelease(releaseInputs);
  const release = deriveActivatedReleaseFromReadback(releaseContext.release,
    releaseContext.readback.item_pin, releaseContext.readback);
  const catalog = createTargetAuthoredStartCatalog({ runtime, release });
  const publication = await catalog.loadPublication(profile.scenario_id);
  Object.assign(input, publication.binding.execution_identity,
    { world_compatibility: publication.binding.world_compatibility });
  assert.equal(input.approved_actor_temporal_bundle.actor_profiles.region_category_options.length, 42);
  const authoredRule = profile.canonical_start.start.initial_perception_rule;
  const initialRule = runtime.initialRule;
  assert.equal(initialRule.scenario_id, profile.scenario_id);
  input.domain_catalog = domainCatalog; input.domain_catalog_pin = itemPin; input.scenario_bundle = profile;
  input.actor_base_attributes_runtime_profile = actorBinding.runtime_profile;
  input.actor_equipment_activation = { status: 'active', event_id: itemPin.activation_event_id };
  let result;
  for (let seed = 0; seed < 20; seed += 1) {
    input.idempotency_key = `target-activated-start-${seed}`;
    result = materializeAuthoredStartPartyInstance(input);
    if (result.immediate.npcs.length > 0) break;
  }
  assert.ok(result.immediate.npcs.length > 0, 'actual approved canonical composition selects nonzero NPCs');
  assert.equal(computeMaterializationEnvelopeDigest(JSON.parse(JSON.stringify(result))), result.trace.result_digest,
    'actual PostgreSQL source rows preserve the envelope digest through JSON persistence');
  const adapter = createLowerDvinaTracePhase1BProductionAdapter({ partyPool: pool, worldPool: pool, release,
    runtimeCatalogPin: itemPin, actorBaseAttributesBinding: actorBinding, targetStartRuntime: runtime,
    authoredStartResolver: catalog.resolveProfile, approvedActorCatalog: profile.actor_catalog });
  const commit = () => adapter.materialize({ ...result.request_identity, world_compatibility: input.world_compatibility });
  const first = await commit();
  assert.equal(first.status, 'committed');
  const reloaded = await createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) }).loadInternal(input.party_id);
  assert.deepEqual(reloaded, first.instance);
  await assertTargetNpcSemanticReadback({ pool, partyId: input.party_id, expectedNpcs: result.immediate.npcs });
  const targetProfiles = await loadTargetRuntimeProfiles({ worldRevisionId: release.world_revision_id, verifiedCatalog: domainCatalog });
  const a1 = createLowerDvinaTraceA1ProductionResolverFactory({ pool,
    loadedProfile: targetProfiles.materialization_profiles.actionProductionProfile })({ partyId: input.party_id });
  const garment = reloaded.items.find((item) => item.placement.holder_character_id === reloaded.player.instance_id);
  assert.ok(garment);
  const sourceRequest = { actor_ref: reloaded.player.instance_id,
    item_ref: garment.item_id, source_refs: [garment.item_id], tool_refs: [], committed_state_version: 0,
    root_turn_id: 'target-a1-admission-proof', step_index: 1 };
  assert.equal(await a1.referencesApplicable(sourceRequest), true);
  const foreignA1 = structuredClone(targetProfiles.materialization_profiles.actionProductionProfile);
  foreignA1.target_applicability.world_revision_id = 'foreign-world';
  await assert.rejects(createLowerDvinaTraceA1ProductionResolverFactory({ pool, loadedProfile: foreignA1 })({
    partyId: input.party_id }).referencesApplicable(sourceRequest), { code: 'M2C_TARGET_A1_APPLICABILITY_DATA_GAP' });
  const physicalPosition = (await pool.query(`SELECT location.scene_position_id AS position_id,position.g6_instance_id
    FROM party_runtime.party_journey_locations location JOIN party_runtime.scene_position_nodes position
      ON position.party_id=location.party_id AND position.id=location.scene_position_id
    WHERE location.party_id=$1 AND location.owner_kind='actor' AND location.owner_id=$2`,
  [input.party_id, reloaded.player.instance_id])).rows;
  assert.equal(physicalPosition.length, 1);
  assert.equal(reloaded.position.position_id, physicalPosition[0].position_id);
  assert.equal(reloaded.position.g6_instance_id, physicalPosition[0].g6_instance_id);
  const replay = await commit();
  assert.equal(replay.status, 'replayed');
  assert.deepEqual(replay.instance, first.instance);
  assert.deepEqual(reloaded.player.base_attributes.values, result.immediate.player.base_attributes.values);
  const playerBasis = (await pool.query(`SELECT language_profile_snapshot FROM party_runtime.party_actor_profile_bindings
    WHERE party_id=$1 AND actor_id=$2`, [input.party_id, result.immediate.player.instance_id])).rows;
  assert.equal(playerBasis.length, 1);
  assert.deepEqual(playerBasis[0].language_profile_snapshot, result.immediate.player.dossier.language);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_npcs WHERE party_id=$1', [input.party_id])).rows[0].count,
    result.immediate.npcs.length);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1', [input.party_id])).rows[0].count, 1);
  const pinned = (await pool.query('SELECT catalog_scope,catalog_revision_id,catalog_digest,activation_event_id FROM party_runtime.party_catalog_pins WHERE party_id=$1', [input.party_id])).rows;
  for (const pin of [itemPin, actorBinding.pin]) assert.ok(pinned.some((row) => row.catalog_scope === pin.catalog_scope
    && row.catalog_revision_id === pin.catalog_revision_id && row.catalog_digest === pin.catalog_digest
    && row.activation_event_id === pin.activation_event_id));
  const transaction = await pool.connect();
  try {
    await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await transaction.query('SAVEPOINT physical_position_check');
    const otherPosition = (await transaction.query(`SELECT id FROM party_runtime.scene_position_nodes
      WHERE party_id=$1 AND id<>$2 ORDER BY id LIMIT 1`, [input.party_id, reloaded.position.position_id])).rows[0];
    assert.ok(otherPosition);
    await transaction.query(`UPDATE party_runtime.party_journey_locations SET scene_position_id=$3
      WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$2`,
    [input.party_id, result.immediate.player.instance_id, otherPosition.id]);
    await assert.rejects(createLowerDvinaTracePhase1ARepository({ query: transaction.query.bind(transaction) })
      .loadInternal(input.party_id), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
    await transaction.query('ROLLBACK TO SAVEPOINT physical_position_check');
    const args = { transaction, partyId: input.party_id, actorId: result.immediate.player.instance_id,
      verifiedCatalog: domainCatalog, pin: itemPin, worldBaseReader: worldReadback.worldBaseReader,
      readCurrentSourceState: (request) => readInitialCanonicalNaturalSourceState({ ...request,
        rule_ref: { id: authoredRule.id, version: authoredRule.version } }) };
    const currentFacts = await readCurrentNaturalPerceptionFacts(args);
    const perceptionInput = prepareG4NaturalScenePerceptionInput({ verifiedCatalog: domainCatalog, pin: itemPin, currentFacts });
    const perceived = projectG4NaturalPerception({ input: perceptionInput, partyId: input.party_id,
      actorId: result.immediate.player.instance_id, positionId: currentFacts.observer.position_id });
    assert.ok(perceived.perceived_facts.length > 0, 'actual initial world supplies the pre-session natural opening');
    await transaction.query('UPDATE party_runtime.party_clocks SET state_version=state_version+1 WHERE party_id=$1', [input.party_id]);
    await assert.rejects(readCurrentNaturalPerceptionFacts(args), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  } finally {
    await transaction.query('ROLLBACK');
    transaction.release();
  }
  // The production narration owner runs against the actual persisted visible package;
  // only the external model response is deterministic in this isolated acceptance.
  const narrationRoles = [];
  const providerTimings = [];
  const previousFetch = globalThis.fetch;
  const realProvider = process.env.RUS_TARGET_HTTP_BROWSER_SMOKE_PROVIDER === 'real';
  const llmSettings = realProvider
    ? createLlmSettingsOwner({ initialRecord: await createLlmSettingsFileStore().load() }) : null;
  if (realProvider) assert.equal(llmSettings.providerSnapshot().mode, 'custom',
    'real browser smoke requires configured local LLM settings');
  if (!realProvider) globalThis.fetch = async (url, init) => {
      const providerStarted = performance.now();
      assert.equal(String(url), 'https://target-acceptance.invalid/chat/completions');
      const call = JSON.parse(init.body);
      const modelInput = JSON.parse(call.messages.find((message) => message.role === 'user').content);
      const isWriter = call.messages[0].content.startsWith('Return only {"prose"');
      narrationRoles.push(isWriter ? 'gameplay_narrator' : 'gameplay_narrator_auditor');
      let output;
      if (isWriter) {
        const context = modelInput.visible_context_package;
        assert.equal(context.known_context.some((entry) => /лодоч|рыбацкий стан/u.test(entry.text)), false);
        assert.equal(context.visible_npcs.length, 0, 'unproven NPC perception is not co-location disclosure');
        output = { prose: context.visible_scene_dossier.must_include.map((entry) => entry.text).join('\n\n') };
      } else {
        assert.ok(call.messages[0].content.startsWith('Return only {"pass"'));
        output = { pass: true, failed_checks: [], concerns: [], evidence: ['Test response uses the supplied committed visible facts.'] };
      }
      providerTimings.push({ role: narrationRoles.at(-1), duration_ms: performance.now() - providerStarted });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
  };
  let publicRuntime;
  const rootStarted = performance.now();
  try {
  const rootOptions = {
    env: { DEEPSEEK_API_KEY: 'isolated-fixture-key', DEEPSEEK_BASE_URL: 'https://target-acceptance.invalid' },
    config: { spatialV3BindingsModule: 'builtin:spatial-v3-production-v17', rootDir: overlay.rootDir,
      runtimeCatalogPinManifestDigest: itemPin.compatible_world_pin_manifest_digest,
      targetCatalogActivationApprovals: { itemApproval: releaseInputs.itemApproval, actorApproval: releaseInputs.actorApproval },
      traceTurnDecisionSecret: 'isolated-target-acceptance-secret',
      ...(realProvider ? { llmSettings } : {}) },
    pools: { worldPool: { query: pool.query.bind(pool), async connect() {
      const client = await pool.connect();
      return { query: client.query.bind(client), release() { client.release(true); } };
    } }, partyPool: pool, async close() {} },
    worldKnowledgeEncoderFactory: () => ({ async ready() {}, async encode() { return new Float32Array(1024); }, async close() {} }) };
  publicRuntime = await createSpatialV3ProductionCompositionRoot(rootOptions);
  assert.equal(publicRuntime.health().release_id, release.release_id);
  assert.equal(publicRuntime.health().world_revision_id, release.world_revision_id);
  const publicCatalog = await publicRuntime.listScenarios();
  assert.deepEqual(publicCatalog.scenarios.map((entry) => entry.scenario_id),
    overlay.manifest.starts.map((entry) => entry.scenario_id));
  assert.ok(publicCatalog.scenarios.every((entry) => entry.available));
  const startupMs = performance.now() - rootStarted;
  const publicRequest = { scenario_id: profile.scenario_id, request_id: 'target-real-public-opening' };
  const openingStarted = performance.now();
  const opening = await publicRuntime.startNewGame(publicRequest);
  const openingMs = performance.now() - openingStarted;
  const playtestPath = join(tmpdir(), `novgorod-target-official-start-${process.pid}.json`);
  await writeFile(playtestPath, JSON.stringify({ release_id: release.release_id,
    scenario_id: profile.scenario_id, endpoint: 'officialRoot.startNewGame',
    operational_approval_scope: 'isolated PostgreSQL fixture only',
    external_provider: realProvider ? 'configured_local_settings' : 'deterministic HTTP fixture',
    first_screen: opening.screen,
    timing_ms: { root_startup_and_catalog: startupMs, public_start_total: openingMs,
      external_provider_calls: providerTimings,
      generation_commit_projection: null,
      unavailable_timing_reason: 'Existing production facade exposes no separate stage timers.' },
    generative_materialization_calls: 0, observed_model_roles: narrationRoles }, null, 2));
  console.log(`Target official start playtest: ${playtestPath}`);
  assert.equal(opening.screen.schema, 'first_game_screen');
  assert.equal(opening.screen.scenario_id, profile.scenario_id);
  if (!realProvider) assert.deepEqual(narrationRoles, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  assert.deepEqual(await publicRuntime.startNewGame(publicRequest), opening);
  assert.equal((await publicRuntime.getPartyScreen(opening.party_id)).screen.main_prose, opening.screen.main_prose);
  await publicRuntime.acknowledgeOpening(opening.party_id, { client_ack_id: 'target-public-ack' });
  const opened = new Map([[profile.scenario_id, { partyId: opening.party_id, digest: canonicalDigest(opening.screen) }]]);
  for (const entry of overlay.manifest.starts.slice(1)) {
    const next = await publicRuntime.startNewGame({ scenario_id: entry.scenario_id,
      request_id: `target-seven-starts-${entry.binding_revision}` });
    assert.equal(next.screen.schema, 'first_game_screen');
    assert.equal(next.screen.scenario_id, entry.scenario_id);
    assert.equal(next.screen.main_prose.trim().length > 0, true);
    assert.equal(next.screen.panels.route.visible, true);
    assert.equal(next.screen.panels.character.visible, true);
    assert.ok(next.screen.visible_context.place);
    assert.ok(next.screen.visible_context.timestamp);
    assert.ok(next.screen.visible_context.environment);
    assert.equal(next.screen.delivery_state.ready, true);
    assert.equal(canonicalDigest((await publicRuntime.getPartyScreen(next.party_id)).screen),
      canonicalDigest(next.screen));
    const ack = await publicRuntime.acknowledgeOpening(next.party_id,
      { client_ack_id: `target-seven-starts-ack-${entry.binding_revision}` });
    assert.equal(ack.screen_digest, canonicalDigest(next.screen));
    opened.set(entry.scenario_id, { partyId: next.party_id, digest: ack.screen_digest });
  }
  for (const [scenarioId, { partyId, digest }] of opened) {
    const look = await publicRuntime.getPartyScreen(partyId);
    assert.equal(look.screen.scenario_id, scenarioId);
    assert.equal(canonicalDigest(look.screen), digest);
  }
  const phase2 = createLowerDvinaTracePhase2PostgresRepository({ partyPool: pool,
    committer: { async commit() { throw new Error('read acceptance must not commit a turn'); } },
    authoredRuntimeBindingResolver: catalog.resolveRuntimeBinding,
    loadInitialNaturalScenePerceptionInput: adapter.loadNaturalScenePerceptionInput });
  const initialTurn = await phase2.loadPhase2State(opening.party_id);
  assert.equal(initialTurn.scenario_id, profile.scenario_id);
  assert.notEqual(initialTurn.position.location_ref, 'trace_ld_v1_loc_wreck_shore');
  assert.equal(initialTurn.current_visible_context.visible_npc.length, 0,
    'first-turn bootstrap preserves the P22 entity boundary');
  const factualReader = createTargetCurrentFactualContext({ partyPool: pool, runtime,
    committer: { async commit() { throw new Error('factual reader must not commit'); } },
    authoredRuntimeBindingResolver: catalog.resolveRuntimeBinding });
  const factualTransaction = await pool.connect();
  try {
    await factualTransaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const factual = await factualReader.readFactualContext({ transaction: factualTransaction,
      request: { party_id: opening.party_id, actor_id: initialTurn.actor_id,
        source_position_id: initialTurn.position.position_id } });
    assert.equal(factual.ok, true);
    assert.deepEqual(factual.environment, initialTurn.environment_snapshot);
    assert.equal((await factual.recheck({ transaction: factualTransaction })).ok, true);
    await factualTransaction.query('UPDATE party_runtime.party_clocks SET state_version=state_version+1 WHERE party_id=$1', [opening.party_id]);
    await assert.rejects(factual.recheck({ transaction: factualTransaction }));
  } finally {
    await factualTransaction.query('ROLLBACK'); factualTransaction.release();
  }
  const reloadedRuntime = await createSpatialV3ProductionCompositionRoot(rootOptions);
  try {
    for (const [scenarioId, { partyId, digest }] of opened) {
      const reloaded = await reloadedRuntime.getPartyScreen(partyId);
      assert.equal(reloaded.screen.scenario_id, scenarioId);
      assert.equal(canonicalDigest(reloaded.screen), digest);
    }
  } finally { await reloadedRuntime.close(); }
  if (process.env.RUS_TARGET_HTTP_BROWSER_SMOKE === 'true') {
    await serveTargetHttpBrowserSmoke({ root: { ...publicRuntime,
      ...(realProvider ? { getLlmSettings: () => llmSettings.read() } : {}) }, pool, realProvider });
  }
  } finally {
    globalThis.fetch = previousFetch;
    await publicRuntime?.close();
  }
  } finally { await rm(overlay.rootDir, { recursive: true, force: true }); }
}

async function approvedSevenStartsOverlay() {
  const sourceRoot = resolve(import.meta.dirname, '../..');
  const rootDir = await mkdtemp(join(tmpdir(), 'novgorod-seven-starts-'));
  const relative = 'data/world-catalogs/novgorod/live-world-runtime-v17';
  const manifest = JSON.parse(await readFile(join(sourceRoot, relative,
    'target-starts-manifest.v1.candidate.json'), 'utf8'));
  try {
    let source = sourceRoot; let target = rootDir;
    for (const segment of [...relative.split('/'), 'target-starts-manifest.v1.json']) {
      await mkdir(target, { recursive: true });
      for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.name === segment) continue;
        const from = join(source, entry.name); const to = join(target, entry.name);
        if (entry.isDirectory()) await symlink(from, to, 'junction');
        else if (entry.isFile()) await link(from, to);
      }
      source = join(source, segment); target = join(target, segment);
    }
    const starts = process.env.RUS_TARGET_HTTP_BROWSER_SMOKE === 'true'
      ? manifest.starts.slice(0, 1) : manifest.starts;
    await writeFile(target, `${JSON.stringify({ ...manifest, starts, status: 'approved',
      activation_authorized: true }, null, 2)}\n`);
    return { rootDir, manifest: { ...manifest, starts } };
  } catch (error) { await rm(rootDir, { recursive: true, force: true }); throw error; }
}
