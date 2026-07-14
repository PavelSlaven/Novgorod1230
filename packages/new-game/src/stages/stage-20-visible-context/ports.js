export function assertStage20Ports(services = {}, { repairRequest = null } = {}) {
  const required = repairRequest ? ['formatRepair', 'semanticRepair', 'seniorRepair'] : ['build', 'formatRepair', 'semanticRepair', 'seniorRepair'];
  for (const key of required) if (typeof services?.[key] !== 'function') throw new TypeError(`Stage 20 requires ${key} service.`);
  return {
    build: services.build,
    formatRepair: services.formatRepair,
    semanticRepair: services.semanticRepair,
    seniorRepair: services.seniorRepair
  };
}
