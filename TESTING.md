# Coder Survival Test Infrastructure

## Required database boundaries

- GitHub `backend-tests.yml` creates a disposable PostgreSQL 15 service,
  runs all migrations twice, then runs the complete backend suite.
- GitHub `integration-tests-staging.yml` accepts only the `staging`
  environment secret `STAGING_TEST_DATABASE_URL`. It must name an isolated
  database; absent, malformed or unreachable configuration fails the job.
- Production and staging credentials never belong in this repository or a
  shell command history.

## Local integration run

Start a disposable PostgreSQL instance, then supply its URL explicitly:

```powershell
docker run --rm -d --name coder-survival-test-db `
  -e POSTGRES_DB=coder_survival_test `
  -e POSTGRES_USER=test `
  -e POSTGRES_PASSWORD=test `
  -p 127.0.0.1:55432:5432 postgres:15-alpine

$env:NODE_ENV = 'test'
$env:TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/coder_survival_test'
npm --prefix backend run migrate
npm --prefix backend test
docker rm -f coder-survival-test-db
```

The database in this example is local and disposable. Do not repoint it to a
shared staging or production instance.

## Release acceptance

Follow `docs/TEST_LAUNCH_RUNBOOK.md`. Production smoke mutates synthetic game
state, so it is executed only after a verified backup and CI success.
