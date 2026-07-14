import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage17 from '@rus/new-game/stages/stage-17/compat';
import * as stage18 from '@rus/new-game/stages/stage-18/compat';
import * as stage19 from '@rus/new-game/stages/stage-19/compat';
import * as stage20 from '@rus/new-game/stages/stage-20/compat';
import {
  makeBaseValues,
  makeHiddenState,
  makeKnowledgeMap,
  makeStage17Audit,
  makeStage18Audit,
  makeStage18Input,
  makeStage19Audit,
  makeStage19Input
} from '../fixtures/stage17-19-fixtures.mjs';

test('Stage 17 -> Stage 18 -> Stage 19 -> Stage 20 handoff is modular', async () => {
  const base = makeBaseValues();
  const input17 = stage17.buildStage17TimeLightInput(base);
  const result17 = await stage17.runStage17TimeLightGateBlock({
    input: input17,
    audit: async () => makeStage17Audit(input17),
    formatRepair: async () => makeStage17Audit(input17),
    router: async () => ({ version: 1, schema: stage17.STAGE17_ROUTE_SCHEMA, route: 'blocked', reason_code: 'UNUSED', evidence: [] })
  });

  const input18 = makeStage18Input((values) => { values.time_light_consistency_audit = result17.audit; });
  const map = makeKnowledgeMap(input18);
  const result18 = await stage18.runStage18CharacterKnowledgeMapBlock({
    input: input18,
    build: async () => map,
    audit: async () => makeStage18Audit(),
    formatRepair: async () => map,
    semanticRepair: async () => map,
    seniorRepair: async () => map
  });

  const input19 = makeStage19Input((values) => {
    values.time_light_consistency_audit = result17.audit;
    values.character_knowledge_map = result18.character_knowledge_map;
    values.character_knowledge_map_audit = result18.character_knowledge_map_audit;
  });
  const hidden = makeHiddenState(input19);
  const result19 = await stage19.runStage19HiddenStateBlock({
    input: input19,
    build: async () => hidden,
    audit: async () => makeStage19Audit(),
    formatRepair: async () => hidden,
    semanticRepair: async () => hidden,
    seniorRepair: async () => hidden
  });

  const currentPosition = {
    region_id: 'region-1', place_id: 'place-1', location_id: 'g4-1',
    minilocation_id: 'mini-1', anchor_id: 'anchor-1', last_route_id: null
  };
  const input20 = stage20.buildStage20VisibleContextInput({
    ...base,
    current_position: currentPosition,
    time_light_consistency_audit: result17.audit,
    character_knowledge_map: result18.character_knowledge_map,
    character_knowledge_map_audit: result18.character_knowledge_map_audit,
    full_hidden_scene_state: result19.full_hidden_scene_state,
    full_hidden_state_audit: result19.full_hidden_state_audit
  });
  assert.deepEqual(stage20.validateStage20Input(input20), []);
  assert.equal(input20.full_hidden_scene_state.schema, 'full_hidden_scene_state');
});
