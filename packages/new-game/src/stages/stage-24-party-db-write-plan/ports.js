export function assertStage24Ports({
  builder,
  planFormatRepairer,
  auditor,
  auditFormatRepairer,
  router,
  semanticRepairer,
  seniorSemanticRepairer,
  seniorBuilder,
  seniorAuditor
} = {}) {
  const ports = { builder, planFormatRepairer, auditor, auditFormatRepairer, router, semanticRepairer, seniorSemanticRepairer, seniorBuilder, seniorAuditor };
  for (const [name, value] of Object.entries(ports)) {
    if (typeof value !== 'function') throw new TypeError(`Stage 24 requires ${name} callback.`);
  }
  return Object.freeze(ports);
}
