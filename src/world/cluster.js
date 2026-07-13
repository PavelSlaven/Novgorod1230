import { buildHistoricalContext } from './historical-context.js';
import { loadRegionCatalog, selectRegionCatalogEntry } from './region-catalog.js';
import { buildRegionSummary } from './region-summary.js';
import { allowsProceduralSemantics } from './semantic-gate.js';

const DIRECTIONS = [
  { key: 'north', label: 'север' },
  { key: 'east', label: 'восток' },
  { key: 'south', label: 'юг' },
  { key: 'west', label: 'запад' }
];

export function buildWorldCluster(world) {
  const currentPosition = world?.current_position ?? null;
  const currentLocationId = currentPosition?.location_id ?? currentPosition?.place_id ?? null;
  const currentMicroLocationId = currentPosition?.minilocation_id ?? null;
  const location = world.locations?.[currentLocationId] ?? null;
  const historical = buildHistoricalContext(world);
  const regionCatalog = loadRegionCatalog();
  const catalogRegion = selectRegionCatalogEntry(world);
  const microLocationsByLocationId = buildMicroLocationGraph(world, location);

  return {
    regionCatalog: regionCatalog.slice(0, 24),
    neighboringRegions: buildNeighboringRegions(world, historical, catalogRegion, regionCatalog),
    activeRegion: buildActiveRegion(world, historical, catalogRegion, regionCatalog),
    place: buildPlaceCluster(world, location, catalogRegion),
    location: buildLocationCluster(world, location, microLocationsByLocationId[location?.id] ?? [], catalogRegion),
    microLocationsByLocationId,
    graph: buildWorldGraph(world, microLocationsByLocationId),
    npcSchedules: buildNpcSchedules(world),
    startPosition: buildStartPosition(world, location, microLocationsByLocationId[location?.id] ?? [], catalogRegion),
    currentPosition,
    currentLocationId,
    currentMicroLocationId,
    databaseShape: buildDatabaseShape(world, location, catalogRegion)
  };
}

export function buildMicroLocationGraph(world, location = null) {
  const result = {};
  for (const item of Object.values(world.locations ?? {})) {
    result[item.id] = buildMicroLocationsForLocation(item);
  }
  if (location && !result[location.id]) {
    result[location.id] = buildMicroLocationsForLocation(location);
  }
  return result;
}

export function buildMicroLocationsForLocation(location) {
  if (!location) return [];

  const profile = location.profile ?? {};
  const landmarks = Array.isArray(location.landmarks) ? location.landmarks.slice(0, 4) : [];
  const occupants = Array.isArray(location.occupants) ? location.occupants.slice(0, 4) : [];
  const traces = Array.isArray(location.recentTraces) ? location.recentTraces.slice(0, 3).map((trace) => trace.text) : [];
  const exits = Array.isArray(location.exits) ? location.exits.slice(0, 3).map((exit) => exit.label) : [];
  const fixtures = buildFixtures(location);

  return [
    {
      id: `${location.id}:entry`,
      name: `${location.name} - вход`,
      kind: 'вход',
      purpose: profile.purpose ?? null,
      access: profile.access ?? null,
      hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 3) : [],
      ownership: profile.ownership ?? null,
      visibleObjects: landmarks.slice(0, 2),
      containers: fixtures.containers.slice(0, 1),
      doors: fixtures.doors.slice(0, 2),
      entryPoints: fixtures.entryPoints.slice(0, 2),
      occupants: occupants.slice(0, 1),
      traces: traces.slice(0, 1),
      links: fixtures.links.slice(0, 2),
      smells: profile.sensory?.smells?.slice(0, 2) ?? [],
      consequences: profile.consequences?.slice(0, 2) ?? []
    },
    {
      id: `${location.id}:center`,
      name: `${location.name} - центр`,
      kind: 'ядро',
      purpose: profile.purpose ?? null,
      access: profile.access ?? null,
      hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
      ownership: profile.ownership ?? null,
      visibleObjects: landmarks.slice(1, 4),
      containers: fixtures.containers.slice(1, 3),
      doors: fixtures.doors.slice(1, 3),
      entryPoints: fixtures.entryPoints.slice(1, 3),
      occupants: occupants.slice(0, 3),
      traces: traces.slice(0, 2),
      links: fixtures.links.slice(1, 3),
      smells: profile.sensory?.smells?.slice(0, 3) ?? [],
      consequences: profile.consequences?.slice(0, 3) ?? []
    },
    {
      id: `${location.id}:edge`,
      name: `${location.name} - край`,
      kind: 'край',
      purpose: profile.purpose ?? null,
      access: profile.access ?? null,
      hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
      ownership: profile.ownership ?? null,
      visibleObjects: landmarks.slice(2, 4),
      containers: fixtures.containers.slice(2, 4),
      doors: fixtures.doors.slice(2, 4),
      entryPoints: fixtures.entryPoints.slice(2, 4),
      occupants: occupants.slice(2, 4),
      traces,
      links: fixtures.links.slice(2, 4),
      smells: profile.sensory?.smells?.slice(1, 4) ?? [],
      consequences: profile.consequences?.slice(1, 4) ?? []
    }
  ].map((node) => ({
    ...node,
    scheduleHint: pickScheduleHint(location, node.kind)
  }));
}

export function resolveMicroLocation(microLocations, targetText) {
  if (!targetText || !Array.isArray(microLocations)) return null;
  const needle = String(targetText).toLowerCase();
  return microLocations.find((node) =>
    flattenNodeValues(node)
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  ) ?? null;
}

function buildNeighboringRegions(world, historical, catalogRegion, regionCatalog) {
  const region = world.region ?? {};
  const economy = Array.isArray(region.economy) ? region.economy : [];
  const politics = Array.isArray(region.politics) ? region.politics : [];
  const tensions = Array.isArray(region.tensions) ? region.tensions : [];
  const neighbors = pickNeighborCatalogEntries(world, regionCatalog, catalogRegion);
  return DIRECTIONS.map((direction, index) => {
    const entry = neighbors[index] ?? null;
    return {
      id: `neighbor:${direction.key}`,
      direction: direction.label,
      regionId: entry?.id ?? null,
      regionName: entry?.name ?? pickFrom(historical.anchorEvents, index),
      summary: entry ? buildRegionSummary(world, entry, { neighbor: true }) : null,
      coordinates: offsetCoordinates(catalogRegion?.coordinates, index),
      pressure: pickFrom(tensions, index),
      trade: pickFrom(economy, index),
      authority: pickFrom(politics, index),
      law: pickFrom(historical.behavioralRules, index),
      weather: world.scene?.weather ?? null,
      socialMood: pickFrom(tensions, index),
      events: pickEventSeeds(historical, index),
      historicalBackground: pickFrom(historical.anchorEvents, index),
      npcGroups: [],
      itemCategories: [],
      risks: [pickFrom(tensions, index)].filter(Boolean),
      clocks: [{ kind: 'season', value: world.history?.season ?? historical.year }],
      rumorSeeds: [pickFrom(historical.anchorEvents, index)].filter(Boolean),
      causes: [pickFrom(historical.anchorEvents, index)].filter(Boolean)
    };
  });
}

function buildActiveRegion(world, historical, catalogRegion, regionCatalog) {
  const region = world.region ?? {};
  const summary = buildRegionSummary(world, catalogRegion, { focus: true });
  return {
    id: catalogRegion?.id ?? `region:${world.worldKey}`,
    catalogName: catalogRegion?.name ?? null,
    name: region.name ?? catalogRegion?.name ?? 'неизвестный регион',
    coordinates: catalogRegion?.coordinates ?? null,
    summary,
    weather: world.scene?.weather ?? 'переменная погода',
    economy: Array.isArray(region.economy) ? region.economy.slice(0, 4) : [],
    politics: Array.isArray(region.politics) ? region.politics.slice(0, 4) : [],
    roads: summarizeRoads(world),
    risks: Array.isArray(region.tensions) ? region.tensions.slice(0, 4) : [],
    law: historical.behavioralRules.slice(0, 4),
    socialMood: deriveRegionMood(region, world),
    events: historical.anchorEvents.slice(0, 4),
    historicalBackground: historical.materialCulture.slice(0, 4),
    npcGroups: buildRegionNpcGroups(world),
    itemCategories: buildRegionItemCategories(world),
    clocks: [{ kind: 'season', value: world.history?.season ?? historical.year }],
    rumorSeeds: historical.anchorEvents.slice(0, 4),
    causes: historical.behavioralRules.slice(0, 4),
    neighbors: pickNeighborCatalogEntries(world, regionCatalog, catalogRegion).map((entry) => entry.name)
  };
}

function buildPlaceCluster(world, location, catalogRegion) {
  const profile = location?.profile ?? {};
  const summary = buildRegionSummary(world, selectRegionCatalogEntry(world) ?? catalogRegion, { place: true });
  return {
    id: location?.id ?? world.current_position?.location_id ?? world.currentLocationId,
    name: location?.name ?? 'неизвестное место',
    kind: location?.kind ?? 'место',
    coordinates: deriveLocalCoordinates(location, catalogRegion),
    summary,
    purpose: profile.purpose ?? null,
    access: profile.access ?? null,
    hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
    ownership: profile.ownership ?? null,
    landmarks: location?.landmarks?.slice(0, 6) ?? [],
    exits: location?.exits?.slice(0, 6).map((exit) => exit.label) ?? [],
    occupants: visibleOccupants(location, world).slice(0, 6),
    mood: deriveLocalMood(location, world),
    usage: profile.usage ?? null,
    routes: Array.isArray(profile.routes) ? profile.routes.slice(0, 4) : [],
    economy: Array.isArray(profile.economy) ? profile.economy.slice(0, 4) : [],
    law: Array.isArray(profile.law) ? profile.law.slice(0, 4) : [],
    socialMood: deriveLocalMood(location, world),
    events: Array.isArray(profile.events) ? profile.events.slice(0, 4) : [],
    historicalBackground: Array.isArray(profile.historicalBackground) ? profile.historicalBackground.slice(0, 4) : [],
    weather: location?.weather ?? world.scene?.weather ?? null,
    npcGroups: buildLocationNpcGroups(location, world),
    itemCategories: Array.isArray(profile.itemCategories) ? profile.itemCategories.slice(0, 4) : [],
    risks: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
    clocks: Array.isArray(profile.clocks) ? profile.clocks.slice(0, 4) : [],
    rumorSeeds: Array.isArray(profile.rumorSeeds) ? profile.rumorSeeds.slice(0, 4) : [],
    causes: Array.isArray(profile.causes) ? profile.causes.slice(0, 4) : []
  };
}

function buildLocationCluster(world, location, microLocations, catalogRegion) {
  if (!location) return null;
  const profile = location.profile ?? {};
  const summary = buildRegionSummary(world, selectRegionCatalogEntry(world) ?? catalogRegion, { location: true });
  return {
    id: location.id,
    name: location.name,
    kind: location.kind,
    coordinates: deriveLocalCoordinates(location, catalogRegion),
    summary,
    purpose: profile.purpose ?? null,
    access: profile.access ?? null,
    hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
    ownership: profile.ownership ?? null,
    objects: Array.isArray(location.landmarks) ? location.landmarks.slice(0, 8) : [],
    entrances: Array.isArray(location.exits) ? location.exits.map((exit) => exit.label) : [],
    people: visibleOccupants(location, world).slice(0, 8),
    microLocations,
    routes: Array.isArray(profile.routes) ? profile.routes.slice(0, 4) : [],
    economy: Array.isArray(profile.economy) ? profile.economy.slice(0, 4) : [],
    law: Array.isArray(profile.law) ? profile.law.slice(0, 4) : [],
    socialMood: deriveLocalMood(location, world),
    events: Array.isArray(profile.events) ? profile.events.slice(0, 4) : [],
    historicalBackground: Array.isArray(profile.historicalBackground) ? profile.historicalBackground.slice(0, 4) : [],
    weather: location.weather ?? null,
    npcGroups: buildLocationNpcGroups(location, world),
    itemCategories: Array.isArray(profile.itemCategories) ? profile.itemCategories.slice(0, 4) : [],
    risks: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
    clocks: Array.isArray(profile.clocks) ? profile.clocks.slice(0, 4) : [],
    rumorSeeds: Array.isArray(profile.rumorSeeds) ? profile.rumorSeeds.slice(0, 4) : [],
    causes: Array.isArray(profile.causes) ? profile.causes.slice(0, 4) : [],
    consequences: Array.isArray(profile.consequences) ? profile.consequences.slice(0, 4) : []
  };
}

function buildWorldGraph(world, microLocationsByLocationId) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeKeys = new Set();

  pushNode({ id: 'historical-layer', type: 'historical', label: `${world.historical?.era ?? 'история'} ${world.historical?.year ?? ''}`.trim() });
  pushNode({ id: 'region-layer', type: 'region', label: world.region?.name ?? 'регион' });

  for (const location of Object.values(world.locations ?? {})) {
    pushNode({ id: `location:${location.id}`, type: 'location', label: location.name, kind: location.kind });
    for (const exit of location.exits ?? []) {
      pushEdge({
        from: `location:${location.id}`,
        to: `location:${exit.to}`,
        type: 'path',
        label: exit.label
      });
    }

    for (const microLocation of microLocationsByLocationId[location.id] ?? []) {
      pushNode({
        id: `micro:${microLocation.id}`,
        type: 'micro-location',
        label: microLocation.name,
        kind: microLocation.kind
      });
      pushEdge({
        from: `location:${location.id}`,
        to: `micro:${microLocation.id}`,
        type: 'contains'
      });

      for (const door of microLocation.doors ?? []) {
        pushNode({ id: `door:${door.id}`, type: 'door', label: door.label, locked: door.locked });
        pushEdge({ from: `micro:${microLocation.id}`, to: `door:${door.id}`, type: 'doorway' });
      }

      for (const container of microLocation.containers ?? []) {
        pushNode({
          id: `container:${container.id}`,
          type: 'container',
          label: container.label,
          ownerName: container.ownerName
        });
        pushEdge({ from: `micro:${microLocation.id}`, to: `container:${container.id}`, type: 'holds' });
      }

      for (const entryPoint of microLocation.entryPoints ?? []) {
        pushNode({ id: `entry:${entryPoint.id}`, type: 'entry-point', label: entryPoint.label });
        pushEdge({ from: `micro:${microLocation.id}`, to: `entry:${entryPoint.id}`, type: 'access' });
      }
    }
  }

  return { nodes, edges };

  function pushNode(node) {
    if (!node?.id || nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  function pushEdge(edge) {
    if (!edge?.from || !edge?.to) return;
    if (edge.type === 'path' && edge.from === edge.to) return;
    const key = [edge.from, edge.to, edge.type ?? '', edge.label ?? ''].join('|');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  }
}

function buildNpcSchedules(world) {
  const schedules = {};
  for (const npc of world.npcs ?? []) {
    if (!npc?.id) continue;
    schedules[npc.id] = createNpcSchedule(npc, world);
  }
  return schedules;
}

function createNpcSchedule(npc, world) {
  const homeLocationId = npc.homeLocation ?? world.current_position?.location_id ?? null;
  const role = String(npc.role ?? '').toLowerCase();

  if (role.includes('хозяин') || role.includes('староста') || role.includes('чиновник')) {
    return [
      { from: 0, to: 6, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'сон и охрана' },
      { from: 6, to: 10, locationId: homeLocationId, microLocationId: `${homeLocationId}:entry`, activity: 'проверка двора' },
      { from: 10, to: 18, locationId: homeLocationId, microLocationId: `${homeLocationId}:center`, activity: 'приём людей' },
      { from: 18, to: 24, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'закрывает дела' }
    ];
  }

  if (role.includes('служ') || role.includes('подмаст') || role.includes('мальчик')) {
    return [
      { from: 0, to: 6, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'сон' },
      { from: 6, to: 12, locationId: homeLocationId, microLocationId: `${homeLocationId}:entry`, activity: 'дела и поручения' },
      { from: 12, to: 18, locationId: homeLocationId, microLocationId: `${homeLocationId}:center`, activity: 'беготня и помощь' },
      { from: 18, to: 24, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'вечерняя работа' }
    ];
  }

  return [
    { from: 0, to: 8, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'ночной отдых' },
    { from: 8, to: 15, locationId: homeLocationId, microLocationId: `${homeLocationId}:center`, activity: 'дневные дела' },
    { from: 15, to: 22, locationId: homeLocationId, microLocationId: `${homeLocationId}:entry`, activity: 'общение и перемещения' },
    { from: 22, to: 24, locationId: homeLocationId, microLocationId: `${homeLocationId}:edge`, activity: 'сон' }
  ];
}

function buildStartPosition(world, location, microLocations, catalogRegion) {
  const startNode = pickStartMicroLocation(location, microLocations);
  return {
    locationId: location?.id ?? world.current_position?.location_id ?? null,
    microLocationId: startNode?.id ?? null,
    entryPointId: startNode?.entryPoints?.[0]?.id ?? null,
    coordinates: startNode ? deriveLocalCoordinates(location, catalogRegion) : catalogRegion?.coordinates ?? null,
    reason: location?.profile?.purpose ?? null,
    description: startNode
      ? `Стартовая точка внутри ${location?.name ?? 'места'}: ${startNode.name}.`
      : `Стартовая точка совпадает с ${location?.name ?? 'местом'}.`
  };
}

function buildDatabaseShape(world, location, catalogRegion) {
  return {
    coordinates: {
      world: catalogRegion?.coordinates ?? null,
      place: deriveLocalCoordinates(location, catalogRegion),
      focus: catalogRegion?.coordinates ? { ...catalogRegion.coordinates, depth: 'focused' } : null
    },
    connections: {
      roads: summarizeRoads(world),
      exits: Array.isArray(location?.exits) ? location.exits.map((exit) => exit.label) : []
    },
    economy: {
      region: world.region?.economy ?? [],
      place: location?.profile?.economy ?? []
    },
    authority: {
      region: world.region?.politics ?? [],
      place: location?.profile?.authority ?? []
    },
    law: {
      region: world.historical?.behavioralRules ?? [],
      place: location?.profile?.law ?? []
    },
    socialMood: {
      region: deriveRegionMood(world.region, world),
      place: deriveLocalMood(location, world)
    },
    events: {
      region: world.historical?.anchorEvents ?? [],
      place: location?.profile?.events ?? []
    },
    historicalBackground: {
      region: world.historical?.materialCulture ?? [],
      place: location?.profile?.historicalBackground ?? []
    },
    weather: {
      region: world.scene?.weather ?? null,
      place: location?.weather ?? null
    },
    npcGroups: {
      region: buildRegionNpcGroups(world),
      place: buildLocationNpcGroups(location, world)
    },
    itemCategories: {
      region: buildRegionItemCategories(world),
      place: location?.profile?.itemCategories ?? []
    },
    risks: {
      region: world.region?.tensions ?? [],
      place: location?.profile?.hazards ?? []
    },
    clocks: {
      world: [{ kind: 'season', value: world.history?.season ?? null }],
      place: location?.profile?.clocks ?? []
    },
    rumorSeeds: {
      world: world.historical?.routeArchive ?? [],
      place: location?.profile?.rumorSeeds ?? []
    },
    causes: {
      world: world.historical?.behavioralRules ?? [],
      place: location?.profile?.causes ?? []
    }
  };
}

function pickNeighborCatalogEntries(world, regionCatalog, catalogRegion) {
  if (!Array.isArray(regionCatalog) || regionCatalog.length === 0 || !catalogRegion) return [];
  const baseSummary = buildRegionSummary(world, catalogRegion, { focus: true });
  const baseZone = baseSummary.macroZone ?? null;
  const baseName = normalizeRegionName(catalogRegion.name ?? '');
  const hints = [
    normalizeRegionName(world.region?.name ?? ''),
    normalizeRegionName(world.history?.regionHint ?? ''),
    normalizeRegionName(world.historical?.regionHint ?? ''),
    baseName
  ].filter(Boolean);

  return regionCatalog
    .filter((entry) => entry && entry.id !== catalogRegion.id)
    .map((entry, index) => {
      const summary = buildRegionSummary(world, entry, { neighbor: true });
      const entryName = normalizeRegionName(entry.name ?? '');
      let score = index;
      if (baseZone && summary.macroZone === baseZone) score -= 1000;
      if (hints.some((hint) => entryName.includes(hint) || hint.includes(entryName))) score -= 100;
      if (baseName && entryName.startsWith(baseName)) score -= 20;
      return { entry, score };
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((item) => item.entry);
}

function offsetCoordinates(coordinates, directionIndex) {
  if (!coordinates) return null;
  const offsets = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];
  const offset = offsets[directionIndex] ?? { x: 0, y: 0 };
  return {
    x: coordinates.x + offset.x,
    y: coordinates.y + offset.y,
    ring: coordinates.ring,
    position: coordinates.position
  };
}

function deriveLocalCoordinates(location, catalogRegion) {
  if (!location && !catalogRegion) return null;
  const base = catalogRegion?.coordinates ?? { x: 0, y: 0, ring: 0, position: 0 };
  const hash = hashString([location?.id ?? '', location?.name ?? '', location?.kind ?? ''].join('|'));
  return {
    x: base.x + ((hash % 3) - 1),
    y: base.y + (((hash >> 2) % 3) - 1),
    ring: base.ring,
    position: base.position,
    depth: location ? location.kind : 'region'
  };
}

function buildRegionNpcGroups(world) {
  const groups = new Map();
  for (const npc of world.npcs ?? []) {
    const key = String(npc.role ?? 'жители').toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(npc.name);
  }
  return Array.from(groups.entries()).slice(0, 6).map(([role, names]) => ({ role, members: names.slice(0, 6) }));
}

function buildLocationNpcGroups(location, world = null) {
  const occupants = Array.isArray(location?.occupants) ? location.occupants : [];
  const npcs = Array.isArray(world?.npcs) ? world.npcs : [];
  return occupants.slice(0, 6).map((name) => {
    const npc = npcs.find((item) => item.name === name) ?? null;
    return {
      name,
      role: npc?.role ?? 'неизвестно',
      mood: npc?.mood ?? null,
      currentActivity: npc?.actorProfile?.work?.currentActivity ?? null
    };
  });
}

function buildRegionItemCategories(world) {
  const categories = new Set();
  for (const location of Object.values(world.locations ?? {})) {
    for (const item of location.landmarks ?? []) {
      categories.add(classifyItemCategory(item));
    }
  }
  return Array.from(categories).filter(Boolean).slice(0, 6);
}

function classifyItemCategory(text) {
  const value = String(text ?? '').toLowerCase();
  if (/двер|ворот|засов|щеколд/.test(value)) return 'перегородки';
  if (/колод|река|вода|берег/.test(value)) return 'вода';
  if (/амбар|склад|сундук|мешок/.test(value)) return 'хранилище';
  if (/телег|кони|дорог|тракт|мост/.test(value)) return 'транспорт и путь';
  if (/очаг|дым|печ|огонь/.test(value)) return 'тепло и огонь';
  return 'прочее';
}

function deriveRegionMood(region, world = null) {
  if (!allowsProceduralSemantics(world)) return null;
  const tensions = Array.isArray(region?.tensions) ? region.tensions.join(' ').toLowerCase() : '';
  if (/трев|опас|чуж|войн/.test(tensions)) return 'тревожно';
  if (/торг|цены|обмен/.test(tensions)) return 'делово';
  if (/холод|голод|запас/.test(tensions)) return 'напряжённо';
  return 'нейтрально';
}

function pickEventSeeds(historical, index) {
  return [
    historical.anchorEvents[index % historical.anchorEvents.length] ?? null,
    historical.anchorEvents[(index + 1) % historical.anchorEvents.length] ?? null
  ].filter(Boolean);
}

export function pickStartMicroLocation(location, microLocations) {
  if (!location || microLocations.length === 0) return null;
  const kind = String(location.kind ?? '').toLowerCase();
  if (kind.includes('двор') || kind.includes('рын')) return microLocations.find((item) => item.kind === 'центр') ?? microLocations[0];
  if (kind.includes('берег') || kind.includes('лес')) return microLocations.find((item) => item.kind === 'вход') ?? microLocations[0];
  return microLocations[0];
}

function summarizeRoads(world) {
  const exits = Object.values(world.locations ?? {}).flatMap((location) => location.exits ?? []);
  return exits.slice(0, 6).map((exit) => exit.label);
}

function normalizeRegionName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function deriveLocalMood(location, world = null) {
  if (!allowsProceduralSemantics(world)) return location?.profile?.mood ?? null;
  const pressure = Array.isArray(location?.pressure) ? location.pressure[0] : '';
  if (!pressure) return 'нейтрально';
  if (/трев|опас|подозр/i.test(pressure)) return 'тревожно';
  if (/торг|счёт|ожидан/i.test(pressure)) return 'делово';
  if (/тихо|ноч/i.test(pressure)) return 'приглушённо';
  return 'напряжённо';
}

function visibleOccupants(location, world) {
  if (!location) return [];
  const currentMicroLocationId = world.current_position?.minilocation_id ?? null;
  const visible = [];
  for (const npc of world.npcs ?? []) {
    const npcLocationId = npc.locationId ?? npc.homeLocation ?? null;
    const npcMicroLocationId = npc.microLocationId ?? null;
    if (npcLocationId !== location.id) continue;
    if (currentMicroLocationId && npcMicroLocationId && npcMicroLocationId !== currentMicroLocationId) continue;
    visible.push(npc.name);
  }
  if (visible.length > 0) return visible;
  return (location.occupants ?? []).map((occupant) => occupant?.name ?? occupant).filter(Boolean);
}

function pickScheduleHint(location, kind) {
  const suffix = kind === 'вход' ? 'вход и поток людей' : kind === 'ядро' ? 'основная активность' : 'тихий край и следы';
  return `${location.name}: ${suffix}`;
}

function pickFrom(values, index) {
  if (!Array.isArray(values) || values.length === 0) return 'нет данных';
  return values[index % values.length];
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function flattenNodeValues(node) {
  return [
    node?.name,
    node?.kind,
    ...(Array.isArray(node?.visibleObjects) ? node.visibleObjects : []),
    ...(Array.isArray(node?.traces) ? node.traces : []),
    ...(Array.isArray(node?.containers) ? node.containers.map((item) => item?.label ?? item) : []),
    ...(Array.isArray(node?.doors) ? node.doors.map((item) => item?.label ?? item) : []),
    ...(Array.isArray(node?.entryPoints) ? node.entryPoints.map((item) => item?.label ?? item) : [])
  ];
}

function buildFixtures(location) {
  const exits = Array.isArray(location.exits) ? location.exits : [];
  const landmarks = Array.isArray(location.landmarks) ? location.landmarks : [];
  const owners = Array.isArray(location.occupants) ? location.occupants : [];
  const profileOwner = location.profile?.ownership ?? null;
  const containerLandmarks = landmarks.filter(isStorageLikeLandmark);
  return {
    doors: exits.map((exit, index) => ({
      id: `${location.id}:door:${index}`,
      label: exit.label,
      locked: index === 0 && /guard|охран|сторож/i.test(location.kind ?? ''),
      ownerName: profileOwner?.name ?? owners[index % Math.max(1, owners.length)] ?? null
    })),
    containers: containerLandmarks.slice(0, 4).map((landmark, index) => ({
      id: `${location.id}:container:${index}`,
      label: landmark,
      ownerName: profileOwner?.name ?? owners[index % Math.max(1, owners.length)] ?? null,
      locked: index === 0 && /склад|амбар|двор/i.test(location.kind ?? ''),
      contentsHint: `Следы и вещи около ${landmark}`
    })),
    entryPoints: exits.map((exit, index) => ({
      id: `${location.id}:entry:${index}`,
      label: exit.label,
      kind: index === 0 ? 'главный вход' : 'проход'
    })),
    links: exits.map((exit, index) => ({
      from: `${location.id}:entry:${index}`,
      to: exit.to,
      label: exit.label
    })).concat(containerLandmarks.slice(0, 2).map((landmark, index) => ({
      from: `${location.id}:container:${index}`,
      to: `${location.id}:center`,
      label: landmark
    })))
  };
}

function isStorageLikeLandmark(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  if (isGroupedStorageLandmark(text)) return false;
  return /(сундук|ларец|мешок|сумк|кошел|корзин|бочк|ящик|полк|стеллаж|амбар|склад|клеть|закром|ларь|тюк|узелок|чехол|футляр)/i.test(text);
}

function isGroupedStorageLandmark(text) {
  return [
    'мешки',
    'бочки',
    'склады',
    'ряды',
    'лавки',
    'навесы',
    'тюки',
    'корзины',
    'ящики',
    'полки',
    'стеллажи'
  ].some((word) => text.includes(word));
}
