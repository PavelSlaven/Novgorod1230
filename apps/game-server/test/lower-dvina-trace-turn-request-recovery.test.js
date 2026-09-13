import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { errorEnvelope } from '../src/http/contracts.js';

const input = (id = 'recovery:turn') => ({ request_id: id,
  idempotency_key: id, raw_text: 'Внимательно проверяю берег и пытаюсь разобраться в случившемся.' });

test('overlapping exact retries share planner and commit, then use durable replay', async () => {
  let resolves = 0;
  const f = fixture({ beforeSemanticResolve() { resolves += 1; } });
  const request = { partyId: f.partyId, input: input() };
  const [first, retry] = await Promise.all([
    f.runtime.submitTurn(request), f.runtime.submitTurn(structuredClone(request))]);
  assert.deepEqual(first, retry);
  assert.equal(resolves, 1);
  assert.equal(f.commitCount(), 1);
  await f.runtime.submitTurn(request);
  assert.equal(resolves, 1);
  assert.equal(f.commitCount(), 1);
  await assert.rejects(f.runtime.submitTurn({ ...request, input: input('next:intent') }),
    { code: 'TURN_AVAILABLE_ACTION_SET_EMPTY', turn_commit_status: 'not_started' });
});

test('in-flight key conflict rejects changed input without a second planner', async () => {
  const f = fixture();
  const request = { partyId: f.partyId, input: input() };
  const first = f.runtime.submitTurn(request);
  await assert.rejects(f.runtime.submitTurn({ ...request,
    input: { ...request.input, raw_text: 'Другая попытка.' } }),
  { code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT' });
  await first;
  assert.equal(f.commitCount(), 1);
});

test('actual invalid planner output is a public no-commit rejection, including concurrent retry', async () => {
  const f = fixture({ scenarioBundle: await loadScenarioBundle(13),
    turnStepModel: async () => ({}) });
  const request = { partyId: f.partyId, input: input() };
  const results = await Promise.allSettled([
    f.runtime.submitTurn(request), f.runtime.submitTurn(request)]);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'TURN_STEP_PLAN_INVALID');
    const envelope = errorEnvelope(result.reason);
    assert.equal(envelope.body.error.turn_commit_status, 'not_started');
    assert.equal(envelope.body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
  }
  assert.equal(f.commitCount(), 0);
});

test('source grounding rejection before commit permits fresh intent, commit uncertainty does not', async () => {
  const f = fixture({ beforeSemanticResolve() {
    throw Object.assign(new Error('unresolved source'),
      { code: 'TURN_ORDINARY_DISCOVERY_UNRESOLVED' });
  } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: input() }),
    { turn_commit_status: 'not_started' });
  assert.equal(f.commitCount(), 0);
  const uncertain = fixture();
  uncertain.repository.commitPhase2Turn = async () => {
    throw new Error('connection lost at commit');
  };
  await assert.rejects(uncertain.runtime.submitTurn({ partyId: uncertain.partyId,
    input: input() }), (error) => {
    assert.equal(errorEnvelope(error).body.error.turn_commit_status, undefined);
    return true;
  });
});

test('explicit repository rollback reports an authoritative no-commit result', async () => {
  const f = fixture();
  f.repository.commitPhase2Turn = async () => ({
    ok: false,
    error: { code: 'state_version_conflict', diagnostics: {
      turn_commit_status: 'not_started'
    } }
  });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId,
    input: input() }), (error) => {
    assert.equal(error.turn_commit_status, 'not_started');
    assert.equal(errorEnvelope(error).body.error.turn_commit_status,
      'not_started');
    return true;
  });
});

test('live unexpired lease remains commit-ambiguous', async () => {
  const f = fixture();
  f.repository.commitPhase2Turn = async () => ({
    ok: false,
    in_progress: true,
    error: { code: 'state_version_conflict' }
  });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId,
    input: input() }), (error) => {
    assert.equal(error.turn_commit_status, undefined);
    assert.equal(errorEnvelope(error).body.error.turn_commit_status, undefined);
    return true;
  });
});

test('post-commit presentation and replay failures never report no commit', async () => {
  const f = fixture({ afterNarration() { throw new Error('presentation lost'); } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: input() }),
    (error) => {
      assert.equal(error.turn_commit_status, undefined);
      return true;
    });
  assert.equal(f.commitCount(), 1);
  f.repository.loadPhase2Replay = async () => { throw new Error('replay read lost'); };
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: input() }),
    (error) => { assert.equal(error.turn_commit_status, undefined); return true; });
});
