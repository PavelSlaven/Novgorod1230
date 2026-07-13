import { array } from './shared.js';
export function buildNormalizedVisibilityConstraints(input) {
  const light = input?.historical_frame?.clock?.light_profile ?? 'obscured';
  const weather = input?.weather_state?.visibility_weather_modifier ?? 'unknown';
  let visibilityRange = ['dark','moonlit'].includes(light) ? 'near_only' : light === 'obscured' ? 'reduced' : 'ordinary';
  if (weather === 'reduced') visibilityRange = visibilityRange === 'ordinary' ? 'reduced' : 'near_only';
  if (weather === 'heavily_reduced') visibilityRange = 'near_only';
  if (weather === 'blocked') visibilityRange = 'blocked';
  const g5 = input?.g5_scene_graph ?? {};
  const anchors = array(g5.anchors ?? g5.scene_anchors ?? g5.g5_anchors);
  const visibleWithoutAction = [];
  const inspect = [];
  const hidden = [];
  for (const anchor of anchors) {
    const id = anchor.anchor_id ?? anchor.id;
    if (!id) continue;
    const state = anchor.visibility_state ?? anchor.visibility ?? null;
    if (state === 'hidden') hidden.push(id);
    else if (state === 'requires_inspection' || anchor.requires_inspection === true) inspect.push(id);
    else if (visibilityRange !== 'blocked') visibleWithoutAction.push(id);
  }
  return {
    light_profile:light, visibility_range:visibilityRange, visible_without_action:visibleWithoutAction,
    visible_only_on_inspection:inspect, audible_but_not_visible:[], hidden_until_action:hidden,
    forbidden_to_show_in_visible_scene:[...hidden], required_visible_scene_terms:[], preserve_clock:true,
    preserve_season:true, preserve_weather:true, preserve_light_profile:true,
    visible_context_must_follow_normalized_visibility_constraints:true,
    do_not_show_hidden_items:true, do_not_show_closed_container_contents:true
  };
}
