import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNarratorStartCodePrecheck,
  buildStage22NarratorInput,
  runStage22NarratorProseBlock,
  STAGE22_OUTPUT_SCHEMA,
  STAGE22_RESULT_SCHEMA,
  validateNarratorStartingProseOutput,
  validateProvidedStage22Result,
  validateStage22Input
} from '../stages/stage22-narrator-prose.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import { makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

function makeStage21Result(pkg) {
  const digest = computeVisibleContextPackageDigest(pkg);
  return {
    version: 1,
    schema: 'stage21_visible_context_audit_result',
    request_id: 'req-1',
    pass: true,
    visible_context_package_digest: digest,
    audit_code_precheck: { version: 1, schema: 'visible_context_audit_code_precheck', request_id: 'req-1', pass: true },
    visible_context_audit: {
      version: 1,
      schema: 'visible_context_audit',
      request_id: 'req-1',
      pass: true,
      visible_context_package_digest: digest,
      repair_route: null,
      commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    },
    repair_route: null,
    commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
  };
}

function makeInput() {
  const pkg = makeVisibleContextPackage();
  return buildStage22NarratorInput({
    request_id: 'req-1',
    visible_context_package: pkg,
    visible_context_package_digest: computeVisibleContextPackageDigest(pkg),
    stage21_result: makeStage21Result(pkg)
  });
}

function makeProse(overrides = {}) {
  return {
    version: 1,
    schema: STAGE22_OUTPUT_SCHEMA,
    request_id: 'req-1',
    prose_status: 'drafted',
    prose: 'Ты стоишь у текущего якоря. Ночь освещена огнём; рядом виден незнакомый человек и закрытый сундук.',
    action_options: [{
      option_id: 'option-1',
      label: 'Обратиться к человеку',
      action_kind: 'ask',
      target_ref: { anchor_id: null, npc_instance_id: 'npc-1', item_instance_id: null, container_instance_id: null },
      basis: 'visible',
      risk_hint: 'unknown',
      must_not_reveal_hidden_truth: true
    }],
    used_visible_context_refs: ['anchor-1', 'npc-1', 'container-1'],
    self_constraints_check: {
      used_only_visible_context: true,
      did_not_add_new_world_facts: true,
      did_not_reveal_hidden_state: true,
      preserved_time_weather_light: true,
      preserved_position: true,
      rumors_remain_rumors: true,
      uncertainty_remains_uncertain: true
    },
    ...overrides
  };
}

const noOpFormat = async ({ parsed_writer_response }) => parsed_writer_response;
const validSenior = async () => makeProse();

test('Stage 22 exact input validates and independent precheck passes', () => {
  const input = makeInput();
  assert.deepEqual(validateStage22Input(input), []);
  const precheck = buildNarratorStartCodePrecheck(input);
  assert.equal(precheck.pass, true);
  assert.equal(precheck.checks.visible_context_package_digest_valid, true);
  assert.equal(precheck.checks.no_hidden_inputs_present, true);
});

test('Stage 22 rejects a digest mismatch before calling writer', async () => {
  const input = makeInput();
  input.visible_context_package_digest = 'sha256:bad';
  let called = false;
  await assert.rejects(() => runStage22NarratorProseBlock({
    input,
    writer: async () => { called = true; return makeProse(); },
    formatRepairer: noOpFormat,
    seniorWriter: validSenior
  }), /input gate failed/);
  assert.equal(called, false);
});

test('writer receives only visible package, digest, policy and output contract', async () => {
  const input = makeInput();
  let received;
  const result = await runStage22NarratorProseBlock({
    input,
    writer: async (roleInput) => { received = roleInput; return makeProse(); },
    formatRepairer: noOpFormat,
    seniorWriter: validSenior
  });
  assert.equal(result.schema, STAGE22_RESULT_SCHEMA);
  assert.equal(result.pass, true);
  assert.equal(received.schema, 'narrator_start_writer_request');
  assert.ok(received.visible_context_package);
  assert.ok(received.visible_context_package_digest);
  assert.ok(received.narrator_policy);
  assert.ok(received.output_contract);
  assert.equal('visible_context_approval' in received, false);
  assert.equal('visible_context_audit' in received, false);
  assert.equal('narrator_start_code_precheck' in received, false);
  assert.equal('full_hidden_scene_state' in received, false);
  assert.equal('character_knowledge_map' in received, false);
});

test('strict validator rejects an action target absent from visible context', () => {
  const input = makeInput();
  const precheck = buildNarratorStartCodePrecheck(input);
  const output = makeProse({
    action_options: [{
      option_id: 'option-1', label: 'Спросить', action_kind: 'ask',
      target_ref: { npc_instance_id: 'npc-missing' }, basis: 'visible', risk_hint: 'none', must_not_reveal_hidden_truth: true
    }]
  });
  const concerns = validateNarratorStartingProseOutput(output, input, precheck);
  assert.ok(concerns.some((item) => item.code === 'NARRATOR_ACTION_TARGET_NOT_VISIBLE'));
});

test('format repair fixes only malformed wrapper before validation', async () => {
  const input = makeInput();
  let formatCalls = 0;
  const malformed = makeProse({ schema: 'wrong_wrapper' });
  const result = await runStage22NarratorProseBlock({
    input,
    writer: async () => malformed,
    formatRepairer: async () => { formatCalls += 1; return { ...malformed, schema: STAGE22_OUTPUT_SCHEMA }; },
    seniorWriter: validSenior
  });
  assert.equal(formatCalls, 1);
  assert.equal(result.pass, true);
  assert.equal(result.narrator_starting_prose.prose, malformed.prose);
  assert.deepEqual(result.narrator_starting_prose.action_options, malformed.action_options);
  assert.equal(result.diagnostics.format_repair_attempts, 1);
});

test('format repair cannot rewrite prose or action semantics', async () => {
  const input = makeInput();
  const malformed = makeProse({ schema: 'wrong_wrapper' });
  await assert.rejects(() => runStage22NarratorProseBlock({
    input,
    writer: async () => malformed,
    formatRepairer: async () => ({ ...makeProse(), prose: 'Другая сцена.' }),
    seniorWriter: async () => malformed
  }), /format repair failed|output validation failed/);
});

test('senior writer repairs structurally invalid prose result', async () => {
  const input = makeInput();
  let seniorCalls = 0;
  const invalid = makeProse({ request_id: 'wrong' });
  const result = await runStage22NarratorProseBlock({
    input,
    writer: async () => invalid,
    formatRepairer: noOpFormat,
    seniorWriter: async () => { seniorCalls += 1; return makeProse(); }
  });
  assert.equal(seniorCalls, 1);
  assert.equal(result.pass, true);
});

test('provided Stage 22 result is forbidden in all environments', () => {
  assert.throws(() => validateProvidedStage22Result(), /forbidden/);
});
