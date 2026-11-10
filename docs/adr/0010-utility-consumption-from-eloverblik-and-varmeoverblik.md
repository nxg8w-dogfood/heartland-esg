# 10. Utility consumption from Eloverblik and Varmeoverblik

- **Status:** Proposed
- **Date:** 2026-11-10
- **Decided by:** pending @mortengad (tech lead). See *Open questions*.
- **Builds on:** ADR 0006 (companies), ADR 0009 (the API Management pattern, PR #46)

## Context

Scope 2 is typed in by hand from bills: kWh of electricity and of district heating per location,
with a from and to date. Both are available from national hubs, per company:

### Electricity: Eloverblik

Every Danish electricity metering point's consumption is held in Energinet's DataHub, and a
company can read its own through **Eloverblik's Customer API** (`https://api.eloverblik.dk/customerapi`).
Read from its Swagger (`/customerapi/swagger/v1/swagger.json`) on 2026-11-10:

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

### District heating: Varmeoverblik

District heating utilities (Heartland's sites are supplied by Kredsløb and Silkeborg Varme) report
meter data to **Varmeoverblik** (`https://api.varmeoverblik.dk`). Read from its OpenAPI spec
(`/v3/api-docs`) and from test calls with Heartland's own token on 2026-11-10:

- **Two tokens again.** A refresh token is created in the varmeoverblik.dk web app.
  `GET /access-token/create` with `Authorization: Bearer <refresh token>` returns
  `{ "timeExpires": "<ISO UTC>", "token": "<JWT>" }`; the access token lasts 24 hours and is the
  Bearer token on `/api/*`. Going over a limit gives 429; the limits themselves aren't published.
- **Installation points.** `GET /api/installation-points/` returns the company's installations:
  `id` (a UUID), `type` (`forbrug`), `meters[].registers[]` (`id`, `type`, `unit`),
  `installationPlace.address` with `darId` (the address's UUID in DAR, Danmarks Adresseregister)
  and `utilityCompanyName`.
  - Observed: Kredsløb's two installations have data.
  - Observed: Silkeborg Varme's two entries have `id: null`, no meters and no address. The utility
    sends nothing, so they can't be read.
- **Readings.** `GET /api/metering-data/installation-point/{id}/register-type/energi?from=&to=&page=&size=`,
  with `from` and `to` both inclusive, in ISO UTC, and a zero-based `page`. The answer is
  `{ content: [{ timestamp, value }], page: { number, size, totalPages, totalElements } }`.
  - The `energi` register is in **MWh**. `f_energi`/`r_energi` (m³·°C) and `volumen` (m³) aren't
    energy and are ignored.
  - Observed: the values are **hourly cumulative meter readings**, not consumption per hour. Every
    timestamp appears **twice**, `size` was ignored (100 per page regardless), and values carry
    float noise (`344.48990000000003`).
  - A `/changes` variant filters by update time, for incremental syncs later.
- **Fuel mix.** `GET /api/fuel-distribution/ownerId/{ownerId}/values` returns a utility's fuel
  mix. What `ownerId` is isn't documented.
- Sharing agreements and webhooks exist for third parties; they aren't needed here.

So a month's heat is a **difference of two readings**: the reading at the start of the next month
minus the reading at the start of the month, with months in Danish local time (October 2026 runs
from 2026-09-30T22:00Z to 2026-10-31T23:00Z).

## Decision

### Shared

1. **The companies' own tokens.** Each company in the group (ADR 0006) creates its own refresh
   token on eloverblik.dk and on varmeoverblik.dk. They're **Key Vault secrets** named
   `eloverblik-<cvr>` and `varmeoverblik-<cvr>`, and are never typed into the app, the repository
   or chat. itm8 doesn't register as a third party (see *Rejected options*).
2. **Behind the same API Management instance as ADR 0009** (Consumption tier, Sweden Central),
   with one custom connector per source using Entra ID OAuth. The policies accept only Entra ID
   tokens from the connector's app registration, with the proxy as audience, and remove the
   user's token before anything goes on.
3. **One app role for both, `Consumption.Read`.** Both sources hold the same kind of data (a
   company's utility consumption for Scope 2), the same people fetch it, and the open question
   below about per-company access is the same for both. Two roles would mean two assignments to
   keep in step for no gain. MotorAPI keeps its own role, because looking up plates is a different
   permission.
4. **One composite operation per source, so one token call per sync.** The Consumption tier has
   no built-in cache ([caching](https://learn.microsoft.com/azure/api-management/api-management-howto-cache))
   and no `rate-limit-by-key`, so access tokens can't be kept between requests without paying for
   an external Redis. Each operation fetches a token, does the whole sync and returns a compact
   answer.

### Electricity: Eloverblik (`connectors/eloverblik/`)

5. **The policy does it all.** `GET /eloverblik/companies/{cvr}/consumption?from=YYYY-MM-DD&to=YYYY-MM-DD`
   reads `eloverblik-<cvr>` from Key Vault with API Management's managed identity (`send-request`
   with `authentication-managed-identity`; a named value can't be chosen at run time), gets an
   access token, lists the linked consumption metering points (`typeOfMP` `E17`), and asks for
   monthly time series in batches of 10 points (at most 5 batches, so 50 points per company).
   It returns per point its address, and per month the quantity, unit and quality, plus any
   per-point errors. The app does the arithmetic, so the policy only reshapes.
   - The CVR must be 8 digits, the dates `YYYY-MM-DD`, `from` before `to`, at most 730 days apart.
   - `limit-concurrency` lets only one sync run at a time. Eloverblik's 429 and 503 come back as
     503 with `Retry-After: 60` and `"error": "datahub-busy"`.
   - A missing secret gives 404 `token-missing`; a refused or expired token gives 403
     `token-invalid`, which the app shows as "Eloverblik-token mangler eller er udløbet".

### District heating: Varmeoverblik (`connectors/varmeoverblik/`)

6. **A policy can't do this one, so a small Azure Function does.** Monthly heat needs, per
   installation, a reading at every month boundary: for a year and two installations that's 26
   reading requests, each paged, deduplicated and compared. API Management policies have no
   loops; the number of `send-request` calls is fixed when the policy is written. So:
   - **API Management** keeps the parts it's good at: it checks the Entra token and the role,
     validates the parameters, and forwards
     `GET /varmeoverblik/companies/{cvr}/consumption?from=YYYY-MM&to=YYYY-MM` (months inclusive,
     at most 24) to the Function, authenticating with its managed identity.
   - **An Azure Function** (TypeScript, Flex Consumption plan, Sweden Central) accepts only API
     Management's identity (App Service authentication). It reads `varmeoverblik-<cvr>` from Key
     Vault with its own managed identity, keeps the access token in memory until five minutes
     before `timeExpires`, and does the sync below. Its code, its tests and its deploy workflow
     come in a later PR, under `functions/varmeoverblik/`, built and tested in CI like the app.
7. **How the Function works out a month:**
   - It lists the installation points. Entries without an `id` or without an `energi` register
     are returned as `skipped` with reason `no-data-from-utility`.
   - For each installation and each month boundary (local midnight on the 1st,
     Europe/Copenhagen, converted to UTC), it reads a two-hour window from the boundary, goes
     through every page, removes duplicate timestamps and takes the **earliest reading at or after
     the boundary**.
   - If the window is empty, it widens to 48 hours each side, interpolates linearly between the
     nearest readings before and after, and marks the month **estimated**. With nothing within
     48 hours the month is left out with the flag `no-reading`.
   - Month = next boundary's reading − this boundary's reading, rounded to 4 decimals in MWh, and
     also given in kWh. A **negative** month means a meter change or reset: the value is left out
     and the month flagged `meter-reset` for manual entry.
   - Requests go one at a time. A 429 is retried after the `Retry-After` time (or 60 seconds), at
     most three times, and then the sync stops with 503 `datahub-busy`.
   - It returns per installation and month `installationPointId`, `darId`, `address`,
     `utilityCompanyName`, `month`, `mwh`, `kwh`, `estimated` and `flags`, plus `skipped`.
8. **Mapping to locations by address.** Each installation has a DAR address id, so a location gets
   `hlesg_darid`, and installations are matched to locations by it. Unmatched installations are
   shown so they can be mapped by hand.

### In the app (not built in this PR)

9. **On Scope 2, *Hent fra Eloverblik* and *Hent fra Varmeoverblik*** for a company and period.
   - Electricity: a new table `hlesg_maalepunkt` (18-digit id, the location, the company) maps
     metering points to locations.
   - Heating: matched by `hlesg_darid` on the location.
   - One line per meter and month (`hlesg_dato`/`hlesg_tildato`, `hlesg_maengde` in kWh,
     `hlesg_energiart` El or Fjernvarme), marked with a new `hlesg_kilde` (Eloverblik or
     Varmeoverblik) and the meter's id. Fetching the same months again replaces those lines;
     hand-typed lines are never touched. Estimated months are flagged, as elsewhere.
   - The company table gets `hlesg_cvr`, which the app passes to the connectors, and the expiry
     date of each token, so the app can warn 30 days before.
   None of these columns or tables are applied to any environment yet.
10. **Yearly renewal by the company's Ansvarlig.** An admin replaces the Key Vault secret with the
    new token, with its expiry date set on the secret.

## Consequences

- **More one-off setup per environment**, by an admin (each connector's README lists it): Key
  Vault secrets per company and source, the two APIs in API Management with their policies and
  named values, *Key Vault Secrets User* for API Management's and the Function's identities, two
  connector app registrations, one proxy app registration with `Consumption.Read`, and the
  connectors with their environment variables.
- **Our first server-side code.** The Function is code we deploy, patch and monitor. Up to now
  everything server-side has been configuration. It needs a deploy workflow per environment, a
  storage account for the Flex Consumption plan, tags, and a budget with alerts at 50/80/100 %.
  Its cost at a few syncs a year is close to nothing.
- **A person's tokens.** Each refresh token is created by a named person at the company. If that
  person's access ends, the token may stop working; someone else then creates a new one.
- **Eloverblik metering points must be linked** on eloverblik.dk when the token is created.
- **Some utilities send nothing.** Silkeborg Varme's installations have no data in Varmeoverblik,
  so those sites stay on bills until the utility reports. The app says which.
- **Heat from readings is only as good as the readings.** Gaps give estimated months, and meter
  changes need a hand-entered month.
- **Limits.** 50 electricity metering points per company. One Eloverblik sync at a time; its
  per-IP limits are shared with other tenants on the Consumption tier's outbound IPs. Varmeoverblik
  publishes no limits, so the Function is deliberately slow.

## Rejected options

- **The third-party APIs with a power of attorney (fuldmagt).** Both hubs have them. They suit a
  product that serves many customers; here each company's own token is simpler and needs no
  registration.
- **Caching access tokens in API Management.** Needs an external Redis on Consumption, or a move
  to Basic v2. Neither is worth it for a yearly sync, and caching alone wouldn't make the heating
  sync possible in a policy.
- **Varmeoverblik in a policy, unrolled.** Writing one `send-request` per boundary and installation
  fixes the number of months and installations in the policy, and paging still can't be done.
  Looping with the `retry` policy is possible but unreadable and hard to test.
- **Varmeoverblik with the app doing the loop.** A pass-through operation per reading would make
  the proxy fetch a new access token on every call (no cache), with unknown limits, and put the
  boundary logic in the browser where the server can't vouch for it.
- **Reading a whole year of hourly data and summing.** About 17,500 rows (8,760 hours, doubled)
  per installation per year, or 175 pages, to get 13 numbers.
- **Uploading the CSV exports.** Works without any Azure setup, and is a fair fallback, but means
  a manual download per company and source each year.
- **An Azure Function for Eloverblik too.** Not needed: the policy can do Eloverblik, because its
  API returns monthly sums. If the Function proves itself, moving Eloverblik into it is an option.

## Open questions

- **Who may fetch which company's data?** API Management can't see Dataverse business units, so
  `Consumption.Read` reaches every company's meter data. *Options:* give the role only to
  Koncern – Ansvarlig, or one app role per CVR. Not decided.
- **To verify against the live APIs:**
  - Eloverblik: the refresh token's maximum validity, whether `dateTo` is exclusive, the unit
    value, the quality codes, and that `E17` is the consumption type.
  - Varmeoverblik: the refresh token's validity and the rate limits.
- **More than 50 electricity metering points** for a company: not expected, to confirm per company.

## Follow-ups

- **A supplier-specific heat factor.** Varmeoverblik's fuel mix could give each utility's own
  emission factor instead of the national average. What `ownerId` is has to be found first.
- **Incremental heat syncs** with the `/changes` endpoint, if syncing more often than yearly.
