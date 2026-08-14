import { assertPortraitSpecV1 } from './contract.js';

const SKIN = Object.freeze({
  pale: '#d9bca9', light: '#c9977d', warm: '#ad725b', brown: '#79503f'
});
const HAIR = Object.freeze({
  blond: '#b69a62', light_brown: '#806447', dark_brown: '#49362d',
  black: '#292725', auburn: '#744737', gray: '#77756f', white: '#c8c3b9'
});
const EYES = Object.freeze({
  blue: '#4f7d91', gray: '#6f7a78', green: '#55715a',
  brown: '#72513a', dark: '#302824'
});
const CLOTH = Object.freeze({
  undyed_linen: '#c6b995', dark_blue: '#536a76', forest_green: '#687764',
  madder_red: '#91645b', ochre: '#ad8d55', brown: '#756150', charcoal: '#60625e'
});
const BACKGROUNDS = Object.freeze({
  neutral: { paper: '#e9e3d6', fiber: '#8f826f', wash: '#b9aa93' },
  parchment: { paper: '#e7ddc7', fiber: '#927c5e', wash: '#c3a878' },
  warm: { paper: '#eadbd2', fiber: '#98796b', wash: '#c59179' },
  cool: { paper: '#e1e4df', fiber: '#758488', wash: '#91a3a2' }
});
const BUILDS = Object.freeze({
  slim: { shoulder: 214, waist: 154, neck: 49, face: .94, jaw: -.045, ribcage: 176 },
  average: { shoulder: 264, waist: 198, neck: 62, face: 1, jaw: 0, ribcage: 215 },
  stocky: { shoulder: 306, waist: 244, neck: 78, face: 1.065, jaw: .055, ribcage: 252 }
});
const FACES = Object.freeze({
  oval: { width: 224, height: 294, jaw: .73, chin: .18 },
  round: { width: 242, height: 270, jaw: .82, chin: .24 },
  broad: { width: 252, height: 286, jaw: .87, chin: .21 },
  angular: { width: 232, height: 300, jaw: .69, chin: .14 },
  long: { width: 210, height: 318, jaw: .70, chin: .16 }
});
const AGES = Object.freeze({
  young: { lines: 0, eyeBag: 0, sag: 0, softness: .8, eyeScale: 1.08, grayMix: 0 },
  adult: { lines: .16, eyeBag: .12, sag: .05, softness: .55, eyeScale: 1, grayMix: 0 },
  middle_aged: { lines: .58, eyeBag: .42, sag: .28, softness: .25, eyeScale: .91, grayMix: .07 },
  old: { lines: 1, eyeBag: .85, sag: .72, softness: 0, eyeScale: .76, grayMix: .28 }
});

export function buildRenderModel(spec) {
  assertPortraitSpecV1(spec);
  const build = BUILDS[spec.person.build];
  const face = FACES[spec.person.face_shape];
  const age = AGES[spec.person.age];
  const seed = hashSpec(spec);
  const asymmetry = createAsymmetry(seed);
  const variants = createVariants(seed);
  const feminine = spec.person.sex === 'female';
  const bodyTurn = spec.pose.body === 'three_quarter' ? .16 : 0;
  const headTurn = spec.pose.head === 'slightly_turned' ? .14 : 0;
  const turn = bodyTurn + headTurn;
  const expression = expressionModel(spec.expression.emotion, spec.expression.intensity);
  const centerX = 384 + bodyTurn * 80;
  const shoulder = build.shoulder + (feminine ? -18 : 12);
  const headWidth = face.width * build.face * (feminine ? .95 : 1.03);
  const headHeight = face.height * (feminine ? .98 : 1);
  const poseTilt = spec.pose.head === 'tilted' ? -.075 : 0;
  const shoulderY = feminine ? 495 : 484;
  const farScale = 1 - turn * 1.18;
  const nearScale = 1 + turn * .18;
  const faceAxisX = turn * headWidth * .28;

  return Object.freeze({
    spec,
    identity: Object.freeze({ seed, asymmetry, variants }),
    width: 768,
    height: 768,
    background: Object.freeze(BACKGROUNDS[spec.background]),
    ink: Object.freeze({ primary: '#302c27', soft: '#625b51', faded: '#81786c' }),
    body: Object.freeze({
      centerX,
      shoulderLeft: centerX - shoulder * (bodyTurn ? .72 : 1),
      shoulderRight: centerX + shoulder * (bodyTurn ? 1.07 : 1),
      waistLeft: centerX - build.waist * (bodyTurn ? .82 : 1),
      waistRight: centerX + build.waist * (bodyTurn ? 1.04 : 1),
      shoulderY,
      shoulderLeftY: shoulderY - bodyTurn * 46,
      shoulderRightY: shoulderY + bodyTurn * 28,
      ribcageWidth: build.ribcage,
      ribcageHeight: spec.person.build === 'stocky' ? 242 : 226,
      turn: bodyTurn,
      build: spec.person.build
    }),
    head: Object.freeze({
      cx: 384 + turn * 88,
      cy: 310 + age.sag * 5,
      width: headWidth,
      height: headHeight,
      jaw: clamp(face.jaw + build.jaw + (feminine ? -.035 : .025), .61, .94),
      chin: face.chin,
      turn,
      faceAxisX,
      farScale,
      nearScale,
      rotation: poseTilt + expression.headTilt,
      neckWidth: build.neck + (feminine ? -8 : 5)
    }),
    skin: colorRamp(SKIN[spec.person.skin_tone]),
    hair: Object.freeze({
      ...colorRamp(HAIR[spec.hair.color], .17),
      gray: spec.hair.color === 'white' ? '#e7e1d5' : '#aaa79f',
      grayMix: age.grayMix
    }),
    eyes: Object.freeze({
      color: EYES[spec.eyes.color],
      gaze: gazeOffset(spec.eyes.gaze),
      leftOpen: clamp(expression.leftEye * age.eyeScale * (1 + asymmetry.eyeOpen * .025), .28, 1.4),
      rightOpen: clamp(expression.rightEye * age.eyeScale * (1 - asymmetry.eyeOpen * .025), .28, 1.4),
      irisScale: expression.irisScale,
      lowerLid: expression.lowerLid
    }),
    age: Object.freeze({ ...age, category: spec.person.age }),
    sex: Object.freeze({
      feminine,
      browWeight: feminine ? 3.8 : 6.2,
      lash: feminine ? 1 : 0,
      shoulderSlope: feminine ? 22 : 12
    }),
    expression,
    armature: Object.freeze({
      face: Object.freeze({
        axisX: faceAxisX,
        farScale,
        nearScale,
        turn
      }),
      shoulders: Object.freeze({
        left: Object.freeze({ x: centerX - shoulder * (bodyTurn ? .72 : 1), y: shoulderY - bodyTurn * 46 }),
        right: Object.freeze({ x: centerX + shoulder * (bodyTurn ? 1.07 : 1), y: shoulderY + bodyTurn * 28 })
      }),
      ribcage: Object.freeze({
        cx: centerX + bodyTurn * 24,
        cy: 622,
        radiusX: build.ribcage,
        radiusY: spec.person.build === 'stocky' ? 170 : 154
      })
    }),
    clothing: Object.freeze({
      main: colorRamp(CLOTH[spec.clothing.main_color], .2),
      secondary: colorRamp(CLOTH[spec.clothing.secondary_color], .2),
      base: spec.clothing.base,
      outer: spec.clothing.outer,
      headwear: spec.clothing.headwear
    })
  });
}

function expressionModel(emotion, intensity) {
  const amount = { low: .65, medium: 1, high: 1.28 }[intensity];
  const base = {
    neutral: { leftEye: .86, rightEye: .84, browInner: 0, browOuter: 0, mouth: 0, open: 0, tension: 0, iris: 1, lower: .78 },
    calm: { leftEye: .70, rightEye: .68, browInner: -1, browOuter: 1, mouth: .16, open: 0, tension: 0, iris: 1, lower: .68 },
    happy: { leftEye: .62, rightEye: .60, browInner: -1, browOuter: 0, mouth: .9, open: .18, tension: .15, iris: .96, lower: .58 },
    sad: { leftEye: .68, rightEye: .65, browInner: -9, browOuter: 5, mouth: -.72, open: .08, tension: .2, iris: 1.02, lower: .86 },
    angry: { leftEye: .55, rightEye: .58, browInner: 11, browOuter: -6, mouth: -.18, open: 0, tension: 1, iris: .92, lower: .56 },
    afraid: { leftEye: 1.28, rightEye: 1.22, browInner: -12, browOuter: -5, mouth: -.12, open: .65, tension: .78, iris: .82, lower: 1.05 },
    suspicious: { leftEye: .40, rightEye: .68, browInner: 4, browOuter: -3, mouth: -.18, open: 0, tension: .48, asymmetry: 1, iris: .96, lower: .58 },
    tired: { leftEye: .36, rightEye: .40, browInner: 3, browOuter: 6, mouth: -.35, open: .04, tension: .05, tired: 1, iris: 1.02, lower: .46 },
    surprised: { leftEye: 1.34, rightEye: 1.30, browInner: -13, browOuter: -12, mouth: 0, open: 1, tension: .28, iris: .78, lower: 1.08 }
  }[emotion];
  return Object.freeze({
    emotion,
    amount,
    leftEye: clamp(.86 + (base.leftEye - .86) * amount, .3, 1.4),
    rightEye: clamp(.86 + (base.rightEye - .86) * amount, .3, 1.4),
    browInner: base.browInner * amount,
    browOuter: base.browOuter * amount,
    mouthCurve: base.mouth * amount,
    mouthOpen: base.open * amount,
    tension: base.tension * amount,
    asymmetry: (base.asymmetry ?? 0) * amount,
    tired: base.tired ?? 0,
    irisScale: base.iris,
    lowerLid: base.lower,
    headTilt: emotion === 'suspicious' ? -.025 * amount
      : emotion === 'sad' ? .018 * amount : 0
  });
}

function gazeOffset(gaze) {
  if (gaze === 'left') return Object.freeze({ x: -7, y: 0 });
  if (gaze === 'right') return Object.freeze({ x: 7, y: 0 });
  if (gaze === 'down') return Object.freeze({ x: 0, y: 5 });
  return Object.freeze({ x: 0, y: 0 });
}

function colorRamp(base, spread = .14) {
  return Object.freeze({
    base,
    light: shiftColor(base, spread),
    shadow: shiftColor(base, -spread),
    deep: shiftColor(base, -spread * 1.75)
  });
}

export function projectFacePoint(model, x, y) {
  const scale = x < 0 ? model.head.farScale : model.head.nearScale;
  return Object.freeze({
    x: model.head.faceAxisX + x * scale,
    y: y + x * model.head.turn * .035
  });
}

export function deterministicUnit(seed, salt = 0) {
  let value = (seed ^ Math.imul(Number(salt) + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function hashSpec(spec) {
  const source = stableStringify(spec);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createAsymmetry(seed) {
  const centered = (salt) => deterministicUnit(seed, salt) * 2 - 1;
  return Object.freeze({
    eyeOpen: centered(1),
    eyeHeight: centered(2) * 5.5,
    brow: centered(3) * 5.8,
    mouth: centered(4) * 6.5,
    faceLeft: centered(5) * .065,
    faceRight: centered(6) * .065,
    hair: Object.freeze(Array.from({ length: 7 }, (_, index) => centered(20 + index) * 10)),
    beard: Object.freeze(Array.from({ length: 7 }, (_, index) => centered(40 + index) * 9))
  });
}

function createVariants(seed) {
  const choice = (salt, count) => Math.floor(deterministicUnit(seed, salt) * count) % count;
  const leftEye = choice(61, 5);
  return Object.freeze({
    leftEye,
    rightEye: (leftEye + 1 + choice(62, 3)) % 5,
    nose: choice(63, 7),
    mouth: choice(64, 5),
    contour: choice(65, 4),
    hair: choice(66, 4),
    detail: choice(67, 5)
  });
}

function shiftColor(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const shift = Math.round(255 * amount);
  const channel = (bits) => clamp(((value >> bits) & 255) + shift, 0, 255);
  return `#${[channel(16), channel(8), channel(0)]
    .map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
