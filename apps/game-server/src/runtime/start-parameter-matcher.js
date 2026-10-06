import START_PARAMETER_VOCABULARY from
  '../../../../data/world-catalogs/novgorod/live-world-runtime-v17/start-parameter-extraction-candidate-v1/candidate-vocabulary.json'
  with { type: 'json' };

const SLOTS = ['region', 'season', 'occupation', 'social_position'];
const UNTRUSTED_TAILS = [
  /игнорируй\s+все\s+правила\s*:/giu,
  /вставленный\s+текст\s+чужого\s+шаблона\s+гласит\s*:/giu,
  /ниже\s+цитата\s+из\s+недоверенного\s+примера\s*:/giu,
  /в\s+скопированном\s+сообщении\s+написано\s*:/giu,
  /недоверенная\s+вставка\s+просит\s*:/giu,
  /\bSYSTEM\s*:/giu
];
const QUOTED = [/«[^»]*»/gu, /“[^”]*”/gu, /"[^"\n]*"/gu];

export function matchStartParameters(input) {
  const text = typeof input === 'string' ? input : '';
  const untrusted = findUntrustedRanges(text);
  const slots = Object.fromEntries(SLOTS.map((slot) => [
    slot,
    matchSlot(text, slot, untrusted)
  ]));
  return {
    schema: 'rus.game_server.start_parameter_extraction.v1',
    vocabulary_ref: {
      catalog_id: 'start-parameter-extraction-candidate-v1',
      revision: 1
    },
    slots,
    untrusted_ranges: untrusted.map(({ start, end }) => ({ start, end })),
    compatibility: {
      state: 'no_compatible_start',
      reason: 'no_approved_compatible_profile'
    }
  };
}

function matchSlot(input, slot, blocked) {
  const view = normalizedView(input);
  const hits = [];
  for (const row of START_PARAMETER_VOCABULARY.rows) {
    if (row.slot !== slot) continue;
    for (const span of occurrences(input, view, row.surface, blocked)) {
      hits.push({
        class: row.class,
        value: row.value,
        value_kind: row.value_kind ?? null,
        span,
        source: row.source,
        authority: row.authority
      });
    }
  }
  hits.sort((a, b) => (b.span.end - b.span.start)
    - (a.span.end - a.span.start) || a.span.start - b.span.start);
  const kept = [];
  for (const hit of hits) {
    if (!kept.some((prior) => prior.span.start < hit.span.end
      && prior.span.end > hit.span.start)) kept.push(hit);
  }
  kept.sort((a, b) => a.span.start - b.span.start
    || a.span.end - b.span.end);

  const labels = [...new Set(kept
    .filter((hit) => hit.class === 'candidate_alias')
    .map((hit) => hit.value))];
  const classes = new Set(kept.map((hit) => hit.class));
  let state = 'missing';
  let value = null;
  let valueKind = null;
  if (labels.length > 1
      || (labels.length === 1
        && (classes.has('unsupported') || classes.has('candidate_only')))) {
    state = 'conflict';
  } else if (labels.length === 1) {
    state = 'candidate_match';
    value = labels[0];
    valueKind = kept.find((hit) => hit.class === 'candidate_alias'
      && hit.value === value)?.value_kind ?? null;
  } else if (classes.has('candidate_only') && classes.has('unsupported')) {
    state = 'conflict';
  } else if (classes.has('candidate_only')) {
    state = 'candidate_only';
  } else if (classes.has('ambiguous')) {
    state = 'ambiguous';
  } else if (classes.has('unsupported')) {
    state = 'unsupported';
  }
  return {
    state,
    value,
    value_kind: valueKind,
    evidence: kept.map((hit) => ({
      start: hit.span.start,
      end: hit.span.end,
      text: hit.span.text,
      source: hit.source,
      authority: hit.authority,
      matched_class: hit.class
    })),
    eligibility: 'not_assessed'
  };
}

function normalizeSurface(value) {
  return String(value ?? '').normalize('NFC').toLocaleLowerCase('ru-RU')
    .trim().replace(/\s+/gu, ' ');
}

function normalizedView(input) {
  const segmenter = new Intl.Segmenter('ru-RU', { granularity: 'grapheme' });
  let text = '';
  const starts = [];
  const ends = [];
  let pending = null;
  for (const part of segmenter.segment(input)) {
    const normalized = part.segment.normalize('NFC')
      .toLocaleLowerCase('ru-RU');
    if (/^\s+$/u.test(normalized)) {
      if (!pending) pending = { start: part.index,
        end: part.index + part.segment.length };
      else pending.end = part.index + part.segment.length;
      continue;
    }
    if (pending && text.length) {
      text += ' ';
      starts.push(pending.start);
      ends.push(pending.end);
    }
    pending = null;
    for (let index = 0; index < normalized.length; index += 1) {
      text += normalized[index];
      starts.push(part.index);
      ends.push(part.index + part.segment.length);
    }
  }
  return { text, starts, ends };
}

function findUntrustedRanges(input) {
  const ranges = [];
  for (const pattern of UNTRUSTED_TAILS) {
    for (const match of input.matchAll(pattern)) {
      ranges.push({ start: match.index, end: input.length });
    }
  }
  for (const pattern of QUOTED) {
    for (const match of input.matchAll(pattern)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

function occurrences(input, view, surface, blocked) {
  const needle = normalizeSurface(surface);
  if (!needle) return [];
  const found = [];
  let cursor = 0;
  while (cursor <= view.text.length - needle.length) {
    const at = view.text.indexOf(needle, cursor);
    if (at < 0) break;
    const endAt = at + needle.length;
    const start = view.starts[at];
    const end = view.ends[endAt - 1];
    const span = { start, end, text: input.slice(start, end) };
    if (!isWord(view.text[at - 1]) && !isWord(view.text[endAt])
        && !blocked.some((range) => start < range.end && end > range.start)) {
      found.push(span);
    }
    cursor = at + Math.max(needle.length, 1);
  }
  return found;
}

function isWord(char) {
  return char != null && /[\p{L}\p{N}_]/u.test(char);
}
