export const COMBAT_PROGRESS_EFFECT_REF = Object.freeze({
  entity_ref: { entity_kind: 'temporal_effect',
    entity_id: 'combat-step-progress' }, authoring_version: '1' });
export const COMBAT_COMPLETION_EFFECT_REF = Object.freeze({
  entity_ref: { entity_kind: 'temporal_effect',
    entity_id: 'combat-technical-step-completion' }, authoring_version: '1' });

export function lowerDvinaTraceCombatTemporalEffectRegistrations() {
  return [{ effect_ref: COMBAT_PROGRESS_EFFECT_REF,
    resolve({ slice, context, descriptor }) {
      return { proposals: [{ proposal_id: `${slice.slice_id}:combat-progress`,
        write_target: `combat-progress:${slice.slice_id}` }],
      state_projection: advanceCombatStepProgressForSlice(context.projection,
        descriptor.steps, descriptor.step_timings,
        slice.planned_elapsed) };
    } }, { effect_ref: COMBAT_COMPLETION_EFFECT_REF,
    runtime_resolution: true,
    resolve({ candidate, context, descriptor }) {
      if (descriptor?.technical_step_id !== candidate?.boundary_id
          || candidate?.boundary_kind !== 'activity') {
        fail('TRACE_COMBAT_TEMPORAL_COMPLETION_INVALID');
      }
      return { disposition: 'execute', proposals: [{
        proposal_id: `combat-completion:${candidate.boundary_id}`,
        write_target: `combat-completion:${candidate.boundary_id}` }],
      state_projection: context.projection, follow_up_candidates: [] };
    } }];
}
import { advanceCombatStepProgressForSlice } from '@rus/turn';

function fail(code) { throw Object.assign(new Error(code), { code }); }
