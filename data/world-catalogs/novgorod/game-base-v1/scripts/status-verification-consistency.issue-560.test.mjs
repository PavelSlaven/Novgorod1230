import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from './build-status.mjs';

function headingAnchor(text, anchors) {
  const slug = text.replace(/`|\*\*/g, '').toLowerCase()
    .replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
  const count = anchors.get(slug) ?? 0;
  anchors.set(slug, count + 1);
  return `${slug}${count ? `-${count}` : ''}`;
}

function latestFinalApproval(verification, file) {
  const anchors = new Map();
  let current = null;
  const sections = [];
  anchors.clear();
  current = null;
  for (const [index, line] of verification.split(/\r?\n/).entries()) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { anchor: headingAnchor(heading[1], anchors), line: index + 1, body: [] };
    } else if (current) current.body.push(line);
  }
  if (current) sections.push(current);
  const basename = path.posix.basename(file);
  return sections.filter(({ body }) => {
    const text = body.join('\n');
    const candidate = body.some(line => /кандидат\s+/i.test(line) && line.includes(basename));
    return candidate && /approval\.json/i.test(text) && /final-verdict\.json/i.test(text);
  }).at(-1) ?? null;
}

test('issue #560 (expected red): STATUS file verdict cites latest approval evidence', () => {
  const gameBase = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const group = 'households-psychology-speech';
  const file = 'speech_address/address_forms.csv';
  const statusLines = fs.readFileSync(path.join(gameBase, 'STATUS.md'), 'utf8').split(/\r?\n/);
  const rowIndex = statusLines.findIndex(line => line.includes(`\`${file}\``));
  assert.notEqual(rowIndex, -1, `STATUS.md must contain ${file}`);
  const row = statusLines[rowIndex].match(/^\| \[`([^`]+)`\]\(([^)]+)\) \| \[([^\]]+)\]\(([^)#]+)#([^)]+)\) \|$/);
  assert.ok(row, `STATUS.md:${rowIndex + 1} must have a file verdict and VERIFICATION anchor`);
  const [, listedFile, , status, , linkedAnchor] = row;
  assert.equal(listedFile, file);

  const parsed = parse(path.join(gameBase, group)).files.get(file);
  assert.ok(parsed, `${group}/VERIFICATION.md must contain a verdict for ${file}`);
  assert.equal(status, parsed.status,
    `STATUS.md:${rowIndex + 1} verdict for ${file} must match its latest explicit file verdict`);

  const verification = fs.readFileSync(path.join(gameBase, group, 'VERIFICATION.md'), 'utf8');
  const latest = latestFinalApproval(verification, file);
  assert.ok(latest, `${group}/VERIFICATION.md must contain final approval evidence for ${file}`);
  assert.equal(linkedAnchor, latest.anchor,
    `STATUS.md:${rowIndex + 1} links ${linkedAnchor}; latest final approval evidence is VERIFICATION.md:${latest.line} (#${latest.anchor})`);
});
