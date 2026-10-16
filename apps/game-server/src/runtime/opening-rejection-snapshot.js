import { STAGE23_CONCERN_CODES } from '@rus/new-game';

const ALLOWED_SEVERITIES = new Set(['warning', 'repairable', 'hard_block', 'upstream_block']);
const REPAIR_OUTCOMES = new Set(['still_rejected', 'handoff_blocked']);

function buildStage23Slice(audit, codes = []) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns : [];
  const safeConcerns = concerns
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .filter((item) => STAGE23_CONCERN_CODES.includes(item.code)
      && ALLOWED_SEVERITIES.has(item.severity))
    .map((item) => ({
      code: item.code,
      severity: item.severity,
      message: String(item.message ?? '').replace(/\s+/gu, ' ').slice(0, 500)
    }));
  const evidence = Array.isArray(audit?.evidence)
    ? [...new Set(audit.evidence.map((entry) => String(entry ?? '').replace(/\s+/gu, ' ').slice(0, 500))
      .filter(Boolean))] : [];
  const codeList = [...new Set([
    ...(Array.isArray(codes) ? codes.map((code) => String(code ?? '').trim()).filter(Boolean) : []),
    ...safeConcerns.map(({ code }) => code)
  ])];
  return Object.freeze({
    pass: audit?.pass === true,
    concerns: Object.freeze(safeConcerns),
    evidence: Object.freeze(evidence),
    codes: Object.freeze(codeList)
  });
}

/** Player-safe opening attempt facts for harness / developer LLM reports. */
export function buildOpeningRejectionSnapshot({ prose, audit, codes = [], repair = {},
  preRepair = null } = {}) {
  const stage23 = buildStage23Slice(audit, codes);
  const outcome = REPAIR_OUTCOMES.has(repair?.outcome) ? repair.outcome : null;
  const pre = preRepair ? safePreRepairSlice({
    writer_prose: preRepair.prose,
    stage23: preRepair.audit
  }) : null;
  return Object.freeze({
    writer_prose: String(prose ?? '').slice(0, 12_000),
    stage23,
    repair: Object.freeze({
      observed: true,
      attempted: repair?.attempted === true,
      ...(outcome ? { outcome } : {})
    }),
    ...(pre ? { pre_repair: pre } : {})
  });
}

function safePreRepairSlice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stage23Source = raw.stage23 ?? raw.audit;
  const stage23 = buildStage23Slice(stage23Source, stage23Source?.codes);
  const writerProse = String(raw.writer_prose ?? raw.prose ?? '').slice(0, 12_000);
  if (writerProse === '' && stage23.concerns.length === 0 && stage23.evidence.length === 0) return null;
  return Object.freeze({ writer_prose: writerProse, stage23 });
}

export function safeOpeningRejectionFromDetails(details) {
  const raw = details?.opening_rejection;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stage23 = raw.stage23 ?? raw.audit;
  const rebuilt = buildOpeningRejectionSnapshot({
    prose: raw.writer_prose,
    audit: stage23,
    codes: stage23?.codes,
    repair: raw.repair
  });
  if (rebuilt.writer_prose === '' && rebuilt.stage23.codes.length === 0
      && rebuilt.stage23.concerns.length === 0 && rebuilt.stage23.evidence.length === 0
      && rebuilt.repair.attempted !== true) return null;
  const pre = safePreRepairSlice(raw.pre_repair);
  return pre ? Object.freeze({ ...rebuilt, pre_repair: pre }) : rebuilt;
}

export function safeOpeningAttemptSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return safeOpeningRejectionFromDetails({ opening_rejection: raw });
}
