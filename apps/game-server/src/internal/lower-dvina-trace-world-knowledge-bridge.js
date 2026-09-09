const LOCATION_PROFILE_MAPPING_SYSTEM =
  'lower_dvina_trace.location_profile';
const PARTICIPANT_PROFILE_MAPPING_SYSTEM =
  'lower_dvina_trace.participant_profile';

export {
  LOCATION_PROFILE_MAPPING_SYSTEM,
  PARTICIPANT_PROFILE_MAPPING_SYSTEM
};

/**
 * Read-only, deterministic preflight. It proves that the exact authored
 * profiles selected by the active trace have factual support; it never chooses
 * a profile or creates a world entity.
 */
export function assertLowerDvinaTraceWorldKnowledgePreflight({
  worldKnowledge, scenarioBundle
} = {}) {
  const bundle = worldKnowledge?.bundle;
  if (typeof worldKnowledge?.core?.resolveWorldKnowledge !== 'function'
      || bundle?.schema !== 'world_knowledge_runtime_bundle_v1'
      || bundle.manifest?.status !== 'production') {
    gap('TRACE_WORLD_KNOWLEDGE_UNAVAILABLE',
      'Active World Knowledge production bundle is required.');
  }

  const required = requiredMappings(scenarioBundle);
  const concepts = new Map(bundle.concepts.map((concept) =>
    [concept.concept_ref, concept]));
  const claims = new Map(bundle.claims.map((claim) =>
    [claim.claim_ref, claim]));
  const evidence = new Map(bundle.evidence.map((record) =>
    [record.evidence_ref, record]));
  const sources = new Map(bundle.sources.map((record) =>
    [record.source_ref, record]));
  const seen = new Set();

  for (const mapping of required) {
    const matches = [...concepts.values()].filter((concept) =>
      concept.review_status === 'approved'
      && (concept.external_mappings ?? []).some((value) =>
        value?.system === mapping.system && value.ref === mapping.ref));
    if (matches.length !== 1) {
      gap('TRACE_WORLD_KNOWLEDGE_MAPPING_MISSING',
        'An exact authored profile needs one approved World Knowledge mapping.',
        { system: mapping.system, ref: mapping.ref,
          mapping_count: matches.length });
    }
    const concept = matches[0];
    seen.add(concept.concept_ref);
    const relatedRefs = [...new Set(concept.related_refs ?? [])].sort();
    if (relatedRefs.length === 0) {
      gap('TRACE_WORLD_KNOWLEDGE_SUBSTRATE_MISSING',
        'Mapped profile context must link to at least one substantive concept.',
        { system: mapping.system, ref: mapping.ref,
          concept_ref: concept.concept_ref });
    }
    const relatedConcepts = relatedRefs.map((ref) => concepts.get(ref));
    if (relatedConcepts.some((value) => value?.review_status !== 'approved')) {
      gap('TRACE_WORLD_KNOWLEDGE_SUBSTRATE_MISSING',
        'Mapped profile context links to a missing or unapproved substantive concept.',
        { system: mapping.system, ref: mapping.ref,
          concept_ref: concept.concept_ref });
    }

    // Profile support has its own bounded query: a growing related corpus
    // must not evict the required profile fact from the substrate slice.
    const slices = [[concept], [concept, ...relatedConcepts]].map((focus) =>
      worldKnowledge.core.resolveWorldKnowledge({
        schema: 'world_knowledge_query_v1',
        pack_ref: bundle.manifest.pack_ref,
        pack_revision: bundle.manifest.revision_id,
        purpose: 'materialization_support',
        query_locale: bundle.manifest.default_locale,
        domains: [...new Set(focus.map((value) =>
          value.domain))].sort(),
        focus_refs: focus.map((value) => value.concept_ref),
        requested_predicates: [],
        search_hints: [],
        context: mapping.context,
        budget: { max_facts: 12, max_candidates: 12, max_context_chars: 5000 }
      }));
    for (const slice of slices) {
      if (slice.verdict === 'supported' && slice.disputes.length === 0
          && slice.hard_constraints.length === 0) continue;
      gap('TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
        'Mapped trace profile must have an undisputed supported factual slice.',
        { system: mapping.system, ref: mapping.ref,
          concept_ref: concept.concept_ref, verdict: slice.verdict,
          coverage: slice.coverage });
    }
    const returned = new Set(slices.flatMap((slice) =>
      slice.facts.map(({ claim_ref }) => claim_ref)));
    const hasApprovedSupport = (claimRef, subjectRef, contextual) => {
      const claim = claims.get(claimRef);
      return claim?.subject_ref === subjectRef
        && claim.review_status === 'approved'
        && claim.polarity === 'support'
        && (!contextual || claim.applicability?.context_scope !== 'universal')
        && claim.qualifiers?.confidence !== 'unknown'
        && claim.qualifiers?.directness !== 'unknown'
        && Array.isArray(claim.evidence_refs)
        && claim.evidence_refs.length > 0
        && claim.evidence_refs.every((ref) => {
          const record = evidence.get(ref);
          return record?.review_status === 'approved'
            && sources.get(record.source_ref)?.review_status === 'approved';
        });
    };
    const contextual = [...returned].some((claimRef) =>
      hasApprovedSupport(claimRef, concept.concept_ref, true));
    const substantive = [...returned].some((claimRef) => {
      const claim = claims.get(claimRef);
      return !['supported_fact', 'historically_compatible'].includes(
        claim?.predicate)
        && [concept.concept_ref, ...relatedRefs].includes(claim?.subject_ref)
        && hasApprovedSupport(claimRef, claim.subject_ref, false);
    });
    if (!contextual || !substantive) {
      gap('TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
        'Mapped trace profile needs contextual support and linked substantive support.',
        { system: mapping.system, ref: mapping.ref,
          concept_ref: concept.concept_ref, verdict: slices[0].verdict,
          coverage: slices.flatMap((slice) => slice.coverage) });
    }
  }
  return Object.freeze([...seen].sort());
}

function requiredMappings(bundle) {
  const year = bundle?.materialization_bindings?.player_dossier_projection
    ?.historical_year;
  const locations = bundle?.location_topology_set?.location_profiles;
  const participants = bundle?.participant_profile_set?.profiles;
  if (!Number.isInteger(year) || !Array.isArray(locations)
      || !Array.isArray(participants)) {
    gap('TRACE_WORLD_KNOWLEDGE_CONTEXT_INVALID',
      'Pinned trace bundle lacks start/early profile context.');
  }
  const result = [];
  for (const location of locations) {
    if (!text(location?.location_profile_id) || !text(location?.region_ref)) {
      gap('TRACE_WORLD_KNOWLEDGE_CONTEXT_INVALID',
        'Pinned trace location profile is incomplete.');
    }
    result.push(Object.freeze({
      system: LOCATION_PROFILE_MAPPING_SYSTEM,
      ref: location.location_profile_id,
      context: Object.freeze({
        time: Object.freeze({ year }),
        place_refs: Object.freeze([
          'region_novgorod_land', location.region_ref,
          location.location_profile_id
        ].sort()),
        actor_facets: Object.freeze({}),
        conditions: Object.freeze({
          location_type: location.location_profile_id
        })
      })
    }));
  }
  for (const participant of participants) {
    if (!text(participant?.profile_id)) {
      gap('TRACE_WORLD_KNOWLEDGE_CONTEXT_INVALID',
        'Pinned trace participant profile is incomplete.');
    }
    const actor_facets = {};
    if (text(participant.social_role_id)) actor_facets.role_ref = participant.social_role_id;
    if (text(participant.occupation_id)) {
      actor_facets.occupation_ref = participant.occupation_id;
    }
    result.push(Object.freeze({
      system: PARTICIPANT_PROFILE_MAPPING_SYSTEM,
      ref: participant.profile_id,
      context: Object.freeze({
        time: Object.freeze({ year }),
        place_refs: Object.freeze([
          'region_novgorod_land',
          bundle.materialization_bindings?.player_dossier_projection
            ?.knowledge?.region_id
        ].filter(text).sort()),
        actor_facets: Object.freeze(actor_facets),
        conditions: Object.freeze({})
      })
    }));
  }
  return result.sort((left, right) => left.system.localeCompare(right.system)
    || left.ref.localeCompare(right.ref));
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function gap(code, message, details = {}) {
  throw Object.assign(new Error(message), {
    code, status: 409, details: Object.freeze({ ...details })
  });
}
