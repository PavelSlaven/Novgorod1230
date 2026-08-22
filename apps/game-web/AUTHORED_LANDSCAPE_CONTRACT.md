# Authored Landscape Contract

## Статус и владелец

Это контракт действующего production-renderer готовых растровых пейзажей в
`@rus/game-web`. Он описывает текущее поведение, а не будущую систему масок
или декоративных sprites.

Единственный владелец выбора сцены — `buildLandscapeRenderModel(screen)`.
Server передаёт только player-safe данные; browser не выводит сцену из prose,
названия локации или имени персонажа.

## Вход и выбор сцены

Приоритет выбора:

1. известный `screen.scene_asset_id` выбирает авторскую сцену Нижней Двины;
2. иначе exact `visible_context.environment.profile_id` выбирает generic-сцену;
3. неизвестное значение выбирает `open_meadow`.

Generic-профили:

| Environment profile | Scene folder |
| --- | --- |
| `env.local_variable` | `open_meadow` |
| `env.main_river_channel` | `main_river` |
| `env.side_channel` | `side_channel` |
| `env.land_path` | `field_road` |
| `env.forest_track` | `forest_road` |
| `env.wetland` | `wetland` |
| `env.offroad` | `offroad` |
| `env.shore_transition` | `shore_transition` |

Авторские сцены Нижней Двины:

| `scene_asset_id` | Folder | Режим |
| --- | --- | --- |
| `lower-dvina-old-drying-shed-interior` | `old-drying-shed-interior` | интерьер |
| `lower-dvina-old-drying-shed-exterior` | `old-drying-shed-exterior` | наружный |
| `lower-dvina-wreck-shore` | `wreck-shore` | наружный |
| `lower-dvina-zhdanko-storehouse-interior` | `zhdanko-storehouse-interior` | интерьер |
| `lower-dvina-fishing-camp-firepit` | `fishing-camp-firepit` | наружный |
| `lower-dvina-zhdanko-river-descent` | `zhdanko-river-descent` | наружный |
| `lower-dvina-fishing-camp` | `fishing-camp` | наружный |
| `lower-dvina-zhdanko-storehouse-exterior` | `zhdanko-storehouse-exterior` | наружный |

## Состояния наружной сцены

Время и погода — независимые закрытые оси:

- время: `dawn`, `morning`, `day`, `evening`, `dusk`, `night`;
- погода: `clear`, `cloudy`, `overcast`, `rain`, `snow`, `fog`.

Точный файл имеет имя `{time}-{weather}.webp`. Каждая наружная композиция
содержит 36 готовых авторских вариантов; renderer не синтезирует погоду или
рельеф процедурно.

Визуальные обязательства assets:

- `clear` допускает видимые солнце, луну и звёзды согласно времени суток;
- `overcast`, `rain` и `fog` скрывают светило;
- `rain` показывает мокрую землю и воду;
- `fog` послойно скрывает дальние планы;
- `snow` является зимней перерисовкой: снег закрывает землю и почти всю
  траву, вода замёрзла, состояние лодок соответствует утверждённой сцене.

## Интерьеры

Интерьер не имеет матрицы погоды:

- `dawn`, `morning`, `day`, `evening` выбирают `natural.webp`;
- `dusk`, `night` выбирают `dark.webp`.

`natural` содержит только естественный свет через существующие проёмы.
`dark` не добавляет искусственных источников, но сохраняет читаемость
конструкции. Foreground-погода внутри не рисуется.

## Assets, загрузка и композиция

- Generic-каталог: 8 сцен × 36 WebP.
- Нижняя Двина: 6 наружных сцен × 36 WebP и 2 интерьера × 2 WebP, всего 220.
- Каждый runtime-asset: RGB WebP, 2560×1440.
- Canvas отображает сцену в 1280×720.
- Изображения загружаются через native `Image.decode()` и общий cache.
- Generation token запрещает поздней загрузке рисовать в уже сменившийся
  экран.
- При неизвестной сцене или ошибке asset используется
  `/assets/landscape/open_meadow/day-clear.webp`.

Порядок общей сцены:

1. пейзаж;
2. авторский или процедурный портрет;
3. подпись собеседника;
4. foreground `rain`, `snow` или `fog` для наружной сцены.

`portraitLighting` вычисляется из тех же нормализованных времени и погоды;
для интерьеров используется соответствующий режим `natural` или `dark`.

## Границы текущей реализации

В production сейчас нет отдельного слоя следов, костров, домов, лодок или
прочих добавляемых объектов. Они являются частью готовой композиции. Сезон,
процедурный terrain, sprites и анализ текста для выбора сцены не используются.

## Точки аудита

- выбор и свет: `src/features/landscape/render-model.js`;
- загрузка bitmap: `src/features/landscape/canvas.js` и
  `src/shared/image-cache.js`;
- порядок Canvas-слоёв: `src/app/scene-canvas-hydration.js`;
- public allowlist: `src/shared/scene-affordances.js`;
- server projection Нижней Двины:
  `../game-server/src/infrastructure/postgres/lower-dvina-trace-screen-panels.js`;
- каталог и renderer: `test/landscape-renderer.test.js`.
