import { quadraticPoints } from './handmade.js';
import { pointsToWorld } from './geometry-utils.js';
import { deterministicUnit } from './render-model.js';
import { line } from './scene-primitives.js';

export function buildHatches(model, geometry, visibility) {
  const hatches = [];
  if (geometry.hair.present) {
    const visibleHair = visibleHairStrands(geometry, visibility);
    for (const [index, points] of visibleHair.entries()) {
      hatches.push(line(
        'hair_hatch',
        points,
        hairStrokeColor(model, index, 4500, 'hair'),
        {
          salt: 4500 + index,
          width: index % 4 ? 1.15 : 1.6,
          alpha: .54,
          roughness: .85
        }
      ));
    }
    if (visibility.details.braid) {
      addBraidInk(model, geometry.hair.braid, hatches);
    } else if (visibility.details.braidTail) {
      addBraidTailInk(model, geometry.hair.braid, hatches);
    }
  }
  if (geometry.beard.present) addBeardHatches(model, geometry, hatches);
  return hatches;
}

function addBraidInk(model, braid, hatches) {
  hatches.push(line('braid_lead', braid.lead, model.hair.deep, {
    salt: 4558,
    width: 1.65,
    alpha: .72,
    roughness: .85,
    double: true
  }));
  for (const [index, points] of braid.links.entries()) {
    hatches.push(line(
      'braid_link',
      points,
      hairStrokeColor(model, index, 4560, 'hair'),
      {
        salt: 4560 + index,
        width: index % 2 ? 1.45 : 1.7,
        alpha: .72,
        roughness: .9,
        double: index % 2 === 0
      }
    ));
  }
  for (const [index, points] of braid.ties.entries()) {
    hatches.push(line('braid_tie', points, model.hair.deep, {
      salt: 4572 + index,
      width: 1.55,
      alpha: .78,
      roughness: .75,
      double: true
    }));
  }
}

function addBraidTailInk(model, braid, hatches) {
  const firstVisible = Math.ceil(braid.links.length / 2);
  for (const [offset, points] of braid.links.slice(firstVisible).entries()) {
    const index = firstVisible + offset;
    hatches.push(line(
      'braid_link',
      points,
      hairStrokeColor(model, index, 4560, 'hair'),
      {
        salt: 4560 + index,
        width: index % 2 ? 1.45 : 1.7,
        alpha: .72,
        roughness: .9,
        double: index % 2 === 0
      }
    ));
  }
  for (const [index, points] of braid.ties.entries()) {
    hatches.push(line('braid_tie', points, model.hair.deep, {
      salt: 4572 + index,
      width: 1.55,
      alpha: .78,
      roughness: .75,
      double: true
    }));
  }
}

function visibleHairStrands(geometry, visibility) {
  if (visibility.crownOwner !== 'headwear') return geometry.hair.strands;
  if (geometry.headwear.kind === 'headscarf') return [];
  return geometry.hair.sideStrands;
}

export function buildScratches(model) {
  const scratches = [];
  for (let index = 0; index < 9; index += 1) {
    const x = model.body.centerX - 105 + index * 27;
    const y = 520 + index % 3 * 61;
    scratches.push(line('finishing_scratch', [
      [x - 4, y],
      [x + 5 + index % 2 * 3, y + 2]
    ], model.ink.faded, {
      salt: 4620 + index,
      width: .7,
      alpha: .2,
      roughness: .45
    }));
  }
  return scratches;
}

function addBeardHatches(model, geometry, hatches) {
  const count = geometry.beard.full ? 15 : 9;
  for (let index = 0; index < count; index += 1) {
    const ratio = (index + .5) / count;
    const x = -model.head.width * .31 + ratio * model.head.width * .62;
    const edge = Math.abs(ratio - .5) * 2;
    const startY = model.head.height * (.34 + edge * .04);
    const endY = model.head.height
      * (geometry.beard.full ? .62 : .47) - edge * 30;
    hatches.push(line(
      'beard_hatch',
      pointsToWorld(model, quadraticPoints(
        [x, startY],
        [x + (index % 2 ? 9 : -8), (startY + endY) / 2],
        [x * .72, endY], 10
      )),
      hairStrokeColor(model, index, 4540, 'beard'),
      {
        salt: 4540 + index,
        width: 1.1,
        alpha: .5,
        roughness: .8
      }
    ));
  }
}

function hairStrokeColor(model, index, salt, part) {
  const gray = deterministicUnit(model.identity.seeds[part], salt + index)
    < model.hair.grayMix * 1.8;
  return gray
    ? model.hair.gray
    : index % 3 ? model.hair.deep : model.hair.light;
}
