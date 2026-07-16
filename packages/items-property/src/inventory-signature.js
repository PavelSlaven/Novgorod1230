import { sha256 } from '@rus/kernel';

export function buildInventoryStackSignature(value = {}) {
  return sha256({
    item_template_id: text(value.item_template_id), condition: text(value.condition), owner_relation: text(value.owner_relation),
    holder_relation: text(value.holder_relation), placement: text(value.placement), legal_status: text(value.legal_status),
    access_state: text(value.access_state), visibility_state: text(value.visibility_state), marks: list(value.marks).map(text).sort(),
    quality: text(value.quality), modifiers: list(value.modifiers).map((entry) => structuredClone(entry)).sort(compareJson)
  });
}

function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function compareJson(left, right) { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
