import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCharacterKnowledgeCodePrecheck,
  buildCharacterKnowledgeWriteProjection,
  buildStage18ReferenceIndex,
  runStage18CharacterKnowledgeMapBlock,
  validateCharacterKnowledgeMap,
  validateProvidedStage18Result,
  validateStage18Input
} from '../stages/stage18-character-knowledge-map.js';
import { clone, makeKnowledgeAudit, makeKnowledgeMap, makeStage18Input } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

const noopFormat = async ({ parsed_output }) => parsed_output;
const noRepair = async () => { throw new Error('repair should not be called'); };

test('Stage 18 accepts exact isolated input', () => {
  assert.deepEqual(validateStage18Input(makeStage18Input()), []);
});

test('Stage 18 rejects provided output in every environment', () => {
  assert.throws(() => validateProvidedStage18Result(), /forbidden/);
});

test('Stage 18 rejects pre-commit route_id', () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  map.known_routes[0].route_id = 'party-route-1';
  const codes = validateCharacterKnowledgeMap(map, input).map((x) => x.code);
  assert.ok(codes.includes('KNOWLEDGE_MAP_CREATED_ROUTE'));
});

test('Stage 18 rejects foreign graph edge', () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  map.known_routes[0] = { known_route_id: 'kr-2', graph_edge_id: 'foreign-edge', basis: ['personal_travel'], source_trace: [{ source_id: 'edge-source-1' }] };
  const codes = validateCharacterKnowledgeMap(map, input).map((x) => x.code);
  assert.ok(codes.includes('KNOWLEDGE_MAP_ROUTE_REF_NOT_FOUND'));
});

test('Stage 18 rejects knowledge without basis', () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  delete map.known_social_rules[0].basis;
  const codes = validateCharacterKnowledgeMap(map, input).map((x) => x.code);
  assert.ok(codes.includes('KNOWLEDGE_MAP_KNOWLEDGE_WITHOUT_BASIS'));
});

test('Stage 18 rejects hidden state embedded in known record', () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  map.known_social_rules[0].private_motive = 'secret';
  const codes = validateCharacterKnowledgeMap(map, input).map((x) => x.code);
  assert.ok(codes.includes('KNOWLEDGE_MAP_PRIVATE_NPC_MOTIVE_LEAK'));
});

test('Stage 18 builds deterministic code precheck and projection', () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  const refs = buildStage18ReferenceIndex(input);
  const precheck = buildCharacterKnowledgeCodePrecheck(map, input, refs);
  assert.equal(precheck.pass, true);
  const projection1 = buildCharacterKnowledgeWriteProjection(map, precheck, { pass: true, evidence: ['ok'] }, []);
  const projection2 = buildCharacterKnowledgeWriteProjection(map, precheck, { pass: true, evidence: ['ok'] }, []);
  assert.equal(projection1.source_content_hash, projection2.source_content_hash);
  assert.equal(projection1.root_record.status, 'pending');
});

test('Stage 18 runs independent audit and returns result bundle', async () => {
  const input = makeStage18Input();
  const map = makeKnowledgeMap();
  let auditorSawMap = false;
  const result = await runStage18CharacterKnowledgeMapBlock({
    input,
    build: async (roleInput) => { assert.equal(roleInput.schema, 'character_knowledge_map_input'); return clone(map); },
    audit: async (auditInput) => { auditorSawMap = auditInput.character_knowledge_map.schema === 'character_knowledge_map'; return makeKnowledgeAudit(true); },
    formatRepair: noopFormat,
    semanticRepair: noRepair,
    seniorRepair: noRepair
  });
  assert.equal(auditorSawMap, true);
  assert.equal(result.schema, 'stage18_character_knowledge_result');
  assert.equal(result.code_precheck.pass, true);
  assert.equal(result.character_knowledge_map_audit.pass, true);
  assert.equal(result.character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state, true);
  assert.equal(result.commit_permission, true);
});

test('Stage 18 invokes semantic repair after code precheck failure', async () => {
  const input = makeStage18Input();
  const broken = makeKnowledgeMap();
  delete broken.known_social_rules[0].basis;
  let repaired = false;
  const result = await runStage18CharacterKnowledgeMapBlock({
    input,
    build: async () => broken,
    audit: async () => makeKnowledgeAudit(true),
    formatRepair: noopFormat,
    semanticRepair: async ({ validationErrors }) => {
      assert.ok(validationErrors.some((x) => x.code === 'KNOWLEDGE_MAP_KNOWLEDGE_WITHOUT_BASIS'));
      repaired = true;
      return makeKnowledgeMap();
    },
    seniorRepair: noRepair
  });
  assert.equal(repaired, true);
  assert.equal(result.repair_history[0].kind, 'semantic');
});

test('Stage 18 routes failed independent audit through semantic repair', async () => {
  const input = makeStage18Input();
  let auditCalls = 0;
  const result = await runStage18CharacterKnowledgeMapBlock({
    input,
    build: async () => makeKnowledgeMap(),
    audit: async () => (++auditCalls === 1 ? makeKnowledgeAudit(false) : makeKnowledgeAudit(true)),
    formatRepair: noopFormat,
    semanticRepair: async ({ audit }) => { assert.equal(audit.pass, false); return makeKnowledgeMap(); },
    seniorRepair: noRepair
  });
  assert.equal(auditCalls, 2);
  assert.equal(result.character_knowledge_map_audit.pass, true);
});

test('Stage 18 rejects current position not sourced from audited Stage 13 G5', () => {
  const input = makeStage18Input();
  input.current_position.anchor_id = 'anchor-2';
  const codes = validateStage18Input(input).map((x) => x.code);
  assert.ok(codes.includes('KNOWLEDGE_MAP_POSITION_REF_MISMATCH'));
});
