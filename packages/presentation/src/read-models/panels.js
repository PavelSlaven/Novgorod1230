import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { INVENTORY_PANEL_SCHEMA, PANEL_KINDS, PANEL_SCHEMA, PRESENTATION_VERSION } from './contracts.js';

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
/** Projects already calculated, player-visible inventory facts; it never derives mass, capacity or access. */
export function createInventoryPanelContract(input = {}) {
  const summary = input.summary ?? {};
  const zones = input.zones ?? {};
  const loadCategory = ['light', 'moderate', 'heavy', 'overloaded'].includes(summary.load_category) ? summary.load_category : 'light';
  const projectEntries = (values) => Array.isArray(values)
    ? values.filter((entry) => entry?.known_to_viewer !== false).map(projectEntry)
    : [];
  const primary = zones.primary_container?.known_to_viewer === false || zones.primary_container == null ? null : projectEntry(zones.primary_container);
  return deepFreeze({
    version: 1,
    schema: INVENTORY_PANEL_SCHEMA,
    summary: {
      total_mass_grams: nonnegative(summary.total_mass_grams), load_category: loadCategory,
      at_limit: summary.at_limit === true, hands_used: nonnegative(summary.hands_used), hands_total: 2,
      hands_free: nonnegative(summary.hands_free)
    },
    zones: {
      hands: projectEntries(zones.hands), worn_quick: projectEntries(zones.worn_quick), equipped: projectEntries(zones.equipped),
      quick_containers: projectEntries(zones.quick_containers), primary_container: primary, external_load: projectEntries(zones.external_load)
    },
    warnings: Array.isArray(input.warnings) ? input.warnings.map((warning) => ({ message: String(warning?.player_message ?? '').trim() })).filter((warning) => warning.message) : []
  });
}
export function createPeoplePanel(data, options) { return createPanel('people', data, options); }
export function createRoutePanel(data, options) { return createPanel('route', data, options); }
export function createMapPanel(data, options) { return createPanel('map', data, options); }
export function createJournalPanel(data, options) { return createPanel('journal', data, options); }
export function createDiagnosticPanel(data, options) { return createPanel('diagnostic', data, options); }

function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonnegative(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function projectEntry(entry = {}) {
  return {
    label: String(entry.label ?? '').trim(),
    condition: String(entry.condition ?? '').trim() || null,
    access: String(entry.access ?? '').trim() || null,
    closure_state: String(entry.closure_state ?? '').trim() || null
  };
}
function presentationLeak(path, leaks) {
  const error = new Error(`${path} contains hidden data`);
  error.code = 'PRESENTATION_HIDDEN_LEAK';
  error.details = { path, leaks };
  return error;
}
