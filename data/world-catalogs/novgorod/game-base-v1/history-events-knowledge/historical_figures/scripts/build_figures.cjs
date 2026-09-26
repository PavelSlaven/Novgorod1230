// Merge sqlite novgorod_1230(1).persons_1230 (chronicle-attested, confidence A, NPL S01)
// with rus13tpl novgorod_key_npc_seeds_v1 historical_key_npc_profiles (draft, mixed confidence)
// into historical_figures.csv (authority records only; LLM must not invent new persons).
// .cjs: package.json at repo root sets "type": "module"; this script uses require() and must
// keep the .cjs extension so Node runs it as CommonJS (fix 2026-09-26, see VERIFICATION.md).
const fs = require('fs');
const path = require('path');

const SQLITE_DUMP = process.argv[2];
const STATUS_RULES = process.argv[3];
const OUT_DIR = process.argv[4];
// Optional 5th arg: book evidence CSV (history-events-knowledge.csv from servak:/srv/novgorod-work/data/books/evidence/),
// used only to attach book:<id> §<section_path> ¶<para_no> citations for rows fixed in the 2026-09-26 rework pass.
const BOOK_EVIDENCE = process.argv[5];

const sq = JSON.parse(fs.readFileSync(SQLITE_DUMP, 'utf8'));
const sr = JSON.parse(fs.readFileSync(STATUS_RULES, 'utf8'));

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

// sqlite persons_1230: R01..R14, all confidence A, sources S01 (НПЛ, Насонов 1950).
// Map to unified rows. office_start/end are deliberately coarse (year-level, 1230-01-01..1230-12-31)
// unless the period_1230 text gives an exact day (parsed below); the table covers the 1229-12..1231 window only.
const monthMap = { 'января':'01','февраля':'02','марта':'03','апреля':'04','мая':'05','июня':'06','июля':'07','августа':'08','сентября':'09','октября':'10','ноября':'11','декабря':'12' };
function parseDay(text, prefixRe) {
  const m = text.match(prefixRe);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const mon = monthMap[m[2]];
  const year = m[3];
  return mon ? `${year}-${mon}-${day}` : null;
}
// 2026-09-26 fix: a period_1230 text can give a month+year with no day ("с декабря 1230"); the old
// regex required a day and silently fell back to 1230-01-01, losing the month (see VERIFICATION.md,
// figures.csv item 4, hf_sql_r09). Try the day-level pattern first, then this month-only one (day=01).
function parseMonthOnly(text, prefixRe) {
  const m = text.match(prefixRe);
  if (!m) return null;
  const mon = monthMap[m[1]];
  const year = m[2];
  return mon ? `${year}-${mon}-01` : null;
}
function deriveWindow(periodText) {
  const startExact = parseDay(periodText, /с\s+(\d{1,2})\s+([а-я]+)\s+(\d{4})/i)
    || parseMonthOnly(periodText, /с\s+([а-я]+)\s+(\d{4})/i);
  const endExact = parseDay(periodText, /до\s+(\d{1,2})[–—-]?\d{0,2}\s+([а-я]+)\s+(\d{4})/i)
    || parseMonthOnly(periodText, /до\s+([а-я]+)\s+(\d{4})/i);
  return {
    start: startExact || '1230-01-01',
    end: endExact || '1230-12-31',
  };
}
// Manual overrides, 2026-09-26 rework pass (see VERIFICATION.md "Исправления 2026-09-26" for the
// per-row rationale). Each replaces an invented exact date or a wrongly-extended draft window with a
// dated fact from the verified book evidence (servak history-events-knowledge.csv), or — where the
// evidence gives only a year — an honest coarse window instead of a fabricated day.
const windowOverrides = {
  // Verifier: "office_end 1230-06-30 invented; source says начало 1230". The exact day was invented,
  // but sqlite.events (confidence A, S01) does give a real — if two-month-wide — range for the
  // departure itself: "1230-05/06: Постриг Ростислава и отъезд Михаила". Keep the upper bound as the
  // coarse end (not a claim of an exact day) and say so explicitly in the note.
  R01: {
    end: '1230-06-30',
    note: 'office_end — верхняя граница диапазона "1230-05/06" ("Постриг Ростислава и отъезд Михаила", sqlite novgorod_1230(1).events, confidence A, S01), не утверждённый точный день (в отличие от прежней версии, где 1230-06-30 стоял без этой оговорки). period_1230 отдельно даёт более грубое "Начало 1230". Сын Ростислав (R02) остаётся номинальным князем до 8 дек. 1230 отдельным окном.',
  },
  // Verifier: office_end extended by dedupe to 1246-12-31 (Yaroslav's death year), conflicting with the
  // Novgorod-reign window (1231-1236) already used in po_vladimir_suzdal_principality of this same group.
  R03: {
    end: '1236-12-31',
    note: 'office_end скорректирован с 1246-12-31 (год смерти, ошибочно взятый как конец новгородского княжения) на 1236-12-31: книжные свидетельства (book:378072 §Нашествие иноземцев ¶464 "князь новгородский с 1236" — про сына Александра) и книжные свидетельства (book:566840 §Хронологическая таблица ¶1878 "4-е княжение в Новгороде с 30 дек. 1230") согласуются с окном 1230-12-30..1236, тем же, что в polities_external_relations этой группы. После 1236 г. Ярослав остаётся великим князем Владимирским/старшим князем, но не резидентным новгородским князем — это отдельная роль, не описанная этой строкой.',
  },
  // Verifier: sqlite/period text gives only "конец 1230"; book evidence (566840 ¶1879) gives a specific
  // month for the sons' arrival as намеcтники — January 1231, one month later than the draft text.
  R04: {
    start: '1231-01-01',
    end: '1233-06-10',
    note: 'office_start скорректирован с 1230-01-01 ("конец 1230" в period_1230 не давало точного дня) на 1231-01-01 по book:566840 §Хронологическая таблица ¶1879 ("в январе 1231 княжичи прибыли в Новгород как наместники"). office_end сужен с 1233-12-31 до точной даты смерти 1233-06-10 (book:667380 §Приложение 2 ¶489 "старший сын Ярослава Фёдор скончался 10 июня 1233 г."; book:566840 §Хронологическая таблица ¶1890).',
  },
  R05: {
    start: '1231-01-01',
    note: 'office_start скорректирован с 1230-01-01 на 1231-01-01 тем же основанием, что и у Фёдора (R04): book:566840 §Хронологическая таблица ¶1879 датирует прибытие княжичей-наместников январём 1231, а не "концом 1230" из period_1230.',
  },
  // Verifier: dedupe from draft years "1230-1240-е" parsed only 4-digit years, giving 1240-12-31 —
  // Stepan Tverdislavich died in office 16.08.1243, not in 1240.
  R08: {
    end: '1243-08-16',
    note: 'office_end скорректирован с 1240-12-31 (артефакт парсинга "1240-е" из draft) на дату смерти в должности 16.08.1243 — book:667380 §Приложение 2 ¶499 "скончался 16 авг. 1243; посадничал без трёх месяцев 13 лет"; book:378072 §Нашествие иноземцев ¶478 "ум. 16.08.1243; посадник 1230–1243".',
  },
  R09: {
    start: '1230-12-09',
    note: 'office_start скорректирован с 1230-01-01 на 1230-12-09 (не 1230-12-01: точный день месяца в period_1230 "с декабря 1230" не дан, но sqlite.events, confidence A, S01, датирует смену власти "1230-12: Степан — посадник, Микита — тысяцкий" тем же днём, что назначение Степана посадником — 9 дек. 1230, тем же днём кончается тысяцкое предшественника hf_book_boris_negochevich); согласуется с book:667380 §Приложение 2 ¶486.',
  },
};
const sqRows = sq.persons_1230.map(p => {
  const w = deriveWindow(p.period_1230);
  const override = windowOverrides[p.id];
  let note = '';
  if (override) {
    if (override.start) w.start = override.start;
    if (override.end) w.end = override.end;
    note = override.note;
  }
  return {
  hf_id: 'hf_sql_' + p.id.toLowerCase(),
  name_ru: p.name,
  office: p.role,
  office_start: w.start,
  office_end: w.end,
  period_note: p.period_1230,
  event_refs: '',
  location_refs: 'Новгород',
  significance: p.action,
  source_refs: 'НПЛ (Насонов 1950; Michell & Forbes 1914) via sqlite novgorod_1230(1).persons_1230[' + p.id + '], sources=' + p.sources,
  confidence: p.confidence,
  status: 'candidate',
  note: note,
  };
});

// draft key NPC profiles (12), cross-deduped against sqlite where the same person appears.
const dedupeByNamePrefix = {
  'Ярослав Всеволодович': 'hf_sql_r03',
  'Фёдор Ярославич': 'hf_sql_r04',
  'Александр Ярославич': 'hf_sql_r05',
  'Спиридон': 'hf_sql_r06',
  'Степан Твердиславич': 'hf_sql_r08',
};

// 2026-09-26 rework: per-figure corrections for the 7 non-deduped draft rows (anachronism / unfounded
// window / mislabeled generic citation — see VERIFICATION.md figures.csv items 6-8). Applied after the
// generic draft mapping below; `null` in a field means "leave the generically-derived value".
const draftOverrides = {
  hist_npc_batu_khan: {
    office_end: '', // was 1243-12-31: he ruled well past 1243 (traditionally to c1255/56); exact end not in this group's book evidence.
    source_refs: 'rus13tpl novgorod_key_npc_seeds_v1.json (draft, requires_human_historical_audit); книжные свидетельства группы датируют только отдельные факты: book:378072 §Хронология ¶861 "7 февраля 1238 Батый взял Владимир"; book:220871 §Новгород во времена Александра Невского ¶393 "1243: Батый вручил Ярославу ярлык на старшинство среди русских князей"',
    note: 'office_end очищен (было 1243-12-31 — придуманная граница правления). 1237-1243 в этой строке — только диапазон, засвидетельствованный для взаимодействия с Новгородской землёй в книжных свидетельствах этой группы; общая дата смерти хана (~1255/56) в этом проходе не подтверждена постраничной цитатой и не вписана как точная.',
  },
  hist_npc_birger_magnusson: {
    office: 'шведский полководец (титул ярла получил не ранее 1248 г.)',
    note: 'АНАХРОНИЗМ ИСПРАВЛЕН: строка называла Биргера «шведским ярлом» на 1240 г.; ярлом он стал не ранее 1248 г. (после 1240 г.), поэтому в эту роль для 1240 г. не годится. Его личное участие в Невской битве 1240 г. остаётся спорным (source_note черновика: "участие Биргера в событиях 1240 года дискуссионно; нужен аудит") — не утверждать как факт.',
  },
  hist_npc_dalmat_archbishop: {
    note: 'office_start (1249-01-01) — грубое годовое размещение, а не установленная точная дата: точный месяц смены владыки после Спиридона в этом проходе не найден (source_note черновика: "хронология новгородских архиепископов; требует ручной сверки точных дат перехода"). Пересечение со Спиридоном (см. README ограничения этого домена) — известный переходный артефакт, не ошибка данных.',
  },
};

const draftRows = [];
for (const p of sr.historical_key_npc_profiles) {
  const dupTarget = dedupeByNamePrefix[p.name];
  const years = (p.years_relevant_to_region || []).join(';');
  const yearMatch = years.match(/(\d{4})/g) || [];
  const startY = yearMatch[0] || '';
  const endY = yearMatch[yearMatch.length - 1] || startY;
  if (dupTarget) {
    // Extend the sqlite row's coverage window using the draft's broader years, keep sqlite as primary confidence A record.
    const target = sqRows.find(r => r.hf_id === dupTarget);
    const override = windowOverrides[dupTarget.replace('hf_sql_', '').toUpperCase()];
    if (target && !(override && override.end)) {
      // Only apply the draft-year extension when a 2026-09-26 book-sourced override hasn't already fixed office_end.
      target.office_end = endY ? (endY + '-12-31') : target.office_end;
    }
    if (target) {
      target.note = (target.note + ' | расширение окна по draft rus13tpl novgorod_key_npc_seeds_v1: ' + p.historical_npc_id + ' (' + years + ')').trim();
    }
    continue;
  }
  const isConflict = p.historical_npc_id === 'hist_npc_mikhail_stepanich';
  const override = draftOverrides[p.historical_npc_id] || {};
  const genericSourceRefs = 'rus13tpl novgorod_key_npc_seeds_v1.json (draft, requires_human_historical_audit) — не найдено постраничной цитаты в книжных свидетельствах группы history-events-knowledge (servak history-events-knowledge.csv) в проходе 2026-09-26; source_note черновика: "' + (p.source_note || '') + '"';
  draftRows.push({
    hf_id: 'hf_draft_' + p.historical_npc_id,
    name_ru: p.name,
    office: override.office || (p.titles_or_roles || []).join(' | '),
    office_start: startY ? startY + '-01-01' : '',
    office_end: 'office_end' in override ? override.office_end : (endY ? endY + '-12-31' : ''),
    period_note: years,
    event_refs: '',
    location_refs: p.relationship_to_novgorod || '',
    significance: p.known_historical_context || '',
    source_refs: override.source_refs || genericSourceRefs,
    confidence: isConflict ? 'D' : 'C',
    status: isConflict ? 'candidate-conflict' : 'candidate',
    note: isConflict
      ? 'КОНФЛИКТ: окно 1230-1250 как посадник перекрывает Внезда Водовика (до 1230-12-08) и Степана Твердиславича (с 1230-12-09), которые в НПЛ (S01, confidence A) занимают эту должность в эти годы. По стандартной посадничьей хронологии (Янин) в этом окне отдельного «Михаила Степанича» нет; вероятная ошибка исходного draft rus13tpl novgorod_key_npc_seeds_v1. Не утверждать без ручной проверки, кандидат на удаление.'
      : (override.note || (/осторожно|требует|спорн/i.test((p.relationship_to_novgorod || '') + ' ' + (p.known_historical_context || '') + ' ' + (p.source_note || '')) ? 'источник сам отмечает неопределённость/спорность — см. relationship_to_novgorod/known_historical_context/source_note черновика' : '')),
  });
}

// 2026-09-26 rework: two figures required by VERIFICATION.md ("что требуется для доведения") that
// neither sqlite.persons_1230 nor the draft seeds cover, but that the verified book evidence attests
// directly — added here, sourced, not invented. See VERIFICATION.md "Исправления 2026-09-26".
const addedRows = [
  {
    hf_id: 'hf_book_boris_negochevich',
    name_ru: 'Борис (Негочевич)',
    office: 'тысяцкий (предшественник Микиты Петриловича)',
    office_start: '1228-01-01',
    office_end: '1230-12-08',
    period_note: 'избран тысяцким в 1228 г.; бежал с Внездом Водовиком в Чернигов 8 дек. 1230',
    event_refs: '',
    location_refs: 'Новгород',
    significance: 'Тысяцкий михайловской/водовиковской партии; бежал в Чернигов вместе с посадником Внездом Водовиком после падения его партии, тысяцкое досталось Миките Петриловичу.',
    source_refs: 'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶486 "тысяцкий Борис бежал в 1230 г. с Водовиком из Торжка в Чернигов"; book:301539 §ПРОДОЛЖЕНИЕ МЕЖДОУСОБИЙ ¶4366; book:566839 §Глава II Русь и Ливония ¶648 "избран тысяцким в 1228 г. вместо Вячеслава"',
    confidence: 'B',
    status: 'candidate',
    note: 'Добавлен по требованию VERIFICATION.md (2026-09-26): предшественник hf_sql_r09 (Микита Петрилович), не покрыт sqlite.persons_1230 (окно той таблицы — 1229-12..1231, срез на момент смены власти). Другая книжная запись (book:566839 ¶661: "бывший посадник (1219) убит 9 дек. 1230") относится к иному лицу по имени Борис (бывший посадник 1219 г.) — не отождествлён с тысяцким Борисом Негочевичем в этой строке, чтобы не приписать ему чужую смерть без прямого подтверждения.',
  },
  {
    hf_id: 'hf_book_antony_archbishop',
    name_ru: 'Антоний',
    office: 'архиепископ Новгородский на покое (не действующий владыка в 1230-1250)',
    office_start: '',
    office_end: '1232-10-08',
    period_note: 'на покое к 1230 г. (Спиридон уже действующий архиепископ); умер 8 окт. 1232',
    event_refs: '',
    location_refs: 'Новгород',
    significance: 'Предшественник Спиридона на архиепископской кафедре; к началу изучаемого периода уже отошёл от дел ("на покое"), болел перед смертью.',
    source_refs: 'book:667380 §Приложение 2 Свод летописных известий о Новгородской земле ¶488 "бывший на покое архиепископ Антоний скончался 8 октября 1232 г."; book:566839 §Глава II Русь и Ливония ¶643 "Антоний онемел и болел 6 лет 7 месяцев до смерти 8 окт. 1232"',
    confidence: 'B',
    status: 'candidate',
    note: 'Добавлен по требованию VERIFICATION.md (2026-09-26). office_start не указан (unspecified): книжные свидетельства этой группы датируют только смерть (1232-10-08) и продолжительность болезни перед ней, не начало периода "на покое". Не действующий владыка в 1230-1250 — не занимает бакет "архиепископ" в validate_figures.cjs наравне со Спиридоном/Далматом.',
  },
];

const allRows = [...sqRows, ...draftRows, ...addedRows];

fs.mkdirSync(OUT_DIR, { recursive: true });
writeCsv(path.join(OUT_DIR, 'figures.csv'),
  ['hf_id', 'name_ru', 'office', 'office_start', 'office_end', 'period_note', 'event_refs', 'location_refs',
   'significance', 'source_refs', 'confidence', 'status', 'note'],
  allRows);

console.log('figures.csv rows:', allRows.length, '(sqlite A-confidence:', sqRows.length, ', draft merged-in:', draftRows.length, ', added from book evidence:', addedRows.length, ')');
