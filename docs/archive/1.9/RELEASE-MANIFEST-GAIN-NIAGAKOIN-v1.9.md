# Release Manifest — GAIN NiagaKoin v1.9

## Change set

Startup bot recovery / auto-resume safety hardening from v1.8.

### Default behavior
- `BOT_STARTUP_AUTO_RESUME=false`
- `BOT_STARTUP_AUTO_RESUME_CONFIRM=`
- Previously-active runners are reconciled, then remain paused.
- Explicit Resume is required before trading resumes.

### Explicit opt-in behavior
Auto-resume is enabled only when both switches are present and valid:
`BOT_STARTUP_AUTO_RESUME=true`
`BOT_STARTUP_AUTO_RESUME_CONFIRM=I_UNDERSTAND_STARTUP_AUTO_RESUME`

## Release gating

This hardening does not constitute Go Public by itself. Runtime E2E, chaos/recovery, financial replay, and 24–72h Testnet soak evidence remain required.
