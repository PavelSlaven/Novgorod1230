import assert from 'node:assert/strict';
import test from 'node:test';
import { committedTraceScenarioDefinitionRevision } from
  '../src/runtime/lower-dvina-trace-committed-revision.js';

test('committed revision 24 is executable without changing historical revisions', () => {
  for (const revision of [7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24]) {
    assert.equal(committedTraceScenarioDefinitionRevision({
      materialization_trace: { seed_context: { scenario_definition_revision: revision } }
    }), revision);
  }
  assert.throws(() => committedTraceScenarioDefinitionRevision({
    materialization_trace: { seed_context: { scenario_definition_revision: 25 } }
  }), { code: 'TRACE_TURN_SCENARIO_REVISION_NOT_EXECUTABLE' });
});
