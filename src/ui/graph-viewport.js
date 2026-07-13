const MIN_SCALE = 0.55;
const MAX_SCALE = 2.8;
const WHEEL_FACTOR = 0.0016;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function attachGraphViewport(wrap, svg, options = {}) {
  if (!wrap || !svg) return null;

  const stage = document.createElement('div');
  stage.className = 'graph-stage';
  const controls = document.createElement('div');
  controls.className = 'graph-zoom-controls';

  for (const spec of [
    { action: 'in', label: '+', title: 'Приблизить' },
    { action: 'out', label: '−', title: 'Отдалить' },
    { action: 'reset', label: '◎', title: 'Сбросить масштаб' }
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-button small-button graph-zoom-button';
    button.dataset.zoom = spec.action;
    button.textContent = spec.label;
    button.title = spec.title;
    button.setAttribute('aria-label', spec.title);
    controls.append(button);
  }

  wrap.classList.add('graph-viewport');
  wrap.innerHTML = '';
  stage.append(svg);
  wrap.append(controls, stage);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let originX = 0;
  let originY = 0;

  const applyTransform = () => {
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const zoomAt = (nextScale, clientX, clientY) => {
    const rect = stage.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const ratio = clamped / scale;
    tx = localX - (localX - tx) * ratio;
    ty = localY - (localY - ty) * ratio;
    scale = clamped;
    applyTransform();
  };

  const reset = () => {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  };

  controls.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-zoom]') : null;
    if (!button) return;
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (button.dataset.zoom === 'in') zoomAt(scale * 1.15, centerX, centerY);
    else if (button.dataset.zoom === 'out') zoomAt(scale / 1.15, centerX, centerY);
    else reset();
  });

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(scale * (1 - event.deltaY * WHEEL_FACTOR), event.clientX, event.clientY);
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    panning = true;
    stage.classList.add('is-panning');
    panStartX = event.clientX;
    panStartY = event.clientY;
    originX = tx;
    originY = ty;
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!panning) return;
    tx = originX + (event.clientX - panStartX);
    ty = originY + (event.clientY - panStartY);
    applyTransform();
  });

  const endPan = (event) => {
    if (!panning) return;
    panning = false;
    stage.classList.remove('is-panning');
    if (event?.pointerId != null && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  };

  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('lostpointercapture', () => {
    panning = false;
    stage.classList.remove('is-panning');
  });

  applyTransform();
  return { reset, zoomAt };
}
