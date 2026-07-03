# Open Source Release Notes

This document tracks repository state for public release preparation.

## Public Release Boundary

Keep these in the repository:

- Source code.
- Tests and fictional fixtures.
- Sanitized templates and examples.
- Public documentation.
- Package manifests and lockfiles.

Keep these out of the repository:

- Real credentials, tokens, and API keys.
- Private deployment hosts, IP addresses, SSH users, and server paths.
- Customer, prospect, lead, mailbox, CRM, payment, or bank data.
- Generated quotations, PIs, invoices, PDFs, spreadsheets, videos, screenshots, logs, and local task state.
- Local operator artifacts from agent frameworks or automation tools.

## Pre-Publish Checklist

- [ ] `git status --short` contains only intentional release-prep changes.
- [ ] `scripts/check-repo-boundary.sh` passes.
- [ ] Secret scan has no real credentials or private deployment details.
- [ ] `cd web-frontend && npm test` passes.
- [ ] `cd web-frontend && npm run test:workers` passes.
- [ ] `cd web-frontend && npm run build` passes.
- [ ] Default branch protection and security advisories are enabled on GitHub.
- [ ] Maintainers confirm the license choice.
- [ ] Maintainers confirm whether old git history must be rewritten before publishing.

## History Warning

Removing files from the current tree does not remove them from git history. If this repository has ever contained real secrets, customer data, private prospect lists, or private generated documents, rotate the affected credentials and rewrite history before making the repository public.

## Publishing Steps

1. Review the final diff.
2. Run the verification checklist.
3. Rotate any credential that may have appeared in history.
4. Rewrite history if sensitive material existed in previous commits.
5. Create the public GitHub repository or change visibility.
6. Push only after maintainers explicitly approve publishing.
