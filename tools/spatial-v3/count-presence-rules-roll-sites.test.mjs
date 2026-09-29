import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  countRegionalSummerCategoryRules,
  countSampleMergedPresenceRules,
  DEFAULT_PRESENCE_REGION_ID,
} from './count-presence-rules-roll-sites.mjs';

test('countSampleMergedPresenceRules returns positive totals for wave dataset slice', async () => {
  const rules = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json',
    'utf8',
  ));
  const totals = countSampleMergedPresenceRules(rules);
  assert.ok(totals.summer > 0);
  assert.ok(totals.winter > 0);
  assert.ok(countRegionalSummerCategoryRules(rules, null) > 0);
});
