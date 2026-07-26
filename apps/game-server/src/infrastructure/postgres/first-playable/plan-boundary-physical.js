import { ref } from '../../../runtime/first-playable/shared.js';
import { expected, row } from './plan-shared.js';

export function boundaryPhysicalWrites({
  partyId,
  previousState,
  state,
  changeSet,
  versions,
  boatId,
  activeTravelStateId
}) {
  const locationId = `location:${partyId}:boat`;
  const placementId = `transport:${boatId}`;
  const anchorId = `anchor:${partyId}:lower-dvina-boundary`;
  const set = {
    inserts: [],
    updates: [],
    deletes: [],
    expected: []
  };
  if (state.location === 'boundary_in_transit') {
    set.updates.push(
      row('party_transit_anchors', anchorId, {
        id: anchorId,
        party_id: partyId,
        active_side:
          `${state.boundary_dispatch_direction}_departure_side`,
        updated_change_set_id: changeSet
      }),
      row('party_journey_locations', locationId, {
        id: locationId,
        party_id: partyId,
        owner_kind: 'transport',
        owner_id: boatId,
        location_kind: 'in_transit',
        scene_position_id: null,
        transit_anchor_id: null,
        travel_state_id: activeTravelStateId,
        updated_change_set_id: changeSet
      })
    );
    set.expected.push(
      expected(
        'party_transit_anchors',
        anchorId,
        versions.boundaryAnchor
      ),
      expected(
        'party_journey_locations',
        locationId,
        versions.boatLocation
      )
    );
    return set;
  }
  if (state.location === 'yp026_boundary_anchor') {
    if (!previousState.boundary_anchor_materialized) {
      set.inserts.push(row('party_transit_anchors', anchorId, {
        id: anchorId,
        party_id: partyId,
        source_route_point_ref: ref(
          'world_route_point',
          state.boundary_dispatch_direction === 'forward'
            ? 'wrpointv3__lower_dvina_yp026_to_yp025__01'
            : 'wrpointv3__lower_dvina_yp025_to_yp026__01',
          1
        ),
        anchor_role: 'boundary',
        context_snapshot: {
          boundary_pair: [
            'BND_G1_001_R2_SOUTH_DVINA',
            'BND_G1_002_NORTH_DVINA'
          ],
          switch_phase: 'outbound_dispatch'
        },
        active_side:
          `${state.boundary_dispatch_direction}_arrival_side`,
        allowed_departure_dependency_pins: state.exact_pins,
        status: 'active',
        state_version: 1,
        created_change_set_id: changeSet,
        updated_change_set_id: changeSet,
        terminal_change_set_id: null
      }));
    } else {
      set.updates.push(row('party_transit_anchors', anchorId, {
        id: anchorId,
        party_id: partyId,
        active_side:
          `${state.boundary_dispatch_direction}_arrival_side`,
        updated_change_set_id: changeSet
      }));
      set.expected.push(expected(
        'party_transit_anchors',
        anchorId,
        versions.boundaryAnchor
      ));
    }
    set.updates.push(row('party_journey_locations', locationId, {
      id: locationId,
      party_id: partyId,
      owner_kind: 'transport',
      owner_id: boatId,
      location_kind: 'transit_anchor',
      scene_position_id: null,
      transit_anchor_id: anchorId,
      travel_state_id: null,
      updated_change_set_id: changeSet
    }));
    set.deletes.push(row('entity_placements', placementId, {
      party_id: partyId,
      entity_kind: 'transport',
      entity_id: boatId
    }));
    set.expected.push(
      expected('party_journey_locations', locationId, versions.boatLocation),
      expected('entity_placements', placementId, versions.boatPlacement)
    );
    return set;
  }
  const receiving =
    state.location === 'yp025_navigation_corridor';
  const suffix = receiving
    ? 'yp025-navigation'
    : 'yp026-south-entry';
  const positionId = `position:${partyId}:${suffix}:${
    receiving ? 'arrival' : 'arrival'
  }`;
  set.updates.push(
    row('party_transit_anchors', anchorId, {
      id: anchorId,
      party_id: partyId,
      active_side: receiving
        ? 'yp025_departure_side'
        : 'yp026_departure_side',
      updated_change_set_id: changeSet
    }),
    row('party_journey_locations', locationId, {
      id: locationId,
      party_id: partyId,
      owner_kind: 'transport',
      owner_id: boatId,
      location_kind: 'scene',
      scene_position_id: positionId,
      transit_anchor_id: null,
      travel_state_id: null,
      updated_change_set_id: changeSet
    })
  );
  set.inserts.push(row('entity_placements', placementId, {
    party_id: partyId,
    entity_kind: 'transport',
    entity_id: boatId,
    placement_kind: 'moored_at_position',
    position_node_id: positionId,
    host_entity_ref: null,
    occupies_capacity_units: 1,
    state_version: 1,
    updated_change_set_id: changeSet
  }));
  set.expected.push(
    expected(
      'party_transit_anchors',
      anchorId,
      versions.boundaryAnchor
    ),
    expected(
      'party_journey_locations',
      locationId,
      versions.boatLocation
    )
  );
  return set;
}
