# Eloverblik connector

Monthly electricity consumption for Scope 2, per company (ADR 0010). The app calls a custom
connector. The connector signs the user in with Entra ID and calls an Azure API Management
proxy. The proxy checks the token, reads the company's Eloverblik refresh token from Key Vault
and, in one request, gets an access token, lists the company's consumption metering points and
fetches their monthly time series from https://api.eloverblik.dk/customerapi.

| File | What it is |
| --- | --- |
| `apiDefinition.swagger.json` | The connector's one operation, `GetConsumption`, and its error codes |
| `apiProperties.json` | Entra ID OAuth settings. Every ID and the secret come from environment variables. |
| `apim-policy.xml` | The API-level policy for the proxy, which does the whole sync |

Nothing here is a secret. The refresh tokens, the client secret, tenant and app IDs and the host
live in Key Vault, API Management named values and Power Platform environment variables.

## The answer

`GET /eloverblik/companies/{cvr}/consumption?from=2025-01-01&to=2026-01-01` returns the
company's consumption metering points (`E17`) with their addresses, one entry per point and month
with `unit`, `start`, `end` and `points[].quantity` / `quality` as Eloverblik sends them (the
quantity is text), and `errors[]` for points Eloverblik refused. The app parses and sums.

| Status | `error` | Meaning for the app |
| --- | --- | --- |
| 400 | `bad-request` | CVR not 8 digits, dates not `YYYY-MM-DD`, `from` not before `to`, or more than 730 days |
| 403 | `token-invalid` | The company's token is invalid, inactive or expired: create a new one |
| 404 | `token-missing` | No token stored for this CVR |
| 422 | `too-many-metering-points` | More than 50 consumption points; the policy needs another batch |
| 429 | `sync-running` | Another sync is running; retry shortly |
| 502 | `datahub-error`, `key-vault-error` | Something unexpected upstream |
| 503 | `datahub-busy` | Eloverblik is rate-limited or overloaded; wait 60 seconds (`Retry-After`) |

## Creating a company's token

Done once a year per company, by someone who may act for it on eloverblik.dk.

1. Log in at https://eloverblik.dk as the company, with MitID Erhverv.
2. Check that the company's metering points are linked. Points that aren't linked aren't returned.
3. Create a token for the Customer API (*Datadeling*, then create token). Copy it: it's shown once.
   Note its expiry date.
4. Store it in Key Vault as `eloverblik-<cvr>`, without it passing through chat, email or a file:

   ```bash
   read -s ELO_TOKEN && az keyvault secret set --vault-name <vault> --name eloverblik-<cvr> --value "$ELO_TOKEN" --expires <expiry, e.g. 2027-11-10T00:00:00Z> >/dev/null && unset ELO_TOKEN
   ```

To check a token before storing it (one of Eloverblik's two token calls a minute):

```bash
read -s ELO_TOKEN && curl -s -H "Authorization: Bearer $ELO_TOKEN" https://api.eloverblik.dk/customerapi/api/token | jq -r 'if .result then "OK: access token received" else . end'; unset ELO_TOKEN
```

## Setting it up in an environment

Not done in any environment yet, and not automated. You need Owner on the Azure resource group,
Application Administrator in Entra ID, and System Administrator in the Power Platform environment.
It reuses the API Management instance and Key Vault from ADR 0009 (`connectors/motorapi/README.md`
in PR #46); if those don't exist yet, create them as described there (Consumption tier, Sweden
Central, tags and budget).

1. **Key Vault:** a secret `eloverblik-<cvr>` per company (above). Give API Management's
   system-assigned identity *Key Vault Secrets User* on the vault, if it doesn't have it already.
2. **Entra ID:**
   - register the proxy as an app with an Application ID URI and an app role `Electricity.Read`,
     and assign the role to the users or groups who may fetch consumption (see ADR 0010's open
     question on which companies a user may reach);
   - register the connector as a second app, with a delegated permission on the proxy and the
     redirect URL `https://global.consent.azure-apim.net/redirect`;
   - put the connector's client secret in Key Vault.
3. **API in API Management:**
   - add an API with URL suffix `eloverblik` and the one GET operation from
     `apiDefinition.swagger.json`;
   - add the named values listed at the top of `apim-policy.xml` (`tenant-id` may already exist);
   - set `apim-policy.xml` as the API's policy;
   - turn off subscription keys for the API, because Entra ID does the authentication.
4. **Power Platform**, in the HeartlandESG solution:
   - create environment variables `hlesg_EloverblikHost` (the API Management host),
     `hlesg_EloverblikAudience` and `hlesg_EloverblikConnectorClientId` as Text, and reuse
     `hlesg_TenantId`;
   - create `hlesg_EloverblikConnectorClientSecret` as Secret, backed by Key Vault
     ([docs](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets));
   - import the connector from these files, e.g. with `paconn create`, and validate it;
   - create a connection reference to it.
5. **The app** (not built yet): `pa app add data-source` for the connector, the
   `hlesg_maalepunkt` table and the new columns from ADR 0010, and the *Hent fra Eloverblik*
   action on Scope 2.

## Not verified yet

The policy hasn't run in API Management, and the following come from Eloverblik's Swagger, not
from a live call: the field names of the metering point list (`streetName`, `buildingNumber`),
that `E17` is the consumption type, whether `to` is exclusive, the unit value (expected `KWH`),
and the quality codes. Check them with the first real token, and check the OAuth settings in
`apiProperties.json` against what the portal generates on first import.
