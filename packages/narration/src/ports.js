const REQUIRED = Object.freeze({
  writer: 'generate',
  formatRepairer: 'repair',
  auditor: 'audit',
  semanticRepairer: 'repair'
});

export function validateNarrationPorts(ports = {}) {
  const missing = [];
  for (const [name, method] of Object.entries(REQUIRED)) {
    if (!ports?.[name] || typeof ports[name][method] !== 'function') missing.push(`${name}.${method}`);
  }
  if (missing.length) {
    const error = new Error(`Missing narration ports: ${missing.join(', ')}`);
    error.code = 'NARRATION_PORTS_MISSING';
    error.details = { missing };
    throw error;
  }
  return ports;
}
