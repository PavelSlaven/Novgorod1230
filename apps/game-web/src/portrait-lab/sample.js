export const SAMPLE_PORTRAIT_TEXT = [
  'Мужчина около сорока лет, крепкий, тёмные волосы, короткая борода.',
  'Смотрит подозрительно, немного прищурившись.',
  'На нём тёмно-синий кафтан и простая рубаха.'
].join('\n');

export const SAMPLE_PORTRAIT_SPEC = Object.freeze({
  schema: 'portrait_spec_v1',
  person: Object.freeze({
    sex: 'male', age: 'middle_aged', build: 'stocky',
    skin_tone: 'light', face_shape: 'broad'
  }),
  hair: Object.freeze({
    color: 'dark_brown', length: 'medium', style: 'loose',
    facial_hair: 'short_beard'
  }),
  eyes: Object.freeze({ color: 'gray', gaze: 'viewer' }),
  expression: Object.freeze({ emotion: 'suspicious', intensity: 'medium' }),
  clothing: Object.freeze({
    base: 'linen_tunic', outer: 'caftan', main_color: 'dark_blue',
    secondary_color: 'undyed_linen', headwear: 'none'
  }),
  pose: Object.freeze({ body: 'three_quarter', head: 'slightly_turned' }),
  background: 'neutral'
});
