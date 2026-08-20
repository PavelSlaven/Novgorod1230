import { serverError } from '../errors.js';

export function committedTraceScenarioDefinitionRevision(state) {
  const revision = Number(
    state.materialization_trace?.seed_context
      ?.scenario_definition_revision
  );
  if (![7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(revision)) {
    throw serverError(
      'TRACE_TURN_SCENARIO_REVISION_NOT_EXECUTABLE',
      'The committed scenario revision has no approved turn execution package.',
      { status: 409 }
    );
  }
  return revision;
}
