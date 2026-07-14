import { deepFreeze } from '@rus/kernel';

export const ACTOR_KINDS = deepFreeze(['player', 'npc']);

const PROFILE_LEVELS = new Set(['background', 'scene', 'key']);

export function validateActor(actor = {}) {
  const errors = [];
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return { ok: false, errors: ['actor must be an object'] };
  if (!text(actor.id)) errors.push('actor.id is required');
  if (!ACTOR_KINDS.includes(text(actor.kind))) errors.push('actor.kind must be player or npc');
  if (!text(actor.name ?? actor.identity?.name)) errors.push('actor name is required');
  if (actor.profile_level != null && !PROFILE_LEVELS.has(text(actor.profile_level))) errors.push('actor.profile_level is invalid');
  if (actor.skills != null && !isPlainObject(actor.skills)) errors.push('actor.skills must be an object');
  if (actor.social_bindings != null && !Array.isArray(actor.social_bindings)) errors.push('actor.social_bindings must be an array');
  if (actor.biography != null && !isPlainObject(actor.biography)) errors.push('actor.biography must be an object');
  return { ok: errors.length === 0, errors };
}

export function normalizeActor(actor = {}) {
  const normalized = {
    id: text(actor.id) || null,
    kind: text(actor.kind) || null,
    name: text(actor.name ?? actor.identity?.name) || null,
    profile_level: text(actor.profile_level) || null,
    identity: cleanObject(actor.identity),
    biography: cleanObject(actor.biography),
    social_bindings: cleanArray(actor.social_bindings),
    skills: cleanObject(actor.skills),
    state: cleanObject(actor.state),
    metadata: cleanObject(actor.metadata)
  };
  return deepFreeze(normalized);
}

export function projectActorIdentity(actor = {}) {
  return deepFreeze({
    id: text(actor.id) || null,
    kind: text(actor.kind) || null,
    name: text(actor.name ?? actor.identity?.name) || null,
    identity: cleanObject(actor.identity),
    biography: cleanObject(actor.biography),
    social_bindings: cleanArray(actor.social_bindings),
    skills: cleanObject(actor.skills)
  });
}

export function projectActorState(actor = {}) {
  return deepFreeze({
    actor_id: text(actor.id) || null,
    profile_level: text(actor.profile_level) || null,
    state: cleanObject(actor.state)
  });
}

function text(value) { return String(value ?? '').trim(); }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function cleanObject(value) { return isPlainObject(value) ? structuredClone(value) : {}; }
function cleanArray(value) { return Array.isArray(value) ? structuredClone(value) : []; }
