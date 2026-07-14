export const STAGE_STATUS = Object.freeze(['approved', 'repair_required', 'blocked', 'failed']);

export function assertStageDefinition(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('Stage definition is required.');
  if (!Number.isInteger(definition.id) || definition.id < 1) throw new TypeError('Stage id must be a positive integer.');
  if (typeof definition.name !== 'string' || definition.name.length === 0) throw new TypeError('Stage name is required.');
  if (typeof definition.execute !== 'function') throw new TypeError(`Stage ${definition.id} must expose execute().`);
  return definition;
}
