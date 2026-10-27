# art-pilot

## Назначение

Прототип генератора картинок игры в едином стиле: плоский цвет, жёсткая граница тени, тёмная обводка. Детерминированный код получает параметры и возвращает SVG: человек и лицо, броня и оружие, карточка вещи, пейзаж лесной дороги, карта местности. В игру не подключён; перенос в игру идёт частями по CR [#908](https://github.com/PavelSlaven/Novgorod1230/issues/908).

## Владеет

- `renderWarrior(params)` в `warrior.mjs` — человек в одежде и броне, со щитом и оружием; при `view` крупного плана — лицо;
- `renderItemCard(params)` в `warrior.mjs` — карточка вещи;
- `renderLandscape({ terrain, time, weather, seed })` в `landscape.mjs` — лесная дорога в 6 частях суток и 6 погодах; геометрия зависит только от `seed`;
- `renderMap({ map, season, visibility, hero, npcs, seed })` в `map.mjs` — карта местности по клеткам, лето и зима, туман войны;
- `sampleOvermap(seed)` и `sampleVisibility(map, hero)` в `map-sample.mjs` — пробная карта для прототипа;
- скриптами контрольных листов `render.mjs`, `render-land.mjs`, `render-map.mjs`: SVG и PNG в `out/`.

## Не делает

- не читает данные игры, БД, CDDA и World Knowledge: параметры заданы в скриптах листов;
- не импортируется приложениями и пакетами и не входит в production-путь картинок;
- не меняет authored-картинки в `apps/game-web/public/assets/`.

## Зависимости и ограничения

Генераторы используют только JavaScript без зависимостей. Скрипты листов растеризуют SVG через `playwright-core` из корневых `node_modules`; путь к Chromium — переменная `CHROME_PATH`.

## Тесты

`test/art-pilot.test.js` проверяет, что все виды картинок дают одинаковый SVG на одинаковом входе и что в SVG нет `NaN`, `undefined` и `Infinity`.
