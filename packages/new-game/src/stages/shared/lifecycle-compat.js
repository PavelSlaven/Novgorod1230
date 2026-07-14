import { createHash } from 'node:crypto';
import { createGateResult } from '@rus/pipeline-engine';
export { createGateResult };
export function assertGatePassed(result) {
  if (!result?.pass) {
    const details = (result?.concerns ?? []).map((item) => item.message ?? item.code).join('; ');
    throw new Error(`New-game stage gate failed: ${details || 'unknown gate failure'}`);
  }
}
export function createFrozenArtifactRecord({ artifact, artifactId, stageId, stageSlug, schema, version, producedBy = null, validationStatus = 'passed', auditStatus = 'not_required', dependencyStatus = 'passed', frozenPaths = null } = {}) {
  const normalized = structuredClone(artifact);
  return {
    artifact_id: artifactId ?? `${stageSlug ?? `stage_${stageId}`}:${schema ?? normalized?.schema ?? 'artifact'}`,
    stage_id: stageId ?? null,
    schema: schema ?? normalized?.schema ?? null,
    version: version ?? normalized?.version ?? null,
    hash: createHash('sha256').update(JSON.stringify(normalized ?? null)).digest('hex'),
    frozen_paths: Array.isArray(frozenPaths) && frozenPaths.length > 0 ? [...frozenPaths] : flattenObjectPaths(normalized),
    produced_by: producedBy ?? stageSlug ?? null,
    validation_status: validationStatus,
    audit_status: auditStatus,
    dependency_status: dependencyStatus,
    artifact: normalized
  };
}
function flattenObjectPaths(value, currentPath = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenObjectPaths(item, `${currentPath}[${index}]`));
  if (!value || typeof value !== 'object') return [currentPath];
  const entries = Object.entries(value);
  if (entries.length === 0) return [currentPath];
  return entries.flatMap(([key, nested]) => flattenObjectPaths(nested, `${currentPath}.${key}`));
}
