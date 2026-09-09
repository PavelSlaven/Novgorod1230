import { TURN_STEP_PLAN_MAPPINGS } from
  './lower-dvina-trace-phase-2-llm-prompts.js';
import { OBSERVED_EVIDENCE_PLAN_MAPPING } from
  './lower-dvina-trace-phase-2-turn-step-perception-prompt.js';

export function turnStepPlanMappings(request) {
  const mappings = JSON.parse(TURN_STEP_PLAN_MAPPINGS);
  if (request.player_safe_state?.observed_evidence_inspection
      ?.semantic_grounding_available === true) {
    mappings.observed_evidence_inspection = OBSERVED_EVIDENCE_PLAN_MAPPING;
  }
  if (request.player_safe_state?.ordinary_resolution
      ?.discovery_available !== true) {
    delete mappings.focused_ordinary_discovery;
    delete mappings.ordinary_material_prerequisite;
  }
  if (request.player_safe_state?.ordinary_resolution
      ?.scene_seed_available === true) delete mappings.visible_general_look;
  else delete mappings.ordinary_scene_seed;
  return JSON.stringify(mappings);
}
