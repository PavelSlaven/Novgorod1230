import { quadraticPoints } from './handmade.js';
import { pointsToWorld } from './geometry-utils.js';
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
  const clothing = geometry.clothing;
  for (const [index, points] of [
    clothing.silhouette.left,
    clothing.silhouette.right
  ].entries()) {
    strokes.push(line(
      'garment_silhouette',
      points,
      model.ink.primary,
      {
        salt: 4200 + index,
        width: 2.8,
        roughness: 2.4,
        double: true,
        owner: clothing.owner
      }
    ));
  }
  if (visibility.neckVisible) {
    for (const [index, guide] of [body.neckLeft, body.neckRight].entries()) {
      const visible = verticalSlice(
        guide, visibility.neckStartY, visibility.neckEndY
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
  addNeckline(model, geometry, visibility, strokes);
  addClothingConstruction(model, clothing, strokes);
}

function addNeckline(model, geometry, visibility, strokes) {
  let salt = 4230;
  for (const boundary of geometry.clothing.neckline) {
    const parts = visibility.hidden.necklineCenter
      ? boundary.id === 'neckline_slit'
        ? []
        : [
            slicePoints(boundary.points, 0, .28),
            slicePoints(boundary.points, .72, 1)
          ]
      : [boundary.points];
    for (const points of parts) {
      strokes.push(line('neckline', points, model.ink.primary, {
        salt,
        width: 2,
        roughness: 1.15,
        double: true,
        boundaryId: boundary.id
      }));
      salt += 1;
    }
  }
}

function addClothingConstruction(model, clothing, strokes) {
  for (const [index, entry] of [
    ...clothing.seams,
    ...clothing.outerBoundaries
  ].entries()) {
    strokes.push(line('garment_boundary', entry.points, model.ink.primary, {
      salt: 4260 + index,
      width: 2.05,
      alpha: .86,
      roughness: 1.4,
      double: true,
      boundaryId: entry.id
    }));
  }
  for (const [index, entry] of clothing.folds.entries()) {
    strokes.push(line('fold', entry.points, model.ink.faded, {
      salt: 4310 + index,
      width: entry.style.width,
      alpha: entry.style.alpha,
      roughness: entry.style.roughness,
      origin: entry.origin
    }));
  }
  for (const [index, entry] of clothing.trim.entries()) {
    strokes.push(line('garment_trim', entry.points, model.clothing.secondary.deep, {
      salt: 4325 + index,
      width: entry.kind === 'edge_band' ? 1.45 : 1.1,
      alpha: .72,
      roughness: .7,
      boundaryId: entry.boundaryId,
      trimKind: entry.kind
    }));
  }
  for (const [index, entry] of clothing.texture.entries()) {
    strokes.push(line('garment_texture', entry.points, model.ink.soft, {
      salt: 4340 + index,
      width: Math.max(.75, entry.style.width * .72),
      alpha: entry.style.alpha * .8,
      roughness: entry.style.roughness,
      boundaryId: entry.boundaryId
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
  const axis = model.head.faceAxisX + model.semantic_geometry.asymmetry.mouth * .3;
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
