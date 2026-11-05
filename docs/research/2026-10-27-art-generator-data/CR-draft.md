# CR: генератор картинок в едином стиле — основа и пейзаж в `apps/game-web`

## Цель
Игра рисует картинки сама, детерминированным кодом и в одном стиле: плоский цвет, жёсткая граница тени, тёмная обводка (пилот владельца 2026-10-27: люди и лица, вещи, лесная дорога в 36 состояниях, карта). Эта задача переносит основу генератора и первую часть — пейзаж — в `apps/game-web`. Вход — уже существующая player-safe модель пейзажа, выход — SVG в сцене игры. Сгенерированный пейзаж заменяет авторские webp-картинки местности (решение владельца 2026-10-27). Запуск — после приёмки среза CDDA (решение владельца 2026-10-27; GDD: WLD-047, D304). Остальные части идут отдельными CR по одной, после проверки пейзажа в игре: портреты, вещи, затем свои тайлы Руси для родной карты CDDA (решение владельца 2026-10-27, кольцо после среза, SYS-14-02).

## Тип задачи
UI: пакет «Код», IDX «Narration/UI», ctx `UI_KIT`, `ARCHITECTURE`.

## Уровень качества и допустимый долг
Рабочее решение: пейзаж виден в обычном экране игры и заменяет авторские картинки. Поэтому обязательны все 8 типов местности (`open_meadow`, `main_river`, `side_channel`, `field_road`, `forest_road`, `wetland`, `offroad`, `shore_transition`) и вид изнутри для interior-сцен (состояния `dark` и `natural`). Разрешённый долг, записывается в LW в том же PR: время года не входит в модель экрана, поэтому снег в пейзаже есть только как погода, а деревья не меняются.

## Владельцы и MODULE.md
- Отрисовка пейзажа: `@rus/game-web` — `apps/game-web/MODULE.md`. Владелец остаётся `renderLandscape(screen)`; новая геометрия заменяет и Canvas-процедурный вид, и выбор authored webp. Точный `scene_asset_id` и stable location ref становятся зерном раскладки: у каждого места свой постоянный вид. Новый модуль не создаётся: основа стиля — внутренняя часть game-web (`src/features/art/` или рядом с landscape; путь фиксирует план исполнителя).
- Вход: `buildLandscapeRenderModel(screen)` — `apps/game-web/src/features/landscape/render-model.js`; словари — `apps/game-web/src/shared/scene-affordances.js`. Погоду, время суток и место считает сервер; браузер только рисует.
- Будущий вход из CDDA сюда не входит. Перевод погоды, времени и местности CDDA в эти словари делает владелец доставки экрана CDDA в браузер (P5, EXP-007), когда он появится. Таблица перевода ниже — заготовка для того CR:
  - погода, `data/json/weather_type.json`: `sunny`/`clear` → clear; `cloudy` → cloudy; `light_drizzle`, `drizzle`, `rain`, `rainstorm`, `thunder`, `lightning` → rain; `flurries`, `snowing`, `snowstorm` → snow; `mist`, `fog` → fog; прочие → clear;
  - время суток, `src/calendar.cpp:344–370`: `is_dawn` → dawn, `is_dusk` → dusk, `is_night` → night, иначе по часу: morning, day или evening;
  - место: overmap terrain героя (`forest*` → forest_road или offroad, `field` → open_meadow, `river*` → main_river, `lake_shore` → shore_transition, `road`/`forest_trail` → field_road или forest_road).

## Context pack
- `AGENTS.md`: WR §2, §18, §19, §21, §21.1, §24, §24.2, §29; AI §16; GS §26, §27; строка «UI».
- `CONTRACT_INDEX` §8.1, строка «Narration/UI».
- `apps/game-web/MODULE.md` — инварианты пейзажа, строки 53–58 и 112–133 на `origin/main` ede16033e; `apps/game-web/AUTHORED_LANDSCAPE_CONTRACT.md`.
- Код: `src/features/landscape/{render.js,render-model.js,canvas.js,canvas-atmosphere.js,geometry.js}`; `src/shared/scene-affordances.js`.
- Тесты: `apps/game-web/test/landscape-renderer.test.js`, `scene-canvas-hydration.test.js`, `landscape-control-sheet.js`.
- Пилот (исходник переноса): `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/art-pilot/` — `landscape.mjs`, `warrior.mjs` (общий набор: `kit`, `mix`, `rng`), `render-land.mjs`; листы — `sheets/`.
- GDD: EXP-001, EXP-014, WLD-047, SYS-14-02 (решение D304).

## Не трогать
- `AGENTS.md`, `docs/governance/*`, `docs/design/*`.
- Файлы `public/assets/landscape/*.webp` в этой задаче не удаляются: удаление — отдельным решением владельца после приёмки.
- Portrait Lab, портреты, карта, `game-server`, контракты в `packages/contracts`, CDDA и `tools/cataclysm-prototype`.

## Критерии готовности
- Для любой из 8 сцен × 6 частей суток × 6 погод и для interior-сцен показывается новый SVG-пейзаж в стиле пилота; authored webp больше не выбираются.
- Разные места одного типа (разный `scene_asset_id` или location ref) выглядят по-разному, одно место — всегда одинаково.
- Погода и время суток меняют только небо, палитру и атмосферу (осадки, туман, снежный покров как цвет). Геометрия земли, воды, дороги, деревьев и строений одинакова во всех 36 состояниях одной сцены (инвариант MODULE.md).
- Одинаковый вход даёт побайтно одинаковый SVG; в выводе нет `NaN`, `undefined`, `Infinity`.
- Неизвестные и отсутствующие значения дают нейтральный вид без ошибки.
- Отрисовка одной сцены занимает меньше 300 мс в Node.
- `cold`, `wet` и `exposed` не создают снег, дождь или воду.
- Unseen-equivalent: новый `env.*`-профиль, добавленный в allowlist без изменений генератора, рисуется общим видом местности без нового обработчика; новое значение погоды вне словаря даёт `clear`.

## Стенд
Не нужен: нейросеть, промпт и пакет рассказчика не участвуют; картинка — детерминированная функция от модели экрана (HOW_WE_WORK, раздел 11).

## Проверки
- `node --test apps/game-web/test/landscape-renderer.test.js apps/game-web/test/scene-canvas-hydration.test.js` и новый `apps/game-web/test/landscape-svg.test.js`. Он проверяет: детерминизм, неизменность геометрии во всех 36 состояниях (сравнение слоя земли и растений), отсутствие `NaN`, все значения словарей, unseen-equivalent и время отрисовки.
- `npm run test:apps` на ветке до merge, `npm run architecture:check`, `npm run check:syntax`.
- Контрольный лист: 36 состояний × сцены в PNG через `playwright-core`. Это визуальная проверка глазами для владельца, а не автотест.
- Проверка в игре: текущий веб-клиент `apps/game-web` на `game-server` (решение владельца 2026-10-27); в живой сборке CDDA — когда появится доставка экрана в браузер (P5, EXP-007).

## Contract Auditor
Да: меняются `apps/game-web/MODULE.md` (Canvas-процедурный пейзаж заменяется на SVG; порядок выбора пейзажа) и `apps/game-web/AUTHORED_LANDSCAPE_CONTRACT.md` (authored webp больше не выбираются); затронута область «Narration/UI» (AGENTS §25.1). Публичная схема, persistence и полномочия LLM не меняются.

## Техдолг
Затронутых LW нет: по `landscape|portrait|game-web` совпадений в `LEGACY_WARNINGS.md` нет. Добавляется LW из раздела «Уровень качества»: время года.
