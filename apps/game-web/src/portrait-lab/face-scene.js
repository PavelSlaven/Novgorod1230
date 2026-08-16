import { ellipsePoints, joinPointSets, quadraticPoints } from './handmade.js';
import { noseLines } from './face-variants.js';
import { pointsToWorld, toWorld } from './geometry-utils.js';
import { projectFacePoint } from './render-model.js';
import { line, patch } from './scene-primitives.js';
export function buildFaceScene(model, visibility) {
  const patches = [];
  const strokes = [];
  const hatches = [];
  addEyesAndBrows(model, patches, strokes);
  addNose(model, strokes);
  addMouth(model, patches, strokes);
  addAgeAndExpression(model, strokes, hatches);
  if (visibility.details.earMarks) addEarMarks(model, strokes);
  return Object.freeze({ patches, strokes, hatches });
}
function addEyesAndBrows(model, patches, strokes) {
  const width = model.head.width;
  const height = model.head.height;
  const asymmetry = model.semantic_geometry.asymmetry;
  const eyes = [
    eyeLayout(model, -1, -width * .205, -height * .075 + asymmetry.eyeHeight,
      model.eyes.leftOpen, model.semantic_geometry.features.leftEye, 3000),
    eyeLayout(model, 1, width * .205, -height * .075 - asymmetry.eyeHeight * .55,
      model.eyes.rightOpen, model.semantic_geometry.features.rightEye, 3050)
  ];
  for (const eye of eyes) {
    const contour = eyeContour(eye);
    if (contour.closed) {
      patches.push(patch('eye_white', pointsToWorld(model, contour.points), '#eee8dc', {
        alpha: .42, salt: eye.salt, roughness: 1.1
      }));
    }
    for (const [index, points] of contour.strokes.entries()) {
      strokes.push(line('eye', pointsToWorld(model, points), model.ink.primary, {
        salt: eye.salt + index,
        width: 1.8 + model.expression.tension * .35,
        roughness: .85,
        double: index === 0
      }));
    }
    const gazeScale = Math.min(1, eye.halfWidth / 20);
    const irisX = eye.x + model.eyes.gaze.x * gazeScale;
    const irisY = eye.y + model.eyes.gaze.y * .7;
    const irisRadius = Math.max(3.2, Math.min(7.2, eye.height * .68))
      * model.eyes.irisScale;
    strokes.push(line('iris', localEllipse(model, irisX, irisY, irisRadius, irisRadius * .92, 18), model.eyes.color, {
      salt: eye.salt + 13, width: 2, roughness: .5
    }));
    strokes.push(line('pupil', localEllipse(model, irisX, irisY, irisRadius * .42, irisRadius * .5, 13), model.ink.primary, {
      salt: eye.salt + 18, width: 1.7, roughness: .35, double: true
    }));
    addEyeLids(model, eye, strokes);
    addLashes(model, eye, strokes);
    addBrow(model, eye, strokes);
  }
}
function eyeLayout(model, side, localX, localY, openness, variant, salt) {
  const center = projectFacePoint(model, localX, localY);
  const sideScale = side < 0 ? model.head.farScale : model.head.nearScale;
  return {
    side, variant, salt, x: center.x, y: center.y,
    halfWidth: model.head.width * .086 * sideScale * model.sex.eyeScale,
    height: Math.max(4.2, 15 * openness * sideScale * model.sex.eyeScale)
  };
}
function eyeContour(eye) {
  const left = [eye.x - eye.halfWidth, eye.y];
  const right = [eye.x + eye.halfWidth, eye.y + (eye.variant === 3 ? 2 : 0)];
  if (eye.variant === 1) {
    const points = ellipsePoints(eye.x, eye.y, eye.halfWidth * .82, eye.height * .84, 25);
    return { closed: true, points, strokes: [[...points, points[0]]] };
  }
  if (eye.variant === 2) {
    return {
      closed: false,
      points: [],
      strokes: [
        quadraticPoints(left, [eye.x, eye.y - eye.height], right, 11),
        quadraticPoints(
          [eye.x - eye.halfWidth * .7, eye.y + 3],
          [eye.x, eye.y + eye.height * .52],
          [eye.x + eye.halfWidth * .72, eye.y + 2], 8
        )
      ]
    };
  }
  if (eye.variant === 3) {
    const points = [
      left, [eye.x - eye.halfWidth * .12, eye.y - eye.height],
      right, [eye.x + eye.halfWidth * .16, eye.y + eye.height * .57]
    ];
    return { closed: true, points, strokes: [[...points, points[0]]] };
  }
  const eyeHeight = eye.variant === 4 ? eye.height * .48 : eye.height;
  const points = joinPointSets(
    quadraticPoints(left, [eye.x, eye.y - eyeHeight], right, 10),
    quadraticPoints(right, [eye.x, eye.y + eyeHeight * .62], left, 10)
  );
  return { closed: true, points, strokes: [[...points, points[0]]] };
}
function addEyeLids(model, eye, strokes) {
  const lidY = eye.y - eye.height * (1.5 + model.age.eyeBag * .05);
  strokes.push(line('eyelid', pointsToWorld(model, quadraticPoints(
    [eye.x - eye.halfWidth * .78, lidY + 2],
    [eye.x, lidY - 4],
    [eye.x + eye.halfWidth * .83, lidY + 1], 9
  )), model.ink.soft, {
    salt: eye.salt + 24, width: 1, alpha: .38, roughness: .55
  }));
  if (model.age.eyeBag || model.expression.tired) {
    const depth = 7 + model.age.eyeBag * 9 + model.expression.tired * 5;
    strokes.push(line('eye_bag', pointsToWorld(model, quadraticPoints(
      [eye.x - eye.halfWidth * .77, eye.y + eye.height * .64 + 4],
      [eye.x, eye.y + eye.height * .72 + depth],
      [eye.x + eye.halfWidth * .72, eye.y + eye.height * .62 + 4], 10
    )), model.ink.soft, {
      salt: eye.salt + 29,
      width: 1.1 + model.age.eyeBag * .5,
      alpha: .27 + model.age.eyeBag * .34,
      roughness: .65
    }));
  }
}
function addLashes(model, eye, strokes) {
  if (!model.sex.lash) return;
  const outerX = eye.x + eye.side * eye.halfWidth * .86;
  for (let index = 0; index < 2; index += 1) {
    const start = [
      outerX - eye.side * index * 3,
      eye.y - eye.height * (.4 - index * .08)
    ];
    strokes.push(line('lash', pointsToWorld(model, [
      start,
      [start[0] + eye.side * (7.5 - index) * model.sex.lash,
        start[1] - (5.5 - index) * model.sex.lash]
    ]), model.hair.deep, {
      salt: eye.salt + 34 + index, width: 1.05, alpha: .8, roughness: .3
    }));
  }
}
function addBrow(model, eye, strokes) {
  const width = model.head.width;
  const height = model.head.height;
  const inner = projectFacePoint(
    model, eye.side * width * .075,
    -height * .205 + model.expression.browInner
      + model.semantic_geometry.asymmetry.brow * eye.side
  );
  const outer = projectFacePoint(
    model, eye.side * width * .34,
    -height * .205 + model.expression.browOuter
      - model.semantic_geometry.asymmetry.brow * eye.side
  );
  const middle = [
    (inner.x + outer.x) / 2,
    Math.min(inner.y, outer.y) - model.sex.browArch - eye.variant % 2 * 2
  ];
  strokes.push(line('brow', pointsToWorld(model, quadraticPoints(
    [outer.x, outer.y], middle, [inner.x, inner.y], 11
  )), model.hair.deep, {
    salt: eye.salt + 40,
    width: 2 + model.sex.browWeight * .22 + model.expression.tension * .4,
    roughness: 1,
    double: true
  }));
}
function addNose(model, strokes) {
  const height = model.head.height;
  const width = model.head.width;
  const axis = model.head.faceAxisX;
  const top = -height * .035;
  const middle = height * .105;
  const bottom = height * (.205 + model.age.sag * .01);
  const noseWidth = width * (.092 + (model.age.category === 'old' ? .008 : 0))
    * model.sex.noseScale;
  const variant = model.semantic_geometry.features.nose;
  for (const [index, points] of noseLines(variant, {
    axis, top, middle, bottom, noseWidth
  }).entries()) {
    strokes.push(line('nose', pointsToWorld(model, points), model.ink.primary, {
      salt: 3200 + variant * 10 + index,
      width: index ? 1.25 : 1.65,
      alpha: index ? .72 : .66,
      roughness: .8,
      double: index === 0
    }));
  }
}
function addMouth(model, patches, strokes) {
  const width = model.head.width;
  const height = model.head.height;
  const variant = model.semantic_geometry.features.mouth;
  const halfWidth = width * (.135 + variant * .009) * model.sex.mouthScale;
  const left = projectFacePoint(model, -halfWidth, height * .315);
  const right = projectFacePoint(model, halfWidth, height * .315);
  const centerX = model.head.faceAxisX + model.semantic_geometry.asymmetry.mouth;
  const lift = model.expression.mouthCurve * 10;
  const leftCorner = [left.x, left.y - lift];
  const rightCorner = [right.x, right.y - lift + model.semantic_geometry.asymmetry.mouth];
  const centerY = height * .315 + model.expression.mouthCurve * 11;
  const open = Math.max(model.expression.mouthOpen, variant === 2 ? .15 : 0);
  if (open > .12) {
    const openHeight = 8 + open * 14;
    const openCenterY = centerY + (
      model.expression.emotion === 'surprised' ? height * .04 : 0
    );
    const shape = model.expression.emotion === 'surprised'
      ? ellipsePoints(centerX, openCenterY, 13 + open * 4, openHeight, 25)
      : joinPointSets(
        quadraticPoints(leftCorner, [centerX, openCenterY - openHeight * .48], rightCorner, 11),
        quadraticPoints(rightCorner, [centerX, openCenterY + openHeight], leftCorner, 11)
      );
    patches.push(patch('mouth', pointsToWorld(model, shape), '#593c37', {
      alpha: .58, salt: 3300 + variant, roughness: 1.3
    }));
    strokes.push(line('mouth', pointsToWorld(model, [...shape, shape[0]]), model.ink.primary, {
      salt: 3310 + variant, width: 1.8, roughness: 1.1
    }));
    return;
  }
  if (model.sex.feminine) {
    patches.push(patch('lower_lip', pointsToWorld(model, ellipsePoints(
      centerX, centerY + 5, halfWidth * .72, 8, 17
    )), '#a86861', {
      alpha: .32, salt: 3320 + variant, roughness: .8
    }));
  }
  const closedMouth = model.sex.feminine ? joinPointSets(
    quadraticPoints(leftCorner, [centerX - halfWidth * .28, centerY - 4],
      [centerX, centerY + 1], 7),
    quadraticPoints([centerX, centerY + 1],
      [centerX + halfWidth * .28, centerY - 4], rightCorner, 7)
  ) : quadraticPoints(leftCorner, [centerX, centerY], rightCorner, 13);
  strokes.push(line('mouth', pointsToWorld(model, closedMouth),
    model.sex.feminine ? '#754942' : model.ink.primary, {
    salt: 3330 + variant,
    width: model.sex.feminine ? 2.05 : variant === 4 ? 2.2 : 1.7,
    roughness: 1, double: variant === 0 || variant === 4
  }));
  if (model.sex.lipDefinition || variant === 1 || variant === 3) {
    strokes.push(line('lower_lip', pointsToWorld(model, quadraticPoints(
      [leftCorner[0] + 6, leftCorner[1] + 6 + model.sex.lipDefinition],
      [centerX, centerY + 10 + model.sex.lipDefinition * 2],
      [rightCorner[0] - 7, rightCorner[1] + 5 + model.sex.lipDefinition], 10
    )), '#83564f', {
      salt: 3340 + variant, width: 1.1 + model.sex.lipDefinition * .45,
      alpha: .5 + model.sex.lipDefinition * .28, roughness: .65
    }));
  }
}
function addAgeAndExpression(model, strokes, hatches) {
  const width = model.head.width;
  const height = model.head.height;
  const count = model.age.category === 'old' ? 4
    : model.age.category === 'middle_aged' ? 2 : model.age.lines ? 1 : 0;
  for (let index = 0; index < count; index += 1) {
    strokes.push(line('age_line', pointsToWorld(model, quadraticPoints(
      [-width * (.23 - index * .014), -height * .295 + index * 12],
      [0, -height * .31 + index * 13],
      [width * (.2 - index * .012), -height * .293 + index * 12], 11
    )), model.ink.soft, {
      salt: 3400 + index, width: 1, alpha: .2 + model.age.lines * .32, roughness: .65
    }));
  }
  const hatchCount = model.age.category === 'old' ? 7 : 3;
  for (let index = 0; index < hatchCount; index += 1) {
    const side = index % 3 === 0 ? -1 : 1;
    const point = projectFacePoint(
      model, side * width * (.27 + index % 2 * .035),
      height * (.12 + index * .02)
    );
    hatches.push(line('face_hatch', pointsToWorld(model, [
      [point.x - side * 8, point.y - 4], [point.x + side * 7, point.y + 5]
    ]), model.ink.faded, {
      salt: 3430 + index, width: .85,
      alpha: .14 + model.age.lines * .16, roughness: .4
    }));
  }
}

function addEarMarks(model, strokes) {
  const width = model.head.width;
  const height = model.head.height;
  for (const side of [-1, 1]) {
    const center = toWorld(model, [side * width * .465, -height * .005]);
    strokes.push(line('ear_mark', quadraticPoints(
      [center[0], center[1] - 16],
      [center[0] - side * 8, center[1]],
      [center[0], center[1] + 17], 9
    ), model.ink.soft, {
      salt: 3470 + side, width: 1.1, alpha: .55, roughness: .65
    }));
  }
}

function localEllipse(model, x, y, radiusX, radiusY, count) {
  return pointsToWorld(model, ellipsePoints(x, y, radiusX, radiusY, count));
}
