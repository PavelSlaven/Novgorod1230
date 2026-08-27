import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runFrozenRoleEval } from './runner.mjs';

const root = resolve(import.meta.dirname, '../../..');
const corpusPath = resolve(root, process.env.LLM_EVAL_CORPUS ?? 'data/model-evals/llm-runtime/frozen-role-requests-v1.json');
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
const report = await runFrozenRoleEval({ corpus, runtimeProviderOverride: override, metadata: {
  git: gitMetadata(),
  corpus: { path: repoRelativePath(corpusPath), version: corpus.corpus_version }
} });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, ...report.aggregates.total }));

function gitMetadata() {
  try {
    const checkout_sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8'
    }).trim().length > 0;
    return {
      checkout_sha,
      dirty
    };
  } catch {
    return { checkout_sha: null, dirty: null };
  }
}

function repoRelativePath(path) {
  const pathFromRoot = relative(root, path).replaceAll('\\', '/');
  if (pathFromRoot === '..' || pathFromRoot.startsWith('../')) {
    throw new Error('LLM_EVAL_CORPUS must be inside repository.');
  }
  return pathFromRoot;
}
