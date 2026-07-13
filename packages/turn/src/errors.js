export class TurnWorkflowError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TurnWorkflowError';
    this.code = String(code || 'TURN_WORKFLOW_ERROR');
    this.details = Object.freeze({ ...details });
  }
}

export function turnFailure(code, message, details = {}) {
  return new TurnWorkflowError(code, message, details);
}
