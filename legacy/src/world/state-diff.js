import { applyStateDelta } from './delta.js';
import { validateStateDeltaItemChanges } from './item-resolver.js';

const FORBIDDEN_RESOURCE_ITEM_KEYS = new Set(['inventory_add', 'property_add']);

export function explainStateDeltaValidation(world, patch = {}) {
  const errors = [];
  const resources = patch?.resources;
  if (resources && typeof resources === 'object' && !Array.isArray(resources)) {
    for (const key of FORBIDDEN_RESOURCE_ITEM_KEYS) {
      if (resources[key] !== undefined && resources[key] !== null) {
        errors.push(`state_delta.resources.${key} is forbidden; use item_changes with materialize or existing item ops`);
      }
    }
  }
  const itemChanges = [
    ...(Array.isArray(patch?.item_changes) ? patch.item_changes : []),
    ...(Array.isArray(patch?.resources?.item_changes) ? patch.resources.item_changes : [])
  ];
  if (itemChanges.length > 0) {
    const result = validateStateDeltaItemChanges(world, itemChanges);
    if (!result.ok) errors.push(...result.errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateStateDeltaPatch(world, patch = {}) {
  return explainStateDeltaValidation(world, patch);
}

export function composeStateDiff(world, stateDelta = {}) {
  const patch = normalizeStateDelta(world, stateDelta);
  const handles = extractHandles(stateDelta);

  return {
    version: 1,
    schema: 'state_delta',
    source: 'semantic_delta',
    patch,
    handles,
    createdAt: new Date().toISOString()
  };
}

export function validateStateDiff(diff) {
  const errors = [];
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) {
    return { ok: false, errors: ['diff must be an object'] };
  }
  if (diff.version !== 1) {
    errors.push('unsupported diff version');
  }
  if (diff.schema !== 'state_delta') {
    errors.push('unsupported diff schema');
  }
  if (!diff.patch || typeof diff.patch !== 'object' || Array.isArray(diff.patch)) {
    errors.push('diff.patch must be an object');
  }
  if (diff.handles !== undefined && (!diff.handles || typeof diff.handles !== 'object' || Array.isArray(diff.handles))) {
    errors.push('diff.handles must be an object when present');
  } else if (diff.handles && !validateHandlesShape(diff.handles)) {
    errors.push('diff.handles must contain string handles or arrays of strings');
  }
  if (diff.source !== undefined && typeof diff.source !== 'string') {
    errors.push('diff.source must be a string when present');
  }
  return { ok: errors.length === 0, errors };
}

export function commitStateDiff(world, diff) {
  const validation = validateStateDiff(diff);
  if (!validation.ok) {
    const error = new Error(`State diff validation failed: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }

  const deltaValidation = validateStateDeltaPatch(world, diff.patch);
  if (!deltaValidation.ok) {
    const error = new Error(`State delta validation failed: ${deltaValidation.errors.join('; ')}`);
    error.validation = deltaValidation;
    throw error;
  }

  applyStateDelta(world, diff.patch);
  world.lastCommit = {
    at: new Date().toISOString(),
    version: diff.version,
    source: diff.source,
    handles: diff.handles ?? {},
    summary: summarizePatch(diff.patch)
  };
  world.catalogDirty = true;
  return world.lastCommit;
}

function normalizeStateDelta(world, stateDelta) {
  if (!stateDelta || typeof stateDelta !== 'object') return {};
  const cloned = structuredClone(stateDelta);
  return resolveHandles(world, cloned);
}

function resolveHandles(world, value) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveHandles(world, item));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return resolveHandleString(world, value);
    return value;
  }

  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'handle' || key === 'targetHandle' || key === 'npcHandle' || key === 'locationHandle' || key === 'entityHandle') {
      next[key.replace(/Handle$/u, 'Id')] = resolveHandleString(world, item);
      continue;
    }
    if (key === 'handles' && item && typeof item === 'object') {
      next.handles = resolveHandles(world, item);
      continue;
    }
    next[key] = resolveHandles(world, item);
  }
  return next;
}

function resolveHandleString(world, handle) {
  if (typeof handle !== 'string') return handle;
  const trimmed = handle.trim();
  if (!trimmed) return handle;
  if (trimmed === 'player' || trimmed === '@player') return world.player?.id ?? 'player';

  const npc = (world.npcs ?? []).find((item) =>
    item.id === trimmed ||
    item.name === trimmed ||
    item.name?.toLowerCase() === trimmed.toLowerCase()
  );
  if (npc) return npc.id;

  const location = world.locations?.[trimmed] ?? Object.values(world.locations ?? {}).find((item) =>
    item.name === trimmed || item.name?.toLowerCase() === trimmed.toLowerCase()
  );
  if (location) return location.id;

  const micro = world.cluster?.microLocations?.find?.((item) =>
    item.id === trimmed || item.name === trimmed || item.name?.toLowerCase() === trimmed.toLowerCase()
  );
  if (micro) return micro.id;

  return trimmed;
}

function extractHandles(value, out = {}) {
  if (Array.isArray(value)) {
    for (const item of value) extractHandles(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'handle' || key === 'targetHandle' || key === 'npcHandle' || key === 'locationHandle' || key === 'entityHandle') {
      out[key] = item;
      continue;
    }
    if (key === 'handles' && item && typeof item === 'object') {
      extractHandles(item, out);
      continue;
    }
    extractHandles(item, out);
  }
  return out;
}

function summarizePatch(patch) {
  const keys = Object.keys(patch ?? {}).slice(0, 8);
  return keys.length ? keys.join(', ') : 'empty';
}

function validateHandlesShape(handles) {
  for (const [key, value] of Object.entries(handles)) {
    if (!/^(handle|targetHandle|npcHandle|locationHandle|entityHandle|handles)$/u.test(key)) {
      return false;
    }
    if (typeof value === 'string') continue;
    if (Array.isArray(value)) {
      if (!value.every((item) => typeof item === 'string')) return false;
      continue;
    }
    if (value && typeof value === 'object') {
      if (!validateHandlesShape(value)) return false;
      continue;
    }
    return false;
  }
  return true;
}
