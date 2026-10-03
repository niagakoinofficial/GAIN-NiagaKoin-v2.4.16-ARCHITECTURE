# GAIN NiagaKoin v2.4.16

GAIN is a quantitative trading and algorithmic execution platform with guarded bot deployment, backtesting, multi-exchange certification, financial ledger controls, recovery logic, and Architecture 25 authorization.

> **Release status:** Engineering/testnet candidate. Public live-trading release is not claimed yet.

## Architecture 25

The current authorization model is deliberately separated into layers:

```text
Google / Firebase Authentication
        ↓
GAIN Member Lifecycle
        ↓
License Entitlement
        ↓
Dashboard / Non-licensed Features
        ↓
Security Elevation (email OTP, on demand)
        ↓
TOTP / 2FA for high-risk actions
        ↓
Exchange Credential + Risk + Runtime Gates
        ↓
Live/Testnet Execution
```

A user without a license can authenticate and open the dashboard. Email OTP is **not** a dashboard/login gate. It is a 24-hour elevated security session requested only by protected actions. Live execution has separate license, security-session, exchange, runtime, and TOTP checks.

See [`docs/architecture/ARCHITECTURE-FINAL-v2.4.16.md`](docs/architecture/ARCHITECTURE-FINAL-v2.4.16.md) and [`docs/architecture/ARCHITECTURE25-IMPLEMENTATION-REPORT.md`](docs/architecture/ARCHITECTURE25-IMPLEMENTATION-REPORT.md).

## Repository layout

```text
docs/
├── architecture/   # Architecture 25, ownership, exchange identity
├── security/       # Security/session/email/startup recovery
├── exchange/       # Multi-exchange certification
├── operations/     # Local/staging/incident/backup runbooks
├── release/        # Release status and public-readiness evidence
├── roadmap/        # ONLY the active roadmap
└── archive/        # Historical roadmaps, manifests, implementation notes
```

The only active roadmap is [`docs/roadmap/ROADMAP-v2.5-PUBLIC-CERTIFICATION.md`](docs/roadmap/ROADMAP-v2.5-PUBLIC-CERTIFICATION.md).

## Runtime requirements

- Node.js **22 LTS** (the project Docker image uses Node 22)
- npm 10.x (the repository pins `npm@10.9.2` via `packageManager`)
- Git
- PostgreSQL 16
- Redis 7+ (Docker or a compatible local Redis)
- Firebase project with Google Authentication + Firestore
- Firebase Admin credentials via Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`

## Clean clone: recommended flow

```bash
git clone <GITHUB_REPOSITORY_URL> gain-niagakoin-v2.4.16
cd gain-niagakoin-v2.4.16
# Optional when using nvm:
# nvm install && nvm use
npm ci
npm run setup:local
npm run env:check
npm run doctor
npm run lint
npm test
npm run test:core
npm run build
```

`npm ci` is the canonical install command. Do **not** copy `node_modules` into the repository and do not commit `dist`.

If a dependency tree becomes corrupted locally, use the repository-provided cross-platform repair command instead of hand-written `rm -rf` commands:

```bash
npm run repair:dependencies
```

## Local environment

Start with:

```bash
npm run setup:local
```

This creates `.env` from `.env.example` and generates safe local-only random values for secrets such as `ENCRYPTION_MASTER_KEY` when they are absent. It does not invent Firebase credentials or exchange API keys; those remain explicit configuration items.

Then run:

```bash
npm run env:check
```

Required browser Firebase values are:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

For Firebase Admin on a local Mac, use Application Default Credentials:

```bash
gcloud auth application-default login
```

or set `GOOGLE_APPLICATION_CREDENTIALS` to an appropriate server credential file.

## Local PostgreSQL + Redis

The repository compose file is safe to run without fixed container names. Host ports are configurable:

```bash
POSTGRES_HOST_PORT=5432 REDIS_HOST_PORT=6379 docker compose up -d postgres redis
```

If port 6379 is already occupied by a native Redis instance, keep the native Redis and do not start the compose Redis service. Set:

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_REQUIRED=true
```

For a Docker Redis on another host port:

```bash
REDIS_HOST_PORT=6380 docker compose up -d redis
```

and use `REDIS_URL=redis://127.0.0.1:6380` in `.env`.

## Database

After PostgreSQL is available:

```bash
npm run db:check
npm run db:migrate
```

Do not use `docker compose down -v` against a database that contains data you care about.

## Verification / release gates

Source validation:

```bash
npm run doctor
npm run lint
npm test
npm run test:core
npm run test:v2
npm run release:roadmap-gate
npm run release:architecture25-gate
npm run test:exchange-certification-stages
npm run release:public-audit
node scripts/security-audit.mjs
npm run build
```

Read-only external certification:

```bash
npm run test:exchange-certification
```

That certification script does not submit orders; it checks current public market-data endpoints and records blocked capabilities honestly.

## Safety defaults

The repository keeps these defaults fail-closed:

```env
LIVE_TRADING_ENABLED=false
LIVE_TRADING_TESTNET_ONLY=true
BOT_STARTUP_AUTO_RESUME=false
EXCHANGE_CERT_MICRO_LIVE_ENABLED=false
BINANCE_TESTNET_PLACE_ORDERS=false
```

Previously active bots remain paused after restart until explicitly resumed, unless a deployment intentionally opts into the two-part auto-resume confirmation.

## Security / secrets

Never commit:

- `.env`
- service-account credentials
- private keys
- exchange API secrets
- `node_modules`
- `dist`
- backups containing production data

Exchange credentials are intended to remain server-side and encrypted at rest; the browser should not persist exchange secrets.

## Public release status

This repository is **not** a declaration of production-live readiness. The remaining release gates are tracked in the active v2.5 roadmap: full exchange certification, financial replay, chaos/recovery, backup/restore, monitoring, and a 24–72 hour testnet soak.
