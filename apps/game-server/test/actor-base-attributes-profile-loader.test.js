import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import {
  ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
  loadActiveActorBaseAttributesProfile
} from '../src/infrastructure/postgres/actor-base-attributes-profile-loader.js';

const profile = Object.freeze({
  schema: 'rus.actor_base_attributes_profile.v1',
  version: 1,
  profile_id: 'ordinary-v1',
  algorithm_version: 'actor_base_attributes_v1',
  rng_version: 'mulberry32_v1',
  ordinary_array: [13, 12, 11, 10, 9, 8],
  occupation_archetype_priorities: []
});
const row = Object.freeze({
  catalog_revision_id: 'attributes-v1',
  profile_id: profile.profile_id,
  profile_digest: canonicalDigest(profile),
  profile_payload: profile,
  status: 'approved',
  event_id: 'activation-1',
  catalog_digest: 'a'.repeat(64),
  import_id: 'import-1',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
});

test('actor profile loader returns only exact active catalog membership',
  async () => {
    const calls = [];
    const loaded = await loadActiveActorBaseAttributesProfile({
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        return { rows: [row] };
      }
    });
    assert.deepEqual(calls[0].parameters,
      [ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE]);
    assert.match(calls[0].sql,
      /runtime_catalog_activation_events[\s\S]+actor_base_attribute_profiles/u);
    assert.equal(loaded.catalog_revision_id, row.catalog_revision_id);
    assert.equal(loaded.profile_digest, row.profile_digest);
    assert.notEqual(loaded.profile, profile);
  });

test('actor profile loader keeps inactive and invalid rows as typed gaps',
  async () => {
    await assert.rejects(() => loadActiveActorBaseAttributesProfile({
      async query() { return { rows: [] }; }
    }), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile({
      async query() { return { rows: [{ ...row,
        profile_digest: 'd'.repeat(64) }] }; }
    }), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile({
      async query() { throw Object.assign(new Error('missing'), {
        code: '42P01' }); }
    }), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
  });
