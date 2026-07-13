import { STAGE16_AUDIT_SCHEMA, STAGE16_DRAFT_SCHEMA, STAGE16_INPUT_SCHEMA } from '@rus/contracts';
import { commitStage16Artifacts } from '../commit/commit-stage-16.js';
import { buildStage16ItemPlacementInput, validateStage16ItemPlacementInput } from '../input/input-boundary.js';
import { FORMAT_CODES } from '../policy/constants.js';
import { buildStage16AnchorIndexes, buildStage16ContainerCandidateIndexes, buildStage16ItemCandidateIndexes, buildStage16PropertyRuleIndexes, filterStage16EligibleAnchors, filterStage16EligibleContainers, filterStage16EligibleItems, filterStage16EligiblePropertyRules } from '../references/indexes.js';
import { concern, isObject } from '../shared/utils.js';
import { buildStage16ItemPlacementAuditInput, buildStage16ItemPlacementCodePrecheck, validateStage16ItemPlacementAudit } from '../validation/audit-validation.js';

export async function runStage16ItemPlacementBlock({ input, place, audit, formatRepair = null, semanticRepair = null } = {}) {
  const inputConcerns = validateStage16ItemPlacementInput(input);
  if (inputConcerns.length > 0) throw stage16Error('Stage 16 input gate failed.', inputConcerns, routeForInputConcerns(inputConcerns));

  const itemIndexes = buildStage16ItemCandidateIndexes(input);
  const containerIndexes = buildStage16ContainerCandidateIndexes(input);
  const propertyIndexes = buildStage16PropertyRuleIndexes(input);
  const anchorIndexes = buildStage16AnchorIndexes(input);
  const eligibleItems = filterStage16EligibleItems(input, itemIndexes);
  const eligibleContainers = filterStage16EligibleContainers(input, containerIndexes);
  const eligiblePropertyRules = filterStage16EligiblePropertyRules(input, propertyIndexes);
  const eligibleAnchors = filterStage16EligibleAnchors(input, anchorIndexes);
  if ((eligibleItems.length > 0 || eligibleContainers.length > 0)
    && eligibleAnchors.item_anchors.length === 0
    && eligibleAnchors.container_anchors.length === 0) {
    throw stage16Error('No valid G5 anchor can hold items or containers.', [concern('NO_ALLOWED_ITEM_PLACEMENT', 'No existing allowed G5 anchor supports item/container placement.')], {
      repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'NO_ALLOWED_ITEM_ANCHOR'
    });
  }

  const placerInput = {
    ...input,
    eligible_item_profile_candidates: eligibleItems,
    eligible_container_profile_candidates: eligibleContainers,
    eligible_property_rule_candidates: eligiblePropertyRules,
    eligible_g5_item_anchors: eligibleAnchors.item_anchors,
    eligible_g5_container_anchors: eligibleAnchors.container_anchors
  };
  let draft = await callJsonRole(place, placerInput, 'InitialItemPlacer');
  let precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  if (!precheck.pass && typeof formatRepair === 'function' && precheck.concerns.some((item) => FORMAT_CODES.has(item.code))) {
    draft = await callJsonRole(formatRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialItemPlacementFormatRepairer');
    precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass && typeof semanticRepair === 'function') {
    draft = await callJsonRole(semanticRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialItemPlacementSemanticRepairer');
    precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass) throw stage16Error('Initial item placement draft failed code precheck.', precheck.concerns, routeForDraftConcerns(precheck.concerns), { draft, code_precheck: precheck });

  let auditOutput = await callJsonRole(audit, buildStage16ItemPlacementAuditInput(input, draft, precheck), 'InitialItemPlacementAuditor');
  let auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
  if (auditConcerns.length > 0 && typeof formatRepair === 'function') {
    auditOutput = await callJsonRole(formatRepair, { input, draft, audit: auditOutput, validation_errors: auditConcerns }, 'InitialItemPlacementFormatRepairer');
    auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
  }
  if (auditConcerns.length > 0) throw stage16Error('Initial item placement audit output is invalid.', auditConcerns, {
    repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_AUDIT_FORMAT_INVALID'
  }, { draft, code_precheck: precheck, audit: auditOutput });

  if (auditOutput.pass !== true) {
    if (typeof semanticRepair === 'function') {
      draft = await callJsonRole(semanticRepair, { input, draft, audit_concerns: auditOutput.concerns }, 'InitialItemPlacementSemanticRepairer');
      precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
      if (precheck.pass) {
        auditOutput = await callJsonRole(audit, buildStage16ItemPlacementAuditInput(input, draft, precheck), 'InitialItemPlacementAuditor');
        auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
      }
    }
    if (auditOutput.pass !== true || auditConcerns.length > 0) throw stage16Error('Initial item placement semantic audit failed.', auditOutput.concerns ?? auditConcerns, normalizeAuditRepairRoute(auditOutput.repair_route), { draft, code_precheck: precheck, audit: auditOutput });
  }

  return {
    pass: true,
    draft,
    code_precheck: precheck,
    audit: auditOutput,
    eligible_item_count: eligibleItems.length,
    eligible_container_count: eligibleContainers.length,
    eligible_property_rule_count: eligiblePropertyRules.length
  };
}

export async function runStage16ItemPlacement(context, options = {}) {
  const input = options.input?.schema === STAGE16_INPUT_SCHEMA
    ? options.input
    : buildStage16ItemPlacementInput(context, options.input ?? options);
  const providedDraft = options.providedDraft
    ?? options.stageOutputs?.[16]
    ?? options.stageOutputs?.item_placement
    ?? options.stageOutputs?.initial_item_placement_draft
    ?? null;
  const providedAudit = options.providedAudit
    ?? options.stageOutputs?.[1602]
    ?? options.stageOutputs?.initial_item_placement_audit
    ?? providedDraft?.initial_item_placement_audit
    ?? null;
  let result;
  if (providedDraft) {
    rejectProductionProvidedStage16(context, options);
    const draft = providedDraft.initial_item_placement_draft ?? providedDraft;
    const precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
    const auditConcerns = validateStage16ItemPlacementAudit(providedAudit, draft, input);
    if (!precheck.pass || auditConcerns.length > 0 || providedAudit?.pass !== true) {
      throw stage16Error('Provided Stage 16 output failed validation.', [...precheck.concerns, ...auditConcerns], {
        repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'PROVIDED_STAGE16_INVALID'
      });
    }
    result = { pass: true, draft, code_precheck: precheck, audit: providedAudit };
  } else {
    const executor = options.executor;
    if (typeof executor !== 'function') throw new Error('Stage 16 requires an executor.');
    const roleCall = (role) => async (roleInput) => executor({
      context,
      input: roleInput,
      stage: {
        id: 16,
        slug: 'item_placement',
        role,
        output_schema: role === 'InitialItemPlacementAuditor'
          || (role === 'InitialItemPlacementFormatRepairer' && roleInput?.audit)
          ? STAGE16_AUDIT_SCHEMA
          : STAGE16_DRAFT_SCHEMA,
        spec_file: '16.txt'
      }
    });
    result = await runStage16ItemPlacementBlock({
      input,
      place: options.place ?? roleCall('InitialItemPlacer'),
      audit: options.audit ?? roleCall('InitialItemPlacementAuditor'),
      formatRepair: options.formatRepair ?? roleCall('InitialItemPlacementFormatRepairer'),
      semanticRepair: options.semanticRepair ?? roleCall('InitialItemPlacementSemanticRepairer')
    });
  }
  commitStage16Artifacts(context, result, input);
  return result.draft;
}

export function rejectProductionProvidedStage16(context, options) {
  if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) throw new Error('Provided stage 16 output is disabled in production unless allowProvidedStageOutputs=true.');
}

export function stage16Error(message, concerns, route, snapshots = {}) {
  const error = new Error(message);
  error.lifecycle = { stage_id: 16, stage_slug: 'item_placement', stage_type: 'semantic_generation', failed_gate: route?.repair_kind === 'format' ? 'structural_validation' : 'semantic_validation', concerns: concerns ?? [], terminal_status: 'stage_failed', ...snapshots };
  error.semanticRecoveryRoute = route;
  return error;
}

export function routeForInputConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('ITEM_PLACEMENT_CANDIDATE_SET_NOT_READY')) return route(8, 'ITEM_CANDIDATE_SET_NOT_READY');
  if (codes.has('ITEM_PLACEMENT_G5_SCENE_NOT_MATERIALIZED')) return route(13, 'G5_SCENE_INVALID');
  if (codes.has('ITEM_PLACEMENT_G5_AUDIT_FAILED') || codes.has('ITEM_PLACEMENT_G5_PERMISSION_DENIED')) return route(14, 'G5_AUDIT_NOT_APPROVED');
  if (codes.has('ITEM_PLACEMENT_NPC_PLACEMENT_INVALID') || codes.has('ITEM_PLACEMENT_NPC_AUDIT_FAILED') || codes.has('ITEM_PLACEMENT_NPC_PERMISSION_DENIED')) return route(15, 'NPC_PLACEMENT_NOT_APPROVED');
  return { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_INPUT_INVALID' };
}

export function routeForDraftConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if ([...codes].some((code) => code.includes('PROFILE_CANDIDATE_NOT_FOUND') || code === 'ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND')) return route(8, 'ITEM_CANDIDATE_NOT_FOUND');
  if ([...codes].some((code) => ['ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_ITEM', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_CONTAINER'].includes(code))) return route(13, 'G5_ANCHOR_INVALID');
  if (codes.has('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND')) return route(15, 'NPC_HOLDER_INVALID');
  if ([...codes].some((code) => FORMAT_CODES.has(code))) return { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_FORMAT_INVALID' };
  return route(16, 'ITEM_PLACEMENT_SEMANTIC_INVALID');
}

export function normalizeAuditRepairRoute(value) {
  if (isObject(value)) return { repair_kind: value.repair_kind ?? 'semantic', return_to_stage: Number(value.return_to_stage ?? 16), rerun_from_stage: Number(value.rerun_from_stage ?? value.return_to_stage ?? 16), reason_code: value.reason_code ?? 'ITEM_PLACEMENT_AUDIT_FAILED' };
  return route(16, 'ITEM_PLACEMENT_AUDIT_FAILED');
}

export function route(stage, reasonCode) {
  return { repair_kind: 'semantic', return_to_stage: stage, rerun_from_stage: stage, reason_code: reasonCode };
}

export async function callJsonRole(callback, input, role) {
  if (typeof callback !== 'function') throw new Error(`${role} callback is required.`);
  const raw = await callback(input);
  const candidate = raw?.output ?? raw?.parsed_output ?? raw;
  if (typeof candidate === 'string') {
    try { return JSON.parse(candidate); } catch (error) {
      const failure = stage16Error(`${role} returned invalid JSON.`, [concern('ITEM_PLACEMENT_INVALID_JSON', error.message)], { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_INVALID_JSON' });
      failure.raw_output = candidate;
      throw failure;
    }
  }
  return candidate;
}
