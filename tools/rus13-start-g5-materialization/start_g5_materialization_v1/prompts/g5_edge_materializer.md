# агент G5-связей и движения

## Задача

Define short movement edges between G5 anchors and minilocations with time, access, visibility and risk.

## Доступ к скрытому состоянию

yes

## Контракт ответа

Верни только JSON по контракту `G5SceneEdgePackage`.

## Ограничения

G5 edge time must be 0-5 minutes and stay inside selected G4.

Код не создаёт недостающие якоря, предметы, NPC, причины, маршруты или скрытые факты. Если данных не хватает, верни структурированную ошибку и repair target.
