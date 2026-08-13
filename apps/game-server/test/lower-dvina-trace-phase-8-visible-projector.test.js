import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePlayerSafeVisiblePayload } from
  '../../../packages/contracts/src/spatial-v3/player-safe-visible-payload.js';
import { createTracePhase8VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-8-effects.js';

const contracts = Object.freeze({
  actors: Object.freeze({
    eremey: Object.freeze({
      instance_id: 'npc-eremey',
      participant_slot_ref: 'eremey_fisher',
      semantic_profile: Object.freeze({
        identity: Object.freeze({ canonical_name: 'Еремей' })
      })
    }),
    fisher: Object.freeze({
      instance_id: 'npc-fisher',
      participant_slot_ref: 'background_fisher'
    })
  })
});

test('Phase 8 projects NPCs through the player-safe entity contract',
  async () => {
    const projector = createTracePhase8VisibleProjector({
      contracts,
      fallback: { project: async () => assert.fail('fallback') }
    });
    const projected = await projector.project({
      consequence: { phase8_kind: 'movement' }
    });
    const payload = {
      schema: 'temporal_visible_package.v1',
      perceived_scene: projected.visible_scene,
      perceived_changes: projected.visible_changes,
      sensory_details: projected.sensory_details,
      visible_npcs: projected.visible_npc,
      visible_objects: projected.visible_objects,
      known_context: projected.known_context,
      uncertainties: projected.uncertainties,
      hypotheses: [],
      player_safe_interruption: null,
      allowed_action_affordances: []
    };
    assert.deepEqual(validatePlayerSafeVisiblePayload(payload), []);
    assert.deepEqual(projected.visible_npc, [{
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
      display_label: 'Еремей', recognition: 'known'
    }, {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-fisher' },
      display_label: 'background_fisher', recognition: 'recognized'
    }]);
  });
