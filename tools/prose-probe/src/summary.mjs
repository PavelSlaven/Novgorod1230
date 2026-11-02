import { join } from 'node:path';
import { json, output, quoteFound, read, requireProse, rubricVersion, serialize, spaces } from './files.mjs';
import { classes, items, stringArray, validateText } from './responses.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const noCells = () => Object.fromEntries(classes.map(name => [name, Object.fromEntries(items.map(item => [item, 0]))]));
const defect = (judge, id, detail) => `ответ судьи неполон: ${judge}, ${id}, ${detail}`;

function cellValid(entry) {
  return classes.includes(entry?.class) && items.includes(entry?.item) && !(entry.class === 'нужна характеристика' && entry.item === 'нет');
}

function criterionNotice(entry, prose) {
  if (entry?.mark === 'нет' && (typeof entry.place !== 'string' || entry.place.length === 0)) return 'место не указано судьёй';
  if (typeof entry?.place === 'string' && entry.place.length && !quoteFound(prose, entry.place)) return 'цитата не найдена';
  return null;
}

function criterionDecision(entry, resolutions) {
  if (!Number.isInteger(entry?.n) || !['да', 'нет'].includes(entry.mark)) return null;
  if (entry.mark === 'да') return 'не требуется';
  if (entry.n >= 2 && entry.n <= 4) return resolutions[entry.n]?.status ?? 'ожидает решения';
  return 'замечание';
}

function enrichRows(entries, field, prose, resolutions) {
  const result = [];
  for (let responseIndex = 0; responseIndex < entries.length; responseIndex++) {
    const values = Array.isArray(entries[responseIndex]?.[field]) ? entries[responseIndex][field] : [];
    for (let index = 0; index < values.length; index++) {
      const source = values[index];
      const base = record(source) ? { ...source } : { value: source };
      const quote = field === 'criteria' ? source?.place : source?.quote;
      const found = field === 'criteria' && quote === '' ? null : typeof quote === 'string' && quote.length > 0 && quoteFound(prose, quote);
      const notice = field === 'criteria' ? criterionNotice(source, prose) : found ? null : 'цитата не найдена';
      const row = { ...base, quote_found: found, notice };
      if (field === 'criteria') row.decision = criterionDecision(source, resolutions);
      if (entries.length > 1) row.response_index = responseIndex + 1;
      result.push(row);
    }
  }
  return result;
}

function responseRows(parsed, judge, warnings) {
  const issues = stringArray(parsed?.improve_general, 'improve_general', 3, 5);
  let texts = [];
  if (!Array.isArray(parsed?.texts)) {
    issues.push('texts: нужен массив');
  } else {
    texts = parsed.texts;
    for (const entry of texts) for (const [field, min, max] of [['dislike', 1, 3], ['improve', 1, 3]]) {
      if (Array.isArray(entry?.[field]) && (entry[field].length < min || entry[field].length > max)) issues.push(`${entry?.blind_id ?? 'без blind_id'}: ${field}: нужно ${min}–${max} записей`);
    }
  }
  if (issues.length) warnings.push(`${judge}: ${issues.join('; ')}`);
  return texts;
}

function addInventions(entries, id, judge, prose, all, tables, uniqueSeen, warnings) {
  for (const entry of entries.flatMap(value => Array.isArray(value?.inventions) ? value.inventions : [])) {
    const source = record(entry) ? entry : { value: entry };
    const quote = source.quote;
    const found = typeof quote === 'string' && quote.length > 0 && quoteFound(prose, quote);
    all.push({ id, judge, quote: source.quote ?? null, quote_found: found, class: source.class ?? null, item: source.item ?? null, ...(record(entry) ? {} : { value: entry }) });
    if (!cellValid(source)) {
      warnings.push(`${judge}, ${id}: недопустимая ячейка выдумки, класс=${String(source.class)}, пункт=${String(source.item)}`);
      continue;
    }
    tables.all[source.class][source.item]++;
    if (typeof quote !== 'string') {
      warnings.push(`${judge}, ${id}: цитата отсутствует или не является строкой; уникальная ячейка не учтена`);
      continue;
    }
    const key = `${source.class}\u0000${source.item}`;
    const value = JSON.stringify([id, spaces(quote)]);
    if (!uniqueSeen[key].has(value)) {
      uniqueSeen[key].add(value);
      tables.unique[source.class][source.item]++;
    }
  }
}

function confirmationPlan(id, blindId, input, judgeResponses, warnings) {
  const result = { criteria: {}, blocking: [] };
  if (input === undefined) return result;
  if (!record(input)) {
    warnings.push(`${id}: запись подтверждения должна быть объектом`);
    return result;
  }

  const noMarks = new Set();
  for (const response of judgeResponses) {
    const entries = Array.isArray(response?.texts) ? response.texts : [];
    for (const entry of entries) if (entry?.blind_id === blindId) {
      for (const criterion of Array.isArray(entry.criteria) ? entry.criteria : []) {
        if (Number.isInteger(criterion?.n) && criterion.mark === 'нет') noMarks.add(criterion.n);
      }
    }
  }

  if (input.criteria !== undefined) {
    if (!record(input.criteria)) {
      warnings.push(`${id}: criteria подтверждений должен быть объектом`);
      result.criteria_raw = input.criteria;
    } else for (const [key, status] of Object.entries(input.criteria)) {
      const n = /^(0|[1-9]\d*)$/.test(key) ? Number(key) : NaN;
      if (!Number.isInteger(n) || n < 2 || n > 4) {
        const message = `${id}: номер признака ${key} вне диапазона 2–4`;
        warnings.push(message);
        result.criteria[key] = { status, applied: false, warning: message };
      } else if (!['confirmed', 'rejected'].includes(status)) {
        const message = `${id}, признак ${n}: недопустимый статус подтверждения ${String(status)}`;
        warnings.push(message);
        result.criteria[key] = { status, applied: false, warning: message };
      } else if (status === 'confirmed' && !noMarks.has(n)) {
        const message = `${id}, признак ${n}: confirmed без отметки «нет» не применяется`;
        warnings.push(message);
        result.criteria[key] = { status, applied: false, warning: message };
      } else result.criteria[key] = { status, applied: true };
    }
  }

  if (input.blocking !== undefined) {
    if (!Array.isArray(input.blocking)) {
      warnings.push(`${id}: blocking должен быть массивом непустых строк`);
      result.blocking_raw = input.blocking;
    }
    else input.blocking.forEach((value, index) => {
      if (typeof value === 'string' && value.length > 0) result.blocking.push(value);
      else warnings.push(`${id}: blocking[${index}] должен быть непустой строкой`);
    });
  }
  return result;
}

function selectedResolution(plan) {
  return Object.fromEntries(Object.entries(plan.criteria).flatMap(([key, value]) => {
    const n = Number(key);
    return value?.applied && Number.isInteger(n) ? [[n, value]] : [];
  }));
}

function judgeSummary({ judge, parseError, entries, count, id, blindId, prose, resolutions, warnings }) {
  const defects = [];
  if (parseError) defects.push(defect(judge, id, `JSON не разобран: ${parseError}`));
  if (count === 0) defects.push(defect(judge, id, `нет ответа для ${blindId}`));
  if (count > 1) defects.push(defect(judge, id, `повторный ответ для ${blindId} (${count})`));
  for (const entry of entries) for (const error of validateText(entry)) defects.push(defect(judge, id, error));
  for (const value of defects) warnings.push(value);
  const first = entries[0];
  return {
    judge,
    complete: count === 1 && defects.length === 0,
    defects,
    criteria: enrichRows(entries, 'criteria', prose, resolutions),
    liveliness: first?.liveliness ?? null,
    inventions: enrichRows(entries, 'inventions', prose, resolutions),
    dislike: enrichRows(entries, 'dislike', prose, resolutions),
    improve: first?.improve ?? null,
    missing_facts: first?.missing_facts ?? null
  };
}

function validNoMarks(judges) {
  const result = new Set();
  for (const judge of judges) for (const criterion of judge.criteria) {
    if (Number.isInteger(criterion?.n) && criterion.n >= 1 && criterion.n <= 15 && criterion.mark === 'нет') result.add(criterion.n);
  }
  return result;
}

function decide(judges, judgeCount, confirmations) {
  const fullAnswers = judges.filter(value => value.complete).length;
  const scores = judges.filter(value => value.complete).map(value => value.liveliness);
  const average = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  const resolutions = selectedResolution(confirmations);
  const noMarks = validNoMarks(judges);
  const reasons = [];
  for (const [n, value] of Object.entries(resolutions)) if (n >= 2 && n <= 4 && value.status === 'confirmed') reasons.push(`Подтверждено нарушение по признаку ${n}.`);
  if (confirmations.blocking.length) reasons.push(`Есть blocking: ${confirmations.blocking.join('; ')}`);
  if (average !== null && average < 8) reasons.push(`Средняя живость полных ответов ${average} ниже 8.`);
  if (reasons.length) return { fullAnswers, average, verdict: 'не проходит', reasons };
  if (fullAnswers < judgeCount) reasons.push(`Полных ответов ${fullAnswers} из ${judgeCount}.`);
  for (const n of [2, 3, 4]) if (noMarks.has(n) && !resolutions[n]) reasons.push(`Отметка «нет» по признаку ${n} ожидает решения.`);
  return { fullAnswers, average, verdict: reasons.length ? 'не решено' : 'проходит', reasons };
}

function compareBaseline(previous, current) {
  const delta = { all: noCells(), unique: noCells() };
  for (const kind of ['all', 'unique']) for (const group of classes) for (const item of items) {
    delta[kind][group][item] = current[kind][group][item] - previous[kind][group][item];
  }
  return delta;
}

async function anchorTexts(dir, blindIds) {
  if (!blindIds.length) return new Map();
  const path = join(dir, 'judge1-pack.md');
  const source = await read(path);
  const result = new Map();
  for (const blindId of blindIds) {
    const header = new RegExp(`^## ${blindId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?$`, 'm').exec(source);
    if (!header) throw new Error(`${path}: нет блока ${blindId}`);
    const marker = /### Текст\r?\n\r?\n/g;
    marker.lastIndex = header.index + header[0].length;
    const textMarker = marker.exec(source);
    const nextHeader = /\r?\n## T\d+\r?\n/g;
    nextHeader.lastIndex = textMarker ? marker.lastIndex : source.length;
    if (!textMarker) throw new Error(`${path}: в ${blindId} нет секции «Текст»`);
    const end = nextHeader.exec(source)?.index ?? source.length;
    result.set(blindId, source.slice(marker.lastIndex, end).replace(/\r?\n$/, ''));
  }
  return result;
}

function md(value) {
  if (value === null || value === undefined || value === '') return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\r\n|\r|\n/g, '<br>').replace(/\|/g, '\\|');
}

function codeFence(value) {
  const runs = [...value.matchAll(/`+/g)].map(match => match[0].length);
  return '`'.repeat(Math.max(3, ...runs.map(run => run + 1)));
}

function criteriaTable(judge) {
  const lines = ['| № | Отметка | Место | Цитата найдена | Пометка | Решение |', '|---:|---|---|---|---|---|'];
  const entries = judge.criteria;
  for (let n = 1; n <= 15; n++) {
    const matches = entries.filter(entry => entry?.n === n);
    if (!matches.length) lines.push(`| ${n} | — | — | — | ответ неполон: запись отсутствует | — |`);
    else for (const entry of matches) lines.push(`| ${n} | ${md(entry.mark)} | ${md(entry.place)} | ${entry.quote_found === null ? '—' : entry.quote_found ? 'да' : 'нет'} | ${md(entry.notice)} | ${md(entry.decision)} |`);
  }
  for (const entry of entries.filter(value => !Number.isInteger(value?.n) || value.n < 1 || value.n > 15)) {
    lines.push(`| ${md(entry.n)} | ${md(entry.mark)} | ${md(entry.place)} | ${entry.quote_found === null ? '—' : entry.quote_found ? 'да' : 'нет'} | ${md(entry.notice)} | ${md(entry.decision)} |`);
  }
  return lines.join('\n');
}

function listLines(value) {
  if (Array.isArray(value)) return value.length ? value.map(entry => `- ${md(entry)}`).join('\n') : '- Нет записей.';
  return `- ${md(value)}`;
}

function judgeMarkdown(judge) {
  const lines = [`### ${judge.judge}`, '', `Полный ответ: ${judge.complete ? 'да' : 'нет'}. Живость: ${md(judge.liveliness)}.`, '', '#### Признаки', '', criteriaTable(judge), '', '#### Выдумки', '', '| Цитата | Класс | Пункт | Цитата найдена | Пометка |', '|---|---|---|---|---|'];
  if (!judge.inventions.length) lines.push('| — | — | — | — | — |');
  else for (const entry of judge.inventions) lines.push(`| ${md(entry.quote)} | ${md(entry.class)} | ${md(entry.item)} | ${entry.quote_found ? 'да' : 'нет'} | ${md(entry.notice)} |`);
  lines.push('', '#### Замечания к прозе', '', '| Что мешает | Цитата | Цитата найдена | Пометка |', '|---|---|---|---|');
  if (!judge.dislike.length) lines.push('| — | — | — | — |');
  else for (const entry of judge.dislike) lines.push(`| ${md(entry.what)} | ${md(entry.quote)} | ${entry.quote_found ? 'да' : 'нет'} | ${md(entry.notice)} |`);
  lines.push('', '#### Предложения по улучшению', '', listLines(judge.improve), '', '#### Недостающие факты', '', listLines(judge.missing_facts));
  if (judge.defects.length) lines.push('', '#### Дефекты ответа', '', ...judge.defects.map(value => `- ${md(value)}`));
  return lines.join('\n');
}

function tableCounts(tables, title) {
  const lines = [`### ${title}`, '', `| Класс | ${items.join(' | ')} |`, `|---|${items.map(() => '---:').join('|')}|`];
  for (const group of classes) lines.push(`| ${group} | ${items.map(item => tables[group][item]).join(' | ')} |`);
  return lines.join('\n');
}

function baselineTable(current, previous, delta, title) {
  const lines = [`#### ${title}`, '', '| Класс | Пункт | Текущее | Предыдущее | Дельта |', '|---|---|---:|---:|---:|'];
  for (const group of classes) for (const item of items) lines.push(`| ${group} | ${item} | ${current[group][item]} | ${previous[group][item]} | ${delta[group][item]} |`);
  return lines.join('\n');
}

function render(summary) {
  const lines = [`# Сводка оценки прозы`, '', `Версия рубрики: ${summary.rubric_version}`, '', `Моменты: ${summary.moment_ids.map(md).join(', ')}`, ''];
  for (const text of summary.texts) {
    const fence = codeFence(text.prose);
    lines.push(`## ${md(text.id)} (${md(text.blind_id)})`, '', '### Текст', '', `${fence}text`, text.prose, fence, '', `Средняя живость полных ответов: ${md(text.average_liveliness)}. Полных ответов: ${text.full_answers}.`, '', ...text.judges.map(judgeMarkdown), '', `### Вердикт: ${text.verdict}`, '');
    if (text.reasons.length) lines.push(...text.reasons.map(reason => `- ${md(reason)}`), '');
    lines.push('### Подтверждения', '', '| Признак | Статус | Применено |', '|---:|---|---|');
    const confirmations = Object.entries(text.confirmations.criteria);
    if (!confirmations.length) lines.push('| — | — | — |');
    else for (const [n, value] of confirmations) lines.push(`| ${md(n)} | ${md(value.status)} | ${value.applied ? 'да' : 'нет'} |`);
    if (Object.hasOwn(text.confirmations, 'criteria_raw')) lines.push(`| Исходное значение | ${md(text.confirmations.criteria_raw)} | нет |`);
    lines.push('', 'Blocking:', '', listLines(text.blocking), '');
    if (Object.hasOwn(text.confirmations, 'blocking_raw')) lines.push(`Исходное blocking: ${md(text.confirmations.blocking_raw)}`, '');
  }
  if (summary.anchors.length) {
    lines.push('## Якоря', '');
    for (const anchor of summary.anchors) {
      const fence = codeFence(anchor.prose);
      lines.push(`### ${md(anchor.id)} (${md(anchor.blind_id)})`, '', `${fence}text`, anchor.prose, fence, '', '| Судья | Признак | Отметка | Место | Цитата найдена | Пометка | Решение | Живость |', '|---|---:|---|---|---|---|---|---:|');
      for (const judge of anchor.judges) {
        for (const criterion of judge.criteria) lines.push(`| ${judge.judge} | ${md(criterion.n)} | ${md(criterion.mark)} | ${md(criterion.place)} | ${criterion.quote_found === null ? '—' : criterion.quote_found ? 'да' : 'нет'} | ${md(criterion.notice)} | ${md(criterion.decision)} | ${md(judge.liveliness)} |`);
        const present = new Set(judge.criteria.map(value => value?.n));
        for (let n = 1; n <= 15; n++) if (!present.has(n)) lines.push(`| ${judge.judge} | ${n} | — | — | — | ответ неполон: запись отсутствует | — | ${md(judge.liveliness)} |`);
      }
      lines.push('', `Средняя живость полных ответов: ${md(anchor.average_liveliness)}. Полных ответов: ${anchor.full_answers}.`, '');
    }
  }
  lines.push('## Общие рекомендации судей', '', '| Судья | Рекомендации |', '|---|---|');
  for (const entry of summary.improve_general) lines.push(`| ${entry.judge} | ${md(entry.value)} |`);
  lines.push('', '## Предупреждения', '');
  if (summary.warnings.length) lines.push(...summary.warnings.map(value => `- ${md(value)}`));
  else lines.push('Предупреждений нет.');
  lines.push('', '## Список выдумок игровых текстов', '', '| Момент | Судья | Цитата | Цитата найдена | Класс | Пункт |', '|---|---|---|---|---|---|');
  if (!summary.inventions.length) lines.push('| — | — | — | — | — | — |');
  else for (const entry of summary.inventions) lines.push(`| ${md(entry.id)} | ${entry.judge} | ${md(entry.quote)} | ${entry.quote_found ? 'да' : 'нет'} | ${md(entry.class)} | ${md(entry.item)} |`);
  lines.push('', '## Таблицы выдумок', '', tableCounts(summary.invention_tables.all, 'Все отметки'), '', tableCounts(summary.invention_tables.unique, 'Уникальные цитаты'));
  if (summary.baseline) {
    lines.push('', '## Сравнение с baseline', '');
    if (!summary.baseline.comparable) lines.push(summary.baseline.reason);
    else {
      lines.push(baselineTable(summary.invention_tables.all, summary.baseline.previous_tables.all, summary.baseline.delta.all, 'Все отметки'), '', baselineTable(summary.invention_tables.unique, summary.baseline.previous_tables.unique, summary.baseline.delta.unique, 'Уникальные цитаты'));
    }
  }
  const raw = serialize(summary.raw_responses);
  const fence = codeFence(raw);
  lines.push('', '## Исходные ответы судей', '', `${fence}json`, raw.trimEnd(), fence, '');
  return lines.join('\n');
}

export async function summary(options) {
  const packets = await json(join(options.dir, 'packets.json'));
  const key = await json(join(options.dir, 'judge-key.json'));
  const momentIds = packets.map(entry => entry.id);
  const blindToId = key.texts;
  const idToBlind = new Map(Object.entries(blindToId).map(([blindId, id]) => [id, blindId]));
  const anchorBlindIds = key.anchors;
  const anchorIds = new Set(anchorBlindIds.map(blindId => blindToId[blindId]));
  const realIds = new Set(momentIds);
  const prose = {};
  for (const id of momentIds) {
    const path = join(options.dir, `${id}.out.json`);
    const value = await json(path);
    prose[id] = requireProse(value, path);
  }
  const responseFiles = await Promise.all(Array.from({ length: key.judges }, (_, index) => {
    const judge = `judge${index + 1}`;
    const path = join(options.dir, `${judge}.json`);
    return read(path).then(raw => ({ judge, raw }));
  }));
  const anchorProse = await anchorTexts(options.dir, anchorBlindIds);
  const warnings = [];
  const rawResponses = [];
  const responseData = [];
  for (const file of responseFiles) {
    try {
      const parsed = JSON.parse(file.raw);
      responseData.push({ ...file, parsed });
      rawResponses.push({ judge: file.judge, raw: file.raw });
    } catch (error) {
      responseData.push({ ...file, parsed: null, parseError: error.message });
      rawResponses.push({ judge: file.judge, raw: file.raw, parse_error: error.message });
      warnings.push(`${file.judge}: JSON ответа не разобран: ${error.message}`);
    }
  }
  let confirmations = {};
  if (options.confirmations) confirmations = await json(options.confirmations);
  if (!record(confirmations)) {
    warnings.push('confirmations: нужен объект');
    confirmations = {};
  }
  const candidateRows = responseData.map(response => ({ ...response, texts: responseRows(response.parsed, response.judge, warnings) }));
  const knownBlindIds = new Set(Object.keys(blindToId));
  for (const response of candidateRows) for (const entry of response.texts) if (typeof entry?.blind_id === 'string' && !knownBlindIds.has(entry.blind_id)) warnings.push(`${response.judge}: неизвестный blind_id ${entry.blind_id}`);
  const confirmationPlans = new Map();
  for (const id of Object.keys(confirmations)) {
    if (anchorIds.has(id)) warnings.push(`${id}: якорь, подтверждения не применяются`);
    else if (!realIds.has(id)) warnings.push(`${id}: неизвестный id подтверждения`);
  }
  for (const id of momentIds) confirmationPlans.set(id, confirmationPlan(id, idToBlind.get(id), confirmations[id], candidateRows, warnings));
  const tables = { all: noCells(), unique: noCells() };
  const uniqueSeen = Object.fromEntries(classes.flatMap(group => items.map(item => [`${group}\u0000${item}`, new Set()])));
  const inventions = [];
  const makeObject = (id, blindId, text, anchor = false) => {
    const plan = confirmationPlans.get(id) ?? { criteria: {}, blocking: [] };
    const resolutions = selectedResolution(plan);
    const judges = [];
    for (const response of candidateRows) {
      const rows = response.texts.filter(entry => entry?.blind_id === blindId);
      const judge = judgeSummary({ judge: response.judge, parseError: response.parseError, entries: rows, count: rows.length, id, blindId, prose: text, resolutions, warnings });
      judges.push(judge);
      if (!anchor) addInventions(rows, id, response.judge, text, inventions, tables, uniqueSeen, warnings);
    }
    const result = decide(judges, key.judges, plan);
    return {
      value: {
        id,
        blind_id: blindId,
        prose: text,
        judges,
        average_liveliness: result.average,
        full_answers: result.fullAnswers,
        ...(anchor ? { reasons: [], confirmations: plan, blocking: plan.blocking } : { verdict: result.verdict, reasons: result.reasons, confirmations: plan, blocking: plan.blocking })
      },
    };
  };
  const textRows = momentIds.map(id => makeObject(id, idToBlind.get(id), prose[id]).value);
  const anchorRows = anchorBlindIds.map(blindId => makeObject(blindToId[blindId], blindId, anchorProse.get(blindId), true).value);
  const table = { all: tables.all, unique: tables.unique };
  const rubric = await rubricVersion();
  const summaryObject = {
    rubric_version: rubric,
    moment_ids: momentIds,
    texts: textRows,
    anchors: anchorRows,
    improve_general: candidateRows.map(response => ({ judge: response.judge, value: response.parsed?.improve_general ?? null })),
    warnings,
    raw_responses: rawResponses,
    inventions,
    invention_tables: table
  };
  if (options.baseline) {
    const path = join(options.baseline, 'summary.json');
    const previous = await json(path);
    const differences = [];
    if (previous?.rubric_version !== rubric) differences.push('версия рубрики изменилась');
    if (JSON.stringify(previous?.moment_ids) !== JSON.stringify(momentIds)) differences.push('список moment_ids изменился');
    if (differences.length) summaryObject.baseline = { comparable: false, reason: `прогоны несравнимы: ${differences.join('; ')}` };
    else summaryObject.baseline = { comparable: true, previous_tables: previous.invention_tables, delta: compareBaseline(previous.invention_tables, table) };
  }
  await output(options.dir, { 'summary.json': serialize(summaryObject), 'summary.md': render(summaryObject) });
}
