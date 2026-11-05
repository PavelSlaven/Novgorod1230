---
name: art-generator-1027
description: "Owner decisions 2026-10-27 on the code-drawn image generator (pilot, CR #908): landscape first after slice, replaces authored webp, map via own CDDA tiles"
metadata:
  node_type: memory
  type: project
  originSessionId: c4b3f6f6-dcb7-4cb0-9987-c1dea66d7168
  modified: 2026-10-27T16:29:44.273Z
---

Генератор картинок кодом (люди/лица, вещи, пейзаж, карта; стиль — плоский цвет, жёсткая тень, обводка). Пилот и листы — `codex-direct/art-pilot/`, карточка — `codex-direct/launch-art-generator.md`, CR — issue #908.

Решения владельца 2026-10-27: сейчас только CR, запуск после приёмки среза; первая часть — пейзаж в `apps/game-web`, проверка в текущем веб-клиенте; сгенерированный пейзаж **заменяет** authored webp (файлы не удалять без отдельного решения); карта — свои тайлы Руси для родной карты CDDA (кольцо после среза, SYS-14-02), не картинка в браузере. Остальные части — отдельными CR по одной. Рисующий код — Opus ([[feedback-visual-code-to-opus]]).

**Why:** GDD (D304, WLD-047) ставит генерацию «ближе к демо»; владелец подтвердил порядок и выбрал замену авторских картинок.
**How to apply:** при запуске после среза — шаги карточки, сначала сверка CR Codex sol; решения внести в decision-log через распорядителя ([[chief-coordinator]]).
