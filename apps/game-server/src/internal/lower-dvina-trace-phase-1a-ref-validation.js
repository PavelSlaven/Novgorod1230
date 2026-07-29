import { MaterializationError } from '@rus/materialization';

export function assertExactContentRef(ref, pin, expected) {
  if (!ref
    || ref.path !== expected?.path
    || ref.id !== expected?.id
    || ref.revision !== expected?.revision
    || ref.schema !== expected?.schema
    || ref.digest !== pin?.digest) {
    throw new MaterializationError(
      'TRACE_SCENARIO_ARTIFACT_REF_MISMATCH',
      `Exact content ref mismatch for ${pin?.key ?? 'unknown artifact'}.`
    );
  }
}
