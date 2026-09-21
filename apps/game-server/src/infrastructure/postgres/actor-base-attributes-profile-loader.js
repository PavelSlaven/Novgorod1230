import { createHash } from 'node:crypto';

import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { serverError } from '../../errors.js';

export const ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE =
  'actor_base_attributes_v1';

export async function loadActiveActorBaseAttributesProfile(worldPool) {
  let result;
  try {
    result = await worldPool.query(
      `WITH active AS (
         SELECT * FROM world_base.runtime_catalog_activation_events
          WHERE catalog_scope=$1
          ORDER BY event_sequence DESC LIMIT 1
       )
       SELECT p.catalog_revision_id,p.profile_id,p.profile_digest,
              p.profile_payload,p.status,e.event_id,e.catalog_digest,
              e.import_id,e.import_audit_digest,e.record_registry_digest,
              e.runtime_contract_digest
         FROM active e
         JOIN world_base.domain_catalog_revisions r
           ON r.catalog_revision_id=e.catalog_revision_id
          AND r.catalog_scope=e.catalog_scope
          AND r.target_catalog_digest=e.catalog_digest
          AND r.status='approved'
         JOIN world_base.catalog_imports i
           ON i.id=e.import_id
          AND i.catalog_scope=e.catalog_scope
          AND i.target_revision_id=e.catalog_revision_id
          AND i.import_audit_digest=e.import_audit_digest
          AND i.approval_status='approved'
         JOIN world_base.actor_base_attribute_profiles p
           ON p.catalog_revision_id=e.catalog_revision_id
          AND p.status='approved'`,
      [ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE]
    );
  } catch (error) {
    if (error?.code !== '42P01' && error?.code !== '42703') throw error;
    gap();
  }
  if (result.rows.length !== 1) gap();
  const row = result.rows[0];
  const profile = row.profile_payload;
  if (row.profile_id !== profile?.profile_id
      || row.profile_digest !== digest(profile)
      || row.status !== 'approved'
      || !sha(row.catalog_digest) || !sha(row.import_audit_digest)
      || row.record_registry_digest !==
        ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST
      || row.runtime_contract_digest !==
        ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST) {
    throw serverError('ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID',
      'Active actor base attribute profile membership is invalid.');
  }
  return Object.freeze({
    schema: 'rus.actor_base_attributes_runtime_profile.v1',
    catalog_scope: ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
    catalog_revision_id: row.catalog_revision_id,
    catalog_digest: row.catalog_digest,
    activation_event_id: row.event_id,
    import_id: row.import_id,
    import_audit_digest: row.import_audit_digest,
    record_registry_digest: row.record_registry_digest,
    runtime_contract_digest: row.runtime_contract_digest,
    profile_id: row.profile_id,
    profile_digest: row.profile_digest,
    profile: Object.freeze(structuredClone(profile))
  });
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}
function sha(value) { return /^[a-f0-9]{64}$/u.test(String(value ?? '')); }
function gap() {
  throw serverError('ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP',
    'No exact active actor base attribute runtime profile is available.');
}
