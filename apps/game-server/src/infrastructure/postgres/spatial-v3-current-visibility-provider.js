import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { visibleCurrentTargets } from '../../runtime/spatial-v3-current-visibility.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  './g4-natural-perception-reader.js';
import { serverError } from '../../errors.js';

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
  worldBaseReader, readCurrentSourceState, readTargetConditions,
  readEntityExterior, readPlayerKnowledge,
  readScene = readCurrentEntityVisibilityScene,
  readNatural = readCurrentNaturalPerceptionFacts } = {}) {
  if (typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool is required.');
  async function withCurrent(partyId, actorId, project) {
    const transaction = await pool.connect();
    try {
      await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const args = { transaction, partyId, actorId, verifiedCatalog, pin,
        worldBaseReader, readCurrentSourceState };
      const scene = await readScene(args);
      const natural = await readNatural(args);
      if (scene.baseline.id !== natural.scene.baseline_id
        || scene.location.scene_position_id !== natural.observer.position_id
        || !natural.ambient_visibility) gap('entity_lighting_policy_required');
      const result = await project({ transaction, scene, natural });
      await transaction.query('COMMIT');
      return result;
    } catch (error) {
      await transaction.query('ROLLBACK');
      throw error;
    } finally { transaction.release(); }
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
        actorId: scene.location.owner_id, scene, target });
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
  async function localDisclosure({ partyId, actorId, state } = {}) {
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
    });
  }
  return Object.freeze({
    async readVisibleLocalEdgeRefs(input) {
      return (await localDisclosure(input)).map((row) => row.edge_id);
    },
    readLocalEdgeDisclosure: localDisclosure,
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
      });
    },
    async readEntityObservations({ partyId, actorId } = {}) {
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
            ...(typeof known?.display_name === 'string' && known.display_name.trim()
              ? { display_name: known.display_name } : {}) });
        }
        return result;
      });
    }
  });
}

function naturalG4(natural) { return natural.scene.g4_ref.id; }
function gap(reason) { throw serverError('SCENE_ENTITY_PERCEPTION_DATA_GAP',
  'Complete current visibility and disclosure are required.', { status: 409, details: { reason } }); }
