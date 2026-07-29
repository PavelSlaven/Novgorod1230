import { CONTENT_DIGEST, SCENARIO_ID } from './shared.js';

export function scenarioCatalog(tracePublication) {
  const publicProjection = tracePublication?.public_projection;
  const trace = publicProjection?.public_metadata;
  if (!tracePublication
    || publicProjection?.scenario_id !== 'lower_dvina_trace_v1'
    || trace?.available !== true) {
    throw Object.assign(
      new Error('Approved Lower Dvina trace publication is required.'),
      { code: 'TRACE_PHASE_1B_PUBLICATION_INVALID', status: 409 }
    );
  }
  return {
    version: 1,
    schema: 'public_scenario_catalog',
    scenarios: [
      {
        scenario_id: SCENARIO_ID,
        title: 'Нижняя Двина: позднее лето',
        description:
          'Лодочник на защищённой высокой площадке у открытой воды.',
        available: true
      },
      {
        scenario_id: publicProjection.scenario_id,
        title: trace.title,
        description: trace.description,
        available: trace.available
      }
    ]
  };
}

export function baselinePlayer(playerName) {
  return {
    name_id: 'player_supplied_name',
    name: String(playerName ?? '').trim() || 'Путник',
    role_id: 'nov_role_traveller',
    occupation_id: 'nov_occ_traveller',
    skill_profile: {
      profile_id: 'baseline_empty_skills',
      skills: {}
    },
    language_profile: {
      profile_id: 'baseline_language_unspecified'
    },
    knowledge_profile: {
      profile_id: 'baseline_knowledge_unspecified'
    },
    body_profile: {
      profile_id: 'body_ready_traveller_v1',
      metrics: { health: 100, energy: 80, satiety: 70 },
      active_conditions: []
    },
    equipment_profile: {
      profile_id: 'baseline_empty_equipment',
      clothing_template_refs: [],
      owned_item_template_refs: [],
      owned_container_template_refs: []
    },
    candidate_set_digest: CONTENT_DIGEST
  };
}
