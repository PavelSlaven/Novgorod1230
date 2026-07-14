import { STAGE18_AUDIT_SCHEMA } from '../policy/constants.js';
import { buildStage18ReferenceIndex } from '../references/reference-index.js';
import { array, isObject, issue } from '../shared/utils.js';
export function buildCharacterKnowledgeAuditInput(input, output, precheck, refs = buildStage18ReferenceIndex(input)) {
  return {
    version: 1,
    schema: 'character_knowledge_map_audit_input',
    request_id: input.request_id,
    historical_frame: structuredClone(input.historical_frame),
    weather_state: structuredClone(input.weather_state),
    current_position: structuredClone(input.current_position),
    selected_start_node: structuredClone(input.selected_start_node),
    player_character: structuredClone(input.player_character),
    g5_scene_graph: structuredClone(input.g5_scene_graph),
    initial_npc_placement: structuredClone(input.initial_npc_placement),
    initial_item_placement: structuredClone(input.initial_item_placement),
    regional_context_package: structuredClone(input.regional_context_package),
    world_base_route_snapshot: structuredClone(input.world_base_route_snapshot),
    character_knowledge_map: structuredClone(output),
    character_knowledge_map_code_precheck: structuredClone(precheck),
    reference_index_summary: referenceSummary(refs),
    audit_policy: {
      reject_unbased_knowledge: true,
      reject_hidden_state_knowledge: true,
      reject_future_knowledge: true,
      reject_full_map: true,
      reject_new_world_entities: true,
      reject_visible_scene: true,
      require_source_trace: true
    }
  };
}

export function validateCharacterKnowledgeAudit(audit, output, precheck) {
  const concerns = [];
  if (!isObject(audit)) return [issue('KNOWLEDGE_MAP_AUDIT_INVALID_JSON', 'character_knowledge_map_audit must be an object.', 'audit')];
  if (audit.version !== 1 || audit.schema !== STAGE18_AUDIT_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE18_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  }
  if (audit.request_id != null && audit.request_id !== output?.request_id) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', 'Audit request_id must match output.', 'audit.request_id'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.pass must be boolean.', 'audit.pass'));
  if (!Array.isArray(audit.concerns)) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence)) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.evidence must be an array.', 'audit.evidence'));
  if (audit.pass === false && (array(audit.concerns).length === 0 || array(audit.evidence).length === 0)) {
    concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'Failed audit requires concerns and evidence.', 'audit'));
  }
  if (audit.pass === true && precheck?.pass !== true) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', 'Audit cannot pass when code precheck failed.', 'audit.pass'));
  return concerns;
}
export function withAuditPermissions(audit) {
  const pass = audit?.pass === true;
  return {
    ...structuredClone(audit),
    request_id: audit?.request_id ?? null,
    commit_permission: {
      can_commit_character_knowledge: pass,
      can_continue_to_hidden_state: pass
    }
  };
}

export function referenceSummary(refs) {
  return {
    graph_edge_count: refs.graphEdgeIds.size,
    g5_edge_count: refs.g5EdgeIds.size,
    place_count: refs.placeIds.size + refs.nodeIds.size,
    npc_count: refs.npcIds.size,
    item_count: refs.itemIds.size,
    container_count: refs.containerIds.size,
    anchor_count: refs.anchorIds.size
  };
}

