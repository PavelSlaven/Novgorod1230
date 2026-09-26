import {
  AUTHORED_MATERIALIZER_VERSION,
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';

export function assertLowerDvinaTraceExecutionSupport(
  executionIdentity
) {
  if (![MATERIALIZER_VERSION, AUTHORED_MATERIALIZER_VERSION]
      .includes(executionIdentity?.materializer_version)
    || executionIdentity.rng_algorithm_id !== RNG_VERSION) {
    throw Object.assign(
      new Error(
        'This build does not support the publication-pinned materializer or RNG implementation.'
      ),
      {
        code: 'TRACE_PHASE_1B_EXECUTION_VERSION_UNSUPPORTED',
        status: 409
      }
    );
  }
}
