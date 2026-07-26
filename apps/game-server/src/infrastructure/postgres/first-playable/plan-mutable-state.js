import { ref } from '../../../runtime/first-playable/shared.js';
import { expected, row } from './plan-shared.js';

export function mutableStateWrites({
  partyId,
  previousState,
  state,
  command,
  result,
  versions,
  changeSet
}) {
  const set = {
    inserts: [],
    updates: [],
    appends: [],
    deletes: [],
    expected: []
  };
  if (result.elapsed > 0) {
    set.updates.push(row('party_clocks', partyId, {
      party_id: partyId,
      whole_minutes: state.clock_minutes,
      updated_change_set_id: changeSet
    }));
    set.expected.push(
      expected('party_clocks', partyId, versions.clock)
    );
  }
  const boundaryConsequence =
    result.summary.traversal?.consequence ?? null;
  if ((command.verb === 'move' && result.elapsed > 0)
      || ['perform_simple_work', 'rest'].includes(command.verb)
      || boundaryConsequence != null) {
    const id = `player_character:${state.player.id}`;
    set.updates.push(row('party_actor_body_states', id, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.player.id,
      health: state.player.health,
      energy: state.player.energy,
      satiety: state.player.satiety,
      updated_change_set_id: changeSet
    }));
    set.expected.push(expected(
      'party_actor_body_states',
      id,
      versions.body
    ));
  }
  if (boundaryConsequence?.conditionCandidate
      && !previousState.player.conditions.includes(
        boundaryConsequence.conditionCandidate
      )) {
    const conditionId = boundaryConsequence.conditionCandidate;
    set.inserts.push(row(
      'party_actor_active_conditions',
      `player_character:${state.player.id}:${conditionId}`,
      {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.player.id,
        condition_id: conditionId,
        condition_profile_ref:
          ref('condition_profile', conditionId, 1),
        status: 'active',
        state_version: 1,
        created_change_set_id: changeSet
      }
    ));
  }
  if (command.verb === 'give') {
    const ropeId = `item:${partyId}:rope`;
    set.updates.push(row(
      'party_entity_controls',
      `item:${ropeId}`,
      {
        party_id: partyId,
        entity_kind: 'item',
        entity_id: ropeId,
        owner_ref: ref('actor', state.player.id),
        holder_ref: ref('npc', state.npc.id),
        controller_ref: ref('npc', state.npc.id),
        updated_change_set_id: changeSet
      }
    ));
    set.expected.push(expected(
      'party_entity_controls',
      `item:${ropeId}`,
      versions.ropeControl
    ));
  }
  return set;
}
