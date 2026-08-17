export function tracePhase7StateIsActionable(state, contracts) {
  const carry = state?.phase6_carry_execution;
  const atCamp = state?.position?.location_ref === contracts.campLocationRef;
  const onisim = (state?.npcs ?? []).find(
    ({ participant_slot_ref: slot }) => slot === 'onisim_boatman'
  );
  const alreadyCompleted = state?.phase7_fire_rest?.status === 'completed'
    || (state?.body_effect_history ?? []).some(
      ({ effect_ref: ref }) => ref === contracts.bodyEffect.effect_profile_id
    );
  return carry?.status === 'completed'
    && atCamp
    && onisim?.machine_state?.spatial_zone_ref === 'fire_rest_area'
    && contracts.zhdanko?.machine_state?.status !== 'incapacitated'
    && !alreadyCompleted;
}
