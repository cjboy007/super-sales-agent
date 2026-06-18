# SSA Secrets

Real credentials must stay outside this repository.

## Local Profiles

Create one profile file per company under:

```text
~/.config/super-sales-agent/profiles/<profile>.env
```

Common profile names:

```text
~/.config/super-sales-agent/profiles/hero-pumps.env
~/.config/super-sales-agent/profiles/farreach.env
```

Use `SSA_PROFILE=<profile>` or `EMAIL_PROFILE=<profile>` to select a profile.

## Example

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

## Permissions

Local profile files should be readable only by the current user:

```bash
chmod 700 ~/.config/super-sales-agent ~/.config/super-sales-agent/profiles
chmod 600 ~/.config/super-sales-agent/profiles/*.env
```

In production, store these values in the platform secret manager or runtime
environment variables. Do not copy real credentials into project files.
