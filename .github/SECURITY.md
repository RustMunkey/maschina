# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest `main` | Yes |
| All others | No |

We operate a rolling release model. Only the current production version receives security patches.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via one of:

- **GitHub private vulnerability reporting**: [Security tab → Report a vulnerability](https://github.com/RustMunkey/maschina/security/advisories/new)
- **Email**: security@maschina.ai *(monitored, response within 48 hours)*

### What to include

- Description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if available)
- Which component is affected (`services/gateway`, `packages/auth`, etc.)
- Your contact information for follow-up

### What to expect

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix timeline**: depends on severity — critical issues targeted within 7 days
- **Credit**: we will credit reporters in the release notes unless you prefer anonymity

---

## Scope

In scope:
- Authentication and authorization bypass
- JWT forgery or secret exposure
- SQL injection, XSS, CSRF
- API key exposure or timing attacks
- Prompt injection that bypasses safety checks
- Data exfiltration from agent runs

Out of scope:
- Vulnerabilities in third-party services (Anthropic, Stripe, Neon)
- Social engineering attacks
- Issues requiring physical access
- Denial of service without data impact

---

## Security architecture reference

See [docs/security/](../docs/security/) for the full security model, access control, and secrets management documentation.
