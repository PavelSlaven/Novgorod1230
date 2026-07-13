import { pickScenario } from './scenarios.js';
import { buildPlaceView, buildSceneView, syncCurrentPlace, noteVisit, ensureLocationProfiles } from './location.js';
import { createSocialState } from './social.js';
import { buildHistoricalContext, syncHistoricalContext } from './historical-context.js';
import { buildWorldCluster } from './cluster.js';
import { buildNpcProfiles, buildPlayerProfile } from './entities.js';
import { buildLegalContext } from './law.js';
import { ensureWorldLogs } from './event-log.js';
import { buildCurrentPosition } from './profile-v2.js';
import { normalizeDelayedEventList } from './delayed-events.js';
import { RNG_ALGORITHM } from './rng.js';

const LOCATION_MUTABLE_KEYS = ['condition', 'activity', 'recentTraces', 'pressure', 'sounds', 'attention', 'weather', 'light', 'occupants', 'profile'];
const NPC_MUTABLE_KEYS = [
  'location',
  'mood',
  'notes',
  'health',
  'bleeding',
  'injuries',
  'items',
  'inventory',
  'property',
  'medicalNotes',
  'pain',
  'intoxication',
  'satiety',
  'vigor',
  'thirst',
  'fear',
  'bodyState',
  'states',
  'activeStates',
  'needs',
  'resourceDrift'
];

export function createWorldState(seed = {}) {
  const normalizedSeed = normalizeWorldSeed(seed);
  const now = new Date().toISOString();
  const scenario = pickScenario(normalizedSeed);
  const initialClock = resolveInitialClock(seed, normalizedSeed);
  const historical = normalizedSeed.historical ?? buildHistoricalContext({
    history: normalizedSeed.history ?? scenario.history,
    region: normalizedSeed.region ?? scenario.region,
    historicalFrame: normalizedSeed.historicalFrame
  });
  const locations = normalizeLocationsMap(normalizedSeed.locations ?? scenario.locations ?? {});
  const scenarioId = normalizedSeed.scenarioId ?? scenario.id ?? 'default';
  const worldKey = seed.worldKey ?? `${historical.packId}:${scenarioId}`;
  const seedCurrentLocationId = normalizedSeed.current_position?.location_id
    ?? normalizedSeed.current_position?.place_id
    ?? normalizedSeed.currentLocationId
    ?? scenario.currentLocationId
    ?? Object.keys(locations)[0];
  const seedCurrentMicroLocationId = normalizedSeed.current_position?.minilocation_id
    ?? normalizedSeed.currentMicroLocationId
    ?? null;
  const currentPosition = normalizedSeed.current_position ?? buildCurrentPosition({
    locations,
    cluster: normalizedSeed.cluster ?? null,
    place: normalizedSeed.place ?? buildPlaceView(locations[seedCurrentLocationId]),
    region: normalizedSeed.region ?? scenario.region,
    historical,
    historicalFrame: normalizedSeed.historicalFrame ?? null
  }, {
    location_id: seedCurrentLocationId,
    minilocation_id: seedCurrentMicroLocationId
  });
  const currentLocationId = currentPosition.location_id ?? null;
  const currentMicroLocationId = currentPosition.minilocation_id ?? null;
  const player = buildPlayerProfile(normalizedSeed.player ?? scenario.player ?? {}, {
    currentLocationId,
    currentMicroLocationId,
    region_id: currentPosition.region_id,
    current_position: currentPosition
  });
  const npcBundle = buildNpcProfiles(normalizedSeed.npcs ?? scenario.npcs ?? [], currentLocationId, player, currentPosition, {
    current_position: currentPosition,
    locations,
    region: historical.region ?? scenario.region ?? null,
    scene: normalizedSeed.scene ?? scenario.scene ?? {}
  });
  const world = {
    version: 2,
    schema: 'world_state',
    worldId: normalizedSeed.worldId ?? `world:${worldKey}`,
    worldKey,
    scenarioId,
    createdAt: normalizedSeed.createdAt ?? now,
    lastUpdatedAt: normalizedSeed.lastUpdatedAt ?? now,
    clock: initialClock,
    history: normalizedSeed.history ?? structuredClone(scenario.history),
    region: normalizedSeed.region ?? structuredClone(scenario.region),
    historicalFrame: normalizedSeed.historicalFrame ?? null,
    placeSeed: normalizedSeed.placeSeed ?? null,
    socialTissue: normalizedSeed.socialTissue ?? null,
    playerSeed: normalizedSeed.playerSeed ?? null,
    current_position: currentPosition,
    locations,
    currentLocationId,
    currentMicroLocationId,
    place: normalizedSeed.place ?? buildPlaceView(locations[currentLocationId]),
    scene: normalizedSeed.scene ?? buildSceneView({ scene: scenario.scene ?? {} }, locations[currentLocationId]),
    player,
    npcs: npcBundle.npcs,
    relationships: normalizedSeed.relationships ?? npcBundle.relations,
    propertyLedger: normalizedSeed.propertyLedger ?? npcBundle.propertyLedger,
    partyScreenPayload: normalizedSeed.partyScreenPayload ?? normalizedSeed.party_screen_payload ?? null,
    partyRuntimeState: normalizedSeed.partyRuntimeState ?? normalizedSeed.party_runtime_state ?? null,
    catalogDirty: Boolean(normalizedSeed.catalogDirty ?? false),
    lastNarratorProse: normalizedSeed.lastNarratorProse ?? null,
    lastCommit: normalizedSeed.lastCommit ?? null,
    memory: normalizedSeed.memory ?? {
      visitedPlaces: {},
      heardRumors: [],
      sceneNotes: [],
      masterNotes: []
    },
    social: normalizedSeed.social ?? createSocialState(),
    delayedEvents: Array.isArray(normalizedSeed.delayedEvents)
      ? normalizeDelayedEventList(normalizedSeed.delayedEvents, { clock: initialClock })
      : [],
    events: Array.isArray(normalizedSeed.events) ? normalizedSeed.events.slice() : [],
    journal: Array.isArray(normalizedSeed.journal)
      ? normalizedSeed.journal.slice()
      : (Array.isArray(normalizedSeed.events) ? normalizedSeed.events.slice() : [])
  };
  world.historical = normalizeHistoryState(historical);
  normalizeWorldState(world);
  ensureLocationProfiles(world);
  ensureWorldRng(world, normalizedSeed.rngSeed ?? worldKey);
  world.place = normalizedSeed.place ?? buildPlaceView(world.locations[world.current_position?.location_id]);
  world.scene = normalizedSeed.scene ?? buildSceneView({ scene: scenario.scene ?? {}, cluster: null, currentMicroLocationId: null, locations: world.locations }, world.locations[world.current_position?.location_id]);
  world.cluster = normalizedSeed.cluster ?? buildWorldCluster(world);
  world.legal = normalizedSeed.legal ?? buildLegalContext(world);
  if (!world.currentMicroLocationId) {
    world.currentMicroLocationId = world.cluster?.startPosition?.microLocationId ?? null;
  }
  normalizeWorldState(world);
  return initializeWorldState(world);
}

export function buildWorldCatalog(world) {
  const currentPosition = structuredClone(world.current_position ?? buildCurrentPosition(world));
  const partyState = buildPartyStateSnapshot(world);
  return structuredClone({
    version: 2,
    schema: 'world_state',
    worldId: world.worldId,
    worldKey: world.worldKey,
    scenarioId: world.scenarioId,
    createdAt: world.createdAt,
    clock: world.clock,
    history: world.history,
    region: world.region,
    historical: world.historical,
    historicalFrame: world.historicalFrame ?? null,
    placeSeed: world.placeSeed ?? null,
    socialTissue: world.socialTissue ?? null,
    playerSeed: buildPlayerState(world.playerSeed),
    cluster: world.cluster,
    legal: world.legal,
    party_state: partyState,
    current_position: currentPosition,
    currentLocationId: currentPosition?.location_id ?? null,
    currentMicroLocationId: currentPosition?.minilocation_id ?? null,
    locations: world.locations,
    player: buildPlayerState(world.player),
    npcs: Array.isArray(world.npcs) ? world.npcs.map((npc) => buildPlayerState(npc)) : [],
    relationships: world.relationships,
    propertyLedger: world.propertyLedger,
    partyScreenPayload: world.partyScreenPayload ?? null,
    partyRuntimeState: world.partyRuntimeState ?? null,
    delayedEvents: normalizeDelayedEventList(world.delayedEvents ?? [], { clock: world.clock }),
    lastNarratorProse: world.lastNarratorProse ?? null,
    lastCommit: world.lastCommit ?? null,
    place: world.place,
    scene: world.scene,
    journal: world.journal
  });
}

export function buildWorldSession(world) {
  const currentPosition = structuredClone(world.current_position ?? buildCurrentPosition(world));
  const partyState = buildPartyStateSnapshot(world);
  const locationStates = {};
  for (const [id, location] of Object.entries(world.locations ?? {})) {
    locationStates[id] = buildLocationState(location);
  }

  const npcStates = {};
  for (const npc of world.npcs ?? []) {
    if (!npc?.id) continue;
    npcStates[npc.id] = buildNpcState(npc);
  }

  return structuredClone({
    version: 2,
    schema: 'world_state',
    worldId: world.worldId,
    worldKey: world.worldKey,
    scenarioId: world.scenarioId,
    lastUpdatedAt: world.lastUpdatedAt,
    clock: world.clock,
    current_position: currentPosition,
    currentLocationId: currentPosition?.location_id ?? null,
    currentMicroLocationId: currentPosition?.minilocation_id ?? null,
    player: buildPlayerState(world.player),
    relationships: world.relationships,
    propertyLedger: world.propertyLedger,
    partyScreenPayload: world.partyScreenPayload ?? null,
    partyRuntimeState: world.partyRuntimeState ?? null,
    delayedEvents: normalizeDelayedEventList(world.delayedEvents ?? [], { clock: world.clock }),
    lastNarratorProse: world.lastNarratorProse ?? null,
    lastCommit: world.lastCommit ?? null,
    historicalFrame: world.historicalFrame ?? null,
    placeSeed: world.placeSeed ?? null,
    socialTissue: world.socialTissue ?? null,
    playerSeed: buildPlayerState(world.playerSeed),
    party_state: partyState,
    memory: world.memory,
    social: world.social,
    place: world.place,
    events: world.events,
    journal: world.journal,
    scene: world.scene,
    catalogDirty: Boolean(world.catalogDirty),
    locationStates,
    npcStates
  });
}

export function restoreWorldState(catalog, session = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return createWorldState();
  }

  const canonicalPosition = session.current_position ?? catalog.current_position ?? null;
  const legacyBootstrap = canonicalPosition
    ? {}
    : {
        currentLocationId: session.currentLocationId ?? catalog.currentLocationId,
        currentMicroLocationId: session.currentMicroLocationId ?? catalog.currentMicroLocationId
      };

  if (isLegacyFullSession(session)) {
    const legacyPlayer = normalizeLegacyPlayerSnapshot(session.player ?? catalog.player);
    const world = createWorldState({
      worldId: session.worldId ?? catalog.worldId,
      worldKey: session.worldKey ?? catalog.worldKey,
      scenarioId: session.scenarioId ?? catalog.scenarioId,
      createdAt: session.createdAt ?? catalog.createdAt,
      lastUpdatedAt: session.lastUpdatedAt ?? catalog.createdAt,
      clock: session.clock ?? catalog.clock,
      history: session.history ?? catalog.history,
      region: session.region ?? catalog.region,
      historical: session.historical ?? catalog.historical,
      cluster: session.cluster ?? catalog.cluster,
      legal: session.legal ?? catalog.legal,
      current_position: canonicalPosition,
      locations: session.locations,
      ...legacyBootstrap,
      place: session.place ?? catalog.place,
      scene: session.scene ?? catalog.scene,
      player: legacyPlayer,
      npcs: session.npcs ?? catalog.npcs,
      relationships: session.relationships ?? catalog.relationships,
      propertyLedger: session.propertyLedger ?? catalog.propertyLedger,
      partyScreenPayload: session.partyScreenPayload ?? catalog.partyScreenPayload ?? null,
      partyRuntimeState: session.partyRuntimeState ?? catalog.partyRuntimeState ?? null,
      delayedEvents: session.delayedEvents ?? catalog.delayedEvents,
      memory: session.memory ?? catalog.memory,
      social: session.social ?? catalog.social,
      events: session.events ?? catalog.events,
      legal: session.legal ?? catalog.legal,
      lastNarratorProse: session.lastNarratorProse ?? catalog.lastNarratorProse,
      lastCommit: session.lastCommit ?? catalog.lastCommit,
      historicalFrame: session.historicalFrame ?? catalog.historicalFrame,
      placeSeed: session.placeSeed ?? catalog.placeSeed,
      socialTissue: session.socialTissue ?? catalog.socialTissue,
      playerSeed: session.playerSeed ?? catalog.playerSeed,
      journal: session.journal ?? catalog.journal ?? session.events ?? catalog.events
    });
    return initializeWorldState(world);
  }

  const world = createWorldState({
    worldId: catalog.worldId,
    worldKey: catalog.worldKey,
    scenarioId: catalog.scenarioId,
    createdAt: catalog.createdAt,
    lastUpdatedAt: session.lastUpdatedAt ?? catalog.createdAt,
    clock: session.clock ?? catalog.clock,
    history: catalog.history,
    region: catalog.region,
    historical: catalog.historical,
    cluster: session.cluster ?? catalog.cluster,
    legal: session.legal ?? catalog.legal,
    current_position: canonicalPosition,
    locations: session.locations ?? catalog.locations,
    ...legacyBootstrap,
    place: session.place ?? catalog.place,
    scene: session.scene ?? catalog.scene,
    player: normalizeLegacyPlayerSnapshot(session.player ?? catalog.player),
    npcs: session.npcs ?? catalog.npcs,
    relationships: session.relationships ?? catalog.relationships,
    propertyLedger: session.propertyLedger ?? catalog.propertyLedger,
    partyScreenPayload: session.partyScreenPayload ?? catalog.partyScreenPayload ?? null,
    partyRuntimeState: session.partyRuntimeState ?? catalog.partyRuntimeState ?? null,
    delayedEvents: session.delayedEvents ?? catalog.delayedEvents,
    memory: session.memory ?? catalog.memory,
    social: session.social ?? catalog.social,
    events: session.events ?? catalog.events,
    lastNarratorProse: session.lastNarratorProse ?? catalog.lastNarratorProse,
    lastCommit: session.lastCommit ?? catalog.lastCommit,
    historicalFrame: session.historicalFrame ?? catalog.historicalFrame,
    placeSeed: session.placeSeed ?? catalog.placeSeed,
    socialTissue: session.socialTissue ?? catalog.socialTissue,
    playerSeed: session.playerSeed ?? catalog.playerSeed,
    journal: session.journal ?? catalog.journal ?? session.events ?? catalog.events
  });
  applySessionState(world, session);
  const initializedWorld = initializeWorldState(world);
  if (session?.place && typeof session.place === 'object') {
    initializedWorld.place = structuredClone(session.place);
  }
  if (session?.scene && typeof session.scene === 'object') {
    initializedWorld.scene = structuredClone(session.scene);
  }
  return initializedWorld;
}

export function buildPartyStateSnapshot(world) {
  const currentPosition = structuredClone(world.current_position ?? buildCurrentPosition(world));
  const currentLocation = world.locations?.[currentPosition?.location_id ?? world.currentLocationId ?? ''] ?? null;
  const playerState = buildPlayerState(world.player);
  const hiddenState = {
    historical_frame: structuredClone(world.historicalFrame ?? null),
    active_region: structuredClone(world.cluster?.activeRegion ?? null),
    neighboring_region_outlines: structuredClone(world.cluster?.neighboringRegions ?? []),
    historical_layer: structuredClone(world.historical ?? null),
    world_graph: structuredClone(world.cluster?.graph ?? null),
    character_knowledge_map: structuredClone(playerState?.knowledge_map ?? null),
    known_routes: Array.isArray(playerState?.knowledge_map?.known_routes) ? playerState.knowledge_map.known_routes.slice() : [],
    npc_groups: structuredClone(world.cluster?.npcGroups ?? []),
    memory: structuredClone(world.memory ?? null),
    social: structuredClone(world.social ?? null),
    deferred_events: normalizeDelayedEventList(world.delayedEvents ?? [], { clock: world.clock }),
    rumors: Array.isArray(world.memory?.heardRumors) ? world.memory.heardRumors.slice() : [],
    debts: Number.isFinite(Number(world.social?.debts)) ? Number(world.social.debts) : 0,
    threats: Array.isArray(world.region?.tensions) ? world.region.tensions.slice() : [],
    recent_changes_log: Array.isArray(world.journal) ? world.journal.slice(-20) : []
  };
  const visibleState = {
    current_position: currentPosition,
    active_place: structuredClone(world.place ?? null),
    active_location: structuredClone(currentLocation ?? null),
    active_scene_state: structuredClone(world.scene ?? null),
    player_character: structuredClone(playerState ?? null),
    npcs: Array.isArray(world.npcs) ? world.npcs.map((npc) => buildPlayerState(npc)) : [],
    items: structuredClone(world.propertyLedger ?? []),
    containers: structuredClone(world.microPlace?.containers ?? []),
    ownership: currentLocation?.profile?.ownership ?? world.place?.ownership ?? null,
    inventory: Array.isArray(playerState?.items?.carried_items) ? playerState.items.carried_items.slice() : [],
    equipment: Array.isArray(playerState?.items?.equipment) ? playerState.items.equipment.slice() : [],
    weather: world.scene?.weather ?? null,
    time: structuredClone(world.clock ?? null)
  };

  return {
    historical_frame: hiddenState.historical_frame,
    active_region: hiddenState.active_region,
    neighboring_region_outlines: hiddenState.neighboring_region_outlines,
    historical_layer: hiddenState.historical_layer,
    world_graph: hiddenState.world_graph,
    current_position: currentPosition,
    player_character: visibleState.player_character,
    character_knowledge_map: hiddenState.character_knowledge_map,
    known_routes: hiddenState.known_routes,
    active_place: visibleState.active_place,
    active_location: visibleState.active_location,
    active_scene_state: visibleState.active_scene_state,
    npcs: visibleState.npcs,
    npc_groups: hiddenState.npc_groups,
    items: visibleState.items,
    containers: visibleState.containers,
    ownership: visibleState.ownership,
    inventory: visibleState.inventory,
    equipment: visibleState.equipment,
    weather: visibleState.weather,
    time: visibleState.time,
    visible_state: visibleState,
    hidden_state: hiddenState,
    deferred_events: hiddenState.deferred_events,
    rumors: hiddenState.rumors,
    debts: hiddenState.debts,
    threats: hiddenState.threats,
    recent_changes_log: hiddenState.recent_changes_log
  };
}

export function initializeWorldState(world) {
  normalizeWorldState(world);
  ensureWorldRng(world);
  syncHistoricalContext(world, {
    recordPhaseTransitions: false,
    schedulePhaseDelayedEvents: false
  });
  ensureLocationProfiles(world);
  const canonicalLocationId = world.current_position?.location_id ?? null;
  const regionId = world.current_position?.region_id
    ?? world.region?.id
    ?? world.region?.name
    ?? world.historicalFrame?.regionName
    ?? world.historical?.regionalContext?.current?.id
    ?? null;
  world.player = buildPlayerProfile(world.player ?? {}, {
    currentLocationId: canonicalLocationId,
    currentMicroLocationId: world.current_position?.minilocation_id ?? null,
    region_id: regionId,
    current_position: world.current_position ?? null
  });
  const npcBundle = buildNpcProfiles(world.npcs ?? [], canonicalLocationId, world.player, world.current_position ?? null, world);
  world.npcs = npcBundle.npcs;
  if (!Array.isArray(world.relationships) || world.relationships.length === 0) {
    world.relationships = npcBundle.relations;
  }
  if (!Array.isArray(world.propertyLedger) || world.propertyLedger.length === 0) {
    world.propertyLedger = npcBundle.propertyLedger;
  }
  syncCurrentPlace(world);
  const record = world.memory?.visitedPlaces?.[canonicalLocationId];
  if (!record) {
    noteVisit(world, canonicalLocationId, 'Начальная точка мира.');
  }
  return world;
}

export function migrateWorldState(savedWorld) {
  if (!savedWorld || typeof savedWorld !== 'object') return createWorldState();
  if (savedWorld.locations && savedWorld.currentLocationId) {
    return initializeWorldState({
      ...normalizeWorldState(savedWorld),
      player: normalizeLegacyPlayerSnapshot(savedWorld.player)
    });
  }

  const place = savedWorld.place ?? {};
  const locationId = place.id ?? 'legacy-place';
  const location = {
    id: locationId,
    name: place.name ?? 'старое место',
    kind: place.kind ?? 'место',
    landmarks: place.landmarks ?? [],
    exits: (place.exits ?? []).map((exit) => ({ label: exit, to: locationId })),
    occupants: place.occupants ?? [],
    condition: 'legacy',
    activity: [],
    recentTraces: [],
    pressure: savedWorld.scene?.pressure ?? [],
    sounds: savedWorld.scene?.sounds ?? [],
    attention: savedWorld.scene?.attention ?? 'низкое',
    weather: savedWorld.scene?.weather ?? 'неизвестно',
    light: savedWorld.scene?.light ?? 'неизвестно'
  };

  return createWorldState({
    worldId: savedWorld.worldId,
    createdAt: savedWorld.createdAt,
    lastUpdatedAt: savedWorld.lastUpdatedAt,
    clock: savedWorld.clock,
    history: savedWorld.history,
    region: savedWorld.region,
    player: savedWorld.player,
    npcs: savedWorld.npcs,
    memory: savedWorld.memory,
    events: savedWorld.events,
    locations: { [locationId]: location },
    currentLocationId: locationId,
    place: buildPlaceView(location),
    scene: buildSceneView(savedWorld, location)
  });
}

function normalizeWorldSeed(seed = {}) {
  if (!seed || typeof seed !== 'object') return {};
  return {
    ...seed,
    history: seed.history === undefined ? undefined : normalizeHistoryState(seed.history),
    region: seed.region === undefined ? undefined : normalizeRegionState(seed.region),
    place: seed.place === undefined ? undefined : normalizePlaceState(seed.place),
    scene: seed.scene === undefined ? undefined : normalizeSceneState(seed.scene),
    memory: seed.memory === undefined ? undefined : normalizeMemoryState(seed.memory),
    social: seed.social === undefined ? undefined : normalizeSocialState(seed.social),
    events: seed.events === undefined ? undefined : (Array.isArray(seed.events) ? seed.events.slice() : []),
    locations: seed.locations === undefined ? undefined : normalizeLocationsMap(seed.locations),
    npcs: seed.npcs === undefined ? undefined : (Array.isArray(seed.npcs) ? seed.npcs.slice() : seed.npcs),
    relationships: seed.relationships && typeof seed.relationships === 'object' ? structuredClone(seed.relationships) : seed.relationships,
    propertyLedger: seed.propertyLedger && typeof seed.propertyLedger === 'object' ? structuredClone(seed.propertyLedger) : seed.propertyLedger,
    partyScreenPayload: seed.partyScreenPayload && typeof seed.partyScreenPayload === 'object'
      ? structuredClone(seed.partyScreenPayload)
      : seed.partyScreenPayload,
    partyRuntimeState: seed.partyRuntimeState && typeof seed.partyRuntimeState === 'object'
      ? structuredClone(seed.partyRuntimeState)
      : seed.partyRuntimeState,
    delayedEvents: Array.isArray(seed.delayedEvents) ? seed.delayedEvents.slice() : seed.delayedEvents,
    cluster: seed.cluster && typeof seed.cluster === 'object' ? structuredClone(seed.cluster) : seed.cluster,
    legal: seed.legal && typeof seed.legal === 'object' ? structuredClone(seed.legal) : seed.legal
  };
}

function resolveInitialClock(seed, normalizedSeed) {
  const explicitClock = normalizeClockState(normalizedSeed.clock ?? seed?.clock);
  if (explicitClock) {
    return explicitClock;
  }

  const hintedClock = inferClockFromText(
    seed?.startText
    ?? normalizedSeed?.historicalFrame?.startTextHint
    ?? normalizedSeed?.player?.startText
    ?? ''
  );
  if (hintedClock) {
    return {
      ...hintedClock,
      day: inferDayFromText(
        seed?.startText
        ?? normalizedSeed?.historicalFrame?.startTextHint
        ?? normalizedSeed?.player?.startText
        ?? ''
      ) ?? randomClockDay()
    };
  }

  return buildRandomClock();
}

function normalizeClockState(clock) {
  if (!clock || typeof clock !== 'object') return null;
  const day = Number(clock.day);
  const hour = Number(clock.hour);
  const minute = Number(clock.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    day: Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1,
    hour: clampClockHour(hour),
    minute: clampClockMinute(minute)
  };
}

function inferClockFromText(text) {
  const value = String(text ?? '').toLowerCase();
  if (!value.trim()) return null;

  const explicitTime = value.match(/\b(\d{1,2})[:.](\d{2})\b/u);
  if (explicitTime) {
    const hour = clampClockHour(Number(explicitTime[1]));
    const minute = clampClockMinute(Number(explicitTime[2]));
    if (hour !== null && minute !== null) {
      return { day: 1, hour, minute };
    }
  }

  const hourOnly = value.match(/\b(?:в\s+)?(\d{1,2})\s*(?:ч(?:ас(?:а|ов)?)?|часа?|hours?)\b/u);
  if (hourOnly) {
    const hour = clampClockHour(Number(hourOnly[1]));
    if (hour !== null) {
      return { day: 1, hour, minute: 0 };
    }
  }

  const keywordClock = inferClockFromKeyword(value);
  return keywordClock ? { day: 1, ...keywordClock } : null;
}

function inferClockFromKeyword(text) {
  if (/\b(утром|на\s+рассвете|рассвет|зори|утро)\b/u.test(text)) {
    return { hour: 7, minute: 0 };
  }
  if (/\b(днем|днём|в\s+день|после\s+полудня|полдень)\b/u.test(text)) {
    return { hour: 13, minute: 0 };
  }
  if (/\b(вечером|на\s+вечер|вечер)\b/u.test(text)) {
    return { hour: 18, minute: 0 };
  }
  if (/\b(ночью|ночью\s+поздно|ночь|поздно)\b/u.test(text)) {
    return { hour: 22, minute: 0 };
  }
  return null;
}

function inferDayFromText(text) {
  const value = String(text ?? '').toLowerCase();
  if (!value.trim()) return null;

  const directDay = value.match(/(?:день|дня|дню)\s*(\d{1,2})/iu);
  if (directDay) {
    const day = clampClockDay(Number(directDay[1]));
    if (day !== null) return day;
  }

  const ordinalDay = value.match(/(\d{1,2})\s*(?:-?\s*(?:й|ый|ой))?\s+день/iu);
  if (ordinalDay) {
    const day = clampClockDay(Number(ordinalDay[1]));
    if (day !== null) return day;
  }

  const monthDate = value.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/iu);
  if (monthDate) {
    const day = clampClockDay(Number(monthDate[1]));
    if (day !== null) return day;
  }

  return null;
}

function buildRandomClock() {
  return {
    day: randomClockDay(),
    hour: randomClockHour(),
    minute: randomClockMinute()
  };
}

function randomClockDay() {
  return 1 + Math.floor(Math.random() * 30);
}

function randomClockHour() {
  return Math.floor(Math.random() * 24);
}

function randomClockMinute() {
  const slots = [0, 15, 30, 45];
  return slots[Math.floor(Math.random() * slots.length)];
}

function clampClockHour(value) {
  if (!Number.isFinite(value)) return null;
  const hour = Math.trunc(value);
  if (hour < 0 || hour > 23) return null;
  return hour;
}

function clampClockDay(value) {
  if (!Number.isFinite(value)) return null;
  const day = Math.trunc(value);
  if (day < 1 || day > 31) return null;
  return day;
}

function clampClockMinute(value) {
  if (!Number.isFinite(value)) return null;
  const minute = Math.trunc(value);
  if (minute < 0 || minute > 59) return null;
  return minute;
}

function normalizeWorldState(world) {
  if (!world || typeof world !== 'object') return world;
  world.version = 2;
  world.schema = world.schema ?? 'world_state';
  world.history = normalizeHistoryState(world.history);
  world.region = normalizeRegionState(world.region);
  world.place = normalizePlaceState(world.place);
  world.scene = normalizeSceneState(world.scene);
  world.memory = normalizeMemoryState(world.memory);
  world.social = normalizeSocialState(world.social);
  world.delayedEvents = normalizeDelayedEventList(world.delayedEvents ?? [], { clock: world.clock });
  if (!world.current_position || typeof world.current_position !== 'object') {
    world.current_position = buildCurrentPosition(world, {
      location_id: world.currentLocationId,
      minilocation_id: world.currentMicroLocationId
    });
  } else {
    world.current_position = buildCurrentPosition(world, world.current_position);
  }
  world.currentLocationId = world.current_position.location_id ?? null;
  world.currentMicroLocationId = world.current_position.minilocation_id ?? world.currentMicroLocationId ?? null;
  world.events = Array.isArray(world.events) ? world.events : [];
  world.journal = Array.isArray(world.journal) ? world.journal : world.events.slice();
  world.locations = normalizeLocationsMap(world.locations ?? {});
  if (world.place?.id && world.locations[world.place.id]) {
    world.locations[world.place.id] = normalizeLocationState(world.locations[world.place.id]);
  }
  ensureWorldLogs(world);
  return world;
}

function normalizeHistoryState(history = {}) {
  if (!history || typeof history !== 'object') return {
    era: 'XIII век',
    year: 1241,
    season: 'неизвестно',
    regionHint: 'неизвестно',
    macroForces: [],
    legitimacy: []
  };
  return {
    ...history,
    macroForces: Array.isArray(history.macroForces) ? history.macroForces.slice() : [],
    legitimacy: Array.isArray(history.legitimacy) ? history.legitimacy.slice() : []
  };
}

function normalizeRegionState(region = {}) {
  if (!region || typeof region !== 'object') return {
    name: 'неизвестно',
    economy: [],
    politics: [],
    tensions: []
  };
  return {
    ...region,
    economy: Array.isArray(region.economy) ? region.economy.slice() : [],
    politics: Array.isArray(region.politics) ? region.politics.slice() : [],
    tensions: Array.isArray(region.tensions) ? region.tensions.slice() : []
  };
}

function normalizePlaceState(place = {}) {
  if (!place || typeof place !== 'object') {
    return {
      id: 'unknown',
      name: 'неизвестное место',
      kind: 'неизвестно',
      landmarks: [],
      exits: [],
      occupants: []
    };
  }
  return {
    ...place,
    landmarks: Array.isArray(place.landmarks) ? place.landmarks.slice() : [],
    exits: normalizeExits(place.exits, place.id ?? 'unknown'),
    occupants: Array.isArray(place.occupants) ? place.occupants.slice() : []
  };
}

function normalizeSceneState(scene = {}) {
  if (!scene || typeof scene !== 'object') return {
    pressure: [],
    sounds: []
  };
  return {
    ...scene,
    pressure: Array.isArray(scene.pressure) ? scene.pressure.slice() : [],
    sounds: Array.isArray(scene.sounds) ? scene.sounds.slice() : []
  };
}

function normalizeMemoryState(memory = {}) {
  if (!memory || typeof memory !== 'object') {
    return {
      visitedPlaces: {},
      heardRumors: [],
      sceneNotes: [],
      masterNotes: []
    };
  }
  return {
    ...memory,
    visitedPlaces: memory.visitedPlaces && typeof memory.visitedPlaces === 'object' ? structuredClone(memory.visitedPlaces) : {},
    heardRumors: Array.isArray(memory.heardRumors) ? memory.heardRumors.slice() : [],
    sceneNotes: Array.isArray(memory.sceneNotes) ? memory.sceneNotes.slice() : [],
    masterNotes: Array.isArray(memory.masterNotes) ? memory.masterNotes.slice() : []
  };
}

function normalizeSocialState(social = {}) {
  if (!social || typeof social !== 'object') return createSocialState();
  return {
    reputation: typeof social.reputation === 'number' ? social.reputation : 0,
    suspicion: typeof social.suspicion === 'number' ? social.suspicion : 0,
    favors: typeof social.favors === 'number' ? social.favors : 0,
    debts: typeof social.debts === 'number' ? social.debts : 0,
    knownBy: Array.isArray(social.knownBy) ? social.knownBy.slice() : [],
    recentWitnesses: Array.isArray(social.recentWitnesses) ? social.recentWitnesses.slice() : [],
    lastConsequence: social.lastConsequence ?? null,
    socialMemory: Array.isArray(social.socialMemory) ? social.socialMemory.slice() : []
  };
}

function normalizeLocationsMap(locations = {}) {
  if (!locations || typeof locations !== 'object') return {};
  const normalized = {};
  for (const [id, location] of Object.entries(locations)) {
    normalized[id] = normalizeLocationState(location, id);
  }
  return normalized;
}

function normalizeLocationState(location, fallbackId = 'location') {
  if (!location || typeof location !== 'object') {
    return {
      id: fallbackId,
      name: 'неизвестное место',
      kind: 'неизвестно',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: []
    };
  }
  const id = location.id ?? fallbackId;
  return {
    ...location,
    id,
    landmarks: Array.isArray(location.landmarks) ? location.landmarks.slice() : [],
    exits: normalizeExits(location.exits, id),
    occupants: Array.isArray(location.occupants) ? location.occupants.slice() : [],
    activity: Array.isArray(location.activity) ? location.activity.slice() : [],
    recentTraces: Array.isArray(location.recentTraces) ? location.recentTraces.slice() : [],
    pressure: Array.isArray(location.pressure) ? location.pressure.slice() : [],
    sounds: Array.isArray(location.sounds) ? location.sounds.slice() : []
  };
}

function normalizeExits(exits, locationId) {
  if (!Array.isArray(exits)) return [];
  return exits.map((exit, index) => {
    if (typeof exit === 'string') {
      return { label: exit, to: locationId ?? `exit:${index}` };
    }
    if (!exit || typeof exit !== 'object') {
      return { label: String(exit ?? ''), to: locationId ?? `exit:${index}` };
    }
    return {
      ...exit,
      label: exit.label ?? exit.name ?? exit.direction ?? String(exit.to ?? `exit-${index}`),
      to: exit.to ?? locationId ?? `exit:${index}`
    };
  });
}

function buildLocationState(location) {
  const state = {};
  for (const key of LOCATION_MUTABLE_KEYS) {
    if (location?.[key] === undefined) continue;
    state[key] = structuredClone(location[key]);
  }
  return state;
}

function buildNpcState(npc) {
  const state = {};
  for (const key of NPC_MUTABLE_KEYS) {
    if (npc?.[key] === undefined) continue;
    state[key] = structuredClone(npc[key]);
  }
  return state;
}

function buildPlayerState(player) {
  if (!player || typeof player !== 'object') return player;
  const state = structuredClone(player);
  delete state.hunger;
  delete state.fatigue;
  delete state.sleep;
  delete state.legacy_vitals;
  delete state.legacy_needs;

  if (state.needs && typeof state.needs === 'object') {
    delete state.needs.hunger;
    delete state.needs.fatigue;
    delete state.needs.sleep;
  }

  if (state.items && typeof state.items === 'object' && !Array.isArray(state.items)) {
    delete state.inventory;
    delete state.property;
  }
  delete state.load_category;

  return state;
}

function applySessionState(world, session) {
  if (session && typeof session === 'object') {
    const partyState = session.party_state && typeof session.party_state === 'object' ? session.party_state : null;
    if (session.player) world.player = normalizeLegacyPlayerSnapshot(session.player);
    if (session.memory) world.memory = structuredClone(session.memory);
    if (session.social) world.social = structuredClone(session.social);
    if (session.events) world.events = structuredClone(session.events);
    if (session.scene) world.scene = structuredClone(session.scene);
    if (session.clock) world.clock = structuredClone(session.clock);
    if (session.relationships) world.relationships = structuredClone(session.relationships);
    if (session.propertyLedger) world.propertyLedger = structuredClone(session.propertyLedger);
    if (session.delayedEvents) world.delayedEvents = structuredClone(session.delayedEvents);
    if (session.catalogDirty) world.catalogDirty = Boolean(session.catalogDirty);

    if (partyState) {
      applyPartyStateSnapshot(world, partyState, session);
    }

    applyLocationStates(world, session.locationStates);
    applyNpcStates(world, session.npcStates);
  }

  return world;
}

function applyLocationStates(world, locationStates) {
  if (!locationStates || typeof locationStates !== 'object') return;
  for (const [id, state] of Object.entries(locationStates)) {
    const location = world.locations?.[id];
    if (!location || !state || typeof state !== 'object') continue;
    for (const key of LOCATION_MUTABLE_KEYS) {
      if (state[key] === undefined) continue;
      location[key] = structuredClone(state[key]);
    }
  }
}

function applyNpcStates(world, npcStates) {
  if (!npcStates || typeof npcStates !== 'object') return;
  for (const npc of world.npcs ?? []) {
    if (!npc?.id) continue;
    const state = npcStates[npc.id];
    if (!state || typeof state !== 'object') continue;
    for (const key of NPC_MUTABLE_KEYS) {
      if (state[key] === undefined) continue;
      npc[key] = structuredClone(state[key]);
    }
  }
}

function applyPartyStateSnapshot(world, partyState, session = {}) {
  if (!partyState || typeof partyState !== 'object') return;

  const visibleState = partyState.visible_state && typeof partyState.visible_state === 'object' ? partyState.visible_state : null;
  const hiddenState = partyState.hidden_state && typeof partyState.hidden_state === 'object' ? partyState.hidden_state : null;

  if (!session.current_position && partyState.current_position) {
    world.current_position = structuredClone(partyState.current_position);
  }
  if (!session.place && partyState.active_place) {
    world.place = structuredClone(partyState.active_place);
  }
  if (!session.scene && partyState.active_scene_state) {
    world.scene = structuredClone(partyState.active_scene_state);
  }
  if (!session.player && partyState.player_character) {
    world.player = normalizeLegacyPlayerSnapshot(partyState.player_character);
  }
  if (!session.npcs && Array.isArray(partyState.npcs)) {
    world.npcs = structuredClone(partyState.npcs);
  }
  if (!session.propertyLedger && partyState.items) {
    world.propertyLedger = structuredClone(partyState.items);
  }
  if (!session.delayedEvents && Array.isArray(partyState.deferred_events)) {
    world.delayedEvents = structuredClone(partyState.deferred_events);
  }
  if (!session.memory && hiddenState?.memory) {
    world.memory = structuredClone(hiddenState.memory);
  }
  if (!session.social && hiddenState?.social) {
    world.social = structuredClone(hiddenState.social);
  }
  if (!session.historicalFrame && hiddenState?.historical_frame) {
    world.historicalFrame = structuredClone(hiddenState.historical_frame);
  }
  if (!session.historical && hiddenState?.historical_layer) {
    world.historical = structuredClone(hiddenState.historical_layer);
  }
  if (!session.region && hiddenState?.active_region) {
    world.region = structuredClone(hiddenState.active_region);
  }
  if (!session.relationships && Array.isArray(partyState.relationships)) {
    world.relationships = structuredClone(partyState.relationships);
  }
  if (!session.cluster && hiddenState?.world_graph) {
    world.cluster = {
      ...world.cluster,
      graph: structuredClone(hiddenState.world_graph),
      activeRegion: structuredClone(hiddenState.active_region ?? null),
      neighboringRegions: structuredClone(hiddenState.neighboring_region_outlines ?? []),
      npcGroups: structuredClone(hiddenState.npc_groups ?? [])
    };
  }
  if (!session.clock && visibleState?.time) {
    world.clock = structuredClone(visibleState.time);
  }
}

function isLegacyFullSession(session) {
  return Boolean(session && typeof session === 'object' && session.locations && session.npcs && !session.locationStates && !session.npcStates);
}

function normalizeLegacyPlayerSnapshot(player = {}) {
  if (!player || typeof player !== 'object') return player;

  const next = structuredClone(player);
  const states = next.states && typeof next.states === 'object' ? next.states : {};
  const body = next.body && typeof next.body === 'object' ? next.body : {};
  const pickLegacyVital = (...values) => {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 100;
  };

  const health = pickLegacyVital(states.health, body.health, next.health, next.needs?.health);
  const satiety = pickLegacyVital(
    states.satiety,
    body.satiety,
    next.satiety,
    next.needs?.satiety,
    Number.isFinite(next.legacy_vitals?.hunger) ? 100 - Number(next.legacy_vitals.hunger) : null,
    Number.isFinite(next.hunger) ? 100 - Number(next.hunger) : null,
    Number.isFinite(next.legacy_needs?.hunger) ? 100 - Number(next.legacy_needs.hunger) : null,
    Number.isFinite(next.needs?.hunger) ? 100 - Number(next.needs.hunger) : null
  );
  const vigor = pickLegacyVital(
    states.vigor,
    body.vigor,
    next.vigor,
    next.needs?.vigor,
    Number.isFinite(next.legacy_vitals?.fatigue) ? 100 - Number(next.legacy_vitals.fatigue) : null,
    Number.isFinite(next.fatigue) ? 100 - Number(next.fatigue) : null,
    Number.isFinite(next.legacy_needs?.fatigue) ? 100 - Number(next.legacy_needs.fatigue) : null,
    Number.isFinite(next.needs?.fatigue) ? 100 - Number(next.needs.fatigue) : null,
    Number.isFinite(next.legacy_vitals?.sleep) ? 100 - Number(next.legacy_vitals.sleep) : null,
    Number.isFinite(next.sleep) ? 100 - Number(next.sleep) : null,
    Number.isFinite(next.legacy_needs?.sleep) ? 100 - Number(next.legacy_needs.sleep) : null,
    Number.isFinite(next.needs?.sleep) ? 100 - Number(next.needs.sleep) : null
  );

  next.states = {
    ...states,
    health,
    satiety,
    vigor
  };
  next.body = {
    ...body,
    health,
    satiety,
    vigor
  };
  return next;
}

export function ensureWorldRng(world, seedOverride = null) {
  if (!world || typeof world !== 'object') return null;
  const existing = world.rng;
  if (existing && existing.seed != null && Number.isFinite(Number(existing.counter))) {
    if (!existing.algorithm) existing.algorithm = RNG_ALGORITHM;
    return existing;
  }
  const seed = String(seedOverride ?? world.worldKey ?? world.worldId ?? 'world');
  world.rng = {
    algorithm: RNG_ALGORITHM,
    seed,
    counter: Number(existing?.counter ?? 0) || 0
  };
  return world.rng;
}
