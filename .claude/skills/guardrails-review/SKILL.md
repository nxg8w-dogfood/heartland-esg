---
name: guardrails-review
description: Review a diff or a set of changed files against this project's guardrails and security controls before opening a pull request. Use when asked to review changes, check a diff, or before committing.
---

# Review against the brief

Read the rules below, then the change. Report findings in this shape, most severe first,
and nothing else:

```
<severity> · <control> — <path>:<line>: <what is wrong>. Suggestion: <what to change>.
```

Severity is **block** only for a clear breach (a committed credential, authorisation removed,
tests deleted to make CI pass), **warn** for a likely breach or a risk, **note** for advice.
Judge only what the change shows; do not invent context. If the change keeps every rule, say
so in one line and stop. Fewer precise findings beat many vague ones.

The same review runs on every pull request from the organisation's side and posts as a
comment; agreeing with it before you push saves a round trip.

## Guardrails — not negotiable

- **README with run instructions** — Every repository opens with a README that states what the project is, how to run it locally, and how to deploy it. A newcomer should be productive without asking anyone.
- **Automated tests run on every pull request** — A test suite exists and CI blocks a merge when it fails. Coverage targets are per-project; the non-negotiable part is that the suite runs unattended.
- **Protected default branch** — No direct pushes to the default branch. Changes land through a pull request with at least one review.
- **CI builds the project from a clean checkout** — The pipeline installs, lints, tests and builds from scratch. "Works on my machine" is not a build.
- **Deployment is automated per environment** — Deploys are triggered from the pipeline, not from a laptop, and each environment has its own configuration.
- **No secrets in source control** — Secrets live in Key Vault or environment configuration. The repository is scanned for committed credentials and the scan blocks the merge.
- **Dependency and vulnerability scanning** — Dependencies are scanned on a schedule, and known-vulnerable versions are patched inside the agreed window.
- **Authorisation checked server-side** — Permissions are enforced in the backend. Hiding a button in the UI is presentation, never protection.
- **License and ownership declared** — The repository states its licence and the owning team, so it is clear who maintains it and on what terms it may be reused.
- **Architecture decisions recorded** — Significant technical decisions are written down as short ADRs in docs/adr/, including the options rejected and why.

## Security controls that apply

- **Secrets in Key Vault, never in the repository** — Connection strings, keys and certificates live in Key Vault or environment configuration, injected at deploy time. The repository is scanned and the scan blocks the merge.
- **TLS 1.2 or better on every hop** — No plaintext anywhere, including between internal services. HTTP redirects to HTTPS and HSTS is set.
- **Authorisation enforced on the server** — Every request re-checks what the caller is allowed to do. Hiding a button in the UI is presentation, never protection.
- **Dependencies patched inside the agreed window** — Automated scanning on a schedule, with known-vulnerable versions upgraded before the window closes.
