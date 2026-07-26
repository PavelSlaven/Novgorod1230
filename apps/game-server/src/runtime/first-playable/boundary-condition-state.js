export function defaultBoundaryConditionTimeline() {
  return [{
    effective_after_minutes: 0,
    snapshot: {
      availability_policy_ref: {
        entity_kind: 'traversal_availability_policy',
        entity_id:
          'availability.lower_dvina_late_summer_daylight_v1',
        version: 1
      },
      season_mode: 'late_summer_open_water',
      daylight_state: 'daylight',
      water_surface_state: 'open_water',
      wind_band: 'calm',
      visibility_band: 'clear',
      craft_state: 'serviceable',
      load_state: 'within_approved_capacity',
      controller_state: 'approved_boatman_in_control',
      current_band: 'calm',
      craft_control_state: 'stable',
      landmark_confidence: 'sufficient'
    }
  }];
}
