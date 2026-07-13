import { deepFreeze } from '@rus/kernel';

export const DC = deepFreeze({ trivial:5, ordinary:10, risky:15, dangerous:20, limit:25, nearly_impossible:30 });

export function clampDifficulty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DC.ordinary;
  return Math.max(5, Math.min(30, Math.round(numeric)));
}

export function attributeBonus(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.floor((numeric - 10) / 2);
}

export function createSeededRandomSource(seed) {
  let counter = 0;
  const seedText = text(seed);
  return deepFreezeSource({
    next() {
      const random = mulberry32(hashString(`${seedText}|${counter}`));
      const value = random();
      counter += 1;
      return value;
    },
    snapshot() { return { algorithm:'mulberry32_v1', seed_ref:seedText, counter }; }
  });
}

export function rollDie(randomSource, sides = 20) {
  if (!randomSource || typeof randomSource.next !== 'function') throw new TypeError('RandomSource.next is required');
  const count = Number(sides);
  if (!Number.isInteger(count) || count < 2) throw new RangeError('sides must be an integer >= 2');
  const raw = Number(randomSource.next());
  if (!Number.isFinite(raw) || raw < 0 || raw >= 1) throw new RangeError('RandomSource.next must return [0,1)');
  return Math.floor(raw * count) + 1;
}

export function executeCheck(request = {}, randomSource) {
  const roll = rollDie(randomSource, 20);
  const modifiers = {
    attribute: attributeBonus(request.attribute_value),
    skill: finite(request.skill_bonus) ?? 0,
    state: finite(request.state_modifier) ?? 0,
    equipment: finite(request.equipment_modifier) ?? 0,
    circumstances: finite(request.circumstance_modifier) ?? 0
  };
  const total = roll + Object.values(modifiers).reduce((sum, value) => sum + value, 0);
  const difficulty = clampDifficulty(request.difficulty);
  return deepFreeze({
    check_id: text(request.check_id) || null,
    roll,
    modifiers,
    total,
    difficulty,
    outcome: evaluateCheckOutcome(roll, total, difficulty),
    audit: buildRollAuditRecord({ value: roll, formula: 'd20 + attribute + skill + state + equipment + circumstances', randomSource })
  });
}

export function evaluateCheckOutcome(roll, total, difficulty) {
  const margin = Number(total) - Number(difficulty);
  let band;
  if (margin >= 10) band = 'clean_success';
  else if (margin >= 0) band = 'success';
  else if (margin >= -4) band = 'success_with_cost';
  else if (margin >= -9) band = 'failure_with_consequence';
  else band = 'severe_failure';
  return deepFreeze({ margin, band, success: margin >= 0, cost_required: margin < 0 && margin >= -4, severe_failure: margin <= -10, roll_note: Number(roll) === 1 ? 'natural_1' : Number(roll) === 20 ? 'natural_20' : null });
}

export function buildRollAuditRecord({ value, formula = null, randomSource = null } = {}) {
  const snapshot = randomSource && typeof randomSource.snapshot === 'function' ? randomSource.snapshot() : {};
  return deepFreeze({ die:'d20', value:Number(value), rng_mode:snapshot.seed_ref ? 'seeded' : 'explicit_rng', algorithm:snapshot.algorithm ?? null, seed_ref:snapshot.seed_ref ?? null, counter:Number.isInteger(snapshot.counter) ? snapshot.counter - 1 : null, formula });
}

function hashString(value) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function mulberry32(seed) { let state = seed >>> 0; return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function deepFreezeSource(source) { return Object.freeze(source); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
