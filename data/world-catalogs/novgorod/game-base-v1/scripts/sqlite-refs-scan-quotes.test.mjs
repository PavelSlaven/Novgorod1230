// D102 / REVIEW-sqlite-refs-checkable-03: acceptance before the quote boundary fix.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOV = path.resolve(import.meta.dirname, '../..');
const CHECKER = path.join(import.meta.dirname, 'check-sqlite-refs.py');
const DATABASE = path.join(NOV, 'sources/bic-reproducible-inputs-v1/data/curated/novgorod_1230_curated.sqlite');
const VALID = 'sqlite:novgorod_1230:economy:соль';
const MISSING = 'sqlite:novgorod_1230:economy:acceptance_missing_469';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-refs-quotes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, 'data');
  const checker = path.join(data, 'world-catalogs/novgorod/game-base-v1/scripts/check-sqlite-refs.py');
  fs.mkdirSync(path.dirname(checker), { recursive: true });
  fs.copyFileSync(CHECKER, checker);
  // Exercise repository discovery and the real no --ref CLI in an isolated tree.
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

const cases = [];
for (const extension of ['md', 'txt']) {
  for (const quote of ["'", '"']) {
    for (const valid of [true, false]) {
      const ref = valid ? VALID : MISSING;
      const ca = extension === 'md' && quote === "'" && valid;
      cases.push({
        name: ca ? 'CA F1: single quote after a word and space in Markdown' :
          `${extension}: ${quote === "'" ? 'single' : 'double'} quotes after a space, ${valid ? 'existing' : 'missing'} key`,
        file: `refs.${extension}`, content: `Источник ${quote}${ref}${quote}.\n`, ref, valid,
      });
    }
  }
}
cases.push(
  {
    name: 'English apostrophe inside a word does not open a quoted value',
    file: 'refs.md', content: `Author's note ${VALID}\n`, ref: VALID, valid: true,
  },
  {
    name: 'Russian apostrophe inside a word does not open a quoted value',
    file: 'refs.txt', content: `Д'Артаньян: ${VALID}\n`, ref: VALID, valid: true,
  },
);

for (const entry of cases) {
  test(`SQLite scan quotes: ${entry.name}`, (t) => {
    const tree = fixture(t, entry.file, entry.content);
    const scanResult = python(['-c', SCAN, tree.checker, tree.data, DATABASE, entry.ref], tree.root);
    const cli = python([tree.checker, '--db', DATABASE], tree.root);
    assert.equal(scanResult.status, 0, scanResult.output);
    const scan = JSON.parse(scanResult.output);
    const diagnostic = JSON.stringify({ scan, cli }, null, 2);

    // Check the fixture premise against the tracked SQLite, independently of extraction.
    if (entry.valid) assert.equal(scan.control_error, null, diagnostic);
    else assert.match(scan.control_error, /SQLite key not found/, diagnostic);

    assert.equal(cli.status, entry.valid ? 0 : 1, diagnostic);
    assert.match(cli.output, entry.valid ? /RESULT PASS 0/ : /RESULT FAIL 1/, diagnostic);
    assert.match(cli.output, /refs checked 1/, diagnostic);
    assert.doesNotMatch(cli.output, /WARN.*unchecked/, diagnostic);

    // A missing quoted key must reach exact lookup; malformed FAIL is not sufficient.
    assert.equal(scan.scan_error, null, diagnostic);
    assert.deepEqual(scan.refs, [entry.ref], diagnostic);
    assert.equal(scan.errors.length, 1, diagnostic);
    if (entry.valid) assert.equal(scan.errors[0], null, diagnostic);
    else {
      assert.match(scan.errors[0], /SQLite key not found/, diagnostic);
      assert.ok(scan.errors[0].includes(entry.ref), diagnostic);
      assert.ok(cli.output.includes(entry.ref), diagnostic);
      assert.match(cli.output, /SQLite key not found/, diagnostic);
      assert.doesNotMatch(cli.output, /RESULT PASS/, diagnostic);
    }
  });
}
