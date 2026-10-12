import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  mapPresenceRule,
  parseCsv,
} from '../../scripts/generate-m2c-npc-wave-datasets.mjs';
import { mergePlaceFamilyPresenceRules } from '../../packages/materialization/src/presence-rules-first-arrival.js';

const PRESENCE_CSV = 'data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv';
const REGION_ID = 'region_novgorod_land';
const LADOGA_SUBREGION = 'lower_volkhov_ladoga';
// Closed authoring vocabulary value used as an outside-Ladoga selector fixture, not a claimed site assignment.
const OUTSIDE_LADOGA_FIXTURE = 'novgorod_ilmen_core';

test('Ladoga ringed-seal authoring rule remains scoped through mapper and runtime selection', async () => {
  const csv = await readFile(resolve(process.cwd(), PRESENCE_CSV), 'utf8');
  const authoringRows = parseCsv(csv).filter((row) => row.scope_kind === 'place_family'
    && row.scope_ref === 'pf_lake_shore'
    && row.region_id === REGION_ID
    && row.subregion_scope === LADOGA_SUBREGION
    && row.subject_ref === 'fauna.mammal.marine_mammal.ladoga_ringed_seal'
    && row.allowed_seasons === 'winter');
  assert.equal(authoringRows.length, 1, 'confirmed authoring row exists for Ladoga winter lake shore');

  const mappedRule = mapPresenceRule(authoringRows[0], 'revision-test', 'source-test');
  const selectAt = (subregionScope) => mergePlaceFamilyPresenceRules({
    primaryRules: [mappedRule],
    regionId: REGION_ID,
    subregionScope,
    season: 'winter',
  });

  assert.deepEqual(selectAt(LADOGA_SUBREGION).map((rule) => rule.rule_id), [authoringRows[0].pr_id],
    'Ladoga runtime scope selects the authored seal rule');
  assert.deepEqual(selectAt(OUTSIDE_LADOGA_FIXTURE), [],
    'same-region outside-Ladoga fixture does not select the seal rule');
});
