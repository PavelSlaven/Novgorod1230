export {
  buildFirstGameScreenProjection as buildFirstGameScreen,
  buildFirstScreenCodePrecheck,
  buildNarratorProseApproval,
  buildStage26Approval,
  buildStage26Input,
  buildStage26ReferenceIndex,
  computeStage26Digest,
  findForbiddenFirstScreenFields,
  normalizeStage26ScreenPolicy,
  runStage26FirstGameScreenBlock,
  STAGE26_ACTION_AUDIT_SCHEMA,
  STAGE26_APPROVAL_SCHEMA,
  STAGE26_CODE_VALIDATION_SCHEMA,
  STAGE26_CONCERN_CODES,
  STAGE26_INPUT_SCHEMA,
  STAGE26_NARRATOR_APPROVAL_SCHEMA,
  STAGE26_PRECHECK_SCHEMA,
  STAGE26_REPAIR_ROUTES,
  STAGE26_RESULT_SCHEMA,
  STAGE26_SAFETY_AUDIT_SCHEMA,
  STAGE26_SCREEN_SCHEMA,
  STAGE26_SEVERITIES,
  validateFirstGameScreen,
  validateFirstScreenActionAudit,
  validateFirstScreenSafetyAudit,
  validateProvidedStage26Result,
  validateStage26Input,
  validateStage26ToStage27Handoff
} from '../stages/stage26-first-game-screen.js';

export {
  acknowledgeFirstScreenDelivery as acknowledgeOpeningDelivery,
  buildFirstScreenDeliveryAck,
  buildStage27FirstTurnInput,
  createFirstScreenDeliveryAttempt,
  FIRST_SCREEN_DELIVERY_ACK_RESULT_SCHEMA,
  FIRST_SCREEN_DELIVERY_ACK_SCHEMA,
  FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA,
  markFirstScreenDeliverySent,
  PLAYER_FIRST_TURN_INPUT_SCHEMA,
  STAGE27_INPUT_SCHEMA,
  validateDeliveryAcknowledgement,
  validateDeliveryAttempt,
  validateStage26ToStage27IntentHandoff
} from '../delivery/first-screen-delivery.js';

export function createOpeningDeliveryAckPatch() {
  throw new Error('Legacy direct ACK patch creation is forbidden. Use persisted delivery attempt + acknowledgeFirstScreenDelivery.');
}

export function runStage26FirstGameScreen() {
  throw new Error('Legacy context-bound Stage 26 runner is forbidden. Use runStage26FirstGameScreenBlock with exact input.');
}
