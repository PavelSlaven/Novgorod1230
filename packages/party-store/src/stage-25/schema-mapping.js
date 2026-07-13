export const PARTY_SCHEMA_ADAPTER_VERSION = 1;

const SPEC_READY_STATUS = 'ready';
const DDL_READY_STATUS = 'active';
const READY_PHASE = 'awaiting_player_input';

const SPEC_STATUS_TO_DDL_STATUS = Object.freeze({
  initializing: 'draft',
  formed: 'draft',
  ready: DDL_READY_STATUS,
  active: DDL_READY_STATUS,
  paused: 'paused',
  completed: 'completed',
  abandoned: 'abandoned',
  error: 'error',
  archived: 'archived'
});

export const PARTY_SPEC_TARGET_MAPPINGS = Object.freeze({
  party_state: {
    actualTargetTable: 'party_state',
    storage: 'columns_and_audit_state_jsonb'
  },
  party_clock: {
    actualTargetTable: 'party_state',
    storage: 'current_year/current_season/current_day_index/current_minute_of_day'
  },
  party_environment_state: {
    actualTargetTable: 'party_state',
    storage: 'audit_state.environment'
  },
  party_current_position: {
    actualTargetTable: 'party_current_position',
    storage: 'columns'
  },
  party_player_character: {
    actualTargetTable: 'party_player_characters',
    storage: 'columns_and_jsonb'
  },
  party_player_characters: {
    actualTargetTable: 'party_player_characters',
    storage: 'columns_and_jsonb'
  },
  party_character_body_state: {
    actualTargetTable: 'party_player_characters',
    storage: 'body_state'
  },
  party_character_attributes: {
    actualTargetTable: 'party_player_characters',
    storage: 'attributes'
  },
  party_character_skills: {
    actualTargetTable: 'party_player_characters',
    storage: 'skills'
  },
  party_character_memory: {
    actualTargetTable: 'party_player_characters',
    storage: 'memory_state'
  },
  party_character_inventory: {
    actualTargetTable: 'party_inventory_entries',
    storage: 'party_items_plus_party_inventory_entries'
  },
  party_inventory: {
    actualTargetTable: 'party_inventory_entries',
    storage: 'party_items_plus_party_inventory_entries'
  },
  party_property_and_access: {
    actualTargetTable: 'party_items',
    storage: 'ownership_state/access_state/current_state'
  },
  party_scene_minilocations: {
    actualTargetTable: 'party_minilocations',
    storage: 'columns_and_jsonb'
  },
  party_scene_anchors: {
    actualTargetTable: 'party_scene_anchors',
    storage: 'columns_and_jsonb'
  },
  party_scene_edges: {
    actualTargetTable: 'party_graph_edges',
    storage: 'scale_level=G5'
  },
  party_npcs: {
    actualTargetTable: 'party_npcs',
    storage: 'columns_and_jsonb'
  },
  party_npc_anchor_bindings: {
    actualTargetTable: 'party_npcs',
    storage: 'current_node/current_place/current_location/current_state.anchor_binding'
  },
  party_items: {
    actualTargetTable: 'party_items',
    storage: 'columns_and_jsonb'
  },
  party_containers: {
    actualTargetTable: 'party_items',
    storage: 'is_container=true; contents in current_state.contents_state'
  },
  party_item_anchor_bindings: {
    actualTargetTable: 'party_items',
    storage: 'place/location/minilocation/anchor columns and current_state.anchor_binding'
  },
  party_property_bindings: {
    actualTargetTable: 'party_items',
    storage: 'ownership_state/access_state/current_state.property_binding'
  },
  party_hidden_state: {
    actualTargetTable: 'party_state',
    storage: 'hidden_state'
  },
  party_hidden_npc_state: {
    actualTargetTable: 'party_npcs',
    storage: 'hidden_state'
  },
  party_hidden_item_state: {
    actualTargetTable: 'party_items',
    storage: 'hidden_state'
  },
  party_hidden_container_state: {
    actualTargetTable: 'party_items',
    storage: 'hidden_state; is_container=true'
  },
  party_character_knowledge_map: {
    actualTargetTable: 'party_map_knowledge',
    storage: 'columns'
  },
  party_character_known_routes: {
    actualTargetTable: 'party_map_knowledge',
    storage: 'knowledge_type=known_*'
  },
  party_visible_context: {
    actualTargetTable: 'party_state',
    storage: 'visible_summary plus party_llm_steps snapshot',
    playerVisible: true
  },
  party_visible_context_package: {
    actualTargetTable: 'party_state',
    storage: 'visible_summary plus party_llm_steps snapshot',
    playerVisible: true
  },
  party_narrator_output: {
    actualTargetTable: 'party_journal_entries',
    storage: 'entry_type=opening_narrator_output',
    playerVisible: true
  },
  party_player_visible_message: {
    actualTargetTable: 'party_journal_entries',
    storage: 'entry_type=player_visible_message',
    playerVisible: true
  },
  party_events: {
    actualTargetTable: 'party_events',
    storage: 'columns_and_jsonb'
  },
  party_audit_snapshots: {
    actualTargetTable: 'party_llm_steps',
    storage: 'structured_output plus party_validation_issues'
  },
  party_source_trace: {
    actualTargetTable: 'party_llm_steps',
    storage: 'structured_output.source_trace'
  }
});

const SPEC_ONLY_PARTY_STATE_FIELDS = [
  'campaign_id',
  'schema_version',
  'opening_request_id',
  'current_turn_number',
  'current_phase',
  'is_ready_for_player',
  'opening_scene_presented',
  'opening_scene_presented_at',
  'ready_at',
  'delivery_state',
  'first_screen'
];

const HIDDEN_PUBLIC_KEYS = [
  'hidden_state',
  'private_motives',
  'private_knowledge',
  'closed_container_contents',
  'future_event_timers',
  'truth_status_for_system',
  'actual_truth_hidden_from_character'
];

export function resolvePartySpecTarget(specTargetTable) {
  const key = String(specTargetTable ?? '').trim();
  const mapping = PARTY_SPEC_TARGET_MAPPINGS[key];
  if (!mapping) {
    throw new Error(`Unsupported party schema adapter target: ${key || '<empty>'}`);
  }
  return {
    specTargetTable: key,
    ...mapping
  };
}

export function mapSpecStatusToCurrentPartyDdl(status) {
  const key = String(status ?? '').trim();
  if (!key) return null;
  const mapped = SPEC_STATUS_TO_DDL_STATUS[key];
  if (!mapped) throw new Error(`Unsupported party_state.status for current DDL: ${key}`);
  return mapped;
}

export function mapSpecPartyStateRecordToCurrentDdl(record = {}) {
  const next = { ...record };
  const auditState = cloneJsonObject(record.audit_state);

  if (record.party_id && !record.id) next.id = record.party_id;
  if (record.world_base_region_id && !record.current_region_id) {
    next.current_region_id = record.world_base_region_id;
  }
  if (record.status) next.status = mapSpecStatusToCurrentPartyDdl(record.status);

  for (const field of SPEC_ONLY_PARTY_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      auditState[field] = record[field];
      delete next[field];
    }
  }

  next.audit_state = auditState;
  delete next.party_id;
  delete next.world_base_region_id;
  return next;
}

export function mapSpecClockRecordToPartyStatePatch(record = {}) {
  const next = {};
  const hour = Number(record.hour);
  const minute = Number(record.minute);

  if (record.party_id && !record.id) next.id = record.party_id;
  if (hasOwn(record, 'current_year') || hasOwn(record, 'year')) next.current_year = record.current_year ?? record.year;
  if (hasOwn(record, 'current_season') || hasOwn(record, 'season')) next.current_season = record.current_season ?? record.season;
  if (hasOwn(record, 'current_day_index') || hasOwn(record, 'day_index')) {
    next.current_day_index = record.current_day_index ?? record.day_index;
  }
  if (!Object.prototype.hasOwnProperty.call(next, 'current_day_index') && Number.isFinite(Number(record.day))) {
    next.current_day_index = Math.max(0, Number(record.day) - 1);
  }
  if (hasOwn(record, 'current_minute_of_day') || hasOwn(record, 'minute_of_day')) {
    next.current_minute_of_day = record.current_minute_of_day ?? record.minute_of_day;
  } else if (Number.isFinite(hour) && Number.isFinite(minute)) {
    next.current_minute_of_day = hour * 60 + minute;
  }

  return {
    ...next,
    audit_state: {
      clock: cloneJsonObject(record)
    }
  };
}

export function mapSpecRecordToCurrentPartyDdl(specTargetTable, record = {}) {
  switch (String(specTargetTable ?? '').trim()) {
    case 'party_state':
      return mapSpecPartyStateRecordToCurrentDdl(record);
    case 'party_clock':
      return mapSpecClockRecordToPartyStatePatch(record);
    case 'party_environment_state':
      return {
        ...(record.party_id && !record.id ? { id: record.party_id } : {}),
        audit_state: { environment: cloneJsonObject(record) }
      };
    default:
      return { ...record };
  }
}

export function adaptPartyWriteBatchTarget(batch = {}) {
  if (batch.adapter_target?.version === PARTY_SCHEMA_ADAPTER_VERSION && batch.spec_target_table) {
    return {
      ...batch,
      records: Array.isArray(batch.records) ? batch.records.map((record) => ({ ...record })) : []
    };
  }

  const target = resolvePartySpecTarget(batch.spec_target_table ?? batch.target_table);
  const records = Array.isArray(batch.records) ? batch.records : [];
  return {
    ...batch,
    spec_target_table: target.specTargetTable,
    target_table: target.actualTargetTable,
    adapter_target: {
      version: PARTY_SCHEMA_ADAPTER_VERSION,
      spec_target_table: target.specTargetTable,
      actual_target_table: target.actualTargetTable,
      storage: target.storage
    },
    records: records.map((record) => mapSpecRecordToCurrentPartyDdl(target.specTargetTable, record))
  };
}

export function adaptPartyWritePlanTargets(writePlan = {}) {
  return {
    ...writePlan,
    adapter_version: PARTY_SCHEMA_ADAPTER_VERSION,
    write_batches: Array.isArray(writePlan.write_batches)
      ? writePlan.write_batches.map(adaptPartyWriteBatchTarget)
      : []
  };
}

export function isCurrentDdlPartyReadyForPlayer(partyStateRow = {}) {
  const auditState = partyStateRow.audit_state && typeof partyStateRow.audit_state === 'object'
    ? partyStateRow.audit_state
    : {};
  return partyStateRow.status === DDL_READY_STATUS
    && auditState.is_ready_for_player === true
    && auditState.current_phase === READY_PHASE;
}

export function mapCurrentDdlPartyStateToSpec(partyStateRow = {}) {
  const auditState = partyStateRow.audit_state && typeof partyStateRow.audit_state === 'object'
    ? partyStateRow.audit_state
    : {};
  const ready = isCurrentDdlPartyReadyForPlayer(partyStateRow);
  return {
    status: ready ? SPEC_READY_STATUS : partyStateRow.status,
    is_ready_for_player: ready,
    current_phase: auditState.current_phase ?? null,
    current_turn_number: auditState.current_turn_number ?? 0,
    opening_scene_presented: auditState.opening_scene_presented === true,
    delivery_state: auditState.delivery_state ?? null
  };
}

export function buildPartyStartCommittedFromCurrentDdl({
  requestId,
  transactionId,
  partyState,
  currentPosition = null,
  narratorOutputId = null
} = {}) {
  return {
    version: 1,
    schema: 'party_start_committed',
    request_id: requestId ?? partyState?.audit_state?.opening_request_id ?? null,
    commit_status: 'committed',
    party_id: partyState?.id ?? null,
    transaction_id: transactionId ?? partyState?.audit_state?.transaction_id ?? null,
    party_state: mapCurrentDdlPartyStateToSpec(partyState),
    current_position: currentPosition ? {
      region_id: currentPosition.region_id ?? null,
      place_id: currentPosition.place_id ?? null,
      location_id: currentPosition.location_id ?? null,
      minilocation_id: currentPosition.minilocation_id ?? null,
      anchor_id: currentPosition.anchor_id ?? null,
      last_route_id: currentPosition.last_route_id ?? null
    } : null,
    player_output_ref: {
      narrator_output_id: narratorOutputId,
      player_visible_message_ready: Boolean(narratorOutputId),
      opening_scene_presented: partyState?.audit_state?.opening_scene_presented === true
    }
  };
}

export function validatePartyAdapterTargetSafety(writePlan = {}) {
  const concerns = [];
  const batches = Array.isArray(writePlan.write_batches) ? writePlan.write_batches : [];

  for (const batch of batches) {
    const targetTable = String(batch.spec_target_table ?? batch.target_table ?? '').trim();
    if (targetTable.startsWith('world_base.')) {
      concerns.push({
        code: 'PARTY_ADAPTER_WORLD_BASE_MUTATION',
        message: `party adapter cannot target ${targetTable}`
      });
      continue;
    }

    let mapping = null;
    try {
      mapping = resolvePartySpecTarget(targetTable);
    } catch (error) {
      concerns.push({
        code: 'PARTY_ADAPTER_UNKNOWN_TARGET',
        message: error.message
      });
      continue;
    }

    if (mapping.playerVisible && containsHiddenPublicKey(batch.records)) {
      concerns.push({
        code: 'PARTY_ADAPTER_HIDDEN_PUBLIC_LEAK',
        message: `${targetTable} maps to player-visible storage and contains hidden-state fields`
      });
    }
  }

  return {
    pass: concerns.length === 0,
    concerns
  };
}

function cloneJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return structuredClone(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function containsHiddenPublicKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsHiddenPublicKey);
  for (const [key, child] of Object.entries(value)) {
    if (HIDDEN_PUBLIC_KEYS.includes(key)) return true;
    if (containsHiddenPublicKey(child)) return true;
  }
  return false;
}
