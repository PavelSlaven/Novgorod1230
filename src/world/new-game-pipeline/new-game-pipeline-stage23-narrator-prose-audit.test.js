import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNarratorProseCodePrecheck,
  buildStage23AuditInput,
  computeNarratorStartingProseDigest,
  runStage23NarratorProseAuditBlock,
  STAGE23_AUDIT_SCHEMA,
  STAGE23_CONCERN_CODES,
  STAGE23_PRECHECK_SCHEMA,
  STAGE23_RESULT_SCHEMA,
  STAGE23_ROUTE_SCHEMA,
  validateNarratorProseAudit,
  validateStage23AuditInput,
  validateStage23CommitHandoff,
  validateStage23RepairRoute
} from '../stages/stage23-narrator-prose-audit.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import { makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

const CHECK_KEYS = [
  'schema_and_structure', 'visible_context_compliance', 'new_fact_check', 'npc_check',
  'item_check', 'container_check', 'door_exit_route_check', 'time_light_weather_check',
  'position_check', 'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
  'rumor_uncertainty_check', 'action_options_check', 'technical_text_check',
  'must_include_check', 'must_not_include_check', 'commit_readiness'
];

function prose(text = 'Ты стоишь у огня. Рядом видны человек и закрытый сундук.') {
  return {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: 'req-1',
    prose_status: 'drafted',
    prose: text,
    action_options: [{
      option_id: 'option-1', label: 'Обратиться к человеку', action_kind: 'ask',
      target_ref: { npc_instance_id: 'npc-1' }, basis: 'visible', risk_hint: 'unknown',
      must_not_reveal_hidden_truth: true
    }],
    used_visible_context_refs: ['npc-1', 'container-1'],
    self_constraints_check: {
      used_only_visible_context: true,
      did_not_add_new_world_facts: true,
      did_not_reveal_hidden_state: true,
      preserved_time_weather_light: true,
      preserved_position: true,
      rumors_remain_rumors: true,
      uncertainty_remains_uncertain: true
    }
  };
}

function input() {
  const pkg = makeVisibleContextPackage();
  const draft = prose();
  const packageDigest = computeVisibleContextPackageDigest(pkg);
  return buildStage23AuditInput({
    request_id: 'req-1',
    visible_context_package: pkg,
    visible_context_package_digest: packageDigest,
    visible_context_approval: {
      version: 1,
      schema: 'visible_context_audit_approval',
      request_id: 'req-1',
      pass: true,
      visible_context_package_digest: packageDigest,
      commit_permission: {
        can_send_to_narrator: true,
        can_write_visible_context_snapshot: true,
        can_generate_player_facing_prose: true
      }
    },
    narrator_starting_prose: draft,
    narrator_starting_prose_digest: computeNarratorStartingProseDigest(draft)
  });
}

function checks(pass = true, failed = 'new_fact_check') {
  return Object.fromEntries(CHECK_KEYS.map((key) => [key, { pass: pass ? true : key !== failed }]));
}

function successAudit() {
  return {
    version: 1,
    schema: STAGE23_AUDIT_SCHEMA,
    request_id: 'req-1',
    pass: true,
    checks: checks(true),
    concerns: [],
    evidence: ['Every prose claim is grounded in the approved visible context package.'],
    repair_route: null,
    commit_permission: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  };
}

function failedAudit(code = 'NARRATOR_PROSE_ADDED_ITEM') {
  return {
    version: 1,
    schema: STAGE23_AUDIT_SCHEMA,
    request_id: 'req-1',
    pass: false,
    checks: checks(false),
    concerns: [{ code, severity: 'repairable', message: 'The prose contains a claim not grounded in visible context.' }],
    evidence: ['The prose claim has no matching visible-context reference.'],
    repair_route: null,
    commit_permission: {
      can_show_to_player: false,
      can_write_player_visible_message: false,
      can_mark_opening_scene_presented: false
    }
  };
}

function route(target = 'narrator_prose_semantic_repair', code = 'NARRATOR_PROSE_ADDED_ITEM') {
  return {
    version: 1,
    schema: STAGE23_ROUTE_SCHEMA,
    request_id: 'req-1',
    return_to_stage: target,
    repair_kind: 'remove_unsupported_claim',
    reason: 'Repair the unsupported prose claim and re-audit.',
    supporting_concern_codes: [code]
  };
}

test('Stage 23 exact input and code precheck pass for a bound Stage 22 draft', () => {
  const value = input();
  assert.deepEqual(validateStage23AuditInput(value), []);
  const precheck = buildNarratorProseCodePrecheck(value);
  assert.equal(precheck.schema, STAGE23_PRECHECK_SCHEMA);
  assert.equal(precheck.pass, true);
  assert.equal(precheck.checks.package_digest_valid, true);
  assert.equal(precheck.checks.narrator_prose_digest_valid, true);
});

test('Stage 23 input rejects hidden/global fields and package/prose digest substitution', () => {
  const value = structuredClone(input());
  value.full_hidden_scene_state = { secret: true };
  value.visible_context_package_digest = 'sha256:bad';
  value.narrator_starting_prose.prose = 'Подменённый текст.';
  const codes = validateStage23AuditInput(value).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_INPUT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_INPUT_FORBIDDEN_FIELD'));
  assert.ok(codes.includes('STAGE23_PACKAGE_DIGEST_MISMATCH'));
  assert.ok(codes.includes('STAGE23_PROSE_DIGEST_MISMATCH'));
});

test('successful Stage 23 block returns result bundle and auditor receives safe input only', async () => {
  let auditorInput;
  const result = await runStage23NarratorProseAuditBlock({
    input: input(),
    auditor: async (value) => { auditorInput = value; return successAudit(); },
    formatRepairer: async () => { throw new Error('not expected'); },
    seniorAuditor: async () => { throw new Error('not expected'); },
    router: async () => { throw new Error('not expected'); }
  });
  assert.equal(result.schema, STAGE23_RESULT_SCHEMA);
  assert.equal(result.pass, true);
  assert.equal(result.narrator_prose_audit.pass, true);
  assert.equal(result.commit_permission.can_show_to_player, true);
  assert.equal('full_hidden_scene_state' in auditorInput, false);
  assert.equal('character_knowledge_map' in auditorInput, false);
  assert.equal('pipeline_context' in auditorInput, false);
  assert.equal('generation_history' in auditorInput, false);
});


test('semantic auditor cannot select repair route before the dedicated Router', async () => {
  const audit = failedAudit();
  audit.repair_route = route();
  await assert.rejects(() => runStage23NarratorProseAuditBlock({
    input: input(),
    auditor: async () => audit,
    formatRepairer: async () => audit,
    seniorAuditor: async () => audit,
    router: async () => route()
  }), /audit output validation failed/);
});

test('failed audit is routed by a separate Router and returned as repair-required bundle', async () => {
  let routerInput;
  const audit = failedAudit();
  const result = await runStage23NarratorProseAuditBlock({
    input: input(),
    auditor: async () => audit,
    formatRepairer: async () => { throw new Error('not expected'); },
    seniorAuditor: async () => { throw new Error('not expected'); },
    router: async (value) => { routerInput = value; return route(); }
  });
  assert.equal(result.pass, false);
  assert.equal(result.repair_route.return_to_stage, 'narrator_prose_semantic_repair');
  assert.deepEqual(routerInput.concerns, audit.concerns);
  assert.deepEqual(routerInput.evidence, audit.evidence);
  assert.equal('visible_context_package' in routerInput, false);
  assert.equal('narrator_starting_prose' in routerInput, false);
});

test('format repair fixes JSON wrapper before senior escalation', async () => {
  let repairs = 0;
  const result = await runStage23NarratorProseAuditBlock({
    input: input(),
    auditor: async () => '```json\n{"version":1,\n```',
    formatRepairer: async () => { repairs += 1; return successAudit(); },
    seniorAuditor: async () => { throw new Error('not expected'); },
    router: async () => { throw new Error('not expected'); }
  });
  assert.equal(repairs, 1);
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.format_repair_attempts, 1);
});

test('senior auditor is used when initial audit remains structurally invalid', async () => {
  const invalid = { version: 1, schema: STAGE23_AUDIT_SCHEMA, request_id: 'req-1', pass: true, checks: {}, concerns: [], evidence: ['x'], repair_route: null, commit_permission: {} };
  const result = await runStage23NarratorProseAuditBlock({
    input: input(),
    auditor: async () => invalid,
    formatRepairer: async ({ parsed_audit_response }) => parsed_audit_response ?? invalid,
    seniorAuditor: async () => successAudit(),
    router: async () => { throw new Error('not expected'); }
  });
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.senior_auditor_attempts, 1);
});

test('audit validator rejects missing checks, invalid concern enums, empty evidence and embedded prose', () => {
  const value = failedAudit('NOT_ALLOWED');
  value.checks = {};
  value.evidence = [null];
  value.concerns[0].severity = 'fatal';
  value.prose = 'replacement';
  const codes = validateNarratorProseAudit(value, input(), { allowRouteMissing: true }).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_AUDIT_CHECK_INVALID'));
  assert.ok(codes.includes('STAGE23_AUDIT_CONCERN_CODE_INVALID'));
  assert.ok(codes.includes('STAGE23_AUDIT_SEVERITY_INVALID'));
  assert.ok(codes.includes('STAGE23_AUDIT_EVIDENCE_INVALID'));
  assert.ok(codes.includes('STAGE23_AUDIT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_AUDIT_FORBIDDEN_FIELD'));
});

test('all documented concern codes are unique', () => {
  assert.equal(new Set(STAGE23_CONCERN_CODES).size, STAGE23_CONCERN_CODES.length);
});

test('route compatibility rejects unrelated upstream target', () => {
  const audit = failedAudit('NARRATOR_PROSE_ADDED_ITEM');
  const invalidRoute = route('full_hidden_state_semantic_repair', 'NARRATOR_PROSE_ADDED_ITEM');
  const codes = validateStage23RepairRoute(invalidRoute, audit).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_ROUTE_INCOMPATIBLE'));
});

test('Stage 24 handoff rejects stale prose digest and accepts current approved bundle', async () => {
  const stage23 = await runStage23NarratorProseAuditBlock({
    input: input(), auditor: async () => successAudit(), formatRepairer: async () => successAudit(),
    seniorAuditor: async () => successAudit(), router: async () => route()
  });
  const stage22 = {
    request_id: 'req-1',
    pass: true,
    visible_context_package_digest: stage23.visible_context_package_digest,
    narrator_starting_prose: prose(),
    handoff_permission: { can_send_to_prose_audit: true }
  };
  assert.deepEqual(validateStage23CommitHandoff({ request_id: 'req-1', visible_context_package: makeVisibleContextPackage(), stage22_result: stage22, stage23_result: stage23 }), []);
  stage22.narrator_starting_prose.prose = 'stale';
  assert.ok(validateStage23CommitHandoff({ request_id: 'req-1', visible_context_package: makeVisibleContextPackage(), stage22_result: stage22, stage23_result: stage23 }).some((item) => item.code === 'STAGE23_HANDOFF_PROSE_STALE'));
});
