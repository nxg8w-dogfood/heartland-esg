# Heartland ESG

A tool used to measure co2 emissions on a company

## Running it

_How to run this locally, and how to deploy it. Fill this in before the first pull request._

## Working here

This repository was started through aiG8way. The agreed brief is in `CLAUDE.md` / `AGENTS.md`;
the security controls that apply are in `SECURITY.md`.

Guardrails this project carries:

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

## Licence and ownership

Proprietary, all rights reserved. Copyright © 2026 Heartland A/S. See `LICENSE`.
Maintained by @mortengad (see `.github/CODEOWNERS`).
