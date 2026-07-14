import { isObject } from './utils.js';
import { computeStage26ScreenDigest } from '@rus/contracts';

export function canonicalStage26Json(value) {
  return JSON.stringify(sortValue(value));
}

export function computeStage26Digest(value) {
  return computeStage26ScreenDigest(value);
}

export function sameJson(a, b) {
  return canonicalStage26Json(a) === canonicalStage26Json(b);
}

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
