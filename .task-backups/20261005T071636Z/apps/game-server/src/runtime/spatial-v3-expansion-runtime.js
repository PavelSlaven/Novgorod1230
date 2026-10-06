import { isDeepStrictEqual } from 'node:util';
import { selectSpatialV3Expansion } from '@rus/materialization/spatial-v3-materialization';
import { serverError } from '../errors.js';
import { slotByExitOf } from './spatial-v3-pass-target-disclosure.js';

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

/** Departure positions reachable through edges admitted by the local movement owner. */
async function reachableDepartureContexts(context, state, localMovementRuntime,
  firstStepEdgeIds = null) {
  if (atDepartureSlot(context.scene, context.position)) return [{ context, path: [] }];
  if (typeof localMovementRuntime?.listAdmittedEdgesAt !== 'function'
      || state?.position?.position_id !== context.position.id) return [];
  const positions = new Map((context.scene.positions ?? []).map((row) => [row.id, row]));
  const departureKeys = new Set(context.scene.endpoint_slots
    .filter((row) => ['departure', 'both'].includes(row.endpoint_role))
    .map((row) => `${row.required_position_slot_key}\0${row.required_position_instance_ordinal}`));
  const offered = firstStepEdgeIds == null ? null : new Set(firstStepEdgeIds);
  const visited = new Set([context.position.id]);
  const found = [];
  let frontier = [{ positionId: context.position.id, path: [] }];
  while (frontier.length) {
    const next = [];
    for (const { positionId, path } of frontier) {
      const admitted = await localMovementRuntime.listAdmittedEdgesAt({
        partyId: context.partyId, actorId: context.actorId, state, positionId });
      for (const edge of admitted.sort((left, right) =>
        left.movement_admission.edge_id.localeCompare(right.movement_admission.edge_id))) {
        const movement = edge.movement_admission;
        if (movement.from_position_ref !== positionId || visited.has(movement.to_position_ref)
          || path.length === 0 && offered != null && !offered.has(movement.edge_id)
          || movement.destination_status === 'occupied') continue;
        visited.add(movement.to_position_ref);
        const target = positions.get(movement.to_position_ref);
        if (!target) continue;
        const targetPath = [...path, movement.edge_id];
        if (departureKeys.has(`${target.template_slot_key}\0${target.template_instance_ordinal}`)) {
          found.push({ context: { ...context, position: target,
            location: { ...context.location, scene_position_id: target.id } },
          path: targetPath });
        } else next.push({ positionId: target.id, path: targetPath });
      }
    }
    frontier = next;
  }
  return found;
}

/** Keep disclosed route choices visible even when internal admission currently has no path;
 * selection then returns the typed, player-safe path refusal before topology preparation. */
function allDepartureContexts(context) {
  const keys = new Set((context.scene.endpoint_slots ?? [])
    .filter((row) => ['departure', 'both'].includes(row.endpoint_role))
    .map((row) => `${row.required_position_slot_key}\0${row.required_position_instance_ordinal}`));
  return [...new Map((context.scene.positions ?? [])
    .filter((position) => keys.has(`${position.template_slot_key}\0${position.template_instance_ordinal}`))
    .map((position) => [position.id, { context: { ...context, position,
      location: { ...context.location, scene_position_id: position.id } }, path: null }])).values()];
}

/** Server command bridge. Read-only menus never seed frontiers. Selection is
 * repeated by the generated adapter under the existing party/G4 P16 lock. */
export function createSpatialV3ExpansionRuntime({ readContext, generatedExpansionAdapter,
  readExitDisclosure, readConnectionDisclosure, prepareSiteTraversal, materializerVersion,
  localSceneMovementRuntime = null, now = () => Date.now() } = {}) {
  async function selectedContext({ partyId, actorId, directionalExitId, state,
    firstStepEdgeIds = null }) {
    if (typeof readContext !== 'function') gap('current_expansion_reader_required');
    const context = await readContext({ partyId, actorId });
    const reachable = await reachableDepartureContexts(context, state,
      localSceneMovementRuntime, firstStepEdgeIds);
    const reachableIds = new Set(reachable.map(({ context: departure }) => departure.position.id));
    const departureContexts = [...reachable, ...allDepartureContexts(context)
      .filter(({ context: departure }) => !reachableIds.has(departure.position.id))];
    const options = departureContexts.flatMap(({ context: departureContext, path }) =>
      eligibleExpansions(departureContext, now()).map((row) => ({ ...row,
        departure_context: departureContext, local_path: path })));
    if (!options.length) {
      if (directionalExitId != null) gap('selected_exit_unavailable');
      return { context, options: [], selected: null };
    }
    if (typeof readExitDisclosure !== 'function') gap('current_exit_disclosure_owner_required');
    const exits = [...new Map(options.map((row) => [row.exit.id, row.exit])).values()];
    const disclosed = await readExitDisclosure({ ...context,
      directional_exits: exits, slotByExit: slotByExitOf(context.closure?.slots) });
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
    const unique = [...new Map(visible.sort((left, right) => (left.local_path?.length ?? Infinity)
      - (right.local_path?.length ?? Infinity)
      || left.departure_context.position.id.localeCompare(right.departure_context.position.id))
      .map((row) => [row.exit.id, row])).values()];
    return { context, options: unique, selected: directionalExitId == null ? null
      : one(unique.filter((row) => row.exit.id === directionalExitId), 'selected_exit_unavailable') };
  }
  /** Canonical connections revealed from the actor's current position (same disclosure rule as exits). */
  async function revealedConnections(context, eligible) {
    if (!eligible.length) return [];
    if (typeof readConnectionDisclosure !== 'function') gap('current_connection_disclosure_owner_required');
    const disclosed = await readConnectionDisclosure({ ...context, connections: eligible });
    if (!Array.isArray(disclosed)) gap('current_connection_disclosure_required');
    return eligible.flatMap((option) => {
      const matches = disclosed.filter((row) => row.connection_binding_id === option.binding.id);
      if (!matches.length) return [];
      const disclosure = one(matches, 'ambiguous_connection_disclosure');
      if (!['visible', 'known'].includes(disclosure.knowledge_state)
        || typeof disclosure.display_label !== 'string' || !disclosure.display_label.trim()) gap('approved_connection_disclosure_required');
      return [{ ...option, display_label: disclosure.display_label }];
    });
  }
  async function connectionChoices(input) {
    if (typeof readContext !== 'function') gap('current_expansion_reader_required');
    const context = await readContext({ partyId: input.partyId, actorId: input.actorId });
    const reachable = await reachableDepartureContexts(context, input.state,
      localSceneMovementRuntime, input.firstStepEdgeIds);
    const reachableIds = new Set(reachable.map(({ context: departure }) => departure.position.id));
    const departureContexts = [...reachable, ...allDepartureContexts(context)
      .filter(({ context: departure }) => !reachableIds.has(departure.position.id))];
    const eligible = departureContexts.flatMap(({ context: departureContext, path }) =>
      eligibleCanonicalConnections(departureContext).map((row) => ({ ...row,
        departure_context: departureContext, local_path: path })));
    const visible = await revealedConnections(context, eligible);
    const unique = [...new Map(visible.sort((left, right) => (left.local_path?.length ?? Infinity)
      - (right.local_path?.length ?? Infinity)
      || left.departure_context.position.id.localeCompare(right.departure_context.position.id))
      .map((row) => [row.binding.id, row])).values()];
    return { context, visible: unique,
      selected: input.connectionBindingId == null ? null : one(unique.filter((row) =>
        row.binding.id === input.connectionBindingId), 'selected_connection_unavailable') };
  }
  return Object.freeze({
    async listConnectionOptions(input) {
      const { visible } = await connectionChoices(input);
      return visible.map(({ binding, display_label }) => ({ kind: 'connection',
        connection_binding_id: binding.id, display_label }));
    },
    async prepareConnection(input) {
      const { context, selected } = await connectionChoices(input);
      const departureContext = selected.departure_context;
      const localApproachChain = await prepareLocalApproachChain({
        partyId: input.partyId, actorId: input.actorId, state: input.state,
        edgeIds: selected.local_path });
      if (selected.local_path.length > 0 && localApproachChain?.terminal_position_ref
          !== departureContext.position.id) gap('local_approach_chain_invalid');
      if (selected.connection) return Object.freeze({ ok: true, replay: true,
        topology_status: 'committed', connection_id: selected.connection.id,
        source_position_id: departureContext.position.id,
        ...(localApproachChain == null ? {} : { local_approach_chain: localApproachChain }),
        moves_traveller: false, advances_time: false });
      if (typeof generatedExpansionAdapter?.prepareCanonicalConnection !== 'function') gap('p16_expansion_owner_required');
      const prepared = await generatedExpansionAdapter.prepareCanonicalConnection({ party_id: input.partyId,
        actor_id: input.actorId, g4: context.g4, profile: context.profile, binding_id: selected.binding.id,
        source_site_id: context.site.id, source_position_id: departureContext.position.id,
        origin_position_id: context.position.id, materializer_version: materializerVersion });
      return localApproachChain == null ? prepared : { ...prepared,
        source_position_id: departureContext.position.id, local_approach_chain: localApproachChain };
    },
    async prepareConnectionTraversal(input) {
      if (typeof prepareSiteTraversal !== 'function') gap('site_connection_traversal_owner_required');
      const { context, selected } = await connectionChoices(input);
      if (!selected.connection || selected.connection.id !== input.expansion?.connection_id
        || selected.departure_context.position.id !== input.expansion.source_position_id) gap('committed_site_connection_required');
      const localApproachChain = await prepareLocalApproachChain({
        partyId: input.partyId, actorId: input.actorId, state: input.state,
        edgeIds: selected.local_path });
      if (!isDeepStrictEqual(localApproachChain,
        input.expansion.local_approach_chain ?? null)) gap('local_approach_chain_changed');
      const departureContext = selected.departure_context;
      const state = localApproachChain == null ? input.state : {
        ...input.state,
        position: { ...input.state.position, position_id: departureContext.position.id,
          g6_instance_id: departureContext.position.g6_instance_id, site_id: context.site.id },
        journey_location: { ...input.state.journey_location,
          scene_position_id: departureContext.position.id }
      };
      // The binding names its own profile; the expansion profile pins only one of them.
      return prepareSiteTraversal({ ...input, state, origin_state: input.state,
        local_approach_chain: localApproachChain, connection: selected.connection,
        context: { ...departureContext,
          closure: { ...departureContext.closure, connection_profiles: [selected.profile] } } });
    },
    async listExpansionOptions(input) {
      const { options } = await selectedContext({ partyId: input.partyId,
        actorId: input.actorId, state: input.state,
        firstStepEdgeIds: input.firstStepEdgeIds });
      return options.map(({ exit, display_label }) => ({ kind: 'crossing',
        directional_exit_id: exit.id, display_label }));
    },
    async prepareExpansion(input) {
      const { context, selected } = await selectedContext(input);
      const departureContext = selected.departure_context;
      const localApproachChain = await prepareLocalApproachChain({
          partyId: input.partyId, actorId: input.actorId, state: input.state,
          edgeIds: selected.local_path });
      if (selected.local_path.length > 0 && localApproachChain?.terminal_position_ref
          !== departureContext.position.id) gap('local_approach_chain_invalid');
      if (selected.connection) return Object.freeze({ ok: true, replay: true,
        topology_status: 'committed', connection_id: selected.connection.id,
        source_position_id: departureContext.position.id, directional_exit: pin(selected.exit),
        ...(localApproachChain == null ? {} : { local_approach_chain: localApproachChain }),
        moves_traveller: false, advances_time: false });
      if (typeof generatedExpansionAdapter?.prepareExpansion !== 'function') gap('p16_expansion_owner_required');
      const prepared = await generatedExpansionAdapter.prepareExpansion({ party_id: input.partyId, actor_id: input.actorId,
        g4: context.g4, profile: context.profile, slot_ref: pin(selected.slot),
        directional_exit: pin(selected.exit), candidate_ordinal: selected.ordinal,
        source_site_id: context.site.id, source_position_id: departureContext.position.id,
        origin_position_id: context.position.id,
        ...(selected.entry ? { entry_binding: pin(selected.entry) } : {}),
        materializer_version: materializerVersion });
      return localApproachChain == null ? prepared : { ...prepared,
        source_position_id: departureContext.position.id,
        local_approach_chain: localApproachChain };
    },
    async prepareTraversal(input) {
      if (typeof prepareSiteTraversal !== 'function') gap('site_connection_traversal_owner_required');
      const { context, selected } = await selectedContext(input);
      if (!selected.connection || selected.connection.id !== input.expansion?.connection_id
        || selected.departure_context.position.id !== input.expansion.source_position_id) gap('committed_site_connection_required');
      const localApproachChain = await prepareLocalApproachChain({
          partyId: input.partyId, actorId: input.actorId, state: input.state,
          edgeIds: selected.local_path });
      if (!isDeepStrictEqual(localApproachChain,
        input.expansion.local_approach_chain ?? null)) gap('local_approach_chain_changed');
      const departureContext = selected.departure_context;
      const state = localApproachChain == null ? input.state : {
        ...input.state,
        position: { ...input.state.position, position_id: departureContext.position.id,
          g6_instance_id: departureContext.position.g6_instance_id,
          site_id: context.site.id },
        journey_location: { ...input.state.journey_location,
          scene_position_id: departureContext.position.id }
      };
      return prepareSiteTraversal({ ...input, state, context: departureContext,
        origin_state: input.state, local_approach_chain: localApproachChain,
        connection: selected.connection });
    }
  });

  async function prepareLocalApproachChain({ partyId, actorId, state, edgeIds }) {
    if (edgeIds == null) {
      throw serverError('LIVE_WORLD_INTERNAL_PATH_UNAVAILABLE',
        'К выбранному выходу сейчас нельзя пройти по доступным проходам внутри места.',
        { status: 409 });
    }
    if (edgeIds.length === 0) return null;
    try {
      const chain = await localSceneMovementRuntime?.prepareLocalApproachChain?.({
        partyId, actorId, state, edgeIds });
      if (chain == null) gap('local_approach_chain_owner_required');
      return chain;
    } catch (error) {
      if (['SPATIAL_V3_LOCAL_EDGE_OCCUPIED', 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE',
        'SPATIAL_V3_LOCAL_MOVEMENT_DENIED'].includes(error?.code)) {
        throw serverError('LIVE_WORLD_INTERNAL_PATH_UNAVAILABLE',
          'К выбранному выходу сейчас нельзя пройти по доступным проходам внутри места.',
          { status: 409 });
      }
      throw error;
    }
  }
}

export function eligibleExpansions(context, now) {
  const { closure, snapshot, site, position, scene, partyId } = context;
  const departures = scene.endpoint_slots.filter((row) => ['departure', 'both'].includes(row.endpoint_role)
    && row.required_position_slot_key === position.template_slot_key
    && row.required_position_instance_ordinal === position.template_instance_ordinal);
  // Endpoint eligibility stays slot-based; selectedContext resolves hidden internal hops.
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
export const canonicalConnectionId = (partyId, bindingId) => `canconn:${partyId}:${bindingId}`;

/** Approved intra-G4 connections of the actor's canonical place that start at its current
 * departure position; `connection` is the committed row when the party already made the passage. */
export function eligibleCanonicalConnections(context) {
  const { canonical_connections: connections, snapshot, site, position, scene, partyId } = context;
  if (site?.origin !== 'canonical' || !connections?.length) return [];
  const here = scene.endpoint_slots.filter((row) => ['departure', 'both'].includes(row.endpoint_role)
    && row.required_position_slot_key === position.template_slot_key
    && row.required_position_instance_ordinal === position.template_instance_ordinal)
    .map((row) => row.slot_key);
  return connections.flatMap(({ binding, profile }) => {
    if (!here.includes(binding.from_scene_endpoint_slot_key)) return [];
    const committed = snapshot.site_connections.find((row) => row.id === canonicalConnectionId(partyId, binding.id));
    return committed && committed.status !== 'active' ? [] : [{ binding, profile, connection: committed }];
  });
}

function gap(reason) { throw serverError('LIVE_WORLD_EXPANSION_DATA_GAP',
  'This movement is not available.', { status: 409, details: { reason } }); }
