export const COMBAT_PROGRESS_EFFECT_REF = Object.freeze({
  entity_ref: { entity_kind: 'temporal_effect',
    entity_id: 'combat-step-progress' }, authoring_version: '1' });

export function lowerDvinaTraceCombatTemporalEffectRegistrations() {
  return [{ effect_ref: COMBAT_PROGRESS_EFFECT_REF,
    resolve({ slice, context, descriptor }) {
      return { proposals: [{ proposal_id: `${slice.slice_id}:combat-progress`,
        write_target: `combat-progress:${slice.slice_id}` }],
      state_projection: advanceCombatStepProgressForSlice(context.projection,
        descriptor.steps, descriptor.step_timings,
        slice.planned_elapsed) };
    } }];
}
import { advanceCombatStepProgressForSlice } from '@rus/turn';
