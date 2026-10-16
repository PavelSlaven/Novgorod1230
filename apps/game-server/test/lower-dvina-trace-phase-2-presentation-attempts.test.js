import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { resolveCommittedPhase2PresentationAfterFailure } from
  '../src/runtime/lower-dvina-trace-phase-2-presentation-resolve.js';

// Real role runner + real turn budget (real claimRepair): the same request_identity is
// used by every narrator pass of one request, so the semantic repair is claimable once.
const visibleContext = { version: 1, schema: 'visible_context_package',
  visible_scene: 'Опушка', visible_changes: ['Вы рассмотрели деревья.'],
  sensory_details: ['Различимы очертания деревьев.'], visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [],
  allowed_tensions: [], do_not_imply: [], current_light_phase: 'daylight' };
const narrationRequest = { version: 1, schema: 'narration_request', request_id: 'turn:attempts',
  surface: 'turn', visible_context: visibleContext, context: {} };

const pendingResult = { party_id: 'party-1', turn_number: 2, state_version: 3,
  screen: { screen_status: 'committed_presentation_pending' } };
const replay = { input_digest: 'd'.repeat(64), state: { party_state: { turn_number: 2 } },
  public_result: pendingResult, screen: pendingResult.screen };

function harness({ goodWriterFromCall }) {
  const turnBudget = createLlmTurnBudget();
  const calls = [];
  let writerCalls = 0;
  const execute = async ({ roleId, messages }) => {
    calls.push(roleId);
    const request = JSON.parse(messages[1].content);
    let parsed;
    if (roleId === 'gameplay_narrator') {
      writerCalls += 1;
      parsed = { prose: writerCalls >= goodWriterFromCall
        ? 'Вы рассмотрели деревья и различили их очертания.'
        : 'В полумраке вы различаете очертания деревьев.' };
    } else if (roleId === 'gameplay_narrator_auditor') {
      const segment = request.segments[0].segment_id;
      const bad = request.output.prose.includes('полумраке');
      parsed = { reviewed_segments: [segment],
        source_reviews: [{ ref: 'visible_change_1', segment_choices: bad ? [] : [segment] }],
        unsupported: bad ? [{ segment_choice: segment,
          kind: 'unsupported_sensory', reason: 'No supplied local dimness.' }] : [],
        literary_failures: [], evidence: bad ? [] : ['Grounded prose.'] };
    } else if (roleId === 'gameplay_narrator_semantic_repair') {
      parsed = { replacements: [{ prose: 'В полумраке вы снова различаете деревья.' }] };
    } else throw new Error(`Unexpected role ${roleId}`);
    return { status: 'ok', parsed_json: parsed, provider: 'test', model: 'test',
      scope: 'turn_runtime', role_id: roleId, tier_id: null, durationMs: 1, config_hash: 'x' };
  };
  const roleRunner = createLlmRoleRunnerAdapter({ turnBudget, execute });
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner });
  // Same mapping as the presentation service: a non-approved flow or a thrown narrator
  // becomes the expected post-commit failure.
  const outcomes = [];
  const repository = {
    async loadPhase2Replay() { return structuredClone(replay); },
    async replayPhase2Turn() {
      try {
        const flow = await narrator.run(structuredClone(narrationRequest));
        outcomes.push(flow?.status);
        if (flow?.status === 'approved' && flow.pass === true) {
          return { ...pendingResult, screen: { screen_status: 'ready',
            main_prose: flow.approved_output.prose } };
        }
      } catch (error) {
        outcomes.push(error.code);
      }
      throw Object.assign(new Error('rejected'), { code: 'TRACE_PHASE_2_NARRATION_REJECTED' });
    }
  };
  return { turnBudget, calls, narrator, repository, outcomes };
}

function resolve(h) {
  return resolveCommittedPhase2PresentationAfterFailure({ partyId: 'party-1',
    idempotencyKey: 'idem-1', inputDigest: replay.input_digest, repository: h.repository,
    narrator: h.narrator, turnBudget: h.turnBudget, fallback: structuredClone(pendingResult) });
}

test('one request makes exactly two narrator passes: the workflow pass and one replay', async () => {
  const h = harness({ goodWriterFromCall: 99 });
  const result = await h.turnBudget.runTurn(async () => {
    const first = await h.narrator.run(structuredClone(narrationRequest));
    assert.notEqual(first.status, 'approved');
    return resolve(h);
  });
  assert.equal(result.screen.screen_status, 'committed_presentation_pending');
  assert.equal(h.calls.filter((role) => role === 'gameplay_narrator').length, 2);
});

test('the replay pass reuses the request identity: a second semantic repair is refused by claimRepair', async () => {
  const h = harness({ goodWriterFromCall: 99 });
  await h.turnBudget.runTurn(async () => {
    await h.narrator.run(structuredClone(narrationRequest));
    await resolve(h);
  });
  // Pass 1 spent the only semantic repair; the replay pass fails on the claim, before the provider.
  assert.equal(h.calls.filter((role) => role === 'gameplay_narrator_semantic_repair').length, 1);
  assert.deepEqual(h.outcomes, ['LLM_TURN_REPAIR_ALREADY_CLAIMED']);
});

test('the replay pass delivers prose when the writer passes the audit without needing repair', async () => {
  const h = harness({ goodWriterFromCall: 2 });
  const result = await h.turnBudget.runTurn(async () => {
    await h.narrator.run(structuredClone(narrationRequest));
    return resolve(h);
  });
  assert.equal(result.screen.screen_status, 'ready');
  assert.equal(h.calls.filter((role) => role === 'gameplay_narrator').length, 2);
});
