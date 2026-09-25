import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadApprovedG4NaturalCatalog, loadApprovedG4NaturalPlacementCatalog } from '@rus/runtime-catalog';
import { visibleCurrentTargets } from '../../runtime/spatial-v3-current-visibility.js';
import { resolveG4NaturalPerceptionConditions } from '../../runtime/g4-natural-perception-conditions.js';
import { prepareG4NaturalScenePerceptionInput } from '../../runtime/g4-natural-perception.js';
import { readCurrentNaturalSourceState } from './g4-current-natural-source-state.js';
import { approvedNaturalStableCover } from './g4-natural-perception-reader.js';
import { currentSceneVisibilityModifiers, readCommittedEntityExterior, readPlayerKnowledge } from
  './spatial-v3-current-visibility-inputs.js';
import { serverError } from '../../errors.js';
import { loadApprovedLocalEdgeLabels } from '../../../../../data/world-catalogs/novgorod/m2c-local-edge-labels/approved-labels.mjs';

const labels = loadLabels('m2c-exit-labels');
const localLabels = loadApprovedLocalEdgeLabels();
const gap = () => { throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
  'Complete proposed player-visible facts are required.',
  { status: 409, details: { reason: 'place_visible_context_source_required' } }); };
function loadLabels(name) {
  const bytes = readFileSync(new URL(`../../../../../data/world-catalogs/novgorod/${name}/candidate.json`, import.meta.url));
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(readFileSync(new URL(
    `../../../../../data/world-catalogs/novgorod/${name}/approval-attestation.json`, import.meta.url)));
  return approval.decision === 'APPROVE_DATA_ONLY'
    && approval.candidate_ref === `${candidate.candidate_id}@${candidate.version}`
    && approval.candidate_sha256 === createHash('sha256').update(bytes).digest('hex')
    ? candidate.labels : null;
}

/** Read committed mutable facts on the caller's transaction; scene geometry comes only from P16 overlay. */
export function createSpatialV3ProposedVisibleSources({ verifiedCatalog, pin, worldBaseReader,
  actorId, sourceLocation, expansionClosure, readCurrentEnvironment, readTargetConditions,
  readEntityExterior = readCommittedEntityExterior, readKnowledge = readPlayerKnowledge } = {}) {
  return async function readSources({ transaction, overlay } = {}) {
    const { site, baseline, position } = overlay ?? {};
    const partyId = site?.party_id;
    const directionalExits = expansionClosure?.directional_exits;
    if (typeof transaction?.query !== 'function' || !partyId || !actorId
      || sourceLocation?.party_id !== partyId || sourceLocation.owner_id !== actorId
      || !position || !baseline || !Array.isArray(directionalExits)
      || !labels || !localLabels || typeof readCurrentEnvironment !== 'function'
      || typeof readTargetConditions !== 'function'
      || typeof worldBaseReader?.readPinnedSceneTemplateClosure !== 'function') gap();
    const inScene = (rows) => rows.filter((row) => row.party_id === partyId
      && row.status === 'active' && row.scene_baseline_id === baseline.id);
    const g6 = inScene(overlay.g6_instances);
    const positions = overlay.scene_positions.filter((row) => row.party_id === partyId
      && row.status === 'active' && g6.some((item) => item.id === row.g6_instance_id));
    const links = inScene(overlay.visibility_links);
    const portals = overlay.portals.filter((row) => row.party_id === partyId
      && row.scene_baseline_id === baseline.id);
    const movementEdges = inScene(overlay.movement_edges);
    if (!positions.some((row) => row.id === position.id) || !g6.some((row) => row.id === position.g6_instance_id)
      || links.some((row) => !positions.some((p) => p.id === row.from_position_id)
        || !positions.some((p) => p.id === row.to_position_id))
      || movementEdges.some((row) => !positions.some((p) => p.id === row.from_position_id)
        || !positions.some((p) => p.id === row.to_position_id))) gap();
    const sceneRef = baseline.scene_template_ref;
    const closureResult = await worldBaseReader.readPinnedSceneTemplateClosure({
      id: sceneRef?.entity_id, version: Number(sceneRef?.authoring_version),
      world_revision_id: pin?.compatible_world_revision_id });
    if (!closureResult?.ok) gap();
    const sceneClosure = closureResult.value;
    // The current source owner has no acoustic-edge overlay. Its supported generated scenes have none.
    if (['visibility_links', 'acoustic_edges', 'portals'].some((key) =>
      sceneClosure[key]?.length) || portals.length || links.length
      || movementEdges.length !== (sceneClosure.movement_edges ?? []).length
      || sceneClosure.movement_edges?.some((row) => !movementEdges.some((edge) =>
        edge.source_edge_slot_key === row.edge_slot_key))) gap();
    const catalog = loadApprovedG4NaturalCatalog({ verifiedCatalog, pin });
    const profiles = catalog.profiles.filter(({ payload }) => payload.g4_ref.id === site.parent_g4_id
      && payload.g4_ref.world_revision_id === pin.compatible_world_revision_id);
    if (profiles.length !== 1) gap();
    const placements = overlay.placements.filter((row) => row.party_id === partyId
      && row.host_entity_ref == null && positions.some((p) => p.id === row.position_node_id)
      && ['npc', 'item'].includes(row.entity_kind));
    const snapshot = { site, baseline, location: { ...sourceLocation, scene_position_id: position.id },
      positions, g6, placements, movement_edges: movementEdges,
      acoustic_profiles: overlay.acoustic_profiles.filter((row) =>
        row.party_id === partyId && g6.some((item) => item.id === row.g6_instance_id)),
      visibility_links: links, acoustic_edges: [], portals,
      endpoint_bindings: overlay.endpoint_bindings.filter((row) => row.party_id === partyId
        && row.status === 'active' && row.g5_site_id === site.id) };
    const current = await readCurrentNaturalSourceState({ transaction, partyId, actorId,
      snapshot, sceneClosure, naturalProfile: profiles[0], verifiedCatalog, pin,
      readCurrentEnvironment });
    const conditions = resolveG4NaturalPerceptionConditions({ verifiedCatalog, pin,
      snapshot, sceneClosure, naturalProfile: profiles[0], current });
    const endpoint = sceneClosure.endpoint_slots.filter((row) =>
      row.slot_key === conditions.source_endpoint_slot_key);
    if (endpoint.length !== 1) gap();
    const naturalInput = prepareG4NaturalScenePerceptionInput({ verifiedCatalog, pin,
      currentFacts: { observer: { actor_id: actorId, party_id: partyId,
        position_id: position.id, visual_capability: conditions.visual_capability,
        hearing_capability: conditions.hearing_capability },
      scene: { party_id: partyId, baseline_id: baseline.id, site_id: site.id,
        g4_ref: profiles[0].payload.g4_ref,
        scene_template_ref: { id: sceneClosure.header.id, version: sceneClosure.header.version },
        visible_scene: conditions.visible_scene, positions, g6,
        acoustic_profiles: snapshot.acoustic_profiles,
        visibility_links: links.map((row) => ({ from_position_id: row.from_position_id,
          to_position_id: row.to_position_id, base_result: row.quality,
          portal_id: row.portal_entity_id })), acoustic_edges: [], portals: {} },
      source_endpoint: { ...endpoint[0], scene_template_id: sceneClosure.header.id,
        scene_template_version: sceneClosure.header.version },
      source_bindings: snapshot.endpoint_bindings.filter((row) =>
        row.source_slot_key === endpoint[0].slot_key),
      current_environment: conditions.current_environment,
      layer_admissions: conditions.layer_admissions } });
    const modifiers = await transaction.query(`SELECT id,state_version,affected_scope_ref FROM party_runtime.visibility_modifiers
      WHERE party_id=$1`, [partyId]);
    if (!Array.isArray(modifiers?.rows)) gap();
    const modifier_set = { complete: true,
      rows: currentSceneVisibilityModifiers(modifiers.rows, snapshot) };
    const natural = { ambient_visibility: {
      stable_cover: approvedNaturalStableCover(profiles[0].payload) } };
    const ambient = current.current_environment;
    const placementCatalog = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
    const placement = placementCatalog.placements.filter((row) => row.natural_profile_ref.id === profiles[0].payload.profile_id
      && row.natural_profile_ref.version === profiles[0].payload.profile_version
      && row.natural_profile_ref.payload_digest === profiles[0].payload_digest
      && row.scene_template_ref.id === sceneClosure.header.id
      && row.scene_template_ref.version === sceneClosure.header.version
      && row.scene_template_ref.canonical_digest === sceneClosure.header.canonical_digest);
    const policy = placementCatalog.condition_policies.find((row) => row.id === placement[0]?.condition_policy_ref.id
      && row.version === placement[0]?.condition_policy_ref.version);
    const lighting = policy?.lighting_by_light_state[ambient.light_state];
    const weather = policy?.weather_by_visibility[ambient.weather_state?.visibility];
    if (placement.length !== 1 || !['clear', 'partial', 'none'].includes(lighting)
      || !['clear', 'partial', 'none'].includes(weather)) gap();
    const targetRows = [
      ...placements.map((row) => ({
        target_id: `${row.entity_kind}:${row.entity_id}`, position_id: row.position_node_id,
        entity_kind: row.entity_kind, placement: row })),
      ...movementEdges.filter((row) => row.from_position_id === position.id).map((row) => ({
        target_id: `edge:${row.id}`, position_id: row.to_position_id,
        entity_kind: 'local_edge', edge: row })),
      ...directionalExits.map((row) => ({ target_id: `exit:${row.id}`,
        position_id: position.id, entity_kind: 'directional_exit', exit: row })) ];
    const targets = [];
    for (const row of targetRows) {
      const currentTarget = await readTargetConditions({ transaction, partyId, actorId,
        scene: { ...snapshot, modifier_set }, natural, target: row });
      if (['stable_cover', 'dynamic_occlusion', 'concealment'].some((key) =>
        !['clear', 'partial', 'none'].includes(currentTarget?.[key]))) gap();
      targets.push({ ...row, lighting, weather, ...currentTarget });
    }
    const admitted = visibleCurrentTargets({ observer_position_id: position.id,
      observer_visual_capability: conditions.visual_capability, positions, g6,
      visibility_links: links, portals: {}, targets,
      modifier_set });
    const entityObservations = []; const localEdges = []; const visibleExits = [];
    for (const row of admitted) {
      const target = targetRows.find((item) => item.target_id === row.target_id);
      if (target.placement) {
        const exterior = await readEntityExterior({ transaction, partyId, actorId,
          placement: target.placement, visibility: row.visibility });
        if (!exterior || typeof exterior !== 'object' || Array.isArray(exterior)) gap();
        const known = await readKnowledge({ transaction, partyId, actorId,
          placement: target.placement });
        entityObservations.push({ entity_kind: target.placement.entity_kind,
          entity_id: target.placement.entity_id, visibility: row.visibility, exterior,
          display_label: known?.display_name?.trim()
            || (target.placement.entity_kind === 'npc' ? 'человек' : 'предмет'),
          ...(known?.display_name?.trim() ? { display_name: known.display_name } : {}) });
      } else if (target.edge) {
        const matches = localLabels.filter((label) => label.scene_template_ref.id
          === target.edge.source_scene_template_ref?.entity_id
          && label.scene_template_ref.version === Number(target.edge.source_scene_template_ref?.authoring_version)
          && label.edge_slot_key === target.edge.source_edge_slot_key);
        if (matches.length !== 1) gap();
        localEdges.push({ edge_id: target.edge.id, display_label: matches[0].display_label });
      } else {
        const exit = target.exit;
        const matches = labels.filter((label) => label.world_revision_id === pin.compatible_world_revision_id
          && label.g4_ref.id === site.parent_g4_id && label.directional_exit_ref.id === exit.id
          && label.directional_exit_ref.version === exit.version
          && label.directional_exit_ref.canonical_digest === exit.canonical_digest
          && label.direction_context_ref.id === exit.direction_context_id);
        if (matches.length !== 1) gap();
        visibleExits.push({ directional_exit_id: exit.id,
          directional_exit_version: exit.version, direction_context_id: exit.direction_context_id,
          knowledge_state: 'visible', display_label: matches[0].display_label });
      }
    }
    return { naturalInput, partyId, actorId, positionId: position.id,
      entityObservations, localEdges, directionalExits: visibleExits };
  };
}
