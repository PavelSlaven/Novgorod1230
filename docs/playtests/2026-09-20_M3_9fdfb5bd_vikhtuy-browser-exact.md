# M3 preserved campaign — m3-9fdfb5bd-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `9fdfb5bd0d9254dd843fb9e42ded8237f9918166`
- Campaign: `m3-9fdfb5bd-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: РЫБАЦКИЙ СТАН У ВИХТУЯ  Утро застало тебя в рыбацком стане у Вихтуя: у настила лежат сети, а до вечернего лова нужно проверить снасти.  Сначала восстановим результат предыдущего хода. Новый текст останется в поле.
   Domain/commit: turn.completed; error ``; commit `committed`; presentation `completed`.

## Persistence/readback

One exact turn record was retained. No additional persistence claim is inferred.

## Findings

- Campaign narration quality failed and the failed result is retained unchanged.

## Result

`FAIL` — source status `failed`; exact only for `9fdfb5bd0d9254dd843fb9e42ded8237f9918166`.