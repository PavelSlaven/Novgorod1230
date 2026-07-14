import { deepFreeze } from '@rus/kernel';

export const VISIBLE_PACKAGE_KEYS = deepFreeze(['version','schema','visible_scene','visible_changes','sensory_details','visible_npc','visible_objects','known_context','uncertainties','allowed_tensions','do_not_imply']);
const FORBIDDEN_KEYS = ['hidden_state','hidden','secret','sourceDossier','audit','state_delta','dossier','witnesses','objectiveMap','requestRaw','responseRaw','world'];

export function detectHiddenLeaks(value) {
  const leaks = [];
  visit(value, [], leaks);
  const serialized = JSON.stringify(value ?? '').toLowerCase();
  if (/hidden_sentinel|op\d+_hidden_sentinel/iu.test(serialized)) leaks.push('hidden_sentinel');
  return deepFreeze([...new Set(leaks)]);
}

export function stripHiddenForNarrator(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return deepFreeze({});
  const clone = structuredClone(data);
  removeForbidden(clone);
  return deepFreeze(clone);
}

export function validateVisibleContext(data = {}) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok:false, errors:['visible context must be an object'] };
  if (data.version !== 1) errors.push('version must be 1');
  if (data.schema !== 'visible_context_package') errors.push('schema must be visible_context_package');
  if (!text(data.visible_scene)) errors.push('visible_scene is required');
  for (const key of Object.keys(data)) if (!VISIBLE_PACKAGE_KEYS.includes(key)) errors.push(`forbidden key: ${key}`);
  for (const leak of detectHiddenLeaks(data)) errors.push(`hidden leak: ${leak}`);
  return { ok:errors.length === 0, errors };
}

export function mergeKnowledgeFacts(current = [], updates = []) {
  const map = new Map();
  for (const fact of [...(Array.isArray(current) ? current : []), ...(Array.isArray(updates) ? updates : [])]) {
    if (!fact || typeof fact !== 'object') continue;
    const id = text(fact.id);
    if (!id) continue;
    map.set(id, structuredClone(fact));
  }
  return deepFreeze([...map.values()]);
}

export function validateMemoryFact(fact = {}) {
  const errors = [];
  if (!text(fact.id)) errors.push('memory fact id is required');
  if (!text(fact.type)) errors.push('memory fact type is required');
  if (!text(fact.summary)) errors.push('memory fact summary is required');
  if (!['known','rumor','belief','observation','obligation'].includes(text(fact.knowledge_status))) errors.push('memory fact knowledge_status is invalid');
  if (detectHiddenLeaks(fact).length) errors.push('memory fact contains hidden data');
  return { ok:errors.length === 0, errors };
}

export function buildSafeNarratorPackage(visible = {}) {
  const safe = stripHiddenForNarrator(visible);
  const validation = validateVisibleContext(safe);
  if (!validation.ok) return deepFreeze({ ok:false, errors:validation.errors, package:null });
  return deepFreeze({ ok:true, errors:[], package:safe });
}

function visit(value, path, leaks) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((entry, index) => visit(entry, [...path, index], leaks)); return; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.some((token) => key.toLowerCase() === token.toLowerCase())) leaks.push([...path, key].join('.'));
    visit(child, [...path, key], leaks);
  }
}
function removeForbidden(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) removeForbidden(item); return; }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.some((token) => key.toLowerCase() === token.toLowerCase())) delete value[key];
    else removeForbidden(value[key]);
  }
}
function text(value) { return String(value ?? '').trim(); }
