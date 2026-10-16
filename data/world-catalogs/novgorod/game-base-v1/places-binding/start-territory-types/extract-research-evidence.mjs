import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
        findingLocator: "Introduction; the northern Perm 'Visherskaya' ecological group is named as the northern limit",
        checkClaim: 'Avdeev 2006 (dissercat): natural range reaches 60N', evidenceId: 'bort-01',
        assertion: 'Авдеев: естественный ареал Apis mellifera достигает примерно 60° с. ш.; в его формулировке он простирается от юга Франции до Сибири, не до Урала.',
        source: ['https://doc.dissercat.com/content/osobennosti-troficheskoi-spetsializatsii-raznykh-ekologicheskikh-grupp-evro-sibirskoi-pchely'],
        locator: 'Введение; северная граница ареала',
        verificationNote: 'Цитата подтверждена; исследователь отдельно сверил, что в этом источнике восточная граница указана как Сибирь, а не Урал.',
      },
      {
        findingLocator: 'Introduction of the article (no page numbers on the web copy)',
        checkClaim: 'Brandorf and Ivoylova (apiworld.ru): range reaches 60N up to the Urals', evidenceId: 'bort-02',
        assertion: 'Брандорф и Ивойлова указывают естественную границу ареала медоносных пчёл в России около 60° с. ш., до Урала.',
        source: ['https://apiworld.ru/1396598060.html'],
        locator: 'Введение',
        verificationNote: 'Страница проверена; найденный текст подтверждает естественную границу ареала около 60° с. ш. и до Урала.',
        short_quote: 'Естественный ареал обитания медоносных пчел в России достигает 60º с.ш., вплоть до Урала',
      },
      {
        findingLocator: 'Section on exports and tribute (no page; Wikipedia, unsourced in the part I read)',
        checkClaim: 'en.wikipedia Foreign trade of medieval Novgorod: hunting, fishing and bee-keeping important in the northeast', evidenceId: 'bort-03',
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
        findingLocator: 'archaeolog.ru/press/articles/n167, para on 2nd half of XI c.',
        checkClaim: 'F1 Desyatinny: apple stumps, 2nd half XI c.', evidenceId: 'orchard-01',
        source: ['https://archaeolog.ru/press/articles/n167'],
        locator: 'Абзац о раскопках Десятинного раскопа, вторая половина XI века',
      },
      {
        findingLocator: "archaeolog.ru/press/articles/n167, para 'В начале XIII в. изучаемая территория запустела'",
        checkClaim: 'F2 Desyatinny: abandoned early XIII c., then gardens', evidenceId: 'orchard-02',
        source: ['https://archaeolog.ru/press/articles/n167'],
        locator: 'Абзац о запустении участка в начале XIII века',
      },
      {
        findingLocator: 'ru.wikipedia.org/wiki/Афанасий_(Любимов), section on Kholmogory tenure',
        checkClaim: "F11 Archbishop Afanasy's garden at Kholmogory", evidenceId: 'orchard-11',
        assertion: 'Wikipedia сообщает о саде, устроенном при архиепископе Афанасии в Холмогорах в период его служения 1682–1702 годов; состав посадок не указан.',
        source: ['https://ru.wikipedia.org/wiki/Афанасий_(Любимов)'],
        locator: 'Раздел о служении в Холмогорах; вид посадок не указан',
      },
      {
        findingLocator: "vestnikapk.ru/articles/portret-regiona/arkticheskie-zemledeltsy/, section 'Райский сад'",
        checkClaim: 'F12 Solovki (65°N) apples, greenhouses, botanical garden 1822', evidenceId: 'orchard-12',
        assertion: 'Поздняя журналистская статья описывает выращивание фруктов на Соловках с использованием отапливаемых теплиц; это не свидетельство по нижней Двине или XIII веку.',
        source: ['https://vestnikapk.ru/articles/portret-regiona/arkticheskie-zemledeltsy/'],
        locator: 'Раздел «Райский сад»; позднее журналистское свидетельство',
      },
      {
        findingLocator: 'pogodaiklimat.ru/climate/22550.htm, temperature table',
        checkClaim: 'F14 Arkhangelsk climate normals', evidenceId: 'orchard-14',
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
        findingLocator: "section 'Obshchiy relief' (relief of the Dvina depression)",
        checkClaim: 'Lavrova 1937: bedrock below Pinega mouth goes under water; 55/76.5-77/93 m depths; Palaeozoic only on tributaries', evidenceId: 'quarry-01',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Раздел «Общий рельеф», сводка скважин нижней Двины',
        short_quote: 'уходят под уровень воды',
      },
      {
        findingLocator: "section 'Dochetvertichnye otlozheniya' (pre-Quaternary deposits)",
        checkClaim: 'Lavrova: oldest Carboniferous below Ust-Pinega, limestone grading to variegated sandstone', evidenceId: 'quarry-02',
        assertion: 'Лаврова указывает древнейшие каменноугольные горизонты ниже Усть-Пинеги; эта региональная локализация сама по себе не устанавливает доступный выход камня у Вихтуя или Заостровья.',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Раздел «Дочетвертичные отложения»',
        short_quote: 'ниже с. Усть-Пинеги',
      },
      {
        findingLocator: "Ovsyannikov text; Wikipedia section 'Городище'",
        checkClaim: '1342 Orlets kremlin, earliest stone, ~300 m wall, one of ten oldest Russian stone fortresses', evidenceId: 'quarry-07',
        assertion: 'Материал об Орлеце сообщает, что крепость 1342 года построена из местного известняка; он не датирует начало добычи.',
        source: ['https://kenozerjelive.ru/orletz.htm', 'https://ru.wikipedia.org/wiki/Орлец_(город)'],
        locator: 'Овсянников, описание Орлецкой крепости; статья «Орлец (город)», раздел «Городище»',
        verificationNote: 'Проверяющий сверил датировку 1342 года и строительство из местного известняка; это не дата начала добычи. Цитата Овсянникова подтверждена.',
      },
      {
        findingLocator: 'sections on the lower and upper moraine and on marine deposits',
        checkClaim: 'Lavrova: erratic boulders in upper moraine, more in the west', evidenceId: 'quarry-15',
        assertion: 'Лаврова описывает эрратические валуны в моренах региона; эта находка не локализует их плотность у Вихтуя или Заостровья.',
        source: ['https://evgengusev.narod.ru/moreyu/lavrova-1937.html'],
        locator: 'Разделы о нижней и верхней морене',
        short_quote: 'эрратических валунов кристаллических пород',
      },
    ],
  },
];

export function buildResearchEvidence(source, included = INCLUDED) {
  const topics = new Map((source.topics ?? []).map((topic) => [topic.key, topic]));
  const entries = [];
  for (const spec of included) {
    const topic = topics.get(spec.topic);
    if (!topic) throw new Error(`Missing source topic: ${spec.topic}`);
    for (const item of spec.items) {
      const findings = topic.research.findings.filter((row) => row.locator === item.findingLocator);
      const checks = topic.verification.checks.filter((row) => row.claim === item.checkClaim);
      if (findings.length !== 1 || checks.length !== 1) throw new Error(`Missing or ambiguous source finding/check for ${item.evidenceId}`);
      const finding = findings[0];
      const check = checks[0];
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
        source_sha256: createHash('sha256')
          .update(JSON.stringify([finding.claim, check.claim, check.status, check.note]))
          .digest('hex'),
      };
      const quote = item.short_quote ?? finding.short_quote;
      if (quote) entry.short_quote = quote;
      entries.push(entry);
    }
  }
  return { schema: 'start_territory_research_evidence_v1', entries };
}

export function assertEvidenceSourceMatches(source, evidence, included = INCLUDED) {
  const expected = buildResearchEvidence(source, included);
  const expectedById = new Map(expected.entries.map((entry) => [entry.evidence_id, entry]));
  const actualById = new Map((evidence.entries ?? []).map((entry) => [entry.evidence_id, entry]));
  if (actualById.size !== evidence.entries?.length || expectedById.size !== actualById.size) {
    throw new Error('Research evidence IDs do not match source selection');
  }
  for (const [evidenceId, expectedEntry] of expectedById) {
    const actualEntry = actualById.get(evidenceId);
    if (!actualEntry || actualEntry.source_sha256 !== expectedEntry.source_sha256) {
      throw new Error(`Research evidence source drift requires review: ${evidenceId}`);
    }
  }
}

function main(args) {
  const checkOnly = args.includes('--check');
  const sourceIndex = args.indexOf('--source');
  const sourcePath = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1] ?? '') : DEFAULT_SOURCE;
  if (sourceIndex >= 0 && !args[sourceIndex + 1]) throw new Error('--source requires a path');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const expectedObject = buildResearchEvidence(source);
  const expected = `${JSON.stringify(expectedObject, null, 2)}\n`;
  if (checkOnly) {
    let actual;
    try { actual = fs.readFileSync(OUTPUT, 'utf8'); }
    catch { throw new Error(`Missing generated artifact: ${OUTPUT}`); }
    let actualObject;
    try { actualObject = JSON.parse(actual); }
    catch { throw new Error(`Invalid generated artifact: ${OUTPUT}`); }
    assertEvidenceSourceMatches(source, actualObject);
    const sortById = (data) => ({ ...data, entries: [...data.entries].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)) });
    if (JSON.stringify(sortById(actualObject)) !== JSON.stringify(sortById(expectedObject))) {
      throw new Error(`Stale research evidence: ${OUTPUT}`);
    }
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
