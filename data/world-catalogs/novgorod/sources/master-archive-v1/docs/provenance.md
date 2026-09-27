# Provenance

У каждой канонической сущности есть `source_dataset`, `legacy_references`, `source_record`, confidence и evidence class. У связей сохранены dataset, legacy relation ID, source IDs и дополнительные атрибуты. У дедуплицированных источников и assets сохранён полный перечень исходных вариантов/путей.

Generated records помечены `generated_by_master_merge = true`. Это позволяет отличать исходные сведения от восстановленных cross-links, concept nodes и gameplay normalization.
