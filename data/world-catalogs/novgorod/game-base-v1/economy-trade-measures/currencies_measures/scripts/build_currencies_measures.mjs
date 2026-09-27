// Builds currency_units.csv and measure_units.csv for the currencies_measures domain
// (group economy-trade-measures, Novgorod1230 game-base-v1).
//
// Source basis (see source_refs per row + ../../sources/books.csv for bibliographic detail):
//  - book:177850 Yanin, "Denezhno-vesovye sistemy..." (2009) -- verified via the book-evidence
//    pipeline (economy-trade-measures.csv/.VERIFICATION.md/.FIXES.md, 244/244 rows accepted, 0 rejected,
//    38 rows corrected for period labelling) run independently on the remote machine 2026-09-26.
//  - book:641351 BLDR t.4 (Pravda Russkaya translation + birchbark letters, primary source).
//  - book:356156, book:622242, book:254935, book:233420, book:392896 -- see books.csv.
//  - master-archive-v1/data/economy_social/{currencies,units_and_measures}.csv (approved region audit).
//  - matcult material_items.csv (item_template_ref for physical money/weighing objects).
//
// Rule for this table (owner decision + brief): record a ratio ONLY when a source states it for a
// dated context; otherwise ratio_to_kuna = "unresolved" and confidence stays C. Never invent a number.
//
// Run: node build_currencies_measures.mjs   (writes ../currency_units.csv and ../measure_units.csv)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toCSV } from "../../scripts/lib_csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_CM = join(__dirname, "..", "currency_units.csv");
const OUT_MS = join(__dirname, "..", "measure_units.csv");

const B = (id) => `book:${id}`; // shorthand; full citation lives in ../../sources/books.csv

const currencyHeader = [
  "cu_id", "name_ru", "kind", "ratio_to_kuna", "ratio_basis",
  "item_template_ref", "period_validity", "source_refs", "confidence",
];

const currencies = [
  {
    cu_id: "cu_grivna_serebra", name_ru: "Гривна серебра (слиток)",
    kind: "physical_money;money_of_account", ratio_to_kuna: 200,
    ratio_basis: "Смоленский договор 1229 г. (прямо датирован к эпохе): гривна серебра = 4 гривны кун; гривна кун = 50 кун (Пространная Правда, действует в XIII в.) => 4×50=200",
    item_template_ref: "item_template:TRD0046;item_template:CRF0068",
    period_validity: "1180-1260",
    source_refs: `${B(177850)} §Смоленский договор 1229; ${B(641351)} §Правда Русская; wk:trade-economy-gap-closure-v1; master:economy_social/currencies.csv#n1230:currency:novgorod_silver_grivna_ingot`,
    confidence: "A",
  },
  {
    cu_id: "cu_grivna_serebra_weight_theoretical", name_ru: "Гривна серебра — теоретическая весовая норма",
    kind: "weight_definition", ratio_to_kuna: "",
    ratio_basis: "51.19 г (гривна кун) × 4 = 204.756 г — теоретическая счётная норма Янина для Пространной Правды; согласуется с денежным соотношением 1:4",
    item_template_ref: "", period_validity: "1180-1260",
    source_refs: `${B(177850)} §денежно-весовые нормы`, confidence: "B",
  },
  {
    cu_id: "cu_grivna_serebra_ingot_practical", name_ru: "Новгородский слиток-гривна — практический вес находок",
    kind: "physical_money;weight_object", ratio_to_kuna: 200,
    ratio_basis: "Законный вес новгородского слитка XIII в. — 196.2 г (15 «гривен из ногат» по 13.08 г); длинные бруски 14-20 см характерны для 1230 г., более короткие с горбатой спинкой — позднейший тип (не для 1230)",
    item_template_ref: "item_template:TRD0046", period_validity: "1200-1260",
    source_refs: `${B(177850)} §слиток XIII в. (датировка по Н. П. Бауэру)`, confidence: "B",
  },
  {
    cu_id: "cu_grivna_kun", name_ru: "Гривна кун (счётная)",
    kind: "money_of_account", ratio_to_kuna: 50,
    ratio_basis: "Пространная Правда (действует в XIII в.): гривна кун = 20 ногат = 50 кун; резана слита с куной к рубежу XII-XIII вв.",
    item_template_ref: "", period_validity: "1180-1260",
    source_refs: `${B(177850)} §счёт Пространной Правды; master:economy_social/currencies.csv#n1230:currency:grivna_money_of_account`,
    confidence: "B",
  },
  {
    cu_id: "cu_nogata", name_ru: "Ногата",
    kind: "money_of_account", ratio_to_kuna: 2.5,
    ratio_basis: "1 гривна кун = 20 ногат = 50 кун => 1 ногата = 2.5 куны (Пространная Правда)",
    item_template_ref: "", period_validity: "1180-1260",
    source_refs: `${B(177850)}; master:economy_social/currencies.csv#n1230:currency:nogata_account`,
    confidence: "B",
  },
  {
    cu_id: "cu_kuna", name_ru: "Куна",
    kind: "money_of_account", ratio_to_kuna: 1,
    ratio_basis: "базовая единица счёта Пространной Правды к 1230 г.; к этому периоду куна = резане",
    item_template_ref: "", period_validity: "1180-1260",
    source_refs: `${B(177850)}; ${B(641351)} §берестяная грамота № 238`,
    confidence: "B",
  },
  {
    cu_id: "cu_rezana", name_ru: "Резана",
    kind: "money_of_account;archaic_term", ratio_to_kuna: 1,
    ratio_basis: "«В Пространной Правде резана исчезает, её место везде занимает куна» (Янин); термин ещё встречается в берестяных грамотах нач. XIII в. как пережиточный (№238, №247) наравне с куной",
    item_template_ref: "", period_validity: "transitional_pre-1230_residual_use",
    source_refs: `${B(177850)}; ${B(641351)} §берестяные грамоты №238, №247`,
    confidence: "B",
  },
  {
    cu_id: "cu_veksha_bela", name_ru: "Векша / бела",
    kind: "money_of_account;small_unit", ratio_to_kuna: "unresolved",
    ratio_basis: "«Отношение векши к гривне по письменным источникам домонгольского времени не устанавливается» (Янин); норма «векша=1/200 гривны» известна лишь по источникам XV в. и НЕ переносится на 1230 г. Правда Русская фиксирует векшу как счётную единицу судебной пошлины (метельнику 9 векш, в иных тяжбах 6 векш), но не даёт курса к гривне.",
    item_template_ref: "", period_validity: "1180-1260 (unit attested; ratio to grivna not established for this period)",
    source_refs: `${B(177850)}; ${B(641351)} §судебная пошлина; master:economy_social/currencies.csv#n1230:currency:veksha_bela_account`,
    confidence: "C",
  },
  {
    cu_id: "cu_hacksilver_scrap", name_ru: "Рубленое серебро и серебряный лом",
    kind: "physical_payment_material", ratio_to_kuna: "by_weight_only",
    ratio_basis: "принимается по весу и видимому состоянию, не по номиналу; ср. «крупьё» — резаные куски западных монет, принимавшиеся на вес (XI в., по аналогии)",
    item_template_ref: "item_template:CRF0068", period_validity: "1180-1260",
    source_refs: `${B(254935)} §крупьё; master:economy_social/currencies.csv#n1230:currency:hacksilver_scrap`,
    confidence: "B",
  },
  {
    cu_id: "cu_foreign_silver_coin", name_ru: "Иноземная серебряная монета (денарий и др.)",
    kind: "foreign_physical_coin", ratio_to_kuna: "context_dependent",
    ratio_basis: "«К 1229 г. всякий ввоз серебряной монеты на Русь прекратился полностью» (Янин) — к 1230 г. иноземная монета практически не в обороте как ходячая монета; встречается как металл в кладах/переплавке",
    item_template_ref: "item_template:TRD0043;item_template:FRN0046",
    period_validity: "mostly pre-1200; not a circulating coin by 1230",
    source_refs: `${B(177850)} §прекращение ввоза монеты; master:economy_social/currencies.csv#n1230:currency:western_denarius_general`,
    confidence: "B",
  },
  {
    cu_id: "cu_german_ingot_import", name_ru: "Немецкий слиток-марка (импортный)",
    kind: "foreign_physical_ingot", ratio_to_kuna: "",
    ratio_basis: "XII - 40-е гг. XIII в.: растёт ввоз немецких слитков-марок; их переплавляли в русские гривны для крупных платежей",
    item_template_ref: "", period_validity: "1180-1250",
    source_refs: `${B(622242)} §немецкие слитки-марки`, confidence: "B",
  },
  {
    cu_id: "cu_kievan_hexagonal_ingot", name_ru: "Киевская гривна (шестиугольный слиток)",
    kind: "physical_money;foreign_regional_form", ratio_to_kuna: "163.8g (weight; not a Novgorod account form)",
    ratio_basis: "южный тип, в Новгороде редкие находки; «сорочек» — единицы по 4.095 г (южная ногата = 2 северные куны)",
    item_template_ref: "item_template:CRF0068", period_validity: "1180-1260; region_scope=south, rare_in_novgorod",
    source_refs: `${B(177850)} §шестиугольный слиток`, confidence: "B",
  },
  {
    cu_id: "cu_fur_money_episodic", name_ru: "Меховые деньги (шкурки)",
    kind: "commodity_money;episodic", ratio_to_kuna: "",
    ratio_basis: "«Меха могли временно выполнять функции денег, главным образом на крупных международных рынках» (Янин); Ал-Гарнати (1150-1153): сделки старыми беличьими шкурками. НЕ всеобщее средство обмена — таковым остаётся серебро.",
    item_template_ref: "", period_validity: "episodic; not the everyday medium",
    source_refs: `${B(177850)} §меховые деньги; ${B(622242)} §Ал-Гарнати`, confidence: "B",
  },
  {
    cu_id: "cu_leather_money_denied", name_ru: "Кожаные деньги — ОТСУТСТВУЮТ (anachronism guard)",
    kind: "negative_fact", ratio_to_kuna: "",
    ratio_basis: "«Раскопки Новгорода (более 100 тыс. кожаных изделий) не дали ничего похожего на кожаные деньги» — не вводить кожаные деньги как средство платежа",
    item_template_ref: "", period_validity: "n/a",
    source_refs: `${B(233420)} §опровержение`, confidence: "B",
  },
  {
    cu_id: "cu_barter_goods_as_payment", name_ru: "Товар (ткань, воск, мёд, меха и др.) как форма платежа при обмене",
    kind: "commodity_exchange_form", ratio_to_kuna: "",
    ratio_basis: "натуральный обмен без фиксированного курса; качество и срочность важнее универсального курса (проектное правило, не историческая цифра)",
    item_template_ref: "", period_validity: "1230-1250",
    source_refs: "tools/rus13-novgorod-regional-templates/novgorod_trade_rules_v1.json#exchange_barter",
    confidence: "C",
  },
];

const measureHeader = [
  "ms_id", "name_ru", "physical_quantity", "ratio_to_base", "base_unit",
  "ratio_basis", "period_validity", "source_refs", "confidence",
];

const measures = [
  {
    ms_id: "ms_pyad", name_ru: "Пядь", physical_quantity: "length",
    ratio_to_base: "0.5 локтя (≈19-23 см)", base_unit: "лόкоть",
    ratio_basis: "«сажень = 4 локтя = 8 пядей» ⇒ локоть = 2 пяди; «древнерусская пядь 19-23 см: малая 19, большая 22-23» (Рыбаков, через Леонтьеву и др.)",
    period_validity: "1180-1260", source_refs: `${B(356156)}`, confidence: "B",
  },
  {
    ms_id: "ms_lokot", name_ru: "Локоть (обычный, новгородско-псковский)", physical_quantity: "length",
    ratio_to_base: "1 (base) ≈ 44-46 см", base_unit: "лόкоть",
    ratio_basis: "«новгородско-псковская система длины опиралась на пядь 22-23 см, локоть 44-46 см, сажень 176-184 см» для Новгорода XII-XV вв.",
    period_validity: "1180-1260", source_refs: `${B(356156)}`, confidence: "B",
  },
  {
    ms_id: "ms_lokot_ivanskiy", name_ru: "Локоть иванский (эталон при церкви Ивана на Опоках)", physical_quantity: "length",
    ratio_to_base: "≈44 см (реконструкция; 1/4 мерной сажени 176.4 см)", base_unit: "лόкоть",
    ratio_basis: "фрагмент эталона с надписью «Святого иванск…» (Ярославово Дворище), палеографическая дата сер. XII - сер. XIII в.; отдельная находка стержня-меры 54.7 см датирована рубежом XI-XII вв. и применима к XIII в. только по аналогии",
    period_validity: "сер.XII-сер.XIII в. (эталон-фрагмент); рубеж XI-XII в. (стержень-мера, аналогия)",
    source_refs: `${B(356156)}`, confidence: "B",
  },
  {
    ms_id: "ms_sazhen", name_ru: "Сажень (мерная)", physical_quantity: "length",
    ratio_to_base: "4 локтя = 8 пядей ≈176.4 см", base_unit: "лόкоть",
    ratio_basis: "явное соотношение сажень=4 локтя=8 пядей + иванский локоть-эталон (176.4 см = 4×44.1 см)",
    period_validity: "1180-1260", source_refs: `${B(356156)}`, confidence: "B",
  },
  {
    ms_id: "ms_sazhen_variants", name_ru: "Сажень — иные виды (великая/прямая/косая)", physical_quantity: "length",
    ratio_to_base: "великая 249.46 см; прямая 152.76 см; косая 216 см (variants, not the default мерная)",
    base_unit: "n/a (parallel systems)",
    ratio_basis: "типология саженей по Рыбакову; несколько параллельных систем измерения существовали одновременно, применимость зависит от контекста/практики измерения",
    period_validity: "1180-1260, context-dependent", source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_versta", name_ru: "Верста (поприще)", physical_quantity: "length",
    ratio_to_base: "≈750 сажен (ранняя норма; позднее 500)", base_unit: "сажень",
    ratio_basis: "«верста в древности - 750 саженей, позднее 500; размер не был строго фиксирован» — не считать точным числом",
    period_validity: "1180-1260, variable/not fixed", source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_pood", name_ru: "Пуд", physical_quantity: "mass",
    ratio_to_base: "1 (base для сыпучих/весовых крупных партий, напр. воска)", base_unit: "пуд",
    ratio_basis: "в ходу для торговли воском согласно Уставу (Рукописанию) Всеволода церкви Ивана на Опоках (памятник известен по поздним спискам, датировка спорна); metric equivalence не фиксируется этим корпусом — избегать современного килограммового пересчёта без source-specific оговорки",
    period_validity: "1180-1260", source_refs: `${B(356156)}; ${B(301539)} §вощаный пуд эталон; master:economy_social/units_and_measures.csv#n1230:unit:pood`,
    confidence: "B",
  },
  {
    ms_id: "ms_berkovets", name_ru: "Берковец", physical_quantity: "mass",
    ratio_to_base: "10 пудов (норма ПОЗДНЕЕ 1230 г.; для 1230 г. точное соотношение не установлено)", base_unit: "пуд",
    ratio_basis: "«позднее берковец = 10 пудам... точное соотношение для XIII в. не установлено» — берковец использовался как мера воска в дальней торговле, но численный курс к пуду для 1230 г. не подтверждён",
    period_validity: "unit attested by 1230; exact ratio only from a later period",
    source_refs: `${B(356156)}; master:economy_social/units_and_measures.csv#n1230:unit:berkovets`,
    confidence: "C",
  },
  {
    ms_id: "ms_kap", name_ru: "Капь", physical_quantity: "mass",
    ratio_to_base: "4 пуда (равенство установлено договором 1269 г. — ПОЗЖЕ 1230 г.)", base_unit: "пуд",
    ratio_basis: "капь как единица известна раньше (договор 1229 г., грамота №439 — эталон капи хранился в церкви), но численное равенство капь=4 пуда зафиксировано лишь договором 1269 г.",
    period_validity: "unit attested 1229; numeric ratio only from 1269 (anachronism guard for the ratio)",
    source_refs: `${B(356156)}; ${B(301539)} §эталон капи`, confidence: "C",
  },
  {
    ms_id: "ms_bezmen", name_ru: "Безмен", physical_quantity: "mass;weighing_device_unit",
    ratio_to_base: "unresolved (used to count small bulk goods, e.g. tin: «около четырёх безменов олова»)", base_unit: "",
    ratio_basis: "берестяная грамота XII - нач. XIII в. использует безмен как счётную меру количества металла",
    period_validity: "1180-1230", source_refs: `${B(641351)} §берестяная грамота (олово)`, confidence: "A",
  },
  {
    ms_id: "ms_zolotnik", name_ru: "Золотник", physical_quantity: "mass",
    ratio_to_base: "small weight unit; the later exact 4.266 g standard is a post-medieval fixation, not asserted here for 1230",
    base_unit: "", ratio_basis: "мелкая единица веса; более точная числовая норма относится к позднейшим источникам",
    period_validity: "attestation mostly later; applicability to 1230 as a named small unit only",
    source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_pochka", name_ru: "Почка", physical_quantity: "mass",
    ratio_to_base: "мелкая единица веса для благородных металлов (≈0.17 г, позднее «пирог»=1/4 почки)", base_unit: "",
    ratio_basis: "поздние данные; применимость к 1230 г. не подтверждена этим корпусом",
    period_validity: "later sources; uncertain for 1230", source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_kad", name_ru: "Кадь", physical_quantity: "dry_capacity",
    ratio_to_base: "≈14 московских пудов (≈229 кг) по Никитскому — РЕТРОСПЕКТИВНЫЙ пересчёт через позднейший московский пуд; региональная вариация подтверждена (кадь ростовская отличается от новгородской)",
    base_unit: "пуд (retrospective conversion only)",
    ratio_basis: "«деление на четверти и осьмины в древнерусских источниках не встречается» — не использовать четверть/осьмину кади как засвидетельствованные доли; кадь ростовская иная (в селе на два плуга 16 кадей ржи)",
    period_validity: "1180-1260, regional variant", source_refs: `${B(356156)}; master:economy_social/units_and_measures.csv#n1230:unit:kad`,
    confidence: "B",
  },
  {
    ms_id: "ms_uborok", name_ru: "Уборок", physical_quantity: "dry_capacity",
    ratio_to_base: "величина не выяснена", base_unit: "",
    ratio_basis: "Правда Русская: «7 уборков пшена, 7 уборков гороха на неделю» — единица засвидетельствована, объём не дан",
    period_validity: "1180-1260", source_refs: `${B(641351)}; ${B(356156)}`, confidence: "A",
  },
  {
    ms_id: "ms_lukno", name_ru: "Лукно", physical_quantity: "dry_capacity",
    ratio_to_base: "величина не выяснена", base_unit: "",
    ratio_basis: "Правда Русская: «7 лукон овса на 4 коня, солода 10 лукон»",
    period_validity: "1180-1260", source_refs: `${B(641351)}; ${B(356156)}`, confidence: "A",
  },
  {
    ms_id: "ms_golvazhnya", name_ru: "Голважня (соли)", physical_quantity: "dry_or_bulk_capacity",
    ratio_to_base: "величина не выяснена", base_unit: "",
    ratio_basis: "Правда Русская: «7 голважен соли на неделю»",
    period_validity: "1180-1260", source_refs: `${B(641351)}`, confidence: "A",
  },
  {
    ms_id: "ms_vedro", name_ru: "Ведро", physical_quantity: "liquid_capacity",
    ratio_to_base: "объём не определён для 1230 г.", base_unit: "",
    ratio_basis: "«реальный объём древних мер жидкостей (ведро, бочка) определить не удалось»; Правда Русская: «7 вёдер солода на неделю» вирнику",
    period_validity: "1180-1260", source_refs: `${B(641351)}; ${B(356156)}`, confidence: "A",
  },
  {
    ms_id: "ms_bochka_novgorod_later", name_ru: "Бочка новгородская — позднейшая норма (аналогия)", physical_quantity: "liquid_or_bulk_capacity",
    ratio_to_base: "=10 вёдер, насадка=2.5 ведра (писцовые книги XV в. — НЕ для 1230 г.)", base_unit: "ведро",
    ratio_basis: "источник XV в.; для 1230 г. допустима лишь как позднейшая аналогия, не как факт",
    period_validity: "XV в.; anachronism guard for direct 1230 use", source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_dezha", name_ru: "Дежа", physical_quantity: "dry_capacity",
    ratio_to_base: "объём не установлен", base_unit: "",
    ratio_basis: "новгородская мера зерна, упомянута в берестяных грамотах; величина не определена этим корпусом",
    period_validity: "1180-1260", source_refs: `${B(356156)}`, confidence: "C",
  },
  {
    ms_id: "ms_korobya_later", name_ru: "Коробья — позднейшая норма (аналогия)", physical_quantity: "dry_capacity",
    ratio_to_base: "=4 четвертки = 16 четвериков ≈7 пудов (источник с сер. XV в. — НЕ для 1230 г.)", base_unit: "пуд",
    ratio_basis: "поздняя мера; для 1230 г. — только как аналогия, не как факт региона/периода",
    period_validity: "XV в.; anachronism guard for direct 1230 use",
    source_refs: `${B(356156)}; master:economy_social/units_and_measures.csv#n1230:unit:korobya`, confidence: "C",
  },
];

writeFileSync(OUT_CM, toCSV(currencyHeader, currencies), "utf8");
writeFileSync(OUT_MS, toCSV(measureHeader, measures), "utf8");

console.log(`currency_units.csv: ${currencies.length} rows`);
console.log(`measure_units.csv: ${measures.length} rows`);
