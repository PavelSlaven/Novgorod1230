const OPERATIONS = new Set(['export', 'import', 'seed', 'audit']);
const TARGETS = new Set(['world_base', 'party_db']);

export function validateDbToolManifest(manifest = {}) {
  const errors = [];
  if (manifest.schema_version !== 'rus.db_tool_manifest.v1') errors.push('schema_version must be rus.db_tool_manifest.v1');
  if (!OPERATIONS.has(text(manifest.operation))) errors.push('operation is invalid');
  if (!TARGETS.has(text(manifest.target))) errors.push('target is invalid');
  if (!text(manifest.source_id)) errors.push('source_id is required');
  if (!text(manifest.source_checksum)) errors.push('source_checksum is required');
  if (['import','seed'].includes(text(manifest.operation))) {
    if (manifest.dry_run !== true) errors.push('write-like operation requires dry_run=true');
    if (!text(manifest.approval_id)) errors.push('write-like operation requires approval_id');
  }
  if (manifest.statements || manifest.sql) errors.push('manifest may not contain executable SQL');
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function createDbToolPlan(manifest = {}) {
  const validation = validateDbToolManifest(manifest);
  if (!validation.ok) throw new TypeError(`invalid DB tool manifest: ${validation.errors.join('; ')}`);
  return Object.freeze({
    schema_version: 'rus.db_tool_plan.v1',
    operation: manifest.operation,
    target: manifest.target,
    source: Object.freeze({ id: manifest.source_id, checksum: manifest.source_checksum }),
    approval_id: manifest.approval_id ?? null,
    dry_run_required: ['import','seed'].includes(manifest.operation),
    executor_required: true
  });
}

export function assertDbExecutionApproval(plan = {}, approval = {}) {
  if (plan.schema_version !== 'rus.db_tool_plan.v1') throw new TypeError('invalid DB tool plan');
  if (!plan.dry_run_required) return true;
  if (approval.schema_version !== 'rus.db_tool_approval.v1') throw new TypeError('invalid DB tool approval');
  if (text(approval.approval_id) !== text(plan.approval_id)) throw new Error('approval_id mismatch');
  if (approval.dry_run_passed !== true) throw new Error('dry-run approval is required');
  if (text(approval.source_checksum) !== text(plan.source.checksum)) throw new Error('source checksum mismatch');
  return true;
}

function text(value) { return String(value ?? '').trim(); }
