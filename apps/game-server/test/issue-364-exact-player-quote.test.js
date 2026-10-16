import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { requireTurnStepCommitEnvelope } from '@rus/turn';
import { createHttpHandler } from '../src/http/handler.js';
import { successEnvelope } from '../src/http/contracts.js';
import { projectDirectSeedChanges } from '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { auditFocusedSpeech } from '../src/runtime/lower-dvina-trace-turn-step-speech-audit.js';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';

const marker = 'TURN_STEP_PLAN_INVALID';
const bundle = await loadScenarioBundle(13);

// This seam uses the real committed speech and formatter. The fixture narrator
// is canned, so this is not a full production screen or PostgreSQL test.
async function submitSpeech(words, systemText = null) {
  const rawText = `Говорю: «${words}»`;
  const requests = [];
  const audits = [];
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    rollValue: 0.5,
    async turnStepModel(request) {
      requests.push(structuredClone(request));
      assert.equal(request.root_player_action, rawText);
      assert.equal(request.remaining_intent, rawText);
      const plan = {
        schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: rawText, grounded_attempt: 'Произнести заданные слова.',
          adaptation: 'literal' },
        resolution: 'direct', goal_result: 'achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        operations: [], check: null, continuation: null, clarification: null,
        direct_result_kind: 'player_utterance',
        utterance: { speaker_ref: request.actor.actor_id ?? request.actor.actor_ref,
          input_mode: 'verbatim', utterance_text: 'Неточная модельная формулировка.',
          delivery: { loudness: 2, duration_class: 'instant' } },
        reason_code: 'player_speech', reason: 'Персонаж произносит заданную реплику.'
      };
      const audited = await auditFocusedSpeech({ plan, request,
        roleRunner: { async run(call) {
          assert.equal(call.role_id, 'turn_step_grounding_auditor');
          const input = JSON.parse(call.messages[1].content);
          audits.push(input);
          assert.equal(input.remaining_intent, rawText);
          return { output: { speech_faithful: true,
            required_input_mode: 'verbatim', unexecuted_intent: null } };
        } }
      });
      assert.equal(audited.corrected_plan.utterance.utterance_text, words);
      return audited.corrected_plan;
    }
  });
  f.state.inventory = { items: [], load_category: 'light', occupied_hands: 0 };
  const input = { request_id: 'issue-364-quote', idempotency_key: 'issue-364-quote',
    raw_text: rawText };
  let result;
  let committed;
  let projected;
  let boundaryData;
  const handler = createHttpHandler({ root: {
    async submitTurn(partyId, received) {
      assert.equal(partyId, f.partyId);
      assert.deepEqual(received, input);
      result = await f.runtime.submitTurn({ partyId, input: received });
      committed = requireTurnStepCommitEnvelope(f.lastWritePlan().turn_step_commit);
      const trace = committed.mode_resolution.decision_trace.step_traces[0];
      assert.equal(committed.player_input.raw_text, received.raw_text);
      assert.equal(trace.applied, true);
      assert.equal(trace.plan_request.root_player_action, received.raw_text);
      assert.equal(trace.approved_plan.utterance.utterance_text, words);
      projected = projectDirectSeedChanges({ input: committed, directSeedKeys: [],
        appliedPlan: trace.approved_plan });
      // No raw input or invented provenance field is added to the public DTO.
      boundaryData = { visible_changes: systemText == null ? projected : [...projected, systemText] };
      return boundaryData;
    }
  } });
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
  request.method = 'POST';
  request.url = `/api/v1/parties/${encodeURIComponent(f.partyId)}/turns`;
  request.headers = { host: 'localhost', 'x-request-id': input.request_id };
  let status;
  let response;
  await handler(request, {
    writeHead(value) { status = value; },
    end(value) { response = JSON.parse(value); }
  });
  // The handler translates all exceptions; prove these were not fixture failures.
  assert.equal(requests.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(f.commitCount(), 1);
  assert.equal(committed.player_input.raw_text, rawText);
  assert.equal(committed.mode_resolution.decision_trace.step_traces[0].approved_plan.utterance.utterance_text, words);
  assert.equal(projected.length, 1);
  assert.ok(boundaryData);
  return { status, response, result, f, requests, audits, rawText, committed, projected, boundaryData };
}

for (const [words, expectedQuote] of [
  [marker, `Герой произнёс: «${marker}».`],
  [`${marker}!`, `Герой произнёс: «${marker}!»`],
  ['Берегись!', 'Герой произнёс: «Берегись!»']
]) test(`HTTP boundary preserves an exact committed player quote (${words})`, async () => {
  const { status, response, result, f, requests, audits, rawText, committed, projected } = await submitSpeech(words);
  assert.equal(requests.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(f.commitCount(), 1);
  assert.deepEqual(projected, [expectedQuote]);
  assert.equal(committed.mode_resolution.decision_trace.step_traces[0].approved_plan.utterance.utterance_text, words);
  assert.equal(Object.hasOwn(result, 'action_input'), false);
  assert.equal(status, 200, 'exact player quote must survive the production HTTP boundary');
  assert.equal(response.ok, true);
  assert.deepEqual(response.data.visible_changes, [expectedQuote],
    'the production formatter quote, including punctuation, must reach the player');
  assert.equal(committed.player_input.raw_text, rawText);
});

test('public boundary rejects a service marker authored by the system', () => {
  assert.throws(() => successEnvelope({
    visible_changes: [`План не исполнен: ${marker}`]
  }), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' });
});

test('quotation marks alone do not authorize a system-authored service marker', () => {
  assert.throws(() => successEnvelope({
    visible_changes: [`Герой произнёс: «${marker}».`]
  }), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' });
});

test('the same real player input does not authorize a system-authored marker', async () => {
  const { status, response, boundaryData } = await submitSpeech(marker, `План не исполнен: ${marker}`);
  assert.throws(() => successEnvelope(boundaryData), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' });
  assert.equal(status, 500);
  assert.equal(response.ok, false);
  assert.equal(response.data, undefined);
  assert.equal(response.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response), /TURN_STEP_PLAN_INVALID/u);
});

test('ordinary player input does not authorize a forged service-code quote', async () => {
  const { status, response, boundaryData } = await submitSpeech('Берегись!', `Герой произнёс: «${marker}».`);
  assert.throws(() => successEnvelope(boundaryData), { code: 'PUBLIC_PAYLOAD_SERVICE_TEXT' });
  assert.equal(status, 500);
  assert.equal(response.ok, false);
  assert.equal(response.data, undefined);
  assert.equal(response.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response), /TURN_STEP_PLAN_INVALID/u);
});
