#!/usr/bin/env node
import { runOneClickBootstrap } from './one-click.js';

runOneClickBootstrap().catch((error) => {
  process.stderr.write(
    `One-click local play failed [${error.code ?? 'LOCAL_PLAY_FAILED'}]: ${error.message}\n`
  );
  process.exitCode = 1;
});
