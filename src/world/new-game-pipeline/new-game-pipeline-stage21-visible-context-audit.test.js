import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter,
  buildVisibleContextCodePrecheck
} from '../stages/stage20-visible-context.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import {
  buildStage21AuditCodePrecheck,
  buildStage21VisibleContextAuditInput,
  runStage21VisibleContextAuditBlock,
  STAGE21_REQUIRED_CHECKS,
  validateProvidedStage21Result,
  validateStage21Input,
  validateStage21RepairRoute,
  validateVisibleContextAuditOutput
} from '../stages/stage21-visible-context-audit.js';
import { makeStage20Input, makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

function makeInput() {
  const stage20Input = makeStage20Input();
  const pkg = makeVisibleContextPackage();
  const refs = buildStage20ReferenceIndex(stage20Input);
  const filter = buildStage20VisibilityFilter(stage20Input, refs);
  const precheck = buildVisibleContextCodePrecheck(pkg, stage20Input, refs, filter);
  assert.equal(precheck.pass, true, JSON.stringify(precheck.concerns));
  return buildStage21VisibleContextAuditInput({
    request_id: stage20Input.request_id,
    historical_frame: stage20Input.historical_frame,
    weather_state: stage20Input.weather_state,
    current_position: stage20Input.current_position,
    g5_scene_graph: stage20Input.g5_scene_graph,
    g5_scene_audit: stage20Input.g5_scene_audit,
    initial_npc_placement: stage20Input.initial_npc_placement,
    npc_placement_audit: stage20Input.npc_placement_audit,
    initial_item_placement: stage20Input.initial_item_placement,
    item_placement_audit: stage20Input.item_placement_audit,
    time_light_consistency_audit: stage20Input.time_light_consistency_audit,
    character_knowledge_map: stage20Input.character_knowledge_map,
    character_knowledge_map_audit: stage20Input.character_knowledge_map_audit,
    full_hidden_scene_state: stage20Input.full_hidden_scene_state,
    full_hidden_state_audit: stage20Input.full_hidden_state_audit,
    visible_context_package: pkg,
    visible_context_package_digest: computeVisibleContextPackageDigest(pkg),
    visible_context_code_precheck: precheck
  });
}

function checks(pass = true) {
  return Object.fromEntries(STAGE21_REQUIRED_CHECKS.map((key) => [key, { pass }]));
}

function successAudit(input) {
  return {
    version: 1,
    schema: 'visible_context_audit',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    pass: true,
    checks: checks(true),
    concerns: [],
    evidence: [
      { kind: 'position_verified' },
      { kind: 'hidden_boundary_verified' },
      { kind: 'knowledge_boundary_verified' },
      { kind: 'package_digest_verified', digest: input.visible_context_package_digest }
    ],
    repair_route: null,
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
}

function failedAudit(input, code = 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK') {
  return {
    version: 1,
    schema: 'visible_context_audit',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    pass: false,
    checks: checks(false),
    concerns: [{ code, severity: 'hard_block', message: 'Repair is required.' }],
    evidence: [{ kind: 'field_path', path: 'visible_containers[0].content_summary' }],
    repair_route: {
      return_to_stage: 'stage20_visible_context',
      repair_kind: 'remove_hidden_leak'
    },
    commit_permission: {
      can_send_to_narrator: false,
      can_write_visible_context_snapshot: false,
      can_generate_player_facing_prose: false
    }
  };
}

function routeFor(input, audit) {
  return {
    version: 1,
    schema: 'visible_context_audit_repair_route',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    return_to_stage: 'stage20_visible_context',
    repair_kind: 'remove_hidden_leak',
    concern_codes: [audit.concerns[0].code],
    evidence_refs: [0],
    allowed_mutable_paths: ['visible_containers', 'visible_scene_dossier'],
    forbidden_mutable_paths: ['frame', 'position'],
    requires_reaudit_from_stage: 21
  };
}

test('Stage 21 exact input and independent precheck pass for a valid package', () => {
  const input = makeInput();
  assert.deepEqual(validateStage21Input(input), []);
  const precheck = buildStage21AuditCodePrecheck(input);
  assert.equal(precheck.pass, true, JSON.stringify(precheck.concerns));
  assert.equal(precheck.checks.package_digest_match, true);
  assert.equal(precheck.checks.stage20_precheck_integrity, true);
});

test('Stage 21 successful audit returns a bound result bundle', async () => {
  const input = makeInput();
  const result = await runStage21VisibleContextAuditBlock({
    input,
    auditor: async () => successAudit(input),
    formatRepairer: async () => { throw new Error('format repair must not run'); },
    seniorAuditor: async () => { throw new Error('senior auditor must not run'); },
    auditRouter: async () => { throw new Error('router must not run'); }
  });
  assert.equal(result.schema, 'stage21_visible_context_audit_result');
  assert.equal(result.pass, true);
  assert.equal(result.visible_context_package_digest, input.visible_context_package_digest);
  assert.equal(result.visible_context_audit.pass, true);
  assert.equal(result.commit_permission.can_send_to_narrator, true);
});

test('Stage 21 requires non-empty evidence on success', () => {
  const input = makeInput();
  const precheck = buildStage21AuditCodePrecheck(input);
  const audit = successAudit(input);
  audit.evidence = [];
  const concerns = validateVisibleContextAuditOutput(audit, input, precheck);
  assert.ok(concerns.some((item) => item.code === 'VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING'));
});

test('Stage 21 rejects a changed package digest before the auditor runs', async () => {
  const input = makeInput();
  input.visible_context_package.position.anchor_id = 'anchor-changed';
  let called = false;
  await assert.rejects(() => runStage21VisibleContextAuditBlock({
    input,
    auditor: async () => { called = true; return successAudit(input); },
    formatRepairer: async () => ({}),
    seniorAuditor: async () => ({}),
    auditRouter: async () => ({})
  }), /input gate failed/);
  assert.equal(called, false);
});

test('Stage 21 format repair is limited to audit output and then validates normally', async () => {
  const input = makeInput();
  const result = await runStage21VisibleContextAuditBlock({
    input,
    auditor: async () => '```json\n{"pass":true}\n```',
    formatRepairer: async () => successAudit(input),
    seniorAuditor: async () => { throw new Error('senior auditor must not run'); },
    auditRouter: async () => { throw new Error('router must not run'); }
  });
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.format_repair_attempts, 1);
});

test('Stage 21 failed audit invokes LLM router and code-validates the route', async () => {
  const input = makeInput();
  const audit = failedAudit(input);
  const result = await runStage21VisibleContextAuditBlock({
    input,
    auditor: async () => audit,
    formatRepairer: async () => { throw new Error('format repair must not run'); },
    seniorAuditor: async () => { throw new Error('senior auditor must not run'); },
    auditRouter: async () => routeFor(input, audit)
  });
  assert.equal(result.pass, false);
  assert.equal(result.repair_route.return_to_stage, 'stage20_visible_context');
  assert.equal(result.commit_permission.can_send_to_narrator, false);
});

test('Stage 21 code rejects an incompatible repair target', () => {
  const input = makeInput();
  const audit = failedAudit(input, 'VISIBLE_CONTEXT_TIME_LIGHT_UPSTREAM_CONFLICT');
  const route = routeFor(input, audit);
  route.return_to_stage = 'stage15_npc_placement';
  route.repair_kind = 'repair_npc_placement';
  const concerns = validateStage21RepairRoute(route, audit);
  assert.ok(concerns.some((item) => item.code === 'VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INCOMPATIBLE'));
});

test('Stage 21 rejects an audit that contains the visible package or narrator prose', () => {
  const input = makeInput();
  const precheck = buildStage21AuditCodePrecheck(input);
  const audit = successAudit(input);
  audit.visible_context_package = input.visible_context_package;
  audit.prose = 'Narrator text';
  const concerns = validateVisibleContextAuditOutput(audit, input, precheck);
  assert.ok(concerns.some((item) => item.code === 'VISIBLE_CONTEXT_AUDIT_MUTATED_PACKAGE'));
  assert.ok(concerns.some((item) => item.code === 'VISIBLE_CONTEXT_AUDIT_NARRATOR_PROSE_PRESENT'));
});

test('Provided Stage 21 output is forbidden in every environment', () => {
  assert.throws(() => validateProvidedStage21Result(), /forbidden/);
});
