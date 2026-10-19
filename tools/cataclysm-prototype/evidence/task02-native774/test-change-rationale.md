# Обоснование test-only исправления #774

Источник задачи: [Task02, issue #774](https://github.com/PavelSlaven/Novgorod1230/issues/774), решение исполнителя Codex от 2026-10-19 в рамках явного поручения исправить веточный failure: сохранить существующий UID guard, согласовать контроль с authoritative native item identity; runtime serializer не менять.

Native [`item_uid`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/item_uid.h#L14) — владелец identity экземпляра. [MODULE](../../MODULE.md) требует сохранения прежних UID при native deserialization, обычное копирование создаёт новые identity. [План среза](../../../../docs/plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) задаёт native ownership; это test-only поддержка уже внесённого веткой требования, не новая persistence semantics.

Upstream `identical items are collapsed` считает предметы идентичными только по `same_for_rle`; различные UID этому признаку не мешают. Ветка уже запрещает сжатие разных UID. Поэтому прежние assertions о количестве записей и подстроке `10` проверяют отменённое предположение о сериализации, а не сохранность экземпляров.

Заменяем их более строгим roundtrip: пустые `test_rag`, `same_for_rle == true`, каждый UID отличен, после deserialize совпадают число экземпляров и UID каждого. Существующие проверки различных items и malformed JSON остаются. Отдельная секция проверяет чтение legacy RLE без сохранённых UID. Semantic regression использует пустые stackable items вместо backpack с содержимым, который вообще не попадал в RLE. Test-only overlay применяется после semantic patch; README фиксирует воспроизводимый порядок и проверку предусловия.

Pre-fix raw FAIL сохранён. Изменение тестов и это обоснование исполнитель включает в описание PR до сдачи по WR §24.2. Runtime patches, contracts, active bindings и P3 code не меняются.
