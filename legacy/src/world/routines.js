import { getCurrentLocation, getCurrentMicroLocation, syncCurrentPlace } from './location.js';
import { recordWorldEvent } from './event-log.js';

export function advanceRoutines(world) {
  const location = getCurrentLocation(world);
  if (!location) return;

  for (const npc of world.npcs) {
    const before = `${npc.locationId ?? ''}|${npc.microLocationId ?? ''}`;
    const next = nextNpcState(npc, world);
    npc.locationId = next.locationId;
    npc.microLocationId = next.microLocationId;
    npc.location = next.label;
    if (before !== `${npc.locationId ?? ''}|${npc.microLocationId ?? ''}`) {
      appendLocationTrace(location, `${npc.name} смещается к ${next.label}.`);
      appendEvent(world, `${npc.name} меняет место по своей обычной рутине.`);
    }
  }

  const pulse = routinePulse(world.clock.hour);
  if (pulse) {
    location.activity = rotate(location.activity);
    appendLocationTrace(location, pulse);
    appendEvent(world, `Рутинный ход места: ${pulse}`);
  }

  syncCurrentPlace(world);
}

function nextNpcState(npc, world) {
  const schedule = world.cluster?.npcSchedules?.[npc.id] ?? [];
  const hour = world.clock.hour;
  const block = schedule.find((item) => hour >= item.from && hour < item.to) ?? null;
  const locationId = block?.locationId ?? npc.locationId ?? npc.homeLocation ?? world.current_position?.location_id ?? world.currentLocationId;
  const microLocationId = block?.microLocationId ?? npc.microLocationId ?? null;
  const label = block?.activity ?? describeNpcFallback(npc, world);
  return { locationId, microLocationId, label };
}

function describeNpcFallback(npc, world) {
  const currentMicro = getCurrentMicroLocation(world);
  return currentMicro ? `${npc.name} находится около ${currentMicro.name}` : `${npc.name} по своим делам`;
}

function routinePulse(hour) {
  if (hour < 7) return 'место просыпается и собирает людей в одно движение.';
  if (hour < 12) return 'утренние дела становятся видимее и суше.';
  if (hour < 17) return 'дневная суета тянет внимание на торговлю и счёт.';
  if (hour < 21) return 'к вечеру люди закрывают лишние разговоры и смотрят на дорогу.';
  return 'ночь заставляет место говорить тише.';
}

function appendLocationTrace(location, text) {
  location.recentTraces.unshift({
    at: null,
    kind: 'routine',
    text
  });
  location.recentTraces = location.recentTraces.slice(0, 12);
}

function appendEvent(world, result) {
  recordWorldEvent(world, {
    at: { ...world.clock },
    input: null,
    intent: 'routine',
    result
  });
}

function rotate(values) {
  if (!Array.isArray(values) || values.length === 0) return values;
  return [...values.slice(1), values[0]];
}
