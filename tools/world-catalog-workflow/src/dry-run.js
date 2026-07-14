import { digestValue, stableStringify } from './digest.js';

export function buildImportDryRun({ existing = [], incoming = [], explicitDeprecations = [] } = {}) {
  const existingById = uniqueById(existing, 'existing');
  const incomingById = uniqueById(incoming, 'incoming');
  const creates = [];
  const updates = [];
  const unchanged = [];
  for (const id of [...incomingById.keys()].sort()) {
    const next = incomingById.get(id);
    const previous = existingById.get(id);
    if (!previous) creates.push(next);
    else if (stableStringify(previous) === stableStringify(next)) unchanged.push(id);
    else updates.push({ id, before_digest: digestValue(previous), after_digest: digestValue(next), record: next });
  }
  const deprecations = [...explicitDeprecations].map(String).sort().map((id) => {
    if (!existingById.has(id)) throw new TypeError(`explicit deprecation references missing existing id: ${id}`);
    return { id, previous_digest: digestValue(existingById.get(id)) };
  });
  const deprecatedIds = new Set(deprecations.map((item) => item.id));
  const unmentioned_existing = [...existingById.keys()].filter((id) => !incomingById.has(id) && !deprecatedIds.has(id)).sort();
  const core = { creates, updates, unchanged, deprecations };
  return { schema_version: 'rus.world_catalog_import_dry_run.v1', ...core, unmentioned_existing, digest: digestValue(core) };
}

function uniqueById(records, label) {
  const map = new Map();
  for (const record of records) {
    const id = String(record?.id ?? '').trim();
    if (!id) throw new TypeError(`${label} record id is required`);
    if (map.has(id)) throw new TypeError(`${label} contains duplicate id: ${id}`);
    map.set(id, structuredClone(record));
  }
  return map;
}
