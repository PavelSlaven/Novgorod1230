import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepCommitEnvelope } from '@rus/turn';
import { commitEnvelope } from
  './lower-dvina-trace-turn-step-envelope-fixture.js';

for (const path of [17, {}]) {
  test(`commit validation reports a malformed actor_ref path (${typeof path})`, () => {
    const envelope = commitEnvelope({ clarification: false, check: false });
    const trace = envelope.loop_trace.step_traces[0];
    trace.canonicalizations = [{ attempt: 1, path,
      old_value: 'unknown-executor', new_value: 'actor-1' }];
    envelope.mode_resolution.decision_trace.step_traces[0] =
      structuredClone(trace);

    let result;
    assert.doesNotThrow(() => {
      result = validateTurnStepCommitEnvelope(envelope);
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(
      'step_traces must contain exact ordered code-owned traces'));
  });
}
