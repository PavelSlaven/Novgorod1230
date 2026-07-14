export function assertStage11Ports(services = {}) {
  const executor = services.executor ?? services.llmStageExecutor;
  if (typeof executor !== 'function') throw new TypeError('Stage 11 requires executor service.');
  return { ...services, executor };
}
