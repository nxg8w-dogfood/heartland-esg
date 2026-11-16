# Deploying Heartland ESG

Deploys run from `.github/workflows/deploy.yml`, never from a laptop:

| Environment | When it deploys |
| --- | --- |
| `dev` | Automatically, on every push to `main` |
| `test`, `prod` | Only when started by hand: **Actions → deploy → Run workflow**, then pick the environment |

The workflow only deploys reviewed code. A manual run started from any branch other than
`main` fails with an error and deploys nothing. Each run installs, lints, tests and builds before publishing with the Power Apps CLI
(`pa app push --non-interactive`), signed in as a service principal
([Microsoft Learn](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)).

Until an environment has been set up as described below, its deploy run ends with a warning
("isn't set up yet") and deploys nothing.

## Promote a tested commit to prod

A manual run deploys the latest `main` unless you name a commit. So that prod gets exactly
what was checked on test:

1. Deploy to **test** with *Commit* left empty. The run summary shows which commit it
   deployed, for example ``Deployed `3f2a…` to test``.
2. Check the app on test.
3. Deploy to **prod** and paste that SHA into *Commit*. The run fails unless the commit is on
   `main`.

The commit must already contain `deploy/prod/power.config.json`. The config comes from the
same commit as the code, so a deploy is always one consistent snapshot.

## Set up an environment (once per environment)

Repeat for `dev`, `test` and `prod`. Steps 1–3 need a Power Platform admin and an Entra
admin. Step 4 must be done by a person, because Power Platform requires it.

1. **Power Platform environment.** Create it with Dataverse, and turn on code apps: Power
   Platform admin center → **Manage → Environments →** the environment → **Settings →
   Product → Features → Power Apps code apps → Enable code apps**. Note the environment ID.
2. **Service principal.** In Entra, create an app registration for deployments (for example
   *Heartland ESG deploy (dev)*) with a client secret. Set an expiry and diary the rotation.
   Note the application (client) ID, the directory (tenant) ID, and the **Enterprise
   application** object ID. Don't use the app registration's object ID.
3. **Give the service principal access to the environment.** Add it as an application user
   in the Power Platform environment.
4. **First publish and share, by a maker.** The service principal can only update an app
   that already exists and has been shared with it, and it can't grant itself access. From a
   clean checkout of `main`:

   ```bash
   npm ci
   npm run build
   npx pa app init --display-name "Heartland ESG" --environment-id <environment-id>
   npx pa app push
   npx pa app share --principal <enterprise-application-object-id> --access edit
   ```

5. **Commit the environment's config.** Move the `power.config.json` that steps above wrote
   to `deploy/<environment>/power.config.json` and open a pull request. It holds IDs, not
   secrets. The root `power.config.json` is git-ignored so that a developer's own environment
   never gets committed by accident.
6. **GitHub environment.** Repository **Settings → Environments → New environment**, named
   exactly `dev`, `test` or `prod`:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `PA_CLI_SP_CLIENT_ID` | Variable | Application (client) ID |
   | `PA_CLI_SP_TENANT_ID` | Variable | Directory (tenant) ID |
   | `PA_CLI_SP_CLIENT_SECRET` | **Secret** | The client secret |
   | `PA_CLI_SOLUTION_ID` | Variable, optional | Solution to add the app to |
   | `PA_DATAVERSE_URL` | Variable | The environment's Dataverse URL, `https://<org>.crm4.dynamics.com` |

   `PA_DATAVERSE_URL` is what the deploy checks the schema against before publishing (ADR 0020):
   the app selects every column in `src/dataverse/schema.ts` when it loads, so an environment
   that is behind the code fails to load entirely. Without the variable the deploy warns and
   skips that check. The service principal needs only read access to the metadata for it; it
   creates nothing.

   Under **Deployment branches**, allow `main` only. For `prod`, add required reviewers if
   the organisation's GitHub plan offers them for private repositories.

## Set up the nightly utility sync (once per environment)

The sync fetches each company's electricity and heating every night (ADR 0021). The app works
without it; until it's set up, the deploy warns and skips it. It needs an Azure administrator.

1. **Apply the schema** first, so `hlesg_maaler` and the role *Klimaregnskab – Synkronisering*
   exist: `npm run dataverse:apply -- --url <dataverse url>`.
2. **Create the Azure resources** in the environment's resource group, next to its Key Vault:

   ```bash
   export HLESG_OWNER_EMAIL=<owning team's address>
   export HLESG_BUDGET_EMAILS=<team address>[,<another>]
   az deployment group create -g <resource group> -f infra/utility-sync/main.bicep -p infra/utility-sync/<env>.bicepparam
   ```

   Note the outputs `functionAppName` and `principalId`.
3. **Give the Function access to Dataverse.** Look up the identity's application ID with
   `az ad sp show --id <principalId> --query appId -o tsv`. Then, in the Power Platform admin
   center, open the environment and go to **Settings → Users + permissions → Application users →
   New app user**:
   - add that application to the root business unit;
   - give it the role **Klimaregnskab – Synkronisering** only.
4. **Let the pipeline deploy the code.**
   - On the deploy service principal (step 2 above), add a federated credential: **Certificates &
     secrets → Federated credentials → GitHub Actions**, for this repository, entity *Environment*,
     and the environment's name.
   - Give the service principal **Website Contributor** on the Function App.
   - Add these variables to the GitHub environment:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `AZURE_SUBSCRIPTION_ID` | Variable | The resource group's subscription |
   | `UTILITY_SYNC_RESOURCE_GROUP` | Variable | The resource group |
   | `UTILITY_SYNC_APP` | Variable | `functionAppName` from step 2 |

   The next deploy publishes the Function.
5. **Add a company's tokens.** The company's ID is `hlesg_virksomhedid`. It's in the address of
   the company's row in Dataverse, or you can run
   `az rest` against `hlesg_virksomheds?$select=hlesg_navn`. Then set either secret, or both:

   ```bash
   az keyvault secret set --vault-name <vault> --name eloverblik-<company id> --file eloverblik.txt
   az keyvault secret set --vault-name <vault> --name varmeoverblik-<company id> --file varmeoverblik.txt
   ```

   Save each token to a file first and delete the file afterwards, so the token doesn't stay in
   your shell history. Don't save the files inside the repository. To replace a token, set it again. To stop the sync for a company, delete
   the secret.
6. **Run it once by hand**, rather than waiting for 02:00 UTC: in the Azure portal, open the
   Function App, then **utilitySync → Code + Test → Test/Run**.
   - The company's meters appear on its Scope 2 page, under *Målere, der hentes hver nat*.
   - Pick a location for each meter. Its months come in on the next run.
   - A failed run sends the team an alert e-mail.

## Rotating the client secret

Create the new secret in Entra, update `PA_CLI_SP_CLIENT_SECRET` in the GitHub environment,
run a deploy to confirm it works, then delete the old secret in Entra.
