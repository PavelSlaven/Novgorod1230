import { parseArgs } from 'node:util';

try {
  const command = process.argv[2];
  const options = {
    packets: { recording: {}, moments: {}, actions: {}, 'game-data': { multiple: true } },
    writer: { moment: {} },
    judges: { anchors: {}, judges: {}, seed: {} },
    summary: { confirmations: {}, baseline: {} }
  };
  if (!Object.hasOwn(options, command)) throw new Error('Команда: packets, writer, judges или summary');
  const { values } = parseArgs({ args: process.argv.slice(3), options: Object.fromEntries(Object.entries({ dir: {}, ...options[command] }).map(([key, value]) => [key, { type: 'string', ...value }])) });
  const required = { packets: ['recording', 'moments'], writer: ['moment'], judges: ['anchors', 'judges', 'seed'], summary: [] };
  for (const key of ['dir', ...required[command]]) if (!values[key]) throw new Error(`Не задан --${key}`);
  const module = await import(`./${command === 'writer' ? 'requests' : command}.mjs`);
  await module[command](values);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
