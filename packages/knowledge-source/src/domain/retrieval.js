const PRIORITY_WEIGHT = Object.freeze({
  highest_materialization_normative: 60,
  profile_normative: 50,
  development_process_normative: 45,
  technical_contract: 40,
  navigation: 25,
  reference: 15
});

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'to', 'of', 'in', 'for', 'is', 'are', 'with',
  'и', 'или', 'в', 'во', 'на', 'к', 'ко', 'с', 'со', 'для', 'как', 'что', 'кто',
  'это', 'где', 'при', 'по', 'из', 'у', 'о', 'об', 'от', 'до', 'не', 'ли'
]);

export function rankKnowledgeChunks({ query, chunks, documentsByFile, metadataById, limit = 8 } = {}) {
  const cleanQuery = String(query ?? '').trim();
  if (!cleanQuery) throw new TypeError('query is required.');
  const queryTokens = tokenize(cleanQuery);
  if (queryTokens.length === 0) throw new TypeError('query must contain searchable terms.');
  const normalizedQuery = normalize(cleanQuery);
  const scored = [];
  for (const chunk of chunks ?? []) {
    const document = documentsByFile.get(String(chunk?.file ?? ''));
    if (!document) continue;
    const metadata = metadataById.get(document.document_id);
    if (!metadata) continue;
    const score = scoreChunk({ chunk, metadata, queryTokens, normalizedQuery });
    if (score <= 0) continue;
    scored.push({ chunk, document, metadata, score });
  }
  scored.sort((left, right) =>
    right.score - left.score ||
    priorityWeight(right.metadata.priority_tier) - priorityWeight(left.metadata.priority_tier) ||
    String(left.document.document_id).localeCompare(String(right.document.document_id)) ||
    String(left.chunk.id).localeCompare(String(right.chunk.id))
  );
  return scored.slice(0, normalizeLimit(limit));
}

function scoreChunk({ chunk, metadata, queryTokens, normalizedQuery }) {
  const text = normalize(chunk.text);
  const section = normalize(chunk.section);
  const terms = normalize((metadata.search_terms ?? []).join(' '));
  const subsystem = normalize((metadata.subsystems ?? []).join(' '));
  let score = priorityWeight(metadata.priority_tier);
  if (text.includes(normalizedQuery)) score += 240;
  if (section.includes(normalizedQuery)) score += 280;
  if (terms.includes(normalizedQuery)) score += 220;
  for (const token of queryTokens) {
    if (section.includes(token)) score += 55;
    if (terms.includes(token)) score += 45;
    if (subsystem.includes(token)) score += 25;
    const occurrences = countOccurrences(text, token);
    score += Math.min(occurrences, 8) * 10;
  }
  const matched = queryTokens.filter((token) => text.includes(token) || section.includes(token) || terms.includes(token) || subsystem.includes(token)).length;
  score += matched * matched * 12;
  return matched === 0 ? 0 : score;
}

export function tokenize(value) {
  return [...new Set(normalize(value).split(/[^\p{L}\p{N}_-]+/u).filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

function normalize(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
}

function countOccurrences(text, token) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(token, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + token.length;
  }
}

function priorityWeight(value) {
  return PRIORITY_WEIGHT[value] ?? 0;
}

function normalizeLimit(value) {
  const limit = Number(value ?? 8);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 8;
}
