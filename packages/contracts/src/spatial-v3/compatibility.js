/**
 * Target-only composition guard.  Storage versions may coexist during the
 * migration, but one request must use exactly one schema for its reader and
 * writer.  This module is deliberately pure: it neither selects an adapter
 * nor changes the active production profile.
 */
export function validateRuntimeComposition(input = {}) {
  const storageVersions = Array.isArray(input.storage_versions) ? input.storage_versions : [];
  const request = input.request_schema_version;
  const reader = input.reader_schema_version;
  const writer = input.writer_schema_version;
  const errors = [];

  if (!storageVersions.includes(request)) errors.push('request_schema_version_unavailable');
  if (![2, 3].includes(request) || reader !== request || writer !== request) errors.push('mixed_runtime_composition');
  if (input.fallback_schema_version != null) errors.push('runtime_fallback_forbidden');
  if (input.current_position_contract != null && input.current_position_contract !== `v${request}`) errors.push('position_contract_schema_mismatch');
  if (input.target_records_schema_version != null && input.target_records_schema_version !== request) errors.push('target_record_schema_mismatch');

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
