# Authored Portrait Contract

## Статус и владелец

Это контракт действующего production-renderer авторских растровых портретов
Нижней Двины. Он не описывает экспериментальный процедурный Portrait Lab и
не обещает будущие маски, позы, предметы в руках или автоматический поиск
«наиболее похожего» набора.

Server передаёт необязательный player-safe ключ
`active_interlocutor.portrait_asset_id`. Browser использует только точный
известный ключ и не анализирует имя, роль или prose персонажа.

## Каталог комплектов

| `portrait_asset_id` | Folder |
| --- | --- |
| `lower-dvina-mikula` | `mikula` |
| `lower-dvina-onisim` | `onisim` |
| `lower-dvina-eremey` | `eremey` |
| `lower-dvina-ratsha` | `ratsha` |
| `lower-dvina-zhdanko` | `zhdanko` |
| `lower-dvina-fisher-1` | `fisher-1` |
| `lower-dvina-fisher-2` | `fisher-2` |

Комплект расположен в
`public/assets/portrait/lower-dvina/{folder}/` и содержит:

- `outfit.png` — утверждённые тело, руки и одежда;
- `heads/{emotion}.png` — сменная голова эмоции.

Все PNG имеют 768×768, RGBA, настоящий прозрачный фон и общую координатную
сетку. Runtime не режет JPG, не деформирует голову и не смешивает части разных
персонажей.

## Эмоции

Закрытый набор:

`neutral`, `calm`, `happy`, `sad`, `angry`, `afraid`, `suspicious`, `tired`,
`surprised`.

Неизвестная эмоция выбирает `neutral`. Intensity временно не меняет asset.
Во всех девяти вариантах глаза открыты. Для `calm` и `tired` веки могут быть
опущены, но радужка и зрачок остаются видимыми. Головы должны сохранять
личность, anchor шеи и положение черепа; повтор одной картинки под разными
названиями не допускается.

## Выбор и fallback

- Известный `portrait_asset_id` выбирает весь авторский комплект.
- Отсутствующий или неизвестный ключ использует `portrait_spec_v1`.
- Ошибка загрузки `outfit` или головы переводит весь портрет на процедурный
  fallback, если server также передал `portrait_spec_v1`; без него портрет не
  рисуется.
- Авторские и процедурные части одного портрета никогда не смешиваются.
- Комплект Микулы присутствует в каталоге и контрольных материалах, но
  отдельный UI портрета игрока не добавлен.

## Композиция и освещение

Внутри авторского Canvas порядок фиксирован:

1. `outfit.png`;
2. `heads/{emotion}.png`;
3. brightness/contrast/saturation по `portraitLighting`;
4. tint и отражённый снежный свет только внутри alpha персонажа.

На общем экране портрет располагается справа поверх пейзажа. Прозрачный фон
не получает светокоррекцию. Дождь, снег и туман наружной сцены рисуются
отдельным foreground-слоем после персонажа.

## Player-safe mapping

Lower Dvina server projection сопоставляет authoritative
`participant_slot_ref` с одним из семи ключей. Это presentation mapping, а не
новое persisted world state. Неизвестный slot не получает выдуманный asset.

## Границы текущей реализации

Production-каталог содержит одну утверждённую позу анфас с руками на поясе и
одежду, уже включённую в `outfit.png`. Отдельные сменные одежда, ракурсы,
телосложения, оружие и предметы в руках пока отсутствуют. Семантическое
описание игры не обязано совпадать с изображением до последней детали.

## Точки аудита

- каталог и композитор: `src/features/conversation-portrait/authored-portrait.js`;
- выбор authored/fallback и порядок общей сцены:
  `src/app/scene-canvas-hydration.js`;
- public validation: `src/shared/scene-affordances.js`;
- server mapping Нижней Двины:
  `../game-server/src/infrastructure/postgres/lower-dvina-trace-screen-panels.js`;
- assets и выбор: `test/landscape-renderer.test.js`;
- procedural fallback и отдельный Portrait Lab описаны в `MODULE.md`.
