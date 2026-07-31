import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  loadLowerDvinaTraceMaterializationBundle
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';

const root = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

test('Phase 4 content exact-supersedes revision 9 and pins the knife handover', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 10
  });
  const policy = bundle.npc_decision_schedule_policies;
  const transition = policy.property_transition_profiles.find(
    (entry) => entry.transition_profile_id
      === 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher'
  );
  assert.equal(policy.revision, 3);
  assert.equal(policy.supersedes_ref.revision, 2);
  assert.equal(bundle.definition.revision, 10);
  assert.equal(bundle.definition.supersedes_definition_ref.revision, 9);
  assert.equal(
    bundle.definition.resolved_policy_refs.npc_decision_schedule_policies.revision,
    3
  );
  assert.deepEqual(transition.requires, {
    holder_ref: 'ratsha_storehouse_helper',
    controller_ref: 'ratsha_storehouse_helper',
    physical_position: 'worn_quick',
    accessibility: 'quick',
    admission_fact: 'ratsha_surrender_without_further_harm_committed'
  });
  assert.deepEqual(transition.writes, {
    holder_ref: 'trace_ld_v1_audience_slot_participating_fisher',
    controller_ref: 'trace_ld_v1_audience_slot_participating_fisher',
    physical_position: 'hands',
    accessibility: 'secured_not_available_to_ratsha'
  });
  assert.equal(transition.owner_change, 'forbidden');
  assert.deepEqual(transition.write_targets, [
    'holder',
    'controller',
    'item_physical_position',
    'accessibility',
    'property_history'
  ]);
});

test('Phase 4 manifest keeps immutable revision 9 and policy revision 2 byte-pinned', async () => {
  const manifest = JSON.parse(await readFile(`${root}/phase-4-content/manifest.json`));
  const definitionV9 = await rawDigest(manifest.superseded_definition_ref.path);
  const policyV2 = await rawDigest(
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content/npc-decision-schedule-policies.json'
  );
  const policyV3 = JSON.parse(
    await readFile(`${root}/phase-4-content/npc-decision-schedule-policies.json`)
  );
  assert.equal(definitionV9, manifest.superseded_definition_ref.digest);
  assert.equal(policyV2, policyV3.supersedes_ref.digest);
});

async function rawDigest(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
