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

Not done in any environment yet, and not automated. You need Owner on the Azure resource group,
Application Administrator in Entra ID, and System Administrator in the Power Platform environment.

1. **Key Vault:** store the MotorAPI token as a secret, e.g. `motorapi-key`.
2. **API Management**, Consumption tier, in Sweden Central:
   - turn on its system-assigned identity, and give it *Key Vault Secrets User* on the vault;
   - add tags `owner`, `project=heartland-esg` and `environment`, and a budget with alerts at
     50/80/100 % addressed to the owning team.
3. **Entra ID:**
   - register the proxy as an app with an Application ID URI and an app role, e.g.
     `Vehicle.Lookup`, and assign the role to the users or groups who may look up plates;
   - register the connector as a second app, with a delegated permission on the proxy and the
     redirect URL `https://global.consent.azure-apim.net/redirect`;
   - put the connector's client secret in Key Vault.
4. **API in API Management:**
   - add an API with URL suffix `motorapi` and the two GET operations from
     `apiDefinition.swagger.json`;
   - add the named values listed at the top of `apim-policy.xml`, with `motorapi-key` of type
     *Key vault*;
   - set `apim-policy.xml` as the API's policy;
   - turn off subscription keys for the API, because Entra ID does the authentication.
5. **Power Platform**, in the HeartlandESG solution:
   - create environment variables `hlesg_MotorApiHost` (the API Management host), `hlesg_TenantId`,
     `hlesg_MotorApiAudience` and `hlesg_MotorApiConnectorClientId` as Text;
   - create `hlesg_MotorApiConnectorClientSecret` as Secret, backed by Key Vault
     ([docs](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets));
   - import the connector from these files, e.g. with `paconn create`, and validate it;
   - create a connection reference to it.
6. **The app:**
   - run `pa app add data-source --connector <connector-id> --connection-ref <ref> --solution-id <id>`;
   - in `src/App.tsx`, use `connectorLookup(<generated service>)` inside Power Apps instead of
     `noLookup`.

Check the OAuth settings in `apiProperties.json` against what the portal generates the first time
the connector is imported. They follow Microsoft's Entra ID connector template, but haven't been
imported anywhere yet.
