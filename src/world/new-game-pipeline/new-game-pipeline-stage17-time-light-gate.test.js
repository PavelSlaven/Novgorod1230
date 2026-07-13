import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage17TimeLightCodePrecheck,
  buildNormalizedVisibilityConstraints,
  runStage17TimeLightGateBlock,
  validateStage17TimeLightAudit,
  emptyDraftVisibleContextPackage
} from '../stages/stage17-time-light-gate.js';

function input(overrides={}) {
  const base={
    version:1,schema:'time_light_consistency_input',request_id:'r1',
    historical_frame:{version:1,schema:'historical_frame',calendar:{season:'winter'},clock:{day:1,hour:3,minute:0,time_of_day:'deep_night',clock_moment:'deep night',light_profile:'dark'}},
    weather_state:{version:1,schema:'weather_state',weather_profile_id:'w1',weather_kind:'frost',temperature_band:'cold',precipitation:'none',wind:'weak',visibility_weather_modifier:'none',ground_state:'snow',weather_source:'regional_rule',source_trace:['rule1']},
    selected_start_node:{version:1,schema:'selected_start_node'},
    player_character:{version:1,schema:'player_character_game_profile',body:{clothing_summary:'winter clothing',active_conditions:[]}},
    g5_scene_graph:{version:1,schema:'g5_scene_graph_draft',anchors:[{anchor_id:'a1',visibility_state:'visible'},{anchor_id:'a2',visibility_state:'hidden'}],visibility_model:{light_profile:'dark',visible_anchor_ids:['a1'],hidden_anchor_ids:['a2'],requires_inspection_anchor_ids:[]}},
    g5_scene_audit:{version:1,schema:'g5_scene_audit',pass:true},
    initial_npc_placement:{version:1,schema:'initial_npc_placement_draft',placement_status:'placed',npc_instances:[{npc_instance_id:'n1',visibility_state:'visible',visibility_basis:'near',current_activity:'stands guard'}]},
    npc_placement_audit:{version:1,schema:'initial_npc_placement_audit',pass:true},
    initial_item_placement:{version:1,schema:'initial_item_placement_draft',placement_status:'placed',item_instances:[{item_instance_id:'i1',visibility_state:'visible',visibility_basis:'near'}],container_instances:[]},
    item_placement_audit:{version:1,schema:'initial_item_placement_audit',pass:true},
    draft_visible_context_package:emptyDraftVisibleContextPackage(),
    time_light_policy:{
      require_clock_source_of_truth:true,require_season_source_of_truth:true,require_weather_source_of_truth:true,require_light_source_of_truth:true,reject_daylight_terms_at_night:true,reject_night_terms_at_day:true,reject_visible_scene_time_override:true,reject_weather_season_conflict:true,reject_visibility_light_conflict:true,reject_npc_activity_time_conflict:true,reject_item_visibility_light_conflict:true,require_body_effects_for_extreme_weather:true,require_evidence:true,do_not_repair_by_changing_clock:true,do_not_change_season:true,do_not_change_weather_state:true,do_not_change_g5_scene:true,do_not_change_npc_placement:true,do_not_change_item_placement:true,do_not_write_visible_scene:true,do_not_write_narrator_prose:true
    }
  };
  return deepMerge(base,overrides);
}
function auditFor(inp,pre){return {version:1,schema:'time_light_consistency_audit',request_id:inp.request_id,pass:true,authoritative_frame:pre.authoritative_frame,checks:{clock_schema:{pass:true}},normalized_visibility_constraints:pre.normalized_visibility_constraints,concerns:[],evidence:[{kind:'semantic'}],repair_route:null,commit_permission:{can_continue_to_visible_context:true,can_continue_to_narrator:false}};}
function deepMerge(a,b){if(!b||typeof b!=='object'||Array.isArray(b)) return b===undefined?structuredClone(a):structuredClone(b); const o=structuredClone(a); for(const[k,v]of Object.entries(b)){o[k]=(v&&typeof v==='object'&&!Array.isArray(v)&&o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k]))?deepMerge(o[k],v):structuredClone(v);} return o;}

test('valid input passes precheck',()=>assert.equal(buildStage17TimeLightCodePrecheck(input()).pass,true));
test('weather state is mandatory',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({weather_state:null})).pass,false));
test('upstream failed audit blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({item_placement_audit:{version:1,schema:'initial_item_placement_audit',pass:false}})).pass,false));
test('invalid clock schema blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({historical_frame:{clock:{hour:30}}})).pass,false));
test('deep night plus daylight blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({historical_frame:{clock:{light_profile:'daylight'}}})).pass,false));
test('03 plus day blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({historical_frame:{clock:{time_of_day:'day',light_profile:'daylight'}}})).pass,false));
test('snow plus hot blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({weather_state:{temperature_band:'hot',precipitation:'snow'}})).pass,false));
test('hidden anchor visible blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({g5_scene_graph:{visibility_model:{visible_anchor_ids:['a1','a2'],hidden_anchor_ids:['a2']}}})).pass,false));
test('NPC visible in dark without basis blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({initial_npc_placement:{npc_instances:[{visibility_state:'visible'}]}})).pass,false));
test('hidden item visible blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({initial_item_placement:{item_instances:[{visibility_state:'hidden',visible_to_player_now:true}]}})).pass,false));
test('closed container contents visible blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({initial_item_placement:{container_instances:[{access_state:'locked',contents_visible:true}]}})).pass,false));
test('extreme weather potential risk is warning',()=>{const p=buildStage17TimeLightCodePrecheck(input({weather_state:{temperature_band:'severe_cold'}})); assert.equal(p.pass,true); assert.ok(p.concerns.some(x=>x.severity==='warning'));});
test('visible daylight term at night blocks',()=>assert.equal(buildStage17TimeLightCodePrecheck(input({draft_visible_context_package:{visible_scene:'На дворе яркий дневной свет.'}})).pass,false));
test('weather visibility modifies range',()=>assert.equal(buildNormalizedVisibilityConstraints(input({weather_state:{visibility_weather_modifier:'blocked'}})).visibility_range,'blocked'));
test('semantic auditor is called after precheck',async()=>{let called=0;const inp=input();const result=await runStage17TimeLightGateBlock({input:inp,audit:async()=>{called++;const p=buildStage17TimeLightCodePrecheck(inp);return auditFor(inp,p);},router:async()=>({version:1,schema:'time_light_audit_route',route:'blocked',evidence:[{}]})});assert.equal(called,1);assert.equal(result.pass,true);});
test('auditor not called after failed precheck and router called',async()=>{let audit=0,router=0;await assert.rejects(()=>runStage17TimeLightGateBlock({input:input({historical_frame:{clock:{light_profile:'daylight'}}}),audit:async()=>{audit++;},router:async()=>{router++;return {version:1,schema:'time_light_audit_route',route:'historical_frame_selector',evidence:[{}]};}}));assert.equal(audit,0);assert.equal(router,1);});
test('format repair is invoked',async()=>{let repaired=0;const inp=input();const pre=buildStage17TimeLightCodePrecheck(inp);const result=await runStage17TimeLightGateBlock({input:inp,audit:async()=>({bad:true}),formatRepair:async()=>{repaired++;return auditFor(inp,pre);},router:async()=>({version:1,schema:'time_light_audit_route',route:'blocked',evidence:[{}]})});assert.equal(repaired,1);assert.equal(result.pass,true);});
test('audit commit permissions are strict',()=>{const inp=input();const pre=buildStage17TimeLightCodePrecheck(inp);const a=auditFor(inp,pre);a.commit_permission.can_continue_to_narrator=true;assert.ok(validateStage17TimeLightAudit(a,inp,pre).length>0);});

test('Stage 17 module is isolated from pipeline context', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../stages/stage17-time-light-gate.js', import.meta.url), 'utf8'));
  assert.equal(/\bcontext\s*(?:\?\.|\.)/u.test(source), false);
  assert.equal(/\(context(?:,|\))/u.test(source), false);
  assert.equal(source.includes('setStageOutput'), false);
  assert.equal(source.includes('setGateResult'), false);
});

test('code-stages contains no automatic Stage 17 pass stub', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../stages/code-stages.js', import.meta.url), 'utf8'));
  assert.equal(source.includes('runStage17TimeLightGate'), false);
  assert.equal(source.includes('code_time_light_gate'), false);
});

test('pipeline retrieves weather and commits Stage 17 artifacts before Stage 18', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../index.js', import.meta.url), 'utf8'));
  assert.ok(source.includes('retrieveWeatherState'));
  assert.ok(source.includes('context.setStageOutput(1701'));
  assert.ok(source.includes('context.setStageOutput(1702'));
  assert.ok(source.includes('context.setStageOutput(1703'));
  assert.ok(source.includes('Provided stage 17 output is disabled in production'));
  const knowledgeStart = source.search(/(?:const|let) knowledgeMap = await runRequiredLlmStage/u);
  assert.ok(knowledgeStart >= 0);
  assert.ok(source.indexOf('commitStage17Success') < knowledgeStart);
});

test('Stage 20 receives approved audit and normalized visibility constraints', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../stages/llm-stages.js', import.meta.url), 'utf8'));
  assert.ok(source.includes("context.requireStageOutput(17, 'time/light consistency audit')"));
  assert.ok(source.includes('time_light_consistency_audit: structuredClone(timeLightAudit)')
    || source.includes('time_light_consistency_audit: timeLightAudit'));
  const stage20Source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../stages/stage20-visible-context.js', import.meta.url), 'utf8'));
  assert.ok(source.includes('normalized_visibility_constraints: normalizedVisibilityConstraints')
    || stage20Source.includes('time_light_consistency_audit?.normalized_visibility_constraints'));
  assert.ok(source.includes('visible_context_must_follow_normalized_visibility_constraints: true')
    || stage20Source.includes('normalized_visibility_constraints'));
});

test('Stage 17 matrix declares mandatory auditor, router and format repairer', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../llm-matrix.js', import.meta.url), 'utf8'));
  const start = source.indexOf("stage(17, 'time_light_gate'");
  const end = source.indexOf("stage(18, 'map_knowledge'", start);
  const block = source.slice(start, end);
  assert.ok(block.includes('NEW_GAME_LLM_REQUIREMENTS.REQUIRED'));
  assert.ok(block.includes("auditor_role: 'TimeLightSemanticAuditor'"));
  assert.ok(block.includes("router_role: 'TimeLightAuditRouter'"));
  assert.ok(block.includes("format_repairer_role: 'TimeLightAuditFormatRepairer'"));
  assert.ok(block.includes("'weather_state'"));
});
