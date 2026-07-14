import { STAGE18_WRITE_PLAN_SCHEMA, KNOWN_ARRAYS } from '../policy/constants.js';
import { array, hashJson, isObject, issue, text } from '../shared/utils.js';
export function buildCharacterKnowledgeWriteProjection(output, precheck, audit, repairHistory = []) {
  const normalizedGroups = Object.fromEntries([
    ...KNOWN_ARRAYS,
    'rumors', 'mistaken_beliefs', 'uncertain_knowledge', 'forbidden_knowledge', 'knowledge_gaps'
  ].map((key) => [key, structuredClone(array(output?.[key]))]));
  normalizedGroups.player_vs_character_knowledge_boundary = structuredClone(output?.player_vs_character_knowledge_boundary ?? {});
  const sourceContentHash = hashJson(output);
  const expectedCounts = Object.fromEntries(Object.entries(normalizedGroups).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1]));
  return {
    version: 1,
    schema: STAGE18_WRITE_PLAN_SCHEMA,
    request_id: output?.request_id ?? null,
    knowledge_map_id: output?.knowledge_map_id ?? `knowledge_map:${output?.request_id ?? sourceContentHash.slice(0, 12)}`,
    root_record: {
      player_character_id: output?.character_ref?.player_character_id ?? null,
      knowledge_status: output?.knowledge_status ?? null,
      knowledge_scope_summary: structuredClone(output?.knowledge_scope_summary ?? {}),
      current_position_ref: structuredClone(output?.current_position_ref ?? {}),
      status: 'pending',
      is_current: false
    },
    normalized_groups: normalizedGroups,
    snapshot_payload: {
      character_knowledge_map: structuredClone(output),
      code_precheck: structuredClone(precheck),
      audit: structuredClone(audit),
      repair_history: structuredClone(repairHistory)
    },
    projection_manifest: {
      source_content_hash: sourceContentHash,
      expected_counts: expectedCounts,
      expected_record_keys: Object.keys(normalizedGroups),
      group_hashes: Object.fromEntries(Object.entries(normalizedGroups).map(([key, value]) => [key, hashJson(value)])),
      requires_snapshot: true,
      requires_root_record: true,
      requires_current_switch_after_validation: true
    }
  };
}

export function validateCharacterKnowledgeWriteProjection(projection, output) {
  const concerns = [];
  if (!isObject(projection) || projection.version !== 1 || projection.schema !== STAGE18_WRITE_PLAN_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_WRITE_PROJECTION_INVALID', `Expected ${STAGE18_WRITE_PLAN_SCHEMA} version 1.`, 'write_projection'));
    return concerns;
  }
  if (!text(projection.projection_manifest?.source_content_hash)) concerns.push(issue('KNOWLEDGE_MAP_PROJECTION_HASH_MISSING', 'source_content_hash is required.', 'write_projection.projection_manifest.source_content_hash'));
  if (projection.projection_manifest?.source_content_hash !== hashJson(output)) concerns.push(issue('KNOWLEDGE_MAP_PROJECTION_HASH_MISSING', 'source_content_hash does not match character_knowledge_map.', 'write_projection.projection_manifest.source_content_hash'));
  if (!isObject(projection.normalized_groups) || !Array.isArray(projection.normalized_groups.known_nearby_paths)) concerns.push(issue('KNOWLEDGE_MAP_NEARBY_PATH_MAPPING_INVALID', 'known_nearby_paths must remain a separate semantic group.', 'write_projection.normalized_groups.known_nearby_paths'));
  return concerns;
}
