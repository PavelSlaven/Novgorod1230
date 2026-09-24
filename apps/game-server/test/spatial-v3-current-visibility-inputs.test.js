import test from 'node:test';
import assert from 'node:assert/strict';
import { readCommittedEntityExterior, readCurrentTargetConditions, readPlayerKnowledge } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';

test('target conditions use exact committed targets and approved cover with complete empty modifiers', async () => {
  const scene = { location: { party_id: 'party', owner_id: 'actor', scene_position_id: 'a' },
    positions: [{ id: 'a', g6_instance_id: 'g6' }, { id: 'b', g6_instance_id: 'g6' }],
    g6: [{ id: 'g6' }], modifier_set: { complete: true, rows: [] },
    placements: [{ entity_kind: 'npc', entity_id: 'npc', position_node_id: 'b' }],
    movement_edges: [{ id: 'edge', from_position_id: 'a', to_position_id: 'b' }] };
  const natural = { ambient_visibility: { stable_cover: 'partial' } };
  const args = { partyId: 'party', actorId: 'actor', scene, natural };
  const expected = { stable_cover: 'partial', dynamic_occlusion: 'clear', concealment: 'clear' };
  assert.deepEqual(await readCurrentTargetConditions({ ...args,
    target: { target_id: 'npc:npc', entity_kind: 'npc', entity_id: 'npc', position_id: 'b' } }), expected);
  assert.deepEqual(await readCurrentTargetConditions({ ...args,
    target: { target_id: 'edge', entity_kind: 'local_edge', position_id: 'b' } }), expected);
  assert.deepEqual(await readCurrentTargetConditions({ ...args,
    target: { target_id: 'exit', entity_kind: 'directional_exit', position_id: 'a' } }), expected);
  await assert.rejects(readCurrentTargetConditions({ ...args,
    target: { target_id: 'npc:other', entity_kind: 'npc', entity_id: 'other', position_id: 'b' } }),
  (error) => error.details?.reason === 'current_target_conditions_required');
  scene.modifier_set.rows.push({ modifier_kind: 'smoke', affected_scope_ref: {
    spatial_kind: 'scene_position', spatial_id: 'b' } });
  await assert.rejects(readCurrentTargetConditions({ ...args,
    target: { target_id: 'npc:npc', entity_kind: 'npc', entity_id: 'npc', position_id: 'b' } }),
  (error) => error.details?.reason === 'visibility_modifier_effect_policy_required');
});

test('NPC exterior exposes committed appearance and visible Stage 16 gear without identity', async () => {
  const appearance = { build: 'stocky', skin_tone: 'light', face_shape: 'broad',
    hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'short_beard' },
    eyes: { color: 'gray' } };
  const visual = { schema: 'item_visual_profile_snapshot_v1', version: 1,
    equipment_slot: 'outer_garment', neckline: 'high_closed', sleeve_form: 'narrow',
    outer_form: 'wrap', visible_fabric: 'wool', trim: null,
    main_visible_color: 'dark_blue', secondary_visible_color: null, headwear_kind: 'none' };
  let gear = [{ state: { visual_profile_snapshot: { ...visual, secret_origin: 'hidden' } },
    condition_state: 'serviceable', physical_position: 'equipped',
    equipment_slot_category_id: 'outer_garment' },
  { state: { visual_profile_snapshot: visual, visibility_state: 'concealed' },
    condition_state: 'serviceable', physical_position: 'equipped',
    equipment_slot_category_id: 'outer_garment' }];
  const transaction = { async query(sql, params) {
    assert.deepEqual(params, ['party', 'npc']);
    if (sql.includes('FROM party_runtime.party_npcs')) return { rows: [{ identity_state: {
      canonical_name: 'hidden', public_role_label: 'путник', origin: 'hidden',
      occupation: 'hidden', sex_category: 'male', age_category: 'young_adult', appearance
    } }] };
    assert.match(sql, /FROM party_runtime.party_item_placements p/u);
    return { rows: gear };
  } };
  const input = { transaction, partyId: 'party',
    placement: { entity_kind: 'npc', entity_id: 'npc' } };
  assert.deepEqual(await readCommittedEntityExterior(input), {
    sex_category: 'male', age_category: 'young_adult', appearance,
    visible_equipment: [{ physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment',
      visual_profile_snapshot: visual }]
  });
  gear = [{ ...gear[0], state: {} }];
  await assert.rejects(readCommittedEntityExterior(input),
    (error) => error.details?.reason === 'committed_entity_exterior_required');
});

test('ground item exterior requires its committed ground placement and excludes contents', async () => {
  let row = { state: { contents: ['hidden'] }, condition_state: 'serviceable', anchor_id: null,
  scene_position_id: 'position', container_id: null, holder_npc_id: null,
  holder_character_id: null };
  const transaction = { async query(sql, params) {
    assert.match(sql, /JOIN party_runtime.party_item_placements p/u);
    assert.deepEqual(params, ['party', 'item']);
    return { rows: [row] };
  } };
  const input = { transaction, partyId: 'party', placement: { entity_kind: 'item',
    entity_id: 'item', placement_kind: 'scene_position', position_node_id: 'position' } };
  assert.deepEqual(await readCommittedEntityExterior(input), { condition_state: 'serviceable' });
  row = { ...row, holder_npc_id: 'npc', scene_position_id: null };
  await assert.rejects(readCommittedEntityExterior(input),
    (error) => error.details?.reason === 'committed_entity_exterior_required');
});

test('NPC name requires exact committed self-introduction heard in full by this player', async () => {
  const statement = { statement_id: 'said', speaker_ref: { entity_kind: 'npc', entity_id: 'npc' },
    utterance_text: 'Я Влас.', audience_projection: { schema: 'conversation_audience_projection_v1',
      statement_ref: { entity_kind: 'conversation_statement', entity_id: 'said' },
      received_messages: [{ source_statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'said' }, listener_ref: { entity_kind: 'player_character', entity_id: 'actor' },
      comprehension: 'full', utterance_text: 'Я Влас.' }] } };
  const rows = [statement];
  const transaction = { async query(sql, params) {
    assert.deepEqual(params, ['party', 'npc']);
    if (sql.includes('party_npcs')) return { rows: [{ npc_id: 'npc' }] };
    assert.match(sql, /party_conversation_statements/u);
    return { rows };
  } };
  const input = { transaction, partyId: 'party', actorId: 'actor',
    placement: { entity_kind: 'npc', entity_id: 'npc' } };
  assert.deepEqual(await readPlayerKnowledge(input), { display_name: 'Влас' });
  rows.length = 0;
  assert.equal(await readPlayerKnowledge(input), null);
  rows.push(statement);
  statement.audience_projection.received_messages[0].comprehension = 'partial';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages[0].comprehension = 'full';
  statement.audience_projection.received_messages[0].utterance_text = 'Я Еремей.';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages[0].utterance_text = 'Я Влас.';
  statement.audience_projection.received_messages[0].listener_ref.entity_id = 'other';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages = null;
  await assert.rejects(readPlayerKnowledge(input),
    (error) => error.details?.reason === 'player_npc_name_knowledge_required');
});
