import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export async function readBundleArtifact(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') };
}
export function exactRef(ref, loaded, path, id, revision, idField = 'id') {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest
    && (idField === 'id' || loaded.value[idField] === id);
}
export function exact(actual, expected) {
  return JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
export function digestFileMap(files) {
  const payload = ['definition.json', 'local-fire-profile.json', 'spatial-semantic-profile.json']
    .map((name) => `${name}:${files[name]}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
export function digestNpcActorStepFileMap(files) {
  const payload = ['definition.json', 'npc-actor-step-profile.json']
    .map((name) => `${name}:${files[name]}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
export function hasOnlyNpcActorStepAuthorityDelta(bindings, historicalBundle, localFireProfile) {
  const expected = structuredClone(historicalBundle?.materialization_bindings);
  for (const [bindingKey, pinKey, profileKey] of [
    ['action_production_materialization', 'action_production_profile', 'action_production_profile'],
    ['local_fire_materialization', 'local_fire_profile', 'local_fire_profile'],
    ['spatial_semantic_materialization', 'spatial_semantic_profile', 'spatial_semantic_profile']
  ]) {
    const pin = historicalBundle?.artifact_pins?.[pinKey];
    const profile = historicalBundle?.[profileKey];
    if (!expected?.[bindingKey] || !pin || !profile?.profile_id) return false;
    expected[bindingKey].profile_ref = { path: pin.path, id: profile.profile_id,
      revision: pin.revision, schema: pin.schema, digest: pin.digest };
  }
  expected.local_fire_materialization.profile_ref = {
    path: `${ROOT}/phase-m10-content/local-fire-profile.json`, id: localFireProfile.value.profile_id,
    revision: localFireProfile.value.revision, schema: localFireProfile.value.schema,
    digest: localFireProfile.digest
  };
  const metadata = ['binding_set_id', 'revision', 'scenario_definition_revision', 'superseded_binding_ref'];
  const inheritedKeys = Object.keys(bindings ?? {})
    .filter((key) => ![...metadata, 'npc_actor_step_activation'].includes(key));
  return JSON.stringify(Object.keys(bindings ?? {}).sort()) === JSON.stringify([
    ...metadata, 'schema', 'status', 'scenario_id', 'binding_resolution_policy', 'fallback_policy',
    'normalization_policy', 'action_production_materialization', 'local_fire_materialization',
    'spatial_semantic_materialization', 'first_entry_preparation', 'npc_actor_step_activation'
  ].sort()) && inheritedKeys.every((key) => JSON.stringify(bindings[key]) === JSON.stringify(expected[key]));
}
