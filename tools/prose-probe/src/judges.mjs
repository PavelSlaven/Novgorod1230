import { join } from 'node:path';
import { json, output, serialize, template, requireProse } from './files.mjs';
import { basis } from './requests.mjs';
import { schema } from './responses.mjs';

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, seed) {
  const result = [...values];
  const next = random(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function judges(options) {
  const count = Number(options.judges);
  const seed = Number(options.seed);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('--judges: нужно положительное целое число');
  if (!Number.isSafeInteger(seed)) throw new Error('--seed: нужно целое число');
  const packets = await json(join(options.dir, 'packets.json'));
  const anchors = await json(options.anchors);
  const texts = [];
  for (let i = 0; i < packets.length; i++) {
    const id = packets[i].id;
    const path = join(options.dir, `${id}.out.json`);
    texts.push({ id, text: requireProse(await json(path), path), facts: await basis(options.dir, packets, i), anchor: false });
  }
  for (const [id, anchor] of Object.entries(anchors)) {
    if (typeof anchor?.text !== 'string' || !anchor.text.trim() || typeof anchor?.facts !== 'string') throw new Error(`${options.anchors}: у ${id} нужны строки text и facts`);
    texts.push({ id, ...anchor, anchor: true });
  }
  if (new Set(texts.map(entry => entry.id)).size !== texts.length) throw new Error('Повторный id момента или якоря');
  const blind = shuffle(texts, seed).map((entry, i) => ({ ...entry, blind: `T${String(i + 1).padStart(2, '0')}` }));
  const key = { judges: count, seed, texts: Object.fromEntries(blind.map(entry => [entry.blind, entry.id])), anchors: blind.filter(entry => entry.anchor).map(entry => entry.blind) };
  const rubric = await template('judge-rubric.md');
  const files = { 'judge-key.json': serialize(key), 'judge-response.schema.json': serialize(schema) };
  for (let k = 1; k <= count; k++) {
    const order = shuffle(blind, (seed + Math.imul(k, 0x9E3779B9)) >>> 0);
    files[`judge${k}-pack.md`] = `${rubric}\n\n${order.map(entry => `## ${entry.blind}\n\n### Основание\n\n${entry.facts}\n\n### Текст\n\n${entry.text}`).join('\n\n')}\n`;
  }
  await output(options.dir, files);
}
