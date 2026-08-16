import test from 'node:test';
import assert from 'node:assert/strict';
import { projectActorPortraitSpecV1 } from '../src/index.js';

const identity = {
  canonical_name: 'Ратша', sex_category: 'male', age_category: 'young_adult',
  appearance: { build: 'stocky', skin_tone: 'light', face_shape: 'broad', hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'short_beard' }, eyes: { color: 'gray' } }
};
const shirt = {
  item_id: 'shirt', physical_position: 'equipped', equipment_slot_category_id: 'base_garment',
  visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1', version: 1, equipment_slot: 'base_garment', neckline: 'slit_round', sleeve_form: 'narrow', outer_form: 'none', visible_fabric: 'light_linen', trim: 'none', main_visible_color: 'undyed_linen', secondary_visible_color: null, headwear_kind: 'none' }
};
const caftan = {
  item_id: 'caftan', physical_position: 'equipped', equipment_slot_category_id: 'outer_garment',
  visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1', version: 1, equipment_slot: 'outer_garment', neckline: 'high_closed', sleeve_form: 'narrow', outer_form: 'wrap', visible_fabric: 'wool', trim: null, main_visible_color: 'dark_blue', secondary_visible_color: null, headwear_kind: 'none' }
};

test('portrait projection is a repeatable player-safe view of identity and equipped item snapshots', () => {
  const input = { identity, visible_equipment: [shirt, caftan], presentation: { emotion: 'suspicious', intensity: 'medium', gaze: 'right', body_pose: 'three_quarter', head_pose: 'slightly_turned', background: 'cool' } };
  const first = projectActorPortraitSpecV1(input);
  const second = projectActorPortraitSpecV1(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.person.age, 'young');
  assert.equal(first.clothing.outer, 'wrap');
  assert.equal(first.clothing.main_color, 'dark_blue');
  assert.equal(first.clothing.secondary_color, 'dark_blue');
  assert.equal(first.clothing.trim, 'none');
  assert.equal(Object.hasOwn(first, 'profile_id'), false);
});

test('portrait follows equipment state and returns null for historical or ambiguous input', () => {
  const before = projectActorPortraitSpecV1({ identity, visible_equipment: [shirt, caftan] });
  const after = projectActorPortraitSpecV1({ identity, visible_equipment: [shirt] });
  assert.equal(before.clothing.outer, 'wrap');
  assert.equal(after.clothing.outer, 'none');
  assert.equal(after.clothing.main_color, 'undyed_linen');
  assert.equal(projectActorPortraitSpecV1({ identity: { canonical_name: 'historical' }, visible_equipment: [shirt] }), null);
  assert.equal(projectActorPortraitSpecV1({ identity, visible_equipment: [shirt, { ...shirt, item_id: 'second-shirt' }] }), null);
});

test('portrait ignores hidden inventory and uses safe presentation defaults', () => {
  const hiddenCaftan = { ...caftan, physical_position: 'contained' };
  const portrait = projectActorPortraitSpecV1({ identity, visible_equipment: [shirt, hiddenCaftan], presentation: { emotion: 'private_motive', gaze: 'unknown' } });
  assert.equal(portrait.clothing.outer, 'none');
  assert.deepEqual(portrait.expression, { emotion: 'neutral', intensity: 'low' });
  assert.equal(portrait.eyes.gaze, 'viewer');
});
