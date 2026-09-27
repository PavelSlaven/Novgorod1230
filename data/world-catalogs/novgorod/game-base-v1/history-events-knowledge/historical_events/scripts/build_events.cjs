// Deterministic extraction: novgorod_historical_timeline_1230_1250_v1.json (draft LLM, v6 map)
// -> events.csv + event_phases.csv (candidate), checked since the 2026-09-26 rework pass against verified book evidence
// (servak:/srv/novgorod-work/data/books/evidence/history-events-knowledge.csv).
// .cjs: package.json at repo root sets "type": "module"; this script uses require() and must keep the
// .cjs extension so Node runs it as CommonJS (fix 2026-09-26, see VERIFICATION.md).
const fs = require('fs');
const path = require('path');

const GROUP_ROOT = path.resolve(__dirname, '../..');
const TIMELINE = process.argv[2] || path.resolve(GROUP_ROOT, '../../sources/nov-region-audit-v1/novgorod_historical_timeline_1230_1250_v1.json');
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '..');

const d = JSON.parse(fs.readFileSync(TIMELINE, 'utf8'));

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  if (/[",;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function writeCsv(file, header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => csvEsc(r[h])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

// 2026-09-26 rework: the old confidence-B upgrade matched *any* phase in years 1229-1231 against sqlite
// events by shared keyword stems, regardless of whether the matched sqlite row actually supported that
// specific phase's content (VERIFICATION.md, event_phases.csv items 4 and 6: wrong refs for
// nov_hist_1231_002/1230_002/1230_004, and only "14% фаз — совпадение ключевых слов" overall, not a real
// line-by-line check). That heuristic is removed. Instead, confidence=B is granted only to the 5 events
// below, whose entire phase set was individually checked (in this pass) against specific, cited rows of
// the verified book evidence file — not a keyword match. Every other event stays confidence=C with an
// honest audit_note. Extending this book-evidence verification to the remaining 30 events is out of scope
// for this fix (see VERIFICATION.md "Что требуется для доведения" — full НПЛ line-by-line audit, ~86%
// remaining, is a separate follow-up with its own budget).
const bookVerifiedEvents = {
  nov_hist_1230_001: [
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶486 (землетрясение 3 мая, солнечное затмение 14 мая, приход Спиридона 19 мая 1230)',
  ],
  nov_hist_1230_002: [
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶486 (распря Степана Твердиславича с Иваном Тимошкиничем и посадника Внезда Водовика; вече, разграбление двора)',
    'book:301539 §ПРОДОЛЖЕНИЕ МЕЖДОУСОБИЙ ¶4365 (Иванко убит и брошен в Волхов)',
  ],
  nov_hist_1230_003: [
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶486 (14 сент. 1230 мороз побил озими, цены поднялись)',
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶487 (1231: голод и мор, приезд немцев с хлебом)',
  ],
  nov_hist_1230_004: [
    'book:301539 §ПРОДОЛЖЕНИЕ МЕЖДОУСОБИЙ ¶4366 (8 дек. 1230 Водовик с Ростиславом ушёл в Торжок; на другой день в Новгороде убит Семён Борисович, разграблены дворы Водовика и сторонников)',
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶486 (тысяцкий Борис бежал с Водовиком из Торжка в Чернигов; возвращение Ярослава 30 дек. 1230)',
  ],
  nov_hist_1231_002: [
    'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶487 (бывший посадник Водовик умер в Чернигове в 1231 г.)',
    'book:301539 §ПРОДОЛЖЕНИЕ МЕЖДОУСОБИЙ ¶4370 (осенью Ярослав с Константиновичами пожгли Шеренск и осадили Мосальск)',
  ],
};

// draft summary/historical_context/market goods_affected/needs_review fields were collected but dropped
// by the old script (VERIFICATION.md, event_phases.csv items 1-2). Restore them.
const eventMap = new Map(); // ev_id -> first-seen metadata
const phaseRows = [];
let bookVerifiedCount = 0;
const correctedEvents = {
  nov_hist_1230_004: { title: 'Расправа в Новгороде, бегство в Торжок и возвращение Ярослава', chronicle: '8 декабря Водовик и Ростислав уехали в Торжок; 9 декабря Семён Борисович убит в Новгороде; 30 декабря вернулся Ярослав' },
  nov_hist_1243_001: { title: 'Смерть Варлаама (Вячеслава Прокшинича) и погребение на Хутыни', chronicle: '4 мая 1243 умер Варлаам, в миру Вячеслав Прокшинич, погребён на Хутыни', source: 'book:667380 §Приложение 2 ¶499' },
  nov_hist_1242_002: { title: 'Поездка Ярослава к Батыю в 1243 году', chronicle: 'В 1243 году Батый вручил Ярославу ярлык на старшинство', source: 'book:220871 §Новгород во времена Александра Невского ¶393' },
  nov_hist_1245_001: { title: 'Казнь Михаила Черниговского в 1246 году', chronicle: 'В 1246 году казнён Михаил Черниговский', source: 'book:378072 §Домонгольская Русь > Русские князья и междоусобные войны > Черниговские, новгород-северские, полоцкие князья ¶274' },
};
const phaseOrder = ['background', 'omens', 'escalation', 'impact', 'aftermath'];

for (const p of d.timeline) {
  if (!eventMap.has(p.event_id)) {
    eventMap.set(p.event_id, {
      ev_id: p.event_id,
      year: p.year,
      event_type: p.event_type,
      event_title: p.event_title,
      first_phase_id: p.phase_id,
      sources: (p.sources || []).map(s => s.title).join(' | '),
    });
  }
  const rumors = (p.rumors || []).map(r => r.rumor_text).join(' / ');
  const roads = p.road_effects ? p.road_effects.summary : '';
  const market = p.market_effects ? p.market_effects.summary : '';
  const power = p.authority_effects ? p.authority_effects.summary : '';
  const npc = p.npc_effects ? JSON.stringify(p.npc_effects) : '';
  const items = p.item_and_property_effects ? p.item_and_property_effects.summary : '';
  const nodeRefsV6 = (p.map_bindings || []).map(b => b.node_id).join('|');
  const chronicleRaw = p.source_date ? p.source_date.raw : '';
  const sourceRefs = (p.sources || []).map(s => s.source_id).join('|');

  const bookRefs = bookVerifiedEvents[p.event_id];
  let confidence = 'C'; // default: draft LLM, not book-line-verified in this pass
  // 2026-09-26: chronicle_ref no longer claims to be a literal quotation. `source_date.raw` in the draft
  // is an English paraphrase written by the draft's LLM pass, not a quoted line from the Michell & Forbes
  // 1914 translation or a page/article reference (VERIFICATION.md, event_phases.csv item 5).
  let chronicleRef = chronicleRaw
    ? `черновой пересказ LLM (не цитата издания и не ссылка на статью/страницу): "${chronicleRaw}"`
    : 'нет даже чернового пересказа в источнике';
  let bookRefNote = '';
  if (bookRefs) {
    confidence = 'B';
    bookVerifiedCount++;
    bookRefNote = bookRefs.join(';');
  }

  const needsReview = p.status === 'needs_review';
  const needsReviewNote = needsReview ? (p.audit_notes || []).join(' ') : '';
  const corrected = correctedEvents[p.event_id];
  const phaseIndex = phaseOrder.indexOf(p.phase);
  let dateRange = p.assigned_game_datetime || '';
  let seasonRange = p.season_range || '';
  if (p.event_id === 'nov_hist_1231_002' && phaseIndex >= 0) {
    dateRange = '1231';
    seasonRange = 'autumn';
  }
  if (p.event_id === 'nov_hist_1242_002') {
    dateRange = '1243';
    seasonRange = '';
  }
  if (p.event_id === 'nov_hist_1245_001') {
    dateRange = p.phase === 'impact' ? '1246-09-20' : '1246';
    seasonRange = p.phase === 'impact' ? 'autumn' : '';
  }
  if (p.event_id === 'nov_hist_1230_003' && p.phase === 'background') {
    dateRange = '1230-09-14' + dateRange.slice(10);
    seasonRange = 'autumn';
  }
  if (p.event_id === 'nov_hist_1230_003' && p.phase === 'aftermath') {
    dateRange = '1231';
    seasonRange = '';
  }

  phaseRows.push({
    ev_id: p.event_id,
    phase_id: p.phase_id,
    date_range: dateRange,
    is_game_time_anchor: dateRange.includes('T') ? (p.assigned_datetime_is_game_anchor ? 'true' : 'false') : 'false',
    season_range: seasonRange,
    event_type: p.event_type,
    phase: p.phase,
    event_title: corrected ? corrected.title : p.event_title,
    summary: corrected ? corrected.chronicle : (p.event_id === 'nov_hist_1230_003' && p.phase === 'aftermath' ? 'В 1231 году немцы привезли в Новгород хлеб; точный день и месяц не известны.' : p.summary || ''),
    historical_context: corrected ? corrected.chronicle : p.historical_context || '',
    visible_signs: (p.visible_signs || []).join('|'),
    rumors: rumors,
    effect_roads: roads,
    effect_market: market,
    market_goods_affected: (p.market_effects && p.market_effects.goods_affected || []).join('|'),
    regions_affected: JSON.stringify(p.regions_affected || []),
    effect_power: power,
    effect_npc: npc,
    effect_items: items,
    player_knowable: (p.allowed_player_knowledge || []).join('|'),
    forbidden_knowledge: (p.forbidden_player_knowledge || []).join('|'),
    node_refs_v6: nodeRefsV6,
    node_refs_v17: '', // GAP: v6->v17 G2/G3/G4 id mapping not built in this pass (~11k v6 nodes; needs place_names/spatial owner)
    chronicle_ref: corrected ? `уточнение по книжному свидетельству: ${corrected.chronicle}${p.event_id === 'nov_hist_1245_001' && p.phase === 'impact' ? '; no_source: точный день 20.09 не подтверждён этим свидетельством' : ''}` : chronicleRef,
    source_refs: sourceRefs + (bookRefNote ? ('|' + bookRefNote) : '') + (corrected && corrected.source ? ('|' + corrected.source) : '') + (p.event_id === 'nov_hist_1245_001' && p.phase === 'impact' ? '|no_source: точный день 20.09' : ''),
    confidence: confidence,
    status: 'candidate',
    needs_review: needsReview ? 'true' : 'false',
    needs_review_note: needsReviewNote,
    audit_note: bookRefs
      ? 'построчно сверено с книжными свидетельствами группы (servak history-events-knowledge.csv) в проходе 2026-09-26, см. source_refs'
      : 'не сверено построчно с текстом НПЛ ни по sqlite, ни по книжным свидетельствам в этом проходе; требует полного аудита (см. README gaps)',
  });
}

// ¶487 and ¶186 date these distinct late consequences only to the source year 1231.
// Do not turn a year-level attestation into an invented spring day.
const famineAftermath = phaseRows.find(r => r.phase_id === 'nov_hist_1230_003_aftermath');
if (famineAftermath) {
  Object.assign(famineAftermath, {
    phase: 'german_bread_1231',
    summary: 'В 1231 году немцы привезли в Новгород хлеб; точный день и месяц не известны.',
    chronicle_ref: 'book:667380 ¶487: приезд немцев с хлебом в 1231 году',
    source_refs: famineAftermath.source_refs + '|book:667380 ¶487',
  });
  for (const [suffix, summary, ref] of [
    ['mortality_1231', 'Голод и мор продолжались в 1231 году; точный день и месяц не известны.', 'book:667380 ¶487'],
    ['skudelnitsa_1231', 'В 1231 году появились вторая и третья скудельницы; точный день и месяц не известны.', 'book:556930 ¶186'],
  ]) {
    phaseRows.push({ ...famineAftermath, phase_id: `nov_hist_1230_003_${suffix}`, phase: suffix,
      summary, historical_context: summary, visible_signs: '', rumors: '', effect_roads: '',
      effect_market: '', market_goods_affected: '', effect_power: '', effect_npc: '', effect_items: '',
      player_knowable: '', forbidden_knowledge: '', chronicle_ref: `${ref}: ${summary}`,
      source_refs: ref, audit_note: 'Событие датировано источником только 1231 годом; точный день и месяц не установлены.' });
  }
}

const eventRows = [...eventMap.values()].map(e => ({
  ev_id: e.ev_id,
  year: e.year,
  event_type: e.event_type,
  event_title: e.event_title,
  first_phase_id: e.first_phase_id,
  source_titles: e.sources,
  status: 'candidate',
  confidence: 'C',
}));

fs.mkdirSync(OUT_DIR, { recursive: true });
writeCsv(path.join(OUT_DIR, 'events.csv'),
  ['ev_id', 'year', 'event_type', 'event_title', 'first_phase_id', 'source_titles', 'status', 'confidence'],
  eventRows);
writeCsv(path.join(OUT_DIR, 'event_phases.csv'),
  ['ev_id', 'phase_id', 'date_range', 'is_game_time_anchor', 'season_range', 'event_type', 'phase', 'event_title',
   'summary', 'historical_context', 'visible_signs', 'rumors',
   'effect_roads', 'effect_market', 'market_goods_affected', 'regions_affected', 'effect_power', 'effect_npc', 'effect_items',
   'player_knowable', 'forbidden_knowledge', 'node_refs_v6', 'node_refs_v17', 'chronicle_ref', 'source_refs',
   'confidence', 'status', 'needs_review', 'needs_review_note', 'audit_note'],
  phaseRows);

console.log('events.csv rows:', eventRows.length);
console.log('event_phases.csv rows:', phaseRows.length);
console.log('book-evidence-verified against servak history-events-knowledge.csv (confidence B):', bookVerifiedCount);
