import { deepFreeze } from '@rus/kernel';

const METRICS = ['health', 'energy', 'satiety'];

/**
 * Projects current numeric body metrics through the explicitly D65-only
 * qualitative data profile. Candidate bands are never a production fallback.
 */
export function projectCombatBodyStateDescriptions({ body_state: bodyState,
  qualitative_profile: profile, data_approval: approval, mode } = {}) {
  const allowed = mode === 'D65_PROBE' && validD65Approval(approval)
    && profile?.status === 'candidate_not_approved'
    && profile?.context_projection?.field === 'body_state_descriptions'
    && profile?.context_projection?.include_only?.join(',')
      === 'metric,npc_description';

  const descriptions = [];
  const gaps = [];
  for (const metric of METRICS) {
    const value = bodyState?.[metric];
    const bands = profile?.metrics?.[metric]?.bands;
    if (!allowed || !Number.isFinite(value) || value < 0 || value > 100
        || !Array.isArray(bands)) {
      gaps.push(metricGap(metric));
      continue;
    }
    const matched = bands.filter((band) => inBand(value, band));
    if (matched.length !== 1 || typeof matched[0].npc_description !== 'string'
        || matched[0].npc_description.trim() === '') {
      gaps.push(metricGap(metric));
      continue;
    }
    descriptions.push({ metric, npc_description: matched[0].npc_description });
  }
  return deepFreeze({ ok: true,
    body_state_descriptions: descriptions, gaps });
}

function metricGap(metric) {
  return { metric, code: 'body_state_qualitative_metric_gap' };
}

function inBand(value, band) {
  return Number.isFinite(band.min_value) && Number.isFinite(band.max_value)
    && (band.min_inclusive ? value >= band.min_value : value > band.min_value)
    && (band.max_inclusive ? value <= band.max_value : value < band.max_value);
}

function validD65Approval(approval) {
  return approval?.approval_granted === true
    && approval.verdict === 'APPROVE_WITH_LIMITS'
    && approval.approval_scope?.includes('качественные полосы как авторские данные')
    && approval.import_authorized === false
    && approval.activation_authorized === false
    && approval.production_authorized === false;
}
