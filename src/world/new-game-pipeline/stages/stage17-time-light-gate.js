import { validateWeatherState } from '../retrievers/weather-state.js';

export const STAGE17_INPUT_SCHEMA = 'time_light_consistency_input';
export const STAGE17_PRECHECK_SCHEMA = 'time_light_code_precheck';
export const STAGE17_AUDIT_SCHEMA = 'time_light_consistency_audit';
export const STAGE17_ROUTE_SCHEMA = 'time_light_audit_route';

const TIME_OF_DAY = new Set(['dawn','morning','day','afternoon','evening','dusk','night','deep_night']);
const LIGHT = new Set(['dark','dim','daylight','twilight','indoor_lit','firelit','moonlit','obscured']);
const SEASONS = new Set(['spring','summer','autumn','winter']);
const ALLOWED_LIGHT = Object.freeze({
  deep_night:new Set(['dark','moonlit','firelit','indoor_lit','obscured']),
  night:new Set(['dark','moonlit','firelit','indoor_lit','obscured']),
  dawn:new Set(['dim','twilight','obscured']),
  morning:new Set(['daylight','dim','obscured']),
  day:new Set(['daylight','dim','obscured']),
  afternoon:new Set(['daylight','dim','obscured']),
  evening:new Set(['daylight','dim','twilight','obscured']),
  dusk:new Set(['twilight','dim','dark','obscured'])
});

export const DEFAULT_STAGE17_TIME_LIGHT_POLICY = Object.freeze({
  require_clock_source_of_truth:true,
  require_season_source_of_truth:true,
  require_weather_source_of_truth:true,
  require_light_source_of_truth:true,
  reject_daylight_terms_at_night:true,
  reject_night_terms_at_day:true,
  reject_visible_scene_time_override:true,
  reject_weather_season_conflict:true,
  reject_visibility_light_conflict:true,
  reject_npc_activity_time_conflict:true,
  reject_item_visibility_light_conflict:true,
  require_body_effects_for_extreme_weather:true,
  require_evidence:true,
  do_not_repair_by_changing_clock:true,
  do_not_change_season:true,
  do_not_change_weather_state:true,
  do_not_change_g5_scene:true,
  do_not_change_npc_placement:true,
  do_not_change_item_placement:true,
  do_not_write_visible_scene:true,
  do_not_write_narrator_prose:true
});

const NIGHT_DAY_TERMS = [
  /коротк[^ \t\r\n]*\s+светов[^ \t\r\n]*\s+дн/i,/ярк[^ \t\r\n]*\s+дневн[^ \t\r\n]*\s+свет/i,/на\\s+дворе\\s+день/i,
  /дневн[^ \t\r\n]*\s+толп/i,/открыт[^ \t\r\n]*\s+торг/i,/обычн[^ \t\r\n]*\s+дневн[^ \t\r\n]*\s+работ/i,/солнц[^ \t\r\n]*\s+высок/i,
  /daylight/i,/bright\s+day/i,/midday/i,/daytime\s+crowd/i
];
const DAY_NIGHT_TERMS = [/глубок[^ \t\r\n]*\s+ноч/i,/полная\\s+темнот/i,/трет[^ \t\r\n]*\s+час[^ \t\r\n]*\s+ноч/i,/deep\s+night/i,/pitch\s+dark/i];
const DAY_ACTIVITY_TERMS = [/дневн[^ \t\r\n]*\s+работ/i,/дневн[^ \t\r\n]*\s+толп/i,/открыт[^ \t\r\n]*\s+торг/i,/daytime\s+work/i,/daytime\s+crowd/i];
const DARK_LIGHTS = new Set(['dark','moonlit','obscured']);
const CLOSED = new Set(['closed','locked','sealed','hidden','inaccessible']);
const HIDDEN = new Set(['hidden','known_but_not_seen','inaccessible']);
const FORMAT_CODES = new Set(['TIME_LIGHT_AUDIT_INVALID_JSON','TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','TIME_LIGHT_AUDIT_REQUIRED_BLOCK_MISSING']);
const ROUTES = new Set(['visible_context_format_repair','visible_context_semantic_repair','item_placement_semantic_repair','npc_placement_semantic_repair','g5_scene_semantic_repair','weather_state_retriever','historical_frame_selector','player_character_semantic_repair','blocked']);

export function normalizeStage17TimeLightPolicy(policy = {}) {
  return Object.freeze({ ...DEFAULT_STAGE17_TIME_LIGHT_POLICY, ...(isObject(policy) ? policy : {}) });
}

export function emptyDraftVisibleContextPackage() {
  return { version:1, schema:'visible_context_package', visible_scene:null, visible_changes:[], visible_npcs:[], visible_items:[], visible_exits:[], visible_risks:[] };
}

export function buildStage17TimeLightInput(values = {}) {
  const explicit = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE17_INPUT_SCHEMA,
    request_id: explicit.request_id ?? null,
    historical_frame: explicit.historical_frame ?? null,
    weather_state: explicit.weather_state ?? null,
    selected_start_node: explicit.selected_start_node ?? null,
    player_character: explicit.player_character ?? null,
    g5_scene_graph: explicit.g5_scene_graph ?? null,
    g5_scene_audit: explicit.g5_scene_audit ?? null,
    initial_npc_placement: explicit.initial_npc_placement ?? null,
    npc_placement_audit: explicit.npc_placement_audit ?? null,
    initial_item_placement: explicit.initial_item_placement ?? null,
    item_placement_audit: explicit.item_placement_audit ?? null,
    draft_visible_context_package: explicit.draft_visible_context_package ?? emptyDraftVisibleContextPackage(),
    time_light_policy: normalizeStage17TimeLightPolicy(explicit.time_light_policy ?? explicit.policy ?? {})
  };
}

export function validateStage17TimeLightInput(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('TIME_LIGHT_INPUT_INVALID','Stage 17 input must be an object.','root')];
  if (input.version !== 1 || input.schema !== STAGE17_INPUT_SCHEMA) concerns.push(issue('TIME_LIGHT_INPUT_SCHEMA_MISMATCH',`Expected ${STAGE17_INPUT_SCHEMA} version 1.`,'schema'));
  if (!text(input.request_id)) concerns.push(issue('TIME_LIGHT_INPUT_SCHEMA_MISMATCH','request_id is required.','request_id'));
  if (input.historical_frame?.schema !== 'historical_frame') concerns.push(issue('TIME_LIGHT_HISTORICAL_FRAME_INVALID','historical_frame is required.','historical_frame'));
  concerns.push(...validateWeatherState(input.weather_state).map((x)=>({...x, code:x.code === 'WEATHER_STATE_INVALID' ? 'TIME_LIGHT_WEATHER_STATE_MISSING' : 'TIME_LIGHT_WEATHER_STATE_INVALID'})));
  if (input.selected_start_node?.schema !== 'selected_start_node') concerns.push(issue('TIME_LIGHT_SELECTED_START_NODE_INVALID','selected_start_node is required.','selected_start_node'));
  if (input.player_character?.schema !== 'player_character_game_profile') concerns.push(issue('TIME_LIGHT_PLAYER_CHARACTER_INVALID','player_character is required.','player_character'));
  requireAudit(concerns,input.g5_scene_audit,'g5_scene_audit','g5_scene_audit','TIME_LIGHT_G5_AUDIT_FAILED');
  requireAudit(concerns,input.npc_placement_audit,'initial_npc_placement_audit','npc_placement_audit','TIME_LIGHT_NPC_AUDIT_FAILED');
  requireAudit(concerns,input.item_placement_audit,'initial_item_placement_audit','item_placement_audit','TIME_LIGHT_ITEM_AUDIT_FAILED');
  if (input.g5_scene_graph?.schema !== 'g5_scene_graph_draft') concerns.push(issue('TIME_LIGHT_G5_SCENE_INVALID','g5_scene_graph is required.','g5_scene_graph'));
  if (input.initial_npc_placement?.schema !== 'initial_npc_placement_draft') concerns.push(issue('TIME_LIGHT_NPC_PLACEMENT_INVALID','initial_npc_placement is required.','initial_npc_placement'));
  if (!['placed','empty_allowed'].includes(input.initial_npc_placement?.placement_status)) concerns.push(issue('TIME_LIGHT_NPC_PLACEMENT_INVALID','NPC placement must be placed or empty_allowed.','initial_npc_placement.placement_status'));
  if (input.initial_item_placement?.schema !== 'initial_item_placement_draft') concerns.push(issue('TIME_LIGHT_ITEM_PLACEMENT_INVALID','initial_item_placement is required.','initial_item_placement'));
  if (!['placed','empty_allowed'].includes(input.initial_item_placement?.placement_status)) concerns.push(issue('TIME_LIGHT_ITEM_PLACEMENT_INVALID','Item placement must be placed or empty_allowed.','initial_item_placement.placement_status'));
  const draft = input.draft_visible_context_package;
  if (draft?.schema !== 'visible_context_package' || draft?.version !== 1) concerns.push(issue('TIME_LIGHT_VISIBLE_DRAFT_INVALID','draft_visible_context_package must be visible_context_package version 1.','draft_visible_context_package'));
  for (const key of ['visible_changes','visible_npcs','visible_items','visible_exits','visible_risks']) if (!Array.isArray(draft?.[key])) concerns.push(issue('TIME_LIGHT_VISIBLE_DRAFT_INVALID',`${key} must be an array.`,`draft_visible_context_package.${key}`));
  for (const [key, value] of Object.entries(DEFAULT_STAGE17_TIME_LIGHT_POLICY)) if (input.time_light_policy?.[key] !== value && typeof value === 'boolean') concerns.push(issue('TIME_LIGHT_POLICY_INCOMPLETE',`${key} must be ${value}.`,`time_light_policy.${key}`,value,input.time_light_policy?.[key]));
  return concerns;
}

export function buildStage17TimeLightCodePrecheck(input) {
  const concerns = validateStage17TimeLightInput(input);
  if (concerns.length === 0) {
    checkClock(input, concerns);
    checkSeasonWeather(input, concerns);
    checkG5Visibility(input, concerns);
    checkNpcVisibility(input, concerns);
    checkItemVisibility(input, concerns);
    checkBodyWeather(input, concerns);
    checkDraftVisible(input, concerns);
  }
  const normalized = buildNormalizedVisibilityConstraints(input);
  return {
    version:1,
    schema:STAGE17_PRECHECK_SCHEMA,
    request_id:input?.request_id ?? null,
    pass:concerns.every((x)=>x.severity === 'warning'),
    checks:{
      clock_schema_valid:!hasCode(concerns,'TIME_LIGHT_CLOCK_SCHEMA_INVALID'),
      clock_moment_valid:!hasPrefix(concerns,'TIME_LIGHT_CLOCK_MOMENT'),
      season_weather_basic_match:!hasPrefix(concerns,'TIME_LIGHT_SEASON_WEATHER'),
      light_profile_valid:!hasPrefix(concerns,'TIME_LIGHT_TIME_OF_DAY_LIGHT'),
      g5_visibility_basic_match:!hasPrefix(concerns,'TIME_LIGHT_G5_VISIBILITY'),
      npc_visibility_basic_match:!hasPrefix(concerns,'TIME_LIGHT_NPC_'),
      item_visibility_basic_match:!hasPrefix(concerns,'TIME_LIGHT_ITEM_'),
      body_weather_match:!hasCode(concerns,'TIME_LIGHT_BODY_WEATHER_CONFLICT'),
      visible_scene_forbidden_terms_absent:!hasCode(concerns,'TIME_LIGHT_VISIBLE_SCENE_CLOCK_CONFLICT'),
      visible_changes_forbidden_terms_absent:!hasCode(concerns,'TIME_LIGHT_VISIBLE_CHANGES_CLOCK_CONFLICT'),
      no_hidden_items_revealed:!hasCode(concerns,'TIME_LIGHT_HIDDEN_ITEM_VISIBLE'),
      no_closed_container_contents_visible:!hasCode(concerns,'TIME_LIGHT_CLOSED_CONTAINER_CONTENT_VISIBLE'),
      evidence_present:true
    },
    authoritative_frame:authoritativeFrame(input),
    normalized_visibility_constraints:normalized,
    concerns,
    evidence:[{kind:'time_light_code_precheck', clock:structuredClone(input?.historical_frame?.clock ?? null), weather_state:structuredClone(input?.weather_state ?? null)}]
  };
}

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
    light_profile:light,
    visibility_range:visibilityRange,
    visible_without_action:visibleWithoutAction,
    visible_only_on_inspection:inspect,
    audible_but_not_visible:[],
    hidden_until_action:hidden,
    forbidden_to_show_in_visible_scene:[...hidden],
    required_visible_scene_terms:[],
    preserve_clock:true,
    preserve_season:true,
    preserve_weather:true,
    preserve_light_profile:true,
    visible_context_must_follow_normalized_visibility_constraints:true,
    do_not_show_hidden_items:true,
    do_not_show_closed_container_contents:true
  };
}

export function buildStage17SemanticAuditInput(input, precheck) {
  return {
    version:1,
    schema:'time_light_semantic_audit_input',
    request_id:input.request_id,
    time_light_consistency_input:input,
    time_light_code_precheck:precheck,
    authoritative_frame:precheck.authoritative_frame,
    normalized_visibility_constraints:precheck.normalized_visibility_constraints,
    forbidden_changes:{clock:true,season:true,weather_state:true,g5_scene_graph:true,initial_npc_placement:true,initial_item_placement:true,player_character:true,visible_scene:true,narrator_prose:true}
  };
}

export function validateStage17TimeLightAudit(audit, input, precheck) {
  const concerns = [];
  if (!isObject(audit)) return [issue('TIME_LIGHT_AUDIT_INVALID_JSON','Audit must be an object.','root')];
  if (audit.version !== 1 || audit.schema !== STAGE17_AUDIT_SCHEMA) concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH',`Expected ${STAGE17_AUDIT_SCHEMA} version 1.`,'schema'));
  if (audit.request_id !== input.request_id) concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','request_id must match input.','request_id',input.request_id,audit.request_id));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','pass must be boolean.','pass'));
  for (const key of ['authoritative_frame','checks','normalized_visibility_constraints','commit_permission']) if (!isObject(audit[key])) concerns.push(issue('TIME_LIGHT_AUDIT_REQUIRED_BLOCK_MISSING',`${key} is required.`,key));
  if (!Array.isArray(audit.concerns)) concerns.push(issue('TIME_LIGHT_AUDIT_REQUIRED_BLOCK_MISSING','concerns must be an array.','concerns'));
  if (!Array.isArray(audit.evidence) || audit.evidence.length === 0) concerns.push(issue('TIME_LIGHT_AUDIT_EMPTY_EVIDENCE','evidence must be non-empty.','evidence'));
  if (!deepEqual(audit.authoritative_frame, authoritativeFrame(input))) concerns.push(issue('TIME_LIGHT_AUDIT_CHANGED_AUTHORITY','authoritative_frame must exactly preserve input authority.','authoritative_frame'));
  if (!deepEqual(audit.normalized_visibility_constraints, precheck.normalized_visibility_constraints)) concerns.push(issue('TIME_LIGHT_AUDIT_CHANGED_VISIBILITY_CONSTRAINTS','normalized_visibility_constraints must preserve code precheck output.','normalized_visibility_constraints'));
  if (audit.pass === true) {
    if (audit.repair_route != null) concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','repair_route must be null when pass=true.','repair_route'));
    if (audit.commit_permission?.can_continue_to_visible_context !== true) concerns.push(issue('TIME_LIGHT_AUDIT_PERMISSION_INVALID','can_continue_to_visible_context must be true.','commit_permission.can_continue_to_visible_context'));
    if (audit.commit_permission?.can_continue_to_narrator !== false) concerns.push(issue('TIME_LIGHT_AUDIT_PERMISSION_INVALID','can_continue_to_narrator must remain false.','commit_permission.can_continue_to_narrator'));
  } else {
    if (!Array.isArray(audit.concerns) || audit.concerns.length === 0) concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','Failed audit requires concerns.','concerns'));
    if (!audit.repair_route) concerns.push(issue('TIME_LIGHT_AUDIT_SCHEMA_MISMATCH','Failed audit requires repair_route.','repair_route'));
    if (audit.commit_permission?.can_continue_to_visible_context !== false || audit.commit_permission?.can_continue_to_narrator !== false) concerns.push(issue('TIME_LIGHT_AUDIT_PERMISSION_INVALID','Failed audit must deny all permissions.','commit_permission'));
  }
  return concerns;
}

export function validateStage17TimeLightRoute(route) {
  const concerns = [];
  if (!isObject(route) || route.version !== 1 || route.schema !== STAGE17_ROUTE_SCHEMA) concerns.push(issue('TIME_LIGHT_ROUTE_INVALID',`Expected ${STAGE17_ROUTE_SCHEMA} version 1.`,'route'));
  if (!ROUTES.has(route?.route)) concerns.push(issue('TIME_LIGHT_ROUTE_INVALID','route is outside the allowlist.','route.route',[...ROUTES],route?.route));
  if (!Array.isArray(route?.evidence) || route.evidence.length === 0) concerns.push(issue('TIME_LIGHT_ROUTE_INVALID','route evidence is required.','route.evidence'));
  return concerns;
}

export async function runStage17TimeLightGateBlock({ input, audit, formatRepair = null, router = null } = {}) {
  const precheck = buildStage17TimeLightCodePrecheck(input);
  if (!precheck.pass) {
    const route = await routeFailure(router, { input, precheck, audit:null, validation_issues:precheck.concerns });
    throw stage17Error('Stage 17 code precheck failed.', precheck.concerns, route, { code_precheck:precheck });
  }
  let auditOutput = await callRole(audit, buildStage17SemanticAuditInput(input, precheck), 'TimeLightSemanticAuditor');
  let validation = validateStage17TimeLightAudit(auditOutput, input, precheck);
  if (validation.length > 0 && typeof formatRepair === 'function' && validation.some((x)=>FORMAT_CODES.has(x.code))) {
    auditOutput = await callRole(formatRepair, { input, code_precheck:precheck, audit:auditOutput, validation_errors:validation }, 'TimeLightAuditFormatRepairer');
    validation = validateStage17TimeLightAudit(auditOutput, input, precheck);
  }
  if (validation.length > 0) {
    const route = await routeFailure(router, { input, precheck, audit:auditOutput, validation_issues:validation });
    throw stage17Error('Stage 17 audit output is invalid.', validation, route, { code_precheck:precheck, audit:auditOutput });
  }
  if (auditOutput.pass !== true) {
    const route = await routeFailure(router, { input, precheck, audit:auditOutput, validation_issues:auditOutput.concerns });
    throw stage17Error('Stage 17 semantic audit failed.', auditOutput.concerns, route, { code_precheck:precheck, audit:auditOutput });
  }
  return { pass:true, code_precheck:precheck, audit:auditOutput, route:null };
}


function checkClock(input, concerns) {
  const clock = input.historical_frame?.clock;
  if (!isObject(clock) || !Number.isInteger(clock.day) || !Number.isInteger(clock.hour) || clock.hour < 0 || clock.hour > 23 || !Number.isInteger(clock.minute) || clock.minute < 0 || clock.minute > 59 || !TIME_OF_DAY.has(clock.time_of_day) || !LIGHT.has(clock.light_profile) || !text(clock.clock_moment)) {
    concerns.push(issue('TIME_LIGHT_CLOCK_SCHEMA_INVALID','historical_frame.clock is invalid.','historical_frame.clock')); return;
  }
  if (!ALLOWED_LIGHT[clock.time_of_day]?.has(clock.light_profile)) concerns.push(issue('TIME_LIGHT_TIME_OF_DAY_LIGHT_CONFLICT','time_of_day conflicts with light_profile.','historical_frame.clock.light_profile',[...ALLOWED_LIGHT[clock.time_of_day]],clock.light_profile));
  if (clock.hour >= 0 && clock.hour <= 4 && ['day','afternoon'].includes(clock.time_of_day)) concerns.push(issue('TIME_LIGHT_CLOCK_MOMENT_CONFLICT','Night hour conflicts with daytime label.','historical_frame.clock.time_of_day'));
  if (clock.hour >= 10 && clock.hour <= 15 && clock.time_of_day === 'deep_night') concerns.push(issue('TIME_LIGHT_CLOCK_MOMENT_CONFLICT','Midday hour conflicts with deep_night.','historical_frame.clock.time_of_day'));
  const moment = normalizeText(clock.clock_moment);
  if (/(полд|midday)/i.test(moment) && ['night','deep_night'].includes(clock.time_of_day)) concerns.push(issue('TIME_LIGHT_CLOCK_MOMENT_CONFLICT','clock_moment conflicts with time_of_day.','historical_frame.clock.clock_moment'));
  if (/(глубок.*ноч|deep night)/i.test(moment) && ['day','afternoon'].includes(clock.time_of_day)) concerns.push(issue('TIME_LIGHT_CLOCK_MOMENT_CONFLICT','clock_moment conflicts with time_of_day.','historical_frame.clock.clock_moment'));
}

function checkSeasonWeather(input, concerns) {
  const season = input.historical_frame?.calendar?.season;
  const w = input.weather_state;
  if (!SEASONS.has(season)) concerns.push(issue('TIME_LIGHT_SEASON_WEATHER_CONFLICT','calendar.season is invalid.','historical_frame.calendar.season'));
  const override = ['regional_rule','event_state','generated_and_audited'].includes(w?.weather_source) && nonEmpty(array(w?.source_trace ?? w?.evidence));
  if (w?.precipitation === 'snow' && w?.temperature_band === 'hot') concerns.push(issue('TIME_LIGHT_SEASON_WEATHER_CONFLICT','Snow cannot coexist with hot temperature.','weather_state'));
  if (w?.ground_state === 'ice' && w?.temperature_band === 'hot') concerns.push(issue('TIME_LIGHT_SEASON_WEATHER_CONFLICT','Ice cannot coexist with hot temperature.','weather_state'));
  if (season === 'winter' && w?.temperature_band === 'hot' && !override) concerns.push(issue('TIME_LIGHT_SEASON_WEATHER_CONFLICT','Winter hot weather requires an approved source rule.','weather_state.temperature_band'));
  if (season === 'summer' && w?.temperature_band === 'severe_cold' && !override) concerns.push(issue('TIME_LIGHT_SEASON_WEATHER_CONFLICT','Summer severe cold requires an approved source rule.','weather_state.temperature_band'));
}

function checkG5Visibility(input, concerns) {
  const g5 = input.g5_scene_graph ?? {};
  const anchors = array(g5.anchors ?? g5.scene_anchors ?? g5.g5_anchors);
  const ids = new Set(anchors.map((x)=>x.anchor_id ?? x.id).filter(Boolean));
  const vm = g5.visibility_model ?? {};
  const visible = new Set(array(vm.visible_anchor_ids ?? g5.visible_anchor_ids));
  const hidden = new Set(array(vm.hidden_anchor_ids ?? g5.hidden_anchor_ids));
  const inspect = new Set(array(vm.requires_inspection_anchor_ids ?? g5.requires_inspection_anchor_ids));
  for (const id of [...visible,...hidden,...inspect]) if (!ids.has(id)) concerns.push(issue('TIME_LIGHT_G5_VISIBILITY_CONFLICT','Visibility references an unknown G5 anchor.','g5_scene_graph.visibility_model',null,id));
  for (const id of visible) if (hidden.has(id) || inspect.has(id)) concerns.push(issue('TIME_LIGHT_G5_VISIBILITY_CONFLICT','Visible anchor cannot also be hidden or inspection-only.','g5_scene_graph.visibility_model',null,id));
  const g5Light = vm.light_profile;
  if (g5Light && g5Light !== input.historical_frame.clock.light_profile) concerns.push(issue('TIME_LIGHT_G5_VISIBILITY_CONFLICT','G5 light_profile conflicts with authoritative clock.','g5_scene_graph.visibility_model.light_profile',input.historical_frame.clock.light_profile,g5Light));
  if (DARK_LIGHTS.has(input.historical_frame.clock.light_profile) && anchors.length > 1 && visible.size === anchors.length) concerns.push(issue('TIME_LIGHT_G5_VISIBILITY_CONFLICT','Dark scene cannot expose every anchor without explicit lighting basis.','g5_scene_graph.visibility_model.visible_anchor_ids'));
}

function checkNpcVisibility(input, concerns) {
  const tod = input.historical_frame.clock.time_of_day;
  const light = input.historical_frame.clock.light_profile;
  for (const [i,npc] of array(input.initial_npc_placement?.npc_instances ?? input.initial_npc_placement?.placements).entries()) {
    const path = `initial_npc_placement.npc_instances[${i}]`;
    const visible = npc.visible_to_player_now === true || ['visible','seen'].includes(npc.visibility_state);
    const basis = npc.visibility_basis ?? npc.visibility_reason ?? npc.perception_basis;
    if (visible && DARK_LIGHTS.has(light) && !['near','lit','firelit','moonlit','silhouette','audible_only','known_presence'].includes(basis)) concerns.push(issue('TIME_LIGHT_NPC_VISIBILITY_CONFLICT','NPC visible in darkness without a valid basis.',`${path}.visibility_basis`));
    const activity = normalizeText(npc.current_activity ?? npc.activity ?? '');
    const exception = npc.schedule_exception ?? npc.time_basis ?? null;
    if (['night','deep_night'].includes(tod) && DAY_ACTIVITY_TERMS.some((r)=>r.test(activity)) && !exception) concerns.push(issue('TIME_LIGHT_NPC_ACTIVITY_CONFLICT','Daytime NPC activity conflicts with night. ',`${path}.current_activity`));
  }
}

function checkItemVisibility(input, concerns) {
  const light = input.historical_frame.clock.light_profile;
  const items = array(input.initial_item_placement?.item_instances);
  for (const [i,item] of items.entries()) {
    const path = `initial_item_placement.item_instances[${i}]`;
    const state = item.visibility_state ?? item.visibility?.state;
    const visible = item.visible_to_player_now === true || ['visible','seen'].includes(state);
    const basis = item.visibility_basis ?? item.visibility?.basis;
    if (HIDDEN.has(state) && visible) concerns.push(issue('TIME_LIGHT_HIDDEN_ITEM_VISIBLE','Hidden item cannot be visible.',`${path}.visibility_state`));
    if (visible && DARK_LIGHTS.has(light) && !['near','lit','firelit','moonlit','inspection'].includes(basis)) concerns.push(issue('TIME_LIGHT_ITEM_VISIBILITY_CONFLICT','Item visible in darkness without a valid basis.',`${path}.visibility_basis`));
  }
  for (const [i,c] of array(input.initial_item_placement?.container_instances).entries()) {
    const state = c.access_state ?? c.container_state ?? c.state;
    const contentsVisible = c.contents_visible === true || c.content_state?.visible === true || nonEmpty(array(c.visible_content_item_ids));
    if (CLOSED.has(state) && contentsVisible) concerns.push(issue('TIME_LIGHT_CLOSED_CONTAINER_CONTENT_VISIBLE','Closed or hidden container cannot expose concrete contents.',`initial_item_placement.container_instances[${i}]`));
  }
}

function checkBodyWeather(input, concerns) {
  const w = input.weather_state;
  if (!['severe_cold'].includes(w.temperature_band) && w.wind !== 'dangerous') return;
  const body = input.player_character?.body ?? {};
  const clothing = normalizeText(body.clothing_summary ?? input.player_character?.equipment?.clothing_summary ?? '');
  const conditions = array(body.active_conditions ?? input.player_character?.active_conditions).map(normalizeText);
  const exposure = Number(body.exposure_minutes ?? input.player_character?.exposure_minutes ?? 0);
  const clearlyUnprotected = /(лёгк|тонк|мокр|без верхн|light|wet|unprotected)/i.test(clothing);
  const hasCold = conditions.some((x)=>/(холод|переохлаж|промок|cold|hypotherm|wet)/i.test(x));
  if (clearlyUnprotected && exposure >= 30 && !hasCold) concerns.push(issue('TIME_LIGHT_BODY_WEATHER_CONFLICT','Extended severe exposure contradicts body state.','player_character.body'));
  else if (!hasCold) concerns.push(issue('TIME_LIGHT_BODY_WEATHER_RISK','Extreme weather creates a potential body risk that visible context must acknowledge.','player_character.body',null,null,'warning'));
}

function checkDraftVisible(input, concerns) {
  const draft = input.draft_visible_context_package ?? {};
  const tod = input.historical_frame.clock.time_of_day;
  const texts = [];
  if (text(draft.visible_scene)) texts.push(['draft_visible_context_package.visible_scene',draft.visible_scene]);
  array(draft.visible_changes).forEach((x,i)=>texts.push([`draft_visible_context_package.visible_changes[${i}]`,typeof x === 'string' ? x : x?.summary ?? x?.text ?? '']));
  for (const [path,value] of texts) {
    if (['night','deep_night'].includes(tod) && NIGHT_DAY_TERMS.some((r)=>r.test(value))) concerns.push(issue(path.includes('visible_changes')?'TIME_LIGHT_VISIBLE_CHANGES_CLOCK_CONFLICT':'TIME_LIGHT_VISIBLE_SCENE_CLOCK_CONFLICT','Visible text contains daylight terms at night.',path));
    if (['day','afternoon'].includes(tod) && DAY_NIGHT_TERMS.some((r)=>r.test(value))) concerns.push(issue(path.includes('visible_changes')?'TIME_LIGHT_VISIBLE_CHANGES_CLOCK_CONFLICT':'TIME_LIGHT_VISIBLE_SCENE_CLOCK_CONFLICT','Visible text contains night terms during day.',path));
  }
}

async function routeFailure(router, payload) {
  if (typeof router !== 'function') return defaultRoute('blocked','TIME_LIGHT_ROUTE_MISSING');
  const route = await callRole(router,payload,'TimeLightAuditRouter');
  const concerns = validateStage17TimeLightRoute(route);
  if (concerns.length) return defaultRoute('blocked','TIME_LIGHT_ROUTE_INVALID');
  return route;
}
function defaultRoute(route, reason_code) { return {version:1,schema:STAGE17_ROUTE_SCHEMA,route,reason_code,evidence:[{kind:'code_route_fallback'}]}; }
function stage17Error(message, concerns, route, snapshots={}) { const e=new Error(message); e.lifecycle={stage_id:17,stage_slug:'time_light_gate',stage_type:'code_first_semantic_audit',failed_gate:'time_light_gate',concerns:concerns??[],terminal_status:'stage_failed',...snapshots}; e.semanticRecoveryRoute={repair_kind:'semantic',return_to_stage:route?.route ?? 'blocked',rerun_from_stage:17,reason_code:route?.reason_code ?? 'TIME_LIGHT_FAILED',route}; return e; }
async function callRole(fn,input,role){ if(typeof fn!=='function') throw new Error(`${role} requires an executor.`); const out=await fn(structuredClone(input)); if(typeof out==='string'){try{return JSON.parse(out);}catch{return out;}} return out; }
function authoritativeFrame(input){return {clock:structuredClone(input?.historical_frame?.clock ?? null),season:input?.historical_frame?.calendar?.season ?? null,weather_state:structuredClone(input?.weather_state ?? null),light_profile:input?.historical_frame?.clock?.light_profile ?? null};}
function requireAudit(concerns,value,schema,path,code){if(value?.schema!==schema||value?.version!==1||value?.pass!==true) concerns.push(issue(code,`${path} must be approved ${schema}.`,path));}
function issue(code,message,field,expected=null,actual=null,severity='error'){return {code,message,field,expected,actual,severity};}
function isObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);} function text(v){return typeof v==='string'&&v.trim().length>0;} function array(v){return Array.isArray(v)?v:[];} function nonEmpty(v){return Array.isArray(v)&&v.length>0;} function normalizeText(v){return String(v??'').toLowerCase().replaceAll('ё','е');}
function hasCode(c,code){return c.some((x)=>x.code===code&&x.severity!=='warning');} function hasPrefix(c,p){return c.some((x)=>x.code.startsWith(p)&&x.severity!=='warning');}
function deepEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
