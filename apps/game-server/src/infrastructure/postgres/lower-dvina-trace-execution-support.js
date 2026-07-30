import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';

export function assertLowerDvinaTraceExecutionSupport(
  executionIdentity
) {
  if (executionIdentity?.materializer_version !== MATERIALIZER_VERSION
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
