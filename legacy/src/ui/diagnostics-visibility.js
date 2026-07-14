export function resolveDiagnosticsVisible(debugVisible, options = {}) {
  if (Boolean(debugVisible)) return true;
  if (Boolean(options.diagnosticsVisible)) return true;
  if (Boolean(options.processError)) return true;
  return false;
}

export function shouldAutoOpenDiagnosticsDrawer(debugVisible, options = {}) {
  if (Boolean(debugVisible)) return true;
  return Boolean(options.processError);
}
