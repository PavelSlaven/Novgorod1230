export default {
  id: 'market',
  hint: ['торг', 'рынк', 'купц', 'обмен', 'соль', 'ткан'],
  history: {
    era: 'XIII век',
    year: 1240,
    season: 'ранняя зима',
    macroForces: [
      'цены скачут, потому что путь неустойчив',
      'любой торговец считает вес, дорогу и риск',
      'там, где слышна речь, уже идёт соперничество'
    ],
    legitimacy: [
      'долг и поручительство стоят дороже улыбок',
      'здесь важно, чьё имя подтверждает товар'
    ]
  },
  region: {
    name: 'торговый посад у речного узла',
    politics: [
      'городские люди смотрят на приезжих как на пользу и угрозу одновременно',
      'старшие двора следят, чтобы шум не перерос в драку'
    ],
    economy: ['торг тканью и солью', 'ремесло и перевозка', 'налоги и пошлины'],
    tensions: ['запасы дороги', 'цены спорят с голодом', 'слух о чужих войсках меняет настроение быстрее погоды']
  },
  place: {
    name: 'рыночный навес',
    kind: 'торг',
    landmarks: ['ряды с тканью', 'пустые бочки', 'доска для весов', 'грязный снег по краям площади'],
    exits: ['к мосту', 'в посад', 'к амбарам'],
    occupants: ['торговка', 'сборщик пошлины', 'подмастерье']
  },
  currentLocationId: 'canopy',
  locations: {
    canopy: {
      id: 'canopy',
      name: 'рыночный навес',
      kind: 'торг',
      landmarks: ['ряды с тканью', 'пустые бочки', 'доска для весов', 'грязный снег по краям площади'],
      exits: [
        { label: 'к мосту', to: 'bridge' },
        { label: 'в посад', to: 'posad' },
        { label: 'к амбарам', to: 'storehouses' }
      ],
      occupants: ['торговка', 'сборщик пошлины', 'подмастерье'],
      condition: 'crowded',
      activity: ['торг и пересчёт', 'споры о цене', 'проверка меры'],
      recentTraces: [],
      pressure: ['люди считают прибыль и убыток', 'каждый взгляд может быть оценкой твоей платёжеспособности', 'торг не ждёт нерешительных'],
      sounds: ['скрип телеги', 'спор о цене', 'бряцание монет и мер'],
      attention: 'среднее',
      weather: 'морозный воздух и белая грязь',
      light: 'день с короткой тусклой ясностью'
    },
    bridge: {
      id: 'bridge',
      name: 'мост через реку',
      kind: 'мост',
      landmarks: ['сырой настил', 'следы копыт', 'перила с наледью'],
      exits: [{ label: 'к навесу', to: 'canopy' }],
      occupants: ['сторож'],
      condition: 'slippery',
      activity: ['проход и проверка'],
      recentTraces: [],
      pressure: ['мост держит поток людей и слухов', 'задержка здесь заметна всем'],
      sounds: ['глухой гул воды', 'скрип дерева'],
      attention: 'среднее',
      weather: 'морозный воздух и белая грязь',
      light: 'день с короткой тусклой ясностью'
    },
    posad: {
      id: 'posad',
      name: 'посад у складов',
      kind: 'улица',
      landmarks: ['склады с досками', 'ворота с замком', 'следы саней'],
      exits: [{ label: 'к навесу', to: 'canopy' }],
      occupants: ['дворник склада'],
      condition: 'dirty',
      activity: ['перетаскивание товара', 'молчаливый учёт'],
      recentTraces: [],
      pressure: ['склады помнят тех, кто лжёт о весе', 'чужой здесь заметен'],
      sounds: ['удары досок', 'крик приказчика'],
      attention: 'низкое',
      weather: 'морозный воздух и белая грязь',
      light: 'день с короткой тусклой ясностью'
    },
    storehouses: {
      id: 'storehouses',
      name: 'амбарный ряд',
      kind: 'склады',
      landmarks: ['двери на щеколдах', 'мешки у стен', 'ледяная корка на крышах'],
      exits: [{ label: 'к навесу', to: 'canopy' }],
      occupants: ['сторож'],
      condition: 'guarded',
      activity: ['охрана и счёт'],
      recentTraces: [],
      pressure: ['здесь всё требует допуска', 'ошибка быстро становится подозрением'],
      sounds: ['скрип дверей', 'шаги по снегу'],
      attention: 'низкое',
      weather: 'морозный воздух и белая грязь',
      light: 'день с короткой тусклой ясностью'
    }
  },
  scene: {
    weather: 'морозный воздух и белая грязь',
    light: 'день с короткой тусклой ясностью',
    sounds: ['скрип телеги', 'спор о цене', 'бряцание монет и мер'],
    pressure: [
      'люди считают прибыль и убыток',
      'каждый взгляд может быть оценкой твоей платёжеспособности',
      'торг не ждёт нерешительных'
    ],
    attention: 'среднее'
  },
  player: {
    name: 'чужой торговый ходок',
    role: 'торговец',
    status: 'под наблюдением',
    fear: 10,
    states: {
      health: 100,
      satiety: 82,
      vigor: 88
    },
    activeStates: [],
    inventory: [
      {
        id: 'item:market:coins:1',
        label: 'монеты',
        type: 'item',
        material: 'металл',
        condition: 'исправны',
        weight: 0.2,
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visibility: 'visible',
        discoverability: 'obvious',
        legal_status: 'ordinary',
        function: 'обмен и расчёт'
      },
      {
        id: 'item:market:cloth:1',
        label: 'образец ткани',
        type: 'clothing',
        material: 'ткань',
        condition: 'новый',
        weight: 0.3,
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visibility: 'visible',
        discoverability: 'obvious',
        legal_status: 'ordinary',
        function: 'образец товара'
      },
      {
        id: 'item:market:knife:1',
        label: 'малый нож',
        type: 'weapon',
        material: 'железо',
        condition: 'исправен',
        weight: 0.4,
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visibility: 'visible',
        discoverability: 'obvious',
        legal_status: 'ordinary',
        function: 'самооборона и работа'
      }
    ],
    claims: []
  },
  npcs: [
    {
      id: 'm1',
      name: 'торговка',
      role: 'продавец',
      location: 'ряд',
      homeLocation: 'canopy',
      mood: 'деловита',
      knowledge: ['знает местные цены', 'умеет быстро оценить чужака']
    },
    {
      id: 'm2',
      name: 'сборщик пошлины',
      role: 'чиновник',
      location: 'под навесом',
      homeLocation: 'canopy',
      mood: 'сдержан',
      knowledge: ['спрашивает про право на продажу', 'интересуется документами']
    },
    {
      id: 'm3',
      name: 'подмастерье',
      role: 'помощник',
      location: 'край площади',
      homeLocation: 'canopy',
      mood: 'любопытен',
      knowledge: ['слушает разговоры', 'быстро разносит слухи']
    }
  ]
};
