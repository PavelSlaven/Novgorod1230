import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { requestTurnStepPlan } from '@rus/turn';
import { assembleNarrationAuditOutput } from
  '../src/runtime/lower-dvina-trace-narration-audit.js';
import { buildFrozenRoleMessages } from
  '../../../tools/llm-runtime-eval/src/frozen-role-messages.mjs';

const frozenRoleRequestsUrl = new URL('../../../data/model-evals/llm-runtime/'
  + 'frozen-role-requests-v1.json', import.meta.url);

test('frozen role fixtures ship exact production-built messages', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  const mismatches = [];
  for (const fixture of corpus.fixtures) {
    try {
      assert.deepEqual(await buildFrozenRoleMessages(fixture), fixture.messages);
    } catch (error) {
      mismatches.push(`${fixture.id}: ${error.message}`);
    }
  }
  assert.equal(mismatches.length, 0, mismatches.join('\n'));
});

test('frozen narration writer fixtures expose only model-owned prose', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ role_id }) =>
    role_id === 'gameplay_narrator' || role_id === 'gameplay_narrator_format_repair')) {
    assert.deepEqual(Object.keys(fixture.expected_output), ['prose'], fixture.id);
    if (fixture.role_id === 'gameplay_narrator') {
      assert.match(fixture.messages[0].content,
        /^Возвращай только объект JSON вида \{"prose":"<полный русский текст прозы>"\}\./u,
        fixture.id);
      assert.match(fixture.messages[0].content, /Сначала передай текущий эпизод/u,
        fixture.id);
    } else {
      assert.match(fixture.messages[0].content,
        /^Возвращай только объект JSON вида \{"prose":"<полный русский текст прозы>"\}\./u,
        fixture.id);
    }
  }
});

test('frozen narration auditor prompts require the raw source-review shape', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ role_id }) =>
    role_id === 'gameplay_narrator_auditor')) {
    const prompt = fixture.messages[0].content;
    assert.match(prompt, /source_reviews должен содержать ровно показанные refs/u);
    assert.match(prompt, /Для пропущенного или переданного частично источника используй\s+\[\]/u);
    assert.match(prompt,
      /встроенный\s+неизвестный\s+результат должен оставаться неизвестным/u);
    assert.match(prompt, /unsupported содержит только/u);
    assert.match(prompt, /literary_failures содержит только/u);
    assert.doesNotMatch(prompt, /failure_checks/u);
    assert.doesNotMatch(prompt, /artistic_verdict|technical_verdict|concerns/u);
    assert.doesNotMatch(prompt, /"pass":/u);
  }
});

test('frozen dense controls distinguish terminal static clusters from governed prose', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  const controls = new Set([
    'gameplay-narrator-auditor-cycle17-shore-catalogue',
    'gameplay-narrator-auditor-dense-storeyard-terminal-static',
    'gameplay-narrator-auditor-dense-cellar-terminal-static',
    'gameplay-narrator-auditor-dense-storeyard-governed-action',
    'gameplay-narrator-auditor-dense-cellar-finite-perception'
  ]);
  const fixtures = corpus.fixtures.filter(({ id }) => controls.has(id));
  assert.equal(fixtures.length, controls.size);
  for (const fixture of fixtures) {
    const assembled = assembleNarrationAuditOutput(fixture.expected_output, {
      ...fixture.request,
      visible_context: fixture.request.visible_context
    });
    const governed = fixture.id.endsWith('governed-action')
      || fixture.id.endsWith('finite-perception');
    assert.equal(assembled.pass, true, fixture.id);
    assert.equal(assembled.concerns.some(({ kind }) =>
      kind === 'literary_quality'), !governed, fixture.id);
  }
});

test('Stage A frozen fixtures leave descriptor semantic while retaining code-owned assertions', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ id }) =>
    id === 'ordinary-stage-a-seed-shore' || id === 'ordinary-stage-a-repair-seed-shore')) {
    assert.deepEqual(fixture.expected.required_refs, ['basis', 'property', 'disclosure']);
    assert.deepEqual(fixture.expected.required_values, {
      resolution: 'seeded', density_band_proposal: 'ordinary',
      'background_groups.0.functional_bucket': 'other_ordinary'
    });
  }
});

test('unowned domain intent uses one direct planner step', async () => {
  const request = {
    schema: 'turn_step_request_v1', request_id: 'unowned-domain-probe',
    root_turn_id: 'turn:probe', committed_state_version: 1,
    working_revision: 0, step_index: 1, max_internal_steps: 8,
    root_player_action: 'unowned-domain-probe',
    remaining_intent: 'unowned-domain-probe', completed_steps: [],
    actor: { actor_ref: 'actor:probe' }, player_safe_state: {}
  };
  let calls = 0;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      calls += 1;
      assert.match(call.messages[0].content,
        /domain_request only when player_safe_state contains the exact/u);
      return { output: {
        schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: 1, working_revision: 0, step_index: 1,
        interpretation: { player_goal: request.root_player_action,
          grounded_attempt: request.remaining_intent, adaptation: 'literal' },
        resolution: 'direct', goal_result: 'achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        operations: [], check: null, continuation: null, clarification: null,
        direct_result_kind: 'no_state_gesture',
        reason_code: 'unowned_domain_capability', reason: 'No owner.'
      } };
    }
  } });
  const plan = await requestTurnStepPlan({ request, turnStepModel: model });
  assert.equal(plan.resolution, 'direct');
  assert.deepEqual(plan.operations, []);
  assert.equal(calls, 1);
});
