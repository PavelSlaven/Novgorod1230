import { expected, row } from './plan-shared.js';

export function carrierWrites({
  state,
  command,
  changeSet,
  versions
}) {
  if (!['board', 'alight'].includes(command.verb)) return null;
  const partyId = state.party_id;
  const locationId = `location:${partyId}:player`;
  if (command.verb === 'board') {
    return {
      inserts: [row(
        'party_carrier_attachments',
        `attachment:${partyId}:${changeSet}`,
        {
          id: `attachment:${partyId}:${changeSet}`,
          party_id: partyId,
          subject_kind: 'actor',
          subject_id: state.player.id,
          carrier_kind: 'transport',
          carrier_id: state.boat.id,
          status: 'active',
          state_version: 1,
          attached_change_set_id: changeSet,
          terminal_change_set_id: null
        }
      )],
      updates: [],
      appends: [],
      deletes: [row('party_journey_locations', locationId, {
        id: locationId,
        party_id: partyId
      })],
      expected: [expected(
        'party_journey_locations',
        locationId,
        versions.actorLocation
      )]
    };
  }
  return {
    inserts: [row('party_journey_locations', locationId, {
      id: locationId,
      party_id: partyId,
      owner_kind: 'actor',
      owner_id: state.player.id,
      location_kind: 'scene',
      scene_position_id: `position:${partyId}:landing`,
      state_version: 1,
      updated_change_set_id: changeSet
    })],
    updates: [row(
      'party_carrier_attachments',
      versions.attachmentId,
      {
        id: versions.attachmentId,
        party_id: partyId,
        status: 'detached',
        terminal_change_set_id: changeSet
      }
    )],
    appends: [],
    deletes: [],
    expected: [expected(
      'party_carrier_attachments',
      versions.attachmentId,
      versions.attachment
    )]
  };
}
