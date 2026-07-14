import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { PANEL_KINDS, PANEL_SCHEMA, PRESENTATION_VERSION } from './contracts.js';

export function createPanel(kind, data = {}, options = {}) {
  if (!PANEL_KINDS.includes(kind)) throw new TypeError(`Unsupported panel kind: ${kind}`);
  if (!plain(data)) throw new TypeError('Panel data must be an object.');
  const leaks = detectHiddenLeaks(data);
  if (leaks.length) throw presentationLeak(`panel.${kind}`, leaks);
  if (kind === 'diagnostic' && options.developerMode !== true) {
    return deepFreeze({ version: PRESENTATION_VERSION, schema: PANEL_SCHEMA, kind, visible: false, data: {} });
  }
  return deepFreeze({
    version: PRESENTATION_VERSION,
    schema: PANEL_SCHEMA,
    kind,
    visible: options.visible !== false,
    data: structuredClone(data)
  });
}

export function createCharacterPanel(data, options) { return createPanel('character', data, options); }
export function createInventoryPanel(data, options) { return createPanel('inventory', data, options); }
export function createPeoplePanel(data, options) { return createPanel('people', data, options); }
export function createRoutePanel(data, options) { return createPanel('route', data, options); }
export function createMapPanel(data, options) { return createPanel('map', data, options); }
export function createJournalPanel(data, options) { return createPanel('journal', data, options); }
export function createDiagnosticPanel(data, options) { return createPanel('diagnostic', data, options); }

function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function presentationLeak(path, leaks) {
  const error = new Error(`${path} contains hidden data`);
  error.code = 'PRESENTATION_HIDDEN_LEAK';
  error.details = { path, leaks };
  return error;
}
