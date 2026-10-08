import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoot = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/datasets';
const candidateRoot = 'data/world-catalogs/novgorod/character-appearance-v2/candidate';
const sourcePins = Object.freeze({
  region_appearance_profile_entries: '61230c341f418e386f9213b93cf1f7d43c0bf3751a7aab62300cfadec7fa66b5',
  region_appearance_profiles: 'b1d2f8a5129de7f2a7e71cc3f3d4dc33e702eaf301398b6b8df059e302ac5cd1',
  region_category_options: '777eab954536900c981bc84f5f496a0e7a5ffcd6ad5a34abc9c166433753862d',
  region_demographic_profile_entries: 'a5c5a1e24d24222eda9a77bdc0659533b2cd7aea82db9a36fa34b2e82170e5af',
  region_demographic_profiles: '9a7fffa8f4e00db21363b2b67c227ca81b460f5803322e32da0a0709bf21c0cd',
  universal_categories: 'a48cc78b57789967622776863999fa475703766a11edfcd39d3fdf52fff81006'
});
const outputTables = ['region_appearance_profiles', 'region_appearance_profile_entries'];
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readPinned(table) {
  const file = `${sourceRoot}/${table}.json`;
  const bytes = await readFile(resolve(root, file));
  const actual = sha256(bytes);
  if (actual !== sourcePins[table]) {
    throw new Error(`${file}: source pin mismatch (${actual})`);
  }
  return JSON.parse(bytes);
}

function applyD152Overlay(records) {
  const result = structuredClone(records);
  let baldRows = 0;
  let ordinaryLengthRows = 0;
  let hairColorRows = 0;
  let straightRows = 0;

  for (const row of result.region_appearance_profile_entries) {
    if (row.facet === 'hair_length') {
      const value = row.option_id.slice('nov_1200_1250_hair_length_'.length);
      if (value === 'bald') {
        row.weight = 9;
        row.applicability = { sex_category: ['male'], age_category: ['middle_aged', 'old'] };
        baldRows += 1;
      } else if (['short', 'medium', 'long'].includes(value)) {
        row.weight = 17;
        row.applicability = {};
        ordinaryLengthRows += 1;
      } else {
        throw new Error(`Unexpected hair length option: ${row.option_id}`);
      }
    }
    if (row.facet === 'hair_color') {
      row.applicability = { 'appearance.hair.length': ['short', 'medium', 'long'] };
      hairColorRows += 1;
    }
    if (row.option_id === 'nov_1200_1250_hair_style_straight') {
      row.applicability = { 'appearance.hair.length': ['short', 'medium', 'long'] };
      straightRows += 1;
    }
  }

  if (baldRows !== 1 || ordinaryLengthRows !== 3 || hairColorRows === 0 || straightRows !== 1) {
    throw new Error(`Unexpected source vocabulary counts: bald=${baldRows}, lengths=${ordinaryLengthRows}, colors=${hairColorRows}, straight=${straightRows}`);
  }
  return result;
}

async function derive() {
  const records = Object.fromEntries(await Promise.all(
    Object.keys(sourcePins).map(async (table) => [table, await readPinned(table)])
  ));
  const overlay = applyD152Overlay(records);
  const outputs = Object.fromEntries(outputTables.map((table) => [
    `${candidateRoot}/datasets/${table}.json`, json(overlay[table])
  ]));
  const datasets = outputTables.map((table) => ({
    table,
    file: `datasets/${table}.json`,
    sha256: sha256(outputs[`${candidateRoot}/datasets/${table}.json`]),
    source_file: `${sourceRoot}/${table}.json`,
    source_sha256: sourcePins[table]
  }));
  const manifest = {
    schema: 'rus.character_appearance_candidate.v2',
    candidate_id: 'novgorod_character_appearance_v2_candidate',
    version: 2,
    appearance_profile_id: 'novgorod_1200_1250_appearance_profile_v1',
    status: 'pending_independent_data_review',
    import_authorized: false,
    production_activation: false,
    runtime_selectable_in_canonical_production: false,
    generated_by: 'tools/world-catalog-workflow/src/generate-character-appearance-v2-content.mjs',
    calibration_file: 'calibration.md',
    datasets,
    source_pins: Object.entries(sourcePins).map(([table, sha256]) => ({
      table,
      file: `${sourceRoot}/${table}.json`,
      sha256
    }))
  };
  outputs[`${candidateRoot}/manifest.json`] = json(manifest);
  outputs[`${candidateRoot}/calibration.md`] = [
    '# Калибровка внешности v2',
    '',
    'D152 задаёт одну игровую калибровку bald: для мужчин среднего и пожилого возраста вес bald равен 9, а веса short, medium и long равны 17 каждый. При общем выборе длины это 9 / (9 + 17 + 17 + 17) = 15%. Женщины и молодые мужчины не входят в applicability bald.',
    '',
    'Это калибровка частоты для игры по решению владельца D71/D152. Она не является историческим утверждением, статистической оценкой населения Руси XIII века или выводом из источников. Закреплённые v4 source pins фиксируют происхождение исходных каталогов; эти источники не подтверждают частоту.',
    '',
    '## Заранее заданные критерии D102',
    '',
    '- Проверить 10 000 seed на каждую из восьми когорт sex × age.',
    '- Для male/middle_aged и male/old ожидать 1350–1650 bald результатов в каждой когорте; для остальных шести когорт — ровно 0.',
    '- У каждого bald результата отсутствуют собственные поля `color` и `style`; у каждого non-bald результата оба поля присутствуют и принадлежат закрытому словарю.',
    '- Пол и возраст ограничивают bald через applicability candidate data; materializer не содержит hardcode половых или возрастных когорт.',
    '',
    'Независимое DATA approval не выдано этим генератором. Кандидат ожидает отдельного ревью; импорт, production activation и выбор в canonical production запрещены manifest-флагами.',
    ''
  ].join('\n');
  return outputs;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node tools/world-catalog-workflow/src/generate-character-appearance-v2-content.mjs [--check]');
  }
  const checkOnly = args[0] === '--check';
  const outputs = await derive();
  const failures = [];
  for (const [relativePath, content] of Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b))) {
    const path = resolve(root, relativePath);
    if (checkOnly) {
      let existing;
      try {
        existing = await readFile(path, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (existing !== content) failures.push(relativePath);
      continue;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    process.stdout.write(`${relativePath} ${sha256(content)}\n`);
  }
  if (checkOnly && failures.length > 0) {
    throw new Error(`Generated candidate differs or is missing: ${failures.join(', ')}`);
  }
  if (checkOnly) process.stdout.write(`--check OK (${Object.keys(outputs).length} files)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
