import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1';

export async function loadApprovedActorBaseAttributesTestBinding() {
  const [candidate, request, result] = await Promise.all([
    readJson(`${ROOT}/candidate.json`),
    readJson(`${ROOT}/runtime-activation-v1/request.json`),
    readJson(`${ROOT}/runtime-activation-v1/activation-readback-result.json`)
  ]);
  const target = request.target_binding;
  return Object.freeze({
    schema: 'rus.actor_base_attributes_runtime_binding.v1',
    runtime_profile: Object.freeze({
      schema: 'rus.actor_base_attributes_runtime_profile.v1',
      catalog_scope: target.catalog_scope,
      catalog_revision_id: target.target_revision_id,
      catalog_digest: target.target_catalog_digest,
      activation_event_id: result.event_id,
      import_id: result.import_id,
      import_audit_digest: result.import_audit_digest,
      record_registry_digest: target.record_registry_digest,
      runtime_contract_digest: target.runtime_contract_digest,
      profile_id: target.profile_id,
      profile_digest: target.profile_digest,
      profile: Object.freeze(candidate.profile)
    }),
    pin: Object.freeze({
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: target.catalog_scope,
      catalog_revision_id: target.target_revision_id,
      catalog_digest: target.target_catalog_digest,
      import_id: result.import_id,
      import_audit_digest: result.import_audit_digest,
      record_registry_digest: target.record_registry_digest,
      runtime_contract_digest: target.runtime_contract_digest,
      compatible_world_revision_id:
        target.compatible_world.compatible_world_revision_id,
      compatible_world_catalog_digest:
        target.compatible_world.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        target.compatible_world.compatible_world_pin_manifest_digest,
      activation_event_id: result.event_id
    })
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}
