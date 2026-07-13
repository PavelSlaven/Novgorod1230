import { createHash } from 'node:crypto';
import { createGateResult } from './gate.js';
import { diffForbiddenPathChanges, flattenObjectPaths } from './validators.js';

export const PRIMARY_STAGE_TYPES = Object.freeze([
  'semantic_generation',
  'semantic_selection',
  'contract_shaping',
  'semantic_audit'
]);

export function evaluateDependencyGate(context, {
  stageId,
  stageSlug,
  gateKind,
  requirements = [],
  output = null
} = {}) {
  const concerns = [];
  const evidence = [];

  for (const requirement of requirements) {
    const resolved = resolveRequirement(context, requirement, output);
    if (!resolved.pass) {
      concerns.push({
        code: gateKind === 'pre_dependency_gate' ? 'PRE_DEPENDENCY_GATE_FAILED' : 'POST_DEPENDENCY_GATE_FAILED',
        message: resolved.message,
        field: resolved.field ?? null,
        dependency: resolved.dependency ?? null
      });
    } else if (resolved.evidence) {
      evidence.push(resolved.evidence);
    }
  }

  return createGateResult({
    stageId,
    stageSlug,
    gateKind,
    pass: concerns.length === 0,
    concerns,
    evidence
  });
}

export function deriveMutableScope({
  policyAllowedPaths = [],
  policyForbiddenPaths = [],
  structuralValidation = null,
  semanticAudit = null,
  frozenPaths = []
} = {}) {
  const allowed = new Set(policyAllowedPaths);
  const forbidden = new Set([...policyForbiddenPaths, ...frozenPaths]);

  for (const concern of structuralValidation?.concerns ?? []) {
    if (typeof concern?.field === 'string') allowed.add(normalizeFieldPath(concern.field));
  }
  for (const path of semanticAudit?.allowed_repair_paths ?? []) {
    if (typeof path === 'string') allowed.add(normalizeFieldPath(path));
  }
  for (const path of semanticAudit?.forbidden_repair_paths ?? []) {
    if (typeof path === 'string') forbidden.add(normalizeFieldPath(path));
  }

  return {
    allowed_mutable_paths: [...allowed].filter((path) => path && !forbidden.has(path)).sort(),
    forbidden_mutable_paths: [...forbidden].filter(Boolean).sort()
  };
}

export function createFrozenArtifactRecord({
  artifact,
  artifactId,
  stageId,
  stageSlug,
  schema,
  version,
  producedBy = null,
  validationStatus = 'passed',
  auditStatus = 'not_required',
  dependencyStatus = 'passed',
  frozenPaths = null
} = {}) {
  const normalized = structuredClone(artifact);
  return {
    artifact_id: artifactId ?? `${stageSlug ?? `stage_${stageId}`}:${schema ?? normalized?.schema ?? 'artifact'}`,
    stage_id: stageId ?? null,
    schema: schema ?? normalized?.schema ?? null,
    version: version ?? normalized?.version ?? null,
    hash: hashArtifact(normalized),
    frozen_paths: Array.isArray(frozenPaths) && frozenPaths.length > 0 ? [...frozenPaths] : flattenObjectPaths(normalized),
    produced_by: producedBy ?? stageSlug ?? null,
    validation_status: validationStatus,
    audit_status: auditStatus,
    dependency_status: dependencyStatus,
    artifact: normalized
  };
}

export function evaluateAntiRegression({
  previousArtifact = null,
  repairedArtifact = null,
  allowedMutablePaths = [],
  forbiddenMutablePaths = [],
  semanticAudit = null
} = {}) {
  const concerns = [];
  if (!previousArtifact || !repairedArtifact) {
    return {
      pass: true,
      concerns,
      diff: []
    };
  }

  const changedForbidden = diffForbiddenPathChanges(previousArtifact.artifact ?? previousArtifact, repairedArtifact, forbiddenMutablePaths);
  for (const path of changedForbidden) {
    concerns.push({
      code: 'ANTI_REGRESSION_FORBIDDEN_PATH_CHANGED',
      message: `repair changed forbidden path ${path}`,
      field: path
    });
  }

  for (const path of flattenObjectPaths(previousArtifact.artifact ?? previousArtifact)) {
    if (path === 'root') continue;
    if (forbiddenMutablePaths.includes(path)) continue;
    if (allowedMutablePaths.includes(path)) continue;
    const before = readPath(previousArtifact.artifact ?? previousArtifact, path);
    const after = readPath(repairedArtifact, path);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      concerns.push({
        code: 'ANTI_REGRESSION_UNALLOWED_CHANGE',
        message: `repair changed unapproved path ${path}`,
        field: path
      });
    }
  }

  if (!isPlainObject(repairedArtifact)) {
    concerns.push({
      code: 'ANTI_REGRESSION_NOT_OBJECT',
      message: 'repair returned non-object artifact'
    });
  }
  if (repairedArtifact?.schema !== (previousArtifact.artifact ?? previousArtifact)?.schema) {
    concerns.push({
      code: 'ANTI_REGRESSION_SCHEMA_CHANGED',
      message: 'repair changed schema of previously valid artifact'
    });
  }
  if (repairedArtifact?.version !== (previousArtifact.artifact ?? previousArtifact)?.version) {
    concerns.push({
      code: 'ANTI_REGRESSION_VERSION_CHANGED',
      message: 'repair changed version of previously valid artifact'
    });
  }

  return {
    pass: concerns.length === 0,
    concerns,
    diff: changedForbidden
  };
}

export function createLifecycleFailure({
  stageId,
  stageSlug,
  stageType,
  failedGate,
  concerns = [],
  terminalStatus = 'stage_failed',
  repairHistory = []
} = {}) {
  const error = new Error(concerns.map((item) => item.message ?? item.code).join('; ') || `Lifecycle failed at ${stageSlug}`);
  error.lifecycle = {
    stage_id: stageId,
    stage_slug: stageSlug,
    stage_type: stageType,
    failed_gate: failedGate,
    concerns,
    terminal_status: terminalStatus,
    repair_attempts: repairHistory.length
  };
  return error;
}

function resolveRequirement(context, requirement, output) {
  if (typeof requirement === 'function') return requirement({ context, output });
  if (!requirement || typeof requirement !== 'object') {
    return { pass: true, evidence: 'no dependency requirement' };
  }

  if (requirement.frozenArtifact) {
    const artifact = context.getFrozenArtifactBySchema?.(requirement.frozenArtifact);
    return artifact
      ? { pass: true, evidence: `frozen artifact ${requirement.frozenArtifact} present` }
      : { pass: false, dependency: requirement.frozenArtifact, message: `required frozen artifact ${requirement.frozenArtifact} is missing.` };
  }

  if (Number.isInteger(requirement.stageId)) {
    const outputValue = context.getStageOutput(requirement.stageId);
    return outputValue
      ? { pass: true, evidence: `stage ${requirement.stageId} output present` }
      : { pass: false, dependency: `stage_${requirement.stageId}`, message: `required stage ${requirement.stageId} output is missing.` };
  }

  if (requirement.outputPath) {
    const value = readPath(output, requirement.outputPath);
    const pass = requirement.kind === 'text' ? text(value) : value != null;
    return pass
      ? { pass: true, evidence: `${requirement.outputPath} present` }
      : { pass: false, field: requirement.outputPath, message: `required output path ${requirement.outputPath} is missing.` };
  }

  return { pass: true };
}

function hashArtifact(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function normalizeFieldPath(path) {
  return String(path).replace(/^\.+/u, '').replace(/^root\./u, 'root.');
}

function readPath(value, path) {
  return String(path)
    .replace(/^root\./u, '')
    .split('.')
    .reduce((current, key) => current?.[key], value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
