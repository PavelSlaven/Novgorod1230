export function assertStage26Executors({
  safetyAuditor,
  actionLabelAuditor,
  formatRepairer = null,
  semanticRepairer = null,
  seniorRepairer = null
} = {}) {
  if (typeof safetyAuditor !== 'function') throw new TypeError('Stage 26 safetyAuditor must be a function.');
  if (typeof actionLabelAuditor !== 'function') throw new TypeError('Stage 26 actionLabelAuditor must be a function.');
  for (const [name, value] of Object.entries({ formatRepairer, semanticRepairer, seniorRepairer })) {
    if (value != null && typeof value !== 'function') throw new TypeError(`Stage 26 ${name} must be a function when provided.`);
  }
  return Object.freeze({ safetyAuditor, actionLabelAuditor, formatRepairer, semanticRepairer, seniorRepairer });
}
