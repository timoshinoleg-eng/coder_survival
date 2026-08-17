# Luna P1 v01 — Sanitized Raw-File Review and Immutable Runtime Identity

**Дата ревью:** 2026-08-17.
**Статус:** `APPROVED_RUNTIME` только для описанных ниже 15 runtime exports.
**Назначение:** этот документ сохраняет проверяемую review-цепочку в репозитории. Он не публикует raw archive, доступы к хранилищам, токены, URL приватных папок или бинарные файлы.

> **Решение.** Для любого будущего integration PR допустимы только exports, чьи `assetId`, путь, byte length, dimensions, mode и SHA-256 совпадают с versioned immutable manifest. Несовпадение хотя бы одного поля означает `CHANGES_REQUESTED`, а не «почти тот же» runtime asset.

## Reviewed batch

| Категория | Количество | Contract | Статус |
|---|---:|---|---|
| Hero runtime exports | 3 | `128×128`, `RGBA`, SHA-256 и bytes в manifest | `APPROVED_RUNTIME` |
| Atomized UI icons | 12 | `48×48`, `RGBA`, SHA-256 и bytes в manifest | `APPROVED_RUNTIME` |
| Исходный inventory | 38 файлов | raw-inventory сопоставлен с извлечёнными SHA-256 и byte sizes при review | Evidence preserved as manifest metadata |

Идентичность и критерий проверки находятся в [`LUNA_P1_V01_RUNTIME_IDENTITY.json`](../visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json). Реестр решений и допустимые роли интеграции находятся в [`APPROVED_ASSETS_REGISTER.md`](../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md). Эти два versioned source файла являются достаточной durable reference для reviewer: им не требуется полагаться на чат, Drive-ссылку или состояние локального диска. [1] [2]

## Review findings

| Проверка | Результат | Ограничение |
|---|---|---|
| Runtime identity | PASS | Интегратор обязан сверять все immutable поля из manifest перед копированием asset. |
| Alpha/chroma и target overlay suitability | PASS для утверждённых exports | Не распространяется на неописанные raw candidates. |
| Governance mapping | PASS | Интеграция требует отдельный PR и reference на `APPROVED_RUNTIME` asset ID. |
| Raw binary distribution | Excluded intentionally | Бинарные файлы не являются source of truth в этом release PR. |
| Provider marks / baked UI text | Not approved for runtime | Incident imagery остаётся context-only согласно register. |

## Integration protocol

Перед внесением runtime asset ZCode или другой интегратор создаёт отдельный PR. В его описании указываются `assetId`, repository manifest path, expected SHA-256, expected bytes и intended usage. Проверка в CI или code review обязана остановить интеграцию при несовпадении identity; новый экспорт получает новый versioned manifest entry и новое review, а не подменяет v01.

## Explicit non-actions

Этот документ не меняет runtime code, не добавляет binaries, не изменяет asset approval scope и не инициирует deployment. Он только переводит raw-review outcome и immutable identity в versioned, sanitized и reviewable repository evidence.

## References

[1]: ../visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json "Luna P1 v01 immutable runtime identity manifest"
[2]: ../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md "Approved assets register"
