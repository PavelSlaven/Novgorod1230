import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GAME_BASE = path.join(ROOT, 'data/world-catalogs/novgorod/game-base-v1');
const JS_READER = path.join(GAME_BASE, 'scripts/material-view.cjs');
const PY_READER = path.join(GAME_BASE, 'scripts/material_view.py');
const RUNTIME_PARENT = process.env.FLEET_DIR
  ? path.join(process.env.FLEET_DIR, 'out/mutants/465-review-04')
  : path.join(ROOT, 'test/fixtures/material-view-completeness/scratch');
const pythonReaderCode = [
  'import importlib.util,json,pathlib,sys',
  'p=pathlib.Path(sys.argv[1])',
  's=importlib.util.spec_from_file_location("material_view",p)',
  'm=importlib.util.module_from_spec(s)',
  's.loader.exec_module(m)',
  'm.VIEW_PATH=pathlib.Path(sys.argv[2])',
  'm.OVERLAY_PATH=pathlib.Path(sys.argv[3])',
  'm.load_material_overrides.cache_clear()',
  'try:',
  '    m.load_material_overrides(sys.argv[4])',
  'except Exception as e:',
  '    print(json.dumps({"code":getattr(e,"code",""),"message":str(e)}))',
  'else:',
  '    print(json.dumps({"code":"ACCEPT","message":""}))',
].join('\n');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runPythonReader(source, overlay, view) {
  return spawnSync('python3', ['-B', '-c', pythonReaderCode, PY_READER, view, overlay, source],
    { encoding: 'utf8', timeout: 30_000 });
}

test('both material-view readers reject missing and extra overlay item IDs', async t => {
  fs.mkdirSync(RUNTIME_PARENT, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(RUNTIME_PARENT, 'runtime-'));
  try {
    const source = path.join(runtimeRoot, 'source.csv');
    const overlay = path.join(runtimeRoot, 'overlay.csv');
    const view = path.join(runtimeRoot, 'view.json');
    const sourceBytes = Buffer.from('item_id,primary_material,materials\nOMI00001,wood,["wood"]\nOMI00002,linen,["linen"]\n');
    const overlayBytes = Buffer.from([
      'item_id,primary_material_before,primary_material,materials_before,materials,approval_ref',
      'OMI00001,wood,hemp,["wood"],["hemp"],test#n1230:material_item:omi00001',
      'OMI00002,linen,wool,["linen"],["wool"],test#n1230:material_item:omi00002',
      '',
    ].join('\n'));
    fs.writeFileSync(source, sourceBytes);
    fs.writeFileSync(overlay, overlayBytes);
    const validRows = [
      { item_id: 'OMI00001', primary_material: 'hemp', materials: '["hemp"]' },
      { item_id: 'OMI00002', primary_material: 'wool', materials: '["wool"]' },
    ];
    const variants = [
      { name: 'rows absent', rows: undefined, missing: ['OMI00001', 'OMI00002'], extra: [] },
      { name: 'empty rows', rows: [], missing: ['OMI00001', 'OMI00002'], extra: [] },
      { name: 'subset', rows: validRows.slice(1), missing: ['OMI00001'], extra: [] },
      { name: 'extra row', rows: [...validRows, {
        item_id: 'OMI99999', primary_material: 'iron', materials: '["iron"]',
      }], missing: [], extra: ['OMI99999'] },
    ];
    const requireFromReader = createRequire(JS_READER);
    const { applyMaterialOverrides } = requireFromReader(JS_READER);

    for (const variant of variants) {
      await t.test(variant.name, () => {
        const materialView = {
          source_sha256: sha256(sourceBytes),
          overlay_sha256: sha256(overlayBytes),
        };
        if (variant.rows !== undefined) materialView.rows = variant.rows;
        fs.writeFileSync(view, JSON.stringify(materialView));

        assert.throws(() => applyMaterialOverrides([], source,
          { viewPath: view, overlayPath: overlay }), error => {
          assert.equal(error.code, 'MATERIAL_VIEW_INCOMPLETE', variant.name);
          for (const itemId of variant.missing) assert.match(error.message, new RegExp(itemId, 'u'));
          for (const itemId of variant.extra) assert.match(error.message, new RegExp(itemId, 'u'));
          return true;
        }, 'JavaScript reader');

        const python = runPythonReader(source, overlay, view);
        assert.equal(python.error, undefined, `Python reader spawn failed: ${python.error?.message}`);
        assert.equal(python.status, 0, python.stderr);
        const result = JSON.parse(python.stdout);
        assert.equal(result.code, 'MATERIAL_VIEW_INCOMPLETE', 'Python reader');
        for (const itemId of variant.missing) assert.match(result.message, new RegExp(itemId, 'u'));
        for (const itemId of variant.extra) assert.match(result.message, new RegExp(itemId, 'u'));
      });
    }
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
