import test from 'node:test'; import assert from 'node:assert/strict';
import { validateCharacterKnowledgeMap } from '@rus/new-game/stages/stage-18/compat';
import { makeStage18Input, makeKnowledgeMap } from '../fixtures/stage17-19-fixtures.mjs';
test('Stage 18 rejects full map grants',()=>{const input=makeStage18Input();const out=makeKnowledgeMap(input,{knowledge_scope_summary:{map_detail_level:'full_map',route_knowledge_level:'none'}});assert.ok(validateCharacterKnowledgeMap(out,input).some(x=>x.code==='KNOWLEDGE_MAP_FULL_MAP_GRANTED'));});
test('Stage 18 rejects hidden future knowledge',()=>{const input=makeStage18Input();const out=makeKnowledgeMap(input,{known_dangers:[{statement:'Будущий пожар',basis:['common_knowledge'],source_trace:[{source_id:'region-source'}],future_event:{id:'event-1'}}]});assert.ok(validateCharacterKnowledgeMap(out,input).some(x=>x.code==='KNOWLEDGE_MAP_FUTURE_KNOWLEDGE_LEAK'));});
