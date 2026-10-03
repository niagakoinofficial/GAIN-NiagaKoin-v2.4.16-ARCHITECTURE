# Repository Cleanup — 2026-10-03

## Completed

- 35 root Markdown documents reorganized under `docs/`.
- Historical roadmaps/manifests/status notes moved under `docs/archive/`.
- Legacy `GAIN_NIAGA_KOIN_GO_PUBLIC_BLUEPRINT.txt` moved to `docs/archive/legacy/`.
- One active roadmap established: `docs/roadmap/ROADMAP-v2.5-PUBLIC-CERTIFICATION.md`.
- README rewritten for v2.4.16 and clean-clone workflow.
- `metadata.json` aligned to v2.4.16.
- `package.json` and `package-lock.json` aligned to exact direct dependency versions.
- Node/npm engines pinned to Node 22.16+ and npm 10.9.2+ within major version boundaries.
- `tsx` moved to runtime dependencies because the production server executes TypeScript through tsx.
- `npm start` corrected to `node --import tsx server.ts`.
- Docker builds switched to `npm ci`; runtime image uses `npm ci --omit=dev`.
- Stale Dockerfile documentation COPY paths removed.
- Fixed Docker Compose container-name collisions by removing `container_name` and making host ports configurable.
- Added `setup:local`, `env:check`, `doctor`, `repair:dependencies`, and release package verification tooling.
- Security audit updated for Architecture 25 security elevation semantics.
- JSON manifests and source release gates revalidated.

## Validation notes

The current validation container has no outbound DNS/internet access. Therefore the read-only exchange certification harness was **blocked by environment** rather than treated as exchange failures. Run `npm run test:exchange-certification` on the target Mac/staging environment with outbound HTTPS enabled.

`npm ci` also could not be completed in this container because registry access was unavailable. Package/lock consistency is verified structurally; the target Mac remains the authoritative clean-install validation environment.
