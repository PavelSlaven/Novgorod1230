export function issue(code, message, field, expected = undefined, actual = undefined) { return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) }; }

export function requireSchema(concerns, value, schema, field, code) { if (!isObject(value) || value.version !== 1 || value.schema !== schema) concerns.push(issue(code, `${field} must be ${schema} version 1.`, field)); }

export function requireAudit(concerns, value, schema, field, code) { requireSchema(concerns, value, schema, field, code); if (value?.pass !== true) concerns.push(issue(code, `${field}.pass must be true.`, `${field}.pass`, true, value?.pass)); }

export function buildIds(records, keys) { const set = new Set(); for (const record of array(records)) for (const key of keys) if (text(record?.[key])) set.add(record[key]); return set; }

export function collectRecordIds(value, set) { collectByKeys(value, set, ['knowledge_id', 'known_route_id', 'known_path_id', 'known_place_id', 'known_address_id', 'known_landmark_id', 'known_person_id', 'known_authority_id', 'known_danger_id', 'known_social_rule_id', 'known_resource_id', 'rumor_id', 'mistaken_belief_id', 'uncertain_knowledge_id', 'forbidden_knowledge_id', 'knowledge_gap_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'anchor_id', 'g5_edge_id', 'graph_edge_id']); }

export function collectByKeys(value, set, keys) { walk(value, (key, child) => { if (keys.includes(key)) addText(set, child); }); }

export function addText(set, value) { if (text(value)) set.add(String(value)); }

export function array(value) { return Array.isArray(value) ? value : []; }

export function sorted(set) { return [...set].sort(); }

export function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export function text(value) { return typeof value === 'string' && value.trim().length > 0; }

export function meaningful(value) { return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0) && !(isObject(value) && Object.keys(value).length === 0); }

export function safeClone(value) { try { return structuredClone(value); } catch { return null; } }

export function deepEqual(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }

export function dedupe(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

export function hasOwnRecursive(value, target) { let found = false; walk(value, (key) => { if (key === target) found = true; }); return found; }

export function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
