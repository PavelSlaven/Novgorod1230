// Builds trade_goods.csv and markets_practice.csv for the trade_goods_markets domain
// (group economy-trade-measures, Novgorod1230 game-base-v1).
//
// Source basis: sqlite `novgorod_1230(1) (1).sqlite` table `economy` (20 rows, curated regional
// knowledge base with A/B confidence + S-source ids -- read-only, local file, 2026-09-26);
// tools/rus13-novgorod-regional-templates/{novgorod_goods_prices_v1.tsv,novgorod_trade_rules_v1.json}
// (draft regional templates); book-evidence group economy-trade-measures (domain trade_goods_markets,
// 125/244 rows, verified+fixed independently on the remote machine 2026-09-26); category_registry.csv
// (approved item categories) where a matching category exists -- otherwise item_category_ref is a
// "gap:" placeholder (see README, this is the materials_registry gap already flagged by the sweep).
//
// Run: node build_trade_goods_markets.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toCSV } from "../../scripts/lib_csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_TG = join(__dirname, "..", "trade_goods.csv");
const OUT_MP = join(__dirname, "..", "markets_practice.csv");

const B = (id) => `book:${id}`;
const SQ = "sqlite:novgorod_1230(1)(1).economy"; // curated regional DB, read-only local source

const tgHeader = [
  "tg_id", "name_ru", "item_category_ref", "direction", "origin_region",
  "season", "practice_notes", "source_refs", "confidence",
];

const tradeGoods = [
  { tg_id: "tg_fur_pelts", name_ru: "Пушнина (мех, соболь, белка, куница и др.)",
    item_category_ref: "gap:raw_material.fur (ближайшая существующая: cat_item_material_fur_v1 — как свойство предмета, не как товарная категория)",
    direction: "export", origin_region: "Обонежье, Заволочье, Двина, Вага, Корела",
    season: "промысловый; зимнее качество ценится выше",
    practice_notes: "зависит от местных сборщиков дани и посредников; зимняя партия качественнее, риск подделки/подмены качества у ценного меха",
    source_refs: `${SQ}(пушнина,A); wk:trade-economy-gap-closure-v1; tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_fur_squirrel,price_fur_marten`,
    confidence: "A" },
  { tg_id: "tg_wax", name_ru: "Воск", item_category_ref: "cat_item_material_wax_v1;cat_item_object_beeswax_v1",
    direction: "export", origin_region: "лесные зоны, бортный промысел",
    season: "сезон сбора (весна-осень)",
    practice_notes: "контроль качества и взвешивание у церкви Ивана на Опоках (эталон капи хранится в церкви); высокий спрос на Западе",
    source_refs: `${SQ}(воск,A); ${B(301539)} §вощаный пуд эталон`, confidence: "A" },
  { tg_id: "tg_honey", name_ru: "Мёд", item_category_ref: "cat_item_object_honey_v1;cat_item_material_honey_v1",
    direction: "local;export", origin_region: "лесные зоны",
    season: "сезон сбора (лето-осень)", practice_notes: "торговый товар и пищевой продукт одновременно",
    source_refs: `${SQ}(мёд,B); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_honey`, confidence: "B" },
  { tg_id: "tg_hides_leather", name_ru: "Кожи / кожа выделанная", item_category_ref: "cat_item_material_leather_v1",
    direction: "export;local", origin_region: "город и округа",
    season: "круглый год", practice_notes: "запах и загрязнение производства, кожевенные места вынесены за жилую застройку",
    source_refs: `${SQ}(кожи,A); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_leather`, confidence: "A" },
  { tg_id: "tg_fish", name_ru: "Рыба (свежая, сушёная, солёная)", item_category_ref: "cat_item_object_fresh_fish_v1;cat_item_object_dried_fish_v1",
    direction: "local", origin_region: "Ильмень, Волхов, Ловать, Мста, северные озёра",
    season: "сезон промысла; свежая портится быстро",
    practice_notes: "ключевой белок повседневного рациона; не заменяет зерно как основу питания",
    source_refs: `${SQ}(рыба,A); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_fresh_fish,price_dried_fish`, confidence: "A" },
  { tg_id: "tg_salt", name_ru: "Соль", item_category_ref: "cat_item_material_salt_v1;cat_item_object_salt_v1",
    direction: "local;regional_export", origin_region: "Старая Русса",
    season: "круглый год (топливоёмкое производство рассолов)",
    practice_notes: "цена зависит от доступности маршрутов; при блокаде дорог резко растёт",
    source_refs: `${SQ}(соль,A); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_salt`, confidence: "A" },
  { tg_id: "tg_grain_rye", name_ru: "Зерно ржаное", item_category_ref: "gap:raw_material.grain (ближайшая: cat_item_object_bread_v1 — готовый хлеб, не зерно)",
    direction: "local;import_in_shortage", origin_region: "Приильменье и Верхняя Волга",
    season: "дешевле после жатвы, дороже к весне", practice_notes: "основа хлеба; особо уязвимо к морозу и блокаде подвоза (см. price_bands famine 1230-1231)",
    source_refs: `${SQ}(зерно:рожь,A); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_grain_rye`, confidence: "A" },
  { tg_id: "tg_grain_wheat", name_ru: "Пшеница", item_category_ref: "gap:raw_material.grain",
    direction: "import", origin_region: "южные и суздальские рынки",
    season: "—", practice_notes: "дорогой хлеб, каша, церковные нужды; в 1230 г. цена резко выросла из-за неурожая (см. price_bands)",
    source_refs: `${SQ}(пшеница,A)`, confidence: "A" },
  { tg_id: "tg_millet", name_ru: "Просо", item_category_ref: "gap:raw_material.grain",
    direction: "import", origin_region: "более тёплые южные зоны",
    season: "—", practice_notes: "крупа", source_refs: `${SQ}(просо,A)`, confidence: "A" },
  { tg_id: "tg_oats", name_ru: "Овёс", item_category_ref: "gap:raw_material.grain;gap:fodder",
    direction: "local;import", origin_region: "местная округа и импорт",
    season: "—", practice_notes: "каша людям, корм коням", source_refs: `${SQ}(овёс,A)`, confidence: "A" },
  { tg_id: "tg_barley", name_ru: "Ячмень", item_category_ref: "gap:raw_material.grain",
    direction: "local", origin_region: "местная округа",
    season: "урожайность нестабильна год от года", practice_notes: "крупа, напитки, корм",
    source_refs: `${SQ}(ячмень,B)`, confidence: "B" },
  { tg_id: "tg_flax", name_ru: "Лён", item_category_ref: "gap:raw_material.textile",
    direction: "local", origin_region: "ближняя округа",
    season: "—", practice_notes: "полотно, нити, сети; трудоёмкая обработка",
    source_refs: `${SQ}(лён,B)`, confidence: "B" },
  { tg_id: "tg_wool", name_ru: "Шерсть", item_category_ref: "gap:raw_material.textile",
    direction: "local;import", origin_region: "местное скотоводство и импорт",
    season: "—", practice_notes: "ткань, войлок; качество различно", source_refs: `${SQ}(шерсть,B)`, confidence: "B" },
  { tg_id: "tg_iron_local", name_ru: "Железо (кусковое/полоса)", item_category_ref: "gap:raw_material.metal",
    direction: "local;import", origin_region: "болотные руды и обмен",
    season: "—", practice_notes: "дорогая квалифицированная обработка; route/supply-sensitive",
    source_refs: `${SQ}(железо,B); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_iron_bar`, confidence: "B" },
  { tg_id: "tg_nonferrous_metal", name_ru: "Цветные металлы", item_category_ref: "gap:raw_material.metal",
    direction: "import", origin_region: "Балтика и Русь",
    season: "—", practice_notes: "украшения, весы, детали; часто импортное сырьё",
    source_refs: `${SQ}(цветные металлы,A)`, confidence: "A" },
  { tg_id: "tg_silver_import", name_ru: "Серебро (слитки, лом, привозной металл)", item_category_ref: "gap:raw_material.precious_metal (item_template:CRF0068)",
    direction: "import", origin_region: "международная торговля",
    season: "—", practice_notes: "«без единой регулярной монеты Новгорода 1230 г.»; ввоз немецких слитков-марок для переплавки",
    source_refs: `${SQ}(серебро,B); ${B(622242)} §немецкие слитки-марки`, confidence: "B" },
  { tg_id: "tg_wool_cloth_import", name_ru: "Сукно", item_category_ref: "gap:raw_material.textile",
    direction: "import", origin_region: "Балтика и немецкие города",
    season: "лучше доступно в навигационный сезон", practice_notes: "признак статуса, не повседневность большинства",
    source_refs: `${SQ}(сукно,A); tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#price_wool_cloth`, confidence: "A" },
  { tg_id: "tg_wine_import", name_ru: "Вино виноградное", item_category_ref: "gap:luxury_import.beverage",
    direction: "import", origin_region: "Запад/юг",
    season: "навигационный сезон", practice_notes: "литургия и элитное потребление; дорогое и ограниченное; контекст правил синода 1276 г. позже 1230, но привозной характер вина применим и к 1230 г.",
    source_refs: `${SQ}(вино,B); ${B(841960)} §вино виноградное`, confidence: "B" },
  { tg_id: "tg_weapons_blades", name_ru: "Оружие и клинки", item_category_ref: "cat_item_property_military_service_gear_v1",
    direction: "import;local_craft", origin_region: "Русь, Балтика, городские кузницы",
    season: "—", practice_notes: "качество и происхождение различны", source_refs: `${SQ}(оружие,B)`, confidence: "B" },
  { tg_id: "tg_timber_wood", name_ru: "Дерево (строевой лес)", item_category_ref: "gap:raw_material.wood",
    direction: "local", origin_region: "Приильменье",
    season: "заготовка сезонна, спрос круглый год", practice_notes: "дома, мост, стены, настилы, топливо, тара; пожароопасность",
    source_refs: `${SQ}(дерево,A)`, confidence: "A" },
  { tg_id: "tg_glassware_absent_guard", name_ru: "Западная стеклянная посуда — ОТСУТСТВУЕТ в 1230 г. (anachronism guard)",
    item_category_ref: "gap:luxury_import.glassware", direction: "absent_in_1230",
    origin_region: "Запад", season: "—",
    practice_notes: "«отсутствует в Новгороде в 1230 г.; появляется вскоре после монгольского нашествия, до 1280-х мало, в основном у бояр» — не размещать как товар на торгу в 1230 г.",
    source_refs: "book-evidence:economy-trade-measures#row110 (verified+fixed 2026-09-26)", confidence: "B" },
  { tg_id: "tg_spices_gap", name_ru: "Пряности — GAP (нет прямых свидетельств для Новгорода 1230 г.)",
    item_category_ref: "gap:luxury_import.spices", direction: "unresolved",
    origin_region: "unresolved", season: "—",
    practice_notes: "брифом отмечено «проверить»: ни sqlite economy, ни книжный корпус группы, ни MASTER не дают прямого свидетельства массовой торговли пряностями в Новгороде ~1230 г.; единичное церковно-аптечное использование теоретически возможно, но не подтверждено — оставлено как gap, а не как факт",
    source_refs: "gap; проверено против sqlite economy (20 строк), book-evidence economy-trade-measures (244 строки), master:economy_social", confidence: "" },
];

const mpHeader = [
  "mp_id", "practice_kind", "name_ru", "description_ru", "source_refs", "confidence",
];

const marketsPractice = [
  { mp_id: "mp_torg", practice_kind: "trade_place", name_ru: "Торг (ряды)",
    description_ru: "Главное место открытого обмена в городе; торговля велась по рядам (специализированным линиям), среди них — вощаной (воск) и великий ряды; не магазин, цена торгуется, толпа создаёт свидетелей.",
    source_refs: `${B(622242)} §Глава третья Древнерусские поселения > Важнейшие города Руси ¶694; tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#trade_place_torg`,
    confidence: "B" },
  { mp_id: "mp_pier", practice_kind: "trade_place", name_ru: "Пристань и берег",
    description_ru: "Товар связан с лодкой, грузчиками, погодой, очередью и правом разгрузки; мокрый груз теряет ценность; перевозчик контролирует доступ (проектное правило).",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#trade_place_pier", confidence: "C" },
  { mp_id: "mp_pogost", practice_kind: "trade_place", name_ru: "Погост",
    description_ru: "Сборная точка сельской округи, церкви, слухов, дороги и периодического (не ежедневного) обмена; не превращать в городской рынок (проектное правило).",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#trade_place_pogost", confidence: "C" },
  { mp_id: "mp_ferry", practice_kind: "trade_place", name_ru: "Переправа",
    description_ru: "Плата зависит от воды, груза, очереди, статуса и разрешения; опасная вода может закрыть обмен (проектное правило + guide_rules маршрутного знания).",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#trade_place_ferry; tools/rus13-novgorod-regional-templates/novgorod_route_knowledge_rules_v1.json#guide_may_refuse",
    confidence: "C" },
  { mp_id: "mp_boyar_yard", practice_kind: "trade_place", name_ru: "Боярский двор",
    description_ru: "Доступ к товару и людям идёт через власть двора и слуг; низкому статусу нужен посредник (проектное правило).",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#trade_place_boyar_yard", confidence: "C" },
  { mp_id: "mp_ivanskoe_sto", practice_kind: "merchant_org", name_ru: "Иванское сто (купеческая корпорация при церкви Ивана на Опоках)",
    description_ru: "Институт купеческого объединения при церкви на Опоках; управление, по пересказу Погодина, — три старосты от житых людей, тысяцкий от чёрных людей и «два старосты от купцов» (внутреннее купеческое старейшинство при церкви, не путать с договорным институтом купеческих старост в отношениях с немцами — тот не засвидетельствован до 1268 г., см. ниже); в источнике фигурирует «гривенка (половина гривны)». ВНИМАНИЕ на датировку: Устав/Рукописание Всеволода известно по поздним спискам, датировка спорна (традиционно 1130-е, но переписано много позже); договорный институт «купеческих старост» с немцами в 1230 г. не засвидетельствован (появляется в немецком проекте договора 1268 г., в русских — 1342 г.).",
    source_refs: `${B(301539)} §ТОРГОВЛЯ, КУНЫ (ДЕНЬГИ) ¶878,881,883 (управление, старосты от купцов); ${B(392896)} §ГЛАВА II. НОВГОРОД В БАЛТИЙСКОМ РЕГИОНЕ В X—XII вв. > Возникновение и местоположение Готского и Немецкого дворов ¶160 (договорный институт купеческих старост отсутствует до 1268 г.)`,
    confidence: "C" },
  { mp_id: "mp_customs_smolensk1229", practice_kind: "customs_duty", name_ru: "Пошлина с серебра — Смоленский договор 1229 г. (смоленская параллель, для Новгорода — аналогия)",
    description_ru: "Немец, покупающий серебряный сосуд, платит с гривны куну весцу (весовую пошлину); при обратной продаже пошлина не взимается («ни векши»). Норма Смоленско-Рижского торгового договора 1229 г. — прямо датирована к эпохе игры, но относится к Смоленску, а не к Новгороду; для новгородской практики её можно использовать только как региональную аналогию (прямых новгородских свидетельств весчей пошлины на 1230 г. нет — ближайшая новгородская фиксация «весчего» относится к 1259-1270 гг., см. mp_customs_veschee_caution).",
    source_refs: `${B(177850)} §Денежно-весовые системы домонгольской Руси > Глава I История вопроса, источники и методы исследования ¶40 (Смоленско-Рижский договор 1229 г.)`, confidence: "B" },
  { mp_id: "mp_customs_veschee_caution", practice_kind: "customs_duty", name_ru: "Весчее (весовая пошлина) — anachronism guard",
    description_ru: "Термин «весчее» и равенство немецких скалв русским весам зафиксированы новгородскими договорами 1259-1260 и 1262-1263 гг. — ПОЗЖЕ 1230 г. В 1230 г. новгородцы пользуются своими гирями и весами (пуд), а не немецкими скалвами; не переносить договорную терминологию 1259-1270 гг. на 1230 г. буквально.",
    source_refs: `${B(356156)} §Глава 5. Метрология > Метрология древнерусского государства (X — начало XII в.) ¶1118 (скалвы, договор 1262-1263); ${B(392896)} §ГЛАВА III. ЗАПАДНОЕВРОПЕЙСКИЕ СВЯЗИ НОВГОРОДА В XIII веке > Доганзейский период ¶204 (весчее, договор 1259-1260)`, confidence: "C" },
  { mp_id: "mp_gotland_treaty", practice_kind: "foreign_court", name_ru: "Договор Новгорода с Готским берегом и немецкими городами (1191-1192, действует к 1230 г.)",
    description_ru: "Торговое и уголовное право для иноземных купцов: штрафы, свидетели, безопасность купцов. Вира за убитого купца (новгородца или немца) — 10 гривен серебра (ср. 40 гривен кун за купца по Правде Русской — иная, внутренняя норма); существование самого договора и норма о купце подтверждены evidence напрямую (A), детали (в т.ч. вира за посла) требуют дополнительной сверки (B) — приведено единым B по правилу единого значения confidence.",
    source_refs: `${B(177850)} §Денежно-весовые системы домонгольской Руси > Глава II Денежная терминология и денежный счет домонгольской Руси ¶152; sqlite:novgorod_1230.sources#S02`, confidence: "B" },
  { mp_id: "mp_skra_I", practice_kind: "foreign_court", name_ru: "Скра I — устав немецкого купеческого двора св. Петра",
    description_ru: "Первая редакция устава («скра I») датирована второй четвертью XIII в. — применимо к ~1230 г. как ближайший прямой источник для немецкого купеческого двора. Штраф до 10 марок серебра — это наказание за торговлю с русскими в церкви св. Петра (запрет), а не общий предел обязательств; отдельно установлены штрафы за неявку на охрану двора (1 марка кун) и за отсутствие на ночном дежурстве (1 марка серебра).",
    source_refs: `${B(392896)} §ГЛАВА III. ЗАПАДНОЕВРОПЕЙСКИЕ СВЯЗИ НОВГОРОДА В XIII веке > Доганзейский период ¶186 (датировка), ¶188 (штрафы за охрану/дежурство), ¶189 (запрет торговли с русскими в церкви, штраф 10 марок серебра)`, confidence: "B" },
  { mp_id: "mp_peter_court_caution", practice_kind: "foreign_court", name_ru: "Немецкий (Петров) двор — anachronism guard",
    description_ru: "Двор существует с 1192 г. (сам факт применим к 1230 г., локализация — на Торговой стороне рядом с Ярославовым Дворищем), но детальные описания зимних/летних гостей, старшины подворья, склада при церкви св. Петра относятся в основном к ганзейской поре (XIV-XV вв.). Для состояния на ~1230 г. использовать скру I (mp_skra_I) как ближайший прямой источник, а не позднейшие ганзейские описания буквально.",
    source_refs: `${B(392896)} §ГЛАВА II. НОВГОРОД В БАЛТИЙСКОМ РЕГИОНЕ В X—XII вв. > Возникновение и местоположение Готского и Немецкого дворов ¶166 (основание 1192 г.), ¶167 (расположение на Торговой стороне)`,
    confidence: "C" },
  { mp_id: "mp_debt_zapisi", practice_kind: "credit_pledge_witness", name_ru: "Долговые записи на бересте (истина и намы)",
    description_ru: "В берестяных долговых записях «истина» обозначает сумму основного долга, «намы» — проценты с неё; сам термин засвидетельствован в разделе Янина о берестяных грамотах посадника Юрия Онцифоровича (XIV в.) — для 1230 г. это по датировке источника более поздняя параллель, а не прямое свидетельство. Допустимый ростовщический процент по Правде Русской (Владимиров устав) — 10 кун на гривну в год (не запрещается) — эта норма прямо подтверждена для эпохи.",
    source_refs: `${B(254935)} §Посадник Юрий Онцифорович и другие ¶129 (истина и намы, XIV в., аналогия); ${B(641351)} §РУССКАЯ ПРАВДА (ПРОСТРАННАЯ РЕДАКЦИЯ) > ПЕРЕВОД ¶2806 (10 кун на гривну в год, Владимиров устав)`, confidence: "B" },
  { mp_id: "mp_pledge_witness_rules", practice_kind: "credit_pledge_witness", name_ru: "Правила залога, поручительства и свидетеля (проектная реконструкция)",
    description_ru: "Держатель залога не всегда владелец вещи, право остаётся спорным до расчёта; свидетель нужен при спорной вещи, долге, залоге, цене или повреждении имущества; поручитель отвечает своей репутацией и долгом поручаемого. Проектное правило (не прямая цитата источника); правовая основа по Русской Правде выше (закуп, статьи 52-55: не всякая утрата или уход закупа приравнивается к бегству или обельному холопству — см. wk:residual-law-norms-v1).",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#debt_pledge_and_witness_rules,#status_restrictions; wk:residual-law-norms-v1#claim:residual-law-zakup-complaint-not-escape,claim:residual-law-zakup-illegal-sale",
    confidence: "C" },
  { mp_id: "mp_weight_standard_caution", practice_kind: "measurement_standard", name_ru: "Эталоны мер при Иванском сто — anachronism guard",
    description_ru: "Источник (Долгов, по пересказу Устава Всеволода) перечисляет эталоны, хранимые иванским старостой совместно с епархиальной властью: «мерила торговая», скалвы вощаные, пуд медовый, «гривенку рублевую», локоть иванский. Термин «гривенка рублевая» указывает на ПОЗДНИЙ (рублёвый) счёт — рубль как единица для 1230 г. анахронизм (см. currencies_measures). Список эталонов целиком не переносить на 1230 г.; локоть иванский как отдельный физический эталон (сер.XII-сер.XIII в.) — см. measure_units.csv.",
    source_refs: `${B(180605)} §Глава 2 Человек в панораме города-государства: власть и общество ¶653 (Рукописание Всеволода, датировка памятника спорна)`, confidence: "C" },
  { mp_id: "mp_merchant_weighing_kit", practice_kind: "measurement_standard", name_ru: "Складной разновес купца (личный инвентарь)",
    description_ru: "Купец при поясе носил складные весы с разновесом для мелких взвешиваний (описание относится к X в., приведено как аналогия по устойчивости практики); крупные грузы (до 7-8 пудов) взвешивались большими весами-безменами (находки в Новгороде и Старой Рязани). Соответствует находкам предметов TRD0037 (равноплечие весы купца), TRD0038 (складные карманные весы), TRD0058 (крупные торговые весы).",
    source_refs: `${B(709382)} §Путешествие в X в. Дружинники и огородники ¶377 (складные весы, X в., medieval_general); ${B(622242)} §Глава десятая Международные связи В.П. Даркевич ¶2481 (большие весы-безмены); item_template:TRD0037;TRD0038;TRD0058`, confidence: "B" },
];

writeFileSync(OUT_TG, toCSV(tgHeader, tradeGoods), "utf8");
writeFileSync(OUT_MP, toCSV(mpHeader, marketsPractice), "utf8");

console.log(`trade_goods.csv: ${tradeGoods.length} rows`);
console.log(`markets_practice.csv: ${marketsPractice.length} rows`);
