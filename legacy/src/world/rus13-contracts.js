import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  explainActorProfilesValidation,
  explainHistoricalFrameValidation,
  explainLocationProfilesValidation,
  explainMasterNarrativeValidation,
  explainPlaceSeedValidation,
  explainPlayerSeedValidation,
  explainSocialTissueValidation,
  explainVisibleContextValidation
} from './json-contracts.js';

const CONTRACT_DIR = resolve(import.meta.dirname, 'contracts', 'rus13');

const VALIDATOR_BY_RUS13_CONTRACT = {
  HistoricalFrameDraft: explainHistoricalFrameValidation,
  StartPlaceDraft: explainPlaceSeedValidation,
  PlayerCharacterStartProfile: explainPlayerSeedValidation,
  InitialNpcLayer: explainActorProfilesValidation,
  InitialVisibleSceneAndIntroProse: explainVisibleContextValidation,
  StartConsistencyAuditReport: explainMasterNarrativeValidation,
  ActiveRegionContext: explainSocialTissueValidation,
  HistoricalPressurePackage: explainSocialTissueValidation
};

export function listRus13Contracts() {
  if (!existsSync(CONTRACT_DIR)) return [];
  return readdirSync(CONTRACT_DIR)
    .filter((name) => name.endsWith('.schema.json'))
    .sort()
    .map((name) => ({
      name: name.replace(/\.schema\.json$/u, ''),
      path: resolve(CONTRACT_DIR, name)
    }));
}

export function loadRus13Contract(name) {
  const path = resolve(CONTRACT_DIR, `${name}.schema.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateWithRus13Adapter(contractName, data) {
  const validate = VALIDATOR_BY_RUS13_CONTRACT[contractName];
  if (!validate) {
    return { ok: false, errors: [`No runtime validator adapter for RUS13 contract: ${contractName}`] };
  }
  return validate(data);
}
