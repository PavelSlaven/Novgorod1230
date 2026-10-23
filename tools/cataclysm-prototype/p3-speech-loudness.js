// Only explicit delivery cues are parsed; action and addressee stay with the planner.
export function parseP3SpeechLoudness(intent) {
  if (typeof intent !== 'string') throw new TypeError('intent must be a string');
  const closers = { '«': '»', '“': '”', '„': '“”', '"': '"' };
  const quotes = [];
  let directions = '';
  for (const char of intent) {
    if (quotes.length && quotes.at(-1).includes(char)) {
      quotes.pop();
    } else if (Object.hasOwn(closers, char)) {
      if (!quotes.length) directions += ' ';
      quotes.push(closers[char]);
    } else if (!quotes.length) directions += char;
  }
  const cues = directions.matchAll(
    /(?<![\p{L}\p{M}\p{N}_])(?:(не)\s+)?(шепчу|шепотом|шёпотом|кричу|криком)(?![\p{L}\p{M}\p{N}_])/giu);
  for (const [, negated, cue] of cues) {
    if (!negated) return /^ш/iu.test(cue) ? 1 : 4;
  }
  return 2;
}
