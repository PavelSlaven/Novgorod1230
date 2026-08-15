import { validateContractPaths } from './drawing-contract-paths.js';
import { validateContractRegions } from './drawing-contract-regions.js';
import { validateClothingContract } from './drawing-contract-clothing.js';

export const PORTRAIT_DRAWING_CONTRACT_V1 = Object.freeze({
  schema: 'portrait_drawing_contract_v1',
  anchors: Object.freeze({
    head: 'canvas',
    face: 'head',
    eyes: 'face',
    nose: 'face',
    mouth: 'face',
    hair: 'head',
    beard: 'jaw',
    body: 'canvas',
    clothing: 'body',
    headwear: 'head',
    background: 'canvas',
    finishing: 'body'
  }),
  allowedRegions: Object.freeze({
    head: 'head_envelope',
    face: 'face_envelope',
    eyes: 'eye_region',
    nose: 'nose_region',
    mouth: 'mouth_region',
    hair: 'hair_attachment_envelope',
    beard: 'lower_face_envelope',
    body: 'lower_canvas',
    clothing: 'torso_envelope',
    headwear: 'head_attachment_envelope',
    background: 'canvas',
    finishing: 'portrait_envelope'
  }),
  contourOwners: Object.freeze({
    crown: Object.freeze(['head', 'hair', 'headwear']),
    jaw: Object.freeze(['head', 'beard']),
    torso: Object.freeze(['base_garment', 'outer_garment'])
  }),
  limits: Object.freeze({
    canvasMargin: 96,
    inkSegment: 160,
    patchSegment: 280,
    hairAnchor: 18,
    braidAnchor: 40,
    headwearAnchor: 24,
    featureGap: 9,
    clothingAnchor: 24,
    clothingRegionMargin: 40,
    trimAttachment: 14,
    foldOrigin: 22,
    underlayerWidth: .4,
    underlayerHeight: .45
  }),
  style: Object.freeze({
    fillsBeforeInk: true,
    automaticPatchOutline: false,
    hiddenGeometry: 'omitted',
    inkPipeline: 'strokeHandmade',
    wobble: 'low_frequency'
  })
});

export function validatePortraitDrawingContract(model, scene) {
  const issues = [];
  const { limits } = PORTRAIT_DRAWING_CONTRACT_V1;
  validateContractRegions(model, scene, limits, issues);
  validateContractPaths(model, scene, limits, issues);
  validateClothingContract(model, scene, limits, issues);
  validateOwnership(model, scene, issues);
  validateStyleMetadata(model, scene, issues);
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

export function assertPortraitDrawingContract(model, scene) {
  const issues = validatePortraitDrawingContract(model, scene);
  if (!issues.length) return scene;
  const error = new TypeError(issues.map(({ message }) => message).join('\n'));
  error.name = 'PortraitDrawingContractError';
  error.code = 'PORTRAIT_DRAWING_CONTRACT_INVALID';
  error.contract = PORTRAIT_DRAWING_CONTRACT_V1.schema;
  error.issues = issues;
  throw error;
}

function validateOwnership(model, scene, issues) {
  const { geometry, visibility } = scene;
  const ink = [...scene.strokes, ...scene.hatches, ...scene.scratches];
  if (!PORTRAIT_DRAWING_CONTRACT_V1.contourOwners.crown.includes(
    visibility.crownOwner
  ) || !PORTRAIT_DRAWING_CONTRACT_V1.contourOwners.jaw.includes(
    visibility.jawOwner
  ) || !PORTRAIT_DRAWING_CONTRACT_V1.contourOwners.torso.includes(
    visibility.torsoOwner
  )) {
    issues.push(issue(
      'CONTOUR_OWNER_INVALID',
      'scene',
      'Every crown, jaw and torso boundary must have one known owner.'
    ));
  }

  const crownOwners = [
    ['head', geometry.head.crown],
    ['hair', geometry.hair.outer[0]],
    ['headwear', geometry.headwear.outer[0]]
  ].filter(([owner, path]) => path?.length && hasPath(ink, path, owner))
    .map(([owner]) => owner);
  if (crownOwners.length !== 1
      || crownOwners[0] !== visibility.crownOwner) {
    issues.push(issue(
      'CONTOUR_OWNER_CONFLICT',
      'crown',
      'Exactly one visible contour must own the crown boundary.'
    ));
  }

  const headJawCount = [geometry.head.leftJaw, geometry.head.rightJaw]
    .filter((path) => hasPath(ink, path, 'head')).length;
  const beardOwnsJaw = geometry.beard.present
    && hasPath(ink, geometry.beard.outer, 'beard');
  const jawOwnershipValid = visibility.jawOwner === 'head'
    ? headJawCount === 2 && !beardOwnsJaw
    : headJawCount === 0 && beardOwnsJaw;
  if (!jawOwnershipValid) {
    issues.push(issue(
      'CONTOUR_OWNER_CONFLICT',
      'jaw',
      'Exactly one visible contour must own the jaw boundary.'
    ));
  }

  validateHiddenGeometry(scene, ink, issues);
}

function validateHiddenGeometry(scene, ink, issues) {
  const { geometry, visibility } = scene;
  if (geometry.headwear.kind === 'headscarf'
      && [...ink, ...scene.patches].some((entry) => (
        entry.part === 'hair' && !entry.role.startsWith('braid_')
      ))) {
    issues.push(issue(
      'HIDDEN_PART_VISIBLE',
      'hair',
      'Hair hidden by a headscarf must not enter the visible scene.'
    ));
  }
  if (visibility.hidden.earMarks
      && ink.some((entry) => entry.role === 'ear_mark')) {
    issues.push(issue(
      'HIDDEN_PART_VISIBLE',
      'face',
      'Hidden ear marks must not enter the visible scene.'
    ));
  }
  if (!visibility.details.braid && !visibility.details.braidTail
      && ink.some((entry) => entry.role.startsWith('braid_'))) {
    issues.push(issue(
      'HIDDEN_PART_VISIBLE',
      'hair',
      'A hidden braid must not enter the visible scene.'
    ));
  }
}

function validateStyleMetadata(model, scene, issues) {
  const ink = [...scene.strokes, ...scene.hatches, ...scene.scratches];
  for (const colorPatch of scene.patches) {
    if (ink.some((entry) => pathsEqual(entry.points, colorPatch.points))) {
      issues.push(issue(
        'PATCH_OUTLINE_CONFLICT',
        colorPatch.part,
        `${colorPatch.role} must not receive an automatic matching outline.`
      ));
    }
  }
}

function hasPath(entries, points, part = null) {
  return entries.some(
    (entry) => (part == null || entry.part === part)
      && pathsEqual(entry.points, points)
  );
}

function pathsEqual(left, right) {
  return left.length === right.length && left.every(
    (point, index) => distance(point, right[index]) < .0001
  );
}

function issue(code, part, message) {
  return { code, part, message };
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
