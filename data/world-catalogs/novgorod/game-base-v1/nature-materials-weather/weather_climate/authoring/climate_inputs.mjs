// Climate inputs for the Novgorod weather reconstruction (analogue: 20th-century station normals,
// before recent warming). All modern dates are Gregorian; the game calendar is Julian (temporal-v4),
// in the 13th century Julian = Gregorian - 7 days. No quantitative 1230 offset is applied: the
// East European Plain millennium reconstructions (Klimenko & Solomina 2010) are cited only as
// context; see README "Known gaps".
export const SOURCES = {
  ruwiki_table: 'Климатическая таблица «Великий Новгород» — ru.wikipedia.org/wiki/Великий_Новгород (раздел «Климат»; источники таблицы: «Научно-прикладной справочник по климату СССР», Яндекс.Погода). https://ru.wikipedia.org/wiki/Великий_Новгород',
  klimat_novgoroda: 'Сводка «Климат Новгорода» (наблюдения 1892–1980; публикация 1985 г.), воспроизведена на novgorodpogoda.ru: https://novgorodpogoda.ru/termicheskij-rezhim ; https://novgorodpogoda.ru/rezhim-uvlazhneniya ; https://novgorodpogoda.ru/rezhim-oblachnosti-i-atmosfernye-yavleniya ; https://novgorodpogoda.ru/klimat-novgoroda',
  trasa: 'Климат Новгородской области — trasa.ru: http://trasa.ru/region/novgorodskaya_clim.html',
  volkhov_web: 'Река Волхов: ледостав с конца ноября по начало апреля, лёд 70–80 см к концу февраля, очищение ото льда 10–20 дней, до 70% стока в половодье; полыньи у Новгорода. Сводка поиска по cruiseinform.ru/catalog/06/volkhov/ и ru.wikipedia.org/wiki/Волхов_(река)',
  npl: 'Новгородская первая летопись старшего извода, 6732–6739 гг. (Julian). Текст: http://litopys.org.ua/novglet/novg06.htm (изд. Насонова, 1950)',
  npl_1176: 'Новгородская первая летопись, 6684 (1176): «Иде Вълхово опять на възводье по 5 днии» — цит. по ru.wikipedia.org/wiki/Волхов_(река)',
  klimenko_solomina: 'Klimenko V., Solomina O. Climatic Variations in the East European Plain During the Last Millennium: State of the Art // The Polish Climate in the European Context. Springer, 2010. https://link.springer.com/chapter/10.1007/978-90-481-3167-9_3 (context only; not read in full)',
  temporal_v4: 'main:data/world-catalogs/novgorod/temporal-v4/datasets/weather_transition_profiles_processes.json#record:weather_transition_profiles_processes:novgorod_weather_v2 (approved v1: 6 states, equal weights)',
  daylight_v4: 'main:data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json#record:calendar_daylight_light_profiles:novgorod_1230_1233_v2',
  rus13_weather: 'main:tools/rus13-novgorod-regional-templates/novgorod_weather_season_rules_v1.json (draft, requires_human_audit)',
  contract: 'pr98:packages/contracts/src/weather-state.js (WEATHER_KINDS, TEMPERATURE_BANDS, PRECIPITATION_KINDS, WIND_BANDS, VISIBILITY_WEATHER_MODIFIERS, GROUND_STATES)',
  d7: 'Issue #133 decision D7 (owner, 2026-09-26): погода держится 1–3 дня; держащееся отклонение температуры; вид осадков зависит от температуры; одна цепочка на G0 с местными поправками по ландшафту; интервал 6 ч',
  rain_snow: 'Jennings K.S. et al. Spatial variation of the rain–snow temperature threshold across the Northern Hemisphere // Nature Communications 9, 1148 (2018). https://doi.org/10.1038/s41467-018-03629-7 (thresholds near +1…+2 °C; used as rule-of-thumb band)',
};

// Monthly station normals (Gregorian months), °C and mm — ru.wikipedia climate table.
export const MONTHLY = [
  // m, abs_max, mean_max, mean, mean_min, abs_min, precip_mm
  [1, 6, -6, -9.2, -12, -45, 29], [2, 6, -5, -8.2, -12, -39, 22], [3, 13, 0, -3.3, -7, -32, 29],
  [4, 26, 8, 3.7, 0, -24, 33], [5, 31, 17, 11.6, 7, -8, 37], [6, 32, 21, 15.7, 10, -3, 62],
  [7, 34, 22, 17.3, 12, 1, 71], [8, 34, 21, 15.5, 11, -2, 71], [9, 29, 15, 10.3, 7, -10, 60],
  [10, 22, 8, 5.0, 2, -21, 51], [11, 13, 1, -0.8, -3, -26, 49], [12, 10, -3, -5.9, -9, -41, 36],
];

// Day counts per season (days per 30-day month, season = Julian calendar season of temporal-v4).
// Each value: [days, basis]. Occupancy converts phenomenon-days to share of 6-hour slots.
export const DAYCOUNTS = {
  precip:   { winter: [17, 'Nov–Dec ~18 дней/мес (klimat_novgoroda); DJF принято 17'], spring: [13, 'Apr–May ~12; Mar ближе к зиме -> 13'], summer: [13.7, 'остаток годового бюджета 180 дней'], autumn: [16.3, 'Sep~14, Oct~17, Nov~18'] },
  overcast: { winter: [18.8, 'Nov–Dec 21–22; Jan–Feb интерполировано (C); годовая сумма 162'], spring: [11.2, 'Mar–Apr интерполировано, May 8–9'], summer: [8.5, 'May–Aug 8–9'], autumn: [16.5, 'Sep интерп., Oct–Nov по сводке'] },
  clear:    { winter: [1.5, 'Oct–Dec ~1; год 31'], spring: [3.5, 'весна–лето — максимум; год 31'], summer: [4, 'год 31'], autumn: [1.3, 'Oct–Dec ~1'] },
  fog:      { winter: [4.7, 'Oct–Mar 28 дней (4–5/мес)'], spring: [3.2, 'Mar 4.7, Apr–May 2–3'], summer: [3.7, 'Jun–Jul 2–3, Aug остаток годовых 50'], autumn: [5.1, 'Sep остаток, Oct–Nov 4–5'] },
  thunder:  { winter: [0, 'нет'], spring: [1.1, 'май; годовые 24'], summer: [6.5, 'летом 5–8/мес'], autumn: [0.4, 'сентябрь, остаток'] },
  blizzard: { winter: [7.5, 'метель 5–10 дней/мес зимой (trasa, область)'], spring: [1.5, 'март (C)'], summer: [0, 'нет'], autumn: [0.7, 'ноябрь (C)'] },
  windy:    { winter: [2, 'нет данных — редкое (C)'], spring: [2, 'C'], summer: [1.5, 'C'], autumn: [3, 'осенние штормы — C'] },
};
export const OCCUPANCY = { precip: 0.5, overcast: 1, clear: 1, fog: 0.33, thunder: 0.25, blizzard: 0.33, windy: 0.25 };
export const SEASON_MONTHS = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };

// Seasonal hydrological/ground phenomena (Gregorian source dates; Julian computed by build).
export const PHENOMENA = [
  { id: 'wxp_volkhov_freeze_up', name_ru: 'Ледостав на Волхове', kind: 'water', greg: { avg: '11-25' }, value: 'под льдом в среднем 130 дней; к концу февраля лёд 70–80 см', src: ['klimat_novgoroda', 'volkhov_web'], conf: 'B', effect: 'water_condition: ice_forming -> ice; переправа по льду только после окрепления; ловля подо льдом' },
  { id: 'wxp_volkhov_break_up', name_ru: 'Вскрытие Волхова и ледоход', kind: 'water', greg: { avg: '04-04', early: '02-26', late: '04-27' }, value: 'очищение ото льда 10–20 дней (сначала речной, затем озёрный лёд)', src: ['klimat_novgoroda', 'volkhov_web'], conf: 'B', effect: 'water_condition: ice_breaking; переправы закрыты; треск и шум льда' },
  { id: 'wxp_spring_flood', name_ru: 'Весеннее половодье', kind: 'water', greg: { avg: '04-10', late: '05-31' }, value: 'до 70% годового стока приходится на половодье; пойма заливается', src: ['volkhov_web', 'wk:claim:foundations-earth-25-snowmelt-runoff', 'wk:claim:foundations-earth2-11-river-ice-jam-flow-obstruction'], conf: 'B', effect: 'ground: flooded на пойменных G4; броды закрыты; лодка нужна' },
  { id: 'wxp_spring_rasputitsa', name_ru: 'Весенняя распутица', kind: 'ground', greg: { avg: '04-03' }, value: 'с начала апреля 20–30 дней; устойчивый переход через 0 °C ~3 апреля', src: ['trasa', 'klimat_novgoroda', 'rus13_weather'], conf: 'B', effect: 'ground_state: mud; движение по грунту x1.5 и хуже' },
  { id: 'wxp_autumn_rasputitsa', name_ru: 'Осенняя распутица', kind: 'ground', greg: { avg: '10-15', late: '11-08' }, value: 'дожди октября–ноября до устойчивого перехода через 0 °C (~8 ноября)', src: ['klimat_novgoroda', 'rus13_weather'], conf: 'C', effect: 'ground_state: mud' },
  { id: 'wxp_snow_cover_onset', name_ru: 'Установление устойчивого снежного покрова', kind: 'snow', greg: { avg: '12-05', early: '11-05', late: '01-05' }, value: 'снег лежит в среднем 135 дней, устойчиво 119 (88–174)', src: ['klimat_novgoroda', 'trasa'], conf: 'B', effect: 'ground_state: snow; санный путь' },
  { id: 'wxp_snow_depth_max', name_ru: 'Наибольшая высота снега', kind: 'snow', greg: { avg: '03-01' }, value: 'в среднем 36 см (7–82 см в разные зимы)', src: ['klimat_novgoroda'], conf: 'B', effect: 'глубокий снег вне дорог' },
  { id: 'wxp_snow_cover_break', name_ru: 'Разрушение и сход снежного покрова', kind: 'snow', greg: { avg: '04-05', early: '03-15', late: '04-23' }, value: 'полный сход — к середине апреля', src: ['klimat_novgoroda'], conf: 'B', effect: 'ground_state: snow -> mud' },
  { id: 'wxp_last_spring_frost', name_ru: 'Последние весенние заморозки', kind: 'temperature', greg: { avg: '05-17', late: '06-13' }, value: 'безморозный период в среднем 127 дней (103–169)', src: ['klimat_novgoroda', 'trasa'], conf: 'B', effect: 'иней утром; риск для всходов' },
  { id: 'wxp_first_autumn_frost', name_ru: 'Первые осенние заморозки', kind: 'temperature', greg: { avg: '09-22' }, value: 'по области ~18 сентября (trasa)', src: ['klimat_novgoroda', 'trasa'], conf: 'B', effect: 'иней; в 1230 г. мороз 14 сентября (Julian) погубил хлеб' },
  { id: 'wxp_soil_freezing', name_ru: 'Промерзание почвы', kind: 'ground', greg: { avg: '02-28' }, value: 'в среднем 56 см (18–105 см); по области до 50 см', src: ['klimat_novgoroda', 'trasa'], conf: 'B', effect: 'копать нельзя без оттаивания' },
  { id: 'wxp_winter_thaws', name_ru: 'Зимние оттепели', kind: 'temperature', greg: { avg: '12-15' }, value: 'дней с оттепелью: декабрь 12, январь 8, февраль 6', src: ['klimat_novgoroda'], conf: 'B', effect: 'weather_kind thaw; мокрый снег, гололёд' },
  { id: 'wxp_glaze_ice', name_ru: 'Гололёд и обледенение', kind: 'temperature', greg: { avg: '12-01' }, value: 'в среднем 31 день за сезон', src: ['klimat_novgoroda'], conf: 'B', effect: 'ground_state: ice; скользко' },
  { id: 'wxp_thunder_season', name_ru: 'Грозовой сезон', kind: 'storm', greg: { avg: '07-01', early: '05-01', late: '09-15' }, value: '24 дня с грозой в год, летом 5–8 в месяц; град ~1 день за сезон (июнь–июль)', src: ['klimat_novgoroda'], conf: 'B', effect: 'гроза, ливень, риск удара молнии и пожара' },
  { id: 'wxp_light_nights', name_ru: 'Светлые ночи', kind: 'light', greg: { avg: '06-10' }, value: 'вычисляется из daylight_v4: тёмная часть ночи короче 4 ч', src: ['daylight_v4'], conf: 'A', effect: 'light: ночь не темнеет полностью' },
  { id: 'wxp_volkhov_polynya', name_ru: 'Полыньи на Волхове у Новгорода', kind: 'water', greg: { avg: '01-15' }, value: 'зимой бывают полыньи (приток более тёплой воды из Ильменя, ключи) — современное описание', src: ['volkhov_web'], conf: 'C', effect: 'опасный лёд у истока' },
  { id: 'wxp_volkhov_reverse_flow', name_ru: 'Обратное течение Волхова («на въздводье»)', kind: 'water', greg: { avg: 'irregular' }, value: 'в 1176 г. Волхов тёк вспять 5 дней; связано с подпором притоков при низком Ильмене', src: ['npl_1176'], conf: 'A', effect: 'редкое событие; не генерировать без исторического правила' },
];

// Dated weather events 1224–1231 (Julian dates as in the chronicle).
export const HISTORICAL = [
  { id: 'wxh_1224_05_20_thunder', year: 1224, julian: '05-20', name_ru: 'Страшная гроза на св. Фалалея', text: 'гром страшный; сгорела церковь святой Троицы, погибли двое', src: ['npl'], conf: 'A', chron_year: 6732 },
  { id: 'wxh_1228_autumn_rain', year: 1228, julian: '08-15..12-06', name_ru: 'Великий дождь осени 1228 г.', text: 'дождь день и ночь от Госпожина дня до Никулина дня, не видели светлого дня; нельзя было ни сена добыть, ни нив обработать', src: ['npl'], conf: 'A', chron_year: 6736 },
  { id: 'wxh_1228_autumn_high_water', year: 1228, julian: 'autumn', name_ru: 'Высокая вода в Волхове осенью 1228 г.', text: 'большая вода в Волхове унесла сено около озера и по Волхову', src: ['npl'], conf: 'A', chron_year: 6736 },
  { id: 'wxh_1228_12_08_ice_bridge', year: 1228, julian: '12-08', name_ru: 'Ледолом у Великого моста', text: 'озеро замёрзло и стояло 3 дня, южный ветер взломал лёд и внёс в Волхов; снесло 9 городней Великого моста', src: ['npl'], conf: 'A', chron_year: 6736 },
  { id: 'wxh_1230_09_14_killing_frost', year: 1230, julian: '09-14', name_ru: 'Мороз на Воздвижение 1230 г.', text: 'мороз побил хлеб по волости; началась великая беда и голод', src: ['npl'], conf: 'A', chron_year: 6738 },
];
