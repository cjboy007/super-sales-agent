# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes are accepted on the default branch.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report privately through GitHub Security Advisories if available on the repository. If advisories are not enabled yet, contact the maintainers through the private channel listed by the project owner before public disclosure.

Include:

- Affected component or file.
- Reproduction steps.
- Impact.
- Whether credentials, customer data, or external side effects are involved.
- Suggested fix, if known.

## Security Boundaries

SSA is designed to fail closed for risky actions. These must remain blocked unless explicitly enabled and approved:

- Real customer email sends.
- External CRM writes.
- Payment, bank, or fulfillment actions.
- Formal customer document generation or delivery.
- Any action that changes price, order, shipment, or payment state.

Secrets and runtime data must stay outside the repository under a local data root or production secret manager.

## Credential Storage

Real credentials never belong in project files. Store them in one of:

- Runtime environment variables (production: platform secret manager).
- The runtime data root: `SSA_DATA_ROOT/config.json` (default `~/.ssa/data/`).
- Per-company profile files under `~/.config/super-sales-agent/profiles/<profile>.env`,
  selected with `SSA_PROFILE=<profile>` or `EMAIL_PROFILE=<profile>`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sales@example.com
SMTP_PASS=replace-with-provider-app-password
SMTP_FROM=sales@example.com

IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_TLS=true
IMAP_USER=sales@example.com
IMAP_PASS=replace-with-provider-app-password
```

Profile files should be readable only by the current user:

```bash
chmod 700 ~/.config/super-sales-agent ~/.config/super-sales-agent/profiles
chmod 600 ~/.config/super-sales-agent/profiles/*.env
```
