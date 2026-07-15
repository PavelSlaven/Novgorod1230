import { deepFreeze } from '@rus/kernel';
import { normalizeState } from './state.js';
import { strengthBand } from './utils.js';

export function buildEnvironmentObservationCandidates(input = {}) {
  const state = normalizeState(input.environment_state);
  const candidates = [
    ...state.landmarks.filter((item) => item.status !== 'destroyed').map((item) => observation(item, 'landmark')),
    ...state.cues.filter((item) => item.status !== 'expired').map((item) => observation(item, 'cue')),
    ...state.traces.filter((item) => item.status !== 'erased').map((item) => observation(item, 'trace'))
  ].sort((left, right) => left.feature_id.localeCompare(right.feature_id));
  return deepFreeze(candidates);
}

function observation(feature, kind) {
  return {
    feature_id: feature[`${kind}_id`] ?? feature.landmark_id,
    feature_kind: kind,
    sense: feature.sense ?? 'sight',
    bearing_band: feature.bearing_band ?? 'local',
    distance_band: feature.distance_band ?? 'local',
    strength_band: feature.strength_band ?? strengthBand(feature.strength),
    visibility_conditions: feature.visibility_conditions ?? 'environment_dependent',
    recognition_difficulty: feature.recognition_difficulty ?? 'ordinary',
    navigation_value: feature.navigation_value ?? 'none',
    public_label_key: feature.public_label_key,
    icon_key: feature.icon_key
  };
}
