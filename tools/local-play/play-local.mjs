#!/usr/bin/env node
import { runLocalPlay } from './local-play.js';

runLocalPlay().catch((error) => {
  process.stderr.write(
    `Local play failed [${error.code ?? 'LOCAL_PLAY_FAILED'}]: ${error.message}\n`
  );
  process.exitCode = 1;
});
