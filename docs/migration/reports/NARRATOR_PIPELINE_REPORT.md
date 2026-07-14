# Narrator pipeline report

## Проверенная последовательность

```text
approved visible_context_package
→ Stage 22 exact input and precheck
→ narrator prose writer
→ Stage 22 output validation
→ Stage 23 exact input and precheck
→ semantic narrator audit
→ optional audit format repair
→ router on failed audit
→ Stage 23 result and handoff
→ narrator_prose_audit_approval
```

## Инварианты

- Stage 22 получает только approved visible context, а не hidden state.
- Stage 22 не создаёт ссылки, отсутствующие в visible-context reference index.
- Stage 23 сравнивает prose только с exact visible-context package.
- Semantic auditor не выбирает repair route; route принадлежит отдельному router port.
- Format repair не имеет права менять существующую семантику.
- Failed audit запрещает player output.
- Successful audit связывает prose и visible context canonical digests.

## Результат

- интеграционная цепочка Stage 22 → Stage 23 → approval проходит;
- declarative definitions обеих стадий выполняются;
- legacy pipeline импортируется с modular facades;
- production LLM calls не выполнялись в этой фазе.
