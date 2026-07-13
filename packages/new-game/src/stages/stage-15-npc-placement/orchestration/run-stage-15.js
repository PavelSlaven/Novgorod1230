import { STAGE15_AUDIT_SCHEMA, STAGE15_DRAFT_SCHEMA, STAGE15_INPUT_SCHEMA } from '@rus/contracts';
import { commitStage15Artifacts } from '../commit/commit-stage-15.js';
import { buildStage15NpcPlacementInput, validateStage15NpcPlacementInput } from '../input/input-boundary.js';
import { FORMAT_CODES } from '../policy/constants.js';
import { buildStage15AnchorIndex, buildStage15CandidateIndex, filterStage15EligibleAnchors, filterStage15EligibleCandidates } from '../references/indexes.js';
import { concern, isObject } from '../shared/utils.js';
import { buildStage15NpcPlacementAuditInput, buildStage15NpcPlacementCodePrecheck, validateStage15NpcPlacementAudit } from '../validation/audit-validation.js';

export async function runStage15NpcPlacementBlock({
  input,
  place,
  audit,
  formatRepair = null,
  semanticRepair = null
} = {}) {
  const inputConcerns = validateStage15NpcPlacementInput(input);
  if (inputConcerns.length > 0) throw stage15Error('Stage 15 input gate failed.', inputConcerns, routeForInputConcerns(inputConcerns));

  const candidateIndex = buildStage15CandidateIndex(input);
  const anchorIndex = buildStage15AnchorIndex(input);
  const eligibleCandidates = filterStage15EligibleCandidates(input, candidateIndex);
  const eligibleAnchors = filterStage15EligibleAnchors(input, anchorIndex);

  if (eligibleAnchors.length === 0) {
    throw stage15Error('No valid G5 anchor can hold an NPC.', [concern('NO_ALLOWED_NPC_PLACEMENT', 'No existing allowed G5 anchor supports NPC placement.')], {
      repair_kind: 'semantic',
      return_to_stage: 13,
      rerun_from_stage: 13,
      reason_code: 'NO_ALLOWED_NPC_ANCHOR'
    });
  }

  const placerInput = {
    ...input,
    eligible_npc_candidates: eligibleCandidates,
    eligible_g5_anchors: eligibleAnchors
  };

  let draft = await callJsonRole(place, placerInput, 'InitialNpcPlacer');
  let precheck = buildStage15NpcPlacementCodePrecheck(draft, input);

  if (!precheck.pass && typeof formatRepair === 'function' && precheck.concerns.some((item) => FORMAT_CODES.has(item.code))) {
    draft = await callJsonRole(formatRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialNpcPlacementFormatRepairer');
    precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass && typeof semanticRepair === 'function') {
    draft = await callJsonRole(semanticRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialNpcPlacementSemanticRepairer');
    precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass) {
    throw stage15Error('Initial NPC placement draft failed code precheck.', precheck.concerns, routeForDraftConcerns(precheck.concerns), { draft, code_precheck: precheck });
  }

  let auditOutput = await callJsonRole(audit, buildStage15NpcPlacementAuditInput(input, draft, precheck), 'InitialNpcPlacementAuditor');
  let auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
  if (auditConcerns.length > 0 && typeof formatRepair === 'function') {
    auditOutput = await callJsonRole(formatRepair, { input, draft, audit: auditOutput, validation_errors: auditConcerns }, 'InitialNpcPlacementFormatRepairer');
    auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
  }
  if (auditConcerns.length > 0) {
    throw stage15Error('Initial NPC placement audit output is invalid.', auditConcerns, {
      repair_kind: 'format',
      return_to_stage: 15,
      rerun_from_stage: 15,
      reason_code: 'NPC_PLACEMENT_AUDIT_FORMAT_INVALID'
    }, { draft, code_precheck: precheck, audit: auditOutput });
  }
  if (auditOutput.pass !== true) {
    if (typeof semanticRepair === 'function') {
      draft = await callJsonRole(semanticRepair, { input, draft, audit_concerns: auditOutput.concerns }, 'InitialNpcPlacementSemanticRepairer');
      precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
      if (precheck.pass) {
        auditOutput = await callJsonRole(audit, buildStage15NpcPlacementAuditInput(input, draft, precheck), 'InitialNpcPlacementAuditor');
        auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
      }
    }
    if (auditOutput.pass !== true || auditConcerns.length > 0) {
      throw stage15Error('Initial NPC placement semantic audit failed.', auditOutput.concerns ?? auditConcerns, normalizeAuditRepairRoute(auditOutput.repair_route), { draft, code_precheck: precheck, audit: auditOutput });
    }
  }

  return {
    pass: true,
    draft,
    code_precheck: precheck,
    audit: auditOutput,
    eligible_candidate_count: eligibleCandidates.length,
    eligible_anchor_count: eligibleAnchors.length
  };
}

export async function runStage15NpcPlacement(context, options = {}) {
  const input = options.input?.schema === STAGE15_INPUT_SCHEMA
    ? options.input
    : buildStage15NpcPlacementInput(context, options.input ?? options);

  const providedDraft = options.providedDraft ?? options.stageOutputs?.[15] ?? options.stageOutputs?.npc_placement ?? null;
  const providedAudit = options.providedAudit
    ?? options.stageOutputs?.[1502]
    ?? options.stageOutputs?.initial_npc_placement_audit
    ?? providedDraft?.initial_npc_placement_audit
    ?? null;

  let result;
  if (providedDraft) {
    rejectProductionProvidedStage15(context, options);
    const draft = providedDraft.initial_npc_placement_draft ?? providedDraft;
    const precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
    const auditConcerns = validateStage15NpcPlacementAudit(providedAudit, draft, input);
    if (!precheck.pass || auditConcerns.length > 0 || providedAudit?.pass !== true) {
      throw stage15Error('Provided Stage 15 output failed validation.', [...precheck.concerns, ...auditConcerns], {
        repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'PROVIDED_STAGE15_INVALID'
      });
    }
    result = { pass: true, draft, code_precheck: precheck, audit: providedAudit };
  } else {
    const executor = options.executor;
    if (typeof executor !== 'function') throw new Error('Stage 15 requires an executor.');
    const roleCall = (role) => async (roleInput) => executor({
      context,
      input: roleInput,
      stage: {
        id: 15,
        slug: 'npc_placement',
        role,
        output_schema: role === 'InitialNpcPlacementAuditor' ? STAGE15_AUDIT_SCHEMA : STAGE15_DRAFT_SCHEMA,
        spec_file: '15.txt'
      }
    });
    result = await runStage15NpcPlacementBlock({
      input,
      place: options.place ?? roleCall('InitialNpcPlacer'),
      audit: options.audit ?? roleCall('InitialNpcPlacementAuditor'),
      formatRepair: options.formatRepair ?? roleCall('InitialNpcPlacementFormatRepairer'),
      semanticRepair: options.semanticRepair ?? roleCall('InitialNpcPlacementSemanticRepairer')
    });
  }

  commitStage15Artifacts(context, result, input);
  return result.draft;
}

export function rejectProductionProvidedStage15(context, options) {
  if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
    throw new Error('Provided stage 15 output is disabled in production unless allowProvidedStageOutputs=true.');
  }
}

export function stage15Error(message, concerns, route, snapshots = {}) {
  const error = new Error(message);
  error.lifecycle = {
    stage_id: 15,
    stage_slug: 'npc_placement',
    stage_type: 'semantic_generation',
    failed_gate: route?.repair_kind === 'format' ? 'structural_validation' : 'semantic_validation',
    concerns: concerns ?? [],
    terminal_status: 'stage_failed',
    ...snapshots
  };
  error.semanticRecoveryRoute = route;
  return error;
}

export function routeForInputConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('NPC_PLACEMENT_G5_SCENE_NOT_MATERIALIZED')) return { repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'G5_SCENE_INVALID' };
  if (codes.has('NPC_PLACEMENT_G5_AUDIT_FAILED') || codes.has('NPC_PLACEMENT_G5_PERMISSION_DENIED')) return { repair_kind: 'semantic', return_to_stage: 14, rerun_from_stage: 14, reason_code: 'G5_AUDIT_NOT_APPROVED' };
  if (codes.has('NPC_PLACEMENT_CANDIDATE_SET_NOT_READY')) return { repair_kind: 'semantic', return_to_stage: 7, rerun_from_stage: 7, reason_code: 'NPC_CANDIDATE_SET_NOT_READY' };
  return { repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_INPUT_INVALID' };
}

export function routeForDraftConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('NPC_PLACEMENT_ANCHOR_NOT_FOUND') || codes.has('NPC_PLACEMENT_ANCHOR_CANNOT_HOLD_NPC') || codes.has('NPC_PLACEMENT_ANCHOR_OUTSIDE_G4')) {
    return { repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'G5_ANCHOR_INVALID' };
  }
  if (codes.has('NPC_PLACEMENT_CANDIDATE_NOT_FOUND')) return { repair_kind: 'semantic', return_to_stage: 7, rerun_from_stage: 7, reason_code: 'NPC_CANDIDATE_NOT_FOUND' };
  if ([...codes].some((code) => FORMAT_CODES.has(code))) return { repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_FORMAT_INVALID' };
  return { repair_kind: 'semantic', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_SEMANTIC_INVALID' };
}

export function normalizeAuditRepairRoute(route) {
  if (isObject(route)) return {
    repair_kind: route.repair_kind ?? 'semantic',
    return_to_stage: Number(route.return_to_stage ?? 15),
    rerun_from_stage: Number(route.rerun_from_stage ?? route.return_to_stage ?? 15),
    reason_code: route.reason_code ?? 'NPC_PLACEMENT_AUDIT_FAILED'
  };
  return { repair_kind: 'semantic', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_AUDIT_FAILED' };
}

export async function callJsonRole(callback, input, role) {
  if (typeof callback !== 'function') throw new Error(`${role} callback is required.`);
  const raw = await callback(input);
  const candidate = raw?.output ?? raw?.parsed_output ?? raw;
  if (typeof candidate === 'string') {
    try { return JSON.parse(candidate); } catch (error) {
      const failure = stage15Error(`${role} returned invalid JSON.`, [concern('NPC_PLACEMENT_INVALID_JSON', error.message)], {
        repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_INVALID_JSON'
      });
      failure.raw_output = candidate;
      throw failure;
    }
  }
  return candidate;
}
