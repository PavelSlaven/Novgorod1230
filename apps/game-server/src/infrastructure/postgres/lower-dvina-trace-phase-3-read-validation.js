import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import {
  actualPhase3Traversals,
  expectedPhase3Traversals,
  phase3ActivityReadProof,
  phase3ClueOwnershipMatches,
  phase3NpcReadProof
} from './lower-dvina-trace-phase-3-read-proofs.js';

export function assertPhase3ReadRows({ payload, semanticRevision, results }) {
  const {
    clock,
    position,
    activities,
    interactions,
    summaries,
    decisions,
    checks,
    knowledge,
    npcs,
    clueItems,
    traversals
  } = results;
  const phase3InteractionPrefix = `interaction:${payload.party_id}:trace-phase3:`;
  const expectedInteractions = semanticRevision
    ? []
    : (payload.interactions ?? []).filter(
      ({ interaction_id: id }) => id.startsWith(phase3InteractionPrefix)
    );
  const activityProof = phase3ActivityReadProof(payload, activities.rows);
  const actualInteractions = interactions.rows
    .filter(({ interaction_id: id }) => id.startsWith(phase3InteractionPrefix))
    .map((row) => ({
      interaction_id: row.interaction_id, npc_id: row.npc_id,
      statement_ref: row.terminal_evidence_ref?.statement_ref,
      consequence_ref: row.terminal_evidence_ref?.consequence_ref ?? null
    }));
  const expectedInteractionProof = expectedInteractions.map((entry) => ({
    interaction_id: entry.interaction_id,
    npc_id: entry.npc_id,
    statement_ref: entry.statement_ref,
    consequence_ref: entry.consequence_ref ?? null
  }));
  const expectedSummaries = expectedInteractions.flatMap((entry) =>
    entry.statement_is_new === false ? [] : [{
      summary_id: `summary:${entry.interaction_id}:npc_memory`,
      interaction_id: entry.interaction_id,
      summary_scope: 'npc_memory',
      remembering_subject_id: entry.npc_id,
      summary_text: entry.memory_text
    }, {
      summary_id: `summary:${entry.interaction_id}:player_journal`,
      interaction_id: entry.interaction_id,
      summary_scope: 'player_journal',
      remembering_subject_id: payload.actor_id,
      summary_text: entry.journal_text
    }]
  ).sort((left, right) => left.summary_id.localeCompare(right.summary_id));
  const actualSummaries = summaries.rows
    .filter(({ interaction_id: id }) => id.startsWith(phase3InteractionPrefix))
    .map((row) => ({
      summary_id: row.summary_id, interaction_id: row.interaction_id,
      summary_scope: row.summary_scope,
      remembering_subject_id: row.remembering_subject_id,
      summary_text: row.summary_text
    }));
  const expectedDecisions = expectedInteractions.map((entry) => ({
    request_id: entry.decision_trace.request_id,
    npc_id: entry.npc_id,
    option_id: entry.decision_trace.option_id,
    options_digest: entry.decision_trace.options_digest,
    trace_digest: entry.decision_trace.trace_digest
  })).sort((left, right) => left.request_id.localeCompare(right.request_id));
  const expectedDecisionIds = new Set(expectedDecisions.map(({ request_id: id }) => id));
  const actualDecisions = decisions.rows
    .filter(({ request_id: id }) => expectedDecisionIds.has(id))
    .map((row) => ({
      request_id: row.request_id, npc_id: row.npc_id,
      option_id: row.option_id, options_digest: row.options_digest,
      trace_digest: row.trace_digest
    }));
  const expectedChecks = (payload.activity_history ?? [])
    .filter((entry) => entry.execution_result?.check_result)
    .map((entry) => {
      const result = entry.execution_result.check_result;
      const turnNumber = entry.activity_execution_id.split(':').at(-1);
      return {
        check_resolution_id:
          `check:${payload.party_id}:trace-phase3:${turnNumber}`,
        check_scope_kind: 'immediate_action',
        check_scope_key: {
          request_id: entry.request_id,
          option_id: entry.option_id
        },
        check_policy_ref: {
          entity_kind: 'check_policy',
          entity_id: result.check_id,
          authoring_version: '1'
        },
        deterministic_roll_input_digest: canonicalDigest({
          input_digest: entry.input_digest,
          audit: result.audit
        }),
        roll_value: result.roll,
        modifier_snapshot: result.modifiers,
        target_value: result.difficulty,
        result_kind: result.outcome.success ? 'success' : 'failure',
        consequence_policy_ref: {
          entity_kind: 'consequence_policy',
          entity_id: entry.execution_result.consequence_ref,
          authoring_version: '1'
        },
        result_change_set_id: entry.change_set_id,
        canonical_digest: canonicalDigest(result)
      };
    });
  const actualChecks = checks.rows.map((row) => ({
    check_resolution_id: row.check_resolution_id,
    check_scope_kind: row.check_scope_kind,
    check_scope_key: row.check_scope_key,
    check_policy_ref: row.check_policy_ref,
    deterministic_roll_input_digest:
      row.deterministic_roll_input_digest,
    roll_value: row.roll_value,
    modifier_snapshot: row.modifier_snapshot,
    target_value: row.target_value,
    result_kind: row.result_kind,
    consequence_policy_ref: row.consequence_policy_ref,
    result_change_set_id: row.result_change_set_id,
    canonical_digest: row.canonical_digest
  }));
  const actualKnowledge = knowledge.rows.map((row) => ({
    fact_id: row.fact_id,
    knowledge_state: row.knowledge_state,
    evidence_refs: row.evidence
  }));
  const currentPosition = position.rows[0];
  const npcProof = phase3NpcReadProof(payload, npcs.rows);
  const expectedClue = (payload.items ?? []).find((item) =>
    item.template_id === 'trace_ld_v1_item_blue_wool_fragment');
  const actualClue = clueItems.rows[0] ?? null;
  const expectedTraversals = expectedPhase3Traversals(payload);
  const actualTraversals = actualPhase3Traversals(traversals.rows);
  if (clock.rowCount !== 1 || position.rowCount !== 1
      || clock.rows[0].whole_minutes !== payload.clock.whole_minutes
      || clock.rows[0].subminute_numerator
        !== payload.clock.subminute_numerator
      || clock.rows[0].subminute_denominator
        !== payload.clock.subminute_denominator
      || currentPosition.g4_id !== payload.position.g4_id
      || currentPosition.g5_node_id !== payload.position.g5_node_id
      || currentPosition.g5_anchor_id !== payload.position.g5_anchor_id
      || activityProof.valid !== true
      || canonicalDigest(activityProof.actual)
        !== canonicalDigest(activityProof.expected)
      || canonicalDigest(actualTraversals)
        !== canonicalDigest(expectedTraversals)
      || canonicalDigest(actualInteractions)
        !== canonicalDigest(expectedInteractionProof)
      || canonicalDigest(actualSummaries)
        !== canonicalDigest(expectedSummaries)
      || canonicalDigest(actualDecisions)
        !== canonicalDigest(expectedDecisions)
      || canonicalDigest(actualChecks) !== canonicalDigest(expectedChecks)
      || canonicalDigest(actualKnowledge)
        !== canonicalDigest(payload.knowledge ?? [])
      || canonicalDigest(npcProof.actual) !== canonicalDigest(npcProof.expected)
      || Boolean(expectedClue) !== Boolean(actualClue)
      || (expectedClue
        && (clueItems.rowCount !== 1
          || expectedClue.item_id !== actualClue.item_id
          || expectedClue.profile_id !== actualClue.profile_id
          || expectedClue.quantity !== actualClue.quantity
          || canonicalDigest(expectedClue.placement)
            !== canonicalDigest({
              holder_character_id: actualClue.holder_character_id,
              physical_position: actualClue.physical_position
            })
          || !phase3ClueOwnershipMatches(expectedClue, actualClue)
          || canonicalDigest(expectedClue.state)
            !== canonicalDigest(actualClue.state)))) {
    throw phase2IntegrityError();
  }
}
