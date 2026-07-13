import { getNewGameStageMatrix } from './llm-matrix.js';

export const NEW_GAME_STAGE_COUNT = 26;

export const NEW_GAME_STAGE_REGISTRY = Object.freeze(
  getNewGameStageMatrix().map((entry) => stage(entry.stage_id, entry.slug, kindFromMatrix(entry), {
    specFile: entry.stage_id >= 2 ? `${entry.stage_id}.txt` : null,
    inputSchema: entry.input_schema,
    outputSchema: entry.output_schema,
    requiresWorldBase: entry.stage_id >= 4 && entry.stage_id <= 8,
    requiresPartyDb: entry.stage_id >= 24,
    prerequisites: prerequisitesFor(entry.stage_id),
    llmRequirement: entry.llm_requirement,
    llmRole: entry.llm_role,
    modelTier: entry.model_tier,
    promptId: entry.prompt_id,
    promptSources: entry.prompt_sources,
    primaryExecutor: entry.primary_executor,
    auditorRole: entry.auditor_role,
    safetyAuditorRole: entry.safety_auditor_role,
    actionLabelAuditorRole: entry.action_label_auditor_role,
    formatRepairerRole: entry.format_repairer_role,
    semanticRepairerRole: entry.semantic_repairer_role,
    repairerRole: entry.repairer_role,
    seniorRepairerRole: entry.senior_repairer_role,
    repairPolicy: entry.repair_policy,
    codeGateRole: entry.code_gate_role,
    returnsToStageOnFailure: entry.returns_to_stage_on_failure,
    contextBlocks: entry.context_blocks,
    stageType: entry.stage_type,
    requiresSemanticAudit: entry.requires_semantic_audit,
    freezePolicy: entry.freeze_policy,
    preDependencyRequirements: entry.pre_dependency_requirements,
    postDependencyRequirements: entry.post_dependency_requirements,
    canonicalArtifactSchema: entry.canonical_artifact_schema,
    precheckSchema: entry.precheck_schema,
    screenSchema: entry.screen_schema,
    safetyAuditSchema: entry.safety_audit_schema,
    actionAuditSchema: entry.action_audit_schema,
    providedOutputPolicy: entry.provided_output_policy
  }))
);

export function getNewGameStageRegistry() {
  return NEW_GAME_STAGE_REGISTRY.map((entry) => ({ ...entry, prerequisites: [...entry.prerequisites] }));
}

export function getNewGameStage(idOrSlug) {
  const key = String(idOrSlug ?? '').trim();
  return getNewGameStageRegistry().find((entry) => String(entry.id) === key || entry.slug === key) ?? null;
}

export function getNewGamePhaseId(stageId) {
  const id = Number(stageId);
  if (!Number.isInteger(id) || id < 1 || id > NEW_GAME_STAGE_COUNT) {
    throw new Error(`Invalid new-game stage id: ${stageId}`);
  }
  return `ng_stage_${String(id).padStart(2, '0')}`;
}

function stage(id, slug, kind, overrides = {}) {
  return Object.freeze({
    id,
    slug,
    phase: getNewGamePhaseId(id),
    kind,
    specFile: overrides.specFile ?? `${id}.txt`,
    inputSchema: overrides.inputSchema ?? null,
    outputSchema: overrides.outputSchema ?? null,
    requiresWorldBase: overrides.requiresWorldBase === true,
    requiresPartyDb: overrides.requiresPartyDb === true,
    prerequisites: Object.freeze(overrides.prerequisites ?? []),
    llmRequirement: overrides.llmRequirement ?? 'none',
    llmRole: overrides.llmRole ?? null,
    modelTier: overrides.modelTier ?? 'none',
    promptId: overrides.promptId ?? null,
    promptSources: Object.freeze(overrides.promptSources ?? []),
    primaryExecutor: overrides.primaryExecutor ?? kind,
    auditorRole: overrides.auditorRole ?? null,
    safetyAuditorRole: overrides.safetyAuditorRole ?? null,
    actionLabelAuditorRole: overrides.actionLabelAuditorRole ?? null,
    formatRepairerRole: overrides.formatRepairerRole ?? null,
    semanticRepairerRole: overrides.semanticRepairerRole ?? null,
    repairerRole: overrides.repairerRole ?? null,
    seniorRepairerRole: overrides.seniorRepairerRole ?? null,
    repairPolicy: overrides.repairPolicy ?? null,
    codeGateRole: overrides.codeGateRole ?? null,
    returnsToStageOnFailure: overrides.returnsToStageOnFailure ?? null,
    contextBlocks: Object.freeze(overrides.contextBlocks ?? []),
    stageType: overrides.stageType ?? null,
    requiresSemanticAudit: overrides.requiresSemanticAudit === true,
    freezePolicy: Object.freeze(overrides.freezePolicy ?? {}),
    preDependencyRequirements: Object.freeze(overrides.preDependencyRequirements ?? []),
    postDependencyRequirements: Object.freeze(overrides.postDependencyRequirements ?? []),
    canonicalArtifactSchema: overrides.canonicalArtifactSchema ?? null,
    precheckSchema: overrides.precheckSchema ?? null,
    screenSchema: overrides.screenSchema ?? null,
    safetyAuditSchema: overrides.safetyAuditSchema ?? null,
    actionAuditSchema: overrides.actionAuditSchema ?? null,
    providedOutputPolicy: overrides.providedOutputPolicy ?? null
  });
}

function kindFromMatrix(entry) {
  if (entry.primary_executor === 'isolated_code_block' || entry.primary_executor === 'isolated_code_and_audit_block') return 'code';
  if (entry.primary_executor === 'commit') return 'commit';
  if (entry.primary_executor === 'ui') return 'ui';
  if (entry.primary_executor === 'llm' && /audit/u.test(entry.slug)) return 'llm_audit';
  if (entry.primary_executor === 'llm') return 'llm';
  if (entry.primary_executor === 'code') return 'code';
  return 'input';
}

function prerequisitesFor(stageId) {
  if (stageId === 24) return ['schema_mapping_ready'];
  if (stageId === 25) return ['party_schema_ready', 'schema_mapping_ready'];
  return [];
}
