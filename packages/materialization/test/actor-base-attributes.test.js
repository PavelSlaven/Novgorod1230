import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomSource, materializeActorBaseAttributes } from '../src/index.js';

const profile = { schema: 'rus.actor_base_attributes_profile.v1', version: 1,
  profile_id: 'ordinary-v1', algorithm_version: 'actor_base_attributes_v1',
  rng_version: 'pcg32-v1', ordinary_array: [13, 12, 11, 10, 9, 8],
  occupation_archetype_priorities: [{ mapping_id: 'generic',
    occupation_archetype_id: '*', priority: ['strength', 'dexterity',
      'endurance', 'reason', 'attention', 'influence'] }] };

test('actor base attributes are pinned, complete and deterministic', () => {
  const input = { profile, occupation_archetype_id: 'ordinary-worker',
    choice_key_prefix: 'npc:worker:0', seed_basis: { world: 'w', slot: '0' } };
  const left = materializeActorBaseAttributes({ ...input,
    random: createRandomSource({ seed: 7 }) });
  const right = materializeActorBaseAttributes({ ...input,
    random: createRandomSource({ seed: 7 }) });
  assert.deepEqual(left, right);
  assert.deepEqual(Object.values(left.values).sort((a, b) => b - a),
    [13, 12, 11, 10, 9, 8]);
  assert.throws(() => materializeActorBaseAttributes({ ...input,
    profile: { ...profile, occupation_archetype_priorities: [] },
    random: createRandomSource({ seed: 7 }) }),
  { code: 'ACTOR_BASE_ATTRIBUTES_ARCHETYPE_MAPPING_DATA_GAP' });
});
