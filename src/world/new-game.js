import { buildWorldCluster } from './cluster.js';
import { buildPlayerProfile } from './entities.js';
import { createWorldState } from './state.js';
import {
  isWorldDataPostgresEnabled,
  loadHistoryPackFromDb,
  loadRegionContext,
  resolveHistoryPackId
} from './world-base-db.js';
import { loadRegionCatalog, loadRegionCatalogAsync, pickRandomRusRegion } from './region-catalog.js';
import { syncCurrentPlace } from './location.js';
import {
  generateActorProfiles,
  generateHistoricalFrame,
  generateLocationProfiles,
  generateMasterResponse,
  repairMasterNarrativeForRecoveryRoute,
  validateMasterNarrativeAgainstVisibleInputs,
  generateVisibleContextPackage,
  generateNarratorProse,
  generatePlaceSeed,
  generatePlayerSeed,
  generateSocialTissue
} from './provider.js';
import { planMasterTurn } from './master.js';
import { saveInitialWorld } from './persistence.js';
import { parseEnvBoolean } from '../env-boolean.js';
import { runNewGamePipeline } from './new-game-pipeline/index.js';

const MODEL_TIER_PRO = 'pro_thinking';
const MODEL_TIER_SENIOR = 'senior_pro_thinking_max';
const PIPELINE_RUNTIME_NEW = 'new_lifecycle';
const PIPELINE_RUNTIME_LEGACY = 'legacy_provider';

export async function createFreshWorld(options = {}) {
  const env = options.env ?? process.env;
  const tracker = options.tracker ?? null;
  const hooks = tracker?.telemetry?.({
    pipelineRuntime: isNewGamePipelineOptInEnabled(options, env) ? PIPELINE_RUNTIME_NEW : PIPELINE_RUNTIME_LEGACY,
    legacyProviderRuntimeUsed: !isNewGamePipelineOptInEnabled(options, env)
  }) ?? {};
  const startText = String(options.startText ?? env.START_TEXT ?? '').trim();
  const playerName = String(options.playerName ?? '').trim();
  if (isNewGamePipelineOptInEnabled(options, env)) {
    return createFreshWorldWithNewGamePipeline({ ...options, env, tracker, startText, playerName });
  }

  const player = playerName ? { name: playerName } : {};
  const isBlankStart = !startText && !String(env.START_REGION ?? '').trim();
  const legacyHooks = markLegacyProviderHooks(hooks);
  const regionCatalog = isWorldDataPostgresEnabled(env)
    ? await loadRegionCatalogAsync(env)
    : loadRegionCatalog();

  const frameResult = await generateHistoricalFrame({
    startText,
    playerName,
    regionHint: env.START_REGION ?? '',
    yearHint: null,
    regionCatalog,
    blankStart: isBlankStart
  }, env, legacyHooks);

  const historicalFrame = frameResult.data;
  const world = createWorldState({
    startText: historicalFrame.startTextHint ?? startText,
    player,
    historicalFrame,
    history: {
      era: 'XIII век',
      year: historicalFrame.year,
      season: historicalFrame.season,
      regionHint: historicalFrame.regionHint
    },
    region: {
      name: historicalFrame.regionName,
      economy: [historicalFrame.pressure],
      politics: [historicalFrame.conflict],
      tensions: [historicalFrame.pressure, historicalFrame.conflict]
    }
  });
  if (isWorldDataPostgresEnabled(env)) {
    await attachWorldBaseContext(world, env, legacyHooks);
  }

  const placeSeedResult = await generatePlaceSeed(world, env, legacyHooks);
  applyGeneratedPlaceSeed(world, placeSeedResult.data);

  const socialTissueResult = await generateSocialTissue(world, env, legacyHooks);
  applyGeneratedSocialTissue(world, socialTissueResult.data);

  const playerSeedResult = await generatePlayerSeed(world, env, legacyHooks);
  applyGeneratedPlayerSeed(world, playerSeedResult.data);

  const profileResult = await generateActorProfiles(world, env, legacyHooks);
  applyGeneratedActorProfiles(world, profileResult.data);

  const locationProfileResult = await generateLocationProfiles(world, env, legacyHooks);
  applyGeneratedLocationProfiles(world, locationProfileResult.data);

  world.cluster = buildWorldCluster(world);
  syncCurrentPlace(world);

  const openingPlan = await planMasterTurn(world, 'осматриваюсь');
  const legacyCheckpoints = new Map();
  const checkpoint = (stage, input, output, audit = null, sourceRefs = [], modelTier = MODEL_TIER_PRO, attemptIndex = 1, repairAttemptIndex = 0) => {
    legacyCheckpoints.set(stage, {
      stage,
      input: cloneCheckpointValue(input),
      output: cloneCheckpointValue(output),
      audit: cloneCheckpointValue(audit),
      source_refs: Array.isArray(sourceRefs) ? sourceRefs.slice() : [],
      model_tier: modelTier,
      attempt_index: attemptIndex,
      repair_attempt_index: repairAttemptIndex,
      created_at: new Date().toISOString()
    });
  };

  let openingMasterResult = await generateMasterResponse(openingPlan.frame, 'opening_scene', env, legacyHooks);
  let openingNarrative = openingMasterResult?.narrative;
  if (!openingNarrative?.scene) {
    throw new Error('LLM не вернул master_narrative для первой сцены.');
  }
  checkpoint('master_narrative', { input: openingPlan.frame?.input, localOutcome: 'opening_scene' }, openingNarrative, openingNarrative?.historical_audit ?? null, extractMasterNarrativeSourceRefs(openingNarrative));

  const recoveryRoute = validateMasterNarrativeAgainstVisibleInputs(world, openingNarrative);
  if (recoveryRoute) {
    legacyHooks.onStage?.({
      phase: 'consistency_gate',
      label: 'NarrativeVisibleConsistencyGate',
      message: 'master_narrative требует upstream repair до visible_context_package.',
      pipeline_runtime: PIPELINE_RUNTIME_LEGACY,
      legacy_provider_runtime_used: true,
      attempt: 1,
      maxAttempts: 1,
      recovery_class: recoveryRoute.class,
      repair_target_stage: recoveryRoute.repair_target_stage,
      rerun_from_stage: recoveryRoute.rerun_from_stage,
      forbidden_local_fix: recoveryRoute.forbidden_local_fix,
      repair_attempt_index: 0,
      model_tier: MODEL_TIER_PRO,
      terminal_status: recoveryRoute.terminal_status
    });
    const repairedMaster = await repairMasterNarrativeForRecoveryRoute(
      openingPlan.frame,
      'opening_scene',
      openingNarrative,
      recoveryRoute,
      env,
      legacyHooks
    );
    openingMasterResult = repairedMaster;
    openingNarrative = repairedMaster.narrative;
    checkpoint('master_narrative', { input: openingPlan.frame?.input, localOutcome: 'opening_scene' }, openingNarrative, openingNarrative?.historical_audit ?? null, extractMasterNarrativeSourceRefs(openingNarrative), MODEL_TIER_SENIOR, 1, 1);
  }

  const visibleContextResult = await generateVisibleContextPackage(world, openingNarrative, env, legacyHooks);
  checkpoint('visible_context_package', { narrative: openingNarrative }, visibleContextResult.data, null, extractVisibleContextSourceRefs(visibleContextResult.data));
  const openingProseResult = await generateNarratorProse(openingPlan.frame, visibleContextResult.data, env, legacyHooks);
  checkpoint('narrator_prose', { visible_context_package: visibleContextResult.data }, { prose: openingProseResult?.prose ?? '' }, null, []);
  const openingText = String(openingProseResult?.prose ?? '').trim();
  if (!openingText) {
    throw new Error('LLM не вернул прозу для первой сцены.');
  }

  world.lastNarratorProse = openingText;
  world.pipeline_runtime = PIPELINE_RUNTIME_LEGACY;
  world.legacy_provider_runtime_used = true;
  if (options.savePath) {
    runInitialWorldCommitGate(world, legacyHooks);
    await saveInitialWorld(options.savePath, world);
  }

  return {
    pipeline_runtime: PIPELINE_RUNTIME_LEGACY,
    legacy_provider_runtime_used: true,
    world,
    openingText,
    text: 'Новая игра создана. Мир сброшен к исходной точке.'
  };
}

export function isNewGamePipelineOptInEnabled(options = {}, env = process.env) {
  return options.enableNewGamePipeline === true
    || parseEnvBoolean(env.NEW_GAME_PIPELINE_ENABLED, false);
}

async function createFreshWorldWithNewGamePipeline(options = {}) {
  const runner = options.newGamePipelineRunner ?? runNewGamePipeline;
  const result = await runner({
    ...options,
    enableNewGamePipeline: true,
    persistPartyStart: options.persistPartyStart ?? true
  });
  if (result?.world && typeof result.world === 'object') {
    result.world.pipeline_runtime = PIPELINE_RUNTIME_NEW;
    result.world.legacy_provider_runtime_used = false;
  }
  const partyScreenPayload = extractNewGamePipelinePartyScreenPayload(result);
  if (!partyScreenPayload?.firstGameScreen) {
    throw new Error('26-step new-game pipeline did not return ready first_game_screen.');
  }

  return {
    schema: 'new_game_pipeline_world_start',
    pipeline_runtime: PIPELINE_RUNTIME_NEW,
    legacy_provider_runtime_used: false,
    world: result.world ?? null,
    openingText: partyScreenPayload.openingText,
    text: 'Новая игра создана через 26-этапный pipeline.',
    firstGameScreen: partyScreenPayload.firstGameScreen,
    first_game_screen: partyScreenPayload.firstGameScreen,
    partyScreenPayload,
    partyStartCommitted: result.partyStartCommitted ?? result.party_start_committed ?? null,
    newGamePipeline: result
  };
}

function markLegacyProviderHooks(hooks = {}) {
  return {
    ...hooks,
    pipelineRuntime: PIPELINE_RUNTIME_LEGACY,
    pipeline_runtime: PIPELINE_RUNTIME_LEGACY,
    legacyProviderRuntimeUsed: true,
    legacy_provider_runtime_used: true
  };
}

export function extractNewGamePipelinePartyScreenPayload(result = {}) {
  const firstGameScreen = result.firstGameScreen
    ?? result.first_game_screen
    ?? result.partyScreenPayload?.firstGameScreen
    ?? result.party_screen_payload?.firstGameScreen
    ?? result.party_screen_payload?.first_game_screen
    ?? result.stage_outputs?.first_game_screen
    ?? result.stageOutputs?.first_game_screen
    ?? result.snapshot?.outputs?.[26]
    ?? null;

  if (firstGameScreen?.schema !== 'first_game_screen' || firstGameScreen?.screen_status !== 'ready') {
    return null;
  }

  return {
    version: 1,
    schema: result.partyScreenPayload?.schema ?? result.party_screen_payload?.schema ?? 'party_first_screen_ui_payload',
    party_id: firstGameScreen.party_id ?? null,
    openingText: String(result.openingText ?? result.partyScreenPayload?.openingText ?? result.party_screen_payload?.openingText ?? firstGameScreen.main_prose ?? ''),
    firstGameScreen,
    first_game_screen: firstGameScreen,
    delivery_state: firstGameScreen.delivery_state ?? null
  };
}

async function attachWorldBaseContext(world, env, hooks = {}) {
  const regionId = resolveWorldBaseRegionId(world);
  const historyPackId = resolveHistoryPackId(world);
  try {
    const [regionContext, historyPack] = await Promise.all([
      regionId ? loadRegionContext(regionId, env) : null,
      historyPackId ? loadHistoryPackFromDb(historyPackId, env) : null
    ]);
    world.worldBase = {
      source: 'postgres',
      regionId,
      historyPackId,
      regionContext,
      historyPack
    };
  } catch (error) {
    hooks.onStage?.({
      phase: 'world_base',
      label: 'World base loader',
      message: `Postgres world_base context unavailable: ${error.message ?? error}`
    });
  }
}

function resolveWorldBaseRegionId(world = {}) {
  const text = [
    world.historicalFrame?.regionName,
    world.historicalFrame?.regionHint,
    world.region?.name,
    world.history?.regionHint
  ].filter(Boolean).join(' ').toLowerCase();
  if (/новгород|novgorod|волхов|volkhov|ильмен|ilmen/u.test(text)) return 'region_novgorod_land';
  return null;
}

function runInitialWorldCommitGate(world, hooks = {}) {
  const missing = [];
  if (!world.historicalFrame) missing.push('historicalFrame');
  if (!world.placeSeed) missing.push('placeSeed');
  if (!world.playerSeed) missing.push('playerSeed');
  if (!world.socialTissue) missing.push('socialTissue');
  if (!world.lastNarratorProse) missing.push('lastNarratorProse');
  if (missing.length > 0) {
    throw new Error(`Initial world commit gate failed: missing ${missing.join(', ')}`);
  }
  hooks.onStage?.({
    phase: 'commit_gate',
    label: 'Initial world commit gate',
    message: 'Initial generated world passed structural commit gate.',
    responseRaw: { missing: [] }
  });
}

export function buildRandomStartupFrame(regionCatalog) {
  // ponytail: test/fixture helper only — production blank start defers year/region to LLM
  const region = pickRandomRusRegion(regionCatalog);
  const year = randomIntInclusive(1230, 1250);
  return {
    year,
    regionName: region?.name ?? '',
    regionHint: region?.name ?? ''
  };
}

export function applyStartupDefaults(frame, randomStart) {
  // ponytail: deprecated — kept for tests that assert legacy candidate frames
  if (!frame || typeof frame !== 'object' || !randomStart) return frame;
  return {
    ...frame,
    year: randomStart.year,
    regionName: randomStart.regionName,
    regionHint: randomStart.regionHint,
    startTextHint: frame.startTextHint ?? ''
  };
}

function randomIntInclusive(min, max) {
  const lower = Math.floor(min);
  const upper = Math.floor(max);
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function cloneCheckpointValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return structuredClone(value);
}

function extractMasterNarrativeSourceRefs(narrative = {}) {
  return (Array.isArray(narrative?.npc_reaction_refs) ? narrative.npc_reaction_refs : [])
    .map((item) => item?.actor_ref)
    .filter((item) => typeof item === 'string' && item.trim());
}

function extractVisibleContextSourceRefs(visibleContext = {}) {
  return (Array.isArray(visibleContext?.visible_npc) ? visibleContext.visible_npc : [])
    .map((item) => item?.source_ref)
    .filter((item) => typeof item === 'string' && item.trim());
}

function applyGeneratedActorProfiles(world, data = {}) {
  if (!world || typeof world !== 'object') return;
  if (data.player && typeof data.player === 'object') {
    const mergedPlayer = {
      ...world.player,
      ...data.player,
      family: Array.isArray(data.player.family) ? data.player.family.slice() : (world.player.family ?? []),
      memory: Array.isArray(data.player.memory) ? data.player.memory.slice() : (world.player.memory ?? []),
      knowledge: Array.isArray(data.player.knowledge) ? data.player.knowledge.slice() : (world.player.knowledge ?? []),
      fears: Array.isArray(data.player.fears) ? data.player.fears.slice() : (world.player.fears ?? []),
      goals: Array.isArray(data.player.goals) ? data.player.goals.slice() : (world.player.goals ?? []),
      obligations: Array.isArray(data.player.obligations) ? data.player.obligations.slice() : (world.player.obligations ?? [])
    };
    world.player = buildPlayerProfile(mergedPlayer);
    if (data.player.actorProfile) {
      world.player.actorProfile = data.player.actorProfile;
    }
  }

  if (Array.isArray(data.npcs)) {
    for (const generated of data.npcs) {
      if (!generated || typeof generated !== 'object') continue;
      const npc = (world.npcs ?? []).find((item) => item.id === generated.id);
      if (!npc) continue;
      Object.assign(npc, generated);
      if (generated.actorProfile) {
        npc.actorProfile = generated.actorProfile;
      }
    }
  }
}

export function applyGeneratedPlayerSeed(world, data = {}) {
  if (!world || typeof world !== 'object' || !data || typeof data !== 'object') return;
  const canonicalData = promotePlayerSeedCompatibilityFields(data);
  const occupation = String(canonicalData.occupation ?? '').trim();
  const cloneObject = (value) => (value && typeof value === 'object' ? structuredClone(value) : null);
  const currentPosition = cloneObject(canonicalData.current_position ?? canonicalData.position ?? world.current_position ?? world.player?.position);
  const inventory = resolveSeedInventory(canonicalData);
  const property = resolveSeedProperty(canonicalData);
  const memory = resolveSeedMemory(canonicalData);
  const knowledge = resolveSeedKnowledge(canonicalData);
  const fears = resolveSeedFears(canonicalData);
  const goals = resolveSeedGoals(canonicalData);
  const obligations = resolveSeedObligations(canonicalData);
  const pickVital = (...values) => {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  };
  const baseStates = cloneObject(canonicalData.states) ?? cloneObject(world.player?.states) ?? {};
  const baseBody = cloneObject(canonicalData.body) ?? cloneObject(world.player?.body) ?? {};
  // Canonical blocks are the source of truth; root vitals are no longer accepted as seed input.
  const seedHealth = pickVital(baseStates.health, baseBody.health, 100);
  const seedSatiety = pickVital(baseStates.satiety, baseBody.satiety, 100);
  const seedVigor = pickVital(baseStates.vigor, baseBody.vigor, 100);
  const seedStates = {
    ...baseStates,
    health: seedHealth,
    satiety: seedSatiety,
    vigor: seedVigor
  };
  const seedBody = {
    ...baseBody,
    health: seedHealth,
    satiety: seedSatiety,
    vigor: seedVigor
  };
  world.playerSeed = {
    version: canonicalData.version ?? 1,
    schema: canonicalData.schema ?? 'player_seed',
    profileSource: canonicalData.profileSource ?? 'player_seed',
    name: canonicalData.name ?? canonicalData.identity?.name ?? null,
    role: canonicalData.role ?? canonicalData.identity?.occupation_or_role ?? canonicalData.identity?.occupationOrRole ?? null,
    status: canonicalData.status ?? canonicalData.identity?.visible_status ?? canonicalData.identity?.visibleStatus ?? canonicalData.identity?.social_status ?? canonicalData.identity?.socialStatus ?? null,
    socialClass: canonicalData.socialClass ?? canonicalData.identity?.social_status ?? canonicalData.identity?.socialStatus ?? null,
    ageRange: canonicalData.ageRange ?? canonicalData.identity?.age_range ?? canonicalData.identity?.ageRange ?? null,
    origin: canonicalData.origin ?? canonicalData.identity?.origin ?? null,
    visibleStatus: canonicalData.visibleStatus ?? canonicalData.identity?.visible_status ?? canonicalData.identity?.visibleStatus ?? canonicalData.identity?.social_status ?? canonicalData.identity?.socialStatus ?? null,
    trueStatus: canonicalData.trueStatus ?? canonicalData.identity?.true_status ?? canonicalData.identity?.trueStatus ?? null,
    reasonHere: canonicalData.reasonHere ?? canonicalData.identity?.reason_here ?? canonicalData.identity?.reasonHere ?? null,
    occupation: occupation || null,
    skills: Array.isArray(canonicalData.skills) ? canonicalData.skills.slice() : [],
    bodyState: canonicalData.bodyState ?? canonicalData.body?.description ?? canonicalData.body?.bodyState ?? canonicalData.body?.body_state ?? null,
    language: canonicalData.language ?? canonicalData.body?.language ?? null,
    literacy: canonicalData.literacy ?? canonicalData.body?.literacy ?? null,
    clothing: canonicalData.clothing ?? canonicalData.body?.clothing ?? null,
    family: Array.isArray(canonicalData.family) ? canonicalData.family.slice() : [],
    memory,
    knowledge,
    fears,
    goals,
    obligations,
    identity: cloneObject(canonicalData.identity),
    body: seedBody,
    states: seedStates,
    activeStates: Array.isArray(canonicalData.activeStates) ? canonicalData.activeStates.slice() : [],
    attributes: cloneObject(canonicalData.attributes),
    skill_bonuses: cloneObject(canonicalData.skill_bonuses),
    knowledge_map: cloneObject(canonicalData.knowledge_map),
    memory_profile: cloneObject(canonicalData.memory_profile),
    goals_profile: cloneObject(canonicalData.goals_profile),
    items: cloneObject(canonicalData.items),
    property_and_access: cloneObject(canonicalData.property_and_access),
    relations: cloneObject(canonicalData.relations),
    position: currentPosition,
    current_position: currentPosition,
    start_scene: cloneObject(canonicalData.start_scene)
  };
  // Canonical nested blocks feed the player profile first; legacy arrays remain only as fallback-adapter data.
  world.player = buildPlayerProfile({
    ...world.playerSeed,
    profileSource: 'player_seed'
  }, {
    currentLocationId: currentPosition?.location_id ?? world.currentLocationId,
    currentMicroLocationId: world.currentMicroLocationId ?? currentPosition?.minilocation_id ?? null,
    region_id: world.current_position?.region_id ?? null,
    current_position: currentPosition ?? world.current_position ?? null
  });
}

function promotePlayerSeedCompatibilityFields(data = {}) {
  const seed = structuredClone(data);
  const identity = seed.identity && typeof seed.identity === 'object' ? seed.identity : {};
  const body = seed.body && typeof seed.body === 'object' ? seed.body : {};
  const states = seed.states && typeof seed.states === 'object' ? seed.states : {};

  seed.name = preferPlayerSeedText(seed.name, identity.name);
  seed.role = preferPlayerSeedText(seed.role, identity.occupation_or_role, identity.occupationOrRole);
  seed.status = preferPlayerSeedText(seed.status, identity.visible_status, identity.visibleStatus, identity.social_status, identity.socialStatus);
  seed.socialClass = preferPlayerSeedText(seed.socialClass, identity.social_status, identity.socialStatus);
  seed.ageRange = preferPlayerSeedText(seed.ageRange, identity.age_range, identity.ageRange);
  seed.origin = preferPlayerSeedText(seed.origin, identity.origin);
  seed.visibleStatus = preferPlayerSeedText(seed.visibleStatus, identity.visible_status, identity.visibleStatus, identity.social_status, identity.socialStatus);
  seed.trueStatus = preferPlayerSeedText(seed.trueStatus, identity.true_status, identity.trueStatus);
  seed.reasonHere = preferPlayerSeedText(seed.reasonHere, identity.reason_here, identity.reasonHere);
  seed.occupation = preferPlayerSeedText(seed.occupation, identity.occupation_or_role, identity.occupationOrRole);
  seed.bodyState = preferPlayerSeedText(seed.bodyState, body.description, body.bodyState, body.body_state);
  seed.language = preferPlayerSeedText(seed.language, body.language);
  seed.literacy = preferPlayerSeedText(seed.literacy, body.literacy);
  seed.clothing = preferPlayerSeedText(seed.clothing, body.clothing);
  seed.skills = Array.isArray(seed.skills) && seed.skills.length > 0 ? seed.skills : deriveSkillLabelsFromBonuses(seed.skill_bonuses);

  const health = normalizeSeedNumericValue(states.health, body.health);
  const satiety = normalizeSeedNumericValue(states.satiety, body.satiety);
  const vigor = normalizeSeedNumericValue(states.vigor, body.vigor);
  if (health !== null || satiety !== null || vigor !== null) {
    seed.states = {
      ...states,
      ...(health !== null ? { health } : {}),
      ...(satiety !== null ? { satiety } : {}),
      ...(vigor !== null ? { vigor } : {})
    };
  }

  return seed;
}

function preferPlayerSeedText(current, ...candidates) {
  const currentText = String(current ?? '').trim();
  if (currentText) return current;
  for (const candidate of candidates) {
    const text = String(candidate ?? '').trim();
    if (text) return candidate;
  }
  return current;
}

function normalizeSeedNumericValue(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function deriveSkillLabelsFromBonuses(skillBonuses = {}) {
  if (!skillBonuses || typeof skillBonuses !== 'object' || Array.isArray(skillBonuses)) return [];
  return Object.entries(skillBonuses)
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(([key]) => key);
}

function resolveSeedInventory(data = {}) {
  const hasCanonicalItems = data.items && typeof data.items === 'object' && !Array.isArray(data.items);
  const canonical = collectSeedLabels([
    data.items?.carried_items,
    data.items?.carried,
    data.items?.equipment,
    data.items?.weapons,
    data.items?.armor
  ]);
  if (canonical.length > 0) return canonical;
  if (hasCanonicalItems) return [];
  return Array.isArray(data.inventory) ? data.inventory.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedProperty(data = {}) {
  const hasCanonicalItems = data.items && typeof data.items === 'object' && !Array.isArray(data.items);
  const hasPropertyAccess = data.property_and_access && typeof data.property_and_access === 'object' && !Array.isArray(data.property_and_access);
  const hasCanonicalPropertyBlocks = hasPropertyAccess
    || Boolean(hasCanonicalItems && (
      Object.prototype.hasOwnProperty.call(data.items, 'property_not_carried')
      || Object.prototype.hasOwnProperty.call(data.items, 'borrowed_items')
      || Object.prototype.hasOwnProperty.call(data.items, 'foreign_items_with_character')
    ));
  const canonical = collectSeedLabels([
    data.property_and_access?.property_not_carried,
    data.property_and_access?.borrowed_items,
    data.property_and_access?.foreign_items_with_character,
    data.items?.property_not_carried,
    data.items?.borrowed_items,
    data.items?.foreign_items_with_character
  ]);
  if (canonical.length > 0) return canonical;
  if (hasCanonicalPropertyBlocks) return [];
  return Array.isArray(data.property) ? data.property.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedMemory(data = {}) {
  const canonical = collectSeedLabels([
    data.memory_profile?.key_memories,
    data.memory_profile?.debts,
    data.memory_profile?.fears,
    data.memory_profile?.obligations,
    data.memory_profile?.unresolved_unknowns
  ]);
  if (canonical.length > 0) return canonical;
  return Array.isArray(data.memory) ? data.memory.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedKnowledge(data = {}) {
  const canonical = collectSeedLabels([
    data.knowledge_map?.known_facts,
    data.knowledge_map?.rumors,
    data.knowledge_map?.mistakes,
    data.knowledge_map?.unavailable_knowledge,
    data.knowledge_map?.known_places,
    data.knowledge_map?.known_routes,
    data.knowledge_map?.known_people
  ]);
  if (canonical.length > 0) return canonical;
  return Array.isArray(data.knowledge) ? data.knowledge.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedFears(data = {}) {
  const canonical = collectSeedLabels([
    data.memory_profile?.fears,
    data.goals_profile?.fear
  ]);
  if (canonical.length > 0) return canonical;
  return Array.isArray(data.fears) ? data.fears.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedGoals(data = {}) {
  const canonical = collectSeedLabels([
    data.goals_profile?.immediate_need,
    data.goals_profile?.long_term_desire,
    data.goals_profile?.reason_to_act
  ]);
  if (canonical.length > 0) return canonical;
  return Array.isArray(data.goals) ? data.goals.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function resolveSeedObligations(data = {}) {
  const canonical = collectSeedLabels([
    data.memory_profile?.obligations,
    data.goals_profile?.obligation
  ]);
  if (canonical.length > 0) return canonical;
  return Array.isArray(data.obligations) ? data.obligations.map((item) => itemLabel(item)).filter(Boolean) : [];
}

function collectSeedLabels(blocks = []) {
  const labels = [];
  const seen = new Set();

  for (const block of Array.isArray(blocks) ? blocks : []) {
    for (const item of Array.isArray(block) ? block : (block ? [block] : [])) {
      const label = itemLabel(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}

function itemLabel(item) {
  return String(item?.label ?? item?.name ?? item?.title ?? item ?? '').trim();
}

function applyGeneratedPlaceSeed(world, data = {}) {
  if (!world || typeof world !== 'object' || !data || typeof data !== 'object') return;
  const formalOwner = String(data.formalOwner ?? data.ownership ?? '').trim();
  const actualManager = String(data.actualManager ?? '').trim();
  const dependentGroups = Array.isArray(data.dependentGroups) ? data.dependentGroups.slice() : [];
  const placeSeedId = buildPlaceSeedId(world, data.placeName ?? world.place?.name ?? null, data.placeKind ?? world.place?.kind ?? null);
  world.placeSeed = {
    version: data.version ?? 1,
    schema: data.schema ?? 'place_seed',
    id: placeSeedId,
    placeName: data.placeName ?? world.place?.name ?? null,
    placeKind: data.placeKind ?? world.place?.kind ?? null,
    purpose: data.purpose ?? null,
    formalOwner: formalOwner || null,
    actualManager: actualManager || null,
    dependentGroups,
    ownership: formalOwner || null,
    livelihood: Array.isArray(data.livelihood) ? data.livelihood.slice() : [],
    roads: Array.isArray(data.roads) ? data.roads.slice() : [],
    accessRules: Array.isArray(data.accessRules) ? data.accessRules.slice() : [],
    hazards: Array.isArray(data.hazards) ? data.hazards.slice() : [],
    rhythm: data.rhythm ?? null
  };

  if (world.place) {
    world.place = {
      ...world.place,
      name: data.placeName ?? world.place.name,
      kind: data.placeKind ?? world.place.kind,
      purpose: data.purpose ?? world.place.purpose,
      formalOwner: formalOwner || world.place.formalOwner || world.place.ownership || null,
      actualManager: actualManager || world.place.actualManager || null,
      dependentGroups: dependentGroups.length ? dependentGroups.slice() : (Array.isArray(world.place.dependentGroups) ? world.place.dependentGroups.slice() : []),
      ownership: formalOwner || data.ownership || world.place.ownership || null,
      accessRules: Array.isArray(data.accessRules) ? data.accessRules.slice() : (world.place.accessRules ?? []),
      hazards: Array.isArray(data.hazards) ? data.hazards.slice() : (world.place.hazards ?? []),
      rhythm: data.rhythm ?? world.place.rhythm
    };
  }

  const location = world.locations?.[world.current_position?.location_id ?? ''];
  if (location) {
    location.profile = {
      ...(location.profile ?? {}),
      purpose: data.purpose ?? location.profile?.purpose,
      formalOwner: formalOwner || location.profile?.formalOwner || location.profile?.ownership || null,
      actualManager: actualManager || location.profile?.actualManager || null,
      dependentGroups: dependentGroups.length ? dependentGroups.slice() : (Array.isArray(location.profile?.dependentGroups) ? location.profile.dependentGroups.slice() : []),
      ownership: formalOwner || data.ownership || location.profile?.ownership || null,
      hazards: Array.isArray(data.hazards) ? data.hazards.slice() : (location.profile?.hazards ?? []),
      accessRules: Array.isArray(data.accessRules) ? data.accessRules.slice() : (location.profile?.accessRules ?? []),
      rhythm: data.rhythm ?? location.profile?.rhythm,
      economy: Array.isArray(data.livelihood) ? data.livelihood.slice() : (location.profile?.economy ?? []),
      routes: Array.isArray(data.roads) ? data.roads.slice() : (location.profile?.routes ?? [])
    };
  }
}

function buildPlaceSeedId(world, placeName, placeKind) {
  const prefix = slugifySegment(world?.worldKey ?? 'world');
  const namePart = slugifySegment(placeName ?? 'place');
  const kindPart = slugifySegment(placeKind ?? 'place');
  return `place:${prefix}:${namePart}:${kindPart}`;
}

function slugifySegment(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'x';
}

function applyGeneratedSocialTissue(world, data = {}) {
  if (!world || typeof world !== 'object' || !data || typeof data !== 'object') return;
  const formalOwner = String(data.formalOwner ?? world.placeSeed?.formalOwner ?? '').trim();
  const actualManager = String(data.actualManager ?? world.placeSeed?.actualManager ?? '').trim();
  const dependentGroups = Array.isArray(data.dependentGroups)
    ? data.dependentGroups.slice()
    : (Array.isArray(world.placeSeed?.dependentGroups) ? world.placeSeed.dependentGroups.slice() : []);
  world.socialTissue = {
    version: data.version ?? 1,
    schema: data.schema ?? 'social_tissue',
    formalOwner: formalOwner || null,
    actualManager: actualManager || null,
    dependentGroups,
    families: Array.isArray(data.families) ? data.families.slice() : [],
    powerStructure: summarizeOwnershipStructure(formalOwner || null, actualManager || null, dependentGroups),
    dependents: dependentGroups.slice(),
    trade: Array.isArray(data.trade) ? data.trade.slice() : [],
    rumors: Array.isArray(data.rumors) ? data.rumors.slice() : [],
    tensions: Array.isArray(data.tensions) ? data.tensions.slice() : [],
    obligations: Array.isArray(data.obligations) ? data.obligations.slice() : [],
    rhythm: data.rhythm ?? null,
    accessRules: Array.isArray(data.accessRules) ? data.accessRules.slice() : []
  };

  if (Array.isArray(data.tensions) && data.tensions.length) {
    world.region = {
      ...world.region,
      tensions: Array.from(new Set([...(world.region?.tensions ?? []), ...data.tensions]))
    };
  }

  if (Array.isArray(data.trade) && data.trade.length) {
    world.region = {
      ...world.region,
      economy: Array.from(new Set([...(world.region?.economy ?? []), ...data.trade]))
    };
  }

  if (Array.isArray(data.rumors) && data.rumors.length) {
    world.memory = {
      ...(world.memory ?? {}),
      heardRumors: Array.from(new Set([...(world.memory?.heardRumors ?? []), ...data.rumors]))
    };
  }
}

function summarizeOwnershipStructure(formalOwner, actualManager, dependentGroups = []) {
  const parts = [];
  if (formalOwner) parts.push(`formal owner: ${formalOwner}`);
  if (actualManager) parts.push(`actual manager: ${actualManager}`);
  if (Array.isArray(dependentGroups) && dependentGroups.length) {
    parts.push(`dependent groups: ${dependentGroups.join(', ')}`);
  }
  return parts.length ? parts.join('; ') : null;
}

function applyGeneratedLocationProfiles(world, data = {}) {
  if (!world || typeof world !== 'object' || !data || typeof data !== 'object') return;
  const list = Array.isArray(data.locations) ? data.locations : [];
  for (const generated of list) {
    if (!generated || typeof generated !== 'object' || typeof generated.id !== 'string') continue;
    const location = world.locations?.[generated.id];
    if (!location) continue;
    location.profile = mergeLocationProfile(location.profile ?? {}, generated);
    applyLocationProfileToLocation(location, generated);
  }
}

function mergeLocationProfile(base, generated) {
  const next = {
    ...base,
    ...generated,
    routes: {
      ...(base.routes ?? {}),
      ...(generated.routes ?? {})
    },
    sensory: {
      ...(base.sensory ?? {}),
      ...(generated.sensory ?? {})
    }
  };
  if (Array.isArray(generated.users)) next.users = generated.users.slice();
  if (Array.isArray(generated.hazards)) next.hazards = generated.hazards.slice();
  if (Array.isArray(generated.traces)) next.traces = generated.traces.slice();
  if (Array.isArray(generated.consequences)) next.consequences = generated.consequences.slice();
  if (Array.isArray(generated.periods)) next.periods = generated.periods.slice();
  if (generated.currentPeriod) next.currentPeriod = generated.currentPeriod;
  return next;
}

function applyLocationProfileToLocation(location, generated) {
  if (!location || !generated) return;
  if (typeof generated.purpose === 'string') location.purpose = generated.purpose;
  if (typeof generated.access === 'string') location.access = generated.access;
  if (typeof generated.ownership === 'object' || typeof generated.ownership === 'string') location.ownership = generated.ownership;
  if (Array.isArray(generated.hazards)) location.hazards = generated.hazards.slice();
  if (Array.isArray(generated.users)) location.users = generated.users.slice();
  if (Array.isArray(generated.periods)) location.periods = generated.periods.slice();
  if (generated.currentPeriod) location.currentPeriod = generated.currentPeriod;
  if (typeof generated.usage === 'string') location.usage = generated.usage;
  if (generated.sensory && typeof generated.sensory === 'object') {
    location.sensory = {
      ...(location.sensory ?? {}),
      ...generated.sensory
    };
  }
}
