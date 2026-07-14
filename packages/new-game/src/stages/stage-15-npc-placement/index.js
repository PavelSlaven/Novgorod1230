export { stage15Definition } from './definition.js';
export { runStage15NpcPlacementBlock, runStage15NpcPlacement } from './orchestration/run-stage-15.js';
export { buildStage15NpcPlacementInput, validateStage15NpcPlacementInput } from './input/input-boundary.js';
export { buildStage15CandidateIndex, buildStage15AnchorIndex, filterStage15EligibleCandidates, filterStage15EligibleAnchors } from './references/indexes.js';
export { validateStage15NpcPlacementDraft } from './validation/draft-validation.js';
export { buildStage15NpcPlacementCodePrecheck, validateStage15NpcPlacementAudit } from './validation/audit-validation.js';
export { STAGE15_INPUT_SCHEMA, STAGE15_DRAFT_SCHEMA, STAGE15_AUDIT_SCHEMA, STAGE15_PRECHECK_SCHEMA, normalizeStage15NpcPlacementPolicy } from './policy/constants.js';
