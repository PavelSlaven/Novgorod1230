import { STAGE17_INPUT_SCHEMA, STAGE17_PRECHECK_SCHEMA, STAGE17_AUDIT_SCHEMA, STAGE17_ROUTE_SCHEMA, STAGE17_ALLOWED_ROUTES } from '@rus/contracts/time-knowledge-hidden-boundary';
import { isObject } from '../../../time-light/shared.js';
export { STAGE17_INPUT_SCHEMA, STAGE17_PRECHECK_SCHEMA, STAGE17_AUDIT_SCHEMA, STAGE17_ROUTE_SCHEMA };
export const STAGE17_ROUTES = new Set(STAGE17_ALLOWED_ROUTES);
export const DEFAULT_STAGE17_TIME_LIGHT_POLICY = Object.freeze({
  require_clock_source_of_truth:true, require_season_source_of_truth:true, require_weather_source_of_truth:true, require_light_source_of_truth:true,
  reject_daylight_terms_at_night:true, reject_night_terms_at_day:true, reject_visible_scene_time_override:true, reject_weather_season_conflict:true,
  reject_visibility_light_conflict:true, reject_npc_activity_time_conflict:true, reject_item_visibility_light_conflict:true, require_body_effects_for_extreme_weather:true,
  require_evidence:true, do_not_repair_by_changing_clock:true, do_not_change_season:true, do_not_change_weather_state:true, do_not_change_g5_scene:true,
  do_not_change_npc_placement:true, do_not_change_item_placement:true, do_not_write_visible_scene:true, do_not_write_narrator_prose:true
});
export const STAGE17_FORMAT_CODES = new Set(['TIME_LIGHT_AUDIT_INVALID_JSON','TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','TIME_LIGHT_AUDIT_REQUIRED_BLOCK_MISSING']);
export function normalizeStage17TimeLightPolicy(policy = {}) { return Object.freeze({ ...DEFAULT_STAGE17_TIME_LIGHT_POLICY, ...(isObject(policy) ? policy : {}) }); }
