# M3 preserved campaign — m3-0d39712c-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `0d39712ca87dad01748bd4a6bdfd9a5f5e94da56`
- Campaign: `m3-0d39712c-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: РЫБАЦКИЙ СТАН У ВИХТУЯ  Утро застало тебя в рыбацком стане у Вихтуя: у настила лежат сети, а до вечернего лова нужно проверить снасти.  Сначала восстановим результат предыдущего хода. Новый текст останется в поле.
   Domain/commit: typed failure FACTUAL_TURN_DELIVERY_PAYLOAD_INVALID; commit status `committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 1 turn record(s) and 1 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `0d39712ca87dad01748bd4a6bdfd9a5f5e94da56`.
