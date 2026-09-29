// Click on a movement shortcut: the exact label becomes the turn draft (server contract unchanged).
export function fillDraftFromMovementButton({ target, root, store, isBlocked }) {
  const button = target.closest?.('[data-movement-label]');
  if (!button || button.disabled || isBlocked(store.getState())) return false;
  const label = button.dataset.movementLabel ?? '';
  store.setDraft('turn', label);
  const textarea = root.querySelector('#turn-intent');
  if (textarea) textarea.value = label;
  textarea?.focus();
  return true;
}
