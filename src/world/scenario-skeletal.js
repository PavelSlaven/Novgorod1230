// ponytail: skeletal scenario seed — semantic facts belong to LLM stages, not code
export function createSkeletalScenario(id, hint, year, currentLocationId = 'start') {
  const location = {
    id: currentLocationId,
    name: currentLocationId,
    kind: 'место',
    landmarks: [],
    exits: [],
    occupants: [],
    condition: 'unknown',
    activity: [],
    recentTraces: [],
    pressure: [],
    sounds: [],
    attention: 'низкое',
    weather: '',
    light: ''
  };

  return {
    id,
    hint,
    currentLocationId,
    history: { era: 'XIII век', year },
    region: { name: '' },
    place: {
      name: '',
      kind: 'место',
      landmarks: [],
      exits: [],
      occupants: []
    },
    locations: {
      [currentLocationId]: location
    },
    scene: {
      weather: '',
      light: '',
      sounds: [],
      pressure: [],
      attention: 'низкое'
    },
    player: {
      name: 'безымянный путник',
      role: 'путник',
      states: { health: 100, satiety: 80, vigor: 80 },
      inventory: []
    },
    npcs: []
  };
}
