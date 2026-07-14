import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { serverError } from './errors.js';

export function assertPublicPayload(value) {
  const leaks = detectHiddenLeaks(value);
  if (leaks.length) {
    throw serverError('PUBLIC_PAYLOAD_HIDDEN_LEAK', 'Public API payload contains hidden fields.', { status: 500 });
  }
  return value;
}
