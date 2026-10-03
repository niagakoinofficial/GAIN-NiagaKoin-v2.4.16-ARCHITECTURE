# Local Development Runbook

## Fresh clone

```bash
npm ci
npm run setup:local
npm run env:check
npm run doctor
```

## Start infrastructure

```bash
POSTGRES_HOST_PORT=5432 REDIS_HOST_PORT=6379 docker compose up -d postgres redis
```

If Redis is already running natively on 6379, leave the Docker Redis service stopped and point `REDIS_URL` at the native Redis instance.

## Database

```bash
npm run db:check
npm run db:migrate
```

## Application

```bash
npm run dev
```

## Repair a corrupted local dependency tree

```bash
npm run repair:dependencies
```

This is the repository-supported equivalent of manually deleting `node_modules` and `dist`.

## Never

Do not run `docker compose down -v` against data you need to preserve.
Do not place exchange secrets in Git or browser localStorage.
