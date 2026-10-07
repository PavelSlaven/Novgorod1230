// D102 / REVIEW-sqlite-refs-checkable-02: acceptance before the scanner boundary fix.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOV = path.resolve(import.meta.dirname, '../..');
const CHECKER = path.join(import.meta.dirname, 'check-sqlite-refs.py');
const DATABASE = path.join(NOV, 'sources/bic-reproducible-inputs-v1/data/curated/novgorod_1230_curated.sqlite');
const VALID = 'sqlite:novgorod_1230:material_culture:височные кольца, бусы, подвески';
const MISSING = 'sqlite:novgorod_1230:economy:соль, acceptance_missing_469';
const SALT = 'sqlite:novgorod_1230:economy:соль';

function python(args, cwd) {
  const result = spawnSync('python3', args, {
    cwd,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { status: result.status, output: result.stdout + result.stderr };
}

function fixture(t, file, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-refs-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, 'data');
  const checker = path.join(data, 'world-catalogs/novgorod/game-base-v1/scripts/check-sqlite-refs.py');
  fs.mkdirSync(path.dirname(checker), { recursive: true });
  fs.copyFileSync(CHECKER, checker);
  // The real no --ref CLI discovers this isolated repository; no root monkeypatch.
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(data, file), content);
  return { root, data, checker };
}

const SCAN = `
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('sqlite_refs', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with module.open_database(sys.argv[3]) as con:
    control_error = module.reference_error(con, sys.argv[4])
    try:
        refs = module.source_references(pathlib.Path(sys.argv[2]))
        result = {'refs': [ref for _, _, ref in refs],
                  'errors': [module.reference_error(con, ref) for _, _, ref in refs],
                  'scan_error': None}
    except (RuntimeError, ValueError) as error:
        result = {'refs': [], 'errors': [], 'scan_error': str(error)}
result['control_error'] = control_error
print(json.dumps(result, ensure_ascii=False))
`;

const cases = [
  {
    name: 'JSON string preserves an existing key containing commas',
    file: 'refs.json', content: JSON.stringify({ source_refs: [VALID] }), ref: VALID, valid: true,
  },
  {
    name: 'JSON string with a missing comma suffix never resolves to its valid prefix',
    file: 'refs.json', content: JSON.stringify({ source_refs: [MISSING] }), ref: MISSING, valid: false,
  },
  {
    name: 'quoted CSV cell preserves the full comma-containing key',
    file: 'refs.csv', content: `id,source_ref\nrow1,"${VALID}"\n`, ref: VALID, valid: true,
  },
  {
    name: 'quoted prose preserves the full comma-containing key',
    file: 'refs.md', content: `Источник: "${VALID}".\n`, ref: VALID, valid: true,
  },
  {
    name: 'unquoted ambiguous comma tail fails as malformed instead of accepting its prefix',
    file: 'refs.md', content: `${MISSING}\n`, ref: MISSING, valid: false, ambiguous: true,
  },
];

for (const entry of cases) {
  test(`SQLite scan boundary: ${entry.name}`, (t) => {
    const tree = fixture(t, entry.file, entry.content);
    const scanResult = python(['-c', SCAN, tree.checker, tree.data, DATABASE, entry.ref], tree.root);
    assert.equal(scanResult.status, 0, scanResult.output);
    const scan = JSON.parse(scanResult.output);
    // Verify the premise against the tracked input, independently of extraction.
    if (entry.valid) assert.equal(scan.control_error, null, scanResult.output);
    else assert.match(scan.control_error, /SQLite key not found/, scanResult.output);

    const cli = python([tree.checker, '--db', DATABASE], tree.root);
    const diagnostic = JSON.stringify({ scan, cli }, null, 2);
    assert.equal(cli.status, entry.valid ? 0 : 1, diagnostic);
    assert.match(cli.output, entry.valid ? /RESULT PASS 0/ : /RESULT FAIL/, diagnostic);
    assert.doesNotMatch(cli.output, /WARN.*unchecked/, diagnostic);
    if (!entry.valid) assert.doesNotMatch(cli.output, /RESULT PASS/, diagnostic);

    if (entry.ambiguous) {
      assert.ok(!scan.refs.includes(SALT), diagnostic);
      assert.ok(scan.scan_error || scan.errors.some(Boolean), diagnostic);
      assert.match([scan.scan_error, ...scan.errors, cli.output].join('\n'),
        /malformed|ambiguous|unquoted/i, diagnostic);
    } else {
      assert.equal(scan.scan_error, null, diagnostic);
      assert.deepEqual(scan.refs, [entry.ref], diagnostic);
      assert.equal(scan.errors.length, 1, diagnostic);
      if (entry.valid) assert.equal(scan.errors[0], null, diagnostic);
      else assert.ok(scan.errors[0]?.includes(entry.ref), diagnostic);
    }
  });
}
