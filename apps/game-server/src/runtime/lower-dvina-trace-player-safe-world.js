import {
  assertAllowedKeys,
  compact,
  finite,
  plain,
  projectionError,
  scalarRecord,
  text,
  textArray
} from './lower-dvina-trace-player-safe-json.js';

const POSITION_KEYS = new Set([
  'g4_id', 'g5_node_id', 'g5_anchor_id', 'anchor_id', 'location_ref',
  'zone_ref'
]);
const CLOCK_KEYS = new Set([
  'whole_minutes', 'subminute_numerator', 'subminute_denominator',
  'day', 'hour', 'minute'
]);
const WEATHER_KEYS = new Set([
  'state', 'precipitation', 'temperature', 'temperature_c', 'wind',
  'wind_strength', 'visibility'
]);
const LIGHT_KEYS = new Set(['state', 'band', 'level', 'visibility']);
export { projectVisibleContext } from
  './lower-dvina-trace-player-safe-visible-context.js';

export function projectPosition(value, { strict = false } = {}) {
  if (!plain(value)) return undefined;
  if (strict) {
    assertAllowedKeys(value, POSITION_KEYS, 'position', invalidCode());
  }
  return compact(Object.fromEntries([...POSITION_KEYS].map((key) => [
    key, text(value[key])
  ])));
}

export function projectClock(value, { strict = false } = {}) {
  if (!plain(value)) return undefined;
  if (strict) assertAllowedKeys(value, CLOCK_KEYS, 'clock', invalidCode());
  return compact(Object.fromEntries([...CLOCK_KEYS].map((key) => [
    key,
    ['day', 'hour', 'minute'].includes(key)
      ? finite(value[key])
      : text(value[key])
  ])));
}

export function projectClockWeatherLight(value, fallbackClock,
  { strict = false } = {}) {
  if (!plain(value) && !plain(fallbackClock)) return undefined;
  const source = plain(value) ? value : {};
  const allowed = new Set(['clock', 'weather', 'light']);
  if (strict) {
    assertAllowedKeys(source, allowed, 'clock_weather_light', invalidCode());
  }
  return compact({
    clock: projectClock(source.clock ?? fallbackClock, { strict }),
    weather: scalarRecord(source.weather, {
      strict, path: 'weather', allowedKeys: WEATHER_KEYS
    }),
    light: scalarRecord(source.light, {
      strict, path: 'light', allowedKeys: LIGHT_KEYS
    })
  });
}

export function projectDestinationRefs(committedState, position) {
  return admittedScenes(committedState)
    .map(({ locationRef }) => locationRef)
    .filter((locationRef) => locationRef !== position?.location_ref)
    .sort();
}

export function assertWorkingPosition(position, committedState) {
  const projected = projectPosition(position, { strict: true });
  const committed = projectPosition(committedState.position);
  if (samePosition(projected, committed)) return projected;
  const destination = admittedScenes(committedState).find(({ locationRef }) =>
    locationRef === projected?.location_ref);
  if (!destination || projected.g5_node_id !== destination.nodeId
      || projected.g5_anchor_id !== destination.anchorId) {
    throw projectionError(
      'TRACE_PLAYER_SAFE_WORKING_POSITION_INVALID',
      'Working position must name an admitted committed prepared scene.'
    );
  }
  return projected;
}

export function projectRoutes(records, { strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const allowed = new Set([
    'route_id', 'route_ref', 'id', 'from_ref', 'source_ref', 'to_ref',
    'target_ref', 'label', 'name', 'access', 'known', 'visible',
    'is_visible', 'visibility', 'visibility_state', 'knowledge_state',
    'disclosure_state'
  ]);
  return records.filter((record) => !recordIsClosed(record, true))
    .map((record) => {
      if (strict) assertAllowedKeys(record, allowed, 'routes[]', invalidCode());
      return compact({
        route_id: text(record.route_id ?? record.route_ref ?? record.id),
        route_ref: text(record.route_ref),
        from_ref: text(record.from_ref ?? record.source_ref),
        to_ref: text(record.to_ref ?? record.target_ref),
        label: text(record.label ?? record.name),
        access: typeof record.access === 'string' ? record.access : undefined,
        known: record.known === true ? true : undefined
      });
    });
}

export function projectRouteKnowledge(records, { strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const allowed = new Set([
    'route_ref', 'route_id', 'knowledge_state', 'label', 'name', 'visible',
    'is_visible', 'visibility', 'visibility_state', 'disclosure_state'
  ]);
  return records.filter((record) => !recordIsClosed(record)).map((record) => {
    if (typeof record === 'string') return record;
    if (strict) {
      assertAllowedKeys(record, allowed, 'route_knowledge[]', invalidCode());
    }
    return compact({
      route_ref: text(record.route_ref ?? record.route_id),
      knowledge_state: text(record.knowledge_state),
      label: text(record.label ?? record.name)
    });
  });
}

export function projectRouteHistory(records, { strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const allowed = new Set([
    'route_ref', 'route_id', 'from_ref', 'to_ref', 'status'
  ]);
  return records.map((record) => {
    if (!plain(record)) {
      if (strict) throw projectionError(invalidCode(),
        'route_history[] must be an object.');
      return undefined;
    }
    if (strict) {
      assertAllowedKeys(record, allowed, 'route_history[]', invalidCode());
    }
    return compact({
      route_ref: text(record.route_ref ?? record.route_id),
      from_ref: text(record.from_ref), to_ref: text(record.to_ref),
      status: text(record.status)
    });
  }).filter(Boolean);
}

export function projectKnowledge(records, { strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const allowed = new Set([
    'fact_id', 'knowledge_id', 'id', 'knowledge_state', 'category', 'text',
    'summary', 'visible', 'is_visible', 'visibility', 'visibility_state',
    'disclosure_state'
  ]);
  return records.filter((record) => !recordIsClosed(record)).map((record) => {
    if (typeof record === 'string') return record;
    if (strict) assertAllowedKeys(record, allowed, 'knowledge[]', invalidCode());
    return compact({
      fact_id: text(record.fact_id ?? record.knowledge_id ?? record.id),
      knowledge_state: text(record.knowledge_state),
      category: text(record.category), text: text(record.text ?? record.summary)
    });
  });
}

function admittedScenes(state) {
  const knownRoutes = new Set((state.route_knowledge ?? []).map((record) =>
    typeof record === 'string' ? record : record?.route_ref ?? record?.route_id)
    .filter(Boolean));
  // A persisted party snapshot is already the commit boundary. New-game route
  // normalization intentionally strips the transient preparation status.
  const firstEntryScene = state.first_entry_preparation?.spatial_v3?.target
    == null ? null : state.first_entry_preparation.scene;
  const unique = new Map();
  [...(state.prepared_scenes ?? []), firstEntryScene].forEach((scene) => {
    const locationRef = text(scene?.location_profile_ref);
    const nodeId = text(scene?.node?.instance_id);
    const anchorId = text(scene?.anchor?.instance_id);
    const entryRouteRef = text(scene?.entry_route_ref);
    if (!locationRef || !nodeId || !anchorId
        || entryRouteRef && !knownRoutes.has(entryRouteRef)
        || unique.has(locationRef)) return;
    unique.set(locationRef, { locationRef, nodeId, anchorId });
  });
  return [...unique.values()];
}

function recordIsClosed(record, includeAccess = false) {
  if (!plain(record)) return false;
  if (record.visible === false || record.is_visible === false) return true;
  const closed = new Set([
    'closed', 'closed_until_disclosed', 'hidden', 'private', 'secret',
    'sealed', 'unknown', 'unmaterialized'
  ]);
  return [record.visibility, record.visibility_state, record.knowledge_state,
    record.disclosure_state, ...(includeAccess ? [record.access] : [])]
    .some((state) => typeof state === 'string'
      && closed.has(state.toLowerCase()));
}

function samePosition(left, right) {
  return [...POSITION_KEYS].every((key) => left?.[key] === right?.[key]);
}

function invalidCode() {
  return 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID';
}
