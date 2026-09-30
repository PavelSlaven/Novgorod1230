import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-records.js';

const SCHEMA = 'rus.needs_check_blockers.v2';
const LANGUAGES = new Set(['ru', 'lat', 'id']);
const TOKEN = /[\p{L}\p{N}]+/gu;
const VALIDATED = new WeakSet();
const COMPILED = new WeakMap();
const RU_ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'ему', 'ыми', 'ими', 'ому', 'ее', 'ие', 'ые',
  'ая', 'яя', 'ое', 'ее', 'ый', 'ий', 'ой', 'ую', 'юю', 'ою', 'ею', 'ых',
  'иями', 'ов', 'ев', 'ей', 'ам', 'ям', 'ах', 'ях', 'ью', 'его', 'й',
  'их', 'ым', 'им', 'ом', 'ем', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь'
];

function normalize(value) {
  if (typeof value !== 'string') return [];
  return tokenize(value).map(stem);
}

function tokenize(value) {
  if (typeof value !== 'string') return [];
  return [...value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').matchAll(TOKEN)]
    .map(([token]) => token);
}

function stem(token) {
  for (const ending of RU_ENDINGS) {
    if (token.length - ending.length >= 3 && token.endsWith(ending)) {
      return token.slice(0, -ending.length);
    }
  }
  return token;
}

function digest(schema, entries) {
  return `sha256:${createHash('sha256').update(canonicalStringify({ schema, entries })).digest('hex')}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function assertEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('needs-check blocker snapshot must contain entries.');
  }
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.queue_id !== 'string' || !entry.queue_id.trim()
      || ids.has(entry.queue_id) || typeof entry.source_ref !== 'string' || !entry.source_ref.trim()
      || typeof entry.reason !== 'string' || !entry.reason.trim()
      || !['anachronism', 'regional_presence', null].includes(entry.doubt_kind)
      || !['name', 'archive_id', 'none'].includes(entry.block_by)
      || typeof entry.block_region !== 'string' || typeof entry.block_period !== 'string'
      || (entry.block_by === 'name' && (entry.doubt_kind !== 'anachronism' || !entry.block_region || !entry.block_period))
      || (entry.block_by === 'none' && entry.doubt_kind === 'anachronism')
      || (entry.block_by === 'archive_id' && (entry.block_region || entry.block_period))
      || !Array.isArray(entry.patterns) || entry.patterns.length === 0
      || !Array.isArray(entry.exceptions)) {
      throw new TypeError('Invalid or duplicate needs-check blocker entry.');
    }
    ids.add(entry.queue_id);
    let hasApplicablePattern = false;
    for (const pattern of entry.patterns) {
      if (!pattern || !LANGUAGES.has(pattern.language)
        || typeof pattern.value !== 'string' || !pattern.value.trim()) {
        throw new TypeError(`Invalid pattern for needs-check entry ${entry.queue_id}.`);
      }
      const alternatives = pattern.value.split('|').map(normalize);
      if (alternatives.some((tokens) => tokens.length === 0)) {
        throw new TypeError(`Empty normalized pattern for needs-check entry ${entry.queue_id}.`);
      }
      hasApplicablePattern ||= alternatives.some((tokens) => tokens.length > 0);
    }
    if (!hasApplicablePattern) throw new TypeError(`Empty normalized pattern for needs-check entry ${entry.queue_id}.`);
    for (const exception of entry.exceptions) {
      if (typeof exception !== 'string' || !exception.trim()) {
        throw new TypeError(`Invalid exception for needs-check entry ${entry.queue_id}.`);
      }
    }
  }
}

function createSnapshot(entries) {
  assertEntries(entries);
  const sorted = entries.map((entry) => ({
    queue_id: entry.queue_id,
    doubt_kind: entry.doubt_kind,
    block_by: entry.block_by,
    block_region: entry.block_region,
    block_period: entry.block_period,
    source_ref: entry.source_ref,
    reason: entry.reason,
    patterns: entry.patterns.map(({ language, value }) => ({ language, value })),
    exceptions: [...entry.exceptions]
  })).sort((left, right) => left.queue_id < right.queue_id ? -1 : left.queue_id > right.queue_id ? 1 : 0);
  return deepFreeze({ schema: SCHEMA, entries: sorted, digest: digest(SCHEMA, sorted) });
}

function validateSnapshot(snapshot) {
  if (snapshot && typeof snapshot === 'object' && VALIDATED.has(snapshot)) return;
  if (!snapshot || snapshot.schema !== SCHEMA || typeof snapshot.digest !== 'string') {
    throw new TypeError('Unsupported or malformed needs-check blocker snapshot.');
  }
  assertEntries(snapshot.entries);
  if (digest(snapshot.schema, snapshot.entries) !== snapshot.digest) {
    throw new TypeError('needs-check blocker snapshot digest mismatch.');
  }
  if (Object.isFrozen(snapshot) && Object.isFrozen(snapshot.entries)
    && snapshot.entries.every((entry) => Object.isFrozen(entry)
      && Object.isFrozen(entry.patterns) && Object.isFrozen(entry.exceptions)
      && entry.patterns.every(Object.isFrozen))) {
    VALIDATED.add(snapshot);
  }
}

function containsSequence(haystack, needle) {
  if (needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((token, offset) => token === haystack[start + offset])) return true;
  }
  return false;
}

function compiledEntries(snapshot) {
  if (COMPILED.has(snapshot)) return COMPILED.get(snapshot);
  const entries = snapshot.entries.map((entry) => ({
    entry,
    patterns: entry.patterns.flatMap(({ language, value }) => value.split('|').map((alternative) => {
      const exactTokens = tokenize(alternative);
      const exact = exactTokens.length === 1 && exactTokens[0].length <= 5;
      return { language, exact, exactTokens, tokens: exactTokens.map(stem) };
    })),
    exceptions: entry.exceptions.map(normalize)
  }));
  if (Object.isFrozen(snapshot)) COMPILED.set(snapshot, entries);
  return entries;
}

function matchesAll({ snapshot, candidate }) {
  validateSnapshot(snapshot);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('candidate must be an object.');
  }
  if (candidate.region !== undefined && candidate.region !== null && typeof candidate.region !== 'string') {
    throw new TypeError('candidate.region must be a string when provided.');
  }
  const values = {
    ru: [candidate.name, candidate.semantic_type, candidate.candidate_hint, candidate.context,
      ...(candidate.aliases_ru ?? [])],
    lat: [candidate.name_lat, candidate.context, ...(candidate.lat_synonyms ?? [])],
    id: [candidate.id, ...(Array.isArray(candidate.ids) ? candidate.ids : [])]
  };
  const normalizedValues = Object.fromEntries(Object.entries(values).map(([language, items]) => [
    language, items.filter((value) => typeof value === 'string')
      .map(normalize).filter((tokens) => tokens.length > 0)
  ]));
  const exactValues = Object.fromEntries(Object.entries(values).map(([language, items]) => [
    language, items.filter((value) => typeof value === 'string')
      .map(tokenize).filter((tokens) => tokens.length > 0)
  ]));
  const hits = [];
  for (const compiled of compiledEntries(snapshot)) {
    const { entry } = compiled;
    if (entry.block_by === 'none') continue;
    if (entry.block_by === 'name' && candidate.region && candidate.region !== entry.block_region) continue;
    const excluded = compiled.exceptions.some((tokens) => tokens.length > 0
      && Object.values(normalizedValues).flat().some((value) => containsSequence(value, tokens)));
    if (excluded) continue;
    for (const pattern of compiled.patterns) {
      if (entry.block_by === 'archive_id' && pattern.language !== 'id') continue;
      if (entry.block_by === 'name' && pattern.language === 'id' && candidate.source_kind !== 'entity') continue;
      const tokens = pattern.exact ? pattern.exactTokens : pattern.tokens;
      const values = pattern.exact ? exactValues[pattern.language] : normalizedValues[pattern.language];
      if (tokens.length > 0 && values
        .some((value) => containsSequence(value, tokens))) {
        hits.push(Object.freeze({ queue_id: entry.queue_id, doubt_kind: entry.doubt_kind,
          block_by: entry.block_by, block_region: entry.block_region, block_period: entry.block_period,
          reason: entry.reason }));
        break;
      }
    }
  }
  return Object.freeze(hits);
}

function matches(input) {
  return matchesAll(input)[0] ?? null;
}

export const NEEDS_CHECK_BLOCKER = Object.freeze({
  createSnapshot,
  matchesAll,
  matches,
  validateSnapshot
});
