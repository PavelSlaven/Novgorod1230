# Manual delete checklist

Статус: **не подтверждён для удаления**.

Автоматическая финализация проверяет evidence, но не подтверждает ручные действия. Автоматическое удаление legacy запрещено.

- [x] Канонические документы перенесены.
- [x] Contracts имеют новые canonical paths.
- [x] Approved seeds и import history зафиксированы.
- [x] Исторические audit/migration reports сохранены.
- [x] Modular runtime import graph не ведёт в `legacy/`.
- [x] CI/release commands работают из `Rus_modules`.
- [x] Staging/release configuration выбирает modular route по умолчанию.
- [x] Создан rollback archive предыдущего релиза.
- [x] Существуют baseline и migration manifests.
- [x] Release archive restore test выполнен.
- [x] Party runtime restore test выполнен.
- [x] First screen и полный turn прошли Chromium E2E.
- [x] Автоматическая finalization evidence-проверка добавлена и fail-closed.
- [ ] Live production deployment configuration проверена оператором.
- [ ] Финальный read-only архив внешней старой папки создан оператором.
- [ ] Подтверждено, что старая папка не содержит единственного экземпляра нужного файла.
- [ ] Ручное удаление одобрено владельцем проекта.
