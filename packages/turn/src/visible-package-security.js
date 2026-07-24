import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';

const forbiddenKey = /(?:^|_)(?:hidden|future|unperceived|motive|motives|raw_options?|trace|traces|roll|rolls|dc|state_patch|state_patches)(?:_|$)/iu;

export function findForbiddenVisiblePath(value, path = 'visible_data', ancestors = new WeakSet()) {
  if (value === null || typeof value !== 'object') return null;
  if (ancestors.has(value)) return `${path}.<cycle>`;
  ancestors.add(value);
  for (const [name, nested] of Object.entries(value)) {
    const normalizedName = String(name).replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase();
    const childPath = `${path}.${name}`;
    if (forbiddenKey.test(normalizedName)) return childPath;
    const nestedPath = findForbiddenVisiblePath(nested, childPath, ancestors);
    if (nestedPath) return nestedPath;
  }
  ancestors.delete(value);
  return null;
}

export function inspectVisiblePackageEnvelope(value) {
  const forbiddenPath = findForbiddenVisiblePath(value, 'visible_package');
  if (forbiddenPath) return {
    ok: false,
    code: forbiddenPath.endsWith('.<cycle>') ? 'temporal_change_set_conflict' : 'hidden_information_leak',
    field: forbiddenPath,
    message: forbiddenPath.endsWith('.<cycle>')
      ? 'Visible package must be acyclic.'
      : 'Visible package contains forbidden hidden information.'
  };
  const [contractError] = validateSpatialV3Contract('visible_package_persistence_envelope', value);
  if (contractError) return {
    ok: false,
    code: contractError.code,
    field: contractError.field,
    message: contractError.message
  };
  return { ok: true, code: null, field: null, message: null };
}
