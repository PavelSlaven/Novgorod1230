import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(HERE, 'research-evidence.json');
const DEFAULT_SOURCE = '/srv/novgorod-work/fleet/tasks/start-types/out/lead-research-1.json';

// Explicit finding/check pairs: do not infer research applicability from similar prose.
const INCLUDED = [
  {
    topic: 'bort',
    items: [
      {
        finding: 0, check: 0, evidenceId: 'bort-01',
        assertion: 'Авдеев: естественный ареал Apis mellifera достигает примерно 60° с. ш.; в его формулировке он простирается от юга Франции до Сибири, не до Урала.',
        source: ['https://doc.dissercat.com/content/osobennosti-troficheskoi-spetsializatsii-raznykh-ekologicheskikh-grupp-evro-sibirskoi-pchely'],
        locator: 'Введение; северная граница ареала',
        verificationNote: 'Цитата подтверждена; исследователь отдельно сверил, что в этом источнике восточная граница указана как Сибирь, а не Урал.',
      },
      {
        finding: 1, check: 1, evidenceId: 'bort-02',
        assertion: 'Брандорф и Ивойлова указывают естественную границу ареала медоносных пчёл в России около 60° с. ш., до Урала.',
        source: ['https://apiworld.ru/1396598060.html'],
        locator: 'Введение',
        verificationNote: 'Страница проверена; найденный текст подтверждает естественную границу ареала около 60° с. ш. и до Урала.',
        short_quote: 'Естественный ареал обитания медоносных пчел в России достигает 60º с.ш., вплоть до Урала',
      },
      {
        finding: 10, check: 7, evidenceId: 'bort-03',
        source: ['https://en.wikipedia.org/wiki/Foreign_trade_of_medieval_Novgorod'],
        locator: 'Section «Tribute collection»',
        verificationNote: 'Страница содержит это обобщение о северо-восточных зависимостях, но оно не снабжено источником и не локализует пчеловодство на Нижней Двине.',
      },
    ],
  },
  {
    topic: 'orchard',
    items: [
      {
        finding: 0, check: 0, evidenceId: 'orchard-01',
        source: ['https://archaeolog.ru/press/articles/n167'],
        locator: 'Абзац о раскопках Десятинного раскопа, вторая половина XI века',
      },
      {
        finding: 1, check: 1, evidenceId: 'orchard-02',
        source: ['https://archaeolog.ru/press/articles/n167'],
        locator: 'Абзац о запустении участка в начале XIII века',
      },
      {
        finding: 10, check: 10, evidenceId: 'orchard-11',
        assertion: 'Wikipedia сообщает о саде, устроенном при архиепископе Афанасии в Холмогорах в период его служения 1682–1702 годов; состав посадок не указан.',
        source: ['https://ru.wikipedia.org/wiki/Афанасий_(Любимов)'],
        locator: 'Раздел о служении в Холмогорах; вид посадок не указан',
      },
      {
        finding: 11, check: 11, evidenceId: 'orchard-12',
        assertion: 'Поздняя журналистская статья описывает выращивание фруктов на Соловках с использованием отапливаемых теплиц; это не свидетельство по нижней Двине или XIII веку.',
        source: ['https://vestnikapk.ru/articles/portret-regiona/arkticheskie-zemledeltsy/'],
        locator: 'Раздел «Райский сад»; позднее журналистское свидетельство',
      },
      {
        finding: 13, check: 13, evidenceId: 'orchard-14',
        assertion: 'Таблица современных климатических норм Архангельска указывает среднюю температуру июля 16,5°C и зарегистрированный минимум −45,2°C; период норм не указан.',
        source: ['https://pogodaiklimat.ru/climate/22550.htm'],
        locator: 'Таблица температуры; период норм на странице не указан',
      },
    ],
  },
  {
    topic: 'quarry',
    items: [
      {
        finding: 0, check: 0, evidenceId: 'quarry-01',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Раздел «Общий рельеф», сводка скважин нижней Двины',
        short_quote: 'уходят под уровень воды',
      },
      {
        finding: 1, check: 1, evidenceId: 'quarry-02',
        assertion: 'Лаврова указывает древнейшие каменноугольные горизонты ниже Усть-Пинеги; эта региональная локализация сама по себе не устанавливает доступный выход камня у Вихтуя или Заостровья.',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Раздел «Дочетвертичные отложения»',
        short_quote: 'ниже с. Усть-Пинеги',
      },
      {
        finding: 6, check: 6, evidenceId: 'quarry-07',
        assertion: 'Материал об Орлеце сообщает, что крепость 1342 года построена из местного известняка; он не датирует начало добычи.',
        source: ['https://kenozerjelive.ru/orletz.htm', 'https://ru.wikipedia.org/wiki/Орлец_(город)'],
        locator: 'Овсянников, описание Орлецкой крепости; статья «Орлец (город)», раздел «Городище»',
        verificationNote: 'Проверяющий сверил датировку 1342 года и строительство из местного известняка; это не дата начала добычи. Цитата Овсянникова подтверждена.',
      },
      {
        finding: 14, check: 14, evidenceId: 'quarry-15',
        assertion: 'Лаврова описывает эрратические валуны в моренах региона; эта находка не локализует их плотность у Вихтуя или Заостровья.',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Разделы о нижней и верхней морене',
        short_quote: 'эрратических валунов кристаллических пород',
      },
    ],
  },
];

export function buildResearchEvidence(source) {
  const topics = new Map((source.topics ?? []).map((topic) => [topic.key, topic]));
  const entries = [];
  for (const spec of INCLUDED) {
    const topic = topics.get(spec.topic);
    if (!topic) throw new Error(`Missing source topic: ${spec.topic}`);
    for (const item of spec.items) {
      const finding = topic.research.findings[item.finding];
      const check = topic.verification.checks[item.check];
      if (!finding || !check) throw new Error(`Missing ${spec.topic} finding/check for ${item.evidenceId}`);
      if (check.status !== 'verified') throw new Error(`Non-verified finding: ${item.evidenceId} (${check.status})`);
      if (!Array.isArray(item.source) || !item.source.length || item.source.some((url) => !/^https:\/\//u.test(url))) {
        throw new Error(`Missing direct HTTPS source URL: ${item.evidenceId}`);
      }
      const entry = {
        evidence_id: item.evidenceId,
        topic: spec.topic,
        assertion: item.assertion ?? finding.claim,
        verification_status: check.status,
        source: item.source,
        locator: item.locator,
        note: item.verificationNote ?? check.note,
      };
      const quote = item.short_quote ?? finding.short_quote;
      if (quote) entry.short_quote = quote;
      entries.push(entry);
    }
  }
  return { schema: 'start_territory_research_evidence_v1', entries };
}

function main(args) {
  const checkOnly = args.includes('--check');
  const sourceIndex = args.indexOf('--source');
  const sourcePath = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1] ?? '') : DEFAULT_SOURCE;
  if (sourceIndex >= 0 && !args[sourceIndex + 1]) throw new Error('--source requires a path');
  const expected = `${JSON.stringify(buildResearchEvidence(JSON.parse(fs.readFileSync(sourcePath, 'utf8'))), null, 2)}\n`;
  if (checkOnly) {
    let actual;
    try { actual = fs.readFileSync(OUTPUT, 'utf8'); }
    catch { throw new Error(`Missing generated artifact: ${OUTPUT}`); }
    if (actual !== expected) throw new Error(`Stale research evidence: ${OUTPUT}`);
    process.stdout.write(`research evidence current: ${JSON.parse(expected).entries.length} verified findings\n`);
    return;
  }
  fs.writeFileSync(OUTPUT, expected);
  process.stdout.write(`wrote ${path.relative(process.cwd(), OUTPUT)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
