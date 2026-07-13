import { getCurrentLocation } from './location.js';
import { allowsProceduralSemantics } from './semantic-gate.js';

export function buildRouteReconstruction(world, intent = null) {
  const location = getCurrentLocation(world);
  const target = String(intent?.target ?? intent?.raw ?? '').trim();
  const candidates = buildCandidates(world, location, target);
  const selected = pickSelectedRoute(candidates, world, target);
  const route = buildCanonicalRoute(world, location, selected, target);

  return {
    id: `route:${world.worldKey}:${world.clock?.day ?? 0}:${world.clock?.hour ?? 0}:${slugify(target || location?.name || 'route')}`,
    createdAt: { ...world.clock },
    type: intent?.type ?? 'route',
    target,
    originLocationId: location?.id ?? null,
    originName: location?.name ?? world.place?.name ?? 'unknown',
    season: world.history?.season ?? 'unknown',
    weather: world.scene?.weather ?? 'unknown',
    light: world.scene?.light ?? 'unknown',
    localEvents: collectLocalEvents(world),
    candidates,
    selected,
    route,
    summary: renderRouteSummary(selected, candidates, world)
  };
}

export function recordRouteReconstruction(world, reconstruction) {
  if (!reconstruction || typeof reconstruction !== 'object') return null;
  if (!world.historical) world.historical = {};
  if (!Array.isArray(world.historical.routeArchive)) world.historical.routeArchive = [];

  const key = reconstruction.id ?? `${reconstruction.originLocationId}:${reconstruction.target}:${reconstruction.season}`;
  const existingIndex = world.historical.routeArchive.findIndex((item) => item.id === key);
  const entry = {
    ...reconstruction,
    id: key,
    updatedAt: { ...world.clock }
  };

  if (existingIndex >= 0) {
    world.historical.routeArchive[existingIndex] = entry;
  } else {
    world.historical.routeArchive.unshift(entry);
  }

  world.historical.routeArchive = world.historical.routeArchive.slice(0, 30);
  world.catalogDirty = true;
  return entry;
}

export function getLatestRouteReconstructions(world, limit = 3) {
  return Array.isArray(world.historical?.routeArchive)
    ? world.historical.routeArchive.slice(0, limit)
    : [];
}

function buildCandidates(world, location, target) {
  const routes = Array.isArray(world.historical?.roadRoutes) ? world.historical.roadRoutes : [];
  const exits = Array.isArray(location?.exits) ? location.exits : [];
  const season = String(world.history?.season ?? '').toLowerCase();
  const weather = String(world.scene?.weather ?? '').toLowerCase();
  const timeRisk = (world.clock?.hour ?? 0) < 6 || (world.clock?.hour ?? 0) >= 20 ? 'night' : 'day';
  const localEvents = collectLocalEvents(world);

  const exitCandidates = exits.map((exit, index) => {
    const availability = evaluateAvailability(exit.label, season, weather, timeRisk, target, '', localEvents);
    const destination = world.locations?.[exit.to ?? ''] ?? null;
    const destinationBlocked = isBlockedLocationAccess(destination);
    return {
      id: `exit:${location?.id ?? 'unknown'}:${index}`,
      kind: 'local-exit',
      label: exit.label,
      destination: exit.to,
      availability: destinationBlocked ? 'blocked' : availability.status,
      risk: destinationBlocked ? 'место сейчас закрыто по времени или порядку' : availability.risk,
      minutes: availability.minutes,
      evidence: destinationBlocked ? [...availability.evidence, 'destination access closed'] : availability.evidence
    };
  });

  const roadCandidates = routes.map((route, index) => {
    const availability = evaluateAvailability(route.route, season, weather, timeRisk, target, route.risk, localEvents);
    return {
      id: `road:${index}`,
      kind: 'regional-route',
      label: route.route,
      region: route.region,
      availability: availability.status,
      risk: availability.risk,
      minutes: availability.minutes,
      evidence: availability.evidence
    };
  });

  return [...exitCandidates, ...roadCandidates];
}

function pickSelectedRoute(candidates, world, target) {
  if (candidates.length === 0) return null;
  const needle = String(target ?? '').trim().toLowerCase();
  const archived = findArchivedRoute(world, needle);
  if (archived) return { ...archived, confirmed: true, fromArchive: true };

  if (!needle) return null;

  const exact = candidates.find((item) => String(item.label ?? '').toLowerCase().includes(needle) || String(item.destination ?? '').toLowerCase().includes(needle));
  if (exact) return { ...exact, confirmed: true };

  const best = candidates.slice().sort((a, b) => scoreRouteCandidate(b, world) - scoreRouteCandidate(a, world))[0] ?? null;
  if (!best) return null;
  return { ...best, confirmed: false, needsConfirmation: true };
}

export function findArchivedRoute(world, target = '') {
  const needle = String(target ?? '').trim().toLowerCase();
  if (!needle) return null;
  const archive = Array.isArray(world?.historical?.routeArchive) ? world.historical.routeArchive : [];
  const entry = archive.find((item) => {
    const haystack = `${item?.target ?? ''} ${item?.selected?.label ?? ''} ${item?.route?.label ?? ''}`.toLowerCase();
    return haystack.includes(needle) || needle.includes(String(item?.selected?.label ?? '').toLowerCase());
  });
  return entry?.selected ?? null;
}

export function isRouteSelectionConfirmed(selected) {
  return Boolean(selected?.confirmed || selected?.fromArchive);
}

function scoreRouteCandidate(candidate, world) {
  let score = 0;
  if (candidate.availability === 'open') score += 3;
  if (candidate.availability === 'slow') score += 1;
  if (candidate.availability === 'blocked') score -= 3;
  if ((world.social?.suspicion ?? 0) > 5) score -= 1;
  if (candidate.kind === 'local-exit') score += 1;
  return score;
}

function evaluateAvailability(label, season, weather, timeRisk, target, baseRisk = '', localEvents = []) {
  const text = `${label} ${baseRisk} ${target}`.toLowerCase();
  const evidence = [];
  let minutes = 35;
  let status = 'open';
  let risk = baseRisk || 'обычный путь';

  if (/река|переправ|брод/.test(text)) {
    minutes += 15;
    evidence.push('water crossing');
    if ((/дожд|туман|холод|сыр/.test(weather) || /осень|зима/.test(season)) && /река|переправ|брод/.test(text)) {
      status = 'slow';
      risk = 'переправа осложнена водой или льдом';
      minutes += 15;
    }
  }

  if (/лес|чащ|троп|борт|гряз|дорог/.test(text)) {
    minutes += 10;
    evidence.push('road surface and cover');
    if (timeRisk === 'night') {
      status = status === 'blocked' ? 'blocked' : 'slow';
      minutes += 10;
      risk = 'ночной путь сложнее из-за видимости и свидетелей';
    }
  }

  if (/тракт|торг|ворот|город|укрепл/.test(text)) {
    evidence.push('controlled road');
    minutes -= 5;
  }

  if (/raid|разб|воен|страж|граб/.test(text)) {
    status = 'slow';
    minutes += 20;
    risk = 'военная или разбойная угроза';
    evidence.push('armed threat');
  }

  if ((Array.isArray(localEvents) ? localEvents : []).some((event) => /разб|наскок|воен|сбор|бегство|кров|мост|переправ/i.test(String(event)))) {
    status = status === 'open' ? 'slow' : status;
    minutes += 10;
    risk = risk === 'обычный путь' ? 'локальные события уже влияют на дорогу' : risk;
    evidence.push('local events');
  }

  if (/зима|осень/.test(season) && /лес|брод|переправ|поле/.test(text)) {
    status = status === 'open' ? 'slow' : status;
    minutes += 10;
  }

  if (/ночь|темно/.test(timeRisk)) {
    minutes += 5;
  }

  if (worldSeasonBlocked(season, text) && /переправ|брод|река/.test(text)) {
    status = 'blocked';
    risk = 'сезон делает путь ненадёжным или невыгодным';
    minutes += 20;
  }

  return {
    kind: 'route_mechanical_proposal',
    status,
    risk: allowsProceduralSemantics() ? risk : toMechanicalRiskCode(status, evidence),
    minutes: Math.max(10, Math.min(180, minutes)),
    evidence: evidence.length > 0 ? evidence : ['local route tradition']
  };
}

function toMechanicalRiskCode(status, evidence = []) {
  if (status === 'blocked') return 'blocked_season_or_access';
  if (evidence.includes('water crossing')) return 'water_crossing';
  if (evidence.includes('armed threat')) return 'armed_threat';
  if (evidence.includes('local events')) return 'local_events';
  if (status === 'slow') return 'slow_path';
  return 'open_path';
}

function worldSeasonBlocked(season, text) {
  if (/переправ|брод/.test(text) && /зима/.test(season)) return true;
  if (/лес|тропа/.test(text) && /поздняя осень|зима/.test(season)) return false;
  return false;
}

function isBlockedLocationAccess(location) {
  const access = String(location?.profile?.access ?? '').toLowerCase();
  return access.includes('закрыто');
}

function collectLocalEvents(world) {
  return (world.events ?? [])
    .slice(0, 8)
    .map((event) => event?.result)
    .filter(Boolean)
    .slice(0, 4);
}

function renderRouteSummary(selected, candidates, world) {
  if (!selected) {
    return `Маршрут неясен для ${world.place?.name ?? 'места'}.`;
  }

  return [
    `Маршрут ${selected.label} сейчас: ${selected.availability}.`,
    `Риск: ${selected.risk}.`,
    `Оценка времени: ${selected.minutes} мин.`,
    selected.evidence?.length ? `Основание: ${selected.evidence.join('; ')}.` : null,
    candidates.length > 1 ? `Альтернативы: ${candidates.slice(0, 3).map((item) => `${item.label}/${item.availability}`).join(' | ')}.` : null
  ].filter(Boolean).join(' ');
}

function buildCanonicalRoute(world, location, selected, target) {
  if (!selected) return null;
  const routeId = selected.id ?? `route:${slugify(target || location?.id || 'route')}`;
  const fromId = getRouteCurrentLocationId(world, location);
  const toId = selected.destination ?? selected.region ?? null;
  const scale = selected.kind === 'local-exit' ? 'local' : 'regional';
  const type = selected.kind === 'local-exit' ? 'path' : 'road';
  const access = selected.availability ?? 'unknown';
  const knownToCharacter = isRouteKnownToCharacter(world, location, selected, target);
  return {
    id: routeId,
    from_id: fromId,
    to_id: toId,
    scale,
    type,
    base_time: selected.minutes ?? 35,
    access,
    conditions: Array.isArray(selected.evidence) ? selected.evidence.slice(0, 4) : [],
    risk: selected.risk ?? null,
    known_to_character: knownToCharacter,
    known_to_player: knownToCharacter,
    seasonal_rule: summarizeSeasonalRule(world, selected),
    reverse_route_id: resolveReverseRouteId(world, location, selected, routeId),
    last_used_at: { ...world.clock }
  };
}

function getRouteCurrentLocationId(world = {}, location = null) {
  return location?.id
    ?? world?.current_position?.location_id
    ?? world?.current_position?.place_id
    ?? null;
}

function isRouteKnownToCharacter(world, location, selected, target) {
  if (!selected) return false;
  if (selected.kind === 'local-exit') return Boolean(location?.id);

  const knowledge = world?.player?.knowledge_map ?? {};
  const knownSignals = [
    ...collectKnowledgeSignals(knowledge.known_routes),
    ...collectKnowledgeSignals(knowledge.knownPlaces),
    ...collectKnowledgeSignals(knowledge.known_places),
    ...collectVisitedPlaceSignals(world?.memory?.visitedPlaces)
  ];

  if (knownSignals.length === 0) return false;

  const candidateText = [
    selected.label,
    selected.region,
    target,
    location?.name,
    world?.place?.name
  ]
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  return knownSignals.some((item) => candidateText.includes(item) || item.includes(candidateText));
}

function collectKnowledgeSignals(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
    : [];
}

function collectVisitedPlaceSignals(visitedPlaces) {
  if (Array.isArray(visitedPlaces)) {
    return visitedPlaces
      .map((item) => item?.name ?? item?.placeName ?? item?.title ?? item)
      .map((item) => String(item ?? '').trim().toLowerCase())
      .filter(Boolean);
  }

  if (!visitedPlaces || typeof visitedPlaces !== 'object') return [];

  return Object.entries(visitedPlaces)
    .flatMap(([placeId, record]) => [
      placeId,
      record?.name,
      record?.placeName,
      record?.title
    ])
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter(Boolean);
}

function summarizeSeasonalRule(world, selected) {
  const season = String(world.history?.season ?? '').trim();
  const text = String(selected?.risk ?? '').trim();
  if (!season && !text) return null;
  return [season ? `season:${season}` : null, text ? `rule:${text}` : null].filter(Boolean).join('; ') || null;
}

function resolveReverseRouteId(world, location, selected, routeId) {
  if (!selected || !location) return null;

  if (selected.kind === 'local-exit' && selected.destination) {
    const destination = world.locations?.[selected.destination];
    if (!destination || !Array.isArray(destination.exits)) return null;
    const reverseIndex = destination.exits.findIndex((exit) => exit?.to === location.id);
    if (reverseIndex >= 0) {
      return `exit:${destination.id}:${reverseIndex}`;
    }
    return null;
  }

  if (selected.kind === 'regional-route' && typeof selected.label === 'string') {
    const reverseIndex = findReverseRegionalRouteIndex(world, selected.label);
    if (reverseIndex >= 0) {
      return `road:${reverseIndex}`;
    }
  }

  if (typeof routeId === 'string' && routeId.startsWith('exit:')) return null;
  return null;
}

function findReverseRegionalRouteIndex(world, routeLabel) {
  const candidateNodes = parseRouteNodes(routeLabel);
  if (candidateNodes.length < 2) return -1;
  const reversedSignature = routeSignature(candidateNodes.slice().reverse());
  const routes = Array.isArray(world.historical?.roadRoutes) ? world.historical.roadRoutes : [];

  for (let index = 0; index < routes.length; index += 1) {
    const entry = routes[index];
    const entryNodes = parseRouteNodes(entry?.route ?? entry);
    if (entryNodes.length < 2) continue;
    if (routeSignature(entryNodes) === reversedSignature) return index;
  }

  return -1;
}

function parseRouteNodes(routeValue) {
  return String(routeValue ?? '')
    .split(/\s*->\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeSignature(nodes) {
  return nodes.map((node) => normalizeRouteNode(node)).join('>');
}

function normalizeRouteNode(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}
