# Тестовая инфраструктура Coder Survival

## PostgreSQL для интеграционных тестов

### Staging VM (Yandex Cloud)

| Параметр | Значение |
|----------|----------|
| **Host** | `89.169.140.219` |
| **Port** | `5432` |
| **Database** | `coder_survival_test` |
| **User** | `test` |
| **Password** | `testpass123` |

### Подключение

```bash
# psql
psql postgresql://test:testpass123@89.169.140.219:5432/coder_survival_test

# Node.js
const pool = new Pool({
  host: '89.169.140.219',
  port: 5432,
  database: 'coder_survival_test',
  user: 'test',
  password: 'testpass123',
});
```

### Запуск тестов локально

```bash
cd backend
export TEST_DATABASE_URL="postgresql://test:testpass123@89.169.140.219:5432/coder_survival_test"
npm test -- --runInBand
```

### Docker на staging VM

```bash
# Подключение к VM
ssh -i ~/.ssh/openclaw_key yc-user@89.169.140.219

# Управление контейнером
sudo docker ps                    # список контейнеров
sudo docker logs postgres-test    # логи PostgreSQL
sudo docker restart postgres-test # перезапуск
sudo docker stop postgres-test    # остановка
```

### Существующие контейнеры на staging

| Контейнер | Образ | Порты | Назначение |
|-----------|-------|-------|------------|
| `cs-staging_backend_1` | `coder-survival-backend:staging` | 80→3000 | Staging backend |
| `cs-staging_db_1` | `postgres:16-alpine` | 5432 (internal) | Staging БД |
| `postgres-test` | `postgres:16-alpine` | 5432→5432 | **Тестовая БД** |

## CI/CD

GitHub Actions автоматически запускает тесты с PostgreSQL 15 service container.
Локальные тесты можно запускать против staging VM.
