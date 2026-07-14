export function assertStage22Ports(services = {}) {
  for (const key of ['writer', 'formatRepairer', 'seniorWriter']) if (typeof services?.[key] !== 'function') throw new TypeError(`Stage 22 requires ${key} service.`);
  return { writer: services.writer, formatRepairer: services.formatRepairer, seniorWriter: services.seniorWriter };
}
