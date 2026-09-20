import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('every retained M3 gameplay campaign maps to one tracked sanitized report',
  async () => {
    const inventory = JSON.parse(await readFile(resolve(root,
      'docs/playtests/campaign-inventory.json'), 'utf8'));
    assert.equal(inventory.schema, 'rus.gameplay_report_inventory.v1');
    assert.equal(inventory.campaigns.length, 18);
    assert.equal(new Set(inventory.campaigns.map(({ campaign }) => campaign))
      .size, inventory.campaigns.length);
    assert.equal(new Set(inventory.campaigns.map(({ report }) => report))
      .size, inventory.campaigns.length);
    for (const { campaign, report } of inventory.campaigns) {
      assert.match(campaign, /^m3-[a-f0-9]{8}-/u);
      const text = await readFile(resolve(root, 'docs/playtests', report),
        'utf8');
      assert.match(text, /^# M3/u);
      assert.match(text, /## Gameplay transcript/u);
      assert.match(text, /## Result/u);
      assert.doesNotMatch(text,
        /Authorization\s*:|api[_ -]?key\s*[:=]|https?:\/\/192\.168\./iu);
    }
  });
