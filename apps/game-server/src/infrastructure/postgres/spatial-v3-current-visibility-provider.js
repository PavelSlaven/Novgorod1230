import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { visibleCurrentTargets } from '../../runtime/spatial-v3-current-visibility.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  './g4-natural-perception-reader.js';
import { serverError } from '../../errors.js';
import { prepareG4NaturalScenePerceptionInput } from '../../runtime/g4-natural-perception.js';

const labelPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url);
const approvalPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/approval-attestation.json', import.meta.url);
const labelBytes = readFileSync(labelPath);
const labelCatalog = JSON.parse(labelBytes);
const labelApproval = JSON.parse(readFileSync(approvalPath));
const approvedLabels = labelApproval.decision === 'APPROVE_DATA_ONLY'
  && labelApproval.candidate_ref === `${labelCatalog.candidate_id}@${labelCatalog.version}`
  && labelApproval.candidate_sha256 === createHash('sha256').update(labelBytes).digest('hex');
const localLabelBytes = readFileSync(new URL(
  '../../../../../data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json', import.meta.url));
const localLabelCatalog = JSON.parse(localLabelBytes);
const localLabelApproval = JSON.parse(readFileSync(new URL(
  '../../../../../data/world-catalogs/novgorod/m2c-local-edge-labels/approval-attestation.json', import.meta.url)));
const approvedLocalLabels = localLabelApproval.decision === 'APPROVE_DATA_ONLY'
  && localLabelApproval.candidate_ref === `${localLabelCatalog.candidate_id}@${localLabelCatalog.version}`
  && localLabelApproval.candidate_sha256 === createHash('sha256').update(localLabelBytes).digest('hex');
const conditions = ['stable_cover', 'dynamic_occlusion', 'concealment'];
const visibility = new Set(['clear', 'partial', 'none']);

/** Caller supplies current target conditions, committed exterior, and knowledge owners.
 * All reads use one repeatable-read snapshot. No label grants visibility or movement.
 * readVisibleLocalEdgeRefs({partyId,actorId,state}) -> edge IDs.
 * readLocalEdgeDisclosure({partyId,actorId,state}) -> edge IDs and approved labels.
 * readExitDisclosure(context with partyId,actorId,directional_exits) -> safe labels.
 * readEntityObservations({partyId,actorId}) -> admitted exterior and known names. */
export function createSpatialV3CurrentVisibilityProvider({ pool, verifiedCatalog, pin,
  worldBaseReader, readCurrentSourceState, readCurrentEnvironment, readTargetConditions,
  readEntityExterior, readPlayerKnowledge,
  readScene = readCurrentEntityVisibilityScene,
  readNatural = readCurrentNaturalPerceptionFacts } = {}) {
  if (typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool is required.');
  async function withCurrent(partyId, actorId, project, suppliedTransaction,
    observedPositionId = null) {
    const transaction = suppliedTransaction ?? await pool.connect();
    const owned = suppliedTransaction == null;
    try {
      if (owned) await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const args = { transaction, partyId, actorId, verifiedCatalog, pin,
        worldBaseReader, readCurrentSourceState, readCurrentEnvironment,
        observedPositionId };
      const scene = await readScene(args);
      const natural = await readNatural(args);
      if (scene.baseline.id !== natural.scene.baseline_id
        || scene.location.scene_position_id !== natural.observer.position_id
        || !natural.ambient_visibility) gap('entity_lighting_policy_required');
      const result = await project({ transaction, scene, natural });
      if (owned) await transaction.query('COMMIT');
      return result;
    } catch (error) {
      if (owned) await transaction.query('ROLLBACK');
      throw error;
    } finally { if (owned) transaction.release(); }
  }
  async function admit({ transaction, scene, natural }, targets) {
    if (typeof readTargetConditions !== 'function') gap('current_target_conditions_required');
    const ambient = natural.ambient_visibility;
    const byPosition = new Map(scene.positions.map((row) => [row.id, row]));
    const resolved = [];
    for (const target of targets) {
      const position = byPosition.get(target.position_id);
      if (!position || position.g6_instance_id !== ambient.g6_instance_id) {
        gap('entity_lighting_policy_required');
      }
      const current = await readTargetConditions({ transaction, partyId: scene.location.party_id,
        actorId: scene.location.owner_id, scene, natural, target });
      if (conditions.some((key) => !visibility.has(current?.[key]))) {
        gap('current_target_conditions_required');
      }
      resolved.push({ ...target, lighting: ambient.lighting, weather: ambient.weather,
        ...Object.fromEntries(conditions.map((key) => [key, current[key]])) });
    }
    return visibleCurrentTargets({ observer_position_id: scene.location.scene_position_id,
      observer_visual_capability: natural.observer.visual_capability,
      positions: scene.positions, g6: scene.g6, visibility_links: scene.visibility_links,
      portals: natural.scene.portals, targets: resolved, modifier_set: scene.modifier_set });
  }
  async function localDisclosure({ partyId, actorId, state, transaction,
    observedPositionId } = {}) {
    return withCurrent(partyId, actorId, async (current) => {
      if (!approvedLocalLabels || state?.party_id !== partyId || state.actor_id !== actorId
        || state.journey_location?.scene_position_id !== current.scene.location.scene_position_id) {
        gap('current_local_edge_disclosure_required');
      }
      const edges = current.scene.movement_edges.filter((row) =>
        row.from_position_id === current.scene.location.scene_position_id);
      const admitted = await admit(current, edges.map((row) => ({
        target_id: row.id, position_id: row.to_position_id, entity_kind: 'local_edge' })));
      const visible = new Set(admitted.map((row) => row.target_id));
      return edges.flatMap((edge) => {
        if (!visible.has(edge.id)) return [];
        const labels = localLabelCatalog.labels.filter((row) =>
          row.scene_template_ref.id === (edge.source_scene_template_ref?.entity_id
            ?? edge.source_scene_template_ref?.entity_ref?.entity_id)
          && row.scene_template_ref.version === Number(edge.source_scene_template_ref?.authoring_version)
          && row.edge_slot_key === edge.source_edge_slot_key);
        if (labels.length !== 1) gap('approved_local_edge_label_required');
        return [{ edge_id: edge.id, display_label: labels[0].display_label }];
      });
    }, transaction, observedPositionId);
  }
  const provider = Object.freeze({
    async recheckLocalMovementVisibility({ transaction, partyId, actorId, edgeId,
      positionId } = {}) {
      if (typeof transaction?.query !== 'function') return { ok: false };
      try {
        const disclosed = await localDisclosure({ transaction, partyId, actorId,
          state: { party_id: partyId, actor_id: actorId,
            journey_location: { scene_position_id: positionId } } });
        return { ok: disclosed.some((row) => row.edge_id === edgeId) };
      } catch (error) {
        if (error.details?.reason === 'current_local_edge_disclosure_required') return { ok: false };
        throw error;
      }
    },
    async readVisibleLocalEdgeRefs(input) {
      return (await localDisclosure(input)).map((row) => row.edge_id);
    },
    readLocalEdgeDisclosure: localDisclosure,
    async readCurrentExitDisclosure({ partyId, actorId, transaction } = {}) {
      return withCurrent(partyId, actorId, async (current) => {
        const binding = await worldBaseReader?.readG4ExpansionBinding?.({
          g4_id: current.scene.site.parent_g4_id,
          world_revision_id: current.scene.world_revision_id });
        if (!binding?.ok) gap('approved_g4_expansion_binding_required');
        const closure = await worldBaseReader.readPinnedG4ExpansionClosure(binding.value);
        if (!closure?.ok || !Array.isArray(closure.value?.directional_exits)) {
          gap('approved_g4_expansion_closure_required');
        }
        const exits = closure.value.directional_exits.filter((row) =>
          row.exit_canonical_g5_id === current.scene.site.canonical_g5_ref?.entity_id);
        return provider.readExitDisclosure({ transaction: current.transaction, partyId,
          actorId, position: { id: current.scene.location.scene_position_id },
          site: current.scene.site, directional_exits: exits });
      }, transaction);
    },
    async readExitDisclosure(context = {}) {
      return withCurrent(context.partyId, context.actorId, async (current) => {
        if (!approvedLabels || !Array.isArray(context.directional_exits)
          || context.position?.id !== current.scene.location.scene_position_id
          || context.site?.parent_g4_id !== naturalG4(current.natural)) {
          gap('approved_exit_disclosure_required');
        }
        const exits = context.directional_exits;
        const admitted = await admit(current, exits.map((row) => ({ target_id: row.id,
          position_id: current.scene.location.scene_position_id, entity_kind: 'directional_exit' })));
        const visible = new Set(admitted.map((row) => row.target_id));
        return exits.flatMap((exit) => {
          if (!visible.has(exit.id)) return [];
          const labels = labelCatalog.labels.filter((row) =>
            row.world_revision_id === current.scene.world_revision_id
            && row.g4_ref.id === current.scene.site.parent_g4_id
            && row.directional_exit_ref.id === exit.id
            && row.directional_exit_ref.version === exit.version
            && row.directional_exit_ref.canonical_digest === exit.canonical_digest
            && row.direction_context_ref.id === exit.direction_context_id);
          if (labels.length !== 1) gap('approved_exit_label_required');
          return [{ directional_exit_id: exit.id, directional_exit_version: exit.version,
            direction_context_id: exit.direction_context_id, knowledge_state: 'visible',
            display_label: labels[0].display_label }];
        });
      }, context.transaction, context.observedPositionId);
    },
    async readEntityObservations({ partyId, actorId, transaction,
      observedPositionId } = {}) {
      return withCurrent(partyId, actorId, async (current) => {
        const placements = current.scene.placements.filter((row) =>
          row.entity_kind === 'npc' || row.entity_kind === 'item');
        const admitted = await admit(current, placements.map((row) => ({
          target_id: `${row.entity_kind}:${row.entity_id}`,
          position_id: row.position_node_id, entity_kind: row.entity_kind,
          entity_id: row.entity_id })));
        if (admitted.length && typeof readEntityExterior !== 'function') {
          gap('committed_entity_exterior_required');
        }
        const result = [];
        for (const entry of admitted) {
          const placement = placements.find((row) =>
            `${row.entity_kind}:${row.entity_id}` === entry.target_id);
          const exterior = await readEntityExterior({ transaction: current.transaction,
            partyId, actorId, placement, visibility: entry.visibility });
          if (!exterior || typeof exterior !== 'object' || Array.isArray(exterior)) {
            gap('committed_entity_exterior_required');
          }
          const known = typeof readPlayerKnowledge === 'function'
            ? await readPlayerKnowledge({ transaction: current.transaction, partyId, actorId, placement }) : null;
          result.push({ entity_kind: placement.entity_kind, entity_id: placement.entity_id,
            visibility: entry.visibility, exterior,
            display_label: typeof known?.display_name === 'string' && known.display_name.trim()
              ? known.display_name : placement.entity_kind === 'npc' ? 'человек' : 'предмет',
            ...(typeof known?.display_name === 'string' && known.display_name.trim()
              ? { display_name: known.display_name } : {}) });
        }
        return result;
      }, transaction, observedPositionId);
    },
    async readCurrentSources({ transaction, partyId, actorId, positionId,
      state, directionalExits, observedPositionId = null, siteId = null } = {}) {
      if (typeof transaction?.query !== 'function' || !Array.isArray(directionalExits)) {
        gap('current_visible_transaction_and_exits_required');
      }
      if (typeof readCurrentEnvironment !== 'function') gap('current_temporal_owner_required');
      const current = await withCurrent(partyId, actorId, async (value) => value,
        transaction, observedPositionId);
      if (positionId !== current.scene.location.scene_position_id
        || siteId != null && siteId !== current.scene.site.id) gap('current_position_required');
      const naturalInput = prepareG4NaturalScenePerceptionInput({ verifiedCatalog, pin,
        currentFacts: current.natural });
      const entityObservations = await provider.readEntityObservations({ transaction, partyId,
        actorId, observedPositionId });
      const localEdges = await provider.readLocalEdgeDisclosure({ transaction, partyId,
        actorId, state, observedPositionId });
      const exits = await provider.readExitDisclosure({ transaction, partyId, actorId,
        position: { id: positionId }, site: current.scene.site,
        directional_exits: directionalExits, observedPositionId });
      return { naturalInput, entityObservations, localEdges,
        directionalExits: exits };
    }
  });
  return provider;
}

function naturalG4(natural) { return natural.scene.g4_ref.id; }
function gap(reason) { throw serverError('SCENE_ENTITY_PERCEPTION_DATA_GAP',
  'Complete current visibility and disclosure are required.', { status: 409, details: { reason } }); }
