import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildStatus } from './build-status.mjs';

const candidate = 'x.csv';
const evidence = '- Основание утверждения: `approval.json`; финал `final-verdict.json`; кандидат `x.csv`.';

function generate(verification) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-status-approval-order-'));
  try {
    const groupRoot = path.join(root, 'sample-group');
    fs.mkdirSync(groupRoot, { recursive: true });
    fs.writeFileSync(path.join(groupRoot, candidate), '');
    fs.writeFileSync(path.join(groupRoot, 'VERIFICATION.md'), `${verification}\n`);
    const result = buildStatus(root);
    const file = result.results[0].files.get(candidate);
    const row = result.markdown.split('\n').find(line => line.includes(`\`${candidate}\``));
    return { ...result, file, row };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('later rework in the same section wins over earlier approval evidence', () => {
  const result = generate([
    '# Проверка',
    '## Итоговое решение',
    evidence,
    '- x.csv — rework: approval withdrawn.',
  ].join('\n'));
  assert.equal(result.file.status, 'rework');
  assert.equal(result.file.anchor, 'итоговое-решение');
  assert.equal(result.file.line, 4);
  assert.equal(result.counts.rework, 1);
  assert.match(result.row, /\[rework\]\(sample-group\/VERIFICATION\.md#итоговое-решение\)/);
});

test('later approve_with_limits in the same section keeps its status and decision line', () => {
  const result = generate([
    '# Проверка',
    '## Ограниченное решение',
    evidence,
    '- x.csv — approve_with_limits: retain stated limits.',
  ].join('\n'));
  assert.equal(result.file.status, 'approve_with_limits');
  assert.equal(result.file.anchor, 'ограниченное-решение');
  assert.equal(result.file.line, 4);
  assert.equal(result.counts.approve_with_limits, 1);
  assert.match(result.row, /\[approve_with_limits\]\(sample-group\/VERIFICATION\.md#ограниченное-решение\)/);
});

test('later approval evidence wins over an earlier rework decision', () => {
  const result = generate([
    '# Проверка',
    '## Первоначальное решение',
    '- x.csv — rework: needs approval.',
    '## Последнее утверждение',
    evidence,
  ].join('\n'));
  assert.equal(result.file.status, 'approve');
  assert.equal(result.file.anchor, 'последнее-утверждение');
  assert.equal(result.file.line, 5);
  assert.equal(result.counts.approve, 1);
  assert.match(result.row, /\[approve\]\(sample-group\/VERIFICATION\.md#последнее-утверждение\)/);
});
