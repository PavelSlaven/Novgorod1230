export function projectTurnStepModelRequest(request) {
  const state = request?.player_safe_state;
  const visibleObjects = state?.current_visible_context?.visible_objects;
  const gapRows = Array.isArray(visibleObjects) ? visibleObjects.filter((row) =>
    row?.entity_ref?.entity_kind === 'item'
      && row.label_gap?.code === 'player_safe_item_label_required') : [];
  if (gapRows.length === 0) return { request, gapItemSecrets: [] };

  const aliases = new Set(gapRows.map((row) => row.entity_ref.entity_id)
    .filter((id) => typeof id === 'string'));
  for (const item of [...(Array.isArray(state.items) ? state.items : []),
    ...(Array.isArray(state.inventory?.items) ? state.inventory.items : [])]) {
    if (!item || typeof item !== 'object'
        || ![item.item_id, item.instance_id].some((id) => aliases.has(id))) continue;
    for (const id of [item.item_id, item.instance_id]) {
      if (typeof id === 'string') aliases.add(id);
    }
  }

  const preparedCandidates = request?.prepared_followup_candidates;
  const safePreparedCandidates = Array.isArray(preparedCandidates)
    ? preparedCandidates.filter((candidate) => !containsAny(candidate,
      [...aliases])) : preparedCandidates;

  const projected = structuredClone(request);
  const safeState = projected.player_safe_state;
  if (Array.isArray(projected.available_domain_operations)) {
    projected.available_domain_operations = projected.available_domain_operations
      .filter((operation) => !containsAny(operation, [...aliases]));
  }
  if (Array.isArray(safeState.available_domain_operations)) {
    safeState.available_domain_operations = safeState.available_domain_operations
      .filter((operation) => !containsAny(operation, [...aliases]));
  }
  if (Array.isArray(safeState.local_world_process?.allowed)) {
    safeState.local_world_process.allowed = safeState.local_world_process.allowed
      .filter((operation) => !containsAny(operation, [...aliases]));
  }
  safeState.current_visible_context.visible_objects = visibleObjects.filter((row) =>
    !(row?.entity_ref?.entity_kind === 'item'
      && row.label_gap?.code === 'player_safe_item_label_required'));
  safeState.items = filterGapItemRecords(safeState.items, aliases);
  if (Array.isArray(safeState.inventory?.items)) {
    safeState.inventory.items = filterGapItemRecords(safeState.inventory.items,
      aliases);
  }
  const authoredIntent = Object.fromEntries(['root_player_action',
    'remaining_intent'].filter((key) => typeof projected[key] === 'string')
    .map((key) => [key, projected[key]]));
  for (const key of Object.keys(authoredIntent)) delete projected[key];
  if (Array.isArray(safePreparedCandidates)) {
    projected.prepared_followup_candidates = safePreparedCandidates;
  }
  const safeRequest = redactGapItemData(projected, [...aliases]);
  return { request: { ...safeRequest,
    ...redactGapItemData(authoredIntent, [...aliases]) },
    gapItemSecrets: [...aliases] };
}

export function redactGapItemData(value, aliases, parentKey = null) {
  if (Array.isArray(value)) {
    const entries = parentKey === 'target_refs'
      ? value.filter((entry) => !aliases.includes(entry))
      : ['operations', 'available_domain_operations', 'allowed'].includes(parentKey)
        ? value.filter((entry) => !containsAny(entry, aliases)) : value;
    return entries.map((entry) => redactGapItemData(entry, aliases));
  }
  if (typeof value === 'string') return value;
  if (value == null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, entry]) => !isGapItemReference(key, entry, aliases)
      && !(['rejected_operation', 'operation', 'precursor_operation'].includes(key)
        && containsAny(entry, aliases)))
    .map(([key, entry]) => [key,
      redactGapItemData(entry, aliases, key)]));
}

export function containsAny(value, aliases, parentKey = null) {
  if (Array.isArray(value)) return value.some((entry) =>
    (parentKey === 'target_refs' && aliases.includes(entry))
      || containsAny(entry, aliases, parentKey));
  if (typeof value === 'string') return isGapItemReference(parentKey, value, aliases);
  if (value == null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) =>
    isGapItemReference(key, entry, aliases)
      || containsAny(entry, aliases, key));
}

export function untransmittedGapItemSecrets(request) {
  return projectTurnStepModelRequest(request).gapItemSecrets;
}

function isGapItemReference(key, value, aliases) {
  return typeof value === 'string' && aliases.includes(value)
    && ['entity_id', 'item_id', 'instance_id', 'item_ref', 'entity_ref',
      'target_ref', 'source_ref', 'prepared_followup_ref'].includes(key);
}

function filterGapItemRecords(items, aliases) {
  if (!Array.isArray(items)) return items;
  return items.filter((item) => {
    if (typeof item === 'string') return !aliases.has(item);
    return ![item?.item_id, item?.instance_id].some((id) => aliases.has(id));
  });
}
