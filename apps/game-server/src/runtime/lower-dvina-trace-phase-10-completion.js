import {
  projectPlayerSafeCompletionOutcome,
  resolveCompositeCompletionOutcome
} from '@rus/visibility-knowledge-memory';
import { serverError } from '../errors.js';
import { projectKnowledge } from './lower-dvina-trace-player-safe-world.js';

const COMPLETION_FACTS = new Set([
  'onisim_found_alive', 'sealed_packet_returned', 'seal_intact',
  'packet_lost_or_destroyed', 'seal_damaged', 'zhdanko_fled',
  'zhdanko_submission_committed',
  'zhdanko_disarmed_and_temporarily_restrained'
]);

export function resolveTracePhase10Contracts({ bundle }) {
  const binding = bundle?.phase_10_bindings;
  const completionRules = bundle?.completion_rules;
  const epilogueRules = bundle?.epilogue_rules;
  if (![18, 19, 20, 21, 22, 23, 24, 25].includes(bundle?.definition_revision)
      || binding?.schema !== 'rus.lower_dvina_trace_phase_10_bindings.v1'
      || binding.scenario_definition_revision !== 18
      || binding.owner !== '@rus/visibility-knowledge-memory'
      || binding.follow_up_trigger !== 'temporary_disposition_committed'
      || binding.execution_policy !== 'deterministic_post_commit'
      || binding.semantic_llm_calls !== 'forbidden'
      || binding.rng_calls !== 'forbidden'
      || binding.completion_rules_ref?.digest
        !== bundle.artifact_pins.completion_rules.digest
      || binding.epilogue_rules_ref?.digest
        !== bundle.artifact_pins.epilogue_rules.digest
      || completionRules?.set_id !== binding.completion_rules_ref.id
      || epilogueRules?.set_id !== binding.epilogue_rules_ref.id) {
    fail('TRACE_PHASE_10_CONTRACT_INVALID');
  }
  return Object.freeze({ binding, completionRules, epilogueRules,
    pins: [bundle.artifact_pins.phase_10_bindings,
      bundle.artifact_pins.completion_rules,
      bundle.artifact_pins.epilogue_rules] });
}

export function buildTracePhase10Completion({ state, contracts }) {
  if (state?.phase9?.status !== 'temporary_disposition_committed'
      || state.phase9.temporary_disposition == null
      || state.completion != null) {
    fail('TRACE_PHASE_10_PRECONDITION_INVALID');
  }
  const sourceCommitVersion = state.party_state.state_version;
  const committedInputs = collectCommittedInputs({ state, contracts,
    sourceCommitVersion });
  const outcome = resolveCompositeCompletionOutcome(
    contracts.completionRules, committedInputs, sourceCommitVersion);
  const visibleFacts = collectVisibleFacts(state, committedInputs);
  const terminalProjection = projectPlayerSafeCompletionOutcome({
    epilogueRules: contracts.epilogueRules,
    completionRules: contracts.completionRules,
    completionOutcome: outcome,
    visibleCommittedFacts: visibleFacts,
    elapsedGameTime: state.clock,
    visibleDetails: visibleDetails(state, outcome, visibleFacts)
  });
  return Object.freeze({ outcome, terminalProjection, committedInputs });
}

export function tracePhase10Pending(state) {
  return state?.phase9?.status === 'temporary_disposition_committed'
    && state.phase9.temporary_disposition != null
    && state.completion == null;
}

function collectCommittedInputs({ state, contracts, sourceCommitVersion }) {
  const inputs = [];
  const add = (factId, inputClass) => {
    const producer = producerFor(contracts.completionRules, factId);
    inputs.push({ input_class: inputClass, fact_id: factId,
      producer_kind: producer.producer_kind ?? producer.source_kind,
      producer_ref: producer.producer_ref ?? producer.source_ref,
      source_commit_version: sourceCommitVersion });
  };
  const phaseFacts = new Set(state.phase9.committed_facts ?? []);
  for (const factId of COMPLETION_FACTS) {
    if (phaseFacts.has(factId)) add(factId, 'committed_objective_fact');
  }
  if (committedOnisimObservation(state, contracts.completionRules)) {
    add('onisim_found_alive', 'committed_objective_fact');
  }
  projectPropertyFacts(state).forEach(
    (factId) => add(factId, 'committed_objective_fact'));
  const evidence = state.phase9.evidence_resolution;
  const evidenceSource = contracts.completionRules.completion_fact_provenance
    .external_committed_sources.find(({ source_kind: kind }) =>
      kind === 'phase_0c_evidence_resolution');
  for (const factId of evidence?.ok === true
      && evidence.graph_ref?.graph_id === evidenceSource?.source_ref
    ? evidence.supported_conclusion_refs ?? [] : []) {
    if (producerExists(contracts.completionRules, factId)) {
      add(factId, 'committed_evidence_resolution_outcome');
    }
  }
  const promiseFact = state.promise_instances?.[0]?.current_state_fact;
  if (producerExists(contracts.completionRules, promiseFact)) {
    add(promiseFact, 'committed_promise_state');
    if (['promise_current_active', 'promise_current_fulfilled']
      .includes(promiseFact)) {
      add('promise_state_admitted_for_full_completion',
        'committed_promise_state');
    }
  }
  add('temporary_disposition_outcome_committed',
    'committed_typed_temporary_disposition');
  return [...new Map(inputs.map((input) => [input.fact_id, input])).values()]
    .sort((left, right) => left.fact_id.localeCompare(right.fact_id));
}

function projectPropertyFacts(state) {
  const packet = (state.items ?? []).find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_sealed_packet');
  const recovered = (state.phase9.checkpoints ?? []).some(({ kind }) =>
    kind === 'packet_recovered');
  const committed = new Set(state.phase9.committed_facts ?? []);
  if (packet?.state?.seal_state === 'intact'
      && packet.placement?.holder_character_id === state.actor_id
      && packet.placement?.container_id == null
      && recovered && state.phase9.seal_observation?.seal_state === 'intact'
      && committed.has('sealed_packet_returned')
      && committed.has('seal_intact')) {
    return ['sealed_packet_returned', 'seal_intact'];
  }
  if (packet?.state?.seal_state === 'destroyed'
      && packet.state.document_condition === 'destroyed_unreadable'
      && packet.state.evidence_availability === 'destroyed'
      && recovered && state.phase9.seal_observation?.seal_state === 'destroyed'
      && committed.has('packet_lost_or_destroyed')) {
    return ['packet_lost_or_destroyed', 'seal_damaged'];
  }
  return [];
}

function committedOnisimObservation(state, rules) {
  const source = rules.completion_fact_provenance.external_committed_sources
    .find(({ fact_ids: facts }) => facts.includes('onisim_found_alive'));
  return (state.perceptions ?? []).some((perception) =>
    perception.fact_id === 'onisim_found_alive'
      && perception.observation_ref === source.source_ref
      && typeof perception.causal_route_execution_id === 'string');
}

function collectVisibleFacts(state, committedInputs) {
  const visible = new Set((state.phase9.committed_facts ?? []).filter(
    (fact) => COMPLETION_FACTS.has(fact)
      || fact.startsWith('trace_ld_v1_evidence_')));
  const visibleKnowledge = new Set((projectKnowledge(state.knowledge) ?? [])
    .map((record) => typeof record === 'string' ? record : record.fact_id)
    .filter(Boolean));
  for (const input of committedInputs) {
    if (input.input_class === 'committed_evidence_resolution_outcome') {
      if (visibleKnowledge.has(input.fact_id)) visible.add(input.fact_id);
      continue;
    }
    if (input.input_class !== 'committed_objective_fact'
        || ['sealed_packet_returned', 'seal_intact',
          'onisim_found_alive'].includes(input.fact_id)) {
      visible.add(input.fact_id);
    }
  }
  if (state.phase9.seal_observation?.seal_state === 'destroyed') {
    visible.add('destroyed_packet_state_observed');
    visible.add('destroyed_seal_state_observed');
  }
  return [...visible].sort();
}

function visibleDetails(state, outcome, visibleFacts) {
  return {
    visible_proved_conclusions: visibleFacts.filter(
      (fact) => fact.startsWith('conclusion:')),
    visible_promise_state:
      state.promise_instances?.[0]?.current_state ?? 'not_active_or_unresolved',
    visible_temporary_disposition: { status: 'committed' }
  };
}

function producerFor(rules, factId) {
  const producer = [
    ...rules.completion_fact_provenance.internal_producers,
    ...rules.completion_fact_provenance.external_committed_sources
  ].find(({ fact_ids: facts }) => facts.includes(factId));
  if (!producer) fail('TRACE_PHASE_10_FACT_PROVENANCE_GAP');
  return producer;
}
function producerExists(rules, factId) {
  return typeof factId === 'string' && [
    ...rules.completion_fact_provenance.internal_producers,
    ...rules.completion_fact_provenance.external_committed_sources
  ].some(({ fact_ids: facts }) => facts.includes(factId));
}
function fail(code) {
  throw serverError(code, 'Phase 10 completion failed closed.', {
    status: 409
  });
}
