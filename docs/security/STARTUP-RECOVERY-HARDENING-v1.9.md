# GAIN NiagaKoin — Startup Recovery Hardening v1.9

## Problem addressed

Before v1.9, a runner persisted as `active` could be restored after a Node restart, reconciled, and then automatically transitioned back to `active` by the worker. During local/Testnet runtime testing this could cause an old bot to place new exchange orders without a new explicit user action.

## New policy

### Default — manual resume required

```env
BOT_STARTUP_AUTO_RESUME=false
BOT_STARTUP_AUTO_RESUME_CONFIRM=
```

Previously-active Testnet/Live bots now:

1. restore as `paused`;
2. enter `STARTUP_RECONCILIATION_PENDING`;
3. are reconciled against exchange balance/open orders;
4. remain `paused` after successful reconciliation;
5. expose `STARTUP_RESUME_REQUIRED`;
6. require an explicit user Resume action before exchange execution can continue.

### Auto-resume — explicit two-part opt-in

Only when both are configured:

```env
BOT_STARTUP_AUTO_RESUME=true
BOT_STARTUP_AUTO_RESUME_CONFIRM=I_UNDERSTAND_STARTUP_AUTO_RESUME
```

Then successful startup reconciliation may transition the runner back to `active`.

## WebSocket safety

A recovered runner does not open its V2 exchange WebSocket while paused. The connection is created only after the runner is actually `active`.

## Observability

Engine status exposes:

- `startupAutoResumeEnabled`
- `startupAutoResumePolicy`
- `recoveryState=STARTUP_RESUME_REQUIRED`

Operational notifications explicitly tell the operator that Resume is required.
