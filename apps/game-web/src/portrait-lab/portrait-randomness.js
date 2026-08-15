import {
  deterministicUnit,
  hashDeterministicValue
} from '../shared/deterministic-random.js';

export { deterministicUnit } from '../shared/deterministic-random.js';

export function buildPortraitIdentity(spec) {
  const seed = hashDeterministicValue(spec);
  const seeds = createPartSeeds(spec);
  return Object.freeze({
    seed,
    seeds,
    asymmetry: createAsymmetry(seeds),
    variants: createVariants(seeds)
  });
}

function createPartSeeds(spec) {
  const headIdentity = {
    person: pick(spec.person, ['sex', 'age', 'build', 'face_shape']),
    headPose: spec.pose.head
  };
  const bodyIdentity = {
    person: pick(spec.person, ['sex', 'build']),
    bodyPose: spec.pose.body
  };
  const scoped = (part, value) => hashDeterministicValue({ part, value });
  return Object.freeze({
    head: scoped('head', headIdentity),
    face: scoped('face', headIdentity),
    eyes: scoped('eyes', {
      ...headIdentity,
      eyes: pick(spec.eyes, ['gaze']),
      expression: spec.expression
    }),
    nose: scoped('nose', headIdentity),
    mouth: scoped('mouth', {
      ...headIdentity,
      expression: spec.expression
    }),
    hair: scoped('hair', {
      ...headIdentity,
      hair: pick(spec.hair, ['length', 'style'])
    }),
    beard: scoped('beard', {
      ...headIdentity,
      facialHair: spec.hair.facial_hair
    }),
    body: scoped('body', bodyIdentity),
    clothing: scoped('clothing', {
      ...bodyIdentity,
      clothing: pick(spec.clothing, [
        'neckline', 'sleeve', 'outer', 'fabric', 'trim'
      ])
    }),
    headwear: scoped('headwear', {
      ...headIdentity,
      headwear: spec.clothing.headwear
    }),
    background: scoped('background', spec.background),
    finishing: scoped('finishing', {
      headIdentity,
      bodyIdentity,
      hair: pick(spec.hair, ['length', 'style', 'facial_hair'])
    })
  });
}

function createAsymmetry(seeds) {
  const centered = (part, salt) => (
    deterministicUnit(seeds[part], salt) * 2 - 1
  );
  return Object.freeze({
    eyeOpen: centered('eyes', 1),
    eyeHeight: centered('eyes', 2) * 5.5,
    brow: centered('eyes', 3) * 5.8,
    mouth: centered('mouth', 4) * 6.5,
    faceLeft: centered('head', 5) * .065,
    faceRight: centered('head', 6) * .065,
    hair: Object.freeze(Array.from(
      { length: 7 },
      (_, index) => centered('hair', 20 + index) * 10
    )),
    beard: Object.freeze(Array.from(
      { length: 7 },
      (_, index) => centered('beard', 40 + index) * 9
    ))
  });
}

function createVariants(seeds) {
  const choice = (part, salt, count) => (
    Math.floor(deterministicUnit(seeds[part], salt) * count) % count
  );
  const leftEye = choice('eyes', 61, 5);
  return Object.freeze({
    leftEye,
    rightEye: (leftEye + 1 + choice('eyes', 62, 3)) % 5,
    nose: choice('nose', 63, 7),
    mouth: choice('mouth', 64, 5),
    contour: choice('head', 65, 4),
    hair: choice('hair', 66, 4),
    detail: choice('finishing', 67, 5)
  });
}

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}
