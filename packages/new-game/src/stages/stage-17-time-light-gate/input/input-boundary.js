import { validateWeatherState } from '@rus/contracts/weather-state';
import { DEFAULT_STAGE17_TIME_LIGHT_POLICY, STAGE17_INPUT_SCHEMA, normalizeStage17TimeLightPolicy } from '../policy/constants.js';
import { isObject, issue, requireAudit, text } from '../../../time-light/shared.js';
export function emptyDraftVisibleContextPackage() { return { version:1, schema:'visible_context_package', visible_scene:null, visible_changes:[], visible_npcs:[], visible_items:[], visible_exits:[], visible_risks:[] }; }
export function buildStage17TimeLightInput(values = {}) {
  const explicit=isObject(values)?values:{};
  return {version:1,schema:STAGE17_INPUT_SCHEMA,request_id:explicit.request_id??null,historical_frame:explicit.historical_frame??null,weather_state:explicit.weather_state??null,selected_start_node:explicit.selected_start_node??null,player_character:explicit.player_character??null,g5_scene_graph:explicit.g5_scene_graph??null,g5_scene_audit:explicit.g5_scene_audit??null,initial_npc_placement:explicit.initial_npc_placement??null,npc_placement_audit:explicit.npc_placement_audit??null,initial_item_placement:explicit.initial_item_placement??null,item_placement_audit:explicit.item_placement_audit??null,draft_visible_context_package:explicit.draft_visible_context_package??emptyDraftVisibleContextPackage(),time_light_policy:normalizeStage17TimeLightPolicy(explicit.time_light_policy??explicit.policy??{})};
}
export function validateStage17TimeLightInput(input) {
  const concerns=[]; if(!isObject(input))return[issue('TIME_LIGHT_INPUT_INVALID','Stage 17 input must be an object.','root')];
  if(input.version!==1||input.schema!==STAGE17_INPUT_SCHEMA) concerns.push(issue('TIME_LIGHT_INPUT_SCHEMA_MISMATCH',`Expected ${STAGE17_INPUT_SCHEMA} version 1.`,'schema'));
  if(!text(input.request_id)) concerns.push(issue('TIME_LIGHT_INPUT_SCHEMA_MISMATCH','request_id is required.','request_id'));
  if(input.historical_frame?.schema!=='historical_frame') concerns.push(issue('TIME_LIGHT_HISTORICAL_FRAME_INVALID','historical_frame is required.','historical_frame'));
  concerns.push(...validateWeatherState(input.weather_state).map((x)=>({...x,code:x.code==='WEATHER_STATE_INVALID'?'TIME_LIGHT_WEATHER_STATE_MISSING':'TIME_LIGHT_WEATHER_STATE_INVALID'})));
  if(input.selected_start_node?.schema!=='selected_start_node') concerns.push(issue('TIME_LIGHT_SELECTED_START_NODE_INVALID','selected_start_node is required.','selected_start_node'));
  if(input.player_character?.schema!=='player_character_game_profile') concerns.push(issue('TIME_LIGHT_PLAYER_CHARACTER_INVALID','player_character is required.','player_character'));
  requireAudit(concerns,input.g5_scene_audit,'g5_scene_audit','g5_scene_audit','TIME_LIGHT_G5_AUDIT_FAILED'); requireAudit(concerns,input.npc_placement_audit,'initial_npc_placement_audit','npc_placement_audit','TIME_LIGHT_NPC_AUDIT_FAILED'); requireAudit(concerns,input.item_placement_audit,'initial_item_placement_audit','item_placement_audit','TIME_LIGHT_ITEM_AUDIT_FAILED');
  if(input.g5_scene_graph?.schema!=='g5_scene_graph_draft') concerns.push(issue('TIME_LIGHT_G5_SCENE_INVALID','g5_scene_graph is required.','g5_scene_graph'));
  if(input.initial_npc_placement?.schema!=='initial_npc_placement_draft') concerns.push(issue('TIME_LIGHT_NPC_PLACEMENT_INVALID','initial_npc_placement is required.','initial_npc_placement'));
  if(!['placed','empty_allowed'].includes(input.initial_npc_placement?.placement_status)) concerns.push(issue('TIME_LIGHT_NPC_PLACEMENT_INVALID','NPC placement must be placed or empty_allowed.','initial_npc_placement.placement_status'));
  if(input.initial_item_placement?.schema!=='initial_item_placement_draft') concerns.push(issue('TIME_LIGHT_ITEM_PLACEMENT_INVALID','initial_item_placement is required.','initial_item_placement'));
  if(!['placed','empty_allowed'].includes(input.initial_item_placement?.placement_status)) concerns.push(issue('TIME_LIGHT_ITEM_PLACEMENT_INVALID','Item placement must be placed or empty_allowed.','initial_item_placement.placement_status'));
  const draft=input.draft_visible_context_package;if(draft?.schema!=='visible_context_package'||draft?.version!==1) concerns.push(issue('TIME_LIGHT_VISIBLE_DRAFT_INVALID','draft_visible_context_package must be visible_context_package version 1.','draft_visible_context_package'));
  for(const key of ['visible_changes','visible_npcs','visible_items','visible_exits','visible_risks']) if(!Array.isArray(draft?.[key])) concerns.push(issue('TIME_LIGHT_VISIBLE_DRAFT_INVALID',`${key} must be an array.`,`draft_visible_context_package.${key}`));
  for(const [key,value] of Object.entries(DEFAULT_STAGE17_TIME_LIGHT_POLICY)) if(input.time_light_policy?.[key]!==value&&typeof value==='boolean') concerns.push(issue('TIME_LIGHT_POLICY_INCOMPLETE',`${key} must be ${value}.`,`time_light_policy.${key}`,value,input.time_light_policy?.[key])); return concerns;
}
