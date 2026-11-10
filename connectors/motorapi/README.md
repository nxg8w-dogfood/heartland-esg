# MotorAPI connector

Plate lookups for the *Bilpark* page (ADR 0009). The app calls a custom connector. The connector
signs the user in with Entra ID and calls an Azure API Management proxy. The proxy checks the
token and adds the MotorAPI key from Key Vault, then calls https://v1.motorapi.dk.

| File | What it is |
| --- | --- |
| `apiDefinition.swagger.json` | The connector's two operations, `GetVehicle` and `GetVehicleEnvironment` |
| `apiProperties.json` | Entra ID OAuth settings. Every ID and the secret come from environment variables. |
| `apim-policy.xml` | The API-level policy for the proxy |

Nothing here is a secret. The key, the client secret, tenant and app IDs and the host live in
Key Vault, API Management named values and Power Platform environment variables.

## Setting it up in an environment

`infra/motorapi/main.bicep` creates the Azure and Entra ID parts:
- the API Management instance (Consumption, tagged), its API, policy and named values;
- read access for API Management to the one Key Vault secret;
- the two Entra app registrations, the `Vehicle.Lookup` role, and admin consent between them;
- a monthly budget with alerts at 50, 80 and 100 %.

It's run by hand for now, because dev deploys from the pipeline aren't wired up yet (PR #32).

You need:
- Owner on the resource group;
- Key Vault Secrets Officer on the vault, for step 1;
- an Entra role that can create app registrations and grant admin consent, e.g. Cloud Application
  Administrator.

1. **Key:** put the MotorAPI token in Key Vault yourself, without it passing through a chat or
   a file. For dev it's already there, as `motorapi-key-dev` in `kv-nexus-ai-dev-867ee8`.

2. **Preview, then deploy** (`dev.bicepparam` has dev's vault and secret names):

   ```bash
   export HLESG_OWNER_EMAIL=<owning team's address>
   export HLESG_BUDGET_EMAILS=<team address>[,<another>]
   export HLESG_LOOKUP_GROUP_ID=<object ID of the Entra group allowed to look up plates>
   az deployment group what-if --resource-group rg-heartland-ai --parameters infra/motorapi/dev.bicepparam
   az deployment group create --resource-group rg-heartland-ai --parameters infra/motorapi/dev.bicepparam --query properties.outputs
   ```

   - **The outputs** are the values for the Power Platform environment variables in step 4.
   - **The lookup group:** leave `HLESG_LOOKUP_GROUP_ID` empty to assign the role by hand under
     the proxy's *Enterprise application* → *Users and groups*.
   - **If it fails on the app role assignment or consent:** Entra replication can lag behind a new
     app, so run the same command again.

3. **The connector's client secret:** created straight into Key Vault, never shown. Bash:

   ```bash
   az ad app credential reset --id <hlesg_MotorApiConnectorClientId> --append --display-name power-platform --years 1 --query password -o tsv | az keyvault secret set --vault-name kv-nexus-ai-dev-867ee8 --name motorapi-connector-secret-dev --file /dev/stdin --output none
   ```

   In PowerShell, run the first half into a variable with `$s = …`, then use `--value $s` and
   `Remove-Variable s`. Note the expiry date: the secret has to be renewed before it runs out.

4. **Power Platform**, in the HeartlandESG solution:
   - create the environment variables from the deployment outputs as Text: `hlesg_MotorApiHost`,
     `hlesg_TenantId`, `hlesg_MotorApiAudience` and `hlesg_MotorApiConnectorClientId`;
   - create `hlesg_MotorApiConnectorClientSecret` as Secret, pointing at the secret from step 3
     ([docs](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets));
   - import the connector from these files, e.g. with `paconn create`, and validate it;
   - create a connection reference to it.

5. **The connector's redirect URI:** the import shows a per-connector redirect URI. Add it to
   `connectorRedirectUris` and deploy again.

6. **The app:**
   - run `pa app add data-source --connector <connector-id> --connection-ref <ref> --solution-id <id>`;
   - in `src/App.tsx`, use `connectorLookup(<generated service>)` inside Power Apps instead of
     `noLookup`.

Check the OAuth settings in `apiProperties.json` against what the portal generates the first time
the connector is imported. They follow Microsoft's Entra ID connector template, but haven't been
imported anywhere yet.
