import { deepFreeze } from '@rus/kernel';
const metrics = new Set(['health', 'satiety', 'energy']);

export function detectBodyThresholdCrossings({ before, after,
  thresholds = [] } = {}) {
  if (!before || !after || !Array.isArray(thresholds)) {
    throw new TypeError('body threshold input required');
  }
  const crossings = [];
  for (const threshold of thresholds) {
    if (!threshold || !metrics.has(threshold.metric)
        || !['increase', 'decrease'].includes(threshold.direction)
        || typeof threshold.threshold_id !== 'string'
        || !Number.isFinite(Number(threshold.value))) {
      throw new TypeError('invalid threshold');
    }
    const from = Number(before[threshold.metric]);
    const to = Number(after[threshold.metric]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const crossed = threshold.direction === 'decrease'
      ? from > threshold.value && to <= threshold.value
      : from < threshold.value && to >= threshold.value;
    if (!crossed) continue;
    crossings.push({
      threshold_id: threshold.threshold_id,
      metric: threshold.metric,
      direction: threshold.direction,
      value: threshold.value,
      from,
      to,
      ...(threshold.decision_signal === undefined ? {} : {
        decision_signal: structuredClone(threshold.decision_signal)
      })
    });
  }
  return deepFreeze(crossings.sort((left, right) =>
    left.threshold_id.localeCompare(right.threshold_id, 'en')));
}
