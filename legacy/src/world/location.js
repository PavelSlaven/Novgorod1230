import { pickStartMicroLocation, resolveMicroLocation } from './cluster.js';
import { buildCurrentPosition, getActiveStateValue, syncCurrentPosition } from './profile-v2.js';
import { syncHistoricalContext } from './historical-context.js';
import { recordWorldEvent } from './event-log.js';
import { allowsProceduralSemantics, queueSemanticPending } from './semantic-gate.js';
import { calculateTravelTime, progressBandFromSteps } from './formulas.js';

export function cloneLocation(location) {
  return structuredClone(location);
}

function uniqueLabels(values, limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

export function getCurrentLocation(world) {
  const canonicalPosition = resolveCanonicalPosition(world);
  const canonicalLocationId = canonicalPosition?.location_id
    ?? canonicalPosition?.place_id
    ?? null;
  return world.locations?.[canonicalLocationId] ?? null;
}

export function getCurrentMicroLocation(world) {
  const location = getCurrentLocation(world);
  if (!location) return null;
  const microLocations = world.cluster?.microLocationsByLocationId?.[location.id] ?? [];
  const canonicalPosition = resolveCanonicalPosition(world);
  const canonicalMicroLocationId = canonicalPosition?.minilocation_id ?? null;
  return microLocations.find((item) => item.id === canonicalMicroLocationId) ?? microLocations[0] ?? null;
}

function resolveCanonicalPosition(world) {
  if (world?.current_position && typeof world.current_position === 'object') {
    return world.current_position;
  }
  return buildCurrentPosition(world ?? {});
}

export function ensureLocationProfiles(world) {
  if (!world?.locations || typeof world.locations !== 'object') return world;
  for (const location of Object.values(world.locations)) {
    if (!location || typeof location !== 'object') continue;
    if (!location.profile || typeof location.profile !== 'object') {
      location.profile = buildLocationProfile(location, world);
      continue;
    }
    mergeLocationProfile(location.profile, buildLocationProfile(location, world), world);
  }
  return world;
}

export function appendLocationPeriod(world, locationId, period = {}) {
  const location = world?.locations?.[locationId];
  if (!location) return null;
  if (!location.profile || typeof location.profile !== 'object') {
    location.profile = buildLocationProfile(location, world);
  }
  if (!Array.isArray(location.profile.periods)) location.profile.periods = [];

  const entry = normalizePeriod(period, world, location, 'local_period');
  const existing = location.profile.periods.find((item) => item.id && entry.id && item.id === entry.id);
  if (existing) {
    Object.assign(existing, mergePeriodEntry(existing, entry));
  } else {
    location.profile.periods.push(entry);
  }
  location.profile.currentPeriod = pickCurrentPeriod(location.profile.periods, world);
  location.profile.periods = mergePeriods(location.profile.periods, []);
  return location.profile.currentPeriod;
}

export function closeLocationPeriod(world, locationId, periodId, details = {}) {
  const location = world?.locations?.[locationId];
  if (!location?.profile || !Array.isArray(location.profile.periods)) return null;
  const period = location.profile.periods.find((item) => item.id === periodId);
  if (!period) return null;
  if (details.endedBy) period.endedBy = details.endedBy;
  if (details.resolution) period.resolution = details.resolution;
  if (details.impact) period.impact = details.impact;
  if (details.end) period.end = details.end;
  period.state = details.state ?? 'ended';
  location.profile.currentPeriod = pickCurrentPeriod(location.profile.periods, world);
  return period;
}

export function buildPlaceView(location) {
  if (!location) {
    return {
      id: 'unknown',
      name: 'неизвестное место',
      kind: 'неизвестно',
      mood: null,
      landmarks: [],
      exits: [],
      occupants: [],
      profile: null
    };
  }

  return {
    id: location.id,
    name: location.name,
    kind: location.kind,
    mood: location.profile?.mood ?? null,
    landmarks: location.landmarks,
    exits: uniqueLabels(location.exits.map((exit) => exit.label), 8),
    occupants: location.occupants.slice(),
    profile: summarizeLocationProfile(location.profile)
  };
}

export function buildSceneView(world, location) {
  const microLocation = getCurrentMicroLocation(world);
  const profile = location.profile ?? buildLocationProfile(location, world);
  const sensory = profile.sensory ?? {};
  return {
    weather: location.weather ?? world.scene?.weather,
    light: location.light ?? world.scene?.light,
    sounds: microLocation?.traces?.length ? [...location.sounds, ...microLocation.traces.slice(0, 2)] : location.sounds.slice(),
    smells: microLocation?.smells?.length ? microLocation.smells.slice(0, 3) : (sensory.smells ?? []).slice(0, 3),
    pressure: location.pressure.slice(),
    attention: location.attention,
    mood: inferSceneMood(world, location, profile),
    purpose: profile.purpose ?? null,
    owners: Array.isArray(profile.owners) ? profile.owners.slice(0, 4) : [],
    access: profile.access ?? null,
    accessRules: Array.isArray(profile.accessRules) ? profile.accessRules.slice(0, 6) : [],
    connections: uniqueLabels(Array.isArray(profile.connections) ? profile.connections : [], 6),
    rhythm: profile.rhythm ?? null,
    materialScene: profile.materialScene ?? null,
    hazards: profile.hazards ?? [],
    ownership: profile.ownership ?? null,
    memory: profile.memory ?? null,
    currentPeriod: profile.currentPeriod ?? pickCurrentPeriod(profile.periods, world),
    periods: summarizePeriods(profile.periods)
  };
}

export function syncCurrentPlace(world, positionOverrides = {}) {
  ensureLocationProfiles(world);
  const location = getCurrentLocation(world);
  if (!location) return;
  location.profile.mood = inferLocationMood(world, location, location.profile);
  syncCurrentPosition(world, positionOverrides);
  world.place = buildPlaceView(location);
  world.scene = buildSceneView(world, location);
  world.microPlace = buildMicroPlaceView(world, location);
  refreshLocationOccupants(world);
  refreshNpcMood(world);
}

export function noteVisit(world, locationId, note = null) {
  if (!world.memory) world.memory = {};
  if (!world.memory.visitedPlaces) world.memory.visitedPlaces = {};

  const record = world.memory.visitedPlaces[locationId] ?? {
    visits: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    notes: []
  };

  record.visits += 1;
  const timestamp = { ...world.clock };
  record.lastSeenAt = timestamp;
  if (!record.firstSeenAt) record.firstSeenAt = timestamp;
  if (note) {
    record.notes.unshift(note);
    record.notes = record.notes.slice(0, 8);
  }

  world.memory.visitedPlaces[locationId] = record;

  const location = world.locations?.[locationId] ?? null;
  recordWorldEvent(world, {
    kind: 'place',
    source: 'memory',
    visibility: 'public',
    status: 'known',
    at: { ...world.clock },
    relatedIds: [locationId],
    label: location?.name ?? locationId,
    result: note ?? `Известно место: ${location?.name ?? locationId}`
  });
}

function knownLocationIds(world) {
  const knownPlaces = world?.player?.knowledge_map?.known_places ?? [];
  return new Set(
    (Array.isArray(knownPlaces) ? knownPlaces : [])
      .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
      .filter(Boolean)
  );
}

export function resolveDestination(world, targetText) {
  const location = getCurrentLocation(world);
  if (!location || !targetText) return null;
  const needle = targetText.toLowerCase();

  const byExit = location.exits.find(
    (exit) => String(exit.label ?? '').toLowerCase().includes(needle) || String(exit.to ?? '').toLowerCase().includes(needle)
  );
  if (byExit) return byExit.to;

  const knownIds = knownLocationIds(world);
  const byKnownName = Object.values(world.locations ?? {}).find((candidate) => {
    if (!candidate?.id || !knownIds.has(candidate.id)) return false;
    return candidate.name?.toLowerCase().includes(needle) || candidate.kind?.toLowerCase().includes(needle);
  });
  return byKnownName?.id ?? null;
}

export function travelWorld(world, targetText, routePlan = null) {
  const current = getCurrentLocation(world);
  if (!current) {
    return { ok: false, text: 'Мир не знает, где ты находишься.', minutes: 0 };
  }

  const destinationId = resolveDestination(world, targetText);
  if (destinationId) {
    if (destinationId === current.id) {
      return {
        ok: true,
        text: 'Ты остаёшься на месте и лишь перераспределяешь своё внимание в уже знакомой точке.',
        minutes: 10
      };
    }

    const exit = current.exits.find((item) => item.to === destinationId);
    if (!exit) {
      return {
        ok: false,
        text: `Отсюда нет прямого пути к ${targetText}. Сначала нужно добраться до связанной точки.`,
        minutes: 15
      };
    }

    const destination = world.locations?.[destinationId] ?? null;
    const currentAccessBlock = describeBlockedTravelAccess(current);
    if (currentAccessBlock) {
      return {
        ok: false,
        text: `${current.name} сейчас не даёт свободно пройти: ${currentAccessBlock}.`,
        minutes: 10
      };
    }

    const destinationAccessBlock = describeBlockedTravelAccess(destination);
    if (destinationAccessBlock) {
      return {
        ok: false,
        text: `${destination?.name ?? targetText} сейчас закрыто: ${destinationAccessBlock}.`,
        minutes: 10
      };
    }

    const routeId = routePlan?.canonicalRoute?.id ?? routePlan?.selected?.id ?? routePlan?.id ?? null;
    if (current.profile?.currentPeriod?.id && current.profile.currentPeriod.kind !== 'historical_calendar') {
      closeLocationPeriod(world, current.id, current.profile.currentPeriod.id, {
        endedBy: `player:${world.player?.name ?? 'player'}`,
        impact: `игрок покидает ${current.name}`,
        resolution: `Период закончился уходом в ${destinationId}.`,
        end: { ...world.clock },
        state: 'ended'
      });
    }
    noteVisit(world, destinationId, `Пришёл из ${current.name}.`);
    const destinationMicroLocations = world.cluster?.microLocationsByLocationId?.[destinationId] ?? [];
    const destinationStart = pickStartMicroLocation(destination, destinationMicroLocations);
    syncCurrentPlace(world, {
      location_id: destinationId,
      last_route_id: routeId,
      minilocation_id: destinationStart?.id ?? null,
      anchor_id: destinationStart?.entryPoints?.[0]?.id ?? destinationStart?.doors?.[0]?.id ?? null
    });
    syncHistoricalContext(world, {
      recordPhaseTransitions: false,
      schedulePhaseDelayedEvents: false
    });

    appendLocationPeriod(world, destinationId, {
      kind: 'party_history',
      label: `Приход игрока из ${current.name}`,
      trigger: `Переход из ${current.name}`,
      changes: allowsProceduralSemantics(world)
        ? [
          `Игрок вошёл в ${getCurrentLocation(world)?.name ?? destinationId}.`,
          `Старое место: ${current.name}.`,
          `Новое место: ${getCurrentLocation(world)?.kind ?? 'место'}.`
        ]
        : [`mechanical:arrival:${destinationId}`],
      consequences: allowsProceduralSemantics(world)
        ? [
          'Появились новые следы и новый риск.',
          'Владение, доступ и поведение людей могут измениться.'
        ]
        : [],
      startedBy: `player:${world.player?.name ?? 'player'}`,
      impact: allowsProceduralSemantics(world) ? 'движение игрока меняет присутствие и память места' : 'mechanical_travel',
      resolution: 'период продолжается, пока место живёт после прихода',
      inheritedFrom: current.profile?.currentPeriod?.id ?? null,
      state: 'active'
    });

    const next = getCurrentLocation(world);
    if (next && allowsProceduralSemantics(world)) {
      next.recentTraces.unshift({
        at: { ...world.clock },
        kind: 'arrival',
        text: `К месту приходит путник из ${current.name}.`
      });
      next.recentTraces = next.recentTraces.slice(0, 12);
    } else if (next) {
      queueSemanticPending(world, 'travel_arrival_trace', {
        from: current.id,
        to: destinationId
      });
    }

    return {
      ok: true,
      text: `Ты переходишь из ${current.name} в ${next?.name ?? 'новое место'}.`,
      minutes: routePlan?.selected?.minutes ?? estimateTravelMinutes(world, targetText, current, next)
    };
  }

  const microMove = travelWithinLocation(world, targetText);
  if (microMove) return microMove;

  if (routePlan?.selected?.needsConfirmation && !routePlan?.selected?.confirmed) {
    return {
      ok: false,
      text: 'Путь ещё не подтверждён. Сначала узнай дорогу или уточни направление.',
      minutes: 10
    };
  }

  if (!destinationId) {
    const direction = parseTravelDirection(targetText);
    if (direction) {
      return updateLongCourse(world, direction, targetText, routePlan);
    }
    return {
      ok: false,
      text: `Ты не назвал понятный путь. Доступно отсюда: ${current.exits.map((exit) => exit.label).join('; ')}.`,
      minutes: 5
    };
  }
}

const LONG_COURSE_MATERIALIZE_BANDS = new Set(['region_edge', 'neighbor_region']);

function updateLongCourse(world, direction, targetText, routePlan = null) {
  if (!world.movement) world.movement = {};
  const existing = world.movement.travel_course ?? world.movement.longCourse ?? null;
  const progress = (existing?.progress ?? 0) + 1;
  const progressBand = progressBandFromSteps(progress);
  const actualSector = direction;
  const perceivedSector = existing?.perceived_sector ?? existing?.perceivedSector ?? direction;
  const confidence = Math.max(0.2, Number(existing?.confidence ?? 0.5) - 0.05);
  const lostCourse = confidence < 0.35;
  const course = {
    origin_place_id: world.current_position?.location_id ?? world.currentLocationId ?? null,
    intended_direction: direction,
    movement_method: 'on_foot',
    known_route: Boolean(routePlan?.selected?.confirmed),
    current_region: world.region?.id ?? world.current_position?.region_id ?? null,
    progress,
    progress_band: progressBand,
    actual_sector: actualSector,
    perceived_sector: lostCourse ? perceivedSector : direction,
    confidence,
    landmarks_seen: Array.isArray(existing?.landmarks_seen) ? existing.landmarks_seen.slice(0, 6) : [],
    historical_anchors_in_direction: Array.isArray(existing?.historical_anchors_in_direction)
      ? existing.historical_anchors_in_direction.slice(0, 6)
      : [],
    risk: Math.min(5, Math.round((1 - confidence) * 5)),
    deviation: lostCourse,
    startedAt: existing?.startedAt ?? { ...world.clock },
    targetText: String(targetText ?? '').trim() || direction
  };
  world.movement.travel_course = course;
  delete world.movement.longCourse;

  if (LONG_COURSE_MATERIALIZE_BANDS.has(progressBand) || progress > 12) {
    queueSemanticPending(world, 'long_course_materialization', {
      direction,
      progress,
      progress_band: progressBand,
      targetText: course.targetText
    });
    return {
      ok: false,
      text: 'Дальний курс ожидает материализации LLM.',
      minutes: routePlan?.selected?.minutes ?? 30,
      pendingMaterialization: true,
      travel_course: course
    };
  }

  const travelRecord = calculateTravelTime(
    { id: routePlan?.selected?.id ?? null, scale: 'nearby', base_time: routePlan?.selected?.minutes ?? 45 },
    world.player ?? {},
    buildTravelConditions(world, targetText)
  );
  if (!world.movement.lastTravelRecord) world.movement.lastTravelRecord = travelRecord;
  else world.movement.lastTravelRecord = travelRecord;

  return {
    ok: true,
    text: `Ты держишь дальний курс на ${direction}. Прогресс: ${progressBand}.`,
    minutes: travelRecord.final_time,
    travel_course: course,
    travelRecord
  };
}

export function travelReturn(world) {
  const lastRouteId = world.current_position?.last_route_id ?? null;
  if (!lastRouteId) {
    return { ok: false, text: 'Нет сохранённого маршрута для возврата.', minutes: 10 };
  }
  const archive = Array.isArray(world.historical?.routeArchive) ? world.historical.routeArchive : [];
  const routeEntry = archive.find((item) => item.id === lastRouteId || item.selected?.id === lastRouteId);
  const originId = routeEntry?.originLocationId ?? null;
  if (!originId || !world.locations?.[originId]) {
    return { ok: false, text: 'Последний маршрут не найден или точка возврата недоступна.', minutes: 15 };
  }
  const current = getCurrentLocation(world);
  if (current?.id === originId) {
    return { ok: true, text: 'Ты уже в месте, откуда шёл последний маршрут.', minutes: 5 };
  }
  noteVisit(world, originId, 'Вернулся по last_route_id.');
  syncCurrentPlace(world, {
    location_id: originId,
    last_route_id: lastRouteId,
    minilocation_id: world.cluster?.microLocationsByLocationId?.[originId]?.[0]?.id ?? null
  });
  syncHistoricalContext(world, {
    recordPhaseTransitions: false,
    schedulePhaseDelayedEvents: false
  });
  const next = getCurrentLocation(world);
  return {
    ok: true,
    text: `Ты возвращаешься по сохранённому маршруту в ${next?.name ?? 'прежнее место'}.`,
    minutes: routeEntry?.selected?.minutes ?? 35
  };
}

function describeBlockedTravelAccess(location) {
  const access = String(location?.profile?.access ?? '').toLowerCase();
  if (!access) return null;
  if (access.includes('закрыто')) return String(location?.profile?.access ?? '').trim();
  return null;
}

export function travelWithinLocation(world, targetText) {
  const location = getCurrentLocation(world);
  if (!location) return null;
  const microLocations = world.cluster?.microLocationsByLocationId?.[location.id] ?? [];
  if (microLocations.length === 0) return null;

  const target = resolveMicroLocation(microLocations, targetText);
  if (!target) return null;
  const currentMicroLocationId = world.current_position?.minilocation_id ?? null;
  if (target.id === currentMicroLocationId) {
    return {
      ok: true,
      text: `Ты остаёшься внутри ${location.name}, но меняешь точку внимания на ${target.name}.`,
      minutes: 10
    };
  }

  world.currentMicroLocationId = target.id;
  syncCurrentPlace(world, {
    minilocation_id: target.id,
    anchor_id: target.entryPoints?.[0]?.id ?? target.doors?.[0]?.id ?? target.id
  });
  syncHistoricalContext(world, {
    recordPhaseTransitions: false,
    schedulePhaseDelayedEvents: false
  });
  return {
    ok: true,
    text: `Ты смещаешься внутри ${location.name} к ${target.name}.`,
    minutes: 15
  };
}

export function applyLocationPressure(world) {
  const location = getCurrentLocation(world);
  if (!location) return;

  location.activity = rotate(location.activity);
  if (location.recentTraces.length > 0) {
    location.recentTraces.unshift({
      at: { ...world.clock },
      kind: 'time',
      text: 'Время проходит, и старые следы теряют резкость.'
    });
    location.recentTraces = location.recentTraces.slice(0, 12);
  }

  if (location.condition === 'quiet' && world.clock.hour >= 18) {
    location.condition = 'settling';
  } else if (location.condition === 'settling' && world.clock.hour >= 21) {
    location.condition = 'nightfall';
  }
}

export function ageLocations(world, minutes) {
  if (!world.locations) return;
  for (const location of Object.values(world.locations)) {
    if (!location) continue;
    location.weather = world.scene?.weather ?? location.weather;
    location.light = world.scene?.light ?? location.light;
    if (location.profile && typeof location.profile === 'object') {
      const owner = location.profile.ownership ?? inferOwner(location, Array.isArray(location.occupants) ? location.occupants : []);
      location.profile.access = inferAccess(String(location.kind ?? '').toLowerCase(), Array.isArray(location.occupants) ? location.occupants : [], world.clock?.hour ?? 0, owner);
      location.profile.rhythm = inferRhythm(String(location.kind ?? '').toLowerCase(), world, location, Array.isArray(location.occupants) ? location.occupants : []);
      location.profile.currentPeriod = pickCurrentPeriod(location.profile.periods, world);
      location.profile.sensory = {
        ...(location.profile.sensory && typeof location.profile.sensory === 'object' ? location.profile.sensory : {}),
        light: location.light ?? world.scene?.light ?? location.profile.sensory?.light ?? null
      };
    }

    if (Array.isArray(location.activity) && location.activity.length > 1 && minutes >= 60) {
      location.activity = rotate(location.activity);
    }

    if (Array.isArray(location.recentTraces) && location.recentTraces.length > 0 && minutes >= 45) {
      location.recentTraces.unshift({
        at: { ...world.clock },
        kind: 'time',
        text: 'Время проходит, и старые следы здесь теряют резкость.'
      });
      location.recentTraces = location.recentTraces.slice(0, 12);
    }
  }
}

function rotate(values) {
  if (!Array.isArray(values) || values.length === 0) return values;
  return [...values.slice(1), values[0]];
}

function buildMicroPlaceView(world, location) {
  const microLocation = getCurrentMicroLocation(world);
  const profile = location.profile ?? buildLocationProfile(location, world);
  if (!microLocation) {
    return {
      id: `${location.id}:none`,
      name: location.name,
      kind: location.kind,
      purpose: profile.purpose ?? null,
      access: profile.access ?? null,
      hazards: profile.hazards ?? [],
      ownership: profile.ownership ?? null,
      visibleObjects: [],
      containers: [],
      doors: uniqueLabels(location.exits.map((exit) => exit.label), 8).map((label, index) => ({ id: `${location.id}:fallback-door:${index}`, label })),
      entryPoints: uniqueLabels(location.exits.map((exit) => exit.label), 8).map((label, index) => ({ id: `${location.id}:fallback-entry:${index}`, label })),
      occupants: location.occupants.slice(),
      smells: (profile.sensory?.smells ?? []).slice(0, 3),
      traces: location.recentTraces?.slice(0, 4) ?? [],
      consequences: profile.consequences ?? [],
      currentPeriod: profile.currentPeriod ?? pickCurrentPeriod(profile.periods, world),
      periods: summarizePeriods(profile.periods)
    };
  }

  return {
    id: microLocation.id,
    name: microLocation.name,
    kind: microLocation.kind,
    purpose: profile.purpose ?? null,
    access: profile.access ?? null,
    hazards: profile.hazards ?? [],
    ownership: profile.ownership ?? null,
    visibleObjects: microLocation.visibleObjects?.slice(0, 6) ?? [],
    containers: (microLocation.containers ?? []).slice(0, 4),
    doors: (microLocation.doors ?? []).slice(0, 4),
    entryPoints: (microLocation.entryPoints ?? []).slice(0, 4),
    occupants: microLocation.occupants?.slice(0, 6) ?? [],
    traces: microLocation.traces?.slice(0, 4) ?? [],
    links: microLocation.links?.slice(0, 4) ?? [],
    smells: microLocation.smells?.slice(0, 3) ?? (profile.sensory?.smells ?? []).slice(0, 3),
    consequences: microLocation.consequences?.slice(0, 4) ?? profile.consequences ?? [],
    currentPeriod: microLocation.currentPeriod ?? profile.currentPeriod ?? pickCurrentPeriod(profile.periods, world),
    periods: summarizePeriods(profile.periods)
  };
}

function refreshLocationOccupants(world) {
  const location = getCurrentLocation(world);
  if (!location) return;
  const currentMicroLocationId = resolveCanonicalPosition(world)?.minilocation_id ?? null;
  const occupants = [];
  for (const npc of world.npcs ?? []) {
    if ((npc.locationId ?? npc.homeLocation) !== location.id) continue;
    if (currentMicroLocationId && npc.microLocationId && npc.microLocationId !== currentMicroLocationId) continue;
    occupants.push(npc.name);
  }
  if (occupants.length > 0) {
    location.occupants = occupants;
  }
}

export function parseTravelDirection(text) {
  const match = String(text ?? '').match(/(?:иду|держусь|направляюсь|пойду|еду|двигаюсь)(?:\s+на)?\s+(северо[- ]?восток|юго[- ]?восток|северо[- ]?запад|юго[- ]?запад|север|юг|восток|запад)/iu);
  return match?.[1]?.trim().toLowerCase().replace(/\s+/g, '-') ?? null;
}

function buildTravelConditions(world, targetText = '') {
  const weather = String(world.scene?.weather ?? '').toLowerCase();
  const light = String(world.scene?.light ?? '').toLowerCase();
  const text = String(targetText ?? '').toLowerCase();
  return {
    poor: /дожд|ветер|сыр|холод/.test(weather) || /вечер|утро/.test(light),
    bad: /туман|мокр|гряз/.test(weather) || /ноч|темн/.test(light),
    severe: /метел|шторм|болот/.test(`${weather} ${text}`)
  };
}

export function estimateTravelMinutes(world, targetText, fromLocation = null, toLocation = null, routePlan = null) {
  const microMove = !toLocation && /(?:^|\s)(?:внутри|к углу|к двери?|к краю)(?:\s|$)/i.test(String(targetText ?? ''));
  if (microMove) return Math.max(0, Math.min(5, 3));

  const scale = inferRouteScale(fromLocation, toLocation, targetText);
  const route = {
    id: routePlan?.selected?.id ?? null,
    scale,
    type: scale,
    base_time: routePlan?.selected?.minutes ?? null
  };
  const record = calculateTravelTime(route, world.player ?? {}, buildTravelConditions(world, targetText));
  if (!world.movement) world.movement = {};
  world.movement.lastTravelRecord = record;
  return record.final_time;
}

function inferRouteScale(fromLocation, toLocation, targetText) {
  const text = String(targetText ?? '').toLowerCase();
  if (/регион|край|дальн|несколько дн/i.test(text)) return 'regional';
  if (toLocation?.kind && /берег|лес|тракт|дорог/i.test(String(toLocation.kind))) return 'nearby';
  if (fromLocation?.kind && /двор|изб|дом|город/i.test(String(fromLocation.kind))) return 'local';
  return 'local';
}

export function buildLocationProfile(location, world) {
  const kind = String(location?.kind ?? 'место').toLowerCase();
  const canonicalProfile = location?.profile && typeof location.profile === 'object' ? location.profile : {};
  const hasCanonicalSemantics = Boolean(
    canonicalProfile.purpose
    || canonicalProfile.access
    || canonicalProfile.ownership
    || (Array.isArray(canonicalProfile.owners) && canonicalProfile.owners.length > 0)
    || canonicalProfile.materialScene
  );

  if (!allowsProceduralSemantics(world) && !hasCanonicalSemantics) {
    queueSemanticPending(world, 'location_profile', {
      kind: 'location_profile',
      location_id: location?.id ?? null,
      missing_fields: ['purpose', 'access', 'owners', 'material_scene', 'hazards']
    });
    return {
      version: 1,
      pending_semantic_materialization: true,
      purpose: null,
      owners: [],
      users: [],
      routes: { habitual: [], entryPoints: [], closed: [] },
      access: null,
      accessRules: [],
      connections: [],
      hazards: [],
      ownership: null,
      mood: null,
      rhythm: null,
      materialScene: null,
      memory: null,
      traces: [],
      sensory: canonicalProfile.sensory ?? null,
      consequences: [],
      currentPeriod: null,
      periods: Array.isArray(canonicalProfile.periods) ? canonicalProfile.periods.slice() : [],
      usage: null,
      maintenance: null,
      depthLayers: []
    };
  }

  const exits = Array.isArray(location?.exits) ? location.exits : [];
  const occupants = Array.isArray(location?.occupants) ? location.occupants : [];
  const landmarks = Array.isArray(location?.landmarks) ? location.landmarks : [];
  const routeLabels = exits.map((exit) => exit.label).filter(Boolean);
  const procedural = allowsProceduralSemantics(world);

  if (!procedural) {
    const missingFields = [];
    const pick = (key, value) => {
      if (value === undefined || value === null || value === '') missingFields.push(key);
      return value ?? null;
    };
    const profile = {
      version: 1,
      purpose: pick('purpose', canonicalProfile.purpose),
      owners: Array.isArray(canonicalProfile.owners) ? canonicalProfile.owners.slice() : (canonicalProfile.ownership ? normalizeOwners(canonicalProfile.ownership) : []),
      users: Array.isArray(canonicalProfile.users) ? canonicalProfile.users.slice() : [],
      routes: {
        habitual: Array.isArray(canonicalProfile.routes?.habitual) ? canonicalProfile.routes.habitual.slice() : routeLabels.slice(0, 4),
        entryPoints: Array.isArray(canonicalProfile.routes?.entryPoints) ? canonicalProfile.routes.entryPoints.slice() : routeLabels.slice(0, 4),
        closed: Array.isArray(canonicalProfile.routes?.closed) ? canonicalProfile.routes.closed.slice() : []
      },
      access: pick('access', canonicalProfile.access),
      accessRules: Array.isArray(canonicalProfile.accessRules) ? canonicalProfile.accessRules.slice() : [],
      connections: Array.isArray(canonicalProfile.connections) ? canonicalProfile.connections.slice() : [],
      hazards: Array.isArray(canonicalProfile.hazards) ? canonicalProfile.hazards.slice() : [],
      ownership: pick('ownership', canonicalProfile.ownership),
      mood: canonicalProfile.mood ?? null,
      rhythm: pick('rhythm', canonicalProfile.rhythm),
      materialScene: pick('materialScene', canonicalProfile.materialScene),
      memory: canonicalProfile.memory ?? null,
      traces: Array.isArray(canonicalProfile.traces) ? canonicalProfile.traces.slice() : [],
      sensory: canonicalProfile.sensory ?? null,
      consequences: Array.isArray(canonicalProfile.consequences) ? canonicalProfile.consequences.slice() : [],
      currentPeriod: canonicalProfile.currentPeriod ?? null,
      periods: Array.isArray(canonicalProfile.periods) ? canonicalProfile.periods.slice() : [],
      usage: canonicalProfile.usage ?? null,
      maintenance: canonicalProfile.maintenance ?? null,
      depthLayers: Array.isArray(canonicalProfile.depthLayers) ? canonicalProfile.depthLayers.slice() : []
    };
    profile.pending_semantic_materialization = missingFields.length > 0;
    if (missingFields.length) {
      queueSemanticPending(world, 'location_profile', {
        kind: 'location_profile',
        location_id: location?.id ?? null,
        missing_fields: missingFields
      });
    }
    return profile;
  }

  const owner = canonicalProfile.ownership ?? inferOwner(location, occupants);
  const purpose = canonicalProfile.purpose ?? inferPurpose(kind, location?.name, routeLabels, owner);
  const users = inferUsers(kind, occupants, owner);
  const access = canonicalProfile.access ?? inferAccess(kind, occupants, world?.clock?.hour ?? 0, owner);
  const accessRules = Array.isArray(canonicalProfile.accessRules) ? canonicalProfile.accessRules.slice() : inferAccessRules(kind, owner, access, routeLabels);
  const connections = Array.isArray(canonicalProfile.connections) ? canonicalProfile.connections.slice() : inferConnections(kind, location, routeLabels);
  const hazards = Array.isArray(canonicalProfile.hazards) ? canonicalProfile.hazards.slice() : inferHazards(kind, world, landmarks, routeLabels);
  const consequences = Array.isArray(canonicalProfile.consequences) ? canonicalProfile.consequences.slice() : inferConsequences(kind, hazards, access, owner);
  const rhythm = canonicalProfile.rhythm ?? inferRhythm(kind, world, location, occupants);
  const materialScene = canonicalProfile.materialScene ?? inferMaterialScene(kind, world, location, landmarks, owner);
  const memory = canonicalProfile.memory ?? inferLocationMemory(kind, location, world);
  const mood = inferLocationMood(world, location, {
    purpose,
    users,
    routes: {
      habitual: routeLabels.slice(0, 4),
      entryPoints: routeLabels.slice(0, 4),
      closed: inferClosedAreas(kind, location)
    },
    access,
    hazards,
    ownership: owner,
    traces: Array.isArray(canonicalProfile.traces) ? canonicalProfile.traces.slice() : inferTraces(kind, location),
    sensory: canonicalProfile.sensory ?? inferSensory(kind, world, location),
    consequences
  });
  const periods = Array.isArray(canonicalProfile.periods) ? canonicalProfile.periods.slice() : inferPeriods(location, world, {
    purpose,
    access,
    hazards,
    ownership: owner
  });

  return {
    version: 1,
    purpose,
    owners: normalizeOwners(owner),
    users,
    routes: {
      habitual: routeLabels.slice(0, 4),
      entryPoints: routeLabels.slice(0, 4),
      closed: inferClosedAreas(kind, location)
    },
    access,
    accessRules,
    connections,
    hazards,
    ownership: owner,
    mood,
    rhythm,
    materialScene,
    memory,
    traces: Array.isArray(canonicalProfile.traces) ? canonicalProfile.traces.slice() : inferTraces(kind, location),
    sensory: canonicalProfile.sensory ?? inferSensory(kind, world, location),
    consequences,
    currentPeriod: pickCurrentPeriod(periods, world),
    periods,
    usage: inferUsage(kind, occupants),
    maintenance: inferMaintenance(kind, occupants, world),
    depthLayers: inferDepthLayers(location, routeLabels)
  };
}

function mergeLocationProfile(current, next, world = null) {
  if (!current || typeof current !== 'object') return next;
  if (!next || typeof next !== 'object') return current;
  current.version = next.version ?? current.version ?? 1;
  current.purpose = current.purpose ?? next.purpose;
  current.users = mergeUnique(current.users, next.users);
  current.routes = {
    habitual: mergeUnique(current.routes?.habitual, next.routes?.habitual),
    entryPoints: mergeUnique(current.routes?.entryPoints, next.routes?.entryPoints),
    closed: mergeUnique(current.routes?.closed, next.routes?.closed)
  };
  current.access = next.access ?? current.access;
  current.accessRules = mergeUnique(current.accessRules, next.accessRules);
  current.connections = mergeUnique(current.connections, next.connections);
  current.hazards = mergeUnique(current.hazards, next.hazards);
  current.ownership = current.ownership ?? next.ownership;
  current.mood = next.mood ?? current.mood;
  current.rhythm = next.rhythm ?? current.rhythm;
  current.materialScene = current.materialScene ?? next.materialScene;
  current.memory = current.memory ?? next.memory;
  current.traces = mergeUnique(current.traces, next.traces);
  current.sensory = {
    sounds: mergeUnique(current.sensory?.sounds, next.sensory?.sounds),
    smells: mergeUnique(current.sensory?.smells, next.sensory?.smells),
    light: next.sensory?.light ?? current.sensory?.light
  };
  current.consequences = mergeUnique(current.consequences, next.consequences);
  current.periods = mergePeriods(current.periods, next.periods);
  current.currentPeriod = next.currentPeriod ?? current.currentPeriod ?? pickCurrentPeriod(current.periods, world);
  current.usage = current.usage ?? next.usage;
  current.maintenance = current.maintenance ?? next.maintenance;
  current.depthLayers = current.depthLayers ?? next.depthLayers;
  return current;
}

function summarizeLocationProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    purpose: profile.purpose ?? null,
    users: Array.isArray(profile.users) ? profile.users.slice(0, 4) : [],
    routes: {
      habitual: Array.isArray(profile.routes?.habitual) ? profile.routes.habitual.slice(0, 4) : [],
      entryPoints: Array.isArray(profile.routes?.entryPoints) ? profile.routes.entryPoints.slice(0, 4) : []
    },
    access: profile.access ?? null,
    accessRules: Array.isArray(profile.accessRules) ? profile.accessRules.slice(0, 6) : [],
    connections: Array.isArray(profile.connections) ? profile.connections.slice(0, 6) : [],
    hazards: Array.isArray(profile.hazards) ? profile.hazards.slice(0, 4) : [],
    ownership: profile.ownership ?? null,
    mood: profile.mood ?? null,
    rhythm: profile.rhythm ?? null,
    materialScene: profile.materialScene ?? null,
    memory: profile.memory ?? null,
    traces: Array.isArray(profile.traces) ? profile.traces.slice(0, 4) : [],
    sensory: {
      sounds: Array.isArray(profile.sensory?.sounds) ? profile.sensory.sounds.slice(0, 3) : [],
      smells: Array.isArray(profile.sensory?.smells) ? profile.sensory.smells.slice(0, 3) : [],
      light: profile.sensory?.light ?? null
    },
    consequences: Array.isArray(profile.consequences) ? profile.consequences.slice(0, 4) : [],
    currentPeriod: profile.currentPeriod ?? null,
    periods: summarizePeriods(profile.periods)
  };
}

function inferPurpose(kind, name, routes, owner) {
  if (/рын|торг|ярмарк/i.test(`${kind} ${name}`)) return 'обмен, проверка меры и сбор людей';
  if (/мост|брод|переправ/i.test(`${kind} ${name}`)) return 'проход, контроль потока и сбор риска';
  if (/двор|изб|дом|усад/i.test(`${kind} ${name}`)) return 'жильё, труд, хранение и контроль двора';
  if (/склад|амбар|клад/i.test(`${kind} ${name}`)) return 'хранение, учёт и защита имущества';
  if (/тракт|дорог|путь/i.test(`${kind} ${name}`)) return 'переход, остановка и направление движения';
  if (routes.length > 0 && owner) return `место ${owner.name ?? owner} для ${routes[0]}`;
  return 'повседневная жизнь, проход и работа';
}

function inferAccessRules(kind, owner, access, routes) {
  const rules = [];
  if (owner) rules.push(`распоряжается ${formatOwner(owner)}`);
  if (/закрыто|под надзором/.test(access)) rules.push('вход через разрешение, риск или надзор');
  if (/двор|изб|дом/.test(kind)) rules.push('чужак не распоряжается без приглашения');
  if (/мост|брод|переправ/.test(kind)) rules.push('доступ зависит от воды, стражи и времени');
  if (/рын|торг/.test(kind)) rules.push('торг идёт по местному порядку и мере');
  if (routes.length > 1) rules.push('переходы известны не всем сразу');
  return [...new Set(rules)].slice(0, 6);
}

function inferConnections(kind, location, routes) {
  const connections = [];
  const exits = Array.isArray(location?.exits) ? location.exits : [];
  for (const exit of exits.slice(0, 4)) {
    connections.push(`${exit.label} -> ${exit.to ?? 'неизвестно'}`);
  }
  for (const route of routes.slice(0, 3)) {
    connections.push(`дорога: ${route}`);
  }
  if (/двор|изб|дом/.test(kind)) connections.push('соседи и двор');
  if (/рын|торг/.test(kind)) connections.push('поток покупателей и поставщиков');
  if (/мост|брод|переправ/.test(kind)) connections.push('берега и переправа');
  return [...new Set(connections)].slice(0, 8);
}

function inferRhythm(kind, world, location, occupants) {
  const hour = world?.clock?.hour ?? 0;
  const recent = Array.isArray(location?.recentTraces) ? location.recentTraces : [];
  const hasNight = hour < 6 || hour >= 20;
  if (/рын|торг/.test(kind)) {
    if (hasNight) return 'ночью замирает, днём торгует, к празднику шумит';
    return 'утром открывается, днём шумит, к вечеру редеет';
  }
  if (/мост|брод|переправ/.test(kind)) {
    return hasNight ? 'ночью контролируется и пустеет' : 'днём пропускает поток и следит за движением';
  }
  if (/двор|изб|дом/.test(kind)) {
    if (recent.some((item) => /праздн|гости|пир/i.test(item?.text ?? String(item)))) return 'держится в праздничном или тревожном порядке';
    return hasNight ? 'ночью смолкает, днём работает' : 'утром оживает, днём трудится, ночью сжимается';
  }
  if (/склад|амбар/.test(kind)) return 'открывается по делу, остальное время хранит тишину';
  if (/монаст|церк|часов/.test(kind)) return 'живёт по молитве, службе и распорядку часов';
  return occupants.length > 0 ? 'живёт по обычному людскому порядку' : 'живёт рывками и по случаю';
}

function inferMaterialScene(kind, world, location, landmarks, owner) {
  const traces = inferTraces(kind, location);
  const sensory = inferSensory(kind, world, location);
  const notes = [
    `вещи стоят на своих местах: ${landmarks.slice(0, 3).join(', ') || 'немного заметных вещей'}`,
    `следы работы: ${traces.slice(0, 2).join(', ')}`,
    `запахи: ${sensory.smells.join(', ') || 'неясные'}`,
    owner ? `хозяин/распорядитель: ${formatOwner(owner)}` : 'хозяин не назван'
  ];
  if (/гряз|мокр|наледь/.test(`${landmarks.join(' ')} ${traces.join(' ')}`)) notes.push('видны грязь, сырость или следы погоды');
  if (/кров|сожж|разграб|слом/.test(traces.join(' '))) notes.push('следы насилия или поломки заметны сразу');
  if (/бедн|пуст|скуд/.test(`${kind} ${landmarks.join(' ')}`)) notes.push('ощущается бедность или запустение');
  return notes.join('; ');
}

function inferLocationMemory(kind, location, world) {
  const recent = Array.isArray(location?.recentTraces) ? location.recentTraces.slice(0, 4).map((item) => item.text ?? String(item)) : [];
  const rumors = Array.isArray(world?.memory?.heardRumors) ? world.memory.heardRumors.slice(0, 3) : [];
  const notes = [];
  if (recent.length > 0) notes.push(`недавние события: ${recent.join(' / ')}`);
  if (rumors.length > 0) notes.push(`слухи, уже приставшие к месту: ${rumors.join(' / ')}`);
  if (/двор|изб|дом/.test(kind)) notes.push('помнит людей, которые приходили и уходили');
  if (/мост|брод|переправ/.test(kind)) notes.push('помнит, кто и когда переходил');
  if (/рын|торг/.test(kind)) notes.push('помнит торг, долг и чужой взгляд');
  return notes.length > 0 ? notes.join('; ') : 'память места пока мала';
}

function normalizeOwners(owner) {
  if (!owner) return [];
  if (Array.isArray(owner)) return owner.slice(0, 4).map((item) => String(item));
  return [formatOwner(owner)];
}

function formatOwner(owner) {
  if (!owner) return 'неизвестно';
  if (typeof owner === 'string') return owner;
  return owner.name ?? owner.label ?? 'неизвестно';
}

function inferUsers(kind, occupants, owner) {
  const base = occupants.slice(0, 4);
  if (owner?.name && !base.includes(owner.name)) base.unshift(owner.name);
  if (/рын|торг/.test(kind)) base.push('покупатели', 'приказчики');
  if (/двор|изб|дом/.test(kind)) base.push('семья', 'помощники');
  if (/склад|амбар/.test(kind)) base.push('сторожа', 'работники');
  return [...new Set(base.map(String).filter(Boolean))].slice(0, 6);
}

function inferAccess(kind, occupants, hour, owner) {
  const isNight = hour < 6 || hour >= 20;
  if (/склад|амбар|клад/.test(kind)) {
    return isNight ? 'закрыто и под надзором' : 'по разрешению и через сторожа';
  }
  if (/двор|изб|дом/.test(kind)) {
    return owner ? 'по приглашению или по праву двора' : 'по допуску хозяев';
  }
  if (/мост|брод|переправ/.test(kind)) {
    return 'доступ ограничен потоком, погодой и надзором';
  }
  if (/рын|торг/.test(kind)) {
    return isNight ? 'закрыто' : 'открыто при торговом порядке';
  }
  return occupants.length > 0 ? 'доступ зависит от хозяев и времени' : 'открыто, но без гарантии';
}

function inferHazards(kind, world, landmarks, routes) {
  const hazards = [];
  if (/мост|переправ|брод/.test(kind)) hazards.push('скользкая поверхность', 'контроль переправы');
  if (/лес/.test(kind)) hazards.push('потеряться', 'нечужой след');
  if (/рын|торг/.test(kind)) hazards.push('карманники', 'ссоры из-за цены');
  if (/двор|изб/.test(kind)) hazards.push('чужой взгляд', 'собственник заметит лишнее');
  if (/склад|амбар/.test(kind)) hazards.push('сторож', 'учёт пропаж');
  if (landmarks.some((item) => /наледь|гряз|мокр|снег/i.test(item))) hazards.push('погода делает путь труднее');
  if (routes.length > 2) hazards.push('лишние переходы увеличивают шанс замеченных действий');
  return [...new Set(hazards)].slice(0, 6);
}

function inferConsequences(kind, hazards, access, owner) {
  const consequences = [];
  if (access.includes('закрыто')) consequences.push('попытка входа может вызвать окрик или отказ');
  if (owner) consequences.push('вещи и следы могут быть признаны чьей-то собственностью');
  if (hazards.includes('сторож')) consequences.push('любое пренебрежение заметят');
  if (hazards.includes('карманники')) consequences.push('ошибка может стоить кошелька');
  if (kind.includes('мост') || kind.includes('переправ')) consequences.push('задержка становится видимой всем');
  return [...new Set(consequences)].slice(0, 5);
}

function inferClosedAreas(kind, location) {
  const exits = Array.isArray(location?.exits) ? location.exits : [];
  if (exits.length <= 1) return ['закрытые зоны неясны'];
  return exits.slice(1).map((exit) => `за ${exit.label} пока не видно`);
}

function inferTraces(kind, location) {
  const traces = Array.isArray(location?.recentTraces) ? location.recentTraces : [];
  if (traces.length > 0) return traces.slice(0, 4).map((trace) => trace.text ?? String(trace));
  if (/двор|изб|дом/.test(kind)) return ['следы ног у входа', 'дым', 'бытовое движение'];
  if (/рын|торг/.test(kind)) return ['монетная пыль', 'разлитая влага', 'следы телег'];
  return ['следы жизни заметны, но не все объяснены'];
}

function inferSensory(kind, world, location) {
  const sounds = Array.isArray(location?.sounds) ? location.sounds.slice(0, 4) : [];
  const smells = [];
  if (/двор|изб|дом/.test(kind)) smells.push('дым', 'еда', 'сырость');
  if (/рын|торг/.test(kind)) smells.push('пыль', 'сырой товар', 'люди и животные');
  if (/лес/.test(kind)) smells.push('сырость', 'хвоя', 'земля');
  if (/мост|переправ/.test(kind)) smells.push('вода', 'мокрое дерево');
  return {
    sounds: sounds.length > 0 ? sounds : [world.scene?.sounds?.[0] ?? 'приглушённый шум'],
    smells,
    light: location?.light ?? world.scene?.light ?? 'неизвестно'
  };
}

function inferUsage(kind, occupants) {
  if (/рын|торг/.test(kind)) return 'торг и обмен';
  if (/мост|переправ/.test(kind)) return 'переход и контроль';
  if (/двор|изб|дом/.test(kind)) return 'жильё и работа';
  if (/склад|амбар/.test(kind)) return 'хранение';
  return occupants.length > 0 ? 'повседневная жизнь' : 'ожидание и проход';
}

function inferMaintenance(kind, occupants, world) {
  if (/склад|амбар|мост/.test(kind)) return 'нуждается в надзоре и ремонте';
  if (occupants.length > 0) return `поддерживается людьми, которые здесь живут или работают`;
  return `содержится в порядке, пока хватает людей и света ${world.scene?.light ?? ''}`.trim();
}

function inferLocationMood(world, location, profile = {}) {
  if (typeof profile.mood === 'string' && profile.mood.trim()) return profile.mood.trim();
  if (!allowsProceduralSemantics(world)) {
    queueSemanticPending(world, 'location_mood', { locationId: location?.id ?? null });
    return location?.profile?.mood ?? null;
  }
  const kind = String(location?.kind ?? '').toLowerCase();
  const traces = Array.isArray(location?.recentTraces) ? location.recentTraces : [];
  const attention = String(world?.scene?.attention ?? location?.attention ?? '').toLowerCase();
  const weather = String(world?.scene?.weather ?? location?.weather ?? '').toLowerCase();
  const light = String(world?.scene?.light ?? location?.light ?? '').toLowerCase();
  const suspicion = Number(world?.social?.suspicion ?? 0);
  const witnesses = Array.isArray(world?.social?.recentWitnesses) ? world.social.recentWitnesses.length : 0;
  const fear = getActiveStateValue(world?.player, 'fear') ?? 0;
  const satiety = readPlayerSatiety(world?.player);
  const thirst = getActiveStateValue(world?.player, 'thirst') ?? 0;
  const vigor = readPlayerVigor(world?.player);
  const occupantCount = Array.isArray(location?.occupants) ? location.occupants.length : 0;
  const busySigns = (profile.usage ?? '').toLowerCase();
  const recentNoise = traces.some((trace) => /крик|ссор|погон|удар|кров|шум/i.test(trace?.text ?? String(trace)));
  const recentLoss = traces.some((trace) => /пропал|украл|сгор|разграб|разбил/i.test(trace?.text ?? String(trace)));
  const feastSigns = traces.some((trace) => /праздн|пир|ярмарк|торг/i.test(trace?.text ?? String(trace)));

  if (recentLoss || /разграб|сожжен|пуст/i.test(`${kind} ${busySigns}`)) return 'разорённое';
  if (feastSigns || /ярмарк|торг/.test(kind) && occupantCount > 2) return 'праздничное и людное';
  if (recentNoise || suspicion > 7 || witnesses > 2 || attention === 'высокое') return 'напряжённое и настороженное';
  if (fear > 60 || /ноч|темно/.test(light) && occupantCount > 0) return 'тихое, но настороженное';
  if (satiety < 35 || /бедн|дефицит|пуст/.test(`${kind} ${profile.consequences?.join(' ') ?? ''}`)) return 'голодное и экономное';
  if (thirst > 65 || /суш|жажд|вода/.test(`${kind} ${profile.sensory?.smells?.join(' ') ?? ''}`)) return 'изнурённое и сухое';
  if (vigor < 35 || /сон|вечер|ноч/.test(`${kind} ${light}`)) return 'сонное';
  if (occupantCount === 0 && /двор|дом|изб|усад/.test(kind)) return 'пустое и гулкое';
  if (/рын|торг/.test(kind) || /торг/.test(profile.usage ?? '')) return occupantCount > 0 ? 'деловитое' : 'притихшее';
  if (/мост|переправ|брод|дорог|тракт/.test(kind)) return 'пристальное и дорожное';
  if (/монаст|церк|часов/.test(kind)) return 'сдержанное и молитвенное';
  if (busySigns.includes('жильё') || busySigns.includes('работа')) return 'рабочее и привычное';
  if (attention === 'низкое' && occupantCount > 0) return 'спокойное';
  return 'настороженное';
}

function inferSceneMood(world, location, profile = {}) {
  if (!allowsProceduralSemantics(world)) {
    return profile.sceneMood ?? location?.profile?.sceneMood ?? null;
  }
  const mood = inferLocationMood(world, location, profile);
  if (/разорённое/.test(mood)) return 'место держится в разорённой тишине';
  if (/праздничное/.test(mood)) return 'место шумит и держится празднично';
  if (/напряжённое/.test(mood)) return 'в месте заметна напряжённая настороженность';
  if (/сонное/.test(mood)) return 'в месте сонно и медленно';
  if (/деловитое/.test(mood)) return 'в месте деловой ход';
  if (/голодное/.test(mood)) return 'в месте чувствуется нужда и экономия';
  if (/пустое/.test(mood)) return 'в месте гулко и пусто';
  if (/пристальное/.test(mood)) return 'в месте всё смотрят и проверяют';
  if (/молитвенное/.test(mood)) return 'в месте держится тихая собранность';
  if (/рабочее/.test(mood)) return 'в месте обычная рабочая устойчивость';
  return 'в месте настороженное спокойствие';
}

function refreshNpcMood(world) {
  if (!allowsProceduralSemantics(world)) return;
  for (const npc of world.npcs ?? []) {
    npc.mood = deriveNpcMood(world, npc);
  }
}

function deriveNpcMood(world, npc) {
  const currentLocation = getCurrentLocation(world);
  const currentLocationId = currentLocation?.id ?? null;
  const npcLocation = world.locations?.[npc.locationId ?? npc.homeLocation] ?? currentLocation;
  const locationProfile = npcLocation?.profile ?? currentLocation?.profile ?? null;
  const locationMood = locationProfile?.mood ?? inferLocationMood(world, npcLocation ?? currentLocation, locationProfile ?? {});
  const memory = Array.isArray(npc.socialMemory) ? npc.socialMemory.slice(0, 4) : [];
  const memoryText = memory.map((item) => String(item?.perception ?? '')).join(' ').toLowerCase();
  const fears = Array.isArray(npc.fears) ? npc.fears.join(' ').toLowerCase() : '';
  const satiety = readPlayerSatiety(world?.player);
  const thirst = getActiveStateValue(world?.player, 'thirst') ?? 0;
  const vigor = readPlayerVigor(world?.player);
  const fear = getActiveStateValue(world?.player, 'fear') ?? 0;
  const bleeding = Number(npc.bleeding ?? 0);
  const injuries = Array.isArray(npc.injuries) ? npc.injuries.length : 0;
  const trust = Number(npc.attitudeToPlayer?.trust ?? 0);
  const hostility = Number(npc.attitudeToPlayer?.hostility ?? 0);
  const suspicion = Number(world?.social?.suspicion ?? 0);
  const rumors = Array.isArray(world?.memory?.heardRumors) ? world.memory.heardRumors.slice(0, 3).join(' ').toLowerCase() : '';

  const states = [];
  if (bleeding > 0 || injuries > 0) states.push('ранен');
  if (vigor < 45 || /устал|изнур|сон/.test(locationMood) || /устал/.test(String(npc.mood ?? '').toLowerCase())) states.push('устал');
  if (satiety < 35 || /голод|нужда/.test(locationMood)) states.push('голоден');
  if (thirst > 65 || /сух/.test(locationMood)) states.push('жаждет');
  if (fear > 45 || suspicion > 7 || /напряж|насторож|пристал/.test(locationMood) || /страх|опас|кров|крик/.test(memoryText + ' ' + rumors)) states.push('насторожен');
  if (hostility > 2 || /спор|ссор|насили|краж|угроза/.test(memoryText)) states.push('раздражён');
  if (trust > 2 && /спокой|рабоч|делов|привыч/.test(locationMood)) states.push('доверчив');
  if (bleeding > 0 || injuries > 0) states.push('болит');
  if (npc.status && /старш|хозяин|сторож|чин/i.test(npc.status)) states.push('бдителен');
  if (Array.isArray(npc.family) && npc.family.length > 0 && /родн|сем|дом/.test(locationMood)) states.push('поддержан роднёй');
  if (states.length === 0) {
    if (/празднич/.test(locationMood)) states.push('оживлён');
    else if (/деловит/.test(locationMood) || /рабоч/.test(locationMood)) states.push('занят');
    else if (/сонн/.test(locationMood)) states.push('сонлив');
    else states.push('сдержан');
  }

  if (npcLocation?.id && currentLocationId && npcLocation.id !== currentLocationId && !states.includes('в стороне')) {
    states.push('в стороне');
  }

  return uniqWords(states.join(', '));
}

function uniqWords(text) {
  return String(text ?? '')
    .split(/[,/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .join(', ') || 'сдержан';
}

function readPlayerSatiety(player = {}) {
  const satiety = Number(player?.states?.satiety);
  return Number.isFinite(satiety) ? Math.max(0, Math.min(100, satiety)) : 100;
}

function readPlayerVigor(player = {}) {
  const vigor = Number(player?.states?.vigor);
  return Number.isFinite(vigor) ? Math.max(0, Math.min(100, vigor)) : 100;
}

function inferDepthLayers(location, routes) {
  return {
    near: Array.isArray(location?.landmarks) ? location.landmarks.slice(0, 3) : [],
    mid: routes.slice(0, 3),
    far: routes.slice(3, 6)
  };
}

function inferOwner(location, occupants) {
  const kind = String(location?.kind ?? '').toLowerCase();
  if (/рын|торг/.test(kind)) return occupants[0] ?? null;
  if (/двор|изб|дом/.test(kind)) return occupants[0] ?? null;
  if (/склад|амбар/.test(kind)) return occupants[0] ?? null;
  if (/мост|переправ/.test(kind)) return 'общий надзор';
  return occupants[0] ?? null;
}

function inferPeriods(location, world, context) {
  const historical = world?.historical ?? {};
  const calendarStage = {
    id: `historic:${world?.worldId ?? 'world'}:${world?.clock?.day ?? 0}`,
    kind: 'historical_calendar',
    label: `${world?.history?.season ?? 'season'} ${world?.history?.year ?? ''}`.trim(),
    start: {
      day: 1,
      hour: 0
    },
    end: null,
    trigger: 'исторический фон мира',
    changes: [
      `Регион живёт под давлением: ${(world?.history?.macroForces ?? []).slice(0, 3).join('; ') || 'фон без уточнения'}.`,
      `Влияние на дорогу: ${(historical.roadRisks ?? []).slice(0, 3).join('; ') || 'без явного риска'}.`
    ],
    consequences: [
      'Меняется безопасность, движение людей и цена ошибок.',
      'Власть и обычай задают допустимое поведение.'
    ],
    startedBy: 'исторический календарь',
    endedBy: null,
    impact: 'формирует фон и базовые ограничения',
    resolution: 'фон действует, пока не сменится сезон или большая история',
    inheritedFrom: world?.historical?.packId ?? null,
    state: 'active'
  };

  const currentEvent = world?.events?.[0] ?? null;
  const partyStage = {
    id: `party:${location?.id ?? 'unknown'}:${world?.clock?.day ?? 0}:${world?.clock?.hour ?? 0}`,
    kind: 'party_history',
    label: currentEvent?.result?.slice(0, 48) ?? 'Текущая партия',
    start: {
      day: world?.clock?.day ?? 1,
      hour: world?.clock?.hour ?? 0
    },
    end: null,
    trigger: currentEvent?.intent ?? 'текущее состояние партии',
    changes: [
      `Окружение: ${(location?.recentTraces ?? []).slice(0, 3).map((item) => item.text ?? String(item)).join('; ') || 'следов нет'}.`,
      `Социальный след: ${(world?.social?.recentWitnesses ?? []).slice(0, 3).join('; ') || 'свидетели не выделены'}.`
    ],
    consequences: [
      context.purpose ?? 'место продолжает выполнять своё назначение',
      context.access ?? 'доступ определяется обычаями и властью'
    ],
    startedBy: 'локальная партия',
    endedBy: null,
    impact: 'создаёт текущую атмосферу и видимые ограничения',
    resolution: currentEvent ? 'период закреплён текущими событиями партии' : 'период ожидает развития партии',
    inheritedFrom: `historic:${world?.worldId ?? 'world'}:${world?.clock?.day ?? 0}`,
    state: currentEvent ? 'active' : 'stable'
  };

  const periods = [calendarStage, partyStage];
  const extra = inferEventPeriods(world, location, context);
  return periods.concat(extra);
}

function inferEventPeriods(world, location, context) {
  const periods = [];
  const recentNotes = Array.isArray(world?.memory?.sceneNotes) ? world.memory.sceneNotes.slice(0, 3) : [];
  if (recentNotes.length > 0) {
    periods.push({
      id: `local:${location?.id ?? 'unknown'}:memory`,
      kind: 'local_period',
      label: 'Память партии',
      start: {
        day: recentNotes[recentNotes.length - 1]?.day ?? world?.clock?.day ?? 1,
        hour: recentNotes[recentNotes.length - 1]?.hour ?? world?.clock?.hour ?? 0
      },
      end: null,
      trigger: 'накопленные события партии',
      changes: recentNotes.map((note) => `День ${note.day} ${String(note.hour).padStart(2, '0')}: ${note.weather}; ${note.attention}.`),
      consequences: [
        'Следы и слухи могут закрепиться или исчезнуть.',
        'Локация сохраняет память о прошедших действиях.'
      ],
      startedBy: 'память партии',
      endedBy: null,
      impact: 'делает следы и слухи устойчивыми',
      resolution: 'затухает, если следы не подтверждаются новыми событиями',
      inheritedFrom: `party:${location?.id ?? 'unknown'}:${world?.clock?.day ?? 0}:${world?.clock?.hour ?? 0}`,
      state: 'accumulating'
    });
  }

  if (Array.isArray(location?.recentTraces) && location.recentTraces.length > 0) {
    periods.push({
      id: `local:${location?.id ?? 'unknown'}:traces`,
      kind: 'local_period',
      label: 'Свежие следы места',
      start: {
        day: world?.clock?.day ?? 1,
        hour: world?.clock?.hour ?? 0
      },
      end: null,
      trigger: 'недавние следы на месте',
      changes: location.recentTraces.slice(0, 4).map((trace) => trace.text ?? String(trace)),
      consequences: [
        context.hazards[0] ?? 'опасность может быть вызвана следами',
        'Короткая память места влияет на следующий вход.'
      ],
      startedBy: 'свежие следы',
      endedBy: null,
      impact: 'меняет риск и ощущение присутствия',
      resolution: 'исчезает по мере истечения времени или новых следов',
      inheritedFrom: `party:${location?.id ?? 'unknown'}:${world?.clock?.day ?? 0}:${world?.clock?.hour ?? 0}`,
      state: 'recent'
    });
  }

  return periods;
}

function summarizePeriods(periods) {
  if (!Array.isArray(periods)) return [];
  return periods.slice(0, 6).map((period) => ({
    id: period.id ?? null,
    kind: period.kind ?? null,
    label: period.label ?? null,
    start: period.start ?? null,
    end: period.end ?? null,
    trigger: period.trigger ?? null,
    state: period.state ?? null,
    startedBy: period.startedBy ?? null,
    endedBy: period.endedBy ?? null,
    impact: period.impact ?? null,
    resolution: period.resolution ?? null,
    inheritedFrom: period.inheritedFrom ?? null,
    changes: Array.isArray(period.changes) ? period.changes.slice(0, 3) : [],
    consequences: Array.isArray(period.consequences) ? period.consequences.slice(0, 3) : []
  }));
}

function mergePeriods(base, extra) {
  const list = [];
  for (const item of [...(Array.isArray(base) ? base : []), ...(Array.isArray(extra) ? extra : [])]) {
    if (!item || typeof item !== 'object') continue;
    const key = item.id ?? `${item.kind ?? 'period'}:${item.label ?? ''}:${item.trigger ?? ''}`;
    const existing = list.find((period) => period.__key === key);
    const normalized = {
      ...item,
      __key: key
    };
    if (existing) {
      existing.changes = mergeUnique(existing.changes, normalized.changes);
      existing.consequences = mergeUnique(existing.consequences, normalized.consequences);
      existing.state = existing.state ?? normalized.state;
      existing.end = existing.end ?? normalized.end;
      existing.start = existing.start ?? normalized.start;
      existing.label = existing.label ?? normalized.label;
      existing.trigger = existing.trigger ?? normalized.trigger;
      existing.startedBy = existing.startedBy ?? normalized.startedBy;
      existing.endedBy = existing.endedBy ?? normalized.endedBy;
      existing.impact = existing.impact ?? normalized.impact;
      existing.resolution = existing.resolution ?? normalized.resolution;
      existing.inheritedFrom = existing.inheritedFrom ?? normalized.inheritedFrom;
      continue;
    }
    list.push(normalized);
  }
  return list.map(({ __key, ...period }) => period);
}

function mergePeriodEntry(base, next) {
  return {
    ...base,
    ...next,
    changes: mergeUnique(base.changes, next.changes),
    consequences: mergeUnique(base.consequences, next.consequences)
  };
}

function pickCurrentPeriod(periods, world) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const active = periods.find((period) => period.state === 'active' || period.state === 'recent' || period.state === 'accumulating');
  if (active) return active;
  const currentDay = world?.clock?.day ?? null;
  return periods.find((period) => period.start?.day === currentDay) ?? periods[0];
}

function normalizePeriod(period, world, location, kindFallback = 'local_period') {
  const now = {
    day: world?.clock?.day ?? 1,
    hour: world?.clock?.hour ?? 0,
    minute: world?.clock?.minute ?? 0
  };
  const sequence = Array.isArray(location.profile?.periods) ? location.profile.periods.length : 0;
  return {
    id: period.id ?? `${location.id}:period:${kindFallback}:${now.day}:${now.hour}:${now.minute}:${sequence}`,
    kind: period.kind ?? kindFallback,
    label: period.label ?? 'Период места',
    start: period.start ?? now,
    end: period.end ?? null,
    trigger: period.trigger ?? 'локальное событие',
    changes: Array.isArray(period.changes) ? period.changes.slice(0, 6) : [],
    consequences: Array.isArray(period.consequences) ? period.consequences.slice(0, 6) : [],
    state: period.state ?? 'active',
    startedBy: period.startedBy ?? null,
    endedBy: period.endedBy ?? null,
    impact: period.impact ?? null,
    resolution: period.resolution ?? null,
    inheritedFrom: period.inheritedFrom ?? null
  };
}

function mergeUnique(base, extra) {
  const list = [];
  for (const value of [...(Array.isArray(base) ? base : []), ...(Array.isArray(extra) ? extra : [])]) {
    const text = String(value ?? '').trim();
    if (!text || list.includes(text)) continue;
    list.push(text);
  }
  return list;
}
