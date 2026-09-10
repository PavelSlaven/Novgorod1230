# @rus/narration

## Назначение

Единый безопасный workflow генерации и ограниченного ремонта прозы для первого экрана и обычного хода.

## Владеет

- versioned `narration_request`, `narration_output` и `narration_flow_result`;
- проверкой visible-only входа;
- writer → deterministic structural validation → at most one format repair → semantic audit;
- один synthetic whole-prose segment и не более одной цельной semantic rewrite;
- full final semantic audit после semantic repair;
- историей генераций и ремонтов.

## Продуктовые принципы прозы

Художественный narrator пишет связную, конкретную и сдержанную литературную русскую прозу через доступное персонажу восприятие. Он использует только confirmed и player-safe факты, не выдумывает причинность, ощущения или скрытое знание. Текст не превращается в state-report, канцелярит, энциклопедическую справку, псевдоархаику или театральную воду. Важные изменения должны быть понятны игроку и естественно вплетены в сцену.

Все различные существенные результаты действия обязательны по смыслу;
вспомогательные сведения о сцене выбираются по уместности. Совпадающие по смыслу
результат и неопределённость достаточно выразить один раз. Неопределённость
сообщает, чего персонаж пока не знает, а переданное player-safe продолжение — чего он ещё не сделал.
Это не отчёт о том, что «устанавливают доказательства». Вопрос сам не доказывает
попытку; отдельно подтверждённое действие позволяет описать эту попытку.

Аудитор сначала оценивает цельность всей прозы, затем проверяет фактические
утверждения отдельных фрагментов. Перечень строк исходной проекции остаётся
`technical_presentation`, даже если соединён запятыми или точками с запятой.
Одна цельная semantic rewrite может содержать естественные абзацы; это не
ограничение текста одним абзацем. Структурные тесты протокола не заменяют
семантическую и литературную проверку результатов реальной модели.

Контекст должен сохранять доступную герою предысторию, память и текущее
состояние тела. Ориентация в сцене использует только переданные видимые пути,
препятствия, ближние и дальние ориентиры, погоду, свет и слышимую деятельность
с направлением, когда они известны. Не требуется перечислять все чувства на
каждом ходу. Narrator не восполняет потерянные upstream сведения выдумкой;
их материализация, актуальность и безопасная проекция принадлежат своим
владельцам. Отсутствие таких сведений во входе не доказывает отсутствие в мире.

## Не делает

- не читает hidden state, БД или глобальный runtime context;
- не выбирает LLM provider и не импортирует provider SDK;
- не создаёт факты мира кодом;
- не определяет последствия хода;
- не строит UI и не пишет party state.

## Публичный API

- `runNarrationFlow(request, ports, options)`;
- validators для request/output/audit/result;
- `createNarrationService(ports, defaults)` для workflow composition root;
- константы схем и repair routes.

## Порты

`writer.generate`, `formatRepairer.repair`, `auditor.audit`, `semanticRepairer.repair`.

## Инварианты

- writer и format repair получают confirmed outcome в исходном request; auditor и semantic repair получают его отдельным evidence-полем `confirmed_outcome`; auditor отдельно получает optional player-safe `action_intent_context` только как non-evidence для обнаружения intent-to-success;
- semantic failure не превращается в deterministic prose fallback;
- format repair и semantic repair независимы: каждый максимум один раз;
- malformed audit/repair, не единственная replacement цельного synthetic segment и final audit failure блокируют flow;
- semantic repair заменяет весь текст целиком; code-owned reassembly не смешивает старую и новую прозу;
- normal gameplay вызывает один LLM auditor, без router/senior cascade;
- approved result содержит ровно один утверждённый output;
- upstream repair не вызывает persistence.
