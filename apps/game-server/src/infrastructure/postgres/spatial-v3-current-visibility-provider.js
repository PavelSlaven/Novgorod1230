import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { visibleCurrentTargets } from '../../runtime/spatial-v3-current-visibility.js';
import { readCurrentEntityVisibilityScene, readCurrentNaturalPerceptionFacts } from
  './g4-natural-perception-reader.js';
import { serverError } from '../../errors.js';
import { resolveVisibleItemLabel } from '../../runtime/lower-dvina-trace-visible-item-label.js';
import { prepareG4NaturalScenePerceptionInput } from '../../runtime/g4-natural-perception.js';
import { loadApprovedLocalEdgeLabels } from '../../../../../data/world-catalogs/novgorod/m2c-local-edge-labels/approved-labels.mjs';
import { withPassTargetDisambiguation } from '../../../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';
import { passTargetDisclosureForExit, slotByExitOf } from '../../runtime/spatial-v3-pass-target-disclosure.js';
import { loadApprovedConnectionLabels } from '../../../../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/approved-labels.mjs';

const labelPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url);
const approvalPath = new URL('../../../../../data/world-catalogs/novgorod/m2c-exit-labels/approval-attestation.json', import.meta.url);
const labelBytes = readFileSync(labelPath);
const labelCatalog = JSON.parse(labelBytes);
const labelApproval = JSON.parse(readFileSync(approvalPath));
const approvedLabels = labelApproval.decision === 'APPROVE_DATA_ONLY'
  && labelApproval.candidate_ref === `${labelCatalog.candidate_id}@${labelCatalog.version}`
  && labelApproval.candidate_sha256 === createHash('sha256').update(labelBytes).digest('hex');
const localLabels = loadApprovedLocalEdgeLabels();
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
  readEntityExterior, readPlayerKnowledge, readLocalMovementAdmission = null,
  readConnectionLabels = loadApprovedConnectionLabels,
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
      if (state?.party_id !== partyId || state.actor_id !== actorId
        || state.journey_location?.scene_position_id !== current.scene.location.scene_position_id) {
        gap('current_local_edge_disclosure_required');
      }
      const edges = current.scene.movement_edges.filter((row) =>
        row.from_position_id === current.scene.location.scene_position_id);
      const admitted = await admit(current, edges.map((row) => ({
        target_id: row.id, position_id: row.to_position_id, entity_kind: 'local_edge' })));
      const visible = new Set(admitted.map((row) => row.target_id));
      // The movement admission owner (spatial-v3-local-scene-movement.js) says who fills each
      // destination and how many places it has. Before an attempt the actor may only learn of
      // occupants they perceive (apps/game-server/MODULE.md: a visible path does not disclose
      // unseen occupants), so the disclosed status counts just the occupants admitted here;
      // the owner's own full-occupancy check still decides the attempt itself.
      const admission = typeof readLocalMovementAdmission === 'function'
        ? await readLocalMovementAdmission({ transaction: current.transaction, partyId, actorId,
            positionId: current.scene.location.scene_position_id })
        : null;
      const occupants = new Map();
      for (const row of admission ?? []) {
        if (!Number.isSafeInteger(row?.destination_capacity) || row.destination_capacity < 1
          || !Array.isArray(row.destination_placements)) gap('current_local_edge_admission_required');
        for (const placement of row.destination_placements) {
          if (['npc', 'item'].includes(placement.entity_kind)) {
            occupants.set(`${placement.entity_kind}:${placement.entity_id}`, {
              target_id: `${placement.entity_kind}:${placement.entity_id}`,
              position_id: edges.find((edge) => edge.id === row.edge_id)?.to_position_id,
              entity_kind: placement.entity_kind, entity_id: placement.entity_id });
          }
        }
      }
      const perceived = new Set((await admit(current, [...occupants.values()]))
        .map((row) => row.target_id));
      const statusByEdge = admission == null ? null : new Map(admission.map((row) => [row.edge_id,
        row.destination_placements.filter((placement) => perceived.has(
          `${placement.entity_kind}:${placement.entity_id}`))
          .reduce((units, placement) => units + placement.units, 0) + 1 <= row.destination_capacity
          ? 'open' : 'occupied']));
      return edges.flatMap((edge) => {
        if (!visible.has(edge.id)) return [];
        const labels = localLabels.filter((row) =>
          row.scene_template_ref.id === (edge.source_scene_template_ref?.entity_id
            ?? edge.source_scene_template_ref?.entity_ref?.entity_id)
          && row.scene_template_ref.version === Number(edge.source_scene_template_ref?.authoring_version)
          && row.edge_slot_key === edge.source_edge_slot_key);
        if (labels.length !== 1) gap('approved_local_edge_label_required');
        // The admission owner answers only for the actor's committed position; an edge it
        // has no row for (destination projection before commit, or an edge it does not
        // admit) is disclosed without a status - never guessed and never a data gap.
        const destinationStatus = statusByEdge?.get(edge.id);
        if (destinationStatus !== undefined && !['open', 'occupied'].includes(destinationStatus)) {
          gap('current_local_edge_admission_required');
        }
        return [{ edge_id: edge.id, display_label: labels[0].display_label,
          ...(destinationStatus !== undefined ? { destination_status: destinationStatus } : {}) }];
      });
    }, transaction, observedPositionId);
  }
  let connectionLabels = null;
  const labelsOfConnections = () => {
    try { return connectionLabels ??= readConnectionLabels(); } catch { gap('approved_connection_label_required'); }
  };
  async function discloseConnections(current, connections) {
    const here = current.scene.location.scene_position_id;
    const admitted = await admit(current, connections.map(({ binding }) => ({
      target_id: binding.id, position_id: here, entity_kind: 'site_connection' })));
    const revealed = new Set(admitted.map((row) => row.target_id));
    return connections.flatMap(({ binding }) => {
      if (!revealed.has(binding.id)) return [];
      const label = labelsOfConnections().get(binding.id);
      if (label == null) gap('approved_connection_label_required');
      return [{ connection_binding_id: binding.id, knowledge_state: 'visible',
        display_label: label.display_label, editorial_choice_ordinal: label.editorial_choice_ordinal }];
    });
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
    async readCurrentExitDisclosure({ partyId, actorId, transaction, observedPositionId } = {}) {
      return withCurrent(partyId, actorId, async (current) => {
        const binding = await worldBaseReader?.readG4ExpansionBinding?.({
          g4_id: current.scene.site.parent_g4_id,
          world_revision_id: current.scene.world_revision_id });
        if (!binding?.ok) gap('approved_g4_expansion_binding_required');
        const approved = await worldBaseReader.readApprovedG4DirectionalExits(binding.value);
        if (!approved?.ok || !Array.isArray(approved.value)) {
          gap('approved_g4_directional_exits_required');
        }
        const exits = approved.value.filter((row) =>
          row.exit_canonical_g5_id === current.scene.site.canonical_g5_ref?.entity_id);
        // Slot lookup for the not-yet-generated pass-target description (step 3); stateless
        // catalog read, safe to repeat, never recomputes occupancy or admission.
        const closure = typeof worldBaseReader.readPinnedG4ExpansionClosure === 'function'
          ? await worldBaseReader.readPinnedG4ExpansionClosure(binding.value) : null;
        if (closure != null && !closure.ok) gap('approved_g4_expansion_closure_required');
        const slotByExit = closure == null ? null : slotByExitOf(closure.value.slots);
        return provider.readExitDisclosure({ transaction: current.transaction, partyId,
          actorId, position: { id: current.scene.location.scene_position_id },
          site: current.scene.site, directional_exits: exits, slotByExit, observedPositionId });
      }, transaction, observedPositionId);
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
        const revealed = new Set(admitted.map((row) => row.target_id));
        const disclosed = exits.flatMap((exit) => {
          if (!revealed.has(exit.id)) return [];
          const labels = labelCatalog.labels.filter((row) =>
            row.world_revision_id === current.scene.world_revision_id
            && row.g4_ref.id === current.scene.site.parent_g4_id
            && row.directional_exit_ref.id === exit.id
            && row.directional_exit_ref.version === exit.version
            && row.directional_exit_ref.canonical_digest === exit.canonical_digest
            && row.direction_context_ref.id === exit.direction_context_id);
          if (labels.length !== 1) gap('approved_exit_label_required');
          // Any revealed exit shows its approved pass-target description; an exit the
          // observer cannot see at all is not in `revealed` and is not disclosed.
          return [{ directional_exit_id: exit.id, directional_exit_version: exit.version,
            direction_context_id: exit.direction_context_id, knowledge_state: 'visible',
            display_label: labels[0].display_label,
            editorial_choice_ordinal: labels[0].editorial_choice_ordinal,
            ...passTargetDisclosureForExit(context.slotByExit, exit.id) }];
        });
        return withPassTargetDisambiguation(disclosed);
      }, context.transaction, context.observedPositionId);
    },
    /** Canonical connections of the observer's own position, revealed by the same visibility rule
     * as exits; the approved label comes from the connection label catalog, never from code. */
    async readConnectionDisclosure(context = {}) {
      return withCurrent(context.partyId, context.actorId, async (current) => {
        if (!Array.isArray(context.connections)
          || context.position?.id !== current.scene.location.scene_position_id) {
          gap('approved_connection_disclosure_required');
        }
        return discloseConnections(current, context.connections);
      }, context.transaction, context.observedPositionId);
    },
    /** Every connection of the current canonical place that the observer can see from here - the
     * connection counterpart of readCurrentExitDisclosure, for the visible context. */
    async readCurrentConnectionDisclosure({ partyId, actorId, transaction, observedPositionId } = {}) {
      return withCurrent(partyId, actorId, async (current) => {
        const site = current.scene.site;
        if (site?.origin !== 'canonical') return [];
        const binding = await worldBaseReader?.readG4ExpansionBinding?.({
          g4_id: site.parent_g4_id, world_revision_id: current.scene.world_revision_id });
        if (!binding?.ok) gap('approved_g4_expansion_binding_required');
        const connections = await worldBaseReader.readApprovedCanonicalG5Connections({
          g4: binding.value.g4, canonical_g5: { id: site.canonical_g5_ref.entity_id,
            version: Number(site.canonical_g5_ref.authoring_version) } });
        if (!connections?.ok) gap('approved_canonical_connections_required');
        return discloseConnections(current, connections.value);
      }, transaction, observedPositionId);
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
          const displayName = known?.display_name ?? exterior.display_name ?? null;
          const itemLabel = placement.entity_kind === 'item'
            ? resolveVisibleItemLabel({ name: displayName }) : null;
          result.push({ entity_kind: placement.entity_kind, entity_id: placement.entity_id,
            visibility: entry.visibility, exterior,
            ...(placement.entity_kind === 'npc'
              ? { display_label: displayName ?? 'человек' }
              : itemLabel.kind === 'gap'
                ? { label_gap: { code: itemLabel.code } }
                : { display_label: itemLabel.label }),
            ...(displayName == null ? {} : { display_name: displayName }) });
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
      const siteConnections = await provider.readCurrentConnectionDisclosure({ transaction,
        partyId, actorId, observedPositionId });
      return { naturalInput, entityObservations, localEdges,
        directionalExits: exits, siteConnections };
    }
  });
  return provider;
}

function naturalG4(natural) { return natural.scene.g4_ref.id; }
function gap(reason) { throw serverError('SCENE_ENTITY_PERCEPTION_DATA_GAP',
  'Complete current visibility and disclosure are required.', { status: 409, details: { reason } }); }
