export function clock(value) {
  return { whole_minutes: String(value), subminute_numerator: '0',
    subminute_denominator: '1' };
}
export function body() {
  return { health: 100, satiety: 100, energy: 100, active_conditions: [] };
}
export function activity(description) {
  return { op: 'request_activity', actor_ref: 'party-1',
    activity_kind: 'wait', target_refs: [], description };
}
