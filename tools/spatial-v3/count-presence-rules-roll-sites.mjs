#!/usr/bin/env node
/**
 * Count merged presence rules that would roll for sample place families (summer/winter).
 * Usage: node tools/spatial-v3/count-presence-rules-roll-sites.mjs [path/to/presence_rules.json]
 */
import { readFile } from 'node:fs/promises';
import { mergePlaceFamilyPresenceRules } from '@rus/materialization';
import { ruleAllowedInSeason } from '../../packages/materialization/src/presence-rule-conflicts.js';

const path = process.argv[2]
  ?? 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json';
const rules = JSON.parse(await readFile(path, 'utf8'));
// G0 id after region-ids normalization; legacy fauna CSV still has `novgorod_land`.
const regionId = 'region_novgorod_land';
const samples = [
  'pf_arable_field',
  'pf_mixed_woodland',
  'pf_riverbank',
  'pf_rural_yard',
  'pf_fishing_camp',
];
for (const season of ['summer', 'winter']) {
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
    console.log(`${season} ${pf}: merged=${merged.length} (raw=${pfRules.length})`);
  }
  console.log(`${season} total merged category rules across samples: ${total}\n`);
}
const withAll = rules.filter((row) => ruleAllowedInSeason(row, 'summer')
  && row.region_id === regionId && row.subject_kind === 'category').length;
console.log(`summer+novgorod_land+category with allowed season: ${withAll}`);
