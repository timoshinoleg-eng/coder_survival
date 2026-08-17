# SOL A3 — Manus art-direction и production review

**Дата:** 2026-08-17  
**Ветка:** `sol/content-a3`  
**Pull Request:** #18  
**Ревьюер:** Manus — art direction, verification и production governance  
**Итог:** `CHANGES_REQUESTED`; runtime integration запрещена до закрытия перечисленных gates.

## Executive decision

SOL A3 содержит полезный content backlog: 17 русских punchline-пар, восемь новых incident payloads с двумя choices, effects и outcomes, а также три key-art draft и reversible icon atlas. Юмор узнаваемый и подходит Coder Survival. Однако это **не готовый runtime batch**. В PR отсутствует adapter к текущему server-authoritative `RANDOM_EVENTS_CONFIG`, английский файл смешивает punchlines и incidents под неоднозначной верхнеуровневой schema, а визуальные файлы не соответствуют обязательным v2 dimensions и integration contract.

> **Решение:** copy можно принять как content backlog после нормализации contract; все art assets остаются `CHANGES_REQUESTED` или `CANDIDATE`. Ни один SOL Asset ID не получает `APPROVED_RUNTIME`.

## Что проверено

Проверены scope PR #18, восемь RU incident JSON, aggregate `punchlines/ru.json`, aggregate `punchlines/en.json`, `icons/atlas.json`, icon atlas 264×96 и три PNG key-art draft. Incident validator подтвердил для всех восьми RU payloads наличие `id`, `locale`, `archetype`, `rarity`, `title`, `body`, двух choices с `label`, `risk` и `effects`, а также outcome для каждого choice. Effects используют ожидаемые игровые ключи `commits`, `depression` и `coffeeCoins`.

| Материал | Решение | Причина |
|---|---|---|
| 17 RU punchline pairs | **Accepted as copy backlog** | Все 17 текущих event IDs имеют `success` и `failure`; шутки в стиле проекта, без pay-to-win или опасного контента. Перед runtime нужен locale/content adapter. |
| 8 RU incident JSON | **Changes requested** | Payloads содержательно полные, но не содержат runtime `type`, `weight`, `effect`, `uiText` и не подключены к server-authoritative event config. Нужен отдельный adapter/PR и балансный review. |
| EN punchline/incidents file | **Changes requested** | Две разные сущности смешаны в одном корневом объекте (`events` и `incidents`); требуется единая schema и parity-check с RU. |
| 264×96 icon atlas | **Changes requested; transport accepted** | Reversible 11×3 atlas с 24×32 tiles — удобен для handoff, но v2 требует exact 12 semantic IDs, atomized files, 96×96 masters и 48×48 runtime exports, displayed at 24/32px. |
| CI Pipeline Red / Merge Conflict / HTTP 500 Spike PNGs | **Changes requested** | Raw files are 440×780 indexed PNGs, not 1080×1920 masters plus ≤280KB WebP runtime exports. Visual review found insufficient contrast at 390px and weak incident signal. |
| Career scenes / share cards | **Not submitted** | No approval decision; they remain `CANDIDATE` in the registry. |

## Copy and balance observations

The RU copy is a net positive for the humor loop. Examples such as “Обе ветки считают, что победили” and “Нажали Re-run. Упал быстрее — pipeline ценит последовательность” are short, recognisable and self-deprecating. The new incidents also use modest effects and no direct tap multiplier, energy bypass or leaderboard manipulation. Nevertheless, effects must not be merged by content alone: each new incident needs an explicit `type`, weight and adapter mapping, followed by a simulation/regression check against the current 47/38/15 negative-neutral-positive target.

The balance review must also decide whether `coffeeCoins: -1` is an intentional cosmetic/economy sink and whether all effects are allowed by the existing event resolver. Copy approval therefore does not equal gameplay approval.

## Visual findings

The three key-art drafts have a coherent dark office and pixel treatment, but their 440×780 indexed exports are too dark and low-resolution for the v2 mobile acceptance gate. At 390px, the focal programmer, incident signal and next-action safe area compete with dark blue surfaces. The production key-art package must raise contrast without turning red into decoration, deliver the required 1080×1920 PNG masters and compressed WebP runtime files, and include a text-free composition. UI labels, timers and wordmarks remain DOM/Canvas overlays; they must not be baked into the illustration.

The icon atlas is a valid reversible transport format, but its 11 columns do not equal the v2 12-icon registry. It currently covers energy, stress, commits, Coffee Coin and several non-v2 labels such as shop, quests, pass, team, leaderboard and memes. It is missing the required `incident_alert`, `rollback`, `ci_pipeline`, `slack_storm`, `deploy`, `prod_500`, `check` and `timer` semantics. Luna must submit a canonical mapping and atomized PNGs before any status can be raised.

## Required changes before resubmission

Luna should split English copy into explicit `punchlines/en.json` and `incidents/en/*.json` or another documented schema with RU/EN parity. The incident handoff must include `type`, proposed weight, supported runtime effect keys, feature flag and a deterministic adapter plan; no effect may be merged without a simulation result. The atlas must be re-cut into exact v2 IDs and delivered as 96×96 masters plus 48×48 transparent runtime exports. Key art must be regenerated or upscaled from a clean source into 1080×1920 PNG masters and ≤280KB WebP runtime files, with a 390px overlay preview showing top/bottom safe zones. A complete manifest must include hashes, alpha status, dimensions, byte size, canonical filename and intended UI location.

## Registry decision

`APPROVED_ASSETS_REGISTER.md` is updated only for this review trace. The SOL visual groups remain forbidden for ZCode runtime integration. The 17 RU punchlines are accepted as copy backlog, not as visual runtime assets. The registry must not contain any new `APPROVED_RUNTIME` row from SOL A3.

## Handoff

ZCode may read the SOL content for planning and may open a separate integration PR only after the content adapter, balance evidence and asset-level approval exist. Until then, all SOL assets are non-runtime candidates. The next review should attach individual raw files, the normalized manifest and a mobile overlay proof; a contact sheet alone is insufficient.

## References

[1]: ../visual_assets/first_pack/VISUAL_SYSTEM_V2.md — binding Visual System v2 specification.  
[2]: ../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md — approval registry and status vocabulary.  
[3]: ../backend/src/config/events.js — current server-authoritative random event config.
