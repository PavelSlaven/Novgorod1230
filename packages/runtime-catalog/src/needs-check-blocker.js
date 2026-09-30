import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-records.js';

const SCHEMA = 'rus.needs_check_blockers.v1';
const LANGUAGES = new Set(['ru', 'lat', 'id']);
const SCOPE = /^[a-z0-9][a-z0-9._/-]*$/u;
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
  return [...value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').matchAll(TOKEN)]
    .map(([token]) => stem(token));
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
      || typeof entry.scope !== 'string' || !SCOPE.test(entry.scope)
      || !['name', 'archive_id'].includes(entry.block_by)
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
    block_by: entry.block_by,
    scope: entry.scope,
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
    patterns: entry.patterns.flatMap(({ language, value }) => value.split('|').map((alternative) => ({ language, tokens: normalize(alternative) }))),
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
  const scope = candidate.scope ?? 'global';
  if (typeof scope !== 'string' || !SCOPE.test(scope)) {
    throw new TypeError('candidate.scope must be a valid scope.');
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
  const hits = [];
  for (const compiled of compiledEntries(snapshot)) {
    const { entry } = compiled;
    if (candidate.scope && candidate.scope !== 'global' && entry.scope !== 'global' && scope !== entry.scope) continue;
    const excluded = compiled.exceptions.some((tokens) => tokens.length > 0
      && Object.values(normalizedValues).flat().some((value) => containsSequence(value, tokens)));
    if (excluded) continue;
    for (const pattern of compiled.patterns) {
      if (entry.block_by === 'archive_id' && pattern.language !== 'id') continue;
      if (entry.block_by === 'name' && pattern.language === 'id') continue;
      const { tokens } = pattern;
      if (tokens.length > 0 && normalizedValues[pattern.language]
        .some((value) => containsSequence(value, tokens))) {
        hits.push(Object.freeze({ queue_id: entry.queue_id, block_by: entry.block_by, scope: entry.scope, reason: entry.reason }));
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
