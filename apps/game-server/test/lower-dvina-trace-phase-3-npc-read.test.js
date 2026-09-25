import assert from 'node:assert/strict';
import test from 'node:test';

import { phase3NpcReadProof } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read-proofs.js';

test('Phase 3 snapshot NPC proof ignores later P16 generated NPCs', () => {
  const payload = { npcs: [{ instance_id: 'original',
    participant_slot_ref: 'original-slot', profile_level: 'scene',
    anchor_id: 'original-anchor' }] };
  const rows = [
    { npc_id: 'generated', profile_level: 'background', anchor_id: null,
      semantic_state: { participant_slot_ref: 'generated-slot' } },
    { npc_id: 'original', profile_level: 'scene', anchor_id: 'original-anchor',
      semantic_state: { participant_slot_ref: 'original-slot' } }
  ];
  const proof = phase3NpcReadProof(payload, rows);
  assert.deepEqual(proof.actual, proof.expected);
  rows[1].anchor_id = 'wrong-anchor';
  assert.notDeepEqual(phase3NpcReadProof(payload, rows).actual, proof.expected);
  assert.notDeepEqual(phase3NpcReadProof(payload, rows.slice(0, 1)).actual,
    proof.expected);
});
