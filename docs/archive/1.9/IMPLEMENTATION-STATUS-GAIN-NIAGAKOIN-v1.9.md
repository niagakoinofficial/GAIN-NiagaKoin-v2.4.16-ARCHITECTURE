# Implementation Status — GAIN NiagaKoin v1.9

## Startup Bot Recovery / Auto-Resume Hardening

Implemented against v1.8:

- Previously-active Testnet/Live runners are always restored into `paused` + startup reconciliation gate.
- Startup reconciliation does **not** authorize trading by itself.
- Default policy is `MANUAL_RESUME_REQUIRED`.
- Auto-resume is opt-in only when both are explicitly set:
  - `BOT_STARTUP_AUTO_RESUME=true`
  - `BOT_STARTUP_AUTO_RESUME_CONFIRM=I_UNDERSTAND_STARTUP_AUTO_RESUME`
- After successful startup reconciliation, default behavior remains paused with `STARTUP_RESUME_REQUIRED`.
- Recovered paused bots do not open V2 websocket market feeds before explicit resume.
- Engine-status exposes startup resume policy.
- Operational notifications distinguish `STARTUP_RESUME_REQUIRED` from healthy runtime.
- Added regression tests for the two-part auto-resume safety switch and startup resume-required state.

## Safety intent

This prevents a server restart during local/Testnet development from silently resuming an old bot and placing new exchange orders. A user must explicitly press Resume after the startup reconciliation has completed, unless the deployment owner has deliberately enabled and confirmed auto-resume.

## Validation status

Source/security gates must be re-run after packaging. Runtime Testnet validation remains external evidence and must be repeated on the target Mac environment.
