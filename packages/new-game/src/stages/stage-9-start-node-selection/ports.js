export function assertStage9Ports(services = {}) {
  const executor = services.executor ?? services.llmStageExecutor;
  if (typeof executor !== 'function') throw new TypeError('Stage 9 requires a bounded-decision executor service.');
  if (typeof services.decisionSecret !== 'string' || !services.decisionSecret || typeof services.decisionExpiresAt !== 'string') throw new TypeError('Stage 9 bounded decisions require decisionSecret and decisionExpiresAt.');
  return { ...services, executor };
}
