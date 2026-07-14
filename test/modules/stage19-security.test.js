import test from 'node:test'; import assert from 'node:assert/strict';
import { validateFullHiddenSceneState } from '@rus/new-game/stages/stage-19/compat';
import { makeStage19Input, makeHiddenState } from '../fixtures/stage17-19-fixtures.mjs';
test('Stage 19 rejects narrator text',()=>{const input=makeStage19Input();const out=makeHiddenState(input,{narrator_text:'hidden prose'});assert.ok(validateFullHiddenSceneState(out,input).some(x=>x.code==='HIDDEN_STATE_CREATED_NARRATOR_TEXT'));});
test('Stage 19 rejects risk without trigger',()=>{const input=makeStage19Input();const out=makeHiddenState(input,{hidden_state_status:'formed',hidden_risk_state:[{hidden_risk_state_id:'risk-1',risk_target:{target_type:'whole_scene',target_id:'scene'},trigger_conditions:[],system_only:true,system_only_reason:'latent'}]});const issues=validateFullHiddenSceneState(out,input);assert.ok(issues.some(x=>x.code==='HIDDEN_STATE_RISK_WITHOUT_TRIGGER'));});
