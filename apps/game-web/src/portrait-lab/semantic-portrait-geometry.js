const FIXED_PATTERN = Object.freeze([
  0.17, 0.61, 0.34, 0.83, 0.46, 0.72, 0.25, 0.91, 0.53, 0.08, 0.68, 0.39
]);
const DRAWING_STYLE_KEYS = Object.freeze({
  head: 101, face: 211, eyes: 307, nose: 401, mouth: 503,
  hair: 601, beard: 701, body: 809, clothing: 907,
  headwear: 1009, background: 1103, finishing: 1201
});

export function buildSemanticPortraitGeometry(spec) {
  return Object.freeze({
    asymmetry: Object.freeze({
      eyeOpen: 0, eyeHeight: 0, brow: 0, mouth: 0,
      faceLeft: 0, faceRight: 0,
      hair: Object.freeze([0, 0, 0, 0, 0, 0, 0]),
      beard: Object.freeze([0, 0, 0, 0, 0, 0, 0])
    }),
    features: Object.freeze({
      leftEye: gazeFeature(spec.eyes.gaze),
      rightEye: gazeFeature(spec.eyes.gaze),
      nose: faceFeature(spec.person.face_shape),
      mouth: expressionFeature(spec.expression.emotion),
      contour: contourFeature(spec.person.face_shape),
      hair: hairFeature(spec.hair.style),
      detail: ageFeature(spec.person.age)
    })
  });
}

export function fixedPatternUnit(index = 0) {
  const normalized = Math.abs(Math.trunc(Number(index) || 0));
  return FIXED_PATTERN[normalized % FIXED_PATTERN.length];
}

export function fixedDrawingStyleKey(part) {
  return DRAWING_STYLE_KEYS[part] ?? 1;
}

function gazeFeature(value) {
  return { viewer: 0, left: 1, right: 2, down: 3 }[value];
}

function faceFeature(value) {
  return { oval: 0, round: 1, broad: 3, angular: 4, long: 6 }[value];
}

function contourFeature(value) {
  return { oval: 0, round: 1, broad: 2, angular: 3, long: 3 }[value];
}

function expressionFeature(value) {
  return {
    neutral: 0, calm: 1, happy: 2, sad: 3, angry: 4,
    afraid: 2, suspicious: 4, tired: 3, surprised: 2
  }[value];
}

function hairFeature(value) {
  return { straight: 0, wavy: 1, loose: 2, braided: 3 }[value];
}

function ageFeature(value) {
  return { young: 0, adult: 1, middle_aged: 2, old: 3 }[value];
}
