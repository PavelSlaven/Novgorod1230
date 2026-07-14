export function assertStage19Ports(services = {}) {
  if (services.build != null && typeof services.build !== 'function') throw new TypeError('Stage 19 build must be a code callback.');
  if (typeof services.audit !== 'function') throw new TypeError('Stage 19 requires audit service.');
  const auditFormatRepair = services.auditFormatRepair ?? services.formatRepair ?? null;
  if (auditFormatRepair != null && typeof auditFormatRepair !== 'function') throw new TypeError('Stage 19 auditFormatRepair must be a function.');
  return { ...(services.build ? { build: services.build } : {}), audit: services.audit, auditFormatRepair };
}
