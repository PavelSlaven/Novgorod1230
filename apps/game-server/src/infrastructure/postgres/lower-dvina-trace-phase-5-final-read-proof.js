import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function assertPhase5FinalRows({ partyId, payload, final, checks,
  bodyHistory, npcTransitions, onisim, bandage, snapshotBandage }) {
  const check = final.check_result;
  if (checks.rowCount !== 1
      || checks.rows[0].check_resolution_id
        !== `check:${partyId}:trace-phase5:treatment`
      || checks.rows[0].check_scope_kind !== 'timed_activity_attempt'
      || checks.rows[0].check_scope_key?.activity_execution_id
        !== final.activity_execution.id
      || Number(checks.rows[0].check_scope_key?.terminal_attempt_ordinal)
        !== final.attempt.attempt_ordinal
      || checks.rows[0].check_policy_ref?.entity_id
        !== 'trace_ld_v1_check_risky_first_aid'
      || Number(checks.rows[0].roll_value) !== check.roll
      || canonicalDigest(checks.rows[0].modifier_snapshot)
        !== canonicalDigest(check.modifiers)
      || Number(checks.rows[0].target_value) !== check.difficulty
      || checks.rows[0].result_kind
        !== (check.outcome.success ? 'success' : 'failure')
      || checks.rows[0].consequence_policy_ref?.entity_id
        !== final.consequence_ref
      || checks.rows[0].canonical_digest !== canonicalDigest(check)) fail();
  const onisimId = actor(payload, 'onisim_boatman').instance_id;
  if (bodyHistory.rowCount !== 1
      || bodyHistory.rows[0].subject_kind !== 'npc'
      || bodyHistory.rows[0].subject_id !== onisimId
      || bodyHistory.rows[0].effect_ref?.profile_ref
        !== 'trace_ld_v1_body_first_aid_onisim_25m'
      || bodyHistory.rows[0].change_set_id
        !== payload.phase5_history.at(-1).change_set_id) fail();
  if (npcTransitions.rowCount !== 1
      || npcTransitions.rows[0].npc_id !== onisimId
      || npcTransitions.rows[0].transition_kind !== final.outcome_fact
      || npcTransitions.rows[0].trace?.check_resolution_id
        !== `check:${partyId}:trace-phase5:treatment`
      || onisim.rowCount !== 1
      || onisim.rows[0].machine_state?.body_condition?.state
        !== final.body_outcome.condition_outcomes[0].to) fail();
  const item = bandage.rows[0];
  if (bandage.rowCount !== 1
      || item.item_id !== snapshotBandage.item_id
      || item.condition_state !== snapshotBandage.condition_state
      || canonicalDigest(item.state) !== canonicalDigest(snapshotBandage.state)
      || item.holder_npc_id !== snapshotBandage.placement.holder_npc_id
      || item.holder_character_id !== null
      || item.physical_position !== snapshotBandage.placement.physical_position
      || item.ownership_id !== snapshotBandage.ownership.ownership_id
      || item.owner_npc_id !== snapshotBandage.ownership.owner_npc_id
      || item.owner_character_id !== null
      || item.controller_npc_id
        !== snapshotBandage.ownership.controller_npc_id
      || item.controller_character_id !== null) fail();
}

function actor(payload, slot) {
  const matches = payload.npcs?.filter(
    ({ participant_slot_ref: ref }) => ref === slot
  ) ?? [];
  if (matches.length !== 1) fail();
  return matches[0];
}

function fail() { throw phase2IntegrityError(); }
