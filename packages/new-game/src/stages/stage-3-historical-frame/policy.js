export function buildStage3BoundaryPolicy() {
  return {
    version: 1,
    schema: 'stage_3_historical_frame_policy',
    stage_id: 3,
    stage_slug: 'historical_frame',
    purpose: 'Select and fix the new-party historical/calendar/regional frame from available_candidates only.',
    may_select: [
      'era or historical-period label',
      'year or selected year range',
      'party_day',
      'season',
      'clock.day/hour/minute/time_of_day/light_profile',
      'region from candidate set',
      'political background as constraints',
      'social background as constraints',
      'seasonal pressure as constraints',
      'downstream constraints for later stages'
    ],
    must_not_create: [
      'specific start location or G1-G5 node',
      'scene anchor, visible scene or intro prose',
      'NPCs, named people, witnesses, enemies or helpers',
      'items, inventory, equipment or property facts',
      'player character status, debt, family, biography or goal as fact',
      'concrete weather event or exact temperature',
      'hidden event, secret, raid, battle, court case, fire or conflict'
    ],
    candidate_set_rule: 'Every selected region/period/season/time policy id must exist in available_candidates.',
    random_policy: 'selection_mode=random means choose a compatible candidate; never invent outside the candidate set.',
    audit_is_self_report_only: true
  };
}

export function buildStage3SelectionPolicy(policy = {}) {
  return {
    allow_random: policy.allow_random !== false,
    prefer_approved_records: policy.prefer_approved_records !== false,
    allow_usable_with_caution: policy.allow_usable_with_caution !== false,
    allow_draft: policy.allow_draft === true,
    allow_needs_review: policy.allow_needs_review === true,
    reject_conflict_or_rejected: policy.reject_conflict_or_rejected !== false,
    require_sources: policy.require_sources !== false,
    max_regions: Number.isFinite(Number(policy.max_regions)) ? Number(policy.max_regions) : 10,
    max_historical_periods: Number.isFinite(Number(policy.max_historical_periods)) ? Number(policy.max_historical_periods) : 20,
    max_season_rules: Number.isFinite(Number(policy.max_season_rules)) ? Number(policy.max_season_rules) : 12,
    max_political_contexts: Number.isFinite(Number(policy.max_political_contexts)) ? Number(policy.max_political_contexts) : 12,
    max_social_contexts: Number.isFinite(Number(policy.max_social_contexts)) ? Number(policy.max_social_contexts) : 12
  };
}
