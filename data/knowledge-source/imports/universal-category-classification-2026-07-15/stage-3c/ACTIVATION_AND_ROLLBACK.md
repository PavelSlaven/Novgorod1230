# Stage 3C — activation и rollback

Activation не выполнена и требует отдельного прямого указания.

Перед activation необходимо подтвердить successful transactional promotion, readback count/digest audit, approved dependency closure, approved-only loader snapshot и region/period applicability. Переключение loader выполняется атомарно на exact revision ID и catalog digest. Draft/deprecated records не допускаются. Existing parties сохраняют прежние revision pins.

Текущий запуск не начинал транзакцию и не создавал revision, поэтому фактический rollback не требуется.

Для будущего ready subset rollback допустим только до activation и при отсутствии партий, pinned к target revision. Удаляются только строки manifest в обратном dependency order. Запрещено изменять parent revision, удалять записи вне manifest, переключать loader или рематериализовывать существующие партии.
