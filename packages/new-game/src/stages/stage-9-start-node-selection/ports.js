export function assertStage9Ports(services = {}) {
  const executor = services.executor ?? services.llmStageExecutor;
  if (typeof executor !== 'function') throw new TypeError('Stage 9 requires executor service.');
  return { ...services, executor };
}
