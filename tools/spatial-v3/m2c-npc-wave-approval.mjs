import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const APPROVAL_PATH = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/approval.json';
export const GENERATOR_SOURCE_PATHS = [
  'data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv',
  'data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv',
  'data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv',
  'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/households_kinship/relationship_rules.csv',
  'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/speech_address/address_forms.csv',
  'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/households_kinship/household_composition_profiles.csv',
  'data/world-catalogs/novgorod/game-base-v1/places-binding/slots/slot_instance_variants.json',
  'data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/weather_climate/water_profiles.csv',
  'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/phase_activity.csv',
  'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/phase_activity.csv',
];

export const REQUIRED_VERIFICATION_REFS = Object.freeze({
  places_binding: 'data/world-catalogs/novgorod/game-base-v1/places-binding/VERIFICATION.md',
  households_psychology_speech: 'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/VERIFICATION.md',
  nature_materials_weather: 'data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/VERIFICATION.md',
  fauna_fish_invertebrates_livestock: 'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/VERIFICATION.md',
  fauna_mammals_birds: 'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/VERIFICATION.md',
});

const PLACEHOLDER_CHECKED_BY = /\b(draft|executor|pending-reviewer|pending_reviewer)\b/iu;

export async function validateM2cNpcWaveApproval({ root = process.cwd(), approvalPath = APPROVAL_PATH } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  let approval;
  try {
    approval = JSON.parse(await readFile(resolve(projectRoot, approvalPath), 'utf8'));
  } catch {
    return Object.freeze({ ok: false, errors: Object.freeze([{ code: 'M2C_WAVE_APPROVAL_MISSING', subject_ref: approvalPath }]) });
  }
  const allowedVerdicts = new Set(['approve', 'approve_with_limits']);
  if (!allowedVerdicts.has(approval.verdict)) errors.push({ code: 'M2C_WAVE_APPROVAL_VERDICT_INVALID', subject_ref: String(approval.verdict ?? '') });
  if (!String(approval.source_commit ?? '').match(/^[0-9a-f]{40}$/u)) errors.push({ code: 'M2C_WAVE_APPROVAL_COMMIT_INVALID', subject_ref: String(approval.source_commit ?? '') });
  const paths = new Set((approval.source_paths ?? []).map(String));
  for (const path of GENERATOR_SOURCE_PATHS) {
    if (!paths.has(path)) errors.push({ code: 'M2C_WAVE_APPROVAL_SOURCE_PATH_MISSING', subject_ref: path });
  }
  const checkedBy = String(approval.checked_by ?? '').trim();
  if (!checkedBy) errors.push({ code: 'M2C_WAVE_APPROVAL_CHECKED_BY_MISSING', subject_ref: approvalPath });
  else if (PLACEHOLDER_CHECKED_BY.test(checkedBy)) {
    errors.push({ code: 'M2C_WAVE_APPROVAL_CHECKED_BY_PLACEHOLDER', subject_ref: checkedBy });
  }
  if (!String(approval.checked_at ?? '').trim()) errors.push({ code: 'M2C_WAVE_APPROVAL_CHECKED_AT_MISSING', subject_ref: approvalPath });
  const refs = approval.references ?? {};
  if (String(refs.game_base_status ?? '') !== 'data/world-catalogs/novgorod/game-base-v1/STATUS.md') {
    errors.push({ code: 'M2C_WAVE_APPROVAL_STATUS_REF_INVALID', subject_ref: String(refs.game_base_status ?? '') });
  }
  for (const [key, expectedPath] of Object.entries(REQUIRED_VERIFICATION_REFS)) {
    if (String(refs[key] ?? '') !== expectedPath) {
      errors.push({ code: 'M2C_WAVE_APPROVAL_VERIFICATION_REF_MISSING', subject_ref: key });
    }
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), approval });
}
