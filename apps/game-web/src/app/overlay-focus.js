export function trapOverlayFocus(event, root) {
  const panel = root.querySelector('[data-overlay-panel]');
  if (!panel) return;
  const focusable = [...panel.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && root.ownerDocument.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && root.ownerDocument.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
