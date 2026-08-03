import { canonicalDigest } from '@rus/materialization';
import { fail } from
  './lower-dvina-trace-semantic-conversation-read-shared.js';

const CONTRIBUTION_SCHEMAS = new Set([
  'conversation_statement_event_v1',
  'conversation_non_statement_contribution_v1'
]);

export function assertContributions(payload, rows) {
  const expected = payload.conversation_contributions ?? [];
  const actual = [];
  const ordinals = new Map();
  for (const row of rows) {
    const contribution = row.contribution_payload;
    const contributionId = contribution?.schema
      === 'conversation_statement_event_v1'
      ? contribution.statement_id
      : contribution?.contribution_id;
    const key = `${row.conversation_id}\u0000${row.session_state_version}`;
    const expectedOrdinal = (ordinals.get(key) ?? 0) + 1;
    if (!CONTRIBUTION_SCHEMAS.has(contribution?.schema)
        || row.contribution_id !== contributionId
        || row.conversation_id !== contribution.conversation_id
        || row.exchange_id !== contribution.exchange_id
        || row.contribution_schema !== contribution.schema
        || Number(row.party_state_version) < 1
        || Number(row.session_state_version) < 1
        || Number(row.contribution_index) !== expectedOrdinal
        || row.idempotency_key
          !== `conversation-contribution:${contributionId}`
        || row.canonical_digest !== canonicalDigest(contribution)) fail();
    ordinals.set(key, expectedOrdinal);
    actual.push(contribution);
  }
  if (canonicalDigest(actual) !== canonicalDigest(expected)) fail();
  return rows;
}
