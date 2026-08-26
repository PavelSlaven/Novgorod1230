import { startLocalPlay } from './local-play.js';

const localPlay = await startLocalPlay();
let forwardedSignal = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  forwardedSignal = true;
  localPlay.child.kill(signal);
});
const [exitCode] = await new Promise((resolve) => localPlay.child.once('exit', (...result) => resolve(result)));
if (!forwardedSignal && exitCode !== 0) process.exitCode = exitCode ?? 1;
