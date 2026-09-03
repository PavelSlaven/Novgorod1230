import { computeSpatialV3CanonicalDigest, validateSpatialV3Contract } from
  '@rus/contracts/spatial-v3/registry';

export function additionalPreparationMember({ prepared, snapshotId, ordinal, result,
  sourceScene }) {
  const scene = prepared?.scene;
  const canonicalG5 = prepared?.canonical_g5_refs;
  const profiles = prepared?.scene_materialization_profile_refs;
  const baseStatic = prepared?.base_static_templates;
  const topology = prepared?.s1_topology;
  const writes = prepared?.s1_physical_writes;
  if (!Number.isSafeInteger(ordinal) || ordinal < 1
      || !scene?.node?.instance_id || !scene?.anchor?.instance_id
      || !sourceScene?.node?.instance_id || !sourceScene?.node?.parent_g4_id
      || !sourceScene?.anchor?.instance_id
      || !dbRef(canonicalG5?.destination, 'canonical_spatial_node')
      || !dbRef(profiles?.destination, 'scene_materialization_profile')
      || !baseStatic?.destination?.scene_template_ref
      || !topology?.g6_instance_ref || !topology?.position_ref
      || !Array.isArray(writes) || writes.length !== 6) throw invalid();
  const targetPins = dependencyPinSet(canonicalScenePins(canonicalG5.destination,
    profiles.destination, baseStatic.destination.scene_template_ref));
  const materialization = sealSpatial({
    g4_id: scene.node.parent_g4_id,
    g5_site_id: `g5:${scene.node.instance_id}`,
    g5_origin: 'canonical',
    scene_baseline_id: `baseline:${scene.node.instance_id}`,
    g6_instance_id: `g6:${scene.anchor.instance_id}`,
    position_id: `position:${scene.anchor.instance_id}`,
    scene_template_ref: structuredClone(baseStatic.destination.scene_template_ref),
    materialization_profile_ref: versionedDbRef(profiles.destination),
    catalog_digest: result.trace.catalog_digest,
    materializer_version: result.trace.materializer_version,
    dependency_pins: targetPins
  });
  const memberPayload = {
    preparation_snapshot_id: snapshotId,
    ordinal,
    member_kind: 'transfer_scene',
    source_authoring_ref: structuredClone(baseStatic.destination.scene_template_ref),
    prepared_scene_materialization: materialization,
    dependency_pins: targetPins,
    share_mode: 'execution_exclusive'
  };
  const member = { ...memberPayload, member_digest: spatialDigest(memberPayload) };
  assertContract('prepared_scene_materialization_snapshot', materialization);
  assertContract('preparation_snapshot_member', member);
  return { member, spatial_v3: {
    target: { ...materialization,
      canonical_g5_ref: structuredClone(canonicalG5.destination),
      materialization_trace_id: result.run_id,
      base_static_template: structuredClone(baseStatic.destination),
      s1_topology: structuredClone(topology),
      s1_physical_writes: structuredClone(writes) },
    source: { g4_id: sourceScene?.node?.parent_g4_id,
      g5_site_id: `g5:${sourceScene?.node?.instance_id}`,
      scene_baseline_id: `baseline:${sourceScene?.node?.instance_id}`,
      g6_instance_id: `g6:${sourceScene?.anchor?.instance_id}`,
      position_id: `position:${sourceScene?.anchor?.instance_id}` },
    preparation_member_ordinal: ordinal,
    preparation_member_digest: member.member_digest
  } };
}

function dbRef(value, entityKind) {
  return value && value.entity_kind === entityKind
    && typeof value.entity_id === 'string' && value.entity_id.length > 0
    && value.authoring_version === '1';
}
function canonicalScenePins(canonicalG5Ref, profileRef, templateRef) {
  return [
    pin('canonical_g5', canonicalG5Ref),
    pin('scene_materialization_profile', profileRef),
    pin('scene_template', templateRef)
  ];
}
function pin(dependency_role, value) {
  const ref = value?.entity_ref ?? value;
  return { dependency_role, entity_ref: { entity_kind: ref.entity_kind, entity_id: ref.entity_id },
    version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version } };
}
function versionedDbRef(value) { return { entity_ref: { entity_kind: value.entity_kind,
  entity_id: value.entity_id }, authoring_version: value.authoring_version }; }
function dependencyPinSet(pins) { return sealSpatial({ pins: [...pins].sort((a, b) =>
  `${a.dependency_role}\u0000${a.entity_ref.entity_kind}\u0000${a.entity_ref.entity_id}`.localeCompare(
    `${b.dependency_role}\u0000${b.entity_ref.entity_kind}\u0000${b.entity_ref.entity_id}`)) }); }
function sealSpatial(payload) { return { ...payload,
  canonical_digest: computeSpatialV3CanonicalDigest(payload) }; }
function spatialDigest(payload) { return computeSpatialV3CanonicalDigest(payload).slice('sha256:'.length); }
function assertContract(name, value) { const errors = validateSpatialV3Contract(name, value);
  if (errors.length) { const error = invalid(); error.details = errors; throw error; } }
function invalid() { const error = new Error('First-entry preparation member is incomplete.');
  error.code = 'LOWER_DVINA_TRACE_FIRST_ENTRY_PREPARATION_INVALID'; return error; }
