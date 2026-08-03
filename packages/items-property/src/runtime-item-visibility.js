const CONCEALED_STATES = new Set([
  'blocked', 'closed', 'closed_until_disclosed', 'concealed',
  'concealed_requires_inspection', 'concealed_requires_search',
  'concealed_until_found', 'hidden', 'hidden_until_discovered',
  'inaccessible', 'known_but_not_seen', 'locked', 'not_visible', 'offscreen',
  'not_discovered', 'not_revealed', 'opaque', 'private',
  'requires_discovery', 'requires_inspection', 'requires_search',
  'search_required', 'sealed', 'secret', 'undiscovered', 'unknown',
  'unmaterialized'
]);
const CLOSED_CONTENT_STATES = new Set([
  ...CONCEALED_STATES,
  'contents_concealed', 'contents_hidden', 'contents_unknown'
]);
const BLOCKED_ACCESS_STATES = new Set([
  ...CONCEALED_STATES,
  'denied', 'forbidden', 'restricted', 'unavailable'
]);
const TERMINAL_ITEM_STATES = new Set([
  'consumed', 'depleted', 'destroyed', 'merged', 'removed', 'retired',
  'spent', 'superseded', 'terminal'
]);

export function runtimeItemRecordIsConcealed(record,
  { includeAccess = true } = {}) {
  if (!plain(record) || record.visible === false || record.is_visible === false
      || record.opaque === true || runtimeItemIsTerminal(record)) return true;
  const visibility = [record.visibility, record.visibility_state,
    record.knowledge_state, record.disclosure_state,
    record.state?.visibility_state];
  if (visibility.some((state) => stateHasBooleanFalse(state)
    || runtimeItemStateValues(state).some((value) =>
      CONCEALED_STATES.has(value)))) return true;
  const access = includeAccess ? [record.access, record.access_state,
    record.state?.access_state] : [];
  return access.some((state) => stateHasBooleanFalse(state)
    || runtimeItemStateValues(state).some((value) =>
      BLOCKED_ACCESS_STATES.has(value)));
}

export function runtimeItemIsTerminal(record) {
  return runtimeItemStateValues(record?.lifecycle_status,
    record?.condition_state, record?.state?.lifecycle_status)
    .some((state) => TERMINAL_ITEM_STATES.has(state));
}

export function runtimeItemContentsAreOpen(record) {
  if (!plain(record) || record.contents_opaque === true
      || runtimeItemRecordIsConcealed(record)) return false;
  const states = runtimeItemStateValues(record.open_state,
    record.closure_state, record.contents_state, record.access_state,
    record.state?.access_state);
  if (states.some((state) => CLOSED_CONTENT_STATES.has(state))) return false;
  return record.is_open === true || record.opened === true
    || states.some((state) =>
      ['open', 'opened', 'committed_open'].includes(state));
}

export function runtimeItemStateValues(...values) {
  const output = [];
  const seen = new Set();
  for (const value of values) collectStateValues(value, output, seen);
  return output;
}

function stateHasBooleanFalse(value, seen = new Set()) {
  if (!plain(value) || seen.has(value)) return false;
  seen.add(value);
  if (value.visible === false || value.is_visible === false
      || value.visible_to_player_now === false) return true;
  return ['state', 'status', 'access', 'accessibility', 'visibility']
    .some((key) => stateHasBooleanFalse(value[key], seen));
}

function collectStateValues(value, output, seen) {
  if (typeof value === 'string') {
    output.push(value.toLowerCase());
    return;
  }
  if (!plain(value) || seen.has(value)) return;
  seen.add(value);
  for (const key of ['state', 'status', 'access', 'accessibility', 'visibility']) {
    collectStateValues(value[key], output, seen);
  }
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
