# Heartland ESG

A tool used to measure co2 emissions on a company

## Running it

Heartland ESG is being rebuilt as a [Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview):
React and TypeScript built with Vite, with Dataverse behind it. Why is in
[docs/adr/0001](docs/adr/0001-rebuild-as-power-apps-code-app.md).

### Prerequisites

- Node.js 24 (LTS) and npm
- Git

### Run it locally

```bash
npm ci
npm run dev
```

Vite prints a local URL. This runs the UI on its own, outside Power Platform, which is
enough for UI work and for the calculation engine in `src/calc/`.

### Check your change

These are the same steps CI runs on every pull request:

```bash
npm run lint
npm test
npm run build
```

Use `npm run test:watch` to rerun tests while you work.

### Run it inside Power Platform

This needs a Power Platform environment with code apps enabled, and the
[Power Apps CLI](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli):

```bash
npm install --global @microsoft/power-apps-cli
pa app init --display-name "Heartland ESG" --environment-id <environment-id>
pa app run
```

Open the URL labelled **Local Play** in the browser profile you use for the Power Platform
tenant. `pa app init` writes `power.config.json`. The project's environments haven't been
set up yet, so that file isn't committed.

### Deploy

**Not automated yet.** Deploys will run from a GitHub Actions workflow, one GitHub
environment per Power Platform environment, publishing with `pa app push` under a service
principal whose credentials live in GitHub environment secrets. That workflow waits on the
environments and the service principal being created. Until then, don't deploy from a laptop.

### Layout

| Path | What it is |
| --- | --- |
| `src/calc/` | Emission calculations as plain TypeScript, with tests next to them. No UI, no Power Platform dependencies. |
| `src/data/factors.ts` | The emission factor table, copied value for value from the original app. |
| `src/scope1/`, `src/scope2/`, `src/scope3/`, `src/factors/` | The Scope 1, 2 and 3 screens, and the factor table. |
| `src/App.tsx` | The app shell. |
| `docs/adr/` | Architecture decisions. |
| `.github/workflows/ci.yml` | Lint, test, build and dependency audit, plus a gitleaks scan of the full history. |

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
