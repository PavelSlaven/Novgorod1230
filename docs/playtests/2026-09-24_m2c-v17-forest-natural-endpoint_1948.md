# M2c v17: первый осмотр лесной гряды — run 1948

## Результат

**FAIL.** Обычный game-web через Chrome и HTTP handler, изолированная PostgreSQL
`pr17_target_successor_test`, fixture approvals, release `spatial-v3-production-v17`,
сценарий `novgorod_pine_ridge_approach_v1`, party
`party:8673cc63acc51ed9e79a298a`. Провайдер — детерминированный тестовый;
этот прогон не подтверждает качество реальной модели. Production БД не использовалась.

Первый экран после открытия истории и ACK показал дословно:

```text
НА ПОДХОДЕ К ЛЕСНОЙ ГРЯДЕ

Микула — лесной промысловик.

Вы не ранены; сил достаточно для работы; сильного голода нет.

Различимы очертания деревьев.

низкая кожаная обувь; штаны; нижняя рубаха
```

В UI введено и отправлено ровно: `Осматриваюсь вокруг, оставаясь на месте.`
Сначала UI показал «Ход принят», затем «Сначала восстановим результат предыдущего
хода. Новый текст останется в поле.» и ошибку «Current natural perception facts
are unavailable.» Путь к generated G5 и исчерпание запаса в этом прогоне не
достигнуты.

## Фактический исход

`submitTurn` вернул `NATURAL_SCENE_PERCEPTION_DATA_GAP`, reason
`exact_committed_endpoint_binding_required`. До и после попытки party
`state_version=0`, clock `whole_minutes=261120`, player position
`baseline:g5_node_184561bdcc59d4c5aa61490a:position:arrival:0`, один
materialization run и один G5 site; новых gameplay writes нет. Root cause
проверяется у владельца `g4-natural-perception`. После исправления нужен новый
отдельный playtest, этот FAIL сохраняется.
