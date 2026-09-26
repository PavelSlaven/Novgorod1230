// Deterministic build for anachronism_denylist_lexicon/denylist.csv.
//
// Fixed 2026-09-26 per VERIFICATION.md "rework" findings:
// - The 20 costume ANTI001-020 rows are no longer copied in here. The
//   source file (sources/costume-dataset-v1/data/anti_patterns.csv) is
//   itself only "candidate", not "approved" (see sources/README.md), so
//   the earlier blanket confidence:B here had no approved basis, and the
//   rows duplicated clothing-appearance/garments/denylist.csv, which is
//   the owner with the real match_pattern/scope columns this domain's own
//   brief-acceptance test needs. Per "one owner per list": misc now only
//   *references* that file (see referencesExternalOwner below) instead of
//   re-importing its rows under a second owner.
// - applies_to_domains now uses real catalog.json domain ids, not group
//   names.
// - a match_pattern column was added (regex fragment for prose scanning),
//   matching the shape garments/denylist.csv and nature-materials-weather
//   already use.
// - an_potato confidence A->B (its WK claim qualifiers are
//   confidence:medium, directness:editorial — that is catalog B, not A).
// - fa_no_potato_tomato_maize confidence B->C (only potato is covered by
//   the cited WK claim; tomato/maize are added by analogy, not sourced).
// - the windmill replacement for an_steam_engine removed (no project
//   source places windmills in the Novgorod land by 1230).
// - an_glass_window_ordinary_house re-sourced from verified book evidence
//   (Рыбаков и др. 1985; Рыбаков 2013) and moved C->B.
// - missing catalog anachronism-convention terms added as real denylist
//   rows (previously only referenced inside one forbidden_assumption, or
//   entirely absent): кукуруза, томат, подсолнечник, табак, индейка,
//   кролик как скот, тяжеловозы, чай, кофе, сахар-песок.
// Run: node build.mjs (writes ../denylist.csv, prints row count).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Owner reference row: NOT a denylist term itself, kept out of the row
// count on purpose (see README "Источники" for the full explanation).
// costume ANTI001-020 anachronisms live in and are owned by:
//   clothing-appearance/garments/denylist.csv (status: candidate)
// check.mjs does not require this file to duplicate those 20 rows.

const gapNote = "Датировка общеизвестна, но не подтверждена источником проекта; нужен библиографический источник прежде статуса B.";

const manual = [
  {
    an_id: "an_steam_engine",
    kind: "denylist",
    term_ru: "паровая машина / паровой двигатель",
    match_pattern: "паров(ая|ой) (машин|двигател)",
    applies_to_domains: "craft_processes;transport_travel",
    reason: "Атмосферный поршневой паровой двигатель введён не ранее circa 1712 (Newcomen); для Новгорода 1230 недопустим ни как технология, ни как деталь описания.",
    earliest_attestation_or_basis: "introduced_circa_1712",
    modern_gloss: "Машина, превращающая тепло сжигаемого топлива в механическую работу через пар.",
    replacement_term: "ручной, конный или водяной привод",
    source_refs: "wk:claim:technology-newcomen-boundary",
    confidence: "A",
    note: "Исправлено 2026-09-26: убран «ветряной привод» из replacement_term — ни один источник проекта не помещает ветряные мельницы в Новгородскую землю к 1230 г. (в Руси они датируются существенно позже); водяное колесо оставлено без уточнения типа (наливное/подливное), так как конкретный тип не подтверждён источником.",
  },
  {
    an_id: "an_electric_motor",
    kind: "denylist",
    term_ru: "электрический мотор / электричество как привод",
    match_pattern: "электрич\\w* (мотор|двигател|привод|освещен)",
    applies_to_domains: "craft_processes;transport_travel",
    reason: "Непрерывное электромагнитное вращение продемонстрировано не ранее 1821 (Фарадей); электрический привод или освещение для 1230 года недопустимы.",
    earliest_attestation_or_basis: "introduced_1821",
    modern_gloss: "Устройство, превращающее электрический ток в механическое вращение.",
    replacement_term: "лучина, масляная/жировая лампа, свеча; ручной/конный/водяной привод",
    source_refs: "wk:claim:technology-motor-boundary",
    confidence: "A",
    note: "",
  },
  {
    an_id: "an_potato",
    kind: "denylist",
    term_ru: "картофель",
    match_pattern: "картоф|картошк",
    applies_to_domains: "cultivated_plants;food_ingredients",
    reason: "Картофель не должен считаться местно доступным в Новгороде/Руси 1200–1300 гг.; европейское распространение культуры — Новое время (после колумбова обмена).",
    earliest_attestation_or_basis: "post-1500 (колумбов обмен); в России — не ранее XVII–XVIII вв.",
    modern_gloss: "Клубнеплод Solanum tuberosum, происходящий из Южной Америки.",
    replacement_term: "репа, брюква, капуста, горох, бобы",
    source_refs: "wk:claim:r7-potato-must-not-be-assumed-locally-available-in-novgorod-rus-1200-1300",
    confidence: "B",
    note: "Исправлено 2026-09-26: confidence A→B и applies_to_domains поправлены — цитируемый claim несёт qualifiers.confidence=medium/directness=editorial (world-knowledge/production-v1/final-static-r7-gap-repair-v1.json), что по конвенции каталога соответствует B (editorial), а не A (первичный/археологический источник). South America gloss и датировка XVII–XVIII вв. — общеизвестные факты, не в самом claim; см. earliest_attestation_or_basis как редакторское основание.",
  },
  {
    an_id: "an_maize",
    kind: "denylist",
    term_ru: "кукуруза",
    match_pattern: "кукуруз",
    applies_to_domains: "cultivated_plants;food_ingredients",
    reason: "Кукуруза — культура американского происхождения, недоступна в Восточной Европе до колумбова обмена; не должна считаться местной культурой Новгорода/Руси 1230 г.",
    earliest_attestation_or_basis: "post-1500 колумбов обмен (общеизвестная датировка; отдельной WK-претензии по кукурузе, кроме потatо-claim, не найдено)",
    modern_gloss: "Zea mays, злак американского происхождения.",
    replacement_term: "рожь, овёс, ячмень, полба, пшеница",
    source_refs: "wk:claim:r7-potato-must-not-be-assumed-locally-available-in-novgorod-rus-1200-1300;gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: "Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал как отдельная строка). Цитируемый WK claim целиком про картофель, а не про кукурузу — используется только по аналогии (тот же колумбов обмен); отдельного источника по кукурузе в проекте нет, отсюда C, а не B.",
  },
  {
    an_id: "an_tomato",
    kind: "denylist",
    term_ru: "помидор / томат",
    match_pattern: "помидор|томат",
    applies_to_domains: "cultivated_plants;food_ingredients",
    reason: "Томат — культура американского происхождения, недоступна в Восточной Европе до колумбова обмена; не должен считаться местной культурой Новгорода/Руси 1230 г.",
    earliest_attestation_or_basis: "post-1500 колумбов обмен (общеизвестная датировка; отдельной WK-претензии по томату, кроме потatо-claim, не найдено)",
    modern_gloss: "Solanum lycopersicum, плодовая культура американского происхождения.",
    replacement_term: "нет прямого местного эквивалента; капуста/огурец/лук как овощная база блюда",
    source_refs: "wk:claim:r7-potato-must-not-be-assumed-locally-available-in-novgorod-rus-1200-1300;gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: "Добавлено 2026-09-26 (каталожный термин из conventions.anachronism). См. note an_maize — тот же колумбов обмен по аналогии, отдельного источника нет, отсюда C.",
  },
  {
    an_id: "an_sunflower",
    kind: "denylist",
    term_ru: "подсолнечник / подсолнечное масло",
    match_pattern: "подсолнеч",
    applies_to_domains: "cultivated_plants;food_ingredients",
    reason: "Подсолнечник — культура американского происхождения, в Восточной Европе как масличная культура распространяется только с XIX в.; не должен считаться местной культурой Новгорода 1230 г.",
    earliest_attestation_or_basis: "распространение в России как масличная культура — XIX в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Helianthus annuus, масличная культура американского происхождения.",
    replacement_term: "льняное, конопляное или маковое масло; животный жир",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_tobacco",
    kind: "denylist",
    term_ru: "табак / курение табака",
    match_pattern: "табак|курен\\w* трубк",
    applies_to_domains: "cultivated_plants;recreation_culture",
    reason: "Табак — культура американского происхождения; курение табака в Восточной Европе фиксируется не ранее XVI–XVII вв. и было под запретом на Руси; недопустим для Новгорода 1230 г.",
    earliest_attestation_or_basis: "не ранее XVI–XVII вв. в Восточной Европе (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Nicotiana, растение американского происхождения, куримое как табак.",
    replacement_term: "нет местной замены-курения; ароматические травы/ладан для запаха в быту, если подтверждены источником",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_turkey_bird",
    kind: "denylist",
    term_ru: "индейка (домашняя птица)",
    match_pattern: "индейк",
    applies_to_domains: "livestock_husbandry",
    reason: "Индейка — домашняя птица американского происхождения, завезена в Европу после колумбова обмена; не должна считаться местной домашней птицей Новгорода 1230 г.",
    earliest_attestation_or_basis: "post-1500 колумбов обмен; в Европе как домашняя птица — XVI в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Meleagris gallopavo, домашняя птица американского происхождения.",
    replacement_term: "курица, гусь, утка",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_rabbit_livestock",
    kind: "denylist",
    term_ru: "кролик как хозяйственный скот",
    match_pattern: "кролик",
    applies_to_domains: "livestock_husbandry",
    reason: "Домашнее кролиководство как хозяйственная отрасль на Руси документируется значительно позже 1230 г.; кролик не должен фигурировать как обычный домашний скот новгородского двора.",
    earliest_attestation_or_basis: "домашнее кролиководство в России — не ранее XVIII в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Oryctolagus cuniculus, разводимый как домашний скот на мясо/мех.",
    replacement_term: "куры, гуси, утки, овцы, козы как обычный мелкий скот двора; дикий заяц — объект охоты, не скот",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism: «кролик как скот», ранее отсутствовал).",
  },
  {
    an_id: "an_heavy_draft_horse",
    kind: "denylist",
    term_ru: "тяжеловозы (порода тяжёлой лошади)",
    match_pattern: "тяжеловоз",
    applies_to_domains: "livestock_husbandry",
    reason: "Специализированные породы тяжёлых лошадей-тяжеловозов выведены в Европе и России в XVIII–XIX вв.; не должны считаться обычной лошадью новгородского двора 1230 г.",
    earliest_attestation_or_basis: "породы тяжеловозов — XVIII–XIX вв. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Крупная упряжная лошадь специализированной тяжеловозной породы.",
    replacement_term: "рабочая лошадь местного некрупного типа, без породной специализации",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_tea",
    kind: "denylist",
    term_ru: "чай (как напиток)",
    match_pattern: "\\bчай\\b|чаепит",
    applies_to_domains: "food_ingredients;trade_goods_markets",
    reason: "Чай как торговый и питьевой товар попадает в Россию не ранее XVII в.; недопустим как напиток Новгорода 1230 г.",
    earliest_attestation_or_basis: "чай в России — не ранее XVII в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Напиток из листьев Camellia sinensis.",
    replacement_term: "травяные и ягодные настои, квас, мёд разведённый водой",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_coffee",
    kind: "denylist",
    term_ru: "кофе",
    match_pattern: "кофе",
    applies_to_domains: "food_ingredients;trade_goods_markets",
    reason: "Кофе как товар и напиток попадает в Россию не ранее конца XVII – начала XVIII в. (эпоха Петра I); недопустим для Новгорода 1230 г.",
    earliest_attestation_or_basis: "кофе в России — не ранее конца XVII – начала XVIII в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Напиток из жареных зёрен Coffea.",
    replacement_term: "травяные и ягодные настои, квас, мёд разведённый водой",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism, ранее отсутствовал).",
  },
  {
    an_id: "an_sugar_granulated",
    kind: "denylist",
    term_ru: "сахар-песок / сахар как обычная приправа",
    match_pattern: "сахар",
    applies_to_domains: "food_ingredients;trade_goods_markets",
    reason: "Тростниковый/свекловичный сахар-песок как обычная бытовая приправа распространяется в России значительно позже 1230 г.; сладость новгородского стола 1230 г. — мёд, а не сахар.",
    earliest_attestation_or_basis: "сахар как импортный товар в России — не ранее позднего Средневековья/Нового времени; массовое бытовое использование — ещё позже (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Кристаллический сахар (сахароза) как бытовая приправа/подсластитель.",
    replacement_term: "мёд как основной подсластитель",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote + " Добавлено 2026-09-26 (каталожный термин из conventions.anachronism: «сахар-песок», ранее отсутствовал).",
  },
  {
    an_id: "an_gunpowder_firearm",
    kind: "denylist",
    term_ru: "огнестрельное оружие / порох",
    match_pattern: "огнестрел|порох|пушк|мушкет|пистол",
    applies_to_domains: "weapons_armour;military_security",
    reason: "Огнестрельное оружие и порох в Восточной Европе фиксируются не ранее XIV века; для 1230 года недопустимы ни как предмет, ни как технология.",
    earliest_attestation_or_basis: "не ранее XIV в. (общеизвестная датировка; точный библиографический источник проекта не найден)",
    modern_gloss: "Оружие, использующее энергию сгорания пороха для метания снаряда.",
    replacement_term: "лук, самострел (арбалет), копьё, меч, топор",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote,
  },
  {
    an_id: "an_mechanical_clock_minutes",
    kind: "denylist",
    term_ru: "механические часы с минутной стрелкой",
    match_pattern: "механич\\w* час|минутн\\w* стрелк",
    applies_to_domains: "calendar_feasts_fasts;household_items;personal_items",
    reason: "Механические часы с минутной стрелкой — техника позднего Средневековья/Нового времени; в 1230 году время делят по солнцу, церковным службам и приметам, а не по механическому циферблату.",
    earliest_attestation_or_basis: "механические башенные часы — не ранее XIV в.; минутная стрелка — не ранее XVI в. (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Прибор, механически отмеряющий равные интервалы времени с точностью до минуты.",
    replacement_term: "церковные часы служб, солнце, петухи, песочные/водяные меры длительности (если подтверждены отдельным источником)",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote,
  },
  {
    an_id: "an_table_fork",
    kind: "denylist",
    term_ru: "столовая вилка",
    match_pattern: "столов\\w* вилк",
    applies_to_domains: "food_ingredients;household_items;personal_items",
    reason: "Столовая вилка как обычный бытовой прибор в Восточной Европе распространяется значительно позже XIII века; обычная еда бралась руками, ложкой и ножом.",
    earliest_attestation_or_basis: "распространение в быту — Новое время (общеизвестная датировка, без библиографического источника проекта)",
    modern_gloss: "Столовый прибор с зубцами для накалывания пищи.",
    replacement_term: "ложка, нож, руки",
    source_refs: "gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: gapNote,
  },
  {
    an_id: "an_glass_window_ordinary_house",
    kind: "denylist",
    term_ru: "стеклянные окна в обычном доме",
    match_pattern: "стеклянн\\w* окн",
    applies_to_domains: "buildings_structures;interiors_scenes",
    reason: "Стекло в окнах массового жилья Новгорода XIII века не подтверждено; проём закрывали ставнем, бычьим пузырём, слюдой (при достатке) или волоковым окном.",
    earliest_attestation_or_basis: "не подтверждено для массового жилья 1230; круглое стекло/слюда засвидетельствованы для богатых построек",
    modern_gloss: "Прозрачный стеклянный лист, закрывающий оконный проём.",
    replacement_term: "волоковое окно, ставень, бычий пузырь, слюда (у зажиточных)",
    source_refs: "book:622242 §Глава четвертая Сооружения ¶1210;book:423821 ¶1601;book:709382 §Новгородские постройки ¶258",
    confidence: "B",
    note: "Исправлено 2026-09-26: перенесено C→B с реальным источником вместо gap-маркера — book:622242 §Глава четвертая Сооружения ¶1210 (Рыбаков, Даркевич и др., «Древняя Русь. Город, замок, село», 1985: круглое стекло в деревянных оконных рамах и слюда в богатых постройках) и book:423821 ¶1601 (Рыбаков, 2013: крестьянские избы топились по-чёрному, дым в малое оконце — обычное жильё без стекла), плюс book:709382 §Новгородские постройки ¶258 (Засурцев — дымоход через волоковое окно). Слюда подтверждена только для богатых построек, не как общая замена, — это отражено в replacement_term.",
  },
];

const forbiddenAssumptions = [
  {
    an_id: "fa_no_modern_engine",
    kind: "forbidden_assumption",
    term_ru: "не предполагать двигатель внутреннего сгорания, паровой или электрический привод",
    match_pattern: "",
    applies_to_domains: "craft_processes;transport_travel",
    reason: "LLM-пакеты (llm_context_packs.forbidden_assumptions) не должны допускать механизированный привод при генерации сцен/предметов/процессов 1230 года.",
    earliest_attestation_or_basis: "",
    modern_gloss: "",
    replacement_term: "",
    source_refs: "wk:claim:technology-newcomen-boundary;wk:claim:technology-motor-boundary",
    confidence: "A",
    note: "Носитель — world_base.llm_context_packs.forbidden_assumptions (0 строк в БД).",
  },
  {
    an_id: "fa_no_potato_tomato_maize",
    kind: "forbidden_assumption",
    term_ru: "не предполагать картофель, помидор или кукурузу как местную еду",
    match_pattern: "",
    applies_to_domains: "cultivated_plants;food_ingredients",
    reason: "Все три культуры — американского происхождения, недоступны в Восточной Европе до колумбова обмена; LLM не должен вводить их как местный урожай или еду 1230 года.",
    earliest_attestation_or_basis: "post-1500 колумбов обмен",
    modern_gloss: "",
    replacement_term: "репа/брюква/капуста/горох вместо картофеля; нет прямого местного эквивалента помидору/кукурузе",
    source_refs: "wk:claim:r7-potato-must-not-be-assumed-locally-available-in-novgorod-rus-1200-1300;gap:no_project_bibliographic_source_yet",
    confidence: "C",
    note: "Исправлено 2026-09-26: confidence B→C — цитируемый WK claim подтверждает только картофель; помидор и кукуруза добавлены по аналогии (тот же колумбов обмен), без отдельного источника проекта, поэтому слабейшее звено (томат/кукуруза) определяет confidence всей строки.",
  },
  {
    an_id: "fa_no_named_invented_historical_figure",
    kind: "forbidden_assumption",
    term_ru: "не выдумывать имена и роли реальных исторических лиц 1230–1250",
    match_pattern: "",
    applies_to_domains: "historical_figures;personal_names;peoples_origins",
    reason: "Владелец (#133) требует, чтобы код отклонял выдуманных LLM исторических лиц; LLM не должен присваивать вымышленные слова, решения или родство реальным именованным персонам эпохи.",
    earliest_attestation_or_basis: "",
    modern_gloss: "",
    replacement_term: "закрытый список реальных лиц (см. пробел ниже: sqlite persons_1230, 14 строк) плюс полностью вымышленные NPC вне этого списка",
    source_refs: "issue:#133",
    confidence: "B",
    note: "Сам закрытый список лиц не входит в этот домен (владелец — historical_figures); здесь фиксируется только правило-запрет для LLM-пакетов.",
  },
];

const rows = [...manual, ...forbiddenAssumptions];

const header = [
  "an_id","kind","term_ru","match_pattern","applies_to_domains","reason",
  "earliest_attestation_or_basis","modern_gloss","replacement_term",
  "source_refs","confidence","note",
];

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const lines = [header.join(",")];
for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(","));
writeFileSync(path.join(__dirname, "..", "denylist.csv"), lines.join("\n") + "\n", "utf-8");
const denylistCount = manual.length;
console.log(`denylist.csv: ${rows.length} rows (${denylistCount} denylist, ${forbiddenAssumptions.length} forbidden_assumption; costume ANTI001-020 referenced from clothing-appearance/garments/denylist.csv, not duplicated here)`);
