import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';

import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';

export const row = (targetTable, id, record) => ({
  target_table: targetTable,
  id,
  record
});

export const expected = (targetTable, id, stateVersion) => ({
  target_table: targetTable,
  id,
  state_version: stateVersion
});

export function sealedCheck(kind, evidence = {}) {
  const payload = { kind, ...evidence };
  return {
    ...payload,
    digest: computeSpatialV3CanonicalDigest(payload)
  };
}

export function requiredChecks({ partyId, stateVersion, command, versions }) {
  const checks = [
    sealedCheck('physical', { party_id: partyId }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: stateVersion
    }),
    sealedCheck('pin', {
      dependency_pins_digest:
        computeSpatialV3CanonicalDigest(command.dependency_pins)
    }),
    sealedCheck('endpoint', {
      destination_ref: command.destination_ref ?? null
    }),
    sealedCheck('route', {
      route_binding_ref: command.route_binding_ref ?? null
    }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version: versions.clock }),
    sealedCheck('change_set', {
      canonical_command_digest: command.canonical_digest
    })
  ];
  if (command.verb === 'perform_simple_work') {
    checks.push(sealedCheck('resource_binding', {
      resource_id: `item:${partyId}:rope`,
      expected_state_version: versions.ropeControl,
      owner_id: `actor:${partyId}:player`,
      holder_id: `npc:${partyId}:fisher`,
      controller_id: `npc:${partyId}:fisher`
    }));
  }
  if (command.verb === 'collect_resource') {
    checks.push(sealedCheck('resource_quantity', {
      resource_id: `resource:${partyId}:surface-water`,
      expected_state_version: versions.resource,
      minimum_quantity: 1000
    }));
  }
  if (command.verb === 'board' || command.verb === 'alight') {
    checks.push(sealedCheck('carrier_endpoint', {
      transport_id: `transport:${partyId}:boat`,
      actor_id: `actor:${partyId}:player`,
      position_id: `position:${partyId}:landing`,
      expected_actor_location_state_version: versions.actorLocation,
      expected_attachment_state_version: versions.attachment
    }));
  }
  return checks;
}

export function visibleEnvelope({
  partyId,
  state,
  screen,
  nextVersion,
  changeSet,
  idemId,
  result,
  turnNumber
}) {
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: screen.main_prose,
    perceived_changes: [result.summary.outcome],
    sensory_details: [],
    visible_npcs: state.npc == null
        ? []
      : [{
          entity_ref: {
            entity_kind: 'npc',
            entity_id: state.npc.id
          },
          display_label: state.npc.name ?? 'незнакомый рыбак',
          recognition: state.npc.name == null
            ? 'unrecognized'
            : 'recognized',
          visible_status: 'в поле зрения'
        }],
    visible_objects: state.location === 'landing_edge'
      ? [{
          entity_ref: {
            entity_kind: 'transport',
            entity_id: state.boat?.id
          },
          display_label: 'малая гребная лодка',
          recognition: 'known',
          visible_status: 'у посадочной кромки'
        }].filter(({ entity_ref: entityRef }) => entityRef.entity_id)
      : [],
    known_context: [
      `Время партии: ${state.clock_minutes} минут.`
    ],
    uncertainties: state.water_ml > 0
      ? ['Качество набранной воды не проверено.']
      : [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances:
      screen.action_panel.suggested_actions.map((option) => ({
        action_id: option.option_id,
        label: option.label,
        command_kind: commandKind(option.option_id)
      }))
  };
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: {
      entity_kind: 'world_revision',
      entity_id: state.exact_pins.pins.find(
        ({ kind }) => kind === 'release'
      ).world_revision_id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: '1',
      state_version: null
    }
  }];
  return {
    package_id: `visible:${partyId}:${turnNumber}`,
    party_id: partyId,
    turn_id: screen.turn_id,
    committed_state_version: String(nextVersion),
    change_set_id: changeSet,
    package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
    visible_payload: visiblePayload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'first_playable_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins: dependencyPins,
      canonical_digest:
        computeSpatialV3CanonicalDigest(dependencyPins)
          .replace('sha256:', '')
    },
    idempotency_record_id: idemId
  };
}

export function generalWrites({
  partyId,
  state,
  screen,
  nextVersion,
  changeSet,
  command,
  turnNumber
}) {
  return {
    inserts: [
      row(
        'party_state_snapshots',
        `${partyId}:${nextVersion}`,
        {
          party_id: partyId,
          state_version: nextVersion,
          state_payload: state,
          state_digest: hash(JSON.stringify(state))
        }
      )
    ],
    updates: [
      row('parties', partyId, {
        party_id: partyId,
        status: 'active'
      }),
      row('party_server_sessions', partyId, {
        party_id: partyId,
        screen,
        turn_number: turnNumber,
        last_turn_id: screen.turn_id,
        updated_change_set_id: changeSet
      })
    ],
    appends: [
      row('party_v3_change_sets', changeSet, {
        id: changeSet,
        party_id: partyId,
        operation_kind: command.verb,
        idempotency_record_id:
          `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`
      })
    ],
    deletes: []
  };
}

export function mergeWriteSets(...sets) {
  return sets.reduce((merged, set) => {
    for (const mode of ['inserts', 'updates', 'appends', 'deletes']) {
      merged[mode].push(...(set?.[mode] ?? []));
    }
    return merged;
  }, { inserts: [], updates: [], appends: [], deletes: [] });
}

export const actorRef = (state) => ref('actor', state.player.id);

function commandKind(optionId) {
  if (optionId === 'action:move'
      || optionId === 'action:move_risky') return 'timed_traversal';
  if (optionId === 'action:talk'
      || optionId === 'action:collect_water'
      || optionId === 'action:perform_simple_work'
      || optionId.startsWith('rest:')) return 'timed_activity';
  if (optionId === 'action:board'
      || optionId === 'action:alight') return 'carrier_handoff';
  return 'immediate_action';
}
