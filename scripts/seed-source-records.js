import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const TS = '2026-06-29T00:00:00Z';

function mapPublicationYear(raw, auditNotes) {
  if (raw == null || raw === '') return { year: null, auditNotes };
  if (typeof raw === 'number' && Number.isInteger(raw)) return { year: raw, auditNotes };
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return { year: Number(s), auditNotes };
  const note = `publication_year_raw: ${s}`;
  const merged = auditNotes ? `${auditNotes} ${note}` : note;
  return { year: null, auditNotes: merged };
}

function emptyToNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'empty') return null;
  return s;
}

const SOURCE_RECORDS = [
  {
    id: 'src_project_main_rule',
    title: 'Главное правило проекта',
    slug: 'project_main_rule',
    source_type: 'project_note',
    author: 'Проект РУСЬ одним промтом',
    publication_year: 2026,
    period_covered: '1230-1250',
    region_covered: 'Весь проект',
    url: null,
    file_reference: '/mnt/data/Главное-правило-проекта.txt',
    page_or_section: 'Весь документ',
    quote_short: '—',
    summary: 'Архитектурное правило: код не создаёт мир, а хранит и валидирует утверждённые LLM данные.',
    reliability_level: 'project_rule',
    bias_notes: 'Не исторический источник; проектная архитектурная норма.',
    usefulness: 'Использовать как верхний приоритет при любых решениях о генерации мира.',
    limitations: 'Не даёт сведений о Новгороде, быте или конкретных исторических фактах.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'approved',
    confidence: 'high',
    audit_notes: 'Базовый проектный источник для всех процедур world_base.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_project_world_regions',
    title: 'Сетка регионов RUS13',
    slug: 'project_world_regions',
    source_type: 'project_note',
    author: 'Проект РУСЬ одним промтом',
    publication_year: 2026,
    period_covered: '1230-1250',
    region_covered: 'Все регионы RUS13',
    url: null,
    file_reference: '/mnt/data/world_regions.txt',
    page_or_section: 'Регионы мира RUS13',
    quote_short: '—',
    summary: 'Список допустимых регионов и canonical region_id для проекта RUS13.',
    reliability_level: 'project_rule',
    bias_notes: 'Не описывает внутреннее устройство регионов.',
    usefulness: 'Использовать для region_id, parent_region_id и географической привязки записей.',
    limitations: 'Не содержит климата, экономики, законов или NPC-знаний.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'approved',
    confidence: 'high',
    audit_notes: 'Для Новгорода использовать canonical region: Новгородская земля.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_project_world_generation',
    title: 'Генерация мира и ходы',
    slug: 'project_world_generation',
    source_type: 'project_note',
    author: 'Проект РУСЬ одним промтом',
    publication_year: 2026,
    period_covered: '1230-1250',
    region_covered: 'Весь проект',
    url: null,
    file_reference: '/mnt/data/world_generation_and_turns.txt',
    page_or_section: 'Разделы: регион, место, историческая рамка, карта',
    quote_short: '—',
    summary: 'Правила материализации мира: регион → места → маршруты → события → ходы.',
    reliability_level: 'project_rule',
    bias_notes: 'Не исторический источник; процедурный документ проекта.',
    usefulness: 'Использовать для таблиц regions, places, routes, historical_events и llm_context_packs.',
    limitations: 'Не подтверждает конкретные факты о Новгороде XIII века.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'approved',
    confidence: 'high',
    audit_notes: 'Опорный документ для связки регион → места → маршруты → события.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_project_information_sources',
    title: 'Работа с информацией, источниками и промтами LLM',
    slug: 'project_information_sources',
    source_type: 'project_note',
    author: 'Проект РУСЬ одним промтом',
    publication_year: 2026,
    period_covered: '1230-1250',
    region_covered: 'Весь проект',
    url: null,
    file_reference: '/mnt/data/information_sources_llm_prompts.md',
    page_or_section: 'Весь документ',
    quote_short: '—',
    summary: 'Правила источников, статусов, confidence, record_sources и LLM-процедур утверждения.',
    reliability_level: 'project_rule',
    bias_notes: 'Не исторический источник; мета-документ о работе с данными.',
    usefulness: 'Использовать для статусов draft, usable_with_caution, approved и связей record_sources.',
    limitations: 'Не даёт конкретного содержания о средневековом Новгороде.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'approved',
    confidence: 'high',
    audit_notes: 'Опорный источник для всех source_records и record_sources.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_novgorod_first_chronicle_1950',
    title: 'Новгородская первая летопись (издание 1950)',
    slug: 'novgorod_first_chronicle_1950',
    source_type: 'chronicle',
    author: 'АН СССР; Институт истории',
    publication_year: 1950,
    period_covered: '1016-1352; особенно полезно для 1230-1250',
    region_covered: 'Новгородская земля; Великий Новгород',
    url: 'https://archive.org/details/novhorodskyj_litopys',
    file_reference: null,
    page_or_section: 'Издание 1950; летописный текст',
    quote_short: '—',
    summary: 'Критическое издание Новгородской первой летописи; основной летописный корпус для XIII века.',
    reliability_level: 'primary_chronicle_edition',
    bias_notes: 'Летопись отражает позицию новгородской элиты и церкви.',
    usefulness: 'Использовать для historical_events, historical_figures и политического контекста.',
    limitations: 'Не использовать как прямое описание быта, экономики или речевых регистров.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'high',
    audit_notes: 'Главный летописание источник для Новгорода 1230-1250.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_chronicle_novgorod_1914_en',
    title: 'The Chronicle of Novgorod (1914 English translation)',
    slug: 'chronicle_of_novgorod_1914_en',
    source_type: 'chronicle',
    author: 'Robert Michell; Nevill Forbes',
    publication_year: 1914,
    period_covered: '1016-1471; полезно для 1230-1250',
    region_covered: 'Новгородская земля; Великий Новгород',
    url: 'https://archive.org/details/chronicleofnovgo00michrich',
    file_reference: null,
    page_or_section: 'English translation 1914',
    quote_short: '—',
    summary: 'Английский перевод Новгородской летописи; вспомогательный доступ к тексту.',
    reliability_level: 'primary_translation',
    bias_notes: 'Перевод старого издания; возможны искажения терминологии.',
    usefulness: 'Использовать как вспомогательный доступ к летописным фрагментам.',
    limitations: 'Не использовать для точной терминологии или цитирования на русском.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'medium_high',
    audit_notes: 'Вспомогательный источник, не главный.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_gramoty_ru_database',
    title: 'Древнерусские берестяные грамоты (gramoty.ru)',
    slug: 'gramoty_ru_birchbark_database',
    source_type: 'academic_database',
    author: 'Проект gramoty.ru',
    publication_year: 'ongoing',
    period_covered: 'XI-XV вв.; особенно Новгород',
    region_covered: 'Новгород; Старая Русса',
    url: 'https://gramoty.ru/birchbark/document/list/',
    file_reference: null,
    page_or_section: 'База документов',
    quote_short: '—',
    summary: 'База берестяных грамот с текстами, датировками и контекстом находок.',
    reliability_level: 'corpus_database',
    bias_notes: 'Сохранившиеся грамоты фрагментарны и не репрезентативны для всего населения.',
    usefulness: 'Использовать для region_economy, speech_register и бытовых деталей.',
    limitations: 'Не обобщать одну грамоту на весь регион или социальный слой.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'high',
    audit_notes: 'Особенно полезно для неэлитного слоя.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_ruscorpora_birchbark',
    title: 'Корпус берестяных грамот НКРЯ',
    slug: 'ruscorpora_birchbark_corpus',
    source_type: 'academic_database',
    author: 'НКРЯ (Национальный корпус русского языка)',
    publication_year: 2025,
    period_covered: 'XI-XV вв.',
    region_covered: 'Восточнославянская территория; преимущественно Новгород',
    url: 'https://ruscorpora.ru/en/corpus/birchbark',
    file_reference: null,
    page_or_section: 'Corpus: Historical Birchbark letters',
    quote_short: '—',
    summary: 'Корпус берестяных грамот для лингвистического и речевого анализа.',
    reliability_level: 'corpus_database',
    bias_notes: 'Лингвистическая база; не исторический нарратив.',
    usefulness: 'Использовать для речевых регистров, имён, бытовой лексики.',
    limitations: 'Не использовать как прямой генератор сюжетов или событий.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'high',
    audit_notes: 'Для speech_register и region_npc_knowledge.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_cambridge_medieval_novgorod',
    title: 'Cambridge History of Russia: Medieval Novgorod',
    slug: 'cambridge_history_medieval_novgorod',
    source_type: 'book',
    author: 'Janet Martin et al.',
    publication_year: 2006,
    period_covered: 'Средневековый Новгород до 1478',
    region_covered: 'Новгородская земля; Великий Новгород',
    url: 'https://www.cambridge.org/core/books/abs/cambridge-history-of-russia/medieval-novgorod/',
    file_reference: null,
    page_or_section: 'Chapter 8',
    quote_short: '—',
    summary: 'Научный обзор политической, экономической и социальной истории средневекового Новгорода.',
    reliability_level: 'academic_secondary',
    bias_notes: 'Доступ может быть ограничен; вторичный синтез.',
    usefulness: 'Использовать для regions, historical_events и широкого контекста.',
    limitations: 'Не копировать как готовую игровую истину без проверки первичных источников.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'high',
    audit_notes: 'Сильный вторичный источник для структуры региона.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_martin_medieval_russia_2007',
    title: 'Medieval Russia 980–1584',
    slug: 'martin_medieval_russia_2007',
    source_type: 'book',
    author: 'Janet Martin',
    publication_year: 2007,
    period_covered: '980-1584; контекст для 1230-1250',
    region_covered: 'Русские земли; включая Новгород',
    url: 'https://assets.cambridge.org/97805218/59165/frontmatter/9780521859165_frontmatter.pdf',
    file_reference: null,
    page_or_section: 'Frontmatter',
    quote_short: '—',
    summary: 'Обзор истории средневековой Руси; широкий контекст для Новгорода XIII века.',
    reliability_level: 'academic_secondary',
    bias_notes: 'Фронтматтер не заменяет полный текст книги.',
    usefulness: 'Использовать для широкого контекста regions и historical_events.',
    limitations: 'Не использовать для локальных деталей Новгорода без дополнительных источников.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'high',
    audit_notes: 'Нужен полный доступ к книге для детальной работы.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_paul_archbishops_novgorod_2007',
    title: 'Secular Power and the Archbishops of Novgorod',
    slug: 'paul_archbishops_novgorod_2007',
    source_type: 'article',
    author: 'Michael C. Paul',
    publication_year: 2007,
    period_covered: 'XII-XV вв.; релевантно для 1230-1250',
    region_covered: 'Новгородская земля; Великий Новгород',
    url: 'https://www.academia.edu/3816181/',
    file_reference: null,
    page_or_section: 'Kritika 2007',
    quote_short: '—',
    summary: 'Статья о светской роли новгородских архиепископов и церковной власти.',
    reliability_level: 'academic_secondary',
    bias_notes: 'Academia.edu — не официальный издательский канал.',
    usefulness: 'Использовать для religious_context, religious_authority и region_social_roles.',
    limitations: 'Не переносить выводы на другие периоды без проверки.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'medium_high',
    audit_notes: 'Найти DOI и официальную публикацию при возможности.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_paul_chosen_by_god_2025_review',
    title: 'Review of Michael C. Paul, Chosen by God',
    slug: 'paul_chosen_by_god_2025_review',
    source_type: 'article',
    author: 'Pauline Vasselle',
    publication_year: 2026,
    period_covered: '1165-1478',
    region_covered: 'Новгородская земля',
    url: 'https://ejournals.uni-muenster.de/index.php/byzrev/article/view/9396',
    file_reference: null,
    page_or_section: 'The Byzantine Review 8 2026',
    quote_short: '—',
    summary: 'Рецензия на исследование о новгородской церковной власти; библиографический ориентир.',
    reliability_level: 'academic_review',
    bias_notes: 'Это рецензия, не первичное исследование.',
    usefulness: 'Использовать как указатель на первичные и вторичные источники по теме.',
    limitations: 'Не использовать для конкретных фактов без обращения к рецензируемой работе.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'medium',
    audit_notes: 'Полезный библиографический ориентир.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_russkaya_pravda_prostrannaya',
    title: 'Русская Правда Пространная',
    slug: 'russkaya_pravda_prostrannaya',
    source_type: 'chronicle',
    author: 'Библиотека литературы Древней Руси',
    publication_year: '1120s_estimated',
    period_covered: 'XII-XIII вв.',
    region_covered: 'Русские земли; применимо к Новгороду',
    url: 'https://azbyka.ru/otechnik/',
    file_reference: null,
    page_or_section: 'Русская Правда Пространная',
    quote_short: '—',
    summary: 'Правовой памятник Древней Руси; основа для region_laws и правовых норм.',
    reliability_level: 'primary_law_text',
    bias_notes: 'Не является специальным новгородским сводом; обобщённая правовая традиция.',
    usefulness: 'Использовать для region_laws, law_summary и правовых последствий.',
    limitations: 'Не использовать для XV века или локальных новгородских особенностей без доп. источников.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'medium_high',
    audit_notes: 'Для XIII века лучше сочетать с новгородскими правовыми источниками.',
    created_at: TS,
    updated_at: TS
  },
  {
    id: 'src_novgorod_archaeology_overview',
    title: 'Medieval Novgorod archaeological overview',
    slug: 'novgorod_archaeology_overview',
    source_type: 'archaeology',
    author: 'UCL Press / archaeological survey authors',
    publication_year: 'unknown',
    period_covered: 'Средневековый Новгород',
    region_covered: 'Великий Новгород',
    url: 'https://journals.uclpress.co.uk/ai/article/575/galley/12753/view/',
    file_reference: null,
    page_or_section: 'Article overview',
    quote_short: '—',
    summary: 'Археологический обзор материальной культуры средневекового Новгорода.',
    reliability_level: 'academic_secondary',
    bias_notes: 'Краткий обзор; не заменяет полевые отчёты экспедиций.',
    usefulness: 'Использовать для material_culture, region_material_culture и бытовых объектов.',
    limitations: 'Не использовать для точных дат или индивидуальных находок без первичных отчётов.',
    checked_by: 'manual_pending',
    checked_at: TS,
    status: 'usable_with_caution',
    confidence: 'medium_high',
    audit_notes: 'Позже добавить отчёты экспедиции.',
    created_at: TS,
    updated_at: TS
  }
];

const UPSERT_SQL = `
INSERT INTO world_base.source_records (
  id, title, slug, source_type, author, publication_year,
  period_covered, region_covered, url, file_reference, page_or_section,
  quote_short, summary, reliability_level, bias_notes, usefulness, limitations,
  checked_by, checked_at, status, confidence, audit_notes, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11,
  $12, $13, $14, $15, $16, $17,
  $18, $19, $20, $21, $22, $23, $24
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  source_type = EXCLUDED.source_type,
  author = EXCLUDED.author,
  publication_year = EXCLUDED.publication_year,
  period_covered = EXCLUDED.period_covered,
  region_covered = EXCLUDED.region_covered,
  url = EXCLUDED.url,
  file_reference = EXCLUDED.file_reference,
  page_or_section = EXCLUDED.page_or_section,
  quote_short = EXCLUDED.quote_short,
  summary = EXCLUDED.summary,
  reliability_level = EXCLUDED.reliability_level,
  bias_notes = EXCLUDED.bias_notes,
  usefulness = EXCLUDED.usefulness,
  limitations = EXCLUDED.limitations,
  checked_by = EXCLUDED.checked_by,
  checked_at = EXCLUDED.checked_at,
  status = EXCLUDED.status,
  confidence = EXCLUDED.confidence,
  audit_notes = EXCLUDED.audit_notes,
  updated_at = EXCLUDED.updated_at
`;

function getAdminUrl() {
  const direct = String(process.env.WORLD_DB_ADMIN_URL ?? '').trim();
  if (direct) return direct;

  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

function normalizeRecord(raw) {
  const { year, auditNotes } = mapPublicationYear(raw.publication_year, raw.audit_notes);
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    source_type: raw.source_type,
    author: raw.author,
    publication_year: year,
    period_covered: raw.period_covered,
    region_covered: raw.region_covered,
    url: emptyToNull(raw.url),
    file_reference: emptyToNull(raw.file_reference),
    page_or_section: raw.page_or_section,
    quote_short: raw.quote_short,
    summary: raw.summary,
    reliability_level: raw.reliability_level,
    bias_notes: raw.bias_notes,
    usefulness: raw.usefulness,
    limitations: raw.limitations,
    checked_by: raw.checked_by,
    checked_at: raw.checked_at,
    status: raw.status,
    confidence: raw.confidence,
    audit_notes: auditNotes,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const client = new Client({ connectionString: getAdminUrl() });

try {
  await client.connect();

  for (const raw of SOURCE_RECORDS) {
    const r = normalizeRecord(raw);
    await client.query(UPSERT_SQL, [
      r.id, r.title, r.slug, r.source_type, r.author, r.publication_year,
      r.period_covered, r.region_covered, r.url, r.file_reference, r.page_or_section,
      r.quote_short, r.summary, r.reliability_level, r.bias_notes, r.usefulness, r.limitations,
      r.checked_by, r.checked_at, r.status, r.confidence, r.audit_notes, r.created_at, r.updated_at
    ]);
  }

  const { rows: countRows } = await client.query(
    'SELECT COUNT(*)::int AS count FROM world_base.source_records'
  );
  console.log(`source_records count: ${countRows[0].count}`);

  const { rows: sample } = await client.query(`
    SELECT id, title, source_type, status, confidence, publication_year
    FROM world_base.source_records
    ORDER BY id
    LIMIT 5
  `);
  console.log('sample rows:');
  for (const row of sample) {
    console.log(JSON.stringify(row));
  }

  const seededIds = SOURCE_RECORDS.map((r) => r.id);
  const { rows: seeded } = await client.query(
    'SELECT id FROM world_base.source_records WHERE id = ANY($1::text[]) ORDER BY id',
    [seededIds]
  );
  if (seeded.length !== SOURCE_RECORDS.length) {
    throw new Error(`expected ${SOURCE_RECORDS.length} seeded rows, found ${seeded.length}`);
  }
  console.log(`seeded: ${seeded.length} rows (upsert ok)`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end();
}
