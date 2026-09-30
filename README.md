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

This needs a Power Platform environment with code apps enabled. The
[Power Apps CLI](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
is a dev dependency, so `npx pa` runs the project's pinned version:

```bash
npx pa app init --display-name "Heartland ESG" --environment-id <environment-id>
npx pa app run
```

Open the URL labelled **Local Play** in the browser profile you use for the Power Platform
tenant. `pa app init` writes `power.config.json` for your own environment. It's git-ignored;
the shared environments' configs live in `deploy/`.

### Deploy

Deploys run from `.github/workflows/deploy.yml`, never from a laptop:

- **dev** deploys on every push to `main`.
- **test** and **prod** deploy when started by hand: **Actions → deploy → Run workflow**.
  To send prod exactly what was checked on test, give that commit's SHA (see
  [docs/deploy.md](docs/deploy.md#promote-a-tested-commit-to-prod)).

Each environment needs a one-time setup first (a Power Platform environment, a service
principal and a GitHub environment). Until then its deploy run warns and deploys nothing.
The setup steps are in [docs/deploy.md](docs/deploy.md). The reasoning is in ADR 0003.

### Layout

| Path | What it is |
| --- | --- |
| `src/calc/` | Emission calculations as plain TypeScript, with tests next to them. No UI, no Power Platform dependencies. |
| `src/App.tsx` | The app shell. |
| `docs/adr/` | Architecture decisions. |
| `deploy/<env>/power.config.json` | Per-environment app config used by the deploy workflow. |
| `.github/workflows/ci.yml` | Lint, test, build and dependency audit, plus a gitleaks scan of the full history. |
| `.github/workflows/deploy.yml` | Publishes the app to dev, test or prod. |

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
