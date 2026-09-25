import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePlayerSafeVisiblePayload } from
  '../../../packages/contracts/src/spatial-v3/player-safe-visible-payload.js';
import { createTracePhase8VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-8-effects.js';
import { projectVisibleContext } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';

const contracts = Object.freeze({
  actors: Object.freeze({
    zhdanko: Object.freeze({
      instance_id: 'npc-zhdanko',
      participant_slot_ref: 'zhdanko_storehouse_controller'
    }),
    eremey: Object.freeze({
      instance_id: 'npc-eremey',
      participant_slot_ref: 'eremey_fisher',
      semantic_profile: Object.freeze({
        identity: Object.freeze({ canonical_name: 'Еремей' })
      })
    }),
    ratsha: Object.freeze({
      instance_id: 'npc-ratsha',
      participant_slot_ref: 'ratsha_storehouse_helper'
    })
  }),
  participatingFishers: Object.freeze([Object.freeze({
      instance_id: 'npc-fisher',
      participant_slot_ref: 'background_fisher'
    })])
});

test('visible item profile keeps approved item vocabulary and rejects extra public fields', () => {
  const visual = { schema: 'item_visual_profile_snapshot_v1', version: 1,
    garment_kind: 'footwear', equipment_slot: 'footwear',
    neckline: 'not_applicable', sleeve_form: 'not_applicable',
    outer_form: 'low_leather_shoe', visible_fabric: 'leather', trim: 'none',
    main_visible_color: 'brown', secondary_visible_color: 'brown',
    headwear_kind: 'none' };
  const item = { physical_position: 'equipped',
    equipment_slot_category_id: 'footwear', visual_profile_snapshot: visual };
  const npc = { entity_ref: { entity_kind: 'npc', entity_id: 'npc' },
    display_label: 'путник', recognition: 'unrecognized',
    observable_cues: { equipment: [item] } };
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Путник рядом.', perceived_changes: [], sensory_details: [],
    visible_npcs: [npc], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  assert.deepEqual(validatePlayerSafeVisiblePayload(payload), []);
  assert.deepEqual(projectVisibleContext({ visible_npc: [npc] },
    { strict: true }).visible_npc[0].observable_cues.equipment[0]
    .visual_profile_snapshot, visual);
  const leaked = { ...visual, secret_origin: 'hidden' };
  assert.ok(validatePlayerSafeVisiblePayload({ ...payload, visible_npcs: [{ ...npc,
    observable_cues: { equipment: [{ ...item,
      visual_profile_snapshot: leaked }] } }] }).some((error) =>
    error.field.endsWith('secret_origin')));
  assert.throws(() => projectVisibleContext({ visible_npc: [{ ...npc,
    observable_cues: { equipment: [{ ...item,
      visual_profile_snapshot: leaked }] } }] }, { strict: true }),
  { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
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
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-zhdanko' },
      display_label: 'хозяин клети', recognition: 'recognized'
    }, {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
      display_label: 'Еремей', recognition: 'known'
    }, {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-ratsha' },
      display_label: 'мужчина из сушильни', recognition: 'recognized'
    }, {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-fisher' },
      display_label: 'рыбак', recognition: 'recognized'
    }]);
  });

test('Phase 8 exposes only the NPC speech delivered to the player', async () => {
  const projector = createTracePhase8VisibleProjector({ contracts,
    fallback: { project: async () => assert.fail('fallback') } });
  const statement = { statement_id: 'statement:refusal',
    speaker_ref: { entity_kind: 'npc', entity_id: 'npc-zhdanko' },
    utterance_text: 'Я ничего не брал.' };
  const projected = await projector.project({ consequence: {
    phase8_kind: 'accusation', accusation: { combat_initialization: null,
      semantic_exchange: { response_kind: 'speech', statements: [statement],
        audiences: [{ statement_ref: { entity_kind: 'conversation_statement',
          entity_id: statement.statement_id }, received_messages: [{
          listener_ref: { entity_kind: 'player_character', entity_id: 'player' },
          comprehension: 'full', utterance_text: statement.utterance_text }] }] } }
  } });
  assert.equal(projected.visible_scene,
    'Хозяин клети говорит: «Я ничего не брал.»');
});

test('combat exchange projects confirmed harm and terminal status', async () => {
  const projector = createTracePhase8VisibleProjector({ contracts,
    fallback: { project: async () => assert.fail('fallback') } });
  const participant = (kind, id, status = 'active') => ({
    actor_ref: { entity_kind: kind, entity_id: id }, combat_status: status
  });
  const projected = await projector.project({ retrieved_state: {
    actor_id: 'player'
  }, consequence: { combat_kind: 'exchange', combat: {
    exchange: { technical_steps: [{ actor_ref: {
      entity_kind: 'player_character', entity_id: 'player' },
    check_request: { target_id: 'npc-zhdanko' } }] },
    harm_packages: [{ target_id: 'npc-zhdanko', health_loss: 5,
      injury: { label: 'лёгкая рана' } }],
    session_before: { participant_states: [
      participant('player_character', 'player'),
      participant('npc', 'npc-zhdanko')
    ] },
    session_after: { status: 'ended', participant_states: [
      participant('player_character', 'player'),
      participant('npc', 'npc-zhdanko', 'incapacitated')
    ] }
  } } });
  assert.equal(projected.visible_scene,
    'У вашего противника — лёгкая рана. Ваш противник больше не может продолжать бой. Схватка закончилась.');
  assert.equal(projected.visible_changes.length, 2);
});
