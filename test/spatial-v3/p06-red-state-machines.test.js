import assert from 'node:assert/strict';
import test from 'node:test';
import { collectStateMachineReport } from '../../tools/spatial-v3/red-contract-harness.mjs';

test('P06 red: Appendix A execution/travel/activity/frontier/claim machines are implemented exhaustively', async () => {
  const report = await collectStateMachineReport();
  assert.ok(report.definitions, `missing target state-machine registry: ${report.artifact.path}`);
  const expected = report.target.stateMachines;
  const actual = report.definitions;
  assert.deepEqual(actual.executionTransitions, expected.executionTransitions, 'execution transition matrix must match Appendix A.4.1 exactly');
  assert.deepEqual(actual.executionEvents, expected.executionEvents, 'execution event mapping must match Appendix A.4.2 exactly');
  for (const key of ['travelStatuses', 'activityStatuses', 'readinessStatuses', 'frontierStatuses', 'claimStatuses']) {
    assert.deepEqual([...actual[key]].sort(), [...expected[key]].sort(), `${key} must be closed and exhaustive`);
  }
});

test('P06 red: invalid Appendix A transition and status combinations are rejected by the target validator', async () => {
  const report = await collectStateMachineReport();
  assert.equal(typeof report.definitions?.validateStateMachine, 'function', 'target state-machine validator is missing');
  const validate = report.definitions.validateStateMachine;
  const statuses = ['absent', 'planned', 'active', 'waiting_at_anchor', 'suspended_at_scene', 'stranded_in_transit', 'completed', 'aborted', 'superseded'];
  const allowed = new Set(report.target.stateMachines.executionTransitions.map(({ from, to }) => `${from}->${to}`));
  for (const from of statuses) for (const to of statuses) {
    assert.equal(
      validate({ machine: 'execution', from, to }).ok,
      allowed.has(`${from}->${to}`),
      `execution ${from} -> ${to} must ${allowed.has(`${from}->${to}`) ? 'be allowed' : 'be rejected'}`
    );
  }
  for (const invalid of [
    { machine: 'execution', from: 'completed', to: 'active' },
    { machine: 'execution', from: 'suspended_at_scene', to: 'active' },
    { machine: 'execution', from: 'stranded_in_transit', to: 'active' },
    { machine: 'frontier', from: 'consumed', to: 'open' },
    { machine: 'claim', from: 'failed', to: 'reserved' }
  ]) assert.equal(validate(invalid).ok, false, `${invalid.machine} invalid transition must be rejected`);
});
