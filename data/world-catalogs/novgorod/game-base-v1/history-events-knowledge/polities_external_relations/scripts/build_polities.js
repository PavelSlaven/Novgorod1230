// polities_external_relations: merges rus13tpl novgorod_neighbor_regions_v1 (6 regional entries, draft),
// the historical_key_npc external-pressure figures already collected in historical_figures.csv,
// sqlite territories (tribute peripheries T16-T25), the S02 1191-1192 Gotland/German-towns treaty already
// in the sqlite sources table, and a small set of web-researched facts (title+URL) for real gaps
// (Livonian Order formation 1237, Mongol invasion 1237-1238, Battle of the Neva 1240 authorship dispute).
const fs = require('fs');
const path = require('path');
const [, , NEIGHBOR_F, SQLITE_F, OUT_DIR] = process.argv;
const nb = JSON.parse(fs.readFileSync(NEIGHBOR_F, 'utf8'));
const sq = JSON.parse(fs.readFileSync(SQLITE_F, 'utf8'));

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

const rows = [];

// 1) from rus13tpl neighbor_regions (6, draft) -- these are regional peripheries, not sovereign external polities,
// except vladimir_suzdal_land which is a genuine principality.
for (const n of nb.neighbor_regions) {
  rows.push({
    po_id: 'po_region_' + n.neighbor_region_id,
    name_ru: n.neighbor_region_title,
    name_en: '',
    kind: n.neighbor_region_id === 'vladimir_suzdal_land' ? 'principality' : 'region_periphery',
    relation_period: '1230-1250',
    status: n.relationship_type.includes('military_pressure') || n.relationship_type.includes('military') ? 'смешанный: союз/данническая зависимость/эпизодическое военное давление' : 'смешанный: торговля, church, слухи',
    event_refs: '',
    tribute_or_treaty_refs: '',
    visible_presence: (n.relationship_type || []).join('|'),
    peoples_ref: '',
    source_refs: 'rus13tpl novgorod_neighbor_regions_v1.json (draft) [' + n.neighbor_region_id + ']',
    confidence: 'C',
    status_flag: 'candidate',
  });
}

// 2) sqlite territories T16-T25 (tribute/dependent peripheries: Obonezhye, Karelia, Belozerye, Zavolochye,
// Vazhskaya, Yemetsk, Dvina, Pinega, Pechora, Yugra) -- confidence B/C per source table, S07/S30.
const tributeIds = ['T16','T17','T18','T19','T20','T21','T22','T23','T24','T25'];
for (const t of sq.territories.filter(t => tributeIds.includes(t.id))) {
  rows.push({
    po_id: 'po_periphery_' + t.id.toLowerCase(),
    name_ru: t.name,
    name_en: '',
    kind: 'tribe_or_tribute_zone',
    relation_period: '1230-1250',
    status: t.status_type,
    event_refs: '',
    tribute_or_treaty_refs: 'дань/пушнина (см. function)',
    visible_presence: t.function,
    peoples_ref: t.caveat,
    source_refs: 'sqlite novgorod_1230(1).territories [' + t.id + '], sources=' + t.sources,
    confidence: t.confidence,
    status_flag: 'candidate',
  });
}

// 3) Pskov as sub-centre (T09, already A-confidence chronicle-attested) — distinct row since brief lists it explicitly.
const pskov = sq.territories.find(t => t.id === 'T09');
rows.push({
  po_id: 'po_pskov_land', name_ru: 'Псковская земля', name_en: 'Pskov land', kind: 'city',
  relation_period: '1230-1250', status: pskov.status_type + '; ' + pskov.caveat,
  event_refs: '', tribute_or_treaty_refs: '', visible_presence: pskov.function, peoples_ref: '',
  source_refs: 'sqlite novgorod_1230(1).territories [T09], sources=' + pskov.sources,
  confidence: pskov.confidence, status_flag: 'candidate',
});

// 4) External powers not covered by the region files at all (the critic-flagged gap) -- built from the
// historical_key_npc figures already collected + targeted web research for real gaps (title+URL cited).
const external = [
  {
    po_id: 'po_vladimir_suzdal_principality', name_ru: 'Владимиро-Суздальское великое княжение', name_en: 'Grand Principality of Vladimir-Suzdal',
    kind: 'principality', relation_period: '1230-1246',
    status: 'родственно-политический сюзерен и источник князей для Новгорода; Ярослав Всеволодович — новгородский князь 1231–1236 (по НПЛ прибыл 30.12.1230), с 1238 великий князь Владимирский; после смерти сажает сыновей Александра и Андрея в Новгород',
    event_refs: 'nov_hist_1230_004 (возвращение Ярослава)',
    tribute_or_treaty_refs: '',
    visible_presence: 'княжеская дружина, тиуны, послы, вести о великокняжеском дворе',
    peoples_ref: '',
    source_refs: 'НПЛ (S01, sqlite persons_1230 R03/R04/R05) + Yaroslav Vsevolodovich, Wikipedia, https://en.wikipedia.org/wiki/Yaroslav_Vsevolodovich (проверено веб-поиском 2026-09-26 для дат великого княжения 1238-1246 и новгородского княжения 1231-1236)',
    confidence: 'A/B', status_flag: 'candidate',
  },
  {
    po_id: 'po_mongol_horde', name_ru: 'Монгольское нашествие (улус Батыя)', name_en: 'Mongol invasion (Batu\'s ulus)',
    kind: 'kingdom', relation_period: '1237-1240 (нашествие); 1240-1250 (данническая зависимость Владимиро-Суздальской земли, косвенно затрагивающая Новгород)',
    status: 'военная угроза общерусского масштаба; зимой 1237-1238 разорены Рязань, Владимир, Торжок (взят 5 марта 1238); войско дошло до Игнач-креста (~100 км от Новгорода) и повернуло назад из-за распутицы/леса, не дойдя до города — сам Новгород не разорён',
    event_refs: 'исторический фон 1237-1238; фигура hist_npc_batu_khan',
    tribute_or_treaty_refs: 'позднее (после 1240-х) даннические отношения через владимиро-суздальских князей — вне точной фиксации в этом проходе',
    visible_presence: 'беженцы из разорённых земель, слухи о нашествии, страх, рост цен, изменение княжеской политики',
    peoples_ref: '',
    source_refs: 'Mongol invasion of Rus, Wikipedia, https://en.wikipedia.org/wiki/Mongol_invasion_of_Kievan_Rus%27 (проверено веб-поиском 2026-09-26 — взятие Торжка 5 марта 1238, поворот у Игнач-креста, Новгород не взят)',
    confidence: 'B', status_flag: 'candidate',
  },
  {
    po_id: 'po_livonian_order', name_ru: 'Ливонский орден', name_en: 'Livonian Order',
    kind: 'order', relation_period: '1237-1250',
    status: 'создан в мае 1237 г. включением остатков разбитого при Сауле (1236) Ордена меченосцев в состав Тевтонского ордена как автономная ветвь; военно-политическое давление на Псковско-Новгородское пограничье, включая поход на Изборск/Псков 1240 и Ледовое побоище 1242',
    event_refs: 'фигуры hist_npc_hermann_dorpat, hist_npc_andreas_von_velven',
    tribute_or_treaty_refs: '',
    visible_presence: 'слухи о немецкой угрозе, беженцы из Изборска/Пскова, военная тревога, послы',
    peoples_ref: '',
    source_refs: 'Livonian Order / Battle of Saule, Wikipedia, https://en.wikipedia.org/wiki/Livonian_Order и https://en.wikipedia.org/wiki/Battle_of_Saule (проверено веб-поиском 2026-09-26 — включение в Тевтонский орден май 1237 после разгрома при Сауле 22.09.1236)',
    confidence: 'B', status_flag: 'candidate',
  },
  {
    po_id: 'po_dorpat_bishopric', name_ru: 'Дерптское (Юрьевское) епископство', name_en: 'Bishopric of Dorpat',
    kind: 'bishopric', relation_period: '1224-1250',
    status: 'церковно-политический актор на границе с Псковской землёй; епископ Герман фон Буксгевден действует как источник военно-политического давления и слухов около 1240-1242',
    event_refs: 'фигура hist_npc_hermann_dorpat',
    tribute_or_treaty_refs: '',
    visible_presence: 'слухи о немцах, тревога духовенства и пограничных дворов',
    peoples_ref: '',
    source_refs: 'rus13tpl novgorod_key_npc_seeds_v1.json (draft) [hist_npc_hermann_dorpat]; общая датировка епископства уточняется требует отдельной сверки — не подтверждена в этом проходе веб-поиском',
    confidence: 'C', status_flag: 'candidate',
  },
  {
    po_id: 'po_sweden_kingdom', name_ru: 'Шведское королевство', name_en: 'Kingdom of Sweden',
    kind: 'kingdom', relation_period: '1240',
    status: 'западное военное давление; Невская битва 15 июля 1240 г. (Александр Ярославич разбил вторгшееся войско); авторство похода (Биргер ярл) — спорно: самые ранние источники, называющие Биргера, датируются серединой XV в., современные историки называют также ярла Ульфа Фасе; не утверждать личность командующего как факт',
    event_refs: 'фигура hist_npc_birger_magnusson',
    tribute_or_treaty_refs: '',
    visible_presence: 'слухи о шведской угрозе на Невском направлении, тревога в Ладоге',
    peoples_ref: '',
    source_refs: 'Battle of the Neva, Wikipedia, https://en.wikipedia.org/wiki/Battle_of_the_Neva (проверено веб-поиском 2026-09-26 — дата 15 июля 1240 и спор об авторстве похода Биргера)',
    confidence: 'B', status_flag: 'candidate',
  },
  {
    po_id: 'po_lithuania', name_ru: 'Литовские земли (объединение при Миндовге)', name_en: 'Lithuanian lands (Mindaugas)',
    kind: 'principality', relation_period: '1230-е-1250',
    status: 'набеги на западно-южные новгородские/псковские волости; растущее военно-политическое давление на фоне объединения литовских земель Миндовгом (коронован позже, в 1253 г., то есть уже за пределами 1230-1250, но процесс объединения относится к этому периоду)',
    event_refs: 'фигура hist_npc_mindaugas',
    tribute_or_treaty_refs: '',
    visible_presence: 'слухи о набегах, беглецы с западно-южных дорог, военная тревога',
    peoples_ref: '',
    source_refs: 'rus13tpl novgorod_key_npc_seeds_v1.json (draft) [hist_npc_mindaugas]; коронация Миндовга 1253 г. — общеизвестный факт, не проверен отдельным веб-поиском в этом проходе',
    confidence: 'C', status_flag: 'candidate',
  },
  {
    po_id: 'po_gotland_german_towns', name_ru: 'Готский берег (Висбю) и немецкие города', name_en: 'Gotland shore (Visby) and German towns',
    kind: 'city', relation_period: '1191/1192-1250 (действующий договорной режим)',
    status: 'формальный торговый и уголовно-правовой режим с 1191-1192 гг. (действующий договор новгородцев с готландским берегом и немецкими городами) продолжает действовать в 1230-1250 гг.; иностранные гости торгуют через закрытые дворы (Немецкий двор)',
    event_refs: '',
    tribute_or_treaty_refs: 'договор 1191-1192 (sqlite sources S02); нормы штрафов см. domain knowledge_rumors/law (sqlite law L06-L12)',
    visible_presence: 'иностранные купцы в закрытых дворах, весы и меры воска, судебные тяжбы по договору',
    peoples_ref: '',
    source_refs: 'sqlite novgorod_1230(1).sources [S02] "Договор Новгорода с Готским берегом и немецкими городами, 1191-1192"; археология Немецкого двора [S10]',
    confidence: 'A', status_flag: 'candidate',
  },
  {
    po_id: 'po_denmark_estonia', name_ru: 'Датские владения в Эстляндии', name_en: 'Danish Estonia',
    kind: 'kingdom', relation_period: '1219-1250',
    status: 'датское присутствие в северной Эстонии (с основания Ревеля/Таллина в 1219 г.) как фон западного давления; прямых сведений о взаимодействии с Новгородом 1230-1250 в собранных источниках нет',
    event_refs: '',
    tribute_or_treaty_refs: '',
    visible_presence: 'фон: редкие слухи о датчанах в общем потоке западных вестей',
    peoles_ref: '',
    source_refs: 'ПРОБЕЛ: не подтверждено сфокусированным исследованием в этом проходе; включено для полноты каталога по прямому требованию брифа',
    confidence: 'D', status_flag: 'candidate-gap',
  },
  {
    po_id: 'po_lubeck_german_merchants', name_ru: 'Любек и немецкие купцы', name_en: 'Lübeck and German merchants',
    kind: 'city', relation_period: '1230-1250',
    status: 'часть немецкого купеческого мира, действующего в Новгороде через договор 1191-1192 и Немецкий двор; вхождение Любека в раннюю ганзейскую сеть в этот период — общеизвестно, но детального новгородского эпизода в собранных источниках нет',
    event_refs: '', tribute_or_treaty_refs: 'см. po_gotland_german_towns', visible_presence: 'см. po_gotland_german_towns',
    peoples_ref: '',
    source_refs: 'sqlite [S02;S10]; общий контекст — не уточнён отдельным исследованием',
    confidence: 'C', status_flag: 'candidate',
  },
];
for (const e of external) rows.push(e);

fs.mkdirSync(OUT_DIR, { recursive: true });
writeCsv(path.join(OUT_DIR, 'polities_external_relations.csv'),
  ['po_id', 'name_ru', 'name_en', 'kind', 'relation_period', 'status', 'event_refs', 'tribute_or_treaty_refs',
   'visible_presence', 'peoples_ref', 'source_refs', 'confidence', 'status_flag'],
  rows);
console.log('polities_external_relations.csv rows:', rows.length);
