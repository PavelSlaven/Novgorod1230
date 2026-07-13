#!/usr/bin/env node
import { resolve } from 'node:path';
import { checkDocumentationOutputs, writeDocumentationOutputs } from './documentation-policy-v2.js';
import { writeKnowledgeSourceOutputsV2 } from './knowledge-materializer-v2.js';
import {
  checkWorldBaseSchemaReference,
  writeWorldBaseSchemaReference
} from '../../../scripts/generate-world-base-schema-reference.mjs';

const command = process.argv[2] ?? 'check';
const rootIndex = process.argv.indexOf('--root');
const root = resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : '.');

if (command === 'generate') {
  const knowledge = await writeKnowledgeSourceOutputsV2({ root });
  const worldBaseSchema = await writeWorldBaseSchemaReference({ root });
  const result = await writeDocumentationOutputs(root);
  console.log(`Documentation generated: ${[...result.files, ...knowledge.files, worldBaseSchema.path].sort().join(', ')}`);
} else if (command === 'check') {
  const result = await checkDocumentationOutputs(root);
  const schemaErrors = [];
  await checkWorldBaseSchemaReference({ root }).catch((error) => schemaErrors.push(error.message));
  const errors = [...result.errors, ...schemaErrors];
  if (errors.length) {
    console.error(`Documentation check failed:\n${errors.map((item) => `- ${item}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Documentation/generated data: OK (${result.checked_files.length + 1} generated files)`);
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
