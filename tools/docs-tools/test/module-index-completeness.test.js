import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocumentationOutputs } from '../src/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const groups = { modules: 'packages', applications: 'apps', tools: 'tools' };

// Read the sources independently of the generator's section/bullets helpers.
function sourceSection(markdown, titles) {
  const sections = markdown.split(/^##\s+(.+?)\s*$/mu);
  for (let i = 1; i < sections.length; i += 2) {
    if (titles.includes(sections[i].trim().toLowerCase())) return sections[i + 1].trim();
  }
  return '';
}

function sourceOwns(markdown) {
  const body = sourceSection(markdown, ['владеет', 'responsibilities', 'public api']);
  // A top-level item includes all its indented continuation lines, but not
  // separate unindented explanatory paragraphs elsewhere in the section.
  return [...body.matchAll(/^[-*][ \t]+([^\n]+(?:\n[ \t]+[^\n]+)*)/gmu)]
    .map((match) => match[1].replace(/\s+/gu, ' ').trim().replace(/[;.]$/u, ''));
}

async function readSources() {
  const sources = {};
  for (const [key, directory] of Object.entries(groups)) {
    sources[key] = [];
    const entries = await readdir(join(root, directory), { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const path = `${directory}/${entry.name}`;
      const packageText = await readFile(join(root, path, 'package.json'), 'utf8')
        .catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      if (packageText === null && key !== 'tools') continue;
      if (packageText !== null) JSON.parse(packageText);
      const markdown = await readFile(join(root, path, 'MODULE.md'), 'utf8')
        .catch((error) => { if (error.code === 'ENOENT') return ''; throw error; });
      if (packageText === null && !markdown) continue;
      const purpose = sourceSection(markdown, ['назначение', 'purpose'])
        .split(/\n\s*\n/u).find((paragraph) => paragraph.trim())
        ?.replace(/\s+/gu, ' ').trim() || 'Not documented.';
      sources[key].push({ path, owns: sourceOwns(markdown), purpose });
    }
    sources[key].sort((a, b) => a.path.localeCompare(b.path));
  }
  return sources;
}

const sources = await readSources();
const rebuilt = await buildDocumentationOutputs(root);

for (const mode of ['committed', 'rebuilt']) {
  test(`${mode} module-index JSON preserves every source ownership item in every group`, async () => {
    const text = mode === 'committed'
      ? await readFile(join(root, 'generated/module-index.json'), 'utf8')
      : rebuilt.get('generated/module-index.json');
    const index = JSON.parse(text);
    const failures = [];
    for (const key of Object.keys(groups)) {
      assert.deepEqual(index[key].map((item) => item.path).sort(), sources[key].map((item) => item.path).sort(), key);
      for (const source of sources[key]) {
        const actual = index[key].find((item) => item.path === source.path).owns;
        if (JSON.stringify(actual) !== JSON.stringify(source.owns)) {
          const item = source.owns.findIndex((value, i) => value !== actual[i]);
          failures.push(`${source.path}/MODULE.md: owns differs at item ${item < 0 ? source.owns.length + 1 : item + 1}`);
        }
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  test(`${mode} Markdown preserves three complete ownership items and declares omitted count`, async () => {
    const markdown = mode === 'committed'
      ? await readFile(join(root, 'MODULE_INDEX.md'), 'utf8')
      : rebuilt.get('MODULE_INDEX.md');
    const failures = [];
    for (const [key, entries] of Object.entries(sources)) {
      for (const source of entries) {
        const row = markdown.split(/\r?\n/u).find((line) => line.includes(`| \`${source.path}\` |`));
        assert.ok(row, `${source.path}: Markdown row missing`);
        // Split only table delimiters; literal pipes in descriptions are escaped.
        const actual = row.split(/(?<!\\)\|/u)[3].trim();
        const description = key === 'modules' && source.owns.length
          ? source.owns.slice(0, 3).join('; ')
          : source.purpose;
        const expected = description.replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim();
        const omitted = key === 'modules' ? Math.max(0, source.owns.length - 3) : 0;
        if (omitted === 0) {
          if (actual !== expected) failures.push(`${source.path}: description differs from source`);
        } else {
          const suffix = actual.startsWith(expected) ? actual.slice(expected.length).trim() : null;
          if (suffix === null || !new RegExp(`^(?:;\\s*)?…ещё ${omitted}$`, 'u').test(suffix)) {
            failures.push(`${source.path}: expected three complete items followed by …ещё ${omitted}`);
          }
        }
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
}
