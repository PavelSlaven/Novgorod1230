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
const PRODUCER = path.join(GAME_BASE, 'scripts/build-master-material-view.py');
const OVERLAY_FIXTURE = path.join(ROOT, 'test/fixtures/issue-465/overlay-22.csv');
const SOURCE_FIXTURE = path.join(ROOT, 'test/fixtures/issue-465/source-synthetic.csv');
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
  '    r=m.load_material_overrides(sys.argv[4])',
  'except Exception as e:',
  '    print(json.dumps({"code":getattr(e,"code",""),"message":str(e)}))',
  'else:',
  '    print(json.dumps({"code":"ACCEPT","message":"","rows":[r[key] for key in sorted(r)]}))',
].join('\n');
const pythonBuildCode = [
  'import importlib.util,pathlib,sys',
  'p=pathlib.Path(sys.argv[1])',
  's=importlib.util.spec_from_file_location("build_material_view",p)',
  'm=importlib.util.module_from_spec(s)',
  's.loader.exec_module(m)',
  'm.build_and_write(sys.argv[2],sys.argv[3],sys.argv[4],expected_source_sha=sys.argv[5])',
].join('\n');
const pythonOverlayRewriteCode = [
  'import csv,io,json,sys',
  'with open(sys.argv[1],encoding="utf-8",newline="") as f:',
  '    reader=csv.DictReader(f); fields=reader.fieldnames; rows=list(reader)',
  'if sys.argv[3]=="multiline":',
  '    values=json.loads(rows[0]["materials"]); values.append(\'parity, "quoted"\')',
  '    rows[0]["materials"]=json.dumps(values,ensure_ascii=False,indent=2)',
  '    assert json.loads(rows[0]["materials"])[-1]==\'parity, "quoted"\'',
  'elif sys.argv[3]=="duplicate": rows.append(dict(rows[0]))',
  'elif sys.argv[3] in ("empty-id-lf","empty-id-no-lf"): pass',
  'output=io.StringIO(newline=""); writer=csv.DictWriter(output,fieldnames=fields); writer.writeheader(); writer.writerows(rows)',
  'data=output.getvalue()',
  'if sys.argv[3].startswith("empty-id-"):',
  '    data += chr(34)+chr(34)+("\\n" if sys.argv[3]=="empty-id-lf" else "")',
  'elif sys.argv[3] in ("multiline","duplicate"): data += "\\r\\n"',
  'with open(sys.argv[2],"w",encoding="utf-8",newline="") as f: f.write(data)',
].join('\n');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runPythonReader(source, overlay, view) {
  return spawnSync('python3', ['-B', '-c', pythonReaderCode, PY_READER, view, overlay, source],
    { encoding: 'utf8', timeout: 30_000 });
}

function runProducer(source, overlay, view) {
  return spawnSync('python3', ['-B', '-c', pythonBuildCode, PRODUCER, source, overlay, view,
    sha256(fs.readFileSync(source))], { encoding: 'utf8', timeout: 30_000 });
}

function rewriteOverlay(input, output, mode) {
  return spawnSync('python3', ['-B', '-c', pythonOverlayRewriteCode, input, output, mode],
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

test('material-view readers match Python CSV parsing for multiline quoted records', async t => {
  fs.mkdirSync(RUNTIME_PARENT, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(RUNTIME_PARENT, 'csv-parity-'));
  try {
    const source = path.join(runtimeRoot, 'source.csv');
    const overlay = path.join(runtimeRoot, 'overlay.csv');
    const view = path.join(runtimeRoot, 'view.json');
    fs.copyFileSync(SOURCE_FIXTURE, source);
    const rewritten = rewriteOverlay(OVERLAY_FIXTURE, overlay, 'multiline');
    assert.equal(rewritten.error, undefined, rewritten.error?.message);
    assert.equal(rewritten.status, 0, rewritten.stderr);
    const overlayBytes = fs.readFileSync(overlay);
    assert.match(overlayBytes.toString('utf8'), /parity/u, 'overlay must contain the quoted test value');
    assert.match(overlayBytes.toString('utf8'), /\r\n\r\n$/u, 'overlay ends with an empty CSV record');

    const built = runProducer(source, overlay, view);
    assert.equal(built.error, undefined, built.error?.message);
    assert.equal(built.status, 0, built.stderr);
    const generated = JSON.parse(fs.readFileSync(view, 'utf8'));
    const originalRows = generated.rows;
    const expectedIds = generated.rows.map(row => row.item_id).sort();
    const inputRows = expectedIds.map(item_id => ({ item_id, primary_material: 'source', materials: '[]' }));
    const { applyMaterialOverrides } = createRequire(JS_READER)(JS_READER);
    const jsRows = applyMaterialOverrides(inputRows, source, { viewPath: view, overlayPath: overlay })
      .map(({ item_id, primary_material, materials }) => ({ item_id, primary_material, materials }))
      .sort((a, b) => a.item_id.localeCompare(b.item_id));
    const python = runPythonReader(source, overlay, view);
    assert.equal(python.error, undefined, `Python reader spawn failed: ${python.error?.message}`);
    assert.equal(python.status, 0, python.stderr);
    const pythonResult = JSON.parse(python.stdout);
    assert.equal(pythonResult.code, 'ACCEPT', pythonResult.message);
    assert.deepEqual(jsRows.map(row => row.item_id), expectedIds);
    assert.deepEqual(pythonResult.rows.map(row => row.item_id), expectedIds);
    assert.deepEqual(jsRows, pythonResult.rows);

    await t.test('both readers reject a missing overlay item', () => {
      generated.rows = originalRows.slice(0, -1);
      fs.writeFileSync(view, JSON.stringify(generated));
      assert.throws(() => applyMaterialOverrides([], source, { viewPath: view, overlayPath: overlay }),
        { code: 'MATERIAL_VIEW_INCOMPLETE' });
      const result = runPythonReader(source, overlay, view);
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).code, 'MATERIAL_VIEW_INCOMPLETE');
    });

    await t.test('both readers reject duplicate overlay IDs', () => {
      const duplicate = rewriteOverlay(OVERLAY_FIXTURE, overlay, 'duplicate');
      assert.equal(duplicate.error, undefined, duplicate.error?.message);
      assert.equal(duplicate.status, 0, duplicate.stderr);
      generated.overlay_sha256 = sha256(fs.readFileSync(overlay));
      generated.rows = originalRows;
      fs.writeFileSync(view, JSON.stringify(generated));
      assert.throws(() => applyMaterialOverrides([], source, { viewPath: view, overlayPath: overlay }),
        /missing or duplicate item_id/u);
      const result = runPythonReader(source, overlay, view);
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stderr);
      assert.match(JSON.parse(result.stdout).message, /missing or duplicate item_id/u);
    });

    for (const mode of ['empty-id-lf', 'empty-id-no-lf']) {
      await t.test(`both readers reject quoted empty item_id (${mode})`, () => {
        const rewrittenEmpty = rewriteOverlay(OVERLAY_FIXTURE, overlay, mode);
        assert.equal(rewrittenEmpty.error, undefined, rewrittenEmpty.error?.message);
        assert.equal(rewrittenEmpty.status, 0, rewrittenEmpty.stderr);
        const overlayText = fs.readFileSync(overlay, 'utf8');
        if (mode === 'empty-id-lf') assert.match(overlayText, /\r\n""\n$/u);
        else assert.match(overlayText, /\r\n""$/u);

        generated.overlay_sha256 = sha256(fs.readFileSync(overlay));
        generated.rows = originalRows;
        fs.writeFileSync(view, JSON.stringify(generated));
        assert.throws(() => applyMaterialOverrides([], source, { viewPath: view, overlayPath: overlay }),
          /missing or duplicate item_id/u);
        const result = runPythonReader(source, overlay, view);
        assert.equal(result.error, undefined, result.error?.message);
        assert.equal(result.status, 0, result.stderr);
        assert.match(JSON.parse(result.stdout).message, /missing or duplicate item_id/u);
      });
    }
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
