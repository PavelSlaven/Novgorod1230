const FULL_SKILL_BONUSES = {
  athletics: 1,
  stealth: 0,
  melee: 0,
  ranged: 0,
  craft: 2,
  household: 1,
  survival: 2,
  riding: 0,
  healing: 0,
  observation: 1,
  communication: 1,
  custom_and_law: 0
};

const FULL_ATTRIBUTES = {
  strength: 12,
  agility: 10,
  endurance: 11,
  reason: 9,
  attention: 10,
  influence: 8
};

export function buildCanonicalPlayerSeedFixture(overrides = {}) {
  const base = {
    version: 1,
    schema: 'player_seed',
    name: 'Олех',
    role: 'плотник',
    status: 'зависимый ремесленник',
    socialClass: 'крестьянин',
    ageRange: '30 лет',
    origin: 'село на реке Шелонь',
    visibleStatus: 'отрабатывает долг на переправе',
    trueStatus: 'должен хозяину двора 3 гривны',
    reasonHere: 'чинит паром и лодки для перевозки ополченцев',
    occupation: 'плотник',
    bodyState: 'коренастый, сильные руки, старая травма левой ноги',
    language: 'древнерусский',
    literacy: 'неграмотен',
    clothing: 'льняная рубаха, серый зипун, лапти',
    family: ['жена и мать в лесу после разорения села'],
    memory: ['весна 1241 года — орден сжёг соседнее село'],
    knowledge: ['князь Александр велел чинить мосты и ладьи'],
    fears: ['продажа в холопы из-за долга'],
    goals: ['выплатить долг'],
    obligations: ['отработать долг хозяину переправы'],
    identity: {
      name: 'Олех',
      age_range: '30 лет',
      origin: 'село на реке Шелонь',
      social_status: 'крестьянин',
      occupation_or_role: 'плотник',
      visible_status: 'отрабатывает долг на переправе',
      true_status: 'должен хозяину двора 3 гривны',
      reason_here: 'чинит паром и лодки для перевозки ополченцев'
    },
    body: {
      description: 'коренастый, сильные руки, старая травма левой ноги',
      visible_marks: ['шрам на руке'],
      clothing: 'льняная рубаха, серый зипун, лапти',
      health: 74,
      satiety: 74,
      vigor: 61,
      active_conditions: []
    },
    states: {
      health: 74,
      satiety: 74,
      vigor: 61
    },
    attributes: { ...FULL_ATTRIBUTES },
    skill_bonuses: { ...FULL_SKILL_BONUSES },
    knowledge_map: {
      known_facts: ['князь Александр велел чинить мосты и ладьи'],
      rumors: ['слухи о дороге'],
      mistakes: [],
      unavailable_knowledge: [],
      known_places: ['тракт'],
      known_routes: ['переправа'],
      known_people: ['староста']
    },
    memory_profile: {
      key_memories: ['весна 1241 года — орден сжёг соседнее село'],
      debts: ['долг'],
      fears: ['продажа в холопы из-за долга'],
      obligations: ['отработать долг хозяину переправы'],
      unresolved_unknowns: ['что будет после расчёта с долгом']
    },
    goals_profile: {
      immediate_need: 'выплатить долг',
      long_term_desire: 'удержаться на своём дворе',
      fear: 'продажа в холопы из-за долга',
      obligation: 'отработать долг хозяину переправы',
      reason_to_act: 'иначе лишится двора',
      consequence_of_inaction: 'потеряет имущество и свободу'
    },
    relations: {
      known_npcs: ['староста'],
      patrons: [],
      debtors: [],
      creditors: [],
      enemies: [],
      witnesses: [],
      helpers: ['жена'],
      blockers: []
    },
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'tool',
          material: 'железо',
          condition: 'рабочий',
          size: 'medium',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visibility: 'visible',
          legal_status: 'ordinary',
          function: 'работа и починка',
          weight: 2,
          discoverability: 5,
          plausibility: 5,
          risk: 0,
          visible: true,
          marks: []
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: ['клеть при дворе'],
      borrowed_items: [],
      foreign_items_with_character: [],
      accessible_resources: ['двор переправы'],
      return_obligations: ['отработать долг хозяину переправы']
    },
    position: {
      region_id: 'novgorod',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:entry',
      anchor_id: 'yard:entry:0',
      last_route_id: 'route-1'
    },
    current_position: {
      region_id: 'novgorod',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:entry',
      anchor_id: 'yard:entry:0',
      last_route_id: 'route-1'
    },
    start_scene: {
      reason_here: 'чинит паром и лодки для перевозки ополченцев',
      visible_situation: 'двор у переправы',
      nearby_people: ['староста'],
      immediate_tension: 'долг и работа',
      intro_prose: 'Олех стоит у переправы и чинит лодку.'
    }
  };

  return deepMerge(base, overrides);
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return structuredClone(base);
  const next = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete next[key];
      continue;
    }
    if (value === null) {
      next[key] = null;
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value) && next[key] && typeof next[key] === 'object' && !Array.isArray(next[key])) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = structuredClone(value);
    }
  }
  return next;
}
