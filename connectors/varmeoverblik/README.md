# Varmeoverblik connector

Monthly district heating consumption for Scope 2, per company (ADR 0010).

How a call travels:

1. The app calls a custom connector, which signs the user in with Entra ID.
2. The connector calls an Azure API Management proxy. The proxy checks the token, the role and
   the parameters.
3. The proxy forwards the call to an Azure Function, signing in with its managed identity.
4. The Function reads the company's Varmeoverblik refresh token from Key Vault and gets an access
   token.
5. It lists the company's installation points and reads the meter at each month boundary from
   https://api.varmeoverblik.dk.

The Function exists because the readings are cumulative: a month is the difference between two
readings, and that takes loops and paging a policy can't do.

| File | What it is |
| --- | --- |
| `apiDefinition.swagger.json` | The connector's one operation, `GetHeatConsumption`, and its error codes |
| `apiProperties.json` | Entra ID OAuth settings. Every ID and the secret come from environment variables. |
| `apim-policy.xml` | The API-level policy for the proxy: checks, then forwards to the Function |

The Function itself isn't in this repository yet. It comes in a later PR under
`functions/varmeoverblik/`, with tests for the month logic and its own deploy workflow.

Nothing here is a secret. The refresh tokens, the client secret, tenant and app IDs and the hosts
live in Key Vault, API Management named values and Power Platform environment variables.

## The answer

`GET /varmeoverblik/companies/{cvr}/consumption?from=2025-01&to=2025-12` returns one entry per
installation and month, for example:

```json
{
  "installationPointId": "3f2b8c1e-0000-4000-8000-000000000001",
  "darId": "0a3f50a0-0000-4000-8000-000000000002",
  "address": "Eksempelvej 1, 8000 Aarhus C",
  "utilityCompanyName": "Kredsløb",
  "month": "2025-10",
  "mwh": 6.3121,
  "kwh": 6312.1,
  "estimated": false,
  "flags": []
}
```

It also returns `skipped` for installation points the utility sends no data for, such as
entries without an id or without an `energi` register.

How a month is worked out (ADR 0010, section 7):

- **Boundaries:** the reading at local midnight on the 1st (Europe/Copenhagen) of the next month,
  minus the one for this month. For October 2026 that's 2026-09-30T22:00Z to 2026-10-31T23:00Z.
- **Readings:** the `energi` register, in MWh. Duplicate timestamps are removed, every page is
  read, and values are rounded to 4 decimals.
- **Gaps:** a missing boundary reading is interpolated from the nearest readings within 48 hours,
  and the month is marked `estimated`. With nothing nearby, the month is flagged `no-reading`.
- **Meter changes:** a negative month means the meter was changed or reset. It's flagged
  `meter-reset` for manual entry.

| Status | `error` | Meaning for the app |
| --- | --- | --- |
| 400 | `bad-request` | CVR not 8 digits, months not `YYYY-MM`, `from` after `to`, or more than 24 months |
| 403 | `token-invalid` | The company's token is invalid or expired: create a new one |
| 404 | `token-missing` | No token stored for this CVR |
| 429 | `sync-running` | Another sync is running; retry shortly |
| 502 | `datahub-error` | Something unexpected upstream |
| 503 | `datahub-busy` | Varmeoverblik kept rate-limiting; retry later |

## Creating a company's token

Done once a year per company, by someone who may act for it on varmeoverblik.dk.

1. Log in at https://varmeoverblik.dk as the company and create a token for the API. Copy it,
   and note its expiry date.
2. Store it in Key Vault as `varmeoverblik-<cvr>`, without it passing through chat, email or a
   file:

   ```bash
   read -s VARME_TOKEN && az keyvault secret set --vault-name <vault> --name varmeoverblik-<cvr> --value "$VARME_TOKEN" --expires <expiry, e.g. 2027-11-10T00:00:00Z> >/dev/null && unset VARME_TOKEN
   ```

To check a token before storing it:

```bash
read -s VARME_TOKEN && curl -s -H "Authorization: Bearer $VARME_TOKEN" https://api.varmeoverblik.dk/access-token/create | jq -r 'if .token then "OK: access token until \(.timeExpires)" else . end'; unset VARME_TOKEN
```

## Setting it up in an environment

Not done in any environment yet, and not automated. You need the same rights as for the
Eloverblik connector (`connectors/eloverblik/README.md`). It shares that connector's API
Management instance, Key Vault, proxy app registration and `Consumption.Read` role.

1. **Key Vault:** a secret `varmeoverblik-<cvr>` per company (above).
2. **The Function** (from the later PR): a Flex Consumption Function app in Sweden Central.
   - Turn on its system-assigned identity, and give it *Key Vault Secrets User* on the vault.
   - Turn on App Service authentication with Entra ID, accepting only API Management's managed
     identity, with an Application ID URI for API Management to request.
   - Tag it `owner`, `project=heartland-esg` and `environment`, and cover it by the budget.
3. **Entra ID:** register the connector as an app, with a delegated permission on the shared proxy
   app and the redirect URL `https://global.consent.azure-apim.net/redirect`. Put its client
   secret in Key Vault.
4. **API in API Management:**
   - add an API with URL suffix `varmeoverblik` and the one GET operation from
     `apiDefinition.swagger.json`;
   - add the named values listed at the top of `apim-policy.xml`; `tenant-id`,
     `consumption-audience` and `consumption-user-role` already exist if Eloverblik is set up;
   - set `apim-policy.xml` as the API's policy;
   - turn off subscription keys for the API.
5. **Power Platform**, in the HeartlandESG solution:
   - create environment variables `hlesg_VarmeoverblikHost` and
     `hlesg_VarmeoverblikConnectorClientId` as Text, and reuse `hlesg_TenantId` and
     `hlesg_ConsumptionAudience`;
   - create `hlesg_VarmeoverblikConnectorClientSecret` as Secret, backed by Key Vault;
   - import the connector and create a connection reference.
6. **The app** (not built yet): the `hlesg_darid` column on locations and the *Hent fra
   Varmeoverblik* action on Scope 2 (ADR 0010).

## Not verified yet

- **From test calls on 2026-11-10:** the response shapes, units and duplicate timestamps. They
  can change without notice.
- **Not published:** Varmeoverblik's rate limits and the refresh token's validity.
- **Never run:** the policy, in API Management, and the Function, which isn't written yet.
