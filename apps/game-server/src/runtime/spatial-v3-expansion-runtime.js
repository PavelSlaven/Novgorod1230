import { selectSpatialV3Expansion } from '@rus/materialization/spatial-v3-materialization';
import { serverError } from '../errors.js';

const pin = (row) => ({ id: row.id, version: row.version });
const sameRef = (ref, row) => ref?.entity_id === row?.id
  && Number(ref?.authoring_version) === row?.version;
const one = (rows, reason) => { if (rows.length !== 1) gap(reason); return rows[0]; };

/** Is this position exactly at a departure/both endpoint slot? */
function atDepartureSlot(scene, position) {
  return scene.endpoint_slots.some((row) => ['departure', 'both'].includes(row.endpoint_role)
    && row.required_position_slot_key === position.template_slot_key
    && row.required_position_instance_ordinal === position.template_instance_ordinal);
}

/** Deterministic BFS over the scene's own local edges to the nearest position that
 * satisfies a departure/both endpoint slot - shortest path, ties broken by edge id.
 * `eligibleExpansions` keeps deciding purely by slot rule; the walk itself is a
 * separate, ordinary local movement, owned and applied by the local-scene movement
 * runtime, never duplicated here (A-B1-06: the crossing command only ever executes
 * from `departure`; a not-yet-there actor is offered the first local hop toward it,
 * labelled with the reachable exit's own stable identity, not a second owner).
 * `firstStepEdgeIds` (F3) restricts the first hop to the edges the local-scene owner
 * itself offers from the current position - visible, eligible, admitted; the walk past
 * the first hop is only path-finding over raw topology and never executes anything. */
export function findReachableDeparturePosition(context, firstStepEdgeIds = null) {
  const { position, scene } = context;
  if (atDepartureSlot(scene, position)) return { position, path: [] };
  const positions = new Map((scene.positions ?? []).map((row) => [row.id, row]));
  const edges = [...(scene.movement_edges ?? [])].filter((row) => row.status === 'active')
    .sort((left, right) => left.id.localeCompare(right.id));
  const offered = firstStepEdgeIds == null ? null : new Set(firstStepEdgeIds);
  const visited = new Set([position.id]);
  let frontier = [{ positionId: position.id, path: [] }];
  while (frontier.length) {
    const next = [];
    for (const { positionId, path } of frontier) {
      for (const edge of edges) {
        if (edge.from_position_id !== positionId || visited.has(edge.to_position_id)) continue;
        if (path.length === 0 && offered != null && !offered.has(edge.id)) continue;
        visited.add(edge.to_position_id);
        const toPosition = positions.get(edge.to_position_id);
        const nextPath = [...path, edge.id];
        if (toPosition && atDepartureSlot(scene, toPosition)) return { position: toPosition, path: nextPath };
        if (toPosition) next.push({ positionId: edge.to_position_id, path: nextPath });
      }
    }
    frontier = next;
  }
  return null;
}

/** Exit -> approved slot, the key the disclosure owner needs to resolve the pass-target text. */
function slotByExitOf(context) {
  return new Map((context.closure?.slots ?? []).map((slot) => [slot.directional_exit_id,
    { id: slot.id, version: slot.version }]));
}

/** Server command bridge. Read-only menus never seed frontiers. Selection is
 * repeated by the generated adapter under the existing party/G4 P16 lock. */
export function createSpatialV3ExpansionRuntime({ readContext, generatedExpansionAdapter,
  readExitDisclosure, prepareSiteTraversal, materializerVersion, now = () => Date.now() } = {}) {
  async function selectedContext({ partyId, actorId, directionalExitId }) {
    if (typeof readContext !== 'function') gap('current_expansion_reader_required');
    const context = await readContext({ partyId, actorId });
    const options = eligibleExpansions(context, now());
    if (!options.length) {
      if (directionalExitId != null) gap('selected_exit_unavailable');
      return { context, options: [], selected: null };
    }
    if (typeof readExitDisclosure !== 'function') gap('current_exit_disclosure_owner_required');
    const disclosed = await readExitDisclosure({ ...context,
      directional_exits: options.map((row) => row.exit), slotByExit: slotByExitOf(context) });
    if (!Array.isArray(disclosed)) gap('current_exit_disclosure_required');
    const visible = options.flatMap((option) => {
      const matches = disclosed.filter((row) => row.directional_exit_id === option.exit.id
        && row.directional_exit_version === option.exit.version
        && row.direction_context_id === option.exit.direction_context_id);
      if (!matches.length) return [];
      const disclosure = one(matches, 'ambiguous_exit_disclosure');
      if (!['visible', 'known'].includes(disclosure.knowledge_state)
        || typeof disclosure.display_label !== 'string' || !disclosure.display_label.trim()) gap('approved_exit_disclosure_required');
      return [{ ...option, display_label: disclosure.display_label }];
    });
    return { context, options: visible, selected: directionalExitId == null ? null
      : one(visible.filter((row) => row.exit.id === directionalExitId), 'selected_exit_unavailable') };
  }
  /** A not-yet-at-departure actor never gets an executable crossing command (it would
   * fail `prepareTraversal`'s committed-position check); instead, expose the first local
   * hop of the deterministic path toward whichever departure position would make the
   * crossing eligible, labelled with the reachable exit's own stable display text. The
   * hop is executed by the local-scene movement owner, not duplicated here (A-B1-06). */
  async function approachOptions({ partyId, actorId, firstStepEdgeIds }) {
    if (typeof readContext !== 'function') gap('current_expansion_reader_required');
    // No offered first step, no approach: the hop is the local-scene owner's, never a guess.
    if (!Array.isArray(firstStepEdgeIds) || !firstStepEdgeIds.length) return [];
    const context = await readContext({ partyId, actorId });
    const reachable = findReachableDeparturePosition(context, firstStepEdgeIds);
    if (reachable == null || reachable.path.length === 0) return [];
    const options = eligibleExpansions({ ...context, position: reachable.position }, now());
    if (!options.length || typeof readExitDisclosure !== 'function') return [];
    const disclosed = await readExitDisclosure({ ...context,
      directional_exits: options.map((row) => row.exit), slotByExit: slotByExitOf(context) });
    if (!Array.isArray(disclosed)) return [];
    return options.flatMap((option) => {
      const disclosure = disclosed.find((row) => row.directional_exit_id === option.exit.id
        && row.directional_exit_version === option.exit.version
        && row.direction_context_id === option.exit.direction_context_id);
      if (!disclosure || !['visible', 'known'].includes(disclosure.knowledge_state)
        || typeof disclosure.display_label !== 'string' || !disclosure.display_label.trim()) return [];
      return [{ directional_exit_id: option.exit.id, edge_id: reachable.path[0],
        display_label: disclosure.display_label }];
    });
  }
  return Object.freeze({
    async listExpansionOptions(input) {
      const { options } = await selectedContext({ partyId: input.partyId, actorId: input.actorId });
      return options.map(({ exit, display_label }) => ({ kind: 'crossing',
        directional_exit_id: exit.id, display_label }));
    },
    async listApproachOptions(input) {
      const approaches = await approachOptions({ partyId: input.partyId, actorId: input.actorId,
        firstStepEdgeIds: input.firstStepEdgeIds });
      return approaches.map((row) => ({ kind: 'approach', ...row }));
    },
    async prepareExpansion(input) {
      const { context, selected } = await selectedContext(input);
      if (selected.connection) return Object.freeze({ ok: true, replay: true,
        topology_status: 'committed', connection_id: selected.connection.id,
        source_position_id: context.position.id, directional_exit: pin(selected.exit),
        moves_traveller: false, advances_time: false });
      if (typeof generatedExpansionAdapter?.prepareExpansion !== 'function') gap('p16_expansion_owner_required');
      return generatedExpansionAdapter.prepareExpansion({ party_id: input.partyId, actor_id: input.actorId,
        g4: context.g4, profile: context.profile, slot_ref: pin(selected.slot),
        directional_exit: pin(selected.exit), candidate_ordinal: selected.ordinal,
        source_site_id: context.site.id, source_position_id: context.position.id,
        ...(selected.entry ? { entry_binding: pin(selected.entry) } : {}),
        materializer_version: materializerVersion });
    },
    async prepareTraversal(input) {
      if (typeof prepareSiteTraversal !== 'function') gap('site_connection_traversal_owner_required');
      const { context, selected } = await selectedContext(input);
      if (!selected.connection || selected.connection.id !== input.expansion?.connection_id
        || context.position.id !== input.expansion.source_position_id) gap('committed_site_connection_required');
      return prepareSiteTraversal({ ...input, context, connection: selected.connection });
    }
  });
}

export function eligibleExpansions(context, now) {
  const { closure, snapshot, site, position, scene, partyId } = context;
  const departures = scene.endpoint_slots.filter((row) => ['departure', 'both'].includes(row.endpoint_role)
    && row.required_position_slot_key === position.template_slot_key
    && row.required_position_instance_ordinal === position.template_instance_ordinal);
  // Arrival/focus navigation is a separate ordinary local movement command.
  if (!departures.length) return [];
  const departure = one(departures, 'ambiguous_departure_endpoint');
  const options = [];
  for (const slot of closure.slots) {
    const exit = one(closure.directional_exits.filter((row) => row.id === slot.directional_exit_id
      && row.version === slot.directional_exit_version), 'exact_directional_exit_required');
    const frontiers = snapshot.frontiers.filter((row) => row.source_g5_site_id === site.id && sameRef(row.slot_ref, slot));
    let entry; let ordinal = 0; let chain; let connection;
    if (frontiers.length) {
      const frontier = one(frontiers, 'ambiguous_source_frontier');
      if (frontier.status === 'closed') continue;
      ordinal = frontier.continuation_ordinal;
      chain = one(snapshot.chains.filter((row) => row.id === frontier.continuation_chain_id), 'committed_chain_required');
      const bindings = snapshot.bindings.filter((row) => row.frontier_id === frontier.id && row.position_id === position.id);
      if (!bindings.length) continue;
      const binding = one(bindings, 'ambiguous_source_frontier_binding');
      if (frontier.status === 'consumed') {
        if (binding.status !== 'inactive') gap('consumed_frontier_binding_invalid');
        connection = one(snapshot.site_connections.filter((row) => row.id === frontier.resolved_site_connection_id
          && row.status === 'active' && row.from_site_id === site.id), 'committed_connection_required');
        const from = one(snapshot.endpoint_bindings.filter((row) => row.site_connection_id === connection.id
          && row.endpoint_role === 'from' && row.status === 'active'), 'committed_connection_source_required');
        if (from.position_id !== position.id) continue;
      } else if (frontier.status !== 'open' || binding.status !== 'active') gap('open_frontier_binding_invalid');
    } else {
      if (site.origin !== 'canonical') continue;
      const entries = closure.entry_endpoint_bindings.filter((row) => sameRef(site.canonical_g5_ref,
        { id: row.canonical_g5_id, version: row.canonical_g5_version })
        && row.departure_scene_endpoint_slot_key === departure.slot_key
        && closure.entry_slot_rules.some((rule) => rule.entry_binding_id === row.id
          && rule.entry_binding_version === row.version && rule.slot_id === slot.id && rule.slot_version === slot.version));
      if (!entries.length) continue;
      entry = one(entries, 'ambiguous_entry_slot_rule');
      if (snapshot.chains.some((row) => sameRef(row.slot_ref, slot))) continue;
    }
    if (!connection) {
      const selection = selectSpatialV3Expansion({ closure, snapshot, now, party_id: partyId,
        slot_ref: pin(slot), directional_exit: pin(exit), entry_binding: entry && pin(entry),
        candidate_ordinal: ordinal, ...(ordinal === 0 ? {} : { terminal_ordinal: chain?.terminal_ordinal }) });
      if (!selection.ok) continue;
    }
    options.push({ slot, exit, entry, ordinal, connection });
  }
  return options;
}
function gap(reason) { throw serverError('LIVE_WORLD_EXPANSION_DATA_GAP',
  'This movement is not available.', { status: 409, details: { reason } }); }
