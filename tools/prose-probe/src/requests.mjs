import { join } from 'node:path';
import { json, output, requireProse, template } from './files.mjs';

export async function basis(dir, packets, index) {
  const moment = packets[index];
  const scene = moment.parts[0]?.scene_id;
  const prior = packets.slice(0, index).flatMap(entry => entry.parts.filter(part => part.scene_id === scene));
  const sections = [
    `Прежние сведения этой сцены:\n${JSON.stringify(prior, null, 2)}`,
    `Части текущего момента:\n${JSON.stringify(moment.parts, null, 2)}`
  ];
  if (index > 0) {
    const path = join(dir, `${packets[index - 1].id}.out.json`);
    sections.push(`Предыдущий отрывок — не источник фактов:\n${requireProse(await json(path), path)}`);
  }
  return sections.join('\n\n');
}

export async function writer(options) {
  const packets = await json(join(options.dir, 'packets.json'));
  const index = packets.findIndex(moment => moment.id === options.moment);
  if (index < 0) throw new Error(`В packets.json нет момента ${options.moment}`);
  const system = await template('writer-system.md');
  const facts = await basis(options.dir, packets, index);
  const task = await template('writer-task.md');
  const request = `=== СИСТЕМНАЯ ИНСТРУКЦИЯ ===\n${system}\n\n=== СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ ===\n${facts}\n\n${task}`;
  await output(options.dir, { [`${options.moment}.req.txt`]: request });
}
