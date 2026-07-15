import { sha256 } from '@rus/kernel';

export const PARTY_SCHEMA_ADAPTER_VERSION = 2;

const SPEC_READY_STATUS = 'ready';
const DDL_READY_STATUS = 'active';
const READY_PHASE = 'awaiting_player_input';
const PARTY_RUNTIME_V2_TARGETS = new Set([
  'parties', 'party_state_snapshots', 'party_positions', 'party_player_characters', 'party_character_knowledge', 'party_materialization_runs',
  'party_materialization_choices', 'party_g5_nodes', 'party_g5_edges', 'party_g5_anchors', 'party_npcs', 'party_npc_traits',
  'party_npc_relations', 'party_npc_knowledge', 'party_npc_schedules', 'party_containers', 'party_items', 'party_item_placements',
  'party_ownership', 'party_decision_requests', 'party_decision_options', 'party_decision_results', 'party_change_sets',
  'party_autonomous_updates', 'party_visible_read_models'
]);

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
    actualTargetTable: 'parties',
    storage: 'normalized_version_pins_and_lifecycle'
  },
  party_clock: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.clock'
  },
  party_environment_state: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.environment'
  },
  party_current_position: {
    actualTargetTable: 'party_positions',
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
    actualTargetTable: 'party_item_placements',
    storage: 'normalized_exactly_one_holder_reference_and_physical_position'
  },
  party_inventory: {
    actualTargetTable: 'party_item_placements',
    storage: 'normalized_exactly_one_holder_reference_and_physical_position'
  },
  party_property_and_access: {
    actualTargetTable: 'party_ownership',
    storage: 'normalized_ownership_and_control'
  },
  party_scene_minilocations: {
    actualTargetTable: 'party_g5_nodes',
    storage: 'columns_and_jsonb'
  },
  party_scene_anchors: {
    actualTargetTable: 'party_g5_anchors',
    storage: 'columns_and_jsonb'
  },
  party_scene_edges: {
    actualTargetTable: 'party_g5_edges',
    storage: 'normalized_g5_edge'
  },
  party_npcs: {
    actualTargetTable: 'party_npcs',
    storage: 'columns_and_jsonb'
  },
  party_npc_anchor_bindings: {
    actualTargetTable: 'party_npcs',
    storage: 'anchor_id'
  },
  party_items: {
    actualTargetTable: 'party_items',
    storage: 'columns_and_jsonb'
  },
  party_containers: {
    actualTargetTable: 'party_containers',
    storage: 'normalized_container_state'
  },
  party_item_anchor_bindings: {
    actualTargetTable: 'party_item_placements',
    storage: 'exactly_one_holder_reference'
  },
  party_property_bindings: {
    actualTargetTable: 'party_ownership',
    storage: 'normalized_owner_controller_claim'
  },
  party_hidden_state: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.hidden_state'
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
    actualTargetTable: 'party_character_knowledge',
    storage: 'columns'
  },
  party_character_known_routes: {
    actualTargetTable: 'party_character_knowledge',
    storage: 'normalized_fact_knowledge_state'
  },
  party_visible_context: {
    actualTargetTable: 'party_visible_read_models',
    storage: 'versioned_viewer_payload',
    playerVisible: true
  },
  party_visible_context_package: {
    actualTargetTable: 'party_visible_read_models',
    storage: 'versioned_viewer_payload',
    playerVisible: true
  },
  party_narrator_output: {
    actualTargetTable: 'party_visible_read_models',
    storage: 'versioned_viewer_payload.narrator_output',
    playerVisible: true
  },
  party_player_visible_message: {
    actualTargetTable: 'party_visible_read_models',
    storage: 'versioned_viewer_payload.player_message',
    playerVisible: true
  },
  party_events: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.events'
  },
  party_audit_snapshots: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.audit_snapshots'
  },
  party_source_trace: {
    actualTargetTable: 'party_state_snapshots',
    storage: 'versioned_state_payload.source_trace'
  },
  ...Object.fromEntries([
    'parties', 'party_state_snapshots', 'party_positions', 'party_player_characters', 'party_character_knowledge',
    'party_materialization_runs', 'party_materialization_choices', 'party_g5_nodes', 'party_g5_edges', 'party_g5_anchors',
    'party_npcs', 'party_npc_traits', 'party_npc_relations', 'party_npc_knowledge', 'party_npc_schedules', 'party_containers',
    'party_items', 'party_item_placements', 'party_ownership', 'party_decision_requests', 'party_decision_options',
    'party_decision_results', 'party_change_sets', 'party_autonomous_updates', 'party_visible_read_models'
  ].map((table) => [table, { actualTargetTable: table, storage: 'party_runtime_v2' }]))
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
  return {
    party_id: record.party_id ?? record.id,
    schema_version: 2,
    world_revision_id: record.world_revision_id,
    world_catalog_digest: record.world_catalog_digest,
    materializer_version: record.materializer_version,
    rng_version: record.rng_version,
    command_catalog_digest: record.command_catalog_digest,
    profile_bundle_digest: record.profile_bundle_digest,
    state_version: record.state_version ?? 0,
    status: ['ready', 'formed', 'active'].includes(record.status) ? 'active' : record.status ?? 'creating'
  };
}

export function mapSpecClockRecordToPartyStatePatch(record = {}) {
  const statePayload = { clock: cloneJsonObject(record) };
  return { party_id: record.party_id, state_version: record.state_version ?? 0, state_payload: statePayload, state_digest: digestJson(statePayload) };
}

export function mapSpecRecordToCurrentPartyDdl(specTargetTable, record = {}) {
  switch (String(specTargetTable ?? '').trim()) {
    case 'party_state':
      return mapSpecPartyStateRecordToCurrentDdl(record);
    case 'party_clock':
      return mapSpecClockRecordToPartyStatePatch(record);
    case 'party_environment_state':
      return snapshotRecord(record, 'environment');
    case 'party_hidden_state':
    case 'party_events':
    case 'party_audit_snapshots':
    case 'party_source_trace':
      return snapshotRecord(record, specTargetTable);
    case 'party_current_position':
      return { party_id: record.party_id, g4_id: record.g4_id ?? record.location_id, g5_node_id: record.g5_node_id ?? record.minilocation_id ?? null, g5_anchor_id: record.g5_anchor_id ?? record.anchor_id ?? null };
    case 'party_scene_minilocations':
      return { party_id: record.party_id, g5_node_id: record.g5_node_id ?? record.g5_minilocation_id ?? record.minilocation_id, run_id: record.run_id, parent_g4_id: record.parent_g4_id ?? record.parent_g4_node_id, template_id: record.template_id, slot_key: record.slot_key ?? 'default', state: record.state ?? {} };
    case 'party_scene_anchors':
      return { party_id: record.party_id, anchor_id: record.anchor_id, g5_node_id: record.g5_node_id ?? record.minilocation_id, template_id: record.template_id, slot_key: record.slot_key ?? record.anchor_type ?? 'default', npc_capacity: record.npc_capacity ?? record.supports?.npc_capacity ?? 0, item_capacity: record.item_capacity ?? record.supports?.item_capacity ?? 0, container_capacity: record.container_capacity ?? record.supports?.container_capacity ?? 0, state: record.state ?? {} };
    case 'party_scene_edges':
      return { party_id: record.party_id, g5_edge_id: record.g5_edge_id ?? record.edge_id, from_anchor_id: record.from_anchor_id, to_anchor_id: record.to_anchor_id, template_id: record.template_id, state: record.state ?? {} };
    default:
      return { ...record };
  }
}

export function adaptPartyWriteBatchTarget(batch = {}) {
  const target = resolvePartySpecTarget(batch.spec_target_table ?? batch.target_table);
  const records = Array.isArray(batch.records) ? batch.records : [];
  return {
    ...batch,
    spec_target_table: target.specTargetTable,
    target_table: target.actualTargetTable,
    target_schema: 'party_runtime',
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
    if (!PARTY_RUNTIME_V2_TARGETS.has(mapping.actualTargetTable)) concerns.push({ code: 'PARTY_ADAPTER_LEGACY_TARGET', message: `${targetTable} maps outside party_runtime_v2` });
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

function snapshotRecord(record, key) {
  const statePayload = { [key]: cloneJsonObject(record) };
  return { party_id: record.party_id, state_version: record.state_version ?? 0, state_payload: statePayload, state_digest: digestJson(statePayload) };
}

function digestJson(value) {
  return sha256(value);
}
