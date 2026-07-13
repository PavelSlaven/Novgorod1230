import { ageLocations, applyLocationPressure, getCurrentLocation, syncCurrentPlace } from './location.js';
import { advanceRoutines } from './routines.js';
import { recordWorldEvent, ensureWorldLogs } from './event-log.js';
import { buildCurrentPosition, getActiveStateValue, mirrorBodyStateFields, syncActorStateProfile, upsertActiveState } from './profile-v2.js';
import { processDelayedEvents } from './delayed-events.js';
import { syncHistoricalContext } from './historical-context.js';
import { allowsProceduralSemantics, queueSemanticPending } from './semantic-gate.js';
import { summarizeBattleExertion } from './combat-model.js';

const NEED_BASE_PER_HOUR = 100 / 72;
const NEED_BASE_PER_MINUTE = NEED_BASE_PER_HOUR / 60;
const SATIETY_DAMAGE_NEED = 'starvation';

export function advanceWorld(world, minutes, intent = null) {
  if (!world.memory) world.memory = {};
  if (!Array.isArray(world.memory.sceneNotes)) world.memory.sceneNotes = [];
  if (!Array.isArray(world.memory.heardRumors)) world.memory.heardRumors = [];
  ensureWorldLogs(world);

  const totalMinutes = world.clock.hour * 60 + world.clock.minute + minutes;
  const addedDays = Math.floor(totalMinutes / 1440);
  const remainder = totalMinutes % 1440;
  world.clock.day += addedDays;
  world.clock.hour = Math.floor(remainder / 60);
  world.clock.minute = remainder % 60;
  world.scene.weather = deriveWeather(world);
  world.scene.light = deriveLight(world);
  world.scene.attention = deriveAttention(world);
  syncHistoricalContext(world, {
    recordPhaseTransitions: true,
    schedulePhaseDelayedEvents: true
  });
  applyNeedDrift(world, minutes, intent);
  updateNpcPresence(world);
  applyNpcNeedDrift(world, minutes, intent);
  advanceRoutines(world);
  advanceIndependentWorld(world, minutes);
  world.scene.weather = deriveWeather(world);
  world.scene.light = deriveLight(world);
  world.scene.attention = deriveAttention(world);
  ageLocations(world, minutes);
  applyLocationPressure(world);
  processDelayedEvents(world);
  syncActorStates(world);
  const location = getCurrentLocation(world);
  if (location) {
    location.weather = world.scene.weather;
    location.light = world.scene.light;
    location.attention = world.scene.attention;
  }
  syncCurrentPlace(world);
  const sceneNote = {
    day: world.clock.day,
    hour: world.clock.hour,
    weather: world.scene.weather,
    attention: world.scene.attention
  };
  world.memory.sceneNotes.unshift(sceneNote);
  world.memory.sceneNotes = world.memory.sceneNotes.slice(0, 20);
  recordWorldEvent(world, {
    kind: 'memory',
    source: 'scene',
    visibility: 'public',
    status: 'remembered',
    at: { ...world.clock },
    result: allowsProceduralSemantics(world)
      ? `Сцена: ${world.scene.weather ?? 'погода неизвестна'} · внимание ${world.scene.attention ?? 'неизвестно'}`
      : `Сцена: время ${world.clock.hour}:${String(world.clock.minute).padStart(2, '0')} · внимание ${world.scene.attention ?? 'неизвестно'}`
  });
}

function applyNeedDrift(world, minutes, intent) {
  const isCombatTick = minutes <= 1 && ['attack', 'defend', 'flee'].includes(intent?.type);
  if (isCombatTick) {
    applyBleeding(world, minutes, intent);
    applyShortCombatExertion(world, intent);
    applyEnvironmentalExposure(world.player, world, minutes, intent, getCurrentLocation(world));
    mirrorBodyStateFields(world.player);
    return;
  }

  const activity = resolveNeedActivity(intent);
  const playerStates = ensureCoreStates(world.player);
  const currentThirst = getActiveStateValue(world.player, 'thirst') ?? 0;
  const currentFear = getActiveStateValue(world.player, 'fear') ?? 0;

  const satiety = consumeNeed(world.player, playerStates, 'satiety', minutes, activity.satietyMultiplier);
  consumeNeed(world.player, playerStates, 'vigor', minutes, activity.vigorMultiplier);
  const healthLoss = accumulateNeedDamage(world.player, satiety.shortage);

  if (healthLoss > 0) {
    playerStates.health = clampState((playerStates.health ?? 100) - healthLoss);
  }

  upsertActiveState(world.player, 'thirst', 'жажда', clampState(currentThirst + Math.max(1, Math.floor(minutes / 14))), 'derived');
  applyBleeding(world, minutes, intent);

  if (intent?.type === 'move') {
    upsertActiveState(world.player, 'thirst', 'жажда', clampState((getActiveStateValue(world.player, 'thirst') ?? 0) + Math.max(1, Math.floor(minutes / 25))), 'derived');
  }

  if (intent?.type === 'attack') {
    upsertActiveState(world.player, 'thirst', 'жажда', clampState((getActiveStateValue(world.player, 'thirst') ?? 0) + 2), 'derived');
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear + 8), 'derived');
  }

  if (intent?.type === 'rest') {
    playerStates.vigor = clampState((playerStates.vigor ?? 100) + Math.max(12, Math.floor(minutes / 8)));
    playerStates.health = clampState((playerStates.health ?? 100) + Math.max(1, Math.floor(minutes / 120)));
    upsertActiveState(world.player, 'thirst', 'жажда', clampState((getActiveStateValue(world.player, 'thirst') ?? 0) - Math.max(1, Math.floor(minutes / 18))), 'derived');
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear - 2), 'derived');
  }

  applyEnvironmentalExposure(world.player, world, minutes, intent, getCurrentLocation(world));

  mirrorBodyStateFields(world.player);
}

function applyShortCombatExertion(world, intent) {
  const playerStates = ensureCoreStates(world.player);
  const currentThirst = getActiveStateValue(world.player, 'thirst') ?? 0;
  const currentFear = getActiveStateValue(world.player, 'fear') ?? 0;
  const exertion = summarizeBattleExertion(world, intent, null);
  if (exertion.value > 0) {
    playerStates.vigor = clampState((playerStates.vigor ?? 100) - exertion.value);
  }

  if (intent?.type === 'attack') {
    upsertActiveState(world.player, 'thirst', 'жажда', clampState(currentThirst + 2), 'derived');
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear + 8), 'derived');
  }

  if (intent?.type === 'defend') {
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear + 4), 'derived');
  }

  if (intent?.type === 'flee') {
    upsertActiveState(world.player, 'thirst', 'жажда', clampState(currentThirst + 1), 'derived');
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear + 6), 'derived');
  }

  world.combat_exertion_applied = true;
  mirrorBodyStateFields(world.player);
}

function applyBleeding(world, minutes, intent) {
  const bleeding = world.player.bleeding ?? 0;
  if (bleeding <= 0) return;

  const loss = Math.max(0, Math.floor((bleeding * minutes) / 120));
  const playerStates = ensureCoreStates(world.player);
  if (loss > 0) {
    playerStates.health = clampState((playerStates.health ?? 100) - loss);
    playerStates.vigor = clampState((playerStates.vigor ?? 100) - Math.max(1, Math.floor(loss / 2)));
  }

  if (intent?.type === 'rest') {
    world.player.bleeding = Math.max(0, bleeding - Math.max(1, Math.floor(minutes / 120)));
  }

  mirrorBodyStateFields(world.player);
}

function advanceIndependentWorld(world, minutes) {
  if (!Array.isArray(world.pendingSemanticWorld)) world.pendingSemanticWorld = [];
  world.pendingSemanticWorld.unshift({
    kind: 'independent_tick',
    at: { ...world.clock },
    minutes,
    status: 'pending_llm'
  });
  world.pendingSemanticWorld = world.pendingSemanticWorld.slice(0, 20);
  logWorldEvent(world, 'Независимый ход мира: время прошло; смысловые обновления ждут LLM.');
}

function deriveWeather(world) {
  if (!allowsProceduralSemantics(world)) {
    if (typeof world.scene?.weather === 'string' && world.scene.weather.trim()) {
      return world.scene.weather;
    }
    queueSemanticPending(world, 'weather', {
      hour: world.clock?.hour ?? null,
      season: world.history?.season ?? world.historical?.season ?? null,
      region: world.region?.name ?? world.historicalFrame?.regionName ?? null
    });
    return world.scene?.weather ?? '';
  }
  return deriveWeatherProcedural(world);
}

function deriveWeatherProcedural(world) {
  const hour = world.clock.hour;
  const seasonText = String(world.history?.season ?? world.historical?.season ?? '').toLowerCase();
  const regionText = String(world.region?.name ?? world.historical?.regionHint ?? '').toLowerCase();

  let base;
  if (hour < 6) base = 'холодная тьма и сырой туман';
  else if (hour < 10) base = 'сыро и тихо, с редким ветром';
  else if (hour < 17) base = 'низкое серое небо держит холод';
  else if (hour < 21) base = 'вечерний промозглый воздух';
  else base = 'ночной холод, густой и липкий';

  if (/зим|мороз|снег/u.test(seasonText)) {
    base = `${base}, зимний мороз`;
  } else if (/лет|жар/u.test(seasonText)) {
    base = `${base}, летняя сушь`;
  } else if (/осен|дожд/u.test(seasonText)) {
    base = `${base}, осенняя сырость`;
  } else if (/весн|оттепел/u.test(seasonText)) {
    base = `${base}, весенняя оттепель`;
  }

  if (/лес|деревн|таёг/u.test(regionText)) {
    base = `${base}, лесная сырь`;
  } else if (/степ|равнин/u.test(regionText)) {
    base = `${base}, открытый ветер`;
  } else if (/реч|переправ|болот/u.test(regionText)) {
    base = `${base}, речная влага`;
  }

  return base;
}

function deriveLight(world) {
  const hour = world.clock.hour;
  if (!allowsProceduralSemantics(world)) {
    queueSemanticPending(world, 'light', { hour });
    return typeof world.scene?.light === 'string' && world.scene.light.trim()
      ? world.scene.light
      : `hour:${hour}`;
  }
  if (hour < 6) return 'ночь';
  if (hour < 9) return 'раннее утро';
  if (hour < 17) return 'день';
  if (hour < 20) return 'вечер';
  return 'темнота';
}

function deriveAttention(world) {
  const npcCount = Array.isArray(world.npcs) ? world.npcs.length : 0;
  const vigor = Number(world.player?.states?.vigor);
  const fatigue = Number.isFinite(vigor)
    ? Math.max(0, 100 - vigor)
    : 0;
  const fear = getActiveStateValue(world.player, 'fear') ?? 0;
  const score = fear + fatigue + npcCount;
  if (!allowsProceduralSemantics(world)) {
    queueSemanticPending(world, 'attention', { score, npcCount, fear, fatigue });
    return typeof world.scene?.attention === 'string' && world.scene.attention.trim()
      ? world.scene.attention
      : String(score);
  }
  if (score > 120) return 'высокое';
  if (score > 70) return 'среднее';
  return 'низкое';
}

function updateNpcPresence(world) {
  for (const npc of world.npcs) {
    const block = pickNpcSchedule(world, npc);
    npc.locationId = block.locationId;
    npc.microLocationId = block.microLocationId;
    npc.location = block.activity;
    const nextPosition = buildCurrentPosition(world, {
      location_id: block.locationId ?? null,
      minilocation_id: block.microLocationId ?? null,
      anchor_id: block.anchorId ?? null,
      last_route_id: block.routeId ?? npc.current_position?.last_route_id ?? null
    });
    npc.current_position = nextPosition;
    npc.position = structuredClone(nextPosition);
  }
}

function applyNpcNeedDrift(world, minutes, intent) {
  const activity = resolveNeedActivity(intent);
  const thirstGain = Math.max(1, Math.floor(minutes / 20));
  const fearGain = intent?.type === 'attack' ? 6 : intent?.type === 'claim' ? 2 : 0;

  for (const npc of world.npcs ?? []) {
    const states = ensureCoreStates(npc);
    const currentThirst = getActiveStateValue(npc, 'thirst') ?? 0;
    const currentFear = getActiveStateValue(npc, 'fear') ?? 0;
    const satiety = consumeNeed(npc, states, 'satiety', minutes, activity.satietyMultiplier);
    consumeNeed(npc, states, 'vigor', minutes, activity.vigorMultiplier);
    const healthLoss = accumulateNeedDamage(npc, satiety.shortage);
    if (healthLoss > 0) {
      states.health = clampState((states.health ?? 100) - healthLoss);
    }
    upsertActiveState(npc, 'thirst', 'жажда', clampState(currentThirst + thirstGain), 'derived');
    upsertActiveState(npc, 'fear', 'страх', clampState(currentFear + fearGain), 'derived');

    if (intent?.type === 'rest' && (npc.locationId ?? npc.homeLocation) === world.current_position?.location_id) {
      states.vigor = clampState((states.vigor ?? 100) + Math.max(2, Math.floor(minutes / 60)));
      upsertActiveState(npc, 'thirst', 'жажда', clampState((getActiveStateValue(npc, 'thirst') ?? 0) - Math.max(1, Math.floor(minutes / 24))), 'derived');
      upsertActiveState(npc, 'fear', 'страх', clampState((getActiveStateValue(npc, 'fear') ?? 0) - 1), 'derived');
    }

    if ((world.scene?.attention ?? 'низкое') === 'высокое') {
      upsertActiveState(npc, 'fear', 'страх', clampState((getActiveStateValue(npc, 'fear') ?? 0) + 1), 'derived');
    }

    const npcLocation = world.locations?.[npc.locationId ?? npc.homeLocation ?? ''] ?? null;
    applyEnvironmentalExposure(npc, world, minutes, intent, npcLocation);

    mirrorBodyStateFields(npc);
  }
}

function resolveNeedActivity(intent) {
  if (intent?.type === 'rest') {
    return {
      satietyMultiplier: 1,
      vigorMultiplier: 0
    };
  }

  if (intent?.type === 'move' || intent?.type === 'attack' || intent?.type === 'flee' || intent?.type === 'heal') {
    return {
      satietyMultiplier: 1.5,
      vigorMultiplier: 1.5
    };
  }

  return {
    satietyMultiplier: 1,
    vigorMultiplier: 1
  };
}

function applyEnvironmentalExposure(actor, world, minutes, intent, location = null) {
  if (!actor || typeof actor !== 'object') return;

  const states = ensureCoreStates(actor);
  const currentCold = getActiveStateValue(actor, 'cold') ?? 0;
  const currentWet = getActiveStateValue(actor, 'wet') ?? 0;
  const exposure = evaluateEnvironmentalExposure(world, intent, location);
  const gain = Math.max(0, Math.floor(Math.max(0, Number(minutes) || 0) / 120));
  const relief = Math.max(0, Math.floor(Math.max(0, Number(minutes) || 0) / 90));

  let nextCold = currentCold;
  let nextWet = currentWet;

  if (exposure.cold) {
    nextCold = clampState(currentCold + gain);
  } else if (exposure.sheltered && relief > 0) {
    nextCold = clampState(currentCold - relief);
  }

  if (exposure.wet) {
    nextWet = clampState(currentWet + gain);
  } else if (exposure.sheltered && relief > 0) {
    nextWet = clampState(currentWet - relief);
  }

  if (nextCold >= 80 && nextWet >= 40) {
    states.health = clampState((states.health ?? 100) - Math.max(1, Math.floor(Math.max(0, Number(minutes) || 0) / 180)));
  }

  upsertActiveState(actor, 'cold', 'холод', nextCold, 'derived');
  upsertActiveState(actor, 'wet', 'промокание', nextWet, 'derived');
}

function evaluateEnvironmentalExposure(world, intent, location = null) {
  const weather = String(world.scene?.weather ?? '').toLowerCase();
  const light = String(world.scene?.light ?? '').toLowerCase();
  const hour = Number(world.clock?.hour ?? NaN);
  const indoors = isShelteredLocation(location);
  const coldWeather = /холод|мороз|промозг|ветер/.test(weather);
  const wetWeather = /дожд|сыр|туман|мокр|лив|снег/.test(weather);
  const darkHours = Number.isFinite(hour) && (hour < 6 || hour >= 20);
  const resting = intent?.type === 'rest';

  return {
    cold: !indoors && (coldWeather || darkHours || /ноч|темнот|вечер/.test(light)),
    wet: !indoors && wetWeather,
    sheltered: indoors || resting
  };
}

function isShelteredLocation(location = null) {
  const text = `${location?.name ?? ''} ${location?.kind ?? ''}`.toLowerCase();
  if (!text.trim()) return false;
  if (/(изб|дом|хата|комнат|баня|церков|лавка|сарай|кабак|келья|мастерск|погреб)/.test(text)) return true;
  if (/(переправ|дорог|тракт|лес|поле|рынок|улиц|берег|река|мост|брод|двор)/.test(text)) return false;
  return false;
}

function consumeNeed(actor, states, key, minutes, multiplier = 1) {
  const requested = Math.max(0, Number(minutes) || 0) * NEED_BASE_PER_MINUTE * Math.max(0, Number(multiplier) || 0);
  const drift = ensureNeedDrift(actor);
  drift[key] = (drift[key] ?? 0) + requested;

  const whole = Math.floor(drift[key]);
  drift[key] -= whole;

  const current = Number(states[key]);
  const available = Number.isFinite(current) ? current : 100;
  const consumed = Math.min(available, whole);
  states[key] = clampState(available - consumed);

  return {
    requested,
    consumed,
    shortage: Math.max(0, requested - available)
  };
}

function accumulateNeedDamage(actor, shortage) {
  const numeric = Number(shortage);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  const drift = ensureNeedDrift(actor);
  drift[SATIETY_DAMAGE_NEED] = (drift[SATIETY_DAMAGE_NEED] ?? 0) + numeric;
  const loss = Math.floor(drift[SATIETY_DAMAGE_NEED]);
  drift[SATIETY_DAMAGE_NEED] -= loss;
  return loss;
}

function ensureNeedDrift(actor) {
  if (!actor || typeof actor !== 'object') return {};
  if (!actor.resourceDrift || typeof actor.resourceDrift !== 'object') {
    actor.resourceDrift = {
      satiety: 0,
      vigor: 0,
      starvation: 0
    };
  } else {
    actor.resourceDrift.satiety = Number.isFinite(actor.resourceDrift.satiety) ? actor.resourceDrift.satiety : 0;
    actor.resourceDrift.vigor = Number.isFinite(actor.resourceDrift.vigor) ? actor.resourceDrift.vigor : 0;
    actor.resourceDrift.starvation = Number.isFinite(actor.resourceDrift.starvation) ? actor.resourceDrift.starvation : 0;
  }
  return actor.resourceDrift;
}

function pickNpcSchedule(world, npc) {
  const hour = world.clock.hour;
  const schedule = world.cluster?.npcSchedules?.[npc.id] ?? npc.schedule ?? [];
  const block = schedule.find((item) => hour >= item.from && hour < item.to) ?? null;
  return {
    locationId: block?.locationId ?? npc.locationId ?? npc.homeLocation ?? world.current_position?.location_id ?? null,
    microLocationId: block?.microLocationId ?? npc.microLocationId ?? null,
    anchorId: block?.anchorId ?? null,
    routeId: block?.routeId ?? block?.lastRouteId ?? null,
    activity: block?.activity ?? npc.location ?? 'движется по своим делам'
  };
}

function logWorldEvent(world, result) {
  recordWorldEvent(world, {
    at: { ...world.clock },
    input: null,
    intent: 'world',
    result
  });
}

function syncActorStates(world) {
  if (world.player && typeof world.player === 'object') {
    world.player = syncActorStateProfile(world.player, {
      kind: 'player',
      currentLocationId: world.current_position?.location_id ?? null,
      currentMicroLocationId: world.current_position?.minilocation_id ?? null,
      region_id: world.current_position?.region_id ?? null
    });
  }

  if (Array.isArray(world.npcs)) {
    for (let i = 0; i < world.npcs.length; i += 1) {
      const npc = world.npcs[i];
      if (!npc || typeof npc !== 'object') continue;
      Object.assign(npc, syncActorStateProfile(npc, {
        kind: 'npc',
        currentLocationId: npc.locationId ?? npc.homeLocation ?? null,
        currentMicroLocationId: npc.microLocationId ?? null,
        actorId: npc.id
      }));
    }
  }
}

function ensureCoreStates(actor) {
  if (!actor || typeof actor !== 'object') return {};
  if (!actor.states || typeof actor.states !== 'object') {
    actor.states = {};
  }

  const health = Number(actor.body?.health ?? actor.states?.health);
  const satiety = Number(actor.body?.satiety ?? actor.states?.satiety);
  const vigor = Number(actor.body?.vigor ?? actor.states?.vigor);

  if (!Number.isFinite(actor.states.health)) {
    actor.states.health = Number.isFinite(health) ? health : 100;
  }
  if (!Number.isFinite(actor.states.satiety)) {
    actor.states.satiety = Number.isFinite(satiety) ? satiety : 100;
  }
  if (!Number.isFinite(actor.states.vigor)) {
    actor.states.vigor = Number.isFinite(vigor) ? vigor : 100;
  }

  return actor.states;
}

function clampState(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
