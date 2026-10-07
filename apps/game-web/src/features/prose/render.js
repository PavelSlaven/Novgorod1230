import { escapeHtml } from '../../shared/escape-html.js';
export function renderProse(screen) {
  const mainProse = screen.main_prose ?? screen.prose ?? '';
  return `<article class="prose"><p>${escapeHtml(mainProse)}</p>${renderExactNpcUtterances(screen)}</article>`;
}

export function renderExactNpcUtterances(screen) {
  return (screen.exact_npc_utterances ?? []).map((entry) =>
    `<blockquote><strong>${escapeHtml(speakerLabel(screen, entry.speaker_ref))}</strong><p>${escapeHtml(entry.utterance_text)}</p></blockquote>`
  ).join('');
}

function speakerLabel(screen, speakerRef) {
  return screen.visible_context?.visible_npc?.find(({ entity_ref: ref }) =>
    ref?.entity_kind === speakerRef?.entity_kind
      && ref.entity_id === speakerRef?.entity_id)?.display_label ?? 'Собеседник';
}
