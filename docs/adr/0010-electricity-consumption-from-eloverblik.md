# 10. Electricity consumption from Eloverblik, behind API Management

- **Status:** Proposed
- **Date:** 2026-11-10
- **Decided by:** pending @mortengad (tech lead). See *Open questions*.
- **Builds on:** ADR 0006 (companies), ADR 0009 (the API Management pattern, PR #46)

## Context

Scope 2 electricity is typed in by hand from bills: kWh per location, with a from and to date.
Every Danish metering point's consumption is held in Energinet's DataHub, and a company can read
its own through **Eloverblik's Customer API** (`https://api.eloverblik.dk/customerapi`). Read from
its Swagger (`/customerapi/swagger/v1/swagger.json`) on 2026-11-10:

- **Two tokens.** Someone logs in at eloverblik.dk as the company (MitID Erhverv) and creates a
  **refresh token**. It carries that person's identity and the company's CVR. `GET /api/token`
  with `Authorization: Bearer <refresh token>` returns `{ "result": "<access token>" }`, which is
  valid for 24 hours and is used on every other call. The refresh token's maximum validity
  (believed to be one year) isn't stated in the Swagger and has to be checked in the portal.
- **Metering points.** `GET /api/meteringpoints/meteringpoints` lists the points linked to the
  token (`meteringPointId`, `typeOfMP`, address, `consumerCVR`, …). Only linked points can be read.
- **Time series.** `POST /api/meterdata/gettimeseries/{dateFrom}/{dateTo}/{aggregation}`, dates as
  `YYYY-MM-DD`, aggregation `Actual|Quarter|Hour|Day|Month|Year`, body
  `{ "meteringPoints": { "meteringPoint": ["<18 digits>", …] } }`. The answer is one
  `MyEnergyData_MarketDocument` per point, with `TimeSeries[].Period[].Point[]` holding
  `out_Quantity.quantity` (a string) and `out_Quantity.quality`, and the unit in
  `measurement_Unit.name`. Data covers the five previous years and the current one.
- **Limits.** `GetToken` 2 calls a minute per IP address; 120 calls a minute per IP; 1,200 a
  minute for all users together; at most 730 days per time-series request. Going over gives
  429; an overloaded DataHub gives 503. Both mean: wait a minute. Energinet advises about 10
  metering points per request.
- **Errors** come per point inside a 200 answer (`success`, `errorCode`, `errorText`), e.g. 50001
  (refresh token invalid or inactive), 30010/30016/40014 (no or expired authorisation).

Not confirmed in the Swagger: whether `dateTo` is exclusive, the unit's value (expected `KWH`),
the quality codes, and the refresh token's maximum validity.

## Decision

1. **The Customer API, with one refresh token per company.** Each company in the group (ADR 0006)
   has its own CVR, so each creates its own token on eloverblik.dk and links its metering points
   there. itm8 doesn't act as a registered third party (see *Rejected options*).
2. **Tokens stay on the server, as in ADR 0009.** The refresh tokens are **Key Vault secrets**
   named `eloverblik-<cvr>`. The app calls a custom connector with Entra ID OAuth. The connector
   calls the **same API Management instance** as MotorAPI (Consumption tier, Sweden Central). The
   policy (`connectors/eloverblik/apim-policy.xml`):
   - accepts only Entra ID tokens from the connector's app registration, with the proxy as
     audience and the app role `Electricity.Read`, and removes the user's token;
   - reads `eloverblik-<cvr>` from Key Vault through API Management's managed identity
     (`send-request` with `authentication-managed-identity`). A named value can't be chosen at
     run time, so a Key Vault named value per company won't do.
3. **One composite operation, so one token call per sync.** API Management's Consumption tier has
   no built-in cache
   ([caching](https://learn.microsoft.com/azure/api-management/api-management-howto-cache)), so the
   24-hour access token can't be kept between requests without paying for an external Redis.
   Instead the proxy exposes only
   `GET /eloverblik/companies/{cvr}/consumption?from=YYYY-MM-DD&to=YYYY-MM-DD`. In one request it
   gets an access token, lists the linked consumption metering points (`typeOfMP` `E17`), and asks
   for monthly time series in batches of 10 points (at most 5 batches, so 50 points per company).
   It returns a compact answer: per point its address, and per month the quantity, unit and
   quality, plus any per-point errors. The app does the arithmetic, so the policy only reshapes.
   - The CVR must be 8 digits, the dates `YYYY-MM-DD`, `from` before `to`, at most 730 days apart.
   - `rate-limit-by-key` isn't available on Consumption, so `limit-concurrency` lets only one sync
     run at a time. Eloverblik's 429 and 503 come back as 503 with `Retry-After: 60` and
     `"error": "datahub-busy"`, and the app waits before offering a retry.
   - A missing secret gives 404 `token-missing`; a refused or expired token gives 403
     `token-invalid`, which the app shows as "Eloverblik-token mangler eller er udløbet".
4. **In the app (not built in this PR).** On Scope 2, an action *Hent fra Eloverblik* for a
   company and period:
   - A location gets its metering points through a new table `hlesg_maalepunkt` (18-digit
     id, the location, the company); points not mapped to a location are shown so they can be
     mapped.
   - It creates one electricity line per point and month (`hlesg_dato`/`hlesg_tildato` from the
     period, `hlesg_maengde` in kWh). The lines are marked with a new `hlesg_kilde` = Eloverblik
     and the metering point id. Fetching the same months again replaces those lines instead of
     adding to them; hand-typed lines are never touched.
   - Months whose quality isn't measured are flagged, as estimates are elsewhere.
   - The company table gets `hlesg_cvr`, which the app passes to the connector.
   None of these columns or tables are applied to any environment yet.
5. **Yearly renewal by the company's Ansvarlig.** The token's expiry date is recorded on the
   company (`hlesg_eloverbliktokenudloeb`), the app warns 30 days before, and an admin replaces the
   Key Vault secret. The token is never typed into the app.

## Consequences

- **More one-off setup per environment**, by an admin (listed in `connectors/eloverblik/README.md`):
  a Key Vault secret per company, the API in API Management with its policy and named values,
  *Key Vault Secrets User* for API Management's identity on the vault, two Entra app registrations
  and the `Electricity.Read` role, and the connector with its environment variables.
- **Little extra cost.** It reuses ADR 0009's API Management instance and Key Vault. A yearly sync
  of a company is a handful of calls.
- **A person's token.** The refresh token is created by a named person at the company. If that
  person's MitID Erhverv access ends, the token may stop working; someone else then creates a new
  one.
- **Metering points must be linked on eloverblik.dk** when the token is created. Points that
  aren't linked aren't returned.
- **50 points per company.** A company with more would need another batch in the policy, or a
  narrower request; the proxy says so instead of silently leaving points out.
- **Only one sync at a time** across all companies, and Eloverblik's per-IP limits are shared
  with other tenants on the Consumption tier's outbound IPs, so an occasional 503 is expected.

## Rejected options

- **The Third-party API with a power of attorney (fuldmagt).** itm8 or Heartland would register as
  a third party and each company would grant access. It suits a product that serves many
  customers; here each company's own token is simpler and needs no registration.
- **Caching the access token in API Management.** Needs an external Redis on Consumption, or a
  move to Basic v2. Neither is worth it for a yearly sync.
- **Pass-through operations (token, list, time series) called by the app.** The access token
  would reach the browser, and each sync would cost more `GetToken` calls than the limit of two a
  minute allows.
- **Uploading the CSV export from eloverblik.dk.** Works without any Azure setup, and is a fair
  fallback, but means a manual download per company each year.
- **An Azure Function.** More control (cache, retries) but our own code to deploy and patch, as in
  ADR 0009.

## Open questions

- **Who may fetch which company's data?** API Management can't see Dataverse business units, so
  `Electricity.Read` reaches every company's metering data. *Options:* give the role only to
  Koncern – Ansvarlig, or one app role per CVR. Not decided.
- **To verify against the live API:** the refresh token's maximum validity, whether `dateTo` is
  exclusive, the unit value, the quality codes, and that `E17` is the right filter for
  consumption.
- **More than 50 metering points** for a company: not expected, to confirm per company.
