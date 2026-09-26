/** Omit duplicate context_text when structured facts already go on the wire. */
export function omitWorldKnowledgeContextText(request) {
  const knowledge = request?.world_knowledge;
  if (knowledge == null || typeof knowledge !== 'object'
      || Array.isArray(knowledge)) return request;
  const hasStructured = Array.isArray(knowledge.hard_constraints)
    && Array.isArray(knowledge.facts)
    && (knowledge.hard_constraints.length > 0 || knowledge.facts.length > 0);
  if (!hasStructured || !Object.hasOwn(knowledge, 'context_text')) return request;
  const { context_text, ...structured } = knowledge;
  return { ...request, world_knowledge: structured };
}
