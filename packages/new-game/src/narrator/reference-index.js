import { array, safeClone, sorted, text, walk } from '../stages/stage-22-narrator-prose/shared/utils.js';

export function buildStage22ReferenceIndex(input) {
  const pkg = input?.visible_context_package ?? {};
  const anchors = new Set(array(pkg.visible_anchors).map((item) => item?.anchor_id).filter(text));
  const exits = new Set(array(pkg.visible_exits).flatMap((item) => [item?.g5_edge_id, item?.edge_id, item?.route_id, item?.from_anchor_id, item?.to_anchor_id]).filter(text));
  const npcs = new Set(array(pkg.visible_npcs).map((item) => item?.npc_instance_id).filter(text));
  const items = new Set(array(pkg.visible_items).map((item) => item?.item_instance_id).filter(text));
  const containers = new Set(array(pkg.visible_containers).map((item) => item?.container_instance_id).filter(text));
  const actions = new Map();
  for (const action of array(pkg.available_actions_context)) if (text(action?.action_id)) actions.set(action.action_id, safeClone(action));
  const allVisibleRefs = new Set([...anchors, ...exits, ...npcs, ...items, ...containers, ...actions.keys()]);
  walk(pkg, (key, value) => {
    if ((key === 'visible_fact_id' || key === 'context_id' || key === 'source_id' || key === 'requirement_id') && text(value)) allVisibleRefs.add(value);
  });
  return {
    anchors, exits, npcs, items, containers, actions, allVisibleRefs,
    summary: {
      anchor_ids: sorted(anchors), exit_ids: sorted(exits), npc_ids: sorted(npcs), item_ids: sorted(items), container_ids: sorted(containers), action_ids: sorted(new Set(actions.keys()))
    }
  };
}
