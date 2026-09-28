#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(catalogDir, '../../../../');
const datasets = path.join(root, 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets');
const slotFile = 'spatial_v3_expansion_slots.json';
const assignmentFile = 'spatial_v3_expansion_slot_templates.json';
const generationFile = 'spatial_v3_g5_generation_templates.json';
const slotRef = `data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/${assignmentFile}`;
const generationRef = `data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/${generationFile}`;
const pfPath = 'data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv';
const nodePath = 'data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv';

const classLabels = {
  river_channel: { label: 'к руслу', placeFamilyId: 'pf_river_channel' },
  forest: { label: 'в лес' },
  island: { label: 'к острову' },
  ridge: { label: 'к гряде' }
};
const familyLabels = {
  pf_river_channel: 'к руслу', pf_riverbank: 'к берегу',
  pf_floodplain_meadow: 'к лугу', pf_conifer_woodland: 'в ельник',
  pf_forest_edge: 'к опушке', pf_mixed_woodland: 'в лес',
  pf_peasant_homestead: 'к избам', pf_road: 'к дороге'
};
const words = new Set([
  'к', 'в', 'вдоль', 'руслу', 'лес', 'острову', 'гряде', 'берегу',
  'лугу', 'ельник', 'опушке', 'дороге', 'избам'
]);

function args(argv) {
  const options = { selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--self-test') options.selfTest = true;
    else if (argv[i] === '--help') options.help = true;
    else throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }
  return options;
}

function csvLine(line, number, file) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { fields.push(value); value = ''; }
    else value += c;
  }
  if (quoted) throw new Error(`${file}:${number}: незакрытая кавычка`);
  fields.push(value);
  return fields;
}

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = csvLine(lines[0], 1, file);
  return lines.slice(1).flatMap((line, i) => {
    if (!line) return [];
    const values = csvLine(line, i + 2, file);
    if (values.length !== header.length) throw new Error(`${file}:${i + 2}: неверное число CSV полей`);
    return [{ ...Object.fromEntries(header.map((key, j) => [key, values[j]])), line: i + 2 }];
  });
}

function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function slotKey(id, version) { return `${id}@${version}`; }
function templateKey(id, version) { return `${id}@${version}`; }
function familyOf(id) { return id?.startsWith('m2c_g5_') ? id.slice(7).split('__')[0] : null; }
function pointer(file, index) { return `${file}#/${index}`; }
function pfRef(line) { return `${pfPath}#L${line}`; }
function nodeRef(line) { return `${nodePath}#L${line}`; }

// Provenance comes from this repository: the place-family and node-binding CSVs of
// game-base-v1 are read in place; nothing outside the checkout is needed.
function load() {
  const candidate = json(path.join(catalogDir, 'candidate.json'));
  const placeFamilies = readCsv(path.join(root, pfPath));
  const nodeBindings = readCsv(path.join(root, nodePath));
  return {
    candidate,
    slots: json(path.join(datasets, slotFile)),
    assignments: json(path.join(datasets, assignmentFile)),
    templates: json(path.join(datasets, generationFile)),
    families: new Map(placeFamilies.map((row) => [row.pf_id, row])),
    nodeBindings
  };
}

function startFamilies(rows) {
  const result = new Set();
  for (const row of rows.filter((item) => item.node_level === 'G5')) {
    if (row.pf_id) result.add(row.pf_id);
    for (const id of (row.pf_secondary ?? '').split(';').map((value) => value.trim())) {
      if (id) result.add(id);
    }
  }
  return result;
}

function scopeGaps(rows) {
  return new Map(rows.filter((row) => row.node_level === 'G5' && !row.pf_id
    && !(row.pf_secondary ?? '').split(';').some((value) => value.trim()))
  .map((row) => [row.node_ref, row]));
}

function checkText(label, id, errors) {
  if (typeof label !== 'string' || /[A-ZА-ЯЁ]/.test(label)
    || !/^[а-яё]+(?: [а-яё]+){0,3}$/.test(label)) {
    errors.push(`${id}: текст должен содержать 1–4 слова в нижнем регистре`);
    return;
  }
  const tokens = label.split(' ');
  if (!['к', 'в', 'вдоль'].includes(tokens[0])) errors.push(`${id}: нет направительного предлога`);
  if (tokens.some((token) => !words.has(token))) errors.push(`${id}: незнакомое слово или возможное имя собственное`);
}

function refsFor(record, input, assignmentsBySlot) {
  const refs = new Set();
  if (record.expansion_slot_ref) {
    const key = slotKey(record.expansion_slot_ref.id, record.expansion_slot_ref.version);
    for (const { row, index } of assignmentsBySlot.get(key) ?? []) {
      refs.add(pointer(slotRef, index));
      const templateIndex = input.templates.findIndex((template) => templateKey(template.id, template.version)
        === templateKey(row.template_id, row.template_version));
      if (templateIndex >= 0) refs.add(pointer(generationRef, templateIndex));
    }
    if (record.target_place_family_id) {
      const family = input.families.get(record.target_place_family_id);
      if (family) refs.add(pfRef(family.line));
    }
  } else if (record.place_family_id) {
    const family = input.families.get(record.place_family_id);
    if (family) refs.add(pfRef(family.line));
  }
  return [...refs].sort();
}

function validate(candidate, input) {
  const errors = [];
  if (candidate.artifact_type !== 'pass_target_description_authoring_candidate'
    || candidate.candidate_id !== 'novgorod_m2c_pass_target_labels_v1'
    || candidate.status !== 'candidate_approval_pending'
    || candidate.approved !== false || candidate.import_authorized !== false
    || candidate.activation_authorized !== false) errors.push('каталог должен быть неутверждённым кандидатом');
  if (!Array.isArray(candidate.labels)) return ['labels должен быть массивом'];
  if (!candidate.world_revision_id || [...input.slots, ...input.templates]
    .some((row) => row.world_revision_id !== candidate.world_revision_id)) {
    errors.push('world_revision_id должен совпадать с expansion и G5 template источниками');
  }

  const slots = new Set(input.slots.map((row) => slotKey(row.id, row.version)));
  const assignmentsBySlot = new Map();
  const templatesByKey = new Map(input.templates.map((row) => [templateKey(row.id, row.version), row]));
  for (const [index, row] of input.assignments.entries()) {
    const key = slotKey(row.slot_id, row.slot_version);
    const list = assignmentsBySlot.get(key) ?? [];
    list.push({ row, index });
    assignmentsBySlot.set(key, list);
    if (!templatesByKey.has(templateKey(row.template_id, row.template_version))) {
      errors.push(`${key}: неизвестный G5 шаблон ${row.template_id}@${row.template_version}`);
    }
  }
  for (const key of slots) if (!assignmentsBySlot.has(key)) errors.push(`${key}: нет шаблона`);

  const expectedFamilies = startFamilies(input.nodeBindings);
  const expectedScopeGaps = scopeGaps(input.nodeBindings);
  const seenIds = new Set();
  const seenSlots = new Set();
  const seenFamilies = new Set();
  for (const record of candidate.labels) {
    const id = record?.id ?? 'запись без id';
    if (!record || typeof record !== 'object' || seenIds.has(id)) errors.push(`${id}: запись отсутствует или id повторяется`);
    else seenIds.add(id);
    if (record.version !== 1 || record.status !== 'candidate_approval_pending'
      || record.provenance?.confidence !== 'C') errors.push(`${id}: неверны version, status или confidence`);
    const slot = record.expansion_slot_ref;
    const familyId = record.place_family_id;
    if (Boolean(slot) === Boolean(familyId)) { errors.push(`${id}: нужен ровно один целевой ключ`); continue; }
    const hasLabel = typeof record.display_label === 'string';
    const hasGap = typeof record.gap_reason === 'string' && record.gap_reason.trim().length > 0;
    if (hasLabel === hasGap) errors.push(`${id}: укажите описание либо причину пробела`);

    if (slot) {
      const key = slotKey(slot.id, slot.version);
      if (!slots.has(key)) errors.push(`${id}: неизвестный expansion_slot_ref ${key}`);
      if (seenSlots.has(key)) errors.push(`${key}: повторный ключ`);
      seenSlots.add(key);
      const expected = (assignmentsBySlot.get(key) ?? []).map(({ row }) => templateKey(row.template_id, row.template_version)).sort();
      const actual = (record.applicable_template_refs ?? []).map((row) => templateKey(row.id, row.version)).sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push(`${id}: applicable_template_refs не покрывает все варианты`);
      if (hasLabel) {
        checkText(record.display_label, id, errors);
        const spec = classLabels[record.common_visible_class];
        if (!spec || spec.label !== record.display_label) errors.push(`${id}: текст не соответствует common_visible_class`);
        const classes = actual.map((key) => familyOf(templatesByKey.get(key)?.id));
        if (classes.length === 0 || classes.some((value) => value !== record.common_visible_class)) {
          errors.push(`${id}: описание не подтверждено всеми возможными шаблонами слота`);
        }
        if ((spec?.placeFamilyId ?? undefined) !== record.target_place_family_id) {
          errors.push(`${id}: неверный target_place_family_id`);
        }
      } else if (record.common_visible_class || record.target_place_family_id) {
        errors.push(`${id}: у пробела не должно быть целевого видимого класса`);
      }
    } else {
      if (!input.families.has(familyId)) errors.push(`${id}: неизвестный place_family_id ${familyId}`);
      if (!expectedFamilies.has(familyId)) errors.push(`${familyId}: PF не привязан к стартовой территории G5`);
      if (seenFamilies.has(familyId)) errors.push(`${familyId}: повторный ключ`);
      seenFamilies.add(familyId);
      if (hasLabel) {
        checkText(record.display_label, id, errors);
        if (familyLabels[familyId] !== record.display_label) errors.push(`${id}: текст не соответствует PF`);
      }
    }
    const actualRefs = record.provenance?.source_refs;
    const expectedRefs = refsFor(record, input, assignmentsBySlot);
    if (!Array.isArray(actualRefs) || JSON.stringify([...new Set(actualRefs)].sort()) !== JSON.stringify(expectedRefs)
      || actualRefs.length !== new Set(actualRefs ?? []).size) errors.push(`${id}: source_refs должны точно указывать на строки основания`);
  }

  for (const key of slots) if (!seenSlots.has(key)) errors.push(`не покрыт слот ${key}`);
  for (const id of expectedFamilies) if (!seenFamilies.has(id)) errors.push(`не покрыт PF стартовой территории ${id}`);

  const seenScopeGaps = new Set();
  if (!Array.isArray(candidate.source_scope_gaps)) errors.push('source_scope_gaps должен быть массивом');
  else for (const gap of candidate.source_scope_gaps) {
    const source = expectedScopeGaps.get(gap.node_ref);
    if (!source || seenScopeGaps.has(gap.node_ref)) errors.push(`неизвестный или повторный G5 source gap ${gap.node_ref}`);
    if (!gap.gap_reason?.trim()) errors.push(`${gap.node_ref}: отсутствует причина source gap`);
    if (gap.source_ref !== (source ? nodeRef(source.line) : null)) errors.push(`${gap.node_ref}: неверный source_ref`);
    seenScopeGaps.add(gap.node_ref);
  }
  for (const key of expectedScopeGaps.keys()) if (!seenScopeGaps.has(key)) errors.push(`не объяснён G5 узел без PF ${key}`);
  for (const key of seenScopeGaps) if (!expectedScopeGaps.has(key)) errors.push(`лишний G5 source gap ${key}`);
  errors.push(...checkPassagePhrases(candidate));
  return errors;
}

/** `passage_phrases`: the wording the runtime used to compose in code. Short lowercase
 * Russian phrases; every visible class of a described slot maps to a way of going. */
function checkPassagePhrases(candidate) {
  const phrases = candidate.passage_phrases;
  const errors = [];
  const phrase = (value, id) => {
    if (typeof value !== 'string' || !/^[а-яё]+(?: [а-яё]+){0,3}$/.test(value)) {
      errors.push(`passage_phrases.${id}: 1–4 слова в нижнем регистре`);
    }
  };
  if (!phrases || typeof phrases !== 'object') return ['отсутствует passage_phrases'];
  phrase(phrases.local_edge_occupied, 'local_edge_occupied');
  for (const kind of ['water', 'land', 'neutral']) phrase(phrases.approach?.[kind], `approach.${kind}`);
  const classes = new Set(candidate.labels.filter((row) => row.expansion_slot_ref && row.display_label)
    .map((row) => row.common_visible_class));
  const mapping = phrases.approach_kind_by_visible_class ?? {};
  for (const cls of classes) if (!['water', 'land'].includes(mapping[cls])) {
    errors.push(`passage_phrases: класс ${cls} без вида пути water/land`);
  }
  for (const cls of Object.keys(mapping)) if (!classes.has(cls)) {
    errors.push(`passage_phrases: лишний класс ${cls}`);
  }
  return errors;
}

function selfTest(input) {
  if (validate(input.candidate, input).length) throw new Error('self-test: исходный каталог невалиден');
  console.log(`self-test: исходный каталог валиден (${input.candidate.labels.length} ключей)`);
  const probe = (name, edit, expected) => {
    const candidate = JSON.parse(JSON.stringify(input.candidate));
    const fixture = { ...input, assignments: [...input.assignments], candidate };
    edit(candidate, fixture);
    const errors = validate(candidate, fixture);
    if (!errors.some((message) => message.includes(expected))) throw new Error(`self-test FAIL: ${name}`);
    console.log(`self-test PASS: ${name} отклонена`);
  };
  probe('неизвестный слот', (candidate) => {
    candidate.labels.find((row) => row.expansion_slot_ref).expansion_slot_ref.id = 'unknown_slot';
  }, 'неизвестный expansion_slot_ref');
  probe('пять слов', (candidate) => {
    candidate.labels.find((row) => row.display_label).display_label = 'к очень далёкому северному лесу';
  }, '1–4 слова');
  probe('имя собственное в нижнем регистре', (candidate) => {
    candidate.labels.find((row) => row.display_label).display_label = 'к новгороду';
  }, 'возможное имя собственное');
  probe('пропущенная причина', (candidate) => {
    delete candidate.labels.find((row) => row.gap_reason).gap_reason;
  }, 'укажите описание либо причину пробела');
  probe('непокрытый PF', (candidate) => {
    candidate.labels.splice(candidate.labels.findIndex((row) => row.place_family_id), 1);
  }, 'не покрыт PF стартовой территории');
  probe('класс слота без вида пути', (candidate) => {
    delete candidate.passage_phrases.approach_kind_by_visible_class.forest;
  }, 'без вида пути');
  probe('фраза подхода с цифрой', (candidate) => {
    candidate.passage_phrases.approach.land = 'подход 2';
  }, 'passage_phrases.approach.land');
  probe('лишний G5 source gap для узла с PF', (candidate, fixture) => {
    const bound = fixture.nodeBindings.find((row) => row.pf_id);
    candidate.source_scope_gaps.push({ node_ref: bound.node_ref, gap_reason: 'лишний',
      source_ref: nodeRef(bound.line) });
  }, 'неизвестный или повторный G5 source gap');
  probe('несовместимый второй шаблон слота', (candidate, fixture) => {
    const record = candidate.labels.find((row) => row.common_visible_class === 'river_channel');
    const template = fixture.templates.find((row) => familyOf(row.id) === 'forest');
    const key = slotKey(record.expansion_slot_ref.id, record.expansion_slot_ref.version);
    const index = fixture.assignments.length;
    fixture.assignments.push({ slot_id: record.expansion_slot_ref.id,
      slot_version: record.expansion_slot_ref.version, template_id: template.id,
      template_version: template.version });
    record.applicable_template_refs.push({ id: template.id, version: template.version });
    record.provenance.source_refs.push(pointer(slotRef, index));
    record.provenance.source_refs.push(pointer(generationRef,
      fixture.templates.findIndex((row) => templateKey(row.id, row.version) === templateKey(template.id, template.version))));
  }, 'описание не подтверждено всеми возможными шаблонами слота');
}

try {
  const options = args(process.argv.slice(2));
  if (options.help) console.log('node validate.mjs [--self-test]');
  else {
    const input = load();
    const errors = validate(input.candidate, input);
    if (errors.length) {
      console.error(`Проверка не пройдена (${errors.length}):\n${errors.map((item) => `- ${item}`).join('\n')}`);
      process.exitCode = 1;
    } else {
      const labels = input.candidate.labels;
      console.log(`OK: ${labels.length} ключей; описаний ${labels.filter((row) => row.display_label).length}; пробелов ${labels.filter((row) => row.gap_reason).length}; G5 без PF в источнике ${input.candidate.source_scope_gaps.length}.`);
      if (options.selfTest) selfTest(input);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
