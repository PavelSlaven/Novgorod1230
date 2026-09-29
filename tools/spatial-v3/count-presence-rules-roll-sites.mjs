#!/usr/bin/env node
/**
 * Count merged presence rules that would roll for sample place families (summer/winter).
 * Usage: node tools/spatial-v3/count-presence-rules-roll-sites.mjs [path/to/presence_rules.json]
 */
import { readFile } from 'node:fs/promises';
import { mergePlaceFamilyPresenceRules } from '@rus/materialization';
import { ruleAllowedInSeason } from '../../packages/materialization/src/presence-rule-conflicts.js';

export const DEFAULT_SAMPLE_PLACE_FAMILIES = Object.freeze([
  'pf_arable_field',
  'pf_mixed_woodland',
  'pf_riverbank',
  'pf_rural_yard',
  'pf_fishing_camp',
]);

/** G0 id after region-ids normalization (LW-077 / region-ids task). */
export const DEFAULT_PRESENCE_REGION_ID = 'region_novgorod_land';

export function countSampleMergedPresenceRules(rules, {
  regionId = DEFAULT_PRESENCE_REGION_ID,
  samples = DEFAULT_SAMPLE_PLACE_FAMILIES,
  seasons = ['summer', 'winter'],
} = {}) {
  const totals = {};
  for (const season of seasons) {
    let total = 0;
    for (const pf of samples) {
      const pfRules = rules.filter((row) => row.scope_ref === pf && row.status === 'approved'
        && row.subject_kind === 'category');
      const merged = mergePlaceFamilyPresenceRules({
        primaryRules: pfRules,
        secondaryRules: [],
        regionId,
        season,
      });
      total += merged.length;
    }
    totals[season] = total;
  }
  return totals;
}

export function countRegionalSummerCategoryRules(rules, regionId = DEFAULT_PRESENCE_REGION_ID) {
  return rules.filter((row) => ruleAllowedInSeason(row, 'summer')
    && row.region_id === regionId && row.subject_kind === 'category').length;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const path = process.argv[2]
    ?? 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json';
  const rules = JSON.parse(await readFile(path, 'utf8'));
  const regionId = DEFAULT_PRESENCE_REGION_ID;
  for (const season of ['summer', 'winter']) {
    let total = 0;
    for (const pf of DEFAULT_SAMPLE_PLACE_FAMILIES) {
      const pfRules = rules.filter((row) => row.scope_ref === pf && row.status === 'approved'
        && row.subject_kind === 'category');
      const merged = mergePlaceFamilyPresenceRules({
        primaryRules: pfRules,
        secondaryRules: [],
        regionId,
        season,
      });
      total += merged.length;
      console.log(`${season} ${pf}: merged=${merged.length} (raw=${pfRules.length})`);
    }
    console.log(`${season} total merged category rules across samples: ${total}\n`);
  }
  const withAll = countRegionalSummerCategoryRules(rules, regionId);
  console.log(`summer+${regionId}+category with allowed season: ${withAll}`);
}
