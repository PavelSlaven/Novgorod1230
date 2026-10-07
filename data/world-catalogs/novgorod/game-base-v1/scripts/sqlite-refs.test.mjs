// D102 / #469 acceptance contract, written before the resolver implementation.
// CLI: python3 check-sqlite-refs.py --db <path> --ref <reference> [--ref ...].
// Validation errors: exit 1 and RESULT FAIL; valid references: exit 0 and RESULT PASS.
// With no arguments the checker validates every named novgorod_1230 ref in data/.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOV = path.resolve(import.meta.dirname, '../..');
const CHECKER = path.join(import.meta.dirname, 'check-sqlite-refs.py');
const DB_REL = 'sources/bic-reproducible-inputs-v1/data/curated/novgorod_1230_curated.sqlite';

function python(args, cwd = NOV) {
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

function tempDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-refs-469-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixtureDb(root) {
  const db = path.join(root, 'fixture.sqlite');
  const setup = python(['-c', `
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as con:
    con.execute('CREATE TABLE economy (item TEXT, confidence TEXT)')
    con.executemany('INSERT INTO economy VALUES (?, ?)', [
        ('зерно: рожь', 'A'), ('соль', 'A'), ('соль морская', 'B'),
        ('неоднозначный', 'B'), ('неоднозначный', 'C')])
    con.execute('CREATE TABLE events (date TEXT, confidence TEXT)')
    con.execute('INSERT INTO events VALUES (?, ?)', ('1230-09-14 ок.', 'A'))
    con.execute('CREATE TABLE famine_prices (item TEXT, confidence TEXT)')
    con.execute('INSERT INTO famine_prices VALUES (?, ?)',
                ('хлеб (готовая мера/каравай в летописном переводе)', 'A'))
    con.execute('CREATE TABLE sources (id TEXT, title TEXT)')
    con.execute('INSERT INTO sources VALUES (?, ?)', ('S02', 'Источник'))
`, db]);
  assert.equal(setup.status, 0, setup.output);
  return db;
}

function rejected(result) {
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /RESULT FAIL/);
  assert.doesNotMatch(result.output, /RESULT PASS|WARN.*unchecked/);
}

test('repository named SQLite references are checked by the CI entry point', () => {
  const result = python([CHECKER]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /RESULT PASS/);
  assert.doesNotMatch(result.output, /WARN.*unchecked/);
});

test('sqlite resolver accepts exact keys containing spaces and colons, reads without writes', (t) => {
  const db = fixtureDb(tempDir(t));
  const before = fs.readFileSync(db);
  const refs = [
    'sqlite:novgorod_1230:economy:зерно: рожь',
    'sqlite:novgorod_1230:economy:соль',
    'sqlite:novgorod_1230:events:1230-09-14 ок.',
    'sqlite:novgorod_1230:famine_prices:хлеб (готовая мера/каравай в летописном переводе)',
    'sqlite:novgorod_1230:sources:S02',
    'sqlite:novgorod_1230(1)(1).economy(соль,A)',
    'sqlite:novgorod_1230.sources#S02',
  ];
  const result = python([CHECKER, '--db', db, ...refs.flatMap(ref => ['--ref', ref])]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /RESULT PASS/);
  assert.doesNotMatch(result.output, /WARN.*unchecked/);
  assert.deepEqual(fs.readFileSync(db), before);
});

test('sqlite resolver fails on missing DB without creating it', (t) => {
  const db = path.join(tempDir(t), 'absent.sqlite');
  rejected(python([CHECKER, '--db', db, '--ref', 'sqlite:novgorod_1230:economy:соль']));
  assert.equal(fs.existsSync(db), false);
});

const invalidRefs = [
  ['unknown namespace', 'sqlite:other:economy:соль'],
  ['unknown table', 'sqlite:novgorod_1230:unknown:соль'],
  ['unknown key', 'sqlite:novgorod_1230:economy:нет такого товара'],
  ['missing key', 'sqlite:novgorod_1230:economy:'],
  ['malformed reference', 'sqlite:novgorod_1230:economy'],
  ['inexact space in key', 'sqlite:novgorod_1230:economy:зерно:рожь'],
  ['inexact prefix key', 'sqlite:novgorod_1230:famine_prices:хлеб'],
  ['inexact event date', 'sqlite:novgorod_1230:events:1230-09-14'],
  ['ambiguous key', 'sqlite:novgorod_1230:economy:неоднозначный'],
];
for (const [name, ref] of invalidRefs) {
  test(`sqlite resolver rejects ${name}`, (t) => {
    const db = fixtureDb(tempDir(t));
    rejected(python([CHECKER, '--db', db, '--ref', ref]));
  });
}

test('sqlite resolver fails on an unreadable SQLite file', (t) => {
  const db = path.join(tempDir(t), 'broken.sqlite');
  fs.writeFileSync(db, 'this is not a SQLite database');
  rejected(python([CHECKER, '--db', db, '--ref', 'sqlite:novgorod_1230:economy:соль']));
});

test('food check rejects an unresolved reference instead of WARN plus PASS', (t) => {
  const root = tempDir(t);
  // Keep the real checker, data and dependencies together; edit only the isolated CSV.
  // Keep the two explicit flora file refs; other siblings are optional diagnostics.
  for (const relative of [
    'game-base-v1/food-drink',
    'game-base-v1/scripts',
    'game-base-v1/flora-trees-shrubs/flora',
    'sources/master-archive-v1',
    'sources/bic-reproducible-inputs-v1',
    'world-knowledge/production-v1',
    'temporal-v4/datasets',
  ]) {
    fs.cpSync(path.join(NOV, relative), path.join(root, relative), { recursive: true });
  }
  const checker = path.join(root, 'game-base-v1/food-drink/scripts/check.py');
  const control = python([checker], root);
  assert.equal(control.status, 0, `Valid fixture must pass before mutation:\n${control.output}`);
  assert.match(control.output, /RESULT PASS/);
  assert.ok(fs.existsSync(path.join(root, DB_REL)));

  const ingredients = path.join(root, 'game-base-v1/food-drink/food/ingredients.csv');
  const missing = 'sqlite:novgorod_1230:economy:acceptance_missing_469';
  const mutation = python(['-c', `
import csv, json, sys
from pathlib import Path
p = Path(sys.argv[1])
with p.open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    fields, rows = reader.fieldnames, list(reader)
refs = json.loads(rows[0]['source_refs'])
refs.append(sys.argv[2])
rows[0]['source_refs'] = json.dumps(refs, ensure_ascii=False)
with p.open('w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
`, ingredients, missing], root);
  assert.equal(mutation.status, 0, mutation.output);
  const result = python([checker], root);
  rejected(result);
  assert.match(result.output, /acceptance_missing_469/);
});
