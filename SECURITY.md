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
