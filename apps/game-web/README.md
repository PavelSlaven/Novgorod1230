# @rus/game-web

Target package for browser client. During migration active UI remains in
`legacy/src/ui` and is served by `@rus/game-server`.

Authored visual selectors are optional player-safe presentation DTO fields:
[`AUTHORED_LANDSCAPE_CONTRACT.md`](AUTHORED_LANDSCAPE_CONTRACT.md) and
[`AUTHORED_PORTRAIT_CONTRACT.md`](AUTHORED_PORTRAIT_CONTRACT.md). They never
create, persist, reveal or infer world truth.
