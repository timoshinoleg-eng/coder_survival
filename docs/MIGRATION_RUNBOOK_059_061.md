# Migration Runbook: 059–061

**Статус:** подготовлено для soft-launch release engineering; production migration в рамках этой задачи не выполнялась. Документ дополняет [INFRA.md](./INFRA.md) и относится только к migration tail `059_seed_missing_event_definitions.sql`, `060_starter_pack_once.sql` и `061_leagues.sql`.

> **Граница ответственности.** Этот runbook не является разрешением на production deploy. Выполнение на production требует назначенного владельца релиза, проверенного backup/restore и отдельного решения о моменте запуска.

## Что меняют миграции

| Migration | Изменение | Проверяемый инвариант |
|---|---|---|
| `059_seed_missing_event_definitions.sql` | Upsert девяти server-authoritative event definitions для ссылочной целостности случайных событий. | Ровно девять указанных slug существуют и соответствуют текущей server config. |
| `060_starter_pack_once.sql` | Добавляет частичный unique index для одного активного/завершённого starter pack на пользователя. | Существует `uq_purchases_starter_pack_once` как partial index. |
| `061_leagues.sql` | Создаёт таблицу `league_placements` и два lookup index. | Таблица и оба index существуют. |

Все три SQL-файла используют идемпотентные конструкции. Это **не отменяет** необходимость одного migration runner и резервной копии: SQL DDL/DML не образует автоматический rollback production release.

## Pre-flight

Перед началом назначенный operator обязан выполнить следующие шаги. Значения секретов не выводятся и не передаются в логи/отчёты.

| Проверка | Действие | Успешный результат |
|---|---|---|
| Release revision | Проверить, что image/revision включает именно утверждённые SQL `059`–`061`. | SHA release-кандидата записан в release ticket. |
| Резервная копия | Выполнить штатный backup managed PostgreSQL и подтвердить, что restore procedure известна оператору. | Временная метка и идентификатор backup сохранены в защищённом release ticket, не в Git/Drive. |
| Connection | Проверить, что `.env`/secret store содержит рабочий `DATABASE_URL` или полный набор `DB_*`, SSL-настройки соответствуют target DB. | `npm run migrate` может аутентифицироваться; сами значения не печатаются. |
| Миграционный singleton | Остановить второй CI/deploy job и исключить параллельный запуск `npm run migrate`. | Запущен ровно один runner. |
| Runtime singleton | Подтвердить один долгоживущий backend instance: cron остаётся process-local до выделения scheduler. | Нет второй backend replica и конкурирующего cron. |
| Монетизация | Проверить, что `PAYMENTS_ENABLED` остаётся `false`. | Card/Stars payments не включены; данный tail их не включает. |

Для репетиции до релиза используйте **только disposable local DB**, в имени которой присутствует `rehearsal`:

```bash
cd <repository-root>/backend
npm ci

cd ..
MIGRATION_REHEARSAL_DATABASE_URL='postgresql://<local-test-user>:<local-password>@localhost:5432/coder_survival_migration_rehearsal' \
  node scripts/rehearse_migrations_059_061.mjs
```

Harness удаляет и пересоздаёт schema `public`, применяет **весь** repository migration set штатным runner, повторяет runner, затем повторно выполняет tail `059`–`061` в отдельных транзакциях. Он намеренно отказывается работать с non-local URL или database name без `rehearsal`.

## Последовательное применение

Миграции применяются до запуска новой версии backend. Выберите **один** из существующих deployment mechanisms, не запускайте команды параллельно.

```bash
# Пример для уже собранного immutable backend image.
# .env остаётся вне Git; не печатайте его содержимое.
docker run --rm --env-file .env coder-survival-backend:<release-sha> npm run migrate

# Только после exit code 0 запускайте/перезапускайте один backend instance.
docker compose -f ../docker-compose.backend.yml up -d backend
curl -f https://<backend-domain>/health
```

Штатный runner упорядочивает миграции по имени, выполняет каждый файл в транзакции и записывает имя успешно применённого файла в `schema_migrations`. При повторном запуске уже записанные файлы должны быть пропущены. Если runner завершается с ошибкой, не запускайте его повторно «на удачу»: зафиксируйте имя файла и ошибку, удержите runtime в безопасном состоянии и перейдите к rollback boundary ниже.

## Post-check SQL

Запускайте запросы подключением с read-only допустимыми правами после `npm run migrate`. Ожидаемые значения приведены для утверждённого release tail.

```sql
-- 059: девять events должны быть доступны для FK user_active_events.
SELECT count(*) AS seeded_events
FROM event_definitions
WHERE slug IN (
  'green_build', 'slack_huddle', 'scope_creep', 'slack_thread_storm',
  'merge_conflict', 'canary_rollback', 'production_500_spike',
  'ci_pipeline_red', 'friday_release_outage'
);
-- expected: 9

-- 060: именно один partial unique index.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'uq_purchases_starter_pack_once';
-- expected: one row; index definition has a WHERE predicate for starter_pack and pending/completed.

-- 061: таблица и оба access indexes.
SELECT to_regclass('public.league_placements') AS league_placements_table,
       to_regclass('public.idx_league_placements_user') AS user_index,
       to_regclass('public.idx_league_placements_week') AS week_index;
-- expected: all three values are non-NULL.

-- Runner record: tail files are applied once.
SELECT filename
FROM schema_migrations
WHERE filename IN (
  '059_seed_missing_event_definitions.sql',
  '060_starter_pack_once.sql',
  '061_leagues.sql'
)
ORDER BY filename;
-- expected: exactly three rows.
```

После SQL-check выполните signed Telegram/Ads smoke только в отдельном staging workstream. Не используйте real AdsGram signature в обычных application logs и не переключайте `PAYMENTS_ENABLED` для проверки этого tail.

## Rollback boundary и incident handling

| Ситуация | Безопасная реакция |
|---|---|
| Ошибка до записи migration в `schema_migrations` | Не перезапускать параллельно. Сохранить безопасный error summary, проверить транзакционный rollback и исправить root cause в новой ветке/PR. |
| Ошибка после partial release | Остановить дальнейший rollout, не делать ручной `DELETE` из `event_definitions` и не удалять `league_placements` с потенциальными данными. Восстановление делается из проверенного pre-flight backup по change procedure владельца. |
| Нужно временно откатить код | Откатить application image только после проверки compatibility с уже применённой схемой. Schema rollback — отдельная owner-approved операция с backup; этот runbook не предлагает destructive SQL. |
| Конкурирующие runner/replica | Немедленно остановить второй runner/replica, сохранить временную шкалу инцидента и проверить `schema_migrations` до любых повторных действий. |

### Single-instance constraint

Backend содержит process-local cron state. До выноса scheduler один и только один long-lived backend instance обслуживает production; horizontal replicas могут задвоить season rotation и battle jobs. Это ограничение относится и к моменту миграции: один migration runner и один runtime instance уменьшают риск DDL/DML гонок. Полный контекст целевой инфраструктуры находится в [INFRA.md](./INFRA.md).
