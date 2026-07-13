#!/usr/bin/env node
import { resolve } from 'node:path';
import { checkDocumentationOutputs, writeDocumentationOutputs } from './documentation.js';
import { writeKnowledgeSourceOutputs } from './knowledge-source.js';

const command = process.argv[2] ?? 'check';
const rootIndex = process.argv.indexOf('--root');
const root = resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : '.');

if (command === 'generate') {
  const knowledge = await writeKnowledgeSourceOutputs({ root });
  const result = await writeDocumentationOutputs(root);
  console.log(`Documentation generated: ${[...result.files, ...knowledge.files].sort().join(', ')}`);
} else if (command === 'check') {
  const result = await checkDocumentationOutputs(root);
  if (!result.ok) {
    console.error(`Documentation check failed:\n${result.errors.map((item) => `- ${item}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Documentation/generated data: OK (${result.checked_files.length} generated files)`);
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
