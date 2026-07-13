import { recordWorldEvent } from './event-log.js';
import { buildMemoryPromptHeader } from './prompt-headers.js';

export function validateMemoryJournalUpdate(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['memory_journal_update must be an object'] };
  }
  if (data.version !== 1) errors.push('version must be 1');
  if (data.schema !== 'memory_journal_update') errors.push('schema must be memory_journal_update');

  for (const key of ['character_journal', 'world_memory', 'discarded_as_noise']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      errors.push(`${key} must be an array`);
    }
  }

  for (const entry of data.character_journal ?? []) {
    if (!entry || typeof entry !== 'object') {
      errors.push('character_journal entries must be objects');
      continue;
    }
    if (!String(entry.text ?? '').trim()) errors.push('character_journal.text is required');
    if (entry.visible_to_character === false) {
      errors.push('character_journal must not contain hidden world_memory entries');
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function buildMemoryJournalInput(context = {}) {
  return {
    playerInput: String(context.playerInput ?? '').trim(),
    intentTag: context.intentTag ?? null,
    masterNarrative: context.masterNarrative ?? {},
    visiblePackage: context.visiblePackage ?? {},
    hiddenChanges: context.hiddenChanges ?? [],
    check: context.check ?? null
  };
}

export function buildMemoryJournalMessages(context = {}) {
  const input = buildMemoryJournalInput(context);
  const system = buildMemoryPromptHeader({
    format: 'JSON: { version:1, schema:"memory_journal_update", character_journal:[], world_memory:[], discarded_as_noise:[] }',
    constraints: 'character_journal entries require type, text, source_in_world, certainty. world_memory only for hidden changes with visible_to_character:false. No decorative prose in character_journal.'
  });
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'memory_journal_input',
        ...input
      })
    }
  ];
}

export function buildDeterministicMemoryJournalUpdate(context = {}) {
  const narrative = context.masterNarrative ?? {};
  const visiblePackage = context.visiblePackage ?? {};
  const input = String(context.playerInput ?? '').trim();
  const entries = [];

  const scene = String(visiblePackage.visible_scene ?? narrative.scene ?? '').trim();
  if (scene && !looksDecorative(scene)) {
    entries.push({
      type: 'event',
      text: scene,
      source_in_world: input || 'ход',
      certainty: 'known'
    });
  }

  const consequence = String(narrative.consequence ?? '').trim();
  if (consequence && !looksDecorative(consequence)) {
    entries.push({
      type: 'fact',
      text: consequence,
      source_in_world: 'последствие хода',
      certainty: 'known'
    });
  }

  const worldMemory = [];
  for (const hidden of context.hiddenChanges ?? []) {
    const text = String(hidden?.text ?? hidden ?? '').trim();
    if (!text) continue;
    worldMemory.push({
      type: 'hidden_change',
      text,
      visible_to_character: false
    });
  }

  return {
    version: 1,
    schema: 'memory_journal_update',
    character_journal: entries.slice(0, 4),
    world_memory: worldMemory.slice(0, 4),
    discarded_as_noise: looksDecorative(scene) ? [scene] : []
  };
}

export function applyMemoryJournalUpdate(world, update = {}, context = {}) {
  const validation = validateMemoryJournalUpdate(update);
  if (!validation.ok) {
    const error = new Error(`Memory journal validation failed: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }

  if (!world.memory || typeof world.memory !== 'object') world.memory = {};
  if (!Array.isArray(world.memory.worldMemory)) world.memory.worldMemory = [];

  for (const entry of update.world_memory ?? []) {
    if (!entry || entry.visible_to_character !== false) continue;
    world.memory.worldMemory.unshift({
      type: entry.type ?? 'hidden_change',
      text: String(entry.text ?? '').trim(),
      at: world.clock ? { ...world.clock } : null
    });
  }
  world.memory.worldMemory = world.memory.worldMemory.slice(0, 24);

  const primary = (update.character_journal ?? []).find((entry) => String(entry?.text ?? '').trim());
  const fallbackSummary = context.fallbackSummary ?? null;
  const journalText = primary?.text ?? fallbackSummary;
  if (!journalText) return update;

  recordWorldEvent(world, {
    at: { ...world.clock },
    input: context.playerInput ?? null,
    intent: context.intentTag ?? null,
    result: journalText,
    certainty: primary?.certainty ?? 'known',
    source: primary?.source_in_world ?? 'ход',
    check: context.check ?? null,
    provider: context.provider ?? null,
    kind: primary?.type === 'rumor' ? 'rumor' : 'event'
  });

  return update;
}

function looksDecorative(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return true;
  return /^(сцена|описание|атмосфера|красив|лирич)/u.test(value) && value.length < 40;
}
