import { validateActorBaseAppearance } from '@rus/actors';

export function assertNoPortraitSpec(value) {
  if (containsKey(value, 'portrait_spec_v1')) {
    fail(
      'WRITE_PLAN_PORTRAIT_PROJECTION_FORBIDDEN',
      'portrait_spec_v1 is a read projection and cannot enter a party write plan.'
    );
  }
}

export function assertNewActorAppearance(
  identity,
  contractVersion,
  path,
  body = null,
  required = false
) {
  if (contractVersion !== 'actor_base_appearance_v1') {
    if (required) {
      fail('WRITE_PLAN_ACTOR_APPEARANCE_INCOMPLETE',
        `${path} must declare actor_base_appearance_v1.`);
    }
    return;
  }
  const validation = validateActorBaseAppearance(identity, {
    requireComplete: true,
    body
  });
  if (!validation.ok) {
    fail('WRITE_PLAN_ACTOR_APPEARANCE_INCOMPLETE',
      `${path} must contain a complete canonical actor appearance: ${validation.errors.join('; ')}`);
  }
}

function containsKey(value, key, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => containsKey(child, key, seen));
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
