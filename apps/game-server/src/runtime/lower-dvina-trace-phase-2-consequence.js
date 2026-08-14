import { serverError } from '../errors.js';
import {
  evidenceSupportsFact,
  TRACE_PHASE_2_IDS
} from './lower-dvina-trace-phase-2-contracts.js';
import { materializeBlueWoolPickup } from './lower-dvina-trace-phase-2-pickup.js';

const ROAD_BAG_MISSING = 'visible:road_bag_missing';
const ROAD_BAG_KNOWLEDGE_SOURCES = new Set([
  'trace_ld_v1_statement_eremey_disclosure',
  'trace_ld_v1_statement_ratsha_confession',
  'trace_ld_v1_evidence_bag_at_zhdanko'
]);

export function resolveInspectionConsequence({
  retrievedState,
  checks,
  contracts,
  inputDigest
}) {
  const ids = TRACE_PHASE_2_IDS;
  const checkResult = checks.results.find(
    (entry) => entry.check_id === contracts.check.check_id
  );
  if (!checkResult) {
    throw serverError(
      'TRACE_PHASE_2_CHECK_RESULT_MISSING',
      'Canonical wreck inspection check did not resolve.',
      { status: 409 }
    );
  }
  const success = checkResult.outcome.success === true;
  const roadBagKnown = (retrievedState.knowledge ?? []).some((record) =>
    ROAD_BAG_KNOWLEDGE_SOURCES.has(record.fact_id));
  const evidenceRefs = [
    ...contracts.check.precheck_automatic_observation_refs.filter((ref) =>
      contracts.evidenceGraph.evidence_records.some(
        (record) => record.evidence_id === ref
      )),
    ...(success
      ? contracts.check.admitted_evidence_by_outcome.success
      : contracts.check.admitted_evidence_by_outcome.failure)
  ];
  const observationRefs = [...new Set([
    ...contracts.check.precheck_automatic_observation_refs,
    ...(success ? contracts.check.success_observation_refs : []),
    ...evidenceRefs
  ])].filter((ref) => ref !== ROAD_BAG_MISSING || roadBagKnown);
  const knownFacts = new Set(
    (retrievedState.knowledge ?? []).map(({ fact_id: factId }) => factId)
  );
  const newlyCommittedObservationRefs = observationRefs.filter(
    (factId) => !knownFacts.has(factId)
  );
  const newlyCommittedEvidenceRefs = evidenceRefs.filter((evidenceId) =>
    newlyCommittedObservationRefs.some((factId) =>
      evidenceSupportsFact(contracts, evidenceId, factId)
    )
  );
  const clueAlreadyCommitted = retrievedState.items.some(
    (item) => item.template_id === ids.blueWool
  );
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'resolved',
    activity_attempt_id:
      `attempt:${inputDigest.slice(0, 32)}`,
    duration_minutes: contracts.activity.duration_minutes,
    body_effect_ref: ids.bodyEffect,
    consequence_ref: success
      ? contracts.check.outcome_refs.success
      : contracts.check.outcome_refs.failure,
    check_result: structuredClone(checkResult),
    observations: newlyCommittedObservationRefs.map((factId, ordinal) => ({
      observation_id:
        `observation:${inputDigest.slice(0, 20)}:${ordinal}`,
      fact_id: factId,
      kind: 'committed_observation'
    })),
    knowledge_records: newlyCommittedObservationRefs.map((factId) => ({
      fact_id: factId,
      knowledge_state: 'observed',
      evidence_refs: newlyCommittedEvidenceRefs.filter((evidenceId) =>
        evidenceSupportsFact(contracts, evidenceId, factId))
    })),
    evidence_relations: newlyCommittedEvidenceRefs.map((evidenceId) => ({
      evidence_id: evidenceId,
      relation: 'discovered_during_inspection',
      proves: 'bounded_observation_only'
    })),
    clue_materialization:
      success && !clueAlreadyCommitted
        ? contracts.blueWoolPickupTransition
          ? materializeBlueWoolPickup({
              retrievedState,
              contracts,
              consequenceRef: contracts.check.outcome_refs.success
            })
          : structuredClone(contracts.blueWoolClue)
        : null,
    visible_seed: {
      observation_refs: observationRefs,
      evidence_refs: evidenceRefs,
      clue_ref: success ? ids.blueWool : null,
      check_outcome: checkResult.outcome.band
    },
    hidden_update: {
      approved_fact_ids: observationRefs,
      approved_evidence_ids: evidenceRefs
    },
    state_changes: [{
      target: 'character_knowledge_map',
      operation: 'append_committed_observations'
    }],
    suggested_actions: []
  };
}
