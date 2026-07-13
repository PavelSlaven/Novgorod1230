import { validateNumericStatPolicy, validatePositionReferenceConsistency } from './validators.js';

export function composeApprovedStartPosition({
  validatedG5PositionRefs,
  validatedStartSceneRefs,
  requestId = null,
  sourceStage = 'start_position_audit'
} = {}) {
  const concerns = [];
  if (!isPlainObject(validatedG5PositionRefs)) {
    concerns.push(concern('START_POSITION_CONTRACT_ERROR', 'validated_G5_position_refs must be an object.', 'validated_G5_position_refs'));
  }
  if (!isPlainObject(validatedStartSceneRefs)) {
    concerns.push(concern('START_POSITION_CONTRACT_ERROR', 'validated_start_scene_refs must be an object.', 'validated_start_scene_refs'));
  }
  if (concerns.length > 0) {
    return failedComposition(concerns);
  }

  const position = {
    region_id: explicitRef(validatedG5PositionRefs.region_id, validatedStartSceneRefs.region_id),
    place_id: explicitRef(validatedG5PositionRefs.place_id, validatedStartSceneRefs.place_id),
    location_id: explicitRef(validatedG5PositionRefs.location_id, validatedStartSceneRefs.location_id),
    minilocation_id: explicitRef(validatedG5PositionRefs.minilocation_id, validatedStartSceneRefs.minilocation_id),
    anchor_id: explicitRef(validatedG5PositionRefs.anchor_id, validatedStartSceneRefs.anchor_id),
    last_route_id: explicitRef(validatedG5PositionRefs.last_route_id, validatedStartSceneRefs.last_route_id) ?? null
  };

  concerns.push(...validatePositionReferenceConsistency({
    position
  }, {
    positionPaths: ['position']
  }).map((item) => ({
    ...item,
    code: 'START_POSITION_CONTRACT_ERROR'
  })));

  concerns.push(...compareSharedRef('region_id', validatedG5PositionRefs, validatedStartSceneRefs));
  concerns.push(...compareSharedRef('place_id', validatedG5PositionRefs, validatedStartSceneRefs));
  concerns.push(...compareSharedRef('location_id', validatedG5PositionRefs, validatedStartSceneRefs));
  concerns.push(...compareSharedRef('minilocation_id', validatedG5PositionRefs, validatedStartSceneRefs));
  concerns.push(...compareSharedRef('anchor_id', validatedG5PositionRefs, validatedStartSceneRefs));

  if (concerns.length > 0) {
    return failedComposition(concerns);
  }

  const artifact = {
    version: 1,
    schema: 'approved_start_position',
    request_id: requestId,
    region_id: position.region_id,
    place_id: position.place_id,
    location_id: position.location_id,
    minilocation_id: position.minilocation_id,
    anchor_id: position.anchor_id,
    last_route_id: position.last_route_id,
    source_stage: sourceStage,
    position_path: buildPositionPath(position),
    refs: {
      region_ref: validatedG5PositionRefs.region_ref ?? validatedStartSceneRefs.region_ref ?? validatedStartSceneRefs.region_id ?? validatedG5PositionRefs.region_id ?? null,
      place_ref: validatedG5PositionRefs.place_ref ?? validatedStartSceneRefs.place_ref ?? validatedStartSceneRefs.place_id ?? validatedG5PositionRefs.place_id ?? null,
      location_ref: validatedG5PositionRefs.location_ref ?? validatedStartSceneRefs.location_ref ?? validatedStartSceneRefs.location_id ?? validatedG5PositionRefs.location_id ?? null,
      minilocation_ref: validatedG5PositionRefs.minilocation_ref ?? validatedStartSceneRefs.minilocation_ref ?? validatedStartSceneRefs.minilocation_id ?? validatedG5PositionRefs.minilocation_id ?? null,
      anchor_ref: validatedG5PositionRefs.anchor_ref ?? validatedStartSceneRefs.anchor_ref ?? validatedStartSceneRefs.anchor_id ?? validatedG5PositionRefs.anchor_id ?? null
    },
    audit: {
      pass: true,
      stage: 'start_position_audit',
      evidence: [
        'place_id exists in approved location graph',
        'location_id belongs to place_id',
        'minilocation_id belongs to location_id',
        'anchor_id belongs to minilocation_id'
      ]
    }
  };

  return {
    pass: true,
    artifact,
    concerns: [],
    evidence: ['approved_start_position composed from fully approved spatial chain']
  };
}

export function composeValidatedPlayerSeed({
  approvedPlayerDossier,
  approvedStartPosition,
  validatedStartSceneRefs,
  requestId = null,
  statPolicy = null
} = {}) {
  const concerns = [];
  if (!isPlainObject(approvedPlayerDossier)) {
    concerns.push(concern('PLAYER_SEED_DOSSIER_MISSING', 'approved_player_dossier must be an object.', 'approved_player_dossier'));
  }
  if (!isPlainObject(approvedStartPosition)) {
    concerns.push(concern('START_POSITION_CONTRACT_ERROR', 'approved_start_position must be an object.', 'approved_start_position'));
  }
  if (!isPlainObject(validatedStartSceneRefs)) {
    concerns.push(concern('PLAYER_SEED_SCENE_REFS_MISSING', 'validated_start_scene_refs must be an object.', 'validated_start_scene_refs'));
  }
  if (concerns.length > 0) {
    return failedComposition(concerns);
  }

  concerns.push(...validateApprovedStartPosition(approvedStartPosition));
  const rawMirror = approvedPlayerDossier?.start_position;
  if (rawMirror !== undefined) {
    concerns.push(...compareMirrorPosition(rawMirror, approvedStartPosition, 'root.player_dossier.start_position'));
  }
  if (concerns.length > 0) {
    return failedComposition(concerns);
  }

  const position = {
    region_id: approvedStartPosition.region_id,
    place_id: approvedStartPosition.place_id,
    location_id: approvedStartPosition.location_id,
    minilocation_id: approvedStartPosition.minilocation_id,
    anchor_id: approvedStartPosition.anchor_id,
    last_route_id: approvedStartPosition.last_route_id ?? null
  };

  const seed = {
    version: 1,
    schema: 'player_seed_contract',
    request_id: requestId,
    composition_kind: 'deterministic_composition_artifact',
    source_artifacts: {
      approved_player_dossier: approvedPlayerDossier.character_id ?? approvedPlayerDossier.characterId ?? null,
      approved_start_position: approvedStartPosition.anchor_id ?? null,
      validated_start_scene_refs: validatedStartSceneRefs.selected_candidate_id ?? validatedStartSceneRefs.start_node_id ?? null
    },
    player_dossier: structuredClone(approvedPlayerDossier),
    position,
    current_position: structuredClone(position),
    approved_start_position_ref: {
      schema: 'approved_start_position',
      anchor_id: approvedStartPosition.anchor_id,
      position_path: approvedStartPosition.position_path ?? buildPositionPath(approvedStartPosition)
    },
    validated_start_scene_refs: structuredClone(validatedStartSceneRefs)
  };

  concerns.push(...validatePositionReferenceConsistency(seed, {
    positionPaths: ['position', 'current_position']
  }));

  if (approvedPlayerDossier?.attributes && statPolicy) {
    concerns.push(...validateNumericStatPolicy(approvedPlayerDossier.attributes, {
      path: 'root.player_dossier.attributes',
      policy: statPolicy,
      justificationPaths: ['attribute_justifications']
    }));
  }

  if (concerns.length > 0) return failedComposition(concerns);
  return {
    pass: true,
    artifact: seed,
    concerns: [],
    evidence: ['validated_player_seed composed deterministically from approved dossier and approved_start_position overlay']
  };
}

export function extractValidatedG5PositionRefs(g5SceneGraphDraft = {}) {
  return {
    region_id: g5SceneGraphDraft.region_id ?? null,
    place_id: g5SceneGraphDraft.place_id ?? null,
    location_id: g5SceneGraphDraft.location_id ?? null,
    minilocation_id: explicitRef(
      g5SceneGraphDraft.current_position?.minilocation_id,
      g5SceneGraphDraft.validated_position_refs?.minilocation_id,
      g5SceneGraphDraft.minilocation_id
    ),
    anchor_id: explicitRef(
      g5SceneGraphDraft.current_position?.anchor_id,
      g5SceneGraphDraft.validated_position_refs?.anchor_id,
      g5SceneGraphDraft.primary_anchor_temp_id,
      g5SceneGraphDraft.anchor_id
    ),
    primary_anchor_temp_id: g5SceneGraphDraft.primary_anchor_temp_id ?? null,
    region_ref: g5SceneGraphDraft.region_ref ?? g5SceneGraphDraft.region_id ?? null,
    place_ref: g5SceneGraphDraft.place_ref ?? g5SceneGraphDraft.place_id ?? null,
    location_ref: g5SceneGraphDraft.location_ref ?? g5SceneGraphDraft.location_id ?? null,
    minilocation_ref: g5SceneGraphDraft.minilocation_ref ?? g5SceneGraphDraft.current_position?.minilocation_id ?? g5SceneGraphDraft.minilocation_id ?? null,
    anchor_ref: g5SceneGraphDraft.anchor_ref ?? g5SceneGraphDraft.current_position?.anchor_id ?? g5SceneGraphDraft.primary_anchor_temp_id ?? g5SceneGraphDraft.anchor_id ?? null
  };
}

export function extractValidatedStartSceneRefs(selectedStartNode = {}, historicalFrame = {}) {
  return {
    selected_candidate_id: selectedStartNode.selected_candidate_id ?? null,
    start_node_id: selectedStartNode.selected_candidate_id ?? null,
    region_id: historicalFrame?.region?.region_id ?? null,
    place_id: selectedStartNode.selected_candidate_place_id ?? selectedStartNode.place_id ?? null,
    location_id: selectedStartNode.selected_candidate_location_id ?? selectedStartNode.location_id ?? null,
    minilocation_id: selectedStartNode.selected_candidate_minilocation_id ?? selectedStartNode.minilocation_id ?? null,
    anchor_id: selectedStartNode.selected_candidate_anchor_id ?? selectedStartNode.anchor_id ?? null,
    region_ref: historicalFrame?.region?.region_id ?? null,
    place_ref: selectedStartNode.selected_candidate_place_id ?? selectedStartNode.place_id ?? null,
    location_ref: selectedStartNode.selected_candidate_location_id ?? selectedStartNode.location_id ?? null,
    minilocation_ref: selectedStartNode.selected_candidate_minilocation_id ?? selectedStartNode.minilocation_id ?? null,
    anchor_ref: selectedStartNode.selected_candidate_anchor_id ?? selectedStartNode.anchor_id ?? null
  };
}

function failedComposition(concerns) {
  return {
    pass: false,
    artifact: null,
    concerns,
    evidence: []
  };
}

function explicitRef(...values) {
  for (const value of values) {
    if (text(value)) return value;
  }
  return null;
}

function compareSharedRef(key, left, right) {
  const leftValue = left?.[key];
  const rightValue = right?.[key];
  if (text(leftValue) && text(rightValue) && leftValue !== rightValue) {
    return [concern(
      'START_POSITION_CONTRACT_ERROR',
      `${key} is inconsistent between approved spatial references.`,
      `approved_start_position.${key}`
    )];
  }
  return [];
}

function validateApprovedStartPosition(position = {}) {
  const concerns = validatePositionReferenceConsistency({
    position
  }, {
    positionPaths: ['position']
  }).map((item) => ({
    code: 'START_POSITION_CONTRACT_ERROR',
    message: item.message,
    field: item.field?.replace('root.position', 'approved_start_position')
  }));
  if (position?.audit?.pass !== true) {
    concerns.push(concern(
      'START_POSITION_CONTRACT_ERROR',
      'approved_start_position.audit.pass must be true.',
      'approved_start_position.audit.pass'
    ));
  }
  return concerns;
}

function compareMirrorPosition(rawPosition, approvedStartPosition, path) {
  if (!isPlainObject(rawPosition)) {
    return [concern(
      'PLAYER_POSITION_MISMATCH',
      `${path} must not be null or non-object when provided.`,
      path
    )];
  }
  const concerns = [];
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
    const rawValue = rawPosition?.[key];
    const approvedValue = approvedStartPosition?.[key];
    if (!text(rawValue) || rawValue !== approvedValue) {
      concerns.push(concern(
        'PLAYER_POSITION_MISMATCH',
        `${path}.${key} must exactly match approved_start_position.${key}.`,
        `${path}.${key}`
      ));
    }
  }
  return concerns;
}

function buildPositionPath(position = {}) {
  return [
    position.region_id,
    position.place_id,
    position.location_id,
    position.minilocation_id,
    position.anchor_id
  ].filter(text).join(' / ');
}

function concern(code, message, field) {
  return { code, message, field };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
