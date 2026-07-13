import { loadRegionCatalog, selectRegionCatalogEntry } from './region-catalog.js';
import { loadRegionalSummaryCache, saveRegionalSummaryCache } from './region-summary-cache.js';

export function buildRegionSummary(world, entry, options = {}) {
  const historical = world.historical ?? {};
  const region = world.region ?? {};
  const name = entry?.name ?? region.name ?? 'неизвестный регион';
  const focus = normalize(name);
  const macroZone = classifyMacroZone(focus);
  const current = isCurrentRegion(world, entry);
  const catalogHints = buildCatalogHints(entry, world);

  return {
    id: entry?.id ?? slugify(name),
    name,
    macroZone,
    coordinates: entry?.coordinates ?? null,
    year: current ? world.history?.year ?? historical.year ?? 1237 : 1237,
    roleInWorld: current ? 'активный регион партии' : 'соседняя или внешняя земля',
    landscape: buildLandscape(macroZone, name),
    climate: buildClimate(macroZone, current ? world.history?.season ?? null : null),
    waterAndRoads: buildWaterAndRoads(macroZone, catalogHints),
    seasonalLimits: buildSeasonalLimits(macroZone, current ? world.history?.season ?? null : null),
    economy: buildEconomy(macroZone, region, historical, name),
    livelihoods: buildLivelihoods(macroZone),
    tradeRoutes: buildTradeRoutes(macroZone, name, historical),
    shortages: buildShortages(macroZone, region, historical),
    wealthSources: buildWealthSources(macroZone, region, historical),
    power: buildPower(macroZone, region, historical, current),
    law: buildLaw(macroZone, historical, current),
    custom: buildCustom(macroZone, historical),
    neighbors: buildNeighborLinks(world, entry, macroZone),
    settlements: buildSettlements(macroZone, entry, world),
    historicalTimeline: buildHistoricalTimeline(world, entry, current),
    rulers: buildRulers(macroZone, region, historical, current),
    localAuthorities: buildLocalAuthorities(macroZone, region, historical, current),
    threats: buildThreats(macroZone, region, historical),
    allies: buildAllies(macroZone, region, historical),
    externalPressures: buildExternalPressures(macroZone, region, historical),
    internalTensions: buildInternalTensions(macroZone, region, historical),
    dailyLife: buildDailyLife(macroZone, current ? world.history?.season ?? null : null),
    languages: buildLanguages(macroZone),
    faith: buildFaith(macroZone),
    clothing: buildClothing(macroZone),
    food: buildFood(macroZone, current ? world.history?.season ?? null : null),
    crafts: buildCrafts(macroZone),
    weapons: buildWeapons(macroZone),
    transport: buildTransport(macroZone),
    attitudeToStrangers: buildAttitudeToStrangers(macroZone),
    hospitality: buildHospitality(macroZone),
    fears: buildFears(macroZone),
    ordinaryRoutes: buildOrdinaryRoutes(macroZone, name),
    rumorSeeds: buildRumorSeeds(world, entry, historical),
    reasons: buildReasons(macroZone, entry, historical),
    knowledgeBoundary: {
      objectiveFacts: current ? ['current place, weather, roads, law, and witnesses'] : ['region-level structure and road pressure'],
      visibleToPlayer: current ? ['what can be seen, heard, smelled, or reasonably inferred'] : ['what local travel or rumor would expose'],
      hiddenFromCharacters: ['future outcomes', 'private motives', 'off-map sources unless witnessed'],
      narratorRule: 'The narrator may not reveal hidden facts as if they were common knowledge.'
    },
    sources: current ? historical.sourceUrls?.slice(0, 8) ?? [] : [],
    confidence: current ? 'high' : 'medium'
  };
}

export function buildRegionalAtlas(world) {
  const catalog = loadRegionCatalog();
  return catalog.map((entry) => buildRegionSummary(world, entry, { atlas: true }));
}

export function buildRegionalContext(world) {
  const catalogEntry = selectRegionCatalogEntry(world);
  const catalog = loadRegionCatalog();
  const cached = loadRegionalSummaryCache(world, catalog);
  if (cached) return cached;

  const atlasIndex = buildRegionalAtlas(world);
  const current = buildRegionSummary(world, catalogEntry ?? catalog[0] ?? null, { focus: true });
  const neighbors = pickNeighborEntries(catalog, catalogEntry, world).map((entry) => buildRegionSummary(world, entry, { neighbor: true }));

  const context = {
    current,
    neighbors,
    atlasIndex: atlasIndex.map((item) => ({
      id: item.id,
      name: item.name,
      macroZone: item.macroZone,
      confidence: item.confidence,
      summary: buildRegionSummaryLine(item)
    })),
    catalogSize: catalog.length
  };

  saveRegionalSummaryCache(world, context, catalog);
  return context;
}

function buildRegionSummaryLine(summary) {
  return [
    summary.name,
    summary.landscape?.[0] ?? null,
    summary.economy?.[0] ?? null,
    summary.power?.[0] ?? null
  ].filter(Boolean).join(' · ');
}

function pickNeighborEntries(catalog, catalogEntry, world) {
  if (!Array.isArray(catalog) || catalog.length === 0) return [];
  const baseSummary = catalogEntry ? buildRegionSummary(world, catalogEntry, { focus: true }) : null;
  const baseZone = baseSummary?.macroZone ?? null;
  const baseName = normalize(catalogEntry?.name ?? '');
  const hints = [
    normalize(world?.region?.name),
    normalize(world?.history?.regionHint),
    normalize(world?.historical?.regionHint),
    baseName
  ].filter(Boolean);

  return catalog
    .filter((item) => item && item.id !== catalogEntry?.id)
    .map((item, index) => {
      const summary = buildRegionSummary(world, item, { neighbor: true });
      const entryName = normalize(item.name);
      let score = index;
      if (baseZone && summary.macroZone === baseZone) score -= 1000;
      if (hints.some((hint) => entryName.includes(hint) || hint.includes(entryName))) score -= 100;
      if (baseName && entryName.startsWith(baseName)) score -= 20;
      return { item, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((entry) => entry.item);
}

function buildLandscape(macroZone, name) {
  const zone = macroZone;
  if (zone === 'rus') return ['Речная и лесная среда', 'Поселения тянутся к рекам, бродам и дорогам', `Для ${name} важны лес, пашня, вода и проезды`];
  if (zone === 'steppe') return ['Открытая степь и кочевые пространства', 'Ландшафт требует коня, дозора и осторожного движения', `Для ${name} критичны пастбища, воды и контролируемые переправы`];
  if (zone === 'baltic') return ['Лес, озёра, болота и береговая торговля', 'Перемещение идёт через тропы, реки и побережье', `Для ${name} важны гавани, устья и лесные пути`];
  if (zone === 'caucasus') return ['Горы, ущелья, перевалы и долины', 'Проходы узкие, оборона сильна, связь зависит от перевалов', `Для ${name} важны крепости, тропы и пастбищные долины`];
  if (zone === 'mediterranean') return ['Порты, равнины, холмы и плотная сеть дорог', 'Жизнь держится на море, ярмарках и власти городов', `Для ${name} важны гавани, мосты и торговые узлы`];
  if (zone === 'central_asia') return ['Степь, оазисы и караванные пути', 'Вода и охрана пути важнее плотной оседлости', `Для ${name} важны караваны, колодцы и ставки власти`];
  if (zone === 'south_asia') return ['Равнины, речные долины и плотное земледелие', 'Сезон муссонов, реки и ирригация задают ритм', `Для ${name} важны поля, рынки и реки`];
  if (zone === 'east_asia') return ['Речные долины, города, каналы и границы империй', 'Плотная сеть дорог и чиновников регулирует движение', `Для ${name} важны каналы, стены и административные узлы`];
  if (zone === 'africa') return ['Пустыни, саванны, реки и торговые коридоры', 'Вода, караванные станции и власть над переходами решают многое', `Для ${name} важны реки, колодцы, рынки и пастбища`];
  return ['Смешанный исторический ландшафт', 'Ландшафт и дороги зависят от местной власти и климата', `Для ${name} важны местные пути, вода и опорные пункты`];
}

function buildClimate(macroZone, season) {
  const base = {
    rus: 'континентальный холод с резкими сезонными ограничениями',
    steppe: 'ветреный континентальный климат, опасный для длительных переходов без воды',
    baltic: 'влажный, ветреный и морской климат',
    caucasus: 'контрастный климат от долин к горам, с резкой сменой условий на высоте',
    mediterranean: 'мягкий, но с жарой, дождями и сезонной навигацией',
    central_asia: 'сухой и резкий климат с сильной зависимостью от воды',
    south_asia: 'жаркий климат с муссонным циклом',
    east_asia: 'сезонная влажность и сильная зависимость от дорог и наводнений',
    africa: 'от пустынной сухости до сезонных дождей и речной зависимости'
  };
  const seasonText = season ? `Сезон: ${season}.` : null;
  return [base[macroZone] ?? 'смешанный климат с местными сезонными рисками', seasonText].filter(Boolean);
}

function buildWaterAndRoads(macroZone, hints) {
  return [
    macroZone === 'steppe' ? 'Реки редки и важны как оси движения' : 'Реки, броды, гавани или перевалы задают маршруты',
    `Дороги: ${hints.routeHint ?? 'местные пути, ярмарочные дороги и сезонные переправы'}`,
    'Сезон может закрывать путь, замедлять перевозку и менять цену товара'
  ];
}

function buildCatalogHints(entry, world) {
  const label = normalize([entry?.name, entry?.region, world.region?.name, world.place?.name].filter(Boolean).join(' '));
  const routeHint = /река|брод|переправ|вод/i.test(label)
    ? 'броды и речные переправы'
    : /город|торг|рын|ярмар/i.test(label)
      ? 'городские дороги, торги и ярмарочные пути'
      : /замок|креп|сторож|двор/i.test(label)
        ? 'подъездные пути, дозоры и укреплённые дороги'
        : /монастыр|церк|обитель/i.test(label)
          ? 'паломнические и церковные пути'
          : /порт|гавань|берег|пристан/i.test(label)
            ? 'пристани, речные и морские подходы'
            : 'местные пути, ярмарочные дороги и сезонные переправы';

  return {
    routeHint,
    settlementHint: /город|торг|рын|ярмар/i.test(label)
      ? 'рынки, торги и посад'
      : /монастыр|церк|обитель/i.test(label)
        ? 'монастырское хозяйство и паломники'
        : /замок|креп|сторож|двор/i.test(label)
          ? 'двор, стража и служба'
          : 'сельские дворы и местная община'
  };
}

function buildSeasonalLimits(macroZone, season) {
  const result = [];
  if (season) result.push(`В сезон ${season} ритм дорог и рынка меняется.`);
  if (macroZone === 'steppe') result.push('Зимой и в засуху переходы и пастбища резко дорожают.');
  if (macroZone === 'rus' || macroZone === 'baltic') result.push('Распутица, лёд и короткий световой день важны почти так же, как власть.');
  if (macroZone === 'caucasus') result.push('Перевалы и снег меняют доступность соседей.');
  if (macroZone === 'africa' || macroZone === 'central_asia') result.push('Вода и караванные стоянки сильнее обычных дорог.');
  return result.length ? result : ['Сезон влияет на доступность дорог, припасов и безопасность перехода.'];
}

function buildEconomy(macroZone, region, historical, name) {
  const base = {
    rus: ['Земледелие', 'Лесные промыслы', 'Речной и сухопутный обмен'],
    steppe: ['Пастбища', 'Скот', 'Дань и контроль путей'],
    baltic: ['Рыба', 'Лес', 'Побережные рынки'],
    caucasus: ['Пастбища', 'Перевальные сборы', 'Местные ремёсла'],
    mediterranean: ['Торговля', 'Городские ремёсла', 'Пошлины и морские связи'],
    central_asia: ['Караваны', 'Оазисное земледелие', 'Пошлины'],
    south_asia: ['Пашня', 'Ирригация', 'Рынки и ремесло'],
    east_asia: ['Земледелие', 'Налоги', 'Городской обмен'],
    africa: ['Речная торговля', 'Пастбища', 'Караванные услуги']
  };
  return [
    ...(base[macroZone] ?? ['Местное земледелие', 'Обмен', 'Сборы власти']),
    region.economy?.[0] ?? null,
    historical.economicContext?.[0] ?? null,
    buildHistoricalPressureNote(historical),
    `${name} держится на том, что может пройти по местным дорогам и быть сохранено до сезона спроса`
  ].filter(Boolean);
}

function buildLivelihoods(macroZone) {
  const map = {
    rus: ['крестьяне', 'дружинники', 'купцы', 'ремесленники', 'монахи'],
    steppe: ['кочевники', 'скотоводы', 'воины', 'проводники'],
    baltic: ['рыбаки', 'лесные люди', 'купцы', 'пограничные воины'],
    caucasus: ['горцы', 'пастухи', 'проводники', 'воины'],
    mediterranean: ['горожане', 'купцы', 'монахи', 'пахари', 'сборщики пошлин'],
    central_asia: ['караванщики', 'стража', 'оседлые земледельцы', 'ремесленники'],
    south_asia: ['крестьяне', 'ремесленники', 'писцы', 'купцы'],
    east_asia: ['земледельцы', 'чиновники', 'ремесленники', 'купцы'],
    africa: ['пастухи', 'земледельцы', 'караванщики', 'рыбаки']
  };
  return map[macroZone] ?? ['крестьяне', 'купцы', 'ремесленники', 'служилые люди'];
}

function buildTradeRoutes(macroZone, name, historical) {
  const routes = historical.roadRoutes?.map((route) => route.route) ?? [];
  return [
    ...routes.slice(0, 3),
    `${name}: местные дороги и сезонные переходы`,
    macroZone === 'steppe' ? 'степные караваны и кочевые коридоры' : 'ярмарочные и церковные связи'
  ];
}

function buildShortages(macroZone, region, historical) {
  return [
    ...(region.tensions?.slice(0, 2) ?? []),
    macroZone === 'steppe' ? 'вода и корм' : 'доступная пища и безопасные дороги',
    historical.year === 1237 || historical.year === 1241 ? 'военное давление и слухи о набегах' : null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildWealthSources(macroZone, region, historical) {
  return [
    ...(region.economy?.slice(0, 2) ?? []),
    macroZone === 'rus' ? 'речной транзит' : null,
    macroZone === 'mediterranean' ? 'морская торговля' : null,
    macroZone === 'steppe' ? 'контроль путей и стада' : null,
    historical.economicContext?.[0] ?? null
  ].filter(Boolean);
}

function buildPower(macroZone, region, historical, current) {
  return [
    current ? 'местная власть и статус уже видны в текущей партии' : 'власть определяется через центр, узлы и местных держателей',
    region.politics?.[0] ?? null,
    macroZone === 'rus' ? 'княжеская власть, церковный авторитет и местные старосты' : null,
    macroZone === 'steppe' ? 'князья, беи, родовые лидеры и контроль пастбищ' : null,
    macroZone === 'mediterranean' ? 'городская власть, феодалы, епископы и портовые интересы' : null,
    historical.lawContext?.[0] ?? null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildLaw(macroZone, historical, current) {
  return [
    historical.lawContext?.[0] ?? null,
    current ? 'Текущее место может иметь свои частные правила доступа и наказания.' : 'Региональные нормы сильнее абстрактного закона.',
    macroZone === 'rus' ? 'честь, поручительство и зависимость' : null,
    macroZone === 'steppe' ? 'клятва, обычай и сила покровителя' : null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildCustom(macroZone, historical) {
  return [
    historical.behavioralRules?.[0] ?? null,
    macroZone === 'rus' ? 'гостеприимство ограничено статусом и риском' : null,
    macroZone === 'steppe' ? 'приём гостя требует дара, осторожности и признания хозяина' : null,
    macroZone === 'mediterranean' ? 'городской обычай может быть сильнее сельского' : null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildNeighborLinks(world, entry, macroZone) {
  return (world.cluster?.neighboringRegions ?? []).map((neighbor) => ({
    regionName: neighbor.regionName ?? neighbor.name ?? neighbor.direction,
    connection: buildConnectionType(macroZone, neighbor.regionName ?? neighbor.name ?? ''),
    pressure: neighbor.pressure ?? null
  }));
}

function buildConnectionType(macroZone, neighborName) {
  const name = normalize(neighborName);
  if (/торг|рын|пошлин|купц/.test(name)) return 'торговля';
  if (/степ|кыпч|татар|монгол/.test(name)) return 'война и набеги';
  if (/княж|земл|королев|импер/.test(name)) return 'дипломатия и браки элит';
  if (/монастыр|церк|еписк/.test(name)) return 'церковные связи';
  if (/река|брод|путь|дорог/.test(name)) return 'миграция и маршруты';
  return macroZone === 'rus' ? 'торговля, дань и слухи' : 'торговля и политический контакт';
}

function buildSettlements(macroZone, entry, world) {
  const places = Array.isArray(world.locations) ? Object.values(world.locations) : [];
  const names = places.map((place) => place.name).slice(0, 6);
  const base = [
    entry?.name ?? null,
    ...names,
    macroZone === 'rus' ? 'города, крепости, монастыри и торги у рек' : null,
    macroZone === 'steppe' ? 'ставки, кочевья и переправы' : null
  ];
  return base.filter(Boolean);
}

function buildHistoricalTimeline(world, entry, current) {
  return {
    before1237: current ? world.historical?.anchorEvents?.slice(0, 2) ?? [] : ['События до текущего года формируют память и власть.'],
    around1237: [`${entry?.name ?? 'регион'} в 1237 году живёт под давлением местной власти, дороги и соседей.`],
    after1237: []
  };
}

function buildRulers(macroZone, region, historical, current) {
  return [
    ...(region.politics?.slice(0, 2) ?? []),
    current ? 'местный правитель и его окружение известны по ходу партии' : null,
    macroZone === 'rus' ? 'князья и церковные власти' : null,
    macroZone === 'steppe' ? 'ордынская или племенная верхушка' : null
  ].filter(Boolean);
}

function buildLocalAuthorities(macroZone, region, historical, current) {
  return [
    current ? 'староста, двор, сторожа, хозяева и местные посредники' : null,
    region.politics?.[1] ?? null,
    historical.behavioralRules?.[1] ?? null
  ].filter(Boolean);
}

function buildThreats(macroZone, region, historical) {
  return [
    ...(region.tensions?.slice(0, 2) ?? []),
    macroZone === 'steppe' ? 'набеги и смена контроля над путями' : null,
    macroZone === 'rus' ? 'разорение, межкняжеский конфликт и налоговое давление' : null,
    historical.roadRisks?.[0] ?? null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildAllies(macroZone, region, historical) {
  return [
    macroZone === 'rus' ? 'родня, церковь, союзные дворы и торговые партнёры' : null,
    macroZone === 'steppe' ? 'родовые союзники и торговые посредники' : null,
    macroZone === 'mediterranean' ? 'городские сети, монастыри и морские договоры' : null,
    region.politics?.[0] ?? null
  ].filter(Boolean);
}

function buildExternalPressures(macroZone, region, historical) {
  return [
    historical.anchorEvents?.[0] ?? null,
    macroZone === 'rus' ? 'пограничные войны и ордынское давление' : null,
    macroZone === 'baltic' ? 'крестовые, торговые и пограничные давления' : null,
    macroZone === 'mediterranean' ? 'династические и церковные конфликты' : null,
    ...(region.tensions?.slice(0, 1) ?? []),
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildInternalTensions(macroZone, region, historical) {
  return [
    ...(region.tensions?.slice(0, 3) ?? []),
    historical.behavioralRules?.[0] ?? null,
    macroZone === 'rus' ? 'соперничество за старшинство и дань' : null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildDailyLife(macroZone, season) {
  const seasonText = season ? `Сезон ${season} меняет ритм жизни.` : null;
  return [
    seasonText,
    'Повседневность строится вокруг еды, труда, дороги, статуса и страха перед внезапным насилием.',
    macroZone === 'rus' ? 'деревня, двор, торг, церковь, дружина и общинный контроль' : 'местные ритуалы, труд, безопасность и соседский контроль'
  ].filter(Boolean);
}

function buildLanguages(macroZone) {
  const map = {
    rus: ['древнерусские говоры', 'церковнославянский в религиозном и письменном слое'],
    steppe: ['тюркские и местные смешанные говоры'],
    baltic: ['балтийские, финские, славянские и торговые смешения'],
    caucasus: ['местные кавказские языки', 'региональные посреднические говоры'],
    mediterranean: ['латинские, романские, греческие и местные городские говоры'],
    central_asia: ['тюркские и персидско-книжные регистры'],
    south_asia: ['местные индийские языки и книжные регистры'],
    east_asia: ['китайские, монгольские и местные письменные формы'],
    africa: ['местные языки и торговые посреднические говоры']
  };
  return map[macroZone] ?? ['местные говоры и язык власти'];
}

function buildFaith(macroZone) {
  const map = {
    rus: ['православие и местные дохристианские обычаи в быту'],
    steppe: ['смешение традиций, покровительство и клятва'],
    baltic: ['христианство и местные традиции в переходном слое'],
    caucasus: ['христианство, ислам и местные верования'],
    mediterranean: ['христианство, ислам и иудейские общины'],
    central_asia: ['ислам, тенгрианские и местные традиции'],
    south_asia: ['индуизм, буддизм, джайнизм и местные культы'],
    east_asia: ['буддизм, даосские, конфуцианские и местные традиции'],
    africa: ['местные верования, ислам и христианские общины в зависимости от зоны']
  };
  return map[macroZone] ?? ['местная вера и обрядность'];
}

function buildClothing(macroZone) {
  const map = {
    rus: ['лен, шерсть, мех, простые кафтаны и плащи'],
    steppe: ['теплые слои, мех, войлок, удобная верховая одежда'],
    baltic: ['шерсть, плащи, непромокаемая верхняя одежда'],
    caucasus: ['слои ткани, шерсть, удобная верховая одежда и защитные пояса'],
    mediterranean: ['лёгкая ткань, накидки, городская и ремесленная одежда'],
    central_asia: ['слои ткани, войлок, удобство для верховой езды'],
    south_asia: ['лёгкие ткани, накидки и сезонные слои'],
    east_asia: ['многослойная одежда, функциональные пояса и верхние плащи'],
    africa: ['лёгкая или защитная одежда по климату, накидки и головные уборы']
  };
  return map[macroZone] ?? ['местные слои одежды, накидки и практичная обувь'];
}

function buildFood(macroZone, season) {
  const base = {
    rus: ['хлеб', 'каша', 'рыба', 'репа', 'супы', 'мёд'],
    steppe: ['молоко', 'мясо', 'сушёные запасы', 'кумыс или местные напитки'],
    baltic: ['рыба', 'зерно', 'лепёшки', 'солёные запасы'],
    caucasus: ['хлеб', 'сыр', 'мясо', 'молочные продукты', 'плоды долин'],
    mediterranean: ['хлеб', 'оливки', 'вино', 'овощи', 'рыба'],
    central_asia: ['лепёшки', 'мясо', 'молочные продукты', 'сухие запасы'],
    south_asia: ['зерно', 'чечевица', 'рис или местные крупы', 'специи'],
    east_asia: ['зерно', 'овощи', 'рыба', 'соевые продукты', 'чай'],
    africa: ['зерно', 'рыба', 'молочные продукты', 'корнеплоды', 'пальмовые продукты']
  };
  const result = [...(base[macroZone] ?? ['зерно', 'супы', 'хлеб'])];
  if (season) result.push(`Сезон ${season} меняет доступность и цену пищи.`);
  return result;
}

function buildCrafts(macroZone) {
  const map = {
    rus: ['кузнечное дело', 'ткачество', 'бондари', 'кожевники', 'плотники'],
    steppe: ['сборка оружия и конской утвари', 'кожевенное дело', 'войлочное ремесло'],
    baltic: ['рыболовство', 'корабельное и лесное ремесло', 'кожевники'],
    caucasus: ['металл', 'плотницкое дело', 'ковроткачество', 'горное ремесло'],
    mediterranean: ['торговое ремесло', 'строительство', 'кораблестроение', 'ткачество'],
    central_asia: ['караванное ремесло', 'кожевенное дело', 'оружейное дело'],
    south_asia: ['ткачество', 'ювелирное дело', 'гончарное ремесло', 'текстиль'],
    east_asia: ['керамика', 'металл', 'бумага и письменные изделия', 'текстиль'],
    africa: ['гончарное дело', 'обработка металла', 'ткачество', 'плетение']
  };
  return map[macroZone] ?? ['кузнецы', 'плотники', 'гончары', 'ткачи'];
}

function buildWeapons(macroZone) {
  const map = {
    rus: ['копья', 'топоры', 'луки', 'мечи у знати'],
    steppe: ['луки', 'копья', 'сабли', 'конная экипировка'],
    baltic: ['копья', 'топоры', 'луки', 'дорожное оружие'],
    caucasus: ['мечи', 'копья', 'луки', 'кавалерийское оружие'],
    mediterranean: ['копья', 'арбалеты', 'мечи', 'городская стража'],
    central_asia: ['луки', 'копья', 'сабли', 'конное вооружение'],
    south_asia: ['копья', 'мечи', 'луки', 'щит'],
    east_asia: ['копья', 'луки', 'сабли', 'армейская организация'],
    africa: ['копья', 'щиты', 'луки', 'клинковое оружие']
  };
  return map[macroZone] ?? ['копья', 'топоры', 'луки'];
}

function buildTransport(macroZone) {
  const map = {
    rus: ['лошадь', 'телега', 'сани', 'лодка', 'пеший ход'],
    steppe: ['лошадь', 'повозка', 'верблюд в южных зонах'],
    baltic: ['лодка', 'телега', 'пеший ход'],
    caucasus: ['лошадь', 'мул', 'пеший ход по тропам'],
    mediterranean: ['лодка', 'корабль', 'повозка', 'вьюк'],
    central_asia: ['лошадь', 'верблюд', 'повозка'],
    south_asia: ['повозка', 'лодка', 'вьюк'],
    east_asia: ['повозка', 'лодка', 'лошадь', 'каналы'],
    africa: ['верблюд', 'лодка', 'вьюк', 'пеший ход']
  };
  return map[macroZone] ?? ['лошадь', 'повозка', 'пеший ход'];
}

function buildAttitudeToStrangers(macroZone) {
  const map = {
    rus: 'осторожное и статусное',
    steppe: 'прагматичное, с проверкой дара и намерения',
    baltic: 'настороженное, но торговое',
    caucasus: 'осторожное и гостевое одновременно',
    mediterranean: 'городское, деловое, но подозрительное',
    central_asia: 'торгово-охранное',
    south_asia: 'зависит от касты, статуса и поручительства',
    east_asia: 'регламентированное и иерархическое',
    africa: 'зависит от маршрута, власти и местного обычая'
  };
  return map[macroZone] ?? 'осторожное';
}

function buildHospitality(macroZone) {
  const map = {
    rus: ['гость может быть принят, но его проверяют', 'без поручительства гостеприимство ограничено'],
    steppe: ['гость ценен, но сначала проверяется дар и намерение'],
    baltic: ['гостя принимают, если он не несёт угрозы'],
    caucasus: ['гостеприимство связано с честью и безопасностью'],
    mediterranean: ['гостеприимство регулируется статусом и городским порядком'],
    central_asia: ['гостя принимают через обычай, но с охраной и осторожностью'],
    south_asia: ['гостеприимство различается по общине и статусу'],
    east_asia: ['гостеприимство формально и иерархично'],
    africa: ['гостя принимают через обычай и обмен дарами']
  };
  return map[macroZone] ?? ['гостеприимство зависит от статуса и безопасности'];
}

function buildFears(macroZone) {
  const map = {
    rus: ['набег', 'голод', 'огонь', 'чужой без поручительства'],
    steppe: ['засуха', 'потеря стада', 'сильный враг', 'нехватка воды'],
    baltic: ['шторм', 'разбой', 'потеря пути', 'чужая власть'],
    caucasus: ['перевал зимой', 'вражда родов', 'потеря прохода'],
    mediterranean: ['осада', 'чужой флот', 'налог и голод'],
    central_asia: ['потеря каравана', 'засуха', 'нападение', 'закрытие колодца'],
    south_asia: ['неурожай', 'перекрытие воды', 'война', 'болезнь'],
    east_asia: ['наводнение', 'голод', 'плохая дорога', 'чиновничий произвол'],
    africa: ['засуха', 'нехватка воды', 'набег', 'разрыв каравана']
  };
  return map[macroZone] ?? ['голод', 'власть', 'дорога', 'чужой'];
}

function buildOrdinaryRoutes(macroZone, name) {
  return [
    `${name}: местные дороги и переходы`,
    macroZone === 'steppe' ? 'пастушьи и караванные тропы' : 'ярмарочные и церковные пути',
    'броды, мосты, ворота, переправы и посты сбора пошлин'
  ];
}

function buildRumorSeeds(world, entry, historical) {
  return [
    entry?.name ?? world.region?.name ?? null,
    historical.anchorEvents?.[0] ?? null,
    historical.roadRisks?.[0] ?? null,
    'чужие люди',
    'цена дороги'
  ].filter(Boolean);
}

function buildReasons(macroZone, entry, historical) {
  return [
    `Регион существует как исторический узел ${entry?.name ?? 'без имени'} в 1237 году.`,
    macroZone === 'rus' ? 'реки, княжеская власть и церковные центры' : null,
    macroZone === 'steppe' ? 'пастбища, мобильность и контроль проходов' : null,
    historical.year ? `Фон года ${historical.year} задаёт давление на безопасность и экономику.` : null,
    buildHistoricalPressureNote(historical)
  ].filter(Boolean);
}

function buildHistoricalPressureNote(historical) {
  const pressure = normalize(historical?.phasePressure ?? '');
  if (!pressure) return null;
  return `Текущее историческое давление: ${historical.phasePressure}.`;
}

function isCurrentRegion(world, entry) {
  if (!entry) return false;
  const regionName = normalize(world.region?.name ?? '');
  const entryName = normalize(entry.name ?? '');
  return Boolean(regionName && entryName && regionName === entryName);
}

function classifyMacroZone(name) {
  if (/новгород|псков|ладож|карел|ижор|белозер|ростов|ярослав|владимир|суздаль|муром|рязан|смолен|полоц|витеб|киев|чернигов|переяслав|волын|галиц|берест|мазов|поль|богем|морав|брабант|фландр|рейн|лотаринг|померан|прус|курш|земгал|латгал|ливон|эст|финн|таваст|норвеж|свей|готланд|ирланд|шотланд|англий|норманд|бретан|иль-де-франс|шампань|бургунд|аквитан|гаскон|пуату|анжу|лангедок|прованс|савой|ломбард|пьемонт|лигур|венециан|тоскан|романь|лацио|кампан|апули|калабр|сицилий|сардин|корсик|каталон|арагон|наварр|кастил|леон|галис|португал|андалус|валенс|балеар|фраки|макед|фессал|эпир|пелопон|эгей|крит|кипр|болгар|серб|босни|хорват|далмац|валах|молдав|трансиль|венгер|австр|штир|карин|крайн|тирол|бавар|франкон|сакс|шваб|вестфал|фриз|ютланд|скан|исланд|гренланд|киев|смолен|рязан/i.test(name)) return 'rus';
  if (/степ|кипчак|дон|азов|черномор|приазов|прикасп|крым|тама|кубан|ордын|югра|полов|морд|булгар|сарай|дешт|ногай|казах|калм|монгол|хорезм|хорасан|мавераннахр|согд|ферган|кабул|памир|хиндукуш|каракум|туркестан|джунгар|алтай|орхон|керулен|байкал|сибир/i.test(name)) return 'steppe';
  if (/мор|побереж|гавань|лагун|адриат|сицили|крит|кипр|калан|грец|анатол|трапезунд|никей|визан|эгей|понт|фраки|крит|кипр|сирий|палестин|иордан|египет|дельт|нил|красн|медит|прованс|лигу|тирр|адриат|венециан/i.test(name)) return 'mediterranean';
  if (/кавказ|алани|абхаз|дагест|дербент|ширван|арран|армян|грузин|черкес|осет|ингуш|чечен|кабард/i.test(name)) return 'caucasus';
  if (/балт|прус|курш|земгал|латгал|ливон|эст|фин|скан|готланд|фриз|псков|новгород|ладож/i.test(name)) return 'baltic';
  if (/перс|ир|араб|шам|йемен|хиджаз|оман|бахрейн|хузест|фарс|керман|систан|макран|месоп|джазир|анатол|рум|килик|калеф/i.test(name)) return 'central_asia';
  if (/инд|дели|пендж|синд|кашм|гудж|малв|авад|бихар|бенгал|орисс|декан|тамил|керал|ланк|непал|бутан/i.test(name)) return 'south_asia';
  if (/кита|сун|хань|хэбэй|шаньси|шандун|юньнан|гуйчж|фуцзян|линнан|хайнань|хонсю|кюсю|сикоку|коре|маньчж|ляодун|рюкю|джава|суматр|борнео|филипп|чамп|кхмер|ланна|паган/i.test(name)) return 'east_asia';
  if (/сахар|сахел|мали|гана|сонгай|канем|борну|хауса|йоруб|бенин|акан|зимбаб|замбез|суахил|мозамб|калахар|намиб|конго|нуб|макур|алод|абисс|эритре|сомал/i.test(name)) return 'africa';
  return 'rus';
}

function normalize(value) {
  return String(value ?? '').toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'region';
}
