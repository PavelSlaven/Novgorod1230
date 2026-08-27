import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runFrozenRoleEval } from './runner.mjs';

const root = resolve(import.meta.dirname, '../../..');
const corpusPath = process.env.LLM_EVAL_CORPUS ?? resolve(root, 'data/model-evals/llm-runtime/frozen-role-requests-v1.json');
const outputPath = process.env.LLM_EVAL_OUT ?? resolve(root, 'artifacts/llm-runtime-eval-report.json');
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const baseUrl = process.env.LLM_EVAL_BASE_URL;
const model = process.env.LLM_EVAL_MODEL;
const mode = process.env.LLM_EVAL_MODE;
const override = mode === 'custom'
  ? (() => {
      if (!baseUrl || !model) throw new Error('Set both LLM_EVAL_BASE_URL and LLM_EVAL_MODEL for custom provider override.');
      return { compatibility: 'openai_compatible', baseUrl, model,
        apiKey: process.env.LLM_EVAL_API_KEY || undefined };
    })()
  : mode === 'default' ? undefined
    : (() => { throw new Error('Set LLM_EVAL_MODE=default or LLM_EVAL_MODE=custom; eval never starts a network run implicitly.'); })();
const report = await runFrozenRoleEval({ corpus, runtimeProviderOverride: override });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, ...report.aggregates.total }));
