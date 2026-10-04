// Maps new-game outcomes into slice report opening-attempt records (no extra LLM calls).
// Rejection diagnostics come from developer LLM turn reports, not the public HTTP error.

import { createHash } from 'node:crypto';

const OPENING_REJECTED = 'AUTHORED_OPENING_AUDIT_REJECTED';

export const partyIdFromNewGameRequestId = (requestId) =>
  `party:${createHash('sha256').update(String(requestId)).digest('hex').slice(0, 24)}`;

export function openingAttemptFromNewGame({ n, ok, data, error, devFailure = null }) {
  if (ok) {
    const prose = data?.screen?.main_prose ?? '';
    return Object.freeze({
      n, outcome: 'accepted', writer_prose: String(prose ?? ''),
      audit: null, repair: null
    });
  }
  if (error?.code !== OPENING_REJECTED) return null;
  const snapshot = devFailure?.opening_rejection ?? null;
  if (snapshot) {
    return Object.freeze({
      n, outcome: 'rejected',
      writer_prose: snapshot.writer_prose ?? '',
      audit: snapshot.audit ?? { pass: false, concerns: [], evidence: [], codes: [] },
      repair: snapshot.repair ?? { attempted: false }
    });
  }
  const codes = Array.isArray(error?.codes) ? error.codes
    : Array.isArray(error?.details?.codes) ? error.details.codes : [];
  return Object.freeze({
    n, outcome: 'rejected', writer_prose: '',
    audit: Object.freeze({ pass: false, concerns: [], evidence: [],
      codes: Object.freeze(codes.map((code) => String(code))) }),
    repair: Object.freeze({ attempted: false })
  });
}

export function renderOpeningAttemptsTable(attempts = []) {
  if (!attempts.length) return '';
  const lines = [
    '| # | исход | коды | repair | concerns | prose (начало) |',
    '|---:|---|---|---|---|---|'
  ];
  for (const attempt of attempts) {
    const codes = attempt.audit?.codes?.join(', ') ?? '—';
    const repair = attempt.repair?.attempted
      ? (attempt.repair.outcome ?? 'attempted') : '—';
    const concerns = attempt.audit?.concerns?.map(({ code }) => code).join(', ') ?? '—';
    const prose = String(attempt.writer_prose ?? '').replace(/\s+/gu, ' ').slice(0, 80)
      .replaceAll('|', '/') || '—';
    lines.push(`| ${attempt.n} | ${attempt.outcome} | ${codes || '—'} | ${repair} | ${concerns || '—'} | ${prose} |`);
  }
  return lines.join('\n');
}
