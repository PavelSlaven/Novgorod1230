import { stable } from './spatial-v3-write-layout.js';

export function completeS1Topology(inserts, check, baseline, g6, position) {
  const g6Rows = inserts.filter((write) => write.target_table === 'party_g6_instances');
  const positionRows = inserts.filter((write) => write.target_table === 'scene_position_nodes');
  const slotG6 = g6Rows.find((write) => write.id !== check.g6_instance_id);
  const slotPosition = positionRows.find((write) => write.id !== check.position_id);
  const edges = inserts.filter((write) => write.target_table === 'scene_movement_edges');
  const links = inserts.filter((write) => write.target_table === 'visibility_links');
  if (!baseline || !g6 || !position || !slotG6 || !slotPosition) return false;
  const source = baseline.record?.scene_template_ref;
  return sameTemplate(source, g6?.record?.source_scene_template_ref)
    && sameTemplate(source, slotG6?.record?.source_scene_template_ref)
    && slotG6?.record?.scene_baseline_id === check.scene_baseline_id
    && slotPosition?.record?.g6_instance_id === slotG6.id
    && edges.every((edge) => edge.record?.scene_baseline_id === check.scene_baseline_id
      && sameTemplate(source, edge.record?.source_scene_template_ref))
    && links.every((link) => link.record?.scene_baseline_id === check.scene_baseline_id
      && sameTemplate(source, link.record?.source_scene_template_ref))
    && reciprocal(edges, 'reverse_edge_id', position.id, slotPosition?.id)
    && reciprocal(links, 'reverse_link_id', position.id, slotPosition?.id);
}

function reciprocal(rows, reverseKey, basePositionId, slotPositionId) {
  return rows.length === 2 && rows.every((row) => rows.some((other) => other.id === row.record?.[reverseKey]
    && other.record?.[reverseKey] === row.id && row.record?.from_position_id === other.record?.to_position_id
    && row.record?.to_position_id === other.record?.from_position_id))
    && rows.some((row) => row.record?.from_position_id === basePositionId
      && row.record?.to_position_id === slotPositionId)
    && rows.some((row) => row.record?.from_position_id === slotPositionId
      && row.record?.to_position_id === basePositionId);
}

function sameTemplate(left, right) {
  return validSceneTemplate(left) && validSceneTemplate(right)
    && left.authoring_version === right.authoring_version
    && left.entity_ref.entity_kind === right.entity_ref.entity_kind
    && left.entity_ref.entity_id === right.entity_ref.entity_id;
}

function validSceneTemplate(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'entity_ref') && Object.hasOwn(value, 'authoring_version')
    && value.authoring_version === '1' && value.entity_ref
    && typeof value.entity_ref === 'object' && !Array.isArray(value.entity_ref)
    && Object.keys(value.entity_ref).length === 2
    && Object.hasOwn(value.entity_ref, 'entity_kind')
    && Object.hasOwn(value.entity_ref, 'entity_id')
    && value.entity_ref.entity_kind === 'scene_template'
    && stable(value.entity_ref.entity_id);
}
