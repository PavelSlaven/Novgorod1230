export function npcAuditReport(call, { pass = true, concerns = [] } = {}) {
  const { speech } = JSON.parse(call.messages[1].content).plan;
  return { pass, concerns, utterance_fragments: [{
    text: speech.utterance_text, factual: speech.claims.length > 0,
    claim_ids: speech.claims.map(({ claim_id }) => claim_id)
  }] };
}
