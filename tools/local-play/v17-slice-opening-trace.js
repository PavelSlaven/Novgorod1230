// Maps new-game outcomes into slice report opening-attempt records (no extra LLM calls).
// Opening diagnostics come from developer LLM turn reports, not the public HTTP error.

import { createHash } from 'node:crypto';

const OPENING_REJECTED = 'AUTHORED_OPENING_AUDIT_REJECTED';

export const partyIdFromNewGameRequestId = (requestId) =>
  `party:${createHash('sha256').update(String(requestId)).digest('hex').slice(0, 24)}`;

export function openingDiagnosticsFromReport(report) {
  if (!report || typeof report !== 'object') return null;
  return report.opening_attempt ?? report.failure?.opening_rejection ?? null;
}

export function openingAttemptFromNewGame({ n, ok, data, error, devReport = null }) {
  const snapshot = openingDiagnosticsFromReport(devReport);
  if (ok) {
    const prose = snapshot?.writer_prose ?? data?.screen?.main_prose ?? '';
    return Object.freeze({
      n, outcome: 'accepted', writer_prose: String(prose ?? ''),
      stage23: snapshot?.stage23 ?? null,
      repair: snapshot?.repair ?? Object.freeze({ observed: false, attempted: null }),
      ...(snapshot?.pre_repair ? { pre_repair: snapshot.pre_repair } : {})
    });
  }
  if (error?.code !== OPENING_REJECTED) return null;
  if (snapshot) {
    return Object.freeze({
      n, outcome: 'rejected',
      writer_prose: snapshot.writer_prose ?? '',
      stage23: snapshot.stage23 ?? { pass: false, concerns: [], evidence: [], codes: [] },
      repair: snapshot.repair ?? { observed: true, attempted: false },
      ...(snapshot.pre_repair ? { pre_repair: snapshot.pre_repair } : {})
    });
  }
  const codes = Array.isArray(error?.codes) ? error.codes
    : Array.isArray(error?.details?.codes) ? error.details.codes : [];
  return Object.freeze({
    n, outcome: 'rejected', writer_prose: '',
    stage23: Object.freeze({ pass: false, concerns: [], evidence: [],
      codes: Object.freeze(codes.map((code) => String(code))) }),
    repair: Object.freeze({ observed: false, attempted: null })
  });
}

export function renderOpeningAttemptsTable(attempts = []) {
  if (!attempts.length) return '';
  const lines = [
    '| # | исход | коды | repair | concerns | prose (начало) | prose до repair | коды до repair |',
    '|---:|---|---|---|---|---|---|---|'
  ];
  for (const attempt of attempts) {
    const codes = attempt.stage23?.codes?.join(', ') ?? '—';
    const repair = attempt.repair?.observed === false ? 'неизвестно'
      : attempt.repair?.attempted === true
        ? (attempt.repair.outcome ?? 'attempted')
        : attempt.repair?.attempted === false ? 'нет' : '—';
    const concerns = attempt.stage23?.concerns?.map(({ code }) => code).join(', ') ?? '—';
    const prose = String(attempt.writer_prose ?? '').replace(/\s+/gu, ' ').slice(0, 80)
      .replaceAll('|', '/') || '—';
    const preProse = String(attempt.pre_repair?.writer_prose ?? '').replace(/\s+/gu, ' ').slice(0, 80)
      .replaceAll('|', '/') || '—';
    const preCodes = attempt.pre_repair?.stage23?.codes?.join(', ') ?? '—';
    lines.push(`| ${attempt.n} | ${attempt.outcome} | ${codes || '—'} | ${repair} | ${concerns || '—'} | ${prose} | ${preProse} | ${preCodes || '—'} |`);
  }
  return lines.join('\n');
}
