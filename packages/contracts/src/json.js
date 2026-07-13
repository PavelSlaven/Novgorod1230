export function explainJsonObjectParse(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, error: 'Expected a non-empty JSON string.' };
  try {
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== 'object') return { ok: false, error: 'Expected a JSON object.' };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
