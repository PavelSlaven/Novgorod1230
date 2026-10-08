const SEASONS = Object.freeze({ spring: 'Весна.',
  early_spring: 'Ранняя весна.', late_spring: 'Поздняя весна.',
  summer: 'Лето.', early_summer: 'Начало лета.', late_summer: 'Позднее лето.',
  late_summer_open_water: 'Позднее лето.', autumn: 'Осень.',
  early_autumn: 'Ранняя осень.', late_autumn: 'Поздняя осень.',
  winter: 'Зима.', early_winter: 'Начало зимы.', late_winter: 'Конец зимы.' });

const DAY_PARTS = Object.freeze({ civil_dawn: 'Рассвет.', civil_dusk: 'Сумерки.',
  dawn: 'Рассвет.', sunrise: 'Восход.', morning: 'Утро.', daylight: 'День.',
  noon: 'Полдень.', afternoon: 'После полудня.', sunset: 'Закат.',
  evening: 'Вечер.', twilight: 'Сумерки.', night: 'Ночь.',
  late_night: 'Поздняя ночь.' });

const LIGHT = Object.freeze({ night: 'Ночь.', civil_dawn: 'Светает.',
  daylight: 'Стоит светлое время дня.', civil_dusk: 'Сгущаются сумерки.',
  clear: 'Светло.', dim: 'Сумеречно.', twilight: 'Сумерки.', dark: 'Темно.' });

const WEATHER = Object.freeze({
  sky: Object.freeze({ clear: 'Небо ясное.', overcast: 'Небо затянуто облаками.',
    obscured: 'Небо не видно.', variable: 'Состояние неба меняется.' }),
  precipitation: Object.freeze({ none: 'Осадков нет.', rain: 'Идёт дождь.',
    snow: 'Идёт снег.' }),
  visibility: Object.freeze({ normal: 'Видимость обычная.',
    reduced: 'Видимость снижена.', poor: 'Видимость плохая.',
    normal_or_reduced: 'Видимость обычная или сниженная.' }),
  wind: Object.freeze({ calm_or_light: 'Ветер отсутствует или слабый.',
    light_or_moderate: 'Ветер слабый или умеренный.', strong: 'Сильный ветер.' })
});

export function playerSafeWeatherLightFacts({ season, day_part, light_state,
  light_profile, weather_state } = {}) {
  const facts = [];
  addTranslated(facts, 'season', season, SEASONS);
  addTranslated(facts, 'day_part', day_part, DAY_PARTS);
  addTranslated(facts, 'light_state', light_state ?? light_profile, LIGHT);
  for (const [field, translations] of Object.entries(WEATHER)) {
    addTranslated(facts, `weather_state.${field}`, weather_state?.[field],
      translations);
  }
  return facts;
}

function addTranslated(facts, field, value, translations) {
  if (value == null) return;
  if (typeof value !== 'string' || !Object.hasOwn(translations, value)) {
    const error = new Error(`Unsupported player-safe environment value: ${field}`);
    error.code = 'PLAYER_SAFE_ENVIRONMENT_TRANSLATION_UNSUPPORTED';
    error.field = field;
    throw error;
  }
  facts.push({ field, text: translations[value] });
}
