# art-pilot

Прототип генератора картинок в едином стиле. Владелец и границы — [MODULE.md](MODULE.md); перенос в игру — CR [#908](https://github.com/PavelSlaven/Novgorod1230/issues/908).

## Контрольные листы

Команды запускаются из корня репозитория. Результат — SVG и PNG в `tools/art-pilot/out/` (папка не коммитится).

```bash
export CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
```

```bash
node tools/art-pilot/render.mjs
```

Люди, лица и карточки вещей; листы `out/sheet-warriors.png` и `out/sheet-faces.png`.

```bash
node tools/art-pilot/render-land.mjs
```

Пейзаж: 6 частей суток × 6 погод; лист `out/land/sheet-land.png`. Отдельные состояния — аргументами: `node tools/art-pilot/render-land.mjs dawn-fog night-snow`.

```bash
node tools/art-pilot/render-map.mjs
```

Карта: лето, лето с туманом войны, зима, другая местность; файлы в `out/map/`.

## Тест

```bash
node --test tools/art-pilot/test/art-pilot.test.js
```
