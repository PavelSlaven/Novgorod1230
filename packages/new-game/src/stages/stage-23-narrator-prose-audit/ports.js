export function assertStage23Ports(services = {}) {
  for (const key of ['auditor', 'formatRepairer', 'seniorAuditor', 'router']) if (typeof services?.[key] !== 'function') throw new TypeError(`Stage 23 requires ${key} service.`);
  return { auditor: services.auditor, formatRepairer: services.formatRepairer, seniorAuditor: services.seniorAuditor, router: services.router };
}
