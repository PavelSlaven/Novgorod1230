import { createHash } from 'node:crypto';
import { stableStringify } from './stable-json.js';

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}
