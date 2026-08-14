import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTRAIT_SPEC_V1_JSON_SCHEMA,
  assertPortraitSpecV1,
  validatePortraitSpecV1
} from '../src/portrait-spec-v1.js';

function validSpec() {
  return {
    schema: 'portrait_spec_v1',
    person: {
      sex: 'male', age: 'middle_aged', build: 'average',
      skin_tone: 'light', face_shape: 'broad'
    },
    hair: {
      color: 'dark_brown', length: 'medium', style: 'loose',
      facial_hair: 'short_beard'
    },
    eyes: { color: 'gray', gaze: 'viewer' },
    expression: { emotion: 'suspicious', intensity: 'medium' },
    clothing: {
      base: 'linen_tunic', outer: 'caftan', main_color: 'dark_blue',
      secondary_color: 'undyed_linen', headwear: 'none'
    },
    pose: { body: 'three_quarter', head: 'slightly_turned' },
    background: 'neutral'
  };
}

test('portrait_spec_v1 accepts a complete supported portrait', () => {
  const spec = validSpec();
  assert.deepEqual(validatePortraitSpecV1(spec), []);
  assert.equal(assertPortraitSpecV1(spec), spec);
  assert.equal(PORTRAIT_SPEC_V1_JSON_SCHEMA.additionalProperties, false);
  assert.equal(PORTRAIT_SPEC_V1_JSON_SCHEMA.properties.hair.additionalProperties, false);
});

test('portrait_spec_v1 rejects unknown enum values and fields', () => {
  const unknownEmotion = validSpec();
  unknownEmotion.expression.emotion = 'furious';
  assert.match(validatePortraitSpecV1(unknownEmotion)[0].message, /expression\.emotion must be one of/u);

  const unknownField = validSpec();
  unknownField.hair.secret_style = 'modern';
  assert.deepEqual(validatePortraitSpecV1(unknownField)[0], {
    path: 'hair.secret_style',
    code: 'additional_property',
    message: 'hair.secret_style is not allowed.'
  });
});

test('portrait_spec_v1 reports missing and non-object branches without throwing', () => {
  const errors = validatePortraitSpecV1({ schema: 'portrait_spec_v1', person: [] });
  assert.ok(errors.some((error) => error.path === 'hair' && error.code === 'required'));
  assert.ok(errors.some((error) => error.path === 'person' && error.code === 'type'));
  assert.throws(() => assertPortraitSpecV1(null), { code: 'PORTRAIT_SPEC_INVALID' });
});
