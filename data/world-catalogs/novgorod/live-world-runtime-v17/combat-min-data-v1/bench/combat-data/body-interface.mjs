#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateActorBaseAttributes, materializeActorBaseAttributes } from '/srv/novgorod-work/worktrees/combat-min/packages/materialization/src/actor-base-attributes.js';
import { canonicalDigest } from '/srv/novgorod-work/worktrees/combat-min/packages/materialization/src/core.js';
import { initializeBodyState } from '/srv/novgorod-work/worktrees/combat-min/packages/body-state/src/initialization.js';

const here = new URL('.', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('./manifest.json', here), 'utf8'));
const candidate = JSON.parse(await readFile(new URL('../../minimal-combat-bundle.candidate.json', here), 'utf8'));
const fixture = manifest.actor_attributes_fixture;
assert.equal(fixture.fixture_only, true);
assert.equal(fixture.source_ref, 'src.actor-base-attributes.v1');
assert.equal(canonicalDigest(fixture.source_profile_runtime_record.profile), fixture.source_profile_runtime_record.profile_digest);
const cases = manifest.body_mapping_cases;
assert.equal(cases.length, 15);
let validSnapshots = 0;
let invalidSnapshots = 0;
for (const item of cases) {
  const attrsValid = validateActorBaseAttributes(item.attributes);
  if (attrsValid) validSnapshots += 1;
  else invalidSnapshots += 1;
  if (['bm07', 'bm14', 'bm15'].includes(item.id)) assert.equal(attrsValid, false, item.id);
  else assert.equal(attrsValid, true, item.id);
  if (attrsValid) {
    const generation = item.attributes.generation;
    const basis = generation.seed_basis;
    const regenerated = materializeActorBaseAttributes({
      runtime_profile: fixture.source_profile_runtime_record,
      occupation_archetype_id: generation.occupation_archetype_id,
      actor_slot_ref: basis.actor_slot_ref,
      seed_basis: {
        world_revision_id: basis.world_revision_id,
        world_catalog_digest: basis.world_catalog_digest,
        parent_seed_digest: basis.parent_seed_digest
      }
    });
    assert.deepEqual(item.attributes, regenerated, item.id);
  }
}
assert.equal(validSnapshots, 12);
assert.equal(invalidSnapshots, 3);
const bodyInit = candidate.execution.health_transition.body_initialization;
const adapter = bodyInit.owner_initialization_profile_adapter;
assert.equal(adapter.status, 'blocked_until_owner_and_D67_approval');
assert.equal(adapter.candidate_emission, null);
const fixtureDto = adapter.test_only_approved_dto_fixture;
const initialized = initializeBodyState({ body_state_profile: {
  schema: fixtureDto.schema,
  status: fixtureDto.status,
  profile_ref: fixtureDto.profile_ref,
  initial_state: fixtureDto.initial_state
} });
assert.equal(initialized.ok, true);
assert.deepEqual(initialized.body_state, fixtureDto.initial_state);
const unapproved = initializeBodyState({ body_state_profile: {
  schema: fixtureDto.schema,
  status: 'proposed_unapproved',
  profile_ref: fixtureDto.profile_ref,
  initial_state: fixtureDto.initial_state
} });
assert.equal(unapproved.ok, false);
process.stdout.write(JSON.stringify({
  status: 'body_interface_pass',
  combat_min_head: '8ef2b6494a88589ef88b7bacf13a9c427408e91d',
  total_actor_snapshots: cases.length,
  actor_snapshots_accepted_by_pinned_validator: validSnapshots,
  actor_snapshots_rejected_by_pinned_validator: invalidSnapshots,
  complete_snapshots_regenerated_exactly: validSnapshots,
  test_only_owner_dto_accepted: initialized.ok,
  proposed_profile_rejected_by_owner_initializer: unapproved.ok === false,
  candidate_status: candidate.status,
  production_usable: candidate.production_usable
}) + '\n');
