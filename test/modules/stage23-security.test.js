import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage23 from '@rus/new-game/stages/stage-23/compat';
import { makeNarratorProse, makePassingNarratorAudit, makeStage23Input } from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 23 rejects hidden state in exact audit input', () => {
  const input = structuredClone(makeStage23Input());
  input.hidden_state = { motive: 'secret' };
  const codes = stage23.validateStage23AuditInput(input).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_INPUT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_INPUT_FORBIDDEN_FIELD'));
});

test('Stage 23 rejects audits that embed prose or hidden payloads', () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  audit.modified_prose = 'unsafe';
  const codes = stage23.validateNarratorProseAudit(audit, input).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_AUDIT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_AUDIT_FORBIDDEN_FIELD'));
});

test('Stage 23 precheck rejects prose references absent from visible context', () => {
  const prose = makeNarratorProse();
  prose.used_visible_context_refs.push('hidden-cellar');
  const input = makeStage23Input(prose);
  const codes = stage23.buildNarratorProseCodePrecheck(input).concerns.map((item) => item.code);
  assert.ok(codes.includes('STAGE23_USED_REF_UNKNOWN'));
  assert.ok(codes.includes('STAGE23_MUST_NOT_INCLUDE_REF_USED'));
});

test('Stage 23 rejects incompatible repair routes', () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  audit.pass = false;
  audit.checks.new_fact_check = { pass: false };
  audit.concerns = [{ code: 'NARRATOR_PROSE_ADDED_FACT', severity: 'repairable', message: 'added fact' }];
  audit.evidence = ['added fact'];
  audit.commit_permission = { can_show_to_player: false, can_write_player_visible_message: false, can_mark_opening_scene_presented: false };
  const route = {
    version: 1,
    schema: stage23.STAGE23_ROUTE_SCHEMA,
    request_id: input.request_id,
    return_to_stage: 'time_light_semantic_repair',
    repair_kind: 'semantic_rewrite',
    reason: 'wrong route',
    supporting_concern_codes: ['NARRATOR_PROSE_ADDED_FACT']
  };
  const codes = stage23.validateStage23RepairRoute(route, audit).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_ROUTE_INCOMPATIBLE'));
});
