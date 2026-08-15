import { joinPointSets, quadraticPoints } from './handmade.js';
import { fixedPatternUnit } from './semantic-portrait-geometry.js';
const FABRIC = Object.freeze({
  light_linen: Object.freeze({ folds: 5, width: .9, alpha: .34, roughness: .72, texture: 2 }),
  wool: Object.freeze({ folds: 3, width: 1.18, alpha: .38, roughness: .88, texture: 0 }),
  coarse_wool: Object.freeze({ folds: 3, width: 1.48, alpha: .48, roughness: 1.08, texture: 4 }),
  furred: Object.freeze({ folds: 1, width: 1.58, alpha: .4, roughness: 1.12, texture: 8 })
});
export function buildClothingDetails(model, geometry) {
  const profile = FABRIC[model.clothing.fabric];
  return Object.freeze({
    folds: Object.freeze(buildFolds(model, geometry, profile)),
    trim: Object.freeze(buildTrim(model, geometry)),
    texture: Object.freeze(buildTexture(model, geometry, profile))
  });
}
export function buildFrontBoundary(id, start, anchors, side) {
  return clothingBoundary(id, quadraticPoints(
    start,
    [anchors.chestCenter[0] + side * 18, anchors.chestCenter[1] - 32],
    [anchors.chestCenter[0] + side * 10, anchors.waistLeft[1] - 2],
    20
  ));
}
export function buildArmholeBoundary(id, anchors, side) {
  const shoulder = side < 0 ? anchors.shoulderLeft : anchors.shoulderRight;
  const underarm = side < 0 ? anchors.underarmLeft : anchors.underarmRight;
  const waist = side < 0 ? anchors.waistLeft : anchors.waistRight;
  return clothingBoundary(id, joinPointSets(
    quadraticPoints(
      shoulder,
      [shoulder[0] - side * 44, shoulder[1] + 44],
      [underarm[0] - side * 34, underarm[1] + 5],
      9
    ),
    quadraticPoints(
      [underarm[0] - side * 34, underarm[1] + 5],
      [
        waist[0] - side * 48,
        lerp(underarm[1], waist[1], .57)
      ],
      waist,
      12
    )
  ));
}
export function buildFullSilhouettePatch(anchors, silhouette) {
  return [
    ...silhouette.left,
    ...silhouette.right.slice(1),
    [
      (anchors.waistLeft[0] + anchors.waistRight[0]) / 2,
      (anchors.waistLeft[1] + anchors.waistRight[1]) / 2
    ]
  ];
}
export function buildCentralUnderlayer(anchors) {
  const topX = (anchors.collarLeft[0] + anchors.collarRight[0]) / 2;
  const bottomX = anchors.chestCenter[0];
  const topY = Math.max(anchors.collarLeft[1], anchors.collarRight[1]);
  const bottomY = topY + 128;
  const topHalf = Math.min(
    28,
    Math.abs(anchors.collarRight[0] - anchors.collarLeft[0]) * .34
  );
  return [
    [topX - topHalf, topY + 3],
    [bottomX - 6, bottomY],
    [bottomX + 6, bottomY],
    [topX + topHalf, topY + 3]
  ];
}
export function buildSleeveBoundaries(model, anchors) {
  if (model.clothing.outer === 'sleeveless_overlayer') return [];
  const span = Math.abs(anchors.shoulderRight[0] - anchors.shoulderLeft[0]);
  const inset = span * (model.clothing.sleeve === 'wide' ? .2 : .13);
  return [-1, 1].map((side) => {
    const left = side < 0;
    const shoulder = left ? anchors.shoulderLeft : anchors.shoulderRight;
    const underarm = left ? anchors.underarmLeft : anchors.underarmRight;
    const waist = left ? anchors.waistLeft : anchors.waistRight;
    return clothingBoundary(`sleeve_${left ? 'left' : 'right'}`, joinPointSets(
      quadraticPoints(shoulder, [
        shoulder[0] - side * 20, shoulder[1] + 38
      ], underarm, 8),
      quadraticPoints(
        underarm,
        [underarm[0] - side * inset * .58,
          lerp(underarm[1], waist[1], .56)],
        [waist[0] - side * inset, waist[1] - 2],
        12
      )
    ));
  });
}
function buildFolds(model, geometry, profile) {
  const folds = [];
  const origins = availableOrigins(geometry.tensionRegions);
  const waist = geometry.anchors;
  for (let index = 0; index < profile.folds; index += 1) {
    const origin = origins[index % origins.length];
    const candidates = geometry.tensionRegions[origin];
    const selected = Math.floor(
      fixedPatternUnit(5100 + index)
        * candidates.length
    ) % candidates.length;
    const start = candidates[selected];
    const ratio = clamp(
      (start[0] - waist.waistLeft[0])
        / (waist.waistRight[0] - waist.waistLeft[0]),
      .12,
      .88
    );
    const drift = (
      fixedPatternUnit(5120 + index) - .5
    ) * (model.clothing.fabric === 'light_linen' ? 22 : 14);
    const end = [
      lerp(waist.waistLeft[0], waist.waistRight[0], ratio) + drift * .35,
      lerp(
        waist.chestCenter[1],
        (waist.waistLeft[1] + waist.waistRight[1]) / 2,
        .68 + index % 3 * .075
      )
    ];
    folds.push(Object.freeze({
      points: quadraticPoints(
        start,
        [start[0] + drift, (start[1] + end[1]) / 2],
        end,
        15
      ),
      origin,
      style: profile
    }));
  }
  if (model.clothing.sleeve === 'wide') {
    for (const [index, start] of geometry.tensionRegions.shoulder.entries()) {
      const side = index ? 1 : -1;
      folds.push(Object.freeze({
        points: quadraticPoints(
          start,
          [start[0] + side * 18, start[1] + 34],
          geometry.tensionRegions.underarm[index],
          8
        ),
        origin: 'shoulder',
        style: Object.freeze({
          ...profile,
          width: Math.max(.9, profile.width * .82),
          alpha: profile.alpha * .82
        })
      }));
    }
  }
  return folds;
}
function availableOrigins(regions) {
  const ordered = ['closure', 'neckline', 'shoulder', 'underarm'];
  return ordered.filter((name) => regions[name]?.length);
}
function buildTrim(model, geometry) {
  const kind = model.clothing.trim;
  if (kind === 'none') return [];
  const sources = trimSources(kind, geometry);
  if (kind === 'edge_band') {
    return sources.map((boundary) => Object.freeze({
      kind,
      boundaryId: boundary.id,
      points: offsetPath(boundary.points, 6)
    }));
  }
  const count = kind === 'braid' ? 7 : 9;
  return Array.from({ length: count }, (_, index) => {
    const source = sources[index % sources.length];
    const lane = Math.floor(index / sources.length);
    const laneCount = Math.ceil((count - index % sources.length) / sources.length);
    const ratio = (lane + 1) / (laneCount + 1);
    const { point, normal } = pathFrame(source.points, ratio);
    const length = (kind === 'braid' ? 5.5 : 6.5) * (
      .88 + fixedPatternUnit(5180 + index) * .24
    );
    const tangent = [-normal[1], normal[0]];
    const points = kind === 'braid'
      ? [
          add(point, tangent, -length),
          add(point, normal, index % 2 ? length : -length),
          add(point, tangent, length)
        ]
      : [add(point, normal, -length * .35), add(point, normal, length)];
    return Object.freeze({ kind, boundaryId: source.id, points });
  });
}
function trimSources(kind, geometry) {
  const ids = kind === 'braid'
    ? geometry.trimBoundaryIds.slice(0, 1)
    : geometry.trimBoundaryIds;
  const sources = ids.map((id) => geometry.boundaries.find(
    (boundary) => boundary.id === id
  )).filter(Boolean);
  return sources.length ? sources : geometry.neckline.slice(0, 1);
}
function buildTexture(model, geometry, profile) {
  if (!profile.texture) return [];
  if (model.clothing.fabric === 'furred') {
    return Array.from({ length: profile.texture }, (_, index) => {
      const source = textureBoundary(geometry, index);
      const { point, normal } = pathFrame(
        source.points,
        (index + 1) / (profile.texture + 1)
      );
      const length = 5 + fixedPatternUnit(5220 + index) * 4;
      return Object.freeze({
        boundaryId: source.id,
        points: [add(point, normal, -2), add(point, normal, length)],
        style: profile
      });
    });
  }
  return Array.from({ length: profile.texture }, (_, index) => {
    const ratio = (index + 1) / (profile.texture + 1);
    const x = lerp(
      geometry.anchors.chestLeft[0],
      geometry.anchors.chestRight[0],
      ratio
    );
    const y = geometry.anchors.chestCenter[1] + index % 2 * 24;
    return Object.freeze({
      boundaryId: null,
      points: [[x - 5, y], [x + 6, y + 3]],
      style: profile
    });
  });
}
function textureBoundary(geometry, index) {
  const preferred = geometry.boundaries.filter(
    (entry) => geometry.trimBoundaryIds.includes(entry.id)
  );
  return preferred[index % preferred.length] ?? {
    id: 'silhouette_left',
    points: geometry.silhouette.left
  };
}
function offsetPath(points, amount) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const normal = unitNormal(previous, next);
    return add(point, normal, amount);
  });
}
function pathFrame(points, ratio) {
  const position = ratio * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(position));
  const amount = position - index;
  return {
    point: [
      lerp(points[index][0], points[index + 1][0], amount),
      lerp(points[index][1], points[index + 1][1], amount)
    ],
    normal: unitNormal(
      points[Math.max(0, index - 1)],
      points[Math.min(points.length - 1, index + 2)]
    )
  };
}

function unitNormal(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  return [-dy / length, dx / length];
}

function clothingBoundary(id, points) {
  return Object.freeze({ id, points: Object.freeze(points) });
}

function add(point, direction, amount) {
  return [
    point[0] + direction[0] * amount,
    point[1] + direction[1] * amount
  ];
}

function lerp(left, right, ratio) {
  return left + (right - left) * ratio;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
