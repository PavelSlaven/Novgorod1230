export function initialWorkingProjectionFrom(projected) {
  const descriptor = Object.getOwnPropertyDescriptor(
    projected, 'initial_working_projection'
  );
  if (descriptor == null) {
    return structuredClone(projected.player_safe_state);
  }
  if (descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')
      || !plain(descriptor.value)) {
    throw Object.assign(new Error(
      'Player-safe projector initial_working_projection must be an own data object.'
    ), { code: 'TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID' });
  }
  return structuredClone(descriptor.value);
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
