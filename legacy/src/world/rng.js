export const RNG_ALGORITHM = 'mulberry32_v1';

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isTestRngMode(world = null) {
  if (process.env.NODE_TEST_CONTEXT) return true;
  if (world?.scenarioFixture) return true;
  return false;
}

export function rollD20({ rng = null, auditSeed = null, testMode = false, world = null } = {}) {
  let value;
  let rngMode;
  let seedRef = null;
  let algorithm = null;
  let counter = null;
  const worldRng = world?.rng;

  if (!testMode && worldRng && worldRng.seed != null && Number.isFinite(Number(worldRng.counter))) {
    counter = Number(worldRng.counter);
    const next = mulberry32(hashString(`${worldRng.seed}|${counter}`));
    value = Math.floor(next() * 20) + 1;
    worldRng.counter = counter + 1;
    rngMode = 'seeded';
    seedRef = `${worldRng.seed}:${counter}`;
    algorithm = worldRng.algorithm ?? RNG_ALGORITHM;
  } else if (testMode) {
    value = (hashString(String(auditSeed ?? '0')) % 20) + 1;
    rngMode = 'seeded';
    seedRef = String(auditSeed ?? '0');
    algorithm = RNG_ALGORITHM;
  } else if (typeof rng === 'function') {
    value = Math.floor(rng() * 20) + 1;
    rngMode = 'explicit_rng';
  } else {
    value = Math.floor(Math.random() * 20) + 1;
    rngMode = 'unseeded_dev';
  }

  return {
    value,
    rng_mode: rngMode,
    seed_ref: seedRef,
    algorithm,
    counter
  };
}

export function buildRollAuditRecord({
  rollId = null,
  value,
  rngMode,
  seedRef = null,
  algorithm = null,
  counter = null,
  formula = null
} = {}) {
  return {
    roll_id: rollId ?? `roll_${Date.now()}`,
    die: 'd20',
    value,
    rng_mode: rngMode,
    algorithm: algorithm ?? null,
    seed_ref: seedRef ?? null,
    counter: Number.isFinite(Number(counter)) ? Number(counter) : null,
    formula: formula ?? null
  };
}

export function buildCheckRollContext(world, frame, intent) {
  const testMode = isTestRngMode(world);
  const auditSeed = testMode
    ? [
      world?.worldId,
      world?.clock?.day ?? 0,
      world?.clock?.hour ?? 0,
      world?.clock?.minute ?? 0,
      frame?.world?.location?.id,
      frame?.input,
      intent?.type,
      intent?.target ?? ''
    ].join('|')
    : null;
  return { testMode, auditSeed };
}
