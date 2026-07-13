export function assertStage21Ports(services = {}) {
  for (const key of ['auditor', 'formatRepairer', 'seniorAuditor', 'auditRouter']) if (typeof services?.[key] !== 'function') throw new TypeError(`Stage 21 requires ${key} service.`);
  return { auditor: services.auditor, formatRepairer: services.formatRepairer, seniorAuditor: services.seniorAuditor, auditRouter: services.auditRouter };
}
