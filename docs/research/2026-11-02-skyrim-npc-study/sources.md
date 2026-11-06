# Источники исследования модов Skyrim с LLM-NPC

Снимок 02.11.2026. `T` = `C:\Users\Slaven\Documents\Novgorod-tasks\skyrim-llm`. Лицензии — по файлу `LICENSE` в клоне (для клонированных) и по полю `license` из `gh api repos/<owner>/<repo>` (для остальных). Метаданные неклонированных проектов — из разведки `T\tmp\d-github\out.md`.

## Исходные источники задания

| Источник | Как прочитан | Итог |
|---|---|---|
| Пост Reddit r/LocalLLaMA 1fo5bt3, u/TheSilverSmith47 | Сайт закрыт для чтения инструментами (WebFetch и встроенный браузер). Текст страницы вставлен владельцем 02.11.2026 в `T\tmp\d-reddit\Текстовый документ.txt` (машинный перевод браузера); выписка — `T\tmp\d-reddit\out.md`. Вторая страница комментариев в тексте отсутствует | Автор пробует Mantella и AI Follower Framework (AIFF, ныне CHIM) на Qwen 2.5 7B GGUF; своего проекта и кода не публикует |
| Мод Nexus Skyrim SE 194492 «Skyrim local LLM NPC» (devpirate01) | Встроенный браузер: Description, Files (только список), Posts (12), Bugs (0); ничего не скачано. Выписка — `T\tmp\d-nexus\out.md` | Исходники — `devPirate01/SkyrimLLMBridge` (ниже) |
| Файлы мода 194492 в `T\src-194492` | Свой скрипт строк `T\tmp\src-strings\strings.py` (`python -I`), вывод `strings.txt`, выводы `notes.md` | Мост с моделью — файлы `request.json`/`response.json`; улика квеста засчитывается скриптом |

## Проекты в глубоком чтении (7)

| Проект | URL | Клон | sha | Последний коммит | Лицензия | Заметки чтения |
|---|---|---|---|---|---|---|
| SkyrimLLMBridge (мод 194492) | https://github.com/devPirate01/SkyrimLLMBridge | `T\repos\SkyrimLLMBridge` | `0b789da474856a0d3bf7c5809028b0178d784522` | 2026-10-08 | MIT | `T\tmp\r-bridge\notes.md` |
| Mantella (Python-сервер) | https://github.com/art-from-the-machine/Mantella | `T\repos\Mantella` | `c0c1ae6db01f3c2a14dbab8ec5c3e6419e4f6bac` | 2026-07-16 | AGPL-3.0 | `T\tmp\r-mantella\notes.md` |
| Mantella-Spell (игровая часть Mantella, Papyrus) | https://github.com/art-from-the-machine/Mantella-Spell | `T\repos\Mantella-Spell` | `0c5f8513aff61cda1f32c81a962eee36ba74fdb7` | 2026-07-11 | MIT | `T\tmp\r-mantella-spell\notes.md` |
| CHIM, сервер (бывш. Herika / AI Follower Framework) | https://github.com/Dwemer-Dynamics/HerikaServer | `T\repos\CHIM-HerikaServer` | `6b45d9fa2650c2d806136e4cf6cac583b5f6337f` | 2026-10-30 | GPL-3.0 | `T\tmp\r-chim\notes.md` |
| SkyrimNet (открытая часть: промпты, Papyrus, документация; DLL закрыта) | https://github.com/MinLL/SkyrimNet-GamePlugin | `T\repos\SkyrimNet-GamePlugin` | `0194eeb1c09bab423601c2fb7a8abf1df59fd15b` | 2026-11-01 | собственная «SkyrimNet Game Plugin License», все права у Fateless.Ai (GitHub: NOASSERTION) | `T\tmp\r-skyrimnet\notes.md` |
| NarrativeEngine (плагин-режиссёр к SkyrimNet) | https://github.com/pdusen/skyrimnet-plugin-narrative-engine | `T\repos\NarrativeEngine` | `ac8de94964f0341c11c3aab581bb449c8cdad9ed` | 2026-10-31 | Apache-2.0 по файлу `LICENSE` (GitHub: NOASSERTION) | `T\tmp\r-narrative\notes.md` |
| SillyTavern (веб-интерфейс ролевой переписки с персонажами; не Skyrim — добавлен поручением владельца 02.11 через распорядителя) | https://github.com/SillyTavern/SillyTavern | `T\repos\SillyTavern` (ветка по умолчанию `release`) | `06bde939fb1e9c4c8d8641d810f0a916b5bce127` | 2026-09-14 (ветка разработки `staging` — 2026-10-02, `ad29cbda62e92f145e44d7a10398a38af22ca986`, не читалась) | AGPL-3.0 | `T\tmp\r-sillytavern\notes.md` |

## Склонированы, но не в глубоком чтении

| Проект | URL | Клон | sha | Лицензия | Почему не взят |
|---|---|---|---|---|---|
| abeiro/HerikaServer | https://github.com/abeiro/HerikaServer | `T\repos\HerikaServer` | `b50376c6f5c460ce673c70b7b29171fbd1e2cd8e` | MIT (`MIT-LICENSE`) | Прежняя копия сервера CHIM; README отсылает к `Dwemer-Dynamics/HerikaServer`, который и прочитан |

## Найдены, не клонированы

| Проект | URL | Лицензия | Почему не взят |
|---|---|---|---|
| Mantella-SKSE-Launcher | https://github.com/art-from-the-machine/Mantella-SKSE-Launcher | NOASSERTION | Только запускает `Mantella.exe` при старте игры; к Н1–Н8 не относится |
| Pantella | https://github.com/Pathos14489/Pantella | GPL-3.0 | Форк Mantella; устройство разговора то же, Mantella прочитана в оригинале |
| mantella-linux | https://github.com/i-machine-things/mantella-linux | AGPL-3.0 | Форк Mantella под Linux (Proton); к Н1–Н8 не относится |
| Mantella-Anthropic-API | https://github.com/Abhisek571/Mantella-Anthropic-API | AGPL-3.0 | Добавляет провайдера облачной модели; нам облако в игре не нужно |
| Mantella-Horde-Followers | https://github.com/Abhisek571/Mantella-Horde-Followers | MIT | Папирус-дополнение спутников; 1 звезда, малый объём |
| mantella-ru-piper | https://github.com/ronanime-arch/mantella-ru-piper | не указана | Русская озвучка Piper; у нас текстовая игра |
| Dwemer-Dynamics/CHIM | https://github.com/Dwemer-Dynamics/CHIM | GPL-3.0 | Игровой SKSE-плагин CHIM (C++); логика промпта, памяти и действий — в прочитанном сервере |
| CHIM-Installer | https://github.com/Dwemer-Dynamics/CHIM-Installer | MIT, архив | Установщик |
| CHIM-Custom | https://github.com/Dwemer-Dynamics/CHIM-Custom | GPL-3.0 | Пользовательские дополнения к серверу CHIM |
| SkyrimNet-Plugins | https://github.com/MinLL/SkyrimNet-Plugins | NOASSERTION | Набор сторонних плагинов SkyrimNet; ядро прочитано в SkyrimNet-GamePlugin |
| SkyrimVR-Local-LLM | https://github.com/zerotrust-dev/SkyrimVR-Local-LLM | MIT | Ранняя стадия: проба задержки потоковой выдачи и пресет малой модели для SkyrimNet, замеров нет; цель README — первое содержательное слово за ≤ 1,5 с (со слов README) |
| skyrimnet-multiproxy | https://github.com/awesmdiver/skyrimnet-multiproxy | MIT | Прокси провайдеров для SkyrimNet |
| Claude-SkyrimNet-Proxy | https://github.com/galanx/Claude-SkyrimNet-Proxy | не указана | Прокси облачной модели |
| skyrim-npc-rag | https://github.com/Alexs2256/skyrim-npc-rag | не указана | Чат-бот «Лидия» в Streamlit вне игры; идея судьи верности ответа (LLM-as-judge) у нас уже есть — аудитор опоры |
| SkyrimNet_Bench | https://github.com/langfod/SkyrimNet_Bench | не указана | Заготовка стенда SkyrimNet, не обновлялась с 2025-09 |
| Mod-Skyrim-LLM-local | https://github.com/FrUsTaY/Mod-Skyrim-LLM-local | не указана | 0 звёзд, малый объём, без документации устройства |
| skyrim-llm-runtime | https://github.com/creatidy/skyrim-llm-runtime | не указана | Rust, 1 звезда, ранняя стадия |
| skyrim-follower-framework | https://github.com/Joao-Serrao/skyrim-follower-framework | NOASSERTION | Papyrus-фреймворк спутников без LLM-логики промпта |
| skyrim-llm | https://github.com/cameron-ellis/skyrim-llm | не указана | Не обновлялся с 2024-12 |

Проекты других игр в чтение не брались: ни один прочитанный проект Skyrim не называет проект другой игры источником своей идеи (NarrativeEngine называет предшественником «IntelEngine» — по README это несопровождаемое дополнение того же рода для Skyrim, события которого идут по таймеру, `REPOS\NarrativeEngine\README.md:139-144`; не клонирован). Исключение — SillyTavern: не игра и не Skyrim, взят в чтение седьмым по прямому поручению владельца 02.11 (передано распорядителем).
