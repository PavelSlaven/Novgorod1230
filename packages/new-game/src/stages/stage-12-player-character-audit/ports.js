export function assertStage12Ports(services = {}) {
  const executor = services.executor ?? services.llmStageExecutor;
  if (typeof executor !== 'function') throw new TypeError('Stage 12 requires executor service.');
  return { ...services, executor };
}
