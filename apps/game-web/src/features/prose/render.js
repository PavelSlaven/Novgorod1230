import { escapeHtml } from '../../shared/escape-html.js';
export function renderProse(screen) {
  const mainProse = screen.main_prose ?? screen.prose ?? '';
  return `<article class="prose"><p>${escapeHtml(mainProse)}</p></article>`;
}

export function renderExactNpcUtterances(screen) {
  return (screen.exact_npc_utterances ?? []).map((entry) => {
    const label = speakerLabel(screen, entry.speaker_ref);
    const speaker = label
      ? `<strong>${escapeHtml(label)}</strong>` : '';
    return `<blockquote>${speaker}<p>${escapeHtml(entry.utterance_text)}</p></blockquote>`;
  }).join('');
}

function speakerLabel(screen, speakerRef) {
  return screen.visible_context?.visible_npc?.find(({ entity_ref: ref }) =>
    ref?.entity_kind === speakerRef?.entity_kind
      && ref.public_key === speakerRef?.public_key)?.display_label;
}
