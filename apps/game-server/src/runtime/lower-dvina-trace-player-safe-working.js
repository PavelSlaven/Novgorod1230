import { canonicalDigest } from '@rus/materialization';
import {
  assertAllowedKeys,
  assertJson,
  freezeJson,
  projectionError,
  text,
  textArray
} from './lower-dvina-trace-player-safe-json.js';
import {
  projectInteractions,
  projectNpcs
} from './lower-dvina-trace-player-safe-entities.js';
import { playerSafeItemIds, projectInventory, projectItems } from
  './lower-dvina-trace-player-safe-items.js';
import {
  assertWorkingPosition,
  projectClock,
  projectClockWeatherLight,
  projectDestinationRefs,
  projectKnowledge,
  projectRouteHistory,
  projectRouteKnowledge,
  projectRoutes,
  projectVisibleContext
} from './lower-dvina-trace-player-safe-world.js';

const WORKING_KEYS = new Set([
  'actor_id', 'position', 'destination_refs', 'clock',
  'clock_weather_light', 'inventory', 'items', 'visible_npcs', 'scene_npcs',
  'npcs', 'interactions', 'routes', 'available_routes', 'route_history',
  'route_knowledge', 'knowledge', 'visible_context',
  'visible_context_package', 'current_visible_context', 'combat_sessions',
  'case_evidence_ref', 'temporary_disposition_options'
]);
const INVALID = 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID';
const COMMITTED_REF_FIELDS = new Set([
  'inventory', 'items', 'visible_npcs', 'scene_npcs', 'npcs',
  'interactions', 'routes', 'available_routes', 'route_history',
  'route_knowledge', 'knowledge', 'combat_sessions', 'case_evidence_ref',
  'temporary_disposition_options'
]);
const VISIBLE_CONTEXT_FIELDS = new Set([
  'visible_context', 'visible_context_package', 'current_visible_context'
]);
const WORKING_PROJECTION_AUTHORITIES = new WeakSet();
const WORKING_PROJECTION_ADMISSIONS = new WeakMap();

export function createLowerDvinaTracePlayerSafeWorkingProjectionAuthority() {
  const admittedDigests = new Set();
  const authority = Object.freeze({
    admit(projection) {
      assertJson(projection);
      assertAllowedKeys(projection, WORKING_KEYS,
        'working_projection', INVALID);
      const admittedProjection = freezeJson(projection);
      admittedDigests.add(canonicalDigest(admittedProjection));
      return admittedProjection;
    }
  });
  WORKING_PROJECTION_AUTHORITIES.add(authority);
  WORKING_PROJECTION_ADMISSIONS.set(authority, admittedDigests);
  return authority;
}

export function applyLowerDvinaTraceWorkingProjection({
  base,
  workingProjection,
  committedState,
  actorId,
  authority
}) {
  if (workingProjection == null) return base;
  assertJson(workingProjection);
  assertAllowedKeys(workingProjection, WORKING_KEYS,
    'working_projection', INVALID);
  const admitted = workingProjectionIsAdmitted(authority, workingProjection);
  if (workingProjection.actor_id != null
      && workingProjection.actor_id !== actorId) {
    throw projectionError(INVALID,
      'Working projection cannot replace the committed actor owner.');
  }
  const position = Object.hasOwn(workingProjection, 'position')
    ? assertWorkingPosition(workingProjection.position, committedState)
    : base.position;
  const items = Object.hasOwn(workingProjection, 'items')
    ? projectItems(workingProjection.items, {
        actorId, position, strict: true
      })
    : base.items;
  const allowedItemIds = playerSafeItemIds(items);
  const output = { ...base, position, actor_id: actorId };
  for (const key of Object.keys(workingProjection)) {
    if (key === 'actor_id' || key === 'position'
        || key === 'destination_refs') continue;
    const projected = projectWorkingField(key, workingProjection[key], {
      actorId,
      position,
      items,
      allowedItemIds
    });
    if (!admitted && COMMITTED_REF_FIELDS.has(key)
        && !sameJson(projected, base[key])) {
      throw projectionError(INVALID,
        `Working ${key} cannot replace committed references.`);
    }
    if (!admitted && VISIBLE_CONTEXT_FIELDS.has(key)) {
      assertVisibleRefsGrounded(projected, base[key], key);
    }
    output[key] = projected;
  }
  validateWorkingDestinations(workingProjection.destination_refs,
    committedState);
  output.destination_refs = projectDestinationRefs(committedState, position);
  return output;
}

function workingProjectionIsAdmitted(authority, projection) {
  if (!WORKING_PROJECTION_AUTHORITIES.has(authority)) return false;
  return WORKING_PROJECTION_ADMISSIONS.get(authority)
    .has(canonicalDigest(projection));
}

function assertVisibleRefsGrounded(projected, committed, path) {
  for (const key of ['visible_npc', 'visible_objects']) {
    const admitted = new Set((committed?.[key] ?? []).map(visibleRefKey));
    if ((projected?.[key] ?? []).some((value) =>
      !admitted.has(visibleRefKey(value)))) {
      throw projectionError(INVALID,
        `Working ${path}.${key} contains an ungrounded reference.`);
    }
  }
}

function visibleRefKey(value) {
  if (typeof value === 'string') return `text:${value}`;
  return `entity:${value?.entity_ref?.entity_kind ?? ''}:`
    + `${value?.entity_ref?.entity_id ?? ''}`;
}

function sameJson(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalDigest(left) === canonicalDigest(right);
}

function projectWorkingField(key, value, context) {
  if (key === 'clock') return projectClock(value, { strict: true });
  if (key === 'clock_weather_light') {
    return projectClockWeatherLight(value, undefined, { strict: true });
  }
  if (key === 'inventory') return projectInventory(value, {
    strict: true,
    allowedItemIds: context.allowedItemIds
  });
  if (key === 'items') return context.items;
  if (key === 'visible_npcs' || key === 'scene_npcs') {
    return projectNpcs(value, {
      position: context.position, explicitlyVisible: true, strict: true
    });
  }
  if (key === 'npcs') {
    return projectNpcs(value, { position: context.position, strict: true });
  }
  if (key === 'interactions') {
    return projectInteractions(value, { strict: true });
  }
  if (key === 'routes' || key === 'available_routes') {
    return projectRoutes(value, { strict: true });
  }
  if (key === 'route_history') {
    return projectRouteHistory(value, { strict: true });
  }
  if (key === 'route_knowledge') {
    return projectRouteKnowledge(value, { strict: true });
  }
  if (key === 'knowledge') return projectKnowledge(value, { strict: true });
  if (key === 'case_evidence_ref') {
    const projected = text(value);
    if (projected === undefined) {
      throw projectionError(INVALID,
        'working_projection.case_evidence_ref must be a text ref.');
    }
    return projected;
  }
  if (key === 'combat_sessions') {
    assertJson(value);
    return freezeJson(value);
  }
  if (key === 'temporary_disposition_options') {
    assertJson(value);
    return freezeJson(value);
  }
  if (key === 'visible_context' || key === 'visible_context_package'
      || key === 'current_visible_context') {
    return projectVisibleContext(value, { strict: true, path: key });
  }
  throw projectionError(INVALID, `Unsupported working field ${key}.`);
}

function validateWorkingDestinations(value, committedState) {
  if (value === undefined) return;
  const refs = textArray(value, {
    strict: true,
    path: 'working_projection.destination_refs',
    code: INVALID
  });
  const admitted = new Set(projectDestinationRefs(committedState, null));
  if (refs.some((ref) => !admitted.has(ref))) {
    throw projectionError(INVALID,
      'Working destination_refs must come from committed prepared scenes.');
  }
}
