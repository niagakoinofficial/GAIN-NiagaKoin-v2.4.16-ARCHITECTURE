# Contributing

## Before opening a pull request

```bash
npm ci
npm run doctor
npm run lint
npm test
npm run test:core
npm run build
```

For changes affecting authorization, financial state, exchange execution, or recovery, update the relevant document under `docs/` and add or update a regression test.

Do not commit generated `dist/`, `node_modules/`, local `.env`, or credential files.
