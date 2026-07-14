export function parseTapSummary(output = '') {
  const text = String(output ?? '');
  const number = (label) => {
    const matches = [...text.matchAll(new RegExp(`^# ${label} (\\d+)$`, 'gmu'))];
    return matches.length ? Number(matches.at(-1)[1]) : 0;
  };
  const failedTests = [...text.matchAll(/^not ok \d+ - (.+)$/gmu)].map((match) => match[1].trim());
  return Object.freeze({
    tests: number('tests'),
    pass: number('pass'),
    fail: number('fail'),
    skipped: number('skipped'),
    cancelled: number('cancelled'),
    todo: number('todo'),
    duration_ms: parseDuration(text),
    failed_tests: failedTests
  });
}

function parseDuration(text) {
  const matches = [...text.matchAll(/^# duration_ms ([0-9.]+)$/gmu)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}
