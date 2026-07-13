#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  importKnowledgeSourceFromLegacy,
  inventoryLegacyKnowledgeSource,
  verifyKnowledgeSourceMigration,
  writeKnowledgeSourceOutputs
} from './knowledge-source.js';

const command = process.argv[2] ?? 'check';
const rootIndex = process.argv.indexOf('--root');
const root = resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : '.');

if (command === 'inventory') {
  console.log(JSON.stringify(await inventoryLegacyKnowledgeSource({ root }), null, 2));
} else if (command === 'import') {
  const result = await importKnowledgeSourceFromLegacy({ root });
  console.log(`Knowledge source imported: ${result.document_count} documents, ${result.inventory_count} legacy files classified.`);
} else if (command === 'generate') {
  const result = await writeKnowledgeSourceOutputs({ root });
  console.log(`Knowledge source generated: ${result.files.join(', ')}`);
} else if (command === 'check') {
  const result = await verifyKnowledgeSourceMigration({ root });
  if (!result.ok) {
    console.error(`Knowledge source check failed:\n${result.errors.map((item) => `- ${item}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Knowledge source: OK (${result.document_count} documents; graph and RAG current)`);
  }
} else {
  console.error(`Unknown knowledge command: ${command}`);
  process.exitCode = 2;
}
