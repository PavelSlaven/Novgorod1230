import { quadraticPoints } from './handmade.js';
import { pointsToWorld } from './geometry-utils.js';
import { deterministicUnit } from './render-model.js';
import {
  line,
  slicePoints,
  verticalSlice
} from './scene-primitives.js';

export function buildVisibleStrokes(model, geometry, visibility) {
  const strokes = [];
  addBodyContour(model, geometry, visibility, strokes);
  addHeadContour(model, geometry, visibility, strokes);
  addHairAndHeadwear(model, geometry, visibility, strokes);
  addFacialHair(model, geometry, strokes);
  return strokes;
}

function addBodyContour(model, geometry, visibility, strokes) {
  const body = geometry.body;
  strokes.push(line('body_silhouette', body.leftOutline, model.ink.primary, {
    salt: 4200, width: 2.8, roughness: 2.4, double: true
  }));
  strokes.push(line('body_silhouette', body.rightOutline, model.ink.primary, {
    salt: 4201, width: 2.8, roughness: 2.4, double: true
  }));
  if (visibility.neckVisible) {
    for (const [index, guide] of [body.neckLeft, body.neckRight].entries()) {
      const visible = verticalSlice(
        guide, visibility.neckStartY, body.collarY
      );
      if (visible.length > 1) {
        strokes.push(line('neck', visible, model.ink.soft, {
          salt: 4210 + index,
          width: 1.55,
          alpha: .7,
          roughness: 1.2
        }));
      }
    }
  }
  const collar = quadraticPoints(
    body.collarLeft,
    [
      model.body.centerX,
      body.collarY + (model.clothing.base === 'wool_tunic' ? 38 : 28)
    ],
    body.collarRight,
    18
  );
  const collarParts = geometry.beard.present
      && geometry.beard.bottomY > body.collarY - 8
    ? [slicePoints(collar, 0, .27), slicePoints(collar, .73, 1)]
    : [collar];
  for (const [index, points] of collarParts.entries()) {
    strokes.push(line('collar', points, model.ink.primary, {
      salt: 4230 + index,
      width: model.clothing.base === 'embroidered_tunic' ? 2.8 : 2,
      roughness: 1.15,
      double: true
    }));
  }
  addGarmentBoundaries(model, geometry, strokes);
  addFolds(model, strokes);
}

function addGarmentBoundaries(model, geometry, strokes) {
  const center = model.body.centerX;
  if (model.clothing.outer === 'caftan') {
    strokes.push(line('outer_garment', quadraticPoints(
      geometry.body.collarLeft,
      [center - 42, 530],
      [center + 4, 782], 20
    ), model.ink.primary, {
      salt: 4260, width: 2.25, roughness: 1.5, double: true
    }));
    strokes.push(line('outer_garment', quadraticPoints(
      geometry.body.collarRight,
      [center + 34, 520],
      [center - 18, 555], 11
    ), model.ink.soft, {
      salt: 4261, width: 1.45, alpha: .64, roughness: 1.2
    }));
    return;
  }
  if (model.clothing.outer === 'cloak') {
    strokes.push(line('outer_garment', quadraticPoints(
      [center - 20, 468],
      [center - 86, 570],
      [model.body.waistLeft - 14, 782], 21
    ), model.ink.primary, {
      salt: 4270, width: 2.35, roughness: 1.7, double: true
    }));
    return;
  }
  if (model.clothing.outer === 'sheepskin') {
    for (const side of [-1, 1]) {
      strokes.push(line('outer_garment', quadraticPoints(
        [center + side * 37, 519],
        [center + side * 27, 650],
        [center + side * 23, 782], 18
      ), model.ink.primary, {
        salt: 4280 + side, width: 2, roughness: 1.6
      }));
    }
  }
}

function addFolds(model, strokes) {
  const count = model.spec.person.build === 'stocky' ? 5 : 4;
  const left = model.clothing.outer === 'none'
    ? model.body.waistLeft
    : model.body.centerX - model.head.neckWidth * .7;
  const right = model.clothing.outer === 'none'
    ? model.body.waistRight
    : model.body.centerX + model.head.neckWidth * .7;
  for (let index = 0; index < count; index += 1) {
    const ratio = (index + 1) / (count + 1);
    const x = left + (right - left) * ratio;
    const drift = (deterministicUnit(
      model.identity.seeds.clothing, 4300 + index
    ) - .5) * 18;
    strokes.push(line('fold', quadraticPoints(
      [x, 556 + index % 2 * 18],
      [x + drift, 648],
      [x + drift * .35, 735 + index % 3 * 12], 16
    ), model.ink.faded, {
      salt: 4310 + index,
      width: 1.05,
      alpha: .32,
      roughness: .9
    }));
  }
}

function addHeadContour(model, geometry, visibility, strokes) {
  const head = geometry.head;
  if (visibility.crownOwner === 'head') {
    strokes.push(line('outer_silhouette', head.crown, model.ink.primary, {
      part: 'head',
      salt: 4350, width: 2.75, roughness: 2.1, double: true
    }));
  }
  const scarf = geometry.headwear.kind === 'headscarf';
  const leftStart = scarf ? .58 : 0;
  const leftEnd = geometry.beard.present ? .68 : 1;
  const rightStart = geometry.beard.present ? .32 : 0;
  const rightEnd = scarf ? .42 : 1;
  const leftSide = slicePoints(head.leftSide, leftStart, leftEnd);
  const rightSide = slicePoints(head.rightSide, rightStart, rightEnd);
  for (const [index, points] of [leftSide, rightSide].entries()) {
    strokes.push(line('outer_silhouette', points, model.ink.primary, {
      part: 'head',
      salt: 4360 + index, width: 2.6, roughness: 1.9, double: true
    }));
  }
  if (visibility.jawOwner === 'head') {
    strokes.push(line('outer_silhouette', head.leftJaw, model.ink.primary, {
      part: 'head',
      salt: 4370, width: 2.55, roughness: 1.8, double: true
    }));
    strokes.push(line('outer_silhouette', head.rightJaw, model.ink.primary, {
      part: 'head',
      salt: 4371, width: 2.55, roughness: 1.8, double: true
    }));
  } else {
    strokes.push(line(
      'outer_silhouette',
      geometry.beard.outer,
      model.ink.primary,
      {
        part: 'beard',
        salt: 4380,
        width: 2.7,
        roughness: 2.4,
        double: true
      }
    ));
  }
}

function addHairAndHeadwear(model, geometry, visibility, strokes) {
  if (geometry.hair.present) {
    const outer = visibility.crownOwner === 'hair'
      ? geometry.hair.outer
      : geometry.hair.outer.slice(1);
    if (geometry.headwear.kind !== 'headscarf') {
      for (const [index, points] of outer.entries()) {
        strokes.push(line('outer_silhouette', points, model.ink.primary, {
          part: 'hair',
          salt: 4400 + index, width: 2.65, roughness: 2.2, double: true
        }));
      }
      strokes.push(line('hairline', geometry.hair.hairline, model.ink.primary, {
        salt: 4420, width: 2.15, roughness: 1.7, double: true
      }));
    }
  }
  if (geometry.headwear.present) {
    for (const [index, points] of geometry.headwear.outer.entries()) {
      strokes.push(line('outer_silhouette', points, model.ink.primary, {
        part: 'headwear',
        salt: 4440 + index, width: 2.8, roughness: 2.5, double: true
      }));
    }
    for (const [index, points] of geometry.headwear.inner.entries()) {
      strokes.push(line('headwear_boundary', points, model.ink.primary, {
        salt: 4460 + index, width: 1.9, roughness: 1.5
      }));
    }
  }
}

function addFacialHair(model, geometry, strokes) {
  const style = model.spec.hair.facial_hair;
  if (style === 'none') return;
  const height = model.head.height;
  const width = model.head.width;
  const axis = model.head.faceAxisX + model.identity.asymmetry.mouth * .3;
  const y = height * .265;
  for (const side of [-1, 1]) {
    const moustache = quadraticPoints(
      [axis + side, y - 2],
      [axis + side * width * .09, y - 10 + side * 2],
      [axis + side * width * .18, y + 7], 11
    );
    strokes.push(line(
      'moustache',
      pointsToWorld(model, moustache),
      model.hair.deep,
      { salt: 4480 + side, width: 2.5, roughness: 1.2, double: true }
    ));
  }
}
