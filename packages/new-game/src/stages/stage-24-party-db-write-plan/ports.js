export function assertStage24Ports({ builder, auditor, auditFormatRepairer } = {}) {
  if (builder != null && typeof builder !== 'function') throw new TypeError('Stage 24 builder must be a code callback.');
  if (typeof auditor !== 'function') throw new TypeError('Stage 24 requires auditor callback.');
  if (auditFormatRepairer != null && typeof auditFormatRepairer !== 'function') throw new TypeError('Stage 24 auditFormatRepairer must be a function.');
  return Object.freeze({ ...(builder ? { builder } : {}), auditor, auditFormatRepairer });
}
