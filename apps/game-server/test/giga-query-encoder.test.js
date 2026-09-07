import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createGigaQueryEncoder } from
  '../src/infrastructure/embedding/giga-query-encoder.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

function encoderWith(children, timeoutMs = 20) {
  return createGigaQueryEncoder({ profilePath: 'profile.json', timeoutMs,
    spawnProcess() {
      const child = fakeChild();
      children.push(child);
      return child;
    } });
}

function ready(child) {
  child.stdout.write(`${JSON.stringify({ ready: true })}\n`);
}

function vector(child, id = 1) {
  child.stdout.write(`${JSON.stringify({ id,
    vector: Array.from({ length: 1024 }, () => 0) })}\n`);
}

test('encoder restarts after startup timeout', async () => {
  const children = [];
  const encoder = encoderWith(children, 10);

  await assert.rejects(encoder.ready(), (error) =>
    error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_EMBEDDING_STARTUP_TIMEOUT');
  assert.equal(children.length, 1);
  assert.equal(children[0].killed, true);

  const retry = encoder.encode('рыба');
  assert.equal(children.length, 2);
  ready(children[1]);
  await Promise.resolve();
  children[0].emit('exit', 1);
  vector(children[1]);
  assert.equal((await retry).length, 1024);
});

test('encoder reports request timeout, malformed worker vector, and worker exit as unavailable', async (t) => {
  await t.test('request timeout', async () => {
    const children = [];
    const encoder = encoderWith(children, 10);
    const pending = encoder.encode('рыба');
    ready(children[0]);
    await assert.rejects(pending, (error) => error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_EMBEDDING_TIMEOUT');
  });

  await t.test('malformed vector', async () => {
    const children = [];
    const encoder = encoderWith(children);
    const pending = encoder.encode('рыба');
    ready(children[0]);
    await Promise.resolve();
    children[0].stdout.write(`${JSON.stringify({ id: 1, vector: [0] })}\n`);
    await assert.rejects(pending, (error) => error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_EMBEDDING_VECTOR_INVALID');
  });

  await t.test('worker error', async () => {
    const children = [];
    const encoder = encoderWith(children);
    const pending = encoder.encode('рыба');
    ready(children[0]);
    await Promise.resolve();
    children[0].emit('error', new Error('worker failed'));
    await assert.rejects(pending, (error) => error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_EMBEDDING_WORKER_ERROR');
  });
});
