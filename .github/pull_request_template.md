## Summary

Describe the change and why it is needed.

## Verification

- [ ] `scripts/check-repo-boundary.sh`
- [ ] `cd web-frontend && npm test`
- [ ] `cd web-frontend && npm run test:workers`
- [ ] `cd web-frontend && npm run build`

## Safety Checklist

- [ ] No credentials, tokens, private URLs, or customer/prospect data are included.
- [ ] Runtime/generated files remain outside the repository.
- [ ] Real external side effects remain disabled by default.
- [ ] New risky actions go through the side-effect gate.
- [ ] New configuration is documented in an `.env.example` file.
