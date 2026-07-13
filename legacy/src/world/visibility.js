import { allowsDeterministicFallback } from './semantic-gate.js';

const VISIBLE_PACKAGE_KEYS = new Set([
  'version',
  'schema',
  'visible_scene',
  'visible_changes',
  'sensory_details',
  'visible_npc',
  'visible_objects',
  'known_context',
  'uncertainties',
  'allowed_tensions',
  'do_not_imply'
]);

const FORBIDDEN_IN_PROSE_PACKAGE = [
  'hidden_state',
  'hidden',
  'secret',
  'sourceDossier',
  'audit',
  'state_delta',
  'dossier',
  'witnesses',
  'objectiveMap',
  'requestRaw',
  'responseRaw'
];

export function buildVisibleContextInput(world, masterNarrative = {}) {
  const narrative = sanitizeMasterNarrative(masterNarrative);
  const hidden = world?.hidden_state ?? world?.hiddenState ?? {};
  return {
    clock: world?.clock ?? null,
    location: {
      name: world?.place?.name ?? world?.current_position?.location_label ?? null,
      micro: world?.microPlace?.name ?? null
    },
    scene: {
      weather: world?.scene?.weather ?? null,
      light: world?.scene?.light ?? null,
      attention: world?.scene?.attention ?? null
    },
    narrative,
    playerKnowledge: summarizePlayerKnowledge(world),
    visibleNpcs: summarizeVisibleNpcs(world),
    visibleObjects: summarizeVisibleObjects(world),
    delayedClues: summarizeDelayedClues(world?.delayedEvents ?? []),
    hiddenSentinelPresent: containsHiddenSentinel(hidden)
  };
}

export function buildDeterministicVisiblePackage(world, masterNarrative = {}, env = process.env) {
  if (!allowsDeterministicFallback(world) && !allowsDeterministicFallback(env)) {
    throw new Error('Deterministic visible package is forbidden in production.');
  }
  const input = buildVisibleContextInput(world, masterNarrative);
  const narrative = input.narrative;
  return stripHiddenForNarrator({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: String(narrative.scene ?? narrative.visible_scene ?? '').trim(),
    visible_changes: uniqueStrings([
      narrative.consequence,
      ...(Array.isArray(narrative.visible_details) ? narrative.visible_details : [])
    ], 6),
    sensory_details: uniqueStrings([
      ...(Array.isArray(narrative.visible_details) ? narrative.visible_details : []),
      input.scene?.weather,
      input.scene?.light
    ].filter(Boolean), 6),
    visible_npc: input.visibleNpcs,
    visible_objects: input.visibleObjects,
    known_context: input.playerKnowledge,
    uncertainties: [],
    allowed_tensions: narrative.next_pressure ? [String(narrative.next_pressure)] : [],
    do_not_imply: uniqueStrings(input.delayedClues.map((item) => item.clue).filter(Boolean), 4)
  });
}

export function validateVisibleContextPackage(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['visible_context_package must be an object'] };
  }
  if (data.version !== 1) errors.push('version must be 1');
  if (data.schema !== 'visible_context_package') errors.push('schema must be visible_context_package');
  if (!String(data.visible_scene ?? '').trim()) errors.push('visible_scene is required');

  for (const key of Object.keys(data)) {
    if (!VISIBLE_PACKAGE_KEYS.has(key)) {
      errors.push(`forbidden key: ${key}`);
    }
  }

  const serialized = JSON.stringify(data).toLowerCase();
  for (const token of FORBIDDEN_IN_PROSE_PACKAGE) {
    if (serialized.includes(token.toLowerCase())) {
      errors.push(`package must not contain ${token}`);
    }
  }
  if (containsHiddenSentinel(data)) {
    errors.push('hidden sentinel leaked into visible package');
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function stripHiddenForNarrator(data = {}) {
  if (!data || typeof data !== 'object') return {};
  const clone = structuredClone(data);
  for (const key of FORBIDDEN_IN_PROSE_PACKAGE) {
    delete clone[key];
  }
  delete clone.input;
  delete clone.intent;
  delete clone.world;
  if (Array.isArray(clone.do_not_imply)) {
    clone.do_not_imply = clone.do_not_imply
      .map((item) => String(item ?? '').trim())
      .filter((item) => item && !isHiddenSentinelText(item));
  }
  return clone;
}

export function summarizePublicDelayedEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => summarizePublicDelayedEvent(event))
    .filter(Boolean);
}

export function summarizePublicDelayedEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const visibility = String(event.visibility ?? 'hidden').toLowerCase();
  if (visibility === 'hidden') {
    const clue = cleanText(event.visibleClue ?? event.visible_clue);
    if (!clue) return null;
    return `Признак: ${clue}`;
  }
  if (visibility === 'clue') {
    const clue = cleanText(event.visibleClue ?? event.visible_clue ?? event.reason);
    return clue ? `Признак: ${clue}` : null;
  }
  if (visibility === 'known' || event.characterKnowledge === 'known') {
    const parts = [
      cleanText(event.reason ?? event.result ?? 'Известное ожидание'),
      event.status === 'applied' ? cleanText(event.result) : null
    ].filter(Boolean);
    return parts.join(' · ');
  }
  return null;
}

function summarizeDelayedClues(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => String(event?.visibility ?? 'hidden').toLowerCase() !== 'hidden' || cleanText(event?.visibleClue))
    .map((event) => ({
      clue: cleanText(event?.visibleClue ?? event?.visible_clue) || null,
      visibility: String(event?.visibility ?? 'hidden').toLowerCase()
    }))
    .filter((item) => item.clue);
}

function summarizeVisibleNpcs(world) {
  const locationId = world?.current_position?.location_id ?? world?.currentLocationId ?? null;
  return (Array.isArray(world?.npcs) ? world.npcs : [])
    .filter((npc) => {
      const npcLocation = npc?.current_position?.location_id ?? npc?.locationId ?? null;
      return !locationId || npcLocation === locationId;
    })
    .map((npc) => ({
      name: npc?.name ?? 'НПС',
      visibleStatus: npc?.visibleStatus ?? npc?.status ?? null,
      mood: npc?.mood ?? null
    }))
    .slice(0, 8);
}

function summarizeVisibleObjects(world) {
  const items = [];
  for (const container of world?.microPlace?.containers ?? []) {
    if (container && typeof container === 'object') {
      const shellLabel = containerShellLabel(container);
      if (shellLabel) items.push({ label: shellLabel, kind: 'container_shell' });
      for (const item of container?.contents ?? []) {
        if (canRevealContainerContent(container, item, world?.player)) {
          items.push(item);
        }
      }
    }
  }
  items.push(
    ...(world?.player?.items?.carried_items ?? []),
    ...(world?.player?.items?.equipment ?? [])
  );
  return items
    .filter((item) => isVisibleObjectForPackage(item))
    .map((item) => item?.label ?? item?.name)
    .filter(Boolean)
    .slice(0, 8);
}

export function canRevealContainerContent(container, item, actor = null) {
  if (!container || typeof container !== 'object') return isVisibleObjectForPackage(item);
  if (container.locked === true) return false;
  const access = String(container.access ?? '').trim().toLowerCase();
  if (access === 'closed_container' || access === 'locked') return false;
  if (container.open !== true && container.visible_contents !== true) return false;
  return isVisibleObjectForPackage(item);
}

function containerShellLabel(container) {
  if (container.visible === false) return null;
  const visibility = String(container.visibility ?? '').trim().toLowerCase();
  if (['hidden', 'secret', 'unknown'].includes(visibility)) return null;
  const label = String(container.label ?? container.name ?? '').trim();
  if (!label) return null;
  if (container.locked === true || String(container.access ?? '').toLowerCase() === 'closed_container') {
    return `закрытый контейнер: ${label}`;
  }
  return label;
}

function isVisibleObjectForPackage(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.visible === false) return false;
  const visibility = String(item.visibility ?? '').trim().toLowerCase();
  if (['hidden', 'secret', 'unknown'].includes(visibility)) return false;
  const discoverability = Number(item.discoverability);
  if (Number.isFinite(discoverability) && discoverability < 0.2) return false;
  return true;
}

function summarizePlayerKnowledge(world) {
  const memory = world?.memory ?? {};
  return uniqueStrings([
    ...(Array.isArray(memory.sceneNotes) ? memory.sceneNotes.map((item) => item?.note ?? item?.text) : []),
    ...(Array.isArray(memory.heardRumors) ? memory.heardRumors : [])
  ], 8);
}

function sanitizeMasterNarrative(narrative = {}) {
  if (!narrative || typeof narrative !== 'object') return {};
  return {
    scene: narrative.scene ?? '',
    consequence: narrative.consequence ?? '',
    visible_details: Array.isArray(narrative.visible_details) ? narrative.visible_details.slice(0, 6) : [],
    npc_reactions: Array.isArray(narrative.npc_reactions) ? narrative.npc_reactions.slice(0, 6) : [],
    next_pressure: narrative.next_pressure ?? ''
  };
}

function containsHiddenSentinel(value) {
  const text = JSON.stringify(value ?? '').toLowerCase();
  return isHiddenSentinelText(text);
}

function isHiddenSentinelText(text) {
  return /hidden_sentinel|op\d+_hidden_sentinel/i.test(String(text ?? ''));
}

function uniqueStrings(values, limit = 12) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanText(value);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function cleanText(value) {
  return String(value ?? '').trim();
}
