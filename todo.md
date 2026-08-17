# Visual System v2 — Team Operating Checklist

- [x] Зафиксировать роли Manus (арт-дирекшн/verification), Luna (assets/copy) и ZCode (code/integration).
- [x] Оформить dated спецификацию Visual System v2 с полным asset registry, размерами, состояниями, палитрой и naming rules.
- [x] Создать initial approval register и Luna acceptance rubric по style master.
- [x] Документировать branch/PR rule: только `manus/*` branches, PR review и CI; прямой publisher-to-main flow запрещён.
- [x] Добавить Drive-sync exclusions для IP-адресов, SSH-материалов и cloud/provider IDs.
- [x] Синхронизировать в Google Drive dated Reports, asset registry, workflow docs и безопасные source snapshots.
- [ ] Создать и провести review Pull Request для governance-изменений в `main`.
- [ ] Использовать существующий GitHub credential для публикации только ветки `manus/visual-system-v2-governance`.
- [ ] Создать Pull Request и проверить CI/review status без прямой записи в `main`.
- [x] Провести clean local rehearsal полного migration set и idempotency replay tail `059`–`061` на disposable PostgreSQL DB.
- [x] Добавить fail-closed rehearsal harness и operator runbook для migration tail `059`–`061` без production deploy.
- [x] Добавить signed rewarded-ads smoke harness: local HMAC/security/replay/cooldown/daily-cap checks и owner-gated staging read-only mode.
- [x] Добавить production config preflight без вывода values и soft-launch observability thresholds для 24h/72h review.
- [x] Синхронизировать GitHub approval register с Luna P1 v01 approvals для 3 hero states и 12 atomized UI runtime icons.
- [x] Подготовить dated P0 GO/NO-GO decision record с evidence, owner gates и явным запретом автономного production deploy.
- [ ] Повторно проверить P0 review branch, опубликовать `manus/p0-release-engineering` и открыть/проверить GitHub PR в `main` без прямой записи в `main`.
