import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const cli = resolve(root, 'packages/knowledge-source/src/cli.js');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env