# M2c regression check — v16 Chromium run 17252

## Result and scope

**PASS** for the existing Lower Dvina production-v16 browser journey on the M2c working tree. This is a regression check, not acceptance of generated Novgorod G5 gameplay. The test used real Chromium and isolated PostgreSQL with a deterministic HTTP provider. It did not import into live production or modify a live party.

Command: `node --test test/e2e/lower-dvina-trace-browser-acceptance.test.js`. Result: 1/1 passed, 219,943 ms total; browser journey 218,535 ms.

## Public gameplay

The browser selected `lower_dvina_trace_v1`. The first screen returned `ready`, place `берег крушения`, character Микула, with a description of the wrecked river bank, wet clothing and cold. After opening ACK, the free-text turn form appeared. The following inputs were submitted in order (the first `Осмотреться` starts the journey; the repeated final decision checks replay):

1. `Осмотреться`
2. `Осмотреть место крушения подробно.`
3. `Дойти до рыбацкого стана.`
4. `Показать Еремею синюю шерсть.`
5. `Пройти известной тропой к старой сушильне.`
6. `Предложить Ратше условную защиту и потребовать сдачи.`
7. `Оказать Онисиму первую помощь.`
8. `Сделать носилки и отнести Онисима в стан.`
9. `Отдохнуть у огня полчаса и подсушить одежду. Попросить Еремея и рыбака пойти со мной к Жданко.`
10. `Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.`
11. `Обвинить Жданко и потребовать вернуть дорожную сумку.`
12. `Помочь Еремею обезоружить Жданко, не убивая его.`
13. `Забрать дорожную сумку у Жданко.`
14. `Открыть возвращённую дорожную сумку.`
15. `Извлечь свёрток и осмотреть печать, не вскрывая документ.`
16. `Вернуться всей группой к Онисиму.`
17. `Попросить Онисима рассказать, что он знает о Жданко и свёртке.`
18. `Сопоставить все подтверждённые доказательства.`
19. `Зафиксировать временное решение по людям, имуществу и обещанию.`
20. The same final decision text for replay.

The public responses returned 18 committed turn screens, each `ready`. Selected exact first lines: turn 1 `Вы подробно осмотрели место крушения.`; turn 2 `Вы дошли до рыбацкого стана.`; turn 6 `Перевязка завершена; Онисим остаётся ранен, но его состояние устойчивее.`; turn 11 `Вы ранены: средняя рана.`; turn 14 `Вы извлекли свёрток и увидели состояние печати.`; turn 18 `судьба Онисима: Онисим найден живым.` The browser restored the saved party; final visible place was `рыбацкий стан`, local time `20.8.1230 09:59`. Final screen kept the cause of the wreck and the roles of Ратша and Жданко unresolved.

## Limits

The test proves the preexisting v16 journey remains browser-playable after the canonical reader change. It does not exercise target G4-to-generated-G5 entry, generated scene movement, resource gathering or NPC appearance. The run used a test provider; no timing breakdown by generation, validation, projection, narration or semantic remainder was exposed.
