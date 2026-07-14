import fordSkeletal from './scenario-ford.js';
import marketSkeletal from './scenario-market.js';
import villageSkeletal from './scenario-village.js';
import fordFixture from './fixtures/scenario-ford-full.js';
import marketFixture from './fixtures/scenario-market-full.js';
import villageFixture from './fixtures/scenario-village-full.js';

const SKELETAL_SCENARIOS = [fordSkeletal, marketSkeletal, villageSkeletal];
const FIXTURE_SCENARIOS = [fordFixture, marketFixture, villageFixture];

function useScenarioFixtures(seed = {}) {
  return Boolean(process.env.NODE_TEST_CONTEXT || seed.scenarioFixture);
}

export function pickScenario(seed = {}) {
  const scenarios = useScenarioFixtures(seed) ? FIXTURE_SCENARIOS : SKELETAL_SCENARIOS;
  const startText = normalize(seed.startText ?? '');
  if (startText) {
    const byHint = scenarios.find((scenario) =>
      scenario.hint.some((hint) => startText.includes(hint))
    );

    if (byHint) return structuredClone(byHint);
  }

  const base = normalize(seed.worldId ?? 'world');
  return structuredClone(scenarios[hashString(base) % scenarios.length]);
}

function normalize(value) {
  return String(value).toLowerCase();
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}
