import { deepFreeze, stableStringify } from '@rus/kernel';

export function resolveAuthoredStatementEvidence({ statement, speaker,
  statement_template: template, statement_effect: effect,
  authored_claim: authoredClaim, knowledge_scope_ref: knowledgeScopeRef,
  evidence_ref: evidenceRef } = {}) {
  const absent = (reason) => deepFreeze({ committed: false,
    evidence_ref: null, statement_ref: statementRef(statement),
    lineage_refs: [], reason });
  if (statement?.schema !== 'conversation_statement_event_v1'
      || speaker?.participant_slot_ref !== template?.speaker_ref
      || statement.speaker_ref?.entity_kind !== 'npc'
      || statement.speaker_ref?.entity_id !== speaker?.instance_id) {
    return absent('speaker_or_statement_mismatch');
  }
  if (effect?.statement_template_ref !== template.statement_template_id
      || effect.source_rule !== 'speaker_committed_memory_only'
      || effect.write_targets?.includes('speaker_memory_report') !== true
      || effect.forbidden_write_targets?.includes('objective_truth') !== true
      || template.application_status !== 'template_only'
      || template.truth_classification !== 'truthful'
      || template.statement_ref
        !== `statement_template:${template.statement_template_id}`
      || speaker.knowledge_profile_snapshot?.profile_id !== knowledgeScopeRef
      || !Array.isArray(template.source_perception_template_refs)
      || template.source_perception_template_refs.length === 0
      || !Array.isArray(template.source_knowledge_refs)
      || template.source_knowledge_refs.length === 0
      || template.source_knowledge_refs.some((ref) =>
        !ref.startsWith(`knowledge_scope:${knowledgeScopeRef}#`))) {
    return absent('authored_lineage_mismatch');
  }
  const assertionId = template.assertion?.assertion_id;
  const claims = statement.claims ?? [];
  const testimonyClaims = claims.filter((claim) =>
    claim.claim_id === assertionId
    && claim.claim_id === authoredClaim?.claim_id
    && claim.form === 'assertion'
    && claim.speaker_posture === 'believed_true'
    && claim.source_knowledge_refs?.length === 1
    && claim.source_knowledge_refs[0]?.entity_kind === 'knowledge_scope'
    && claim.source_knowledge_refs[0]?.entity_id === knowledgeScopeRef
    && sameValue(claim, authoredClaim?.claim)
    && statement.utterance_text === authoredClaim?.utterance_text);
  if (authoredClaim?.schema !== 'authored_statement_claim_contract_v1'
      || authoredClaim.statement_template_ref
        !== template.statement_template_id
      || claims.length !== 1 || testimonyClaims.length !== 1) {
    return absent('statement_does_not_commit_authored_testimony');
  }
  return deepFreeze({ committed: true, evidence_ref: evidenceRef,
    statement_ref: statementRef(statement), lineage_refs: [
      template.statement_ref,
      ...template.source_knowledge_refs,
      ...template.source_perception_template_refs.map(
        (ref) => `perception_template:${ref}`)], reason: null });
}

function statementRef(statement) {
  return typeof statement?.statement_id === 'string'
    ? `conversation_statement:${statement.statement_id}` : null;
}
function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}
