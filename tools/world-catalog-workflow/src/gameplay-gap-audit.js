import { isDeepStrictEqual } from 'node:util';

const GAP_CLASSES = new Set([
  'COVERED_BY_WORLD_KNOWLEDGE', 'COVERED_BY_CODE_MECHANICS', 'CORPUS_GAP',
  'RETRIEVAL_GAP', 'SCHEMA_GAP', 'HISTORICAL_APPLICABILITY_GAP',
  'ACTOR_KNOWLEDGE_OR_PERCEPTION_GAP', 'MATERIALIZATION_OR_PRESENCE_GAP',
  'CODE_MECHANICS_GAP', 'AMBIGUOUS_OR_DISPUTED_REAL_WORLD_KNOWLEDGE',
  'NO_FACTUAL_KNOWLEDGE_REQUIRED'
]);
const GAP_FINDINGS = new Set([
  'CORPUS_GAP', 'RETRIEVAL_GAP', 'SCHEMA_GAP',
  'HISTORICAL_APPLICABILITY_GAP', 'ACTOR_KNOWLEDGE_OR_PERCEPTION_GAP',
  'MATERIALIZATION_OR_PRESENCE_GAP', 'CODE_MECHANICS_GAP',
  'AMBIGUOUS_OR_DISPUTED_REAL_WORLD_KNOWLEDGE'
]);
const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const RESEARCH = new Set(['new', 'researching', 'candidate_ready', 'verified',
  'rejected', 'not_required']);
const RESOLUTION = new Set(['open', 'bounded_limit', 'resolved', 'replayed']);

// Development authoring input only. `auditor_output` is independent analysis;
// this module validates its evidence links and lifecycle without interpreting prose.
export function buildGameplayGapBacklog({ auditor_output: audit, traces = [] } = {}) {
  const errors = validateGameplayGapAudit({ auditor_output: audit, traces });
  return freeze({ schema: 'world_knowledge_gameplay_gap_backlog_v1',
    status: errors.length === 0 ? 'ready' : 'blocked',
    auditor_ref: text(audit?.auditor_ref) || null,
    records: errors.length === 0 ? clone(audit.records) : [], errors });
}

export function validateGameplayGapAudit({ auditor_output: audit, traces = [] } = {}) {
  const errors = [];
  if (!plain(audit) || audit.schema !== 'world_knowledge_gameplay_gap_audit_v1') {
    return freeze(['auditor_output.schema must be world_knowledge_gameplay_gap_audit_v1']);
  }
  if (!text(audit.auditor_ref)) errors.push('auditor_output.auditor_ref is required');
  if (!Array.isArray(audit.records)) errors.push('auditor_output.records must be an array');
  const traceByRef = indexTraces(traces, errors);
  const assessmentByTrace = indexAssessments(audit.trace_assessments, traceByRef,
    audit.auditor_ref, errors);
  for (const ref of traceByRef.keys()) {
    if (!assessmentByTrace.has(ref)) errors.push(`trace ${ref} lacks independent premise assessment`);
  }
  requireFindingRecords(assessmentByTrace, audit.records, errors);
  const seen = new Set();
  for (const record of Array.isArray(audit.records) ? audit.records : []) {
    validateRecord(record, traceByRef, seen, errors);
  }
  return freeze(errors);
}

export function validateGameplayGapSaturation({ campaigns = [], records = [], traces = [],
  auditor_output: audit = null, last_p0_p1_fix_ref = '' } = {}) {
  const errors = [];
  errors.push(...validateGameplayGapAudit({ auditor_output: audit, traces }));
  if (!isDeepStrictEqual(audit?.records, records)) {
    errors.push('auditor records must match saturation records');
  }
  const traceByRef = auditedTraceIndex({ traces, auditor_output: audit, errors });
  const recordById = new Map();
  for (const record of records) {
    if (!text(record?.gap_id) || recordById.has(record.gap_id)) {
      errors.push('records require unique gap_id'); continue;
    }
    recordById.set(record.gap_id, record);
  }
  const unresolvedCritical = records.filter((record) =>
    ['P0', 'P1'].includes(record?.severity)
      && record?.resolution_status !== 'replayed');
  if (unresolvedCritical.length) errors.push('unresolved P0/P1 findings block saturation');
  if (records.some(record => record?.severity === 'P2'
      && !['replayed', 'bounded_limit'].includes(record.resolution_status))) {
    errors.push('unresolved P2 findings block saturation');
  }
  const tail = campaigns.slice(-3);
  if (tail.length !== 3) errors.push('three consecutive unseen campaigns are required');
  const seenCampaigns = new Set(), seenTraces = new Set();
  const fixRef = text(last_p0_p1_fix_ref);
  if (!fixRef) errors.push('last_p0_p1_fix_ref is required');
  let sequence = null;
  for (const campaign of tail) {
    if (!plain(campaign) || !text(campaign.campaign_id)
        || campaign.independent_unseen !== true
        || text(campaign.after_p0_p1_fix_ref) !== fixRef) {
      errors.push('campaign must be an independent unseen post-fix campaign'); continue;
    }
    if (seenCampaigns.has(campaign.campaign_id)) errors.push('campaign_id repeats in saturation tail');
    seenCampaigns.add(campaign.campaign_id);
    if (!Number.isSafeInteger(campaign.sequence) || (sequence != null && campaign.sequence <= sequence)) {
      errors.push(`${campaign.campaign_id}: campaign sequence must strictly increase`);
    }
    sequence = campaign.sequence;
    if (!Array.isArray(campaign.trace_refs) || campaign.trace_refs.length === 0) {
      errors.push(`${campaign.campaign_id}: empty campaign cannot pass saturation`); continue;
    }
    for (const ref of campaign.trace_refs) {
      const trace = traceByRef.get(ref);
      if (!trace) errors.push(`${campaign.campaign_id}: unknown trace_ref ${ref}`);
      else {
        if (seenTraces.has(ref)) errors.push(`trace_ref ${ref} repeats across saturation campaigns`);
        seenTraces.add(ref);
        if (trace.campaign_id !== campaign.campaign_id) errors.push(`${campaign.campaign_id}: trace ${ref} belongs to another campaign`);
        if (trace.accepted !== true && trace.accepted !== false) errors.push(`${campaign.campaign_id}: trace ${ref} lacks accepted boolean`);
        if (!Array.isArray(trace.auditor_assessment?.premises) || trace.auditor_assessment.premises.length === 0) {
          errors.push(`${campaign.campaign_id}: trace ${ref} lacks premise assessment`);
        } else if (trace.accepted === true && hasUnsupportedUsedPremise(trace)) {
          errors.push(`${campaign.campaign_id}: accepted trace ${ref} has unsupported premise`);
        }
      }
    }
    if (!Array.isArray(campaign.new_gap_ids)) {
      errors.push(`${campaign.campaign_id}: new_gap_ids must be an array`); continue;
    }
    for (const gapId of campaign.new_gap_ids) {
      const record = recordById.get(gapId);
      if (!record) errors.push(`${campaign.campaign_id}: unknown gap_id ${gapId}`);
      else if (['P0', 'P1'].includes(record.severity)) {
        errors.push(`${campaign.campaign_id}: new ${record.severity} gap ${gapId}`);
      }
    }
    const expected = records.filter((record) => record?.campaign_id === campaign.campaign_id)
      .map((record) => record.gap_id).sort();
    if (!sameStrings(campaign.audited_gap_ids, expected)) {
      errors.push(`${campaign.campaign_id}: audited_gap_ids must cover every finding for campaign`);
    }
    for (const gapId of expected) {
      const record = recordById.get(gapId);
      if (['P0', 'P1'].includes(record?.severity)) {
        errors.push(`${campaign.campaign_id}: critical finding ${gapId} blocks saturation`);
      }
    }
  }
  return freeze({ schema: 'world_knowledge_gameplay_gap_saturation_v1',
    verdict: errors.length === 0 ? 'PASS' : 'BLOCK', errors });
}

function validateRecord(record, traceByRef, seen, errors) {
  if (!plain(record)) { errors.push('gap record must be an object'); return; }
  const required = ['gap_id', 'campaign_id', 'trace_ref', 'scenario_summary',
    'required_factual_premise', 'gap_class', 'domain', 'proposed_family',
    'consumer', 'severity', 'why_current_WK_is_insufficient',
    'historical_or_universal', 'research_status', 'resolution_status'];
  for (const key of required) if (!text(record[key])) errors.push(`${record.gap_id ?? '<gap>'}: ${key} is required`);
  if (!text(record.gap_id) || seen.has(record.gap_id)) errors.push('gap_id must be unique');
  else seen.add(record.gap_id);
  if (!GAP_FINDINGS.has(record.gap_class)) errors.push(`${record.gap_id}: gap_class must be a gap disposition`);
  if (!SEVERITIES.has(record.severity)) errors.push(`${record.gap_id}: invalid severity`);
  if (!RESEARCH.has(record.research_status)) errors.push(`${record.gap_id}: invalid research_status`);
  if (!RESOLUTION.has(record.resolution_status)) errors.push(`${record.gap_id}: invalid resolution_status`);
  if (!['historical', 'universal', 'mixed'].includes(record.historical_or_universal)) errors.push(`${record.gap_id}: invalid historical_or_universal`);
  const trace = traceByRef.get(record.trace_ref);
  if (!trace) errors.push(`${record.gap_id}: trace_ref must name an actual trace`);
  else if (trace.campaign_id !== record.campaign_id) errors.push(`${record.gap_id}: trace belongs to another campaign`);
  for (const key of ['retrieved_claim_refs', 'possible_existing_claim_refs']) {
    if (!stringArray(record[key])) errors.push(`${record.gap_id}: ${key} must be string array`);
    else if (trace && key === 'retrieved_claim_refs' && record[key].some((ref) =>
      !trace.retrieved_claim_refs.includes(ref))) errors.push(`${record.gap_id}: retrieved claim is absent from trace`);
  }
  if (record.resolution_status === 'replayed') {
    const replay = traceByRef.get(record.regression_ref);
    const outcomeMatches = record.replay_outcome === 'committed'
      ? replay?.accepted === true
      : record.replay_outcome === 'rejected' && replay?.accepted === false
        && text(record.replay_error_code)
        && Array.isArray(replay.events)
        && replay.events.some(event => event.error?.code === record.replay_error_code);
    if (!text(record.regression_ref) || !text(record.replay_reason) || !outcomeMatches
        || !replay?.replay_of_gap_ids?.includes(record.gap_id)) {
      errors.push(`${record.gap_id}: replayed gap requires known replay trace outcome`);
    }
  }
  if (record.severity === 'P2' && record.resolution_status === 'bounded_limit'
      && (!text(record.limit_reason)
        || !text(record.limit_auditor_ref) || record.limit_auditor_ref === trace?.explorer_ref
        || record.limit_auditor_ref === trace?.producer_ref)) {
    errors.push(`${record.gap_id}: P2 closure requires independently accepted bounded_limit`);
  }
}

function validatePremise(premise, trace, label, errors) {
  if (!plain(premise) || !text(premise.premise_ref) || typeof premise.required !== 'boolean'
      || typeof premise.used_or_implied !== 'boolean'
      || (premise.required !== true && premise.used_or_implied !== true)
      || !GAP_CLASSES.has(premise.classification)
      || !stringArray(premise.world_knowledge_claim_refs)
      || !stringArray(premise.code_mechanics_refs)) {
    errors.push(`${label}: invalid premise assessment`); return;
  }
  if (trace && premise.world_knowledge_claim_refs.some((ref) =>
    !trace.retrieved_claim_refs.includes(ref))) errors.push(`${label}: premise cites claim absent from trace`);
  if (trace && premise.code_mechanics_refs.some((ref) =>
    !trace.code_mechanics_refs.includes(ref))) errors.push(`${label}: premise cites code owner absent from trace`);
  const supported = premise.world_knowledge_claim_refs.length
    + premise.code_mechanics_refs.length > 0;
  if (premise.used_or_implied && !supported
      && !GAP_FINDINGS.has(premise.classification)
      && premise.classification !== 'NO_FACTUAL_KNOWLEDGE_REQUIRED') {
    errors.push(`${label}: used/implied unsupported premise must be classified as a gap`);
  }
  if (premise.classification === 'COVERED_BY_WORLD_KNOWLEDGE'
      && premise.world_knowledge_claim_refs.length === 0) errors.push(`${label}: WK coverage lacks claim ref`);
  if (premise.classification === 'COVERED_BY_CODE_MECHANICS'
      && premise.code_mechanics_refs.length === 0) errors.push(`${label}: code coverage lacks owner ref`);
  if (premise.classification === 'NO_FACTUAL_KNOWLEDGE_REQUIRED' && supported) {
    errors.push(`${label}: nonfactual premise must not cite support`);
  }
}

function indexTraces(traces, errors) {
  const result = new Map();
  if (!Array.isArray(traces)) { errors.push('traces must be an array'); return result; }
  for (const trace of traces) {
    if (!plain(trace) || !text(trace.trace_ref) || !text(trace.campaign_id)
        || !text(trace.explorer_ref) || !text(trace.producer_ref) || result.has(trace.trace_ref)
        || !stringArray(trace.retrieved_claim_refs) || !stringArray(trace.code_mechanics_refs)
        || typeof trace.accepted !== 'boolean') { errors.push('trace is invalid'); continue; }
    result.set(trace.trace_ref, trace);
  }
  return result;
}

function hasUnsupportedUsedPremise(trace) {
  return trace.auditor_assessment.premises.some((premise) => premise?.used_or_implied === true
    && premise?.classification !== 'NO_FACTUAL_KNOWLEDGE_REQUIRED'
    && (GAP_FINDINGS.has(premise.classification)
      || ((!Array.isArray(premise.world_knowledge_claim_refs)
      || premise.world_knowledge_claim_refs.length === 0)
    && (!Array.isArray(premise.code_mechanics_refs)
      || premise.code_mechanics_refs.length === 0))));
}
function indexAssessments(assessments, traceByRef, auditorRef, errors) {
  const result = new Map();
  if (!Array.isArray(assessments)) { errors.push('auditor_output.trace_assessments must be an array'); return result; }
  for (const assessment of assessments) {
    const trace = traceByRef.get(assessment?.trace_ref);
    if (!plain(assessment) || !trace || result.has(assessment.trace_ref)
        || assessment.auditor_ref !== auditorRef
        || assessment.auditor_ref === trace.explorer_ref
        || assessment.auditor_ref === trace.producer_ref
        || !Array.isArray(assessment.premises) || assessment.premises.length === 0) {
      errors.push('trace assessment is invalid or not independent'); continue;
    }
    for (const premise of assessment.premises) validatePremise(premise, trace,
      `trace ${assessment.trace_ref}`, errors);
    result.set(assessment.trace_ref, assessment);
  }
  return result;
}
function auditedTraceIndex({ traces, auditor_output: audit, errors }) {
  const traceByRef = indexTraces(traces, errors);
  if (!plain(audit) || !text(audit.auditor_ref)) {
    errors.push('auditor_output with auditor_ref is required for saturation'); return traceByRef;
  }
  const assessments = indexAssessments(audit.trace_assessments, traceByRef,
    audit.auditor_ref, errors);
  for (const [ref, trace] of traceByRef) {
    const assessment = assessments.get(ref);
    if (!assessment) {
      errors.push(`trace ${ref} lacks independent premise assessment`); continue;
    }
    traceByRef.set(ref, { ...clone(trace), auditor_assessment: clone(assessment) });
  }
  return traceByRef;
}
function requireFindingRecords(assessmentByTrace, records, errors) {
  const findings = Array.isArray(records) ? records : [];
  for (const [traceRef, assessment] of assessmentByTrace) for (const premise of assessment.premises) {
    if (!GAP_FINDINGS.has(premise.classification)) continue;
    const found = findings.some((record) => record?.trace_ref === traceRef
      && record?.required_factual_premise === premise.premise_ref
      && record?.gap_class === premise.classification);
    if (!found) errors.push(`trace ${traceRef}: ${premise.classification} premise lacks finding record`);
  }
}
function sameStrings(value, expected) {
  return stringArray(value) && [...value].sort().join('\n') === expected.join('\n');
}
function stringArray(value) { return Array.isArray(value) && value.every((item) => text(item)); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function clone(value) { return structuredClone(value); }
function freeze(value) { return Object.freeze(value); }
