# Runtime catalog interaction map

## Новая партия

```text
game-server composition
→ @rus/runtime-catalog.loadActivePin
→ compatible full-world pin check
→ exact historical import reconstruction
→ pure region/date projection
→ Stage 8 → 13 → 14 → 16
→ Stage 24 party + run pins
→ Stage 25 one party transaction
```

Active pointer после первого чтения не используется.

## Reload и turn

```text
party row
→ persisted party_catalog_pins
→ compatible full-world pin check
→ exact historical import reconstruction
→ reload | turn
→ first-entry materialization
→ materialization run + exact run pin in one party transaction
```

Active pointer и live authoring rows не читаются.

## Operator boundary

```text
operator backup
→ disposable restore
→ migration / baseline / compile / approval / import / activation CLI
→ append-only world_base audit
```

Production runtime не импортирует operator tooling; operator tooling не
подключается composition root игрового сервера.
