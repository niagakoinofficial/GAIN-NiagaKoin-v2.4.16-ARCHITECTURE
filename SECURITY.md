# Security

## Reporting

Please do not publish exploitable security details in a public issue. Contact the project security owner through the private channel configured for the deployment.

## Security model

Architecture 25 separates: Firebase identity, GAIN member lifecycle, license entitlement, on-demand email security elevation, and TOTP/2FA for high-risk transactions. See `docs/architecture/ARCHITECTURE-FINAL-v2.4.16.md`.

## Secrets

Never commit `.env`, exchange API secrets, Firebase service-account credentials, private keys, or production backups.
