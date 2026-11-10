# 9. A car register with plate lookup through MotorAPI, behind API Management

- **Status:** Proposed
- **Date:** 2026-11-10
- **Decided by:** @mortengad (tech lead), 2026-11-10: the data source, how Scope 1 uses a car,
  the range field, the API Management proxy, and who may register cars.

## Context

Scope 1's mobile combustion is entered in litres per fuel, "Firmabiler – diesel" and "Firmabiler –
benzin", as in the original app (`reference/heartland-klimaregnskab-app.html`). The original has no
register of cars and no plate lookup. Many companies don't have fuel-card data for every car,
but they do know how far each car drove. Every Danish car's type-approval fuel economy (km/l,
under WLTP for cars approved after 1 September 2017) is held in Motorregistret (DMR), which
Motorstyrelsen runs.

Motorstyrelsen offers no public lookup API. It publishes a free statistics extract over FTP,
weekly and about 75 GB of XML, marked "not for business-critical processes". Third-party APIs
sit on top of that extract. Researched on 2026-11-10:

| | MotorAPI (motorapi.dk) | Synsbasen (api.synsbasen.dk) | DMR extract, self-hosted |
| --- | --- | --- | --- |
| km/l | `fuel_usage` / `total_usage` | `fuel_efficiency` | `MotorKmPerLiter` (per third-party docs) |
| Says WLTP or NEDC | Yes, `measurement_norm` | No | Not found |
| Electric range | No (Wh/km only) | Yes, `electric_range` | Not found |
| Price | 100 free lookups a day, then 0.02–0.15 kr | From 150 kr/month for 500 | Free, plus hosting and parsing 75 GB a week |
| Data processing | DPA published; Hetzner, Germany (backup in Finland) | "Hosted in the EU"; no DPA published | Our own |
| Auth | `X-AUTH-TOKEN` header | Bearer token | — |

Sources: https://v1.motorapi.dk/doc/, https://www.motorapi.dk/databehandleraftale,
https://api.synsbasen.dk/v1/docs, https://motorst.dk/erhverv/motorregistret-for-virksomheder/faa-adgang-til-motorregistret/andre-adgange.

Only technical vehicle data is looked up. Neither the owner nor any other personal data is
requested or stored.

## Decision

1. **Data source: MotorAPI.** It's the only source that says which test cycle (WLTP or NEDC) a
   figure comes from. It publishes a DPA with EU hosting, and the free daily allowance covers a
   company's car register. Its weekly data and the lack of electric range don't matter here:
   only diesel and petrol cars are registered.
2. **The key stays on the server, in API Management.** A code app reaches external APIs only
   through Power Platform connectors
   ([connect to data](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data)).
   A plain custom connector with API-key authentication won't keep the key hidden, because every
   user creates their own connection to a custom connector
   ([share resources](https://learn.microsoft.com/power-apps/maker/canvas-apps/share-app-resources#custom-connectors)),
   and so every user would type in the key. Key Vault environment variables work only in a
   connector's OAuth fields, not in headers or policies
   ([environment variables in custom connectors](https://learn.microsoft.com/connectors/custom-connectors/environment-variables)).
   So:
   - An **Azure API Management** instance, **Consumption tier**, in an EU region (Sweden Central,
     the region ADR 0002 uses), proxies the two MotorAPI calls the app needs:
     `GET /vehicles/{plate}` and `GET /vehicles/{plate}/environment`. Nothing else is exposed.
   - The MotorAPI token is a **Key Vault secret**. API Management reads it as a Key Vault named
     value through its managed identity
     ([named values](https://learn.microsoft.com/azure/api-management/api-management-howto-properties)),
     and the policy (`connectors/motorapi/apim-policy.xml`) sets it as `X-AUTH-TOKEN`.
   - **Authorisation is checked on the server.** The policy accepts only Entra ID tokens from the
     connector's app registration, with the proxy as audience and an app role for plate lookup
     ([validate-azure-ad-token](https://learn.microsoft.com/azure/api-management/validate-azure-ad-token-policy)).
     The user's token is removed before the call goes on to MotorAPI.
   - The **custom connector** (`connectors/motorapi/`) uses Entra ID OAuth. Its client secret is
     a Secret environment variable backed by Key Vault, which is the documented case. The host
     and IDs are environment variables, so dev, test and prod each have their own.
   - The app calls the connector's generated service through `src/vehicles/connectorLookup.ts`.
     The browser never sees the key, and the repository holds no key, secret or tenant-specific
     ID.
3. **A car register per company.** It's a new page, *Bilpark*, holding plate, make, model,
   variant, fuel, first registration, km/l, CO2 g/km, test cycle and source. It's stored in a new
   Dataverse table, `hlesg_koeretoej` (parent: the company). Electric cars and plug-in hybrids are
   refused, because their km can't be turned into litres of fuel.
4. **Scope 1 lines can name a car and be entered in km.** Fuel-card litres stay the preferred
   input. A line without them can be entered as km driven for a registered car, and is converted
   as litres = km ÷ the car's km/l. Such a line is marked as an estimate. The line keeps the km
   and the car (`hlesg_linje.hlesg_km`, `hlesg_koeretoejid`). Litres are always worked out from
   the car's current km/l, never stored, so correcting a car corrects its lines. The litres also
   feed Scope 3 category 3 (well-to-tank).
5. **Range is optional and entered by hand.** No source gives a range for diesel or petrol cars.
   It isn't used in any calculation.
6. **Contributors register cars.** *Bidragyder* and *Ansvarlig* may create, change and delete
   their company's cars, as for lines, because whoever enters the driving also knows the
   cars (decided 2026-11-10). A car in use by a line can't be deleted in the app, and Dataverse
   enforces it too: `hlesg_linje.hlesg_koeretoejid` is Restrict on delete.
7. **Without the connector, the page still works.** Cars can be entered by hand. `npm run dev` in
   a plain browser answers lookups with clearly labelled example data (`src/vehicles/exampleLookup.ts`),
   which isn't in the production build.

## Consequences

- **A new Azure resource.** Per the cost policy, it needs a budget with alerts at 50/80/100 %, and
  owner, project and environment tags. The Consumption tier bills per call. The first million
  calls a month are free, which a car register won't come near.
- **Setup per environment, as code.** `infra/motorapi/main.bicep` creates:
  - API Management, with its policy and named values;
  - read access to the one Key Vault secret;
  - both Entra app registrations, with the lookup role and admin consent;
  - the budget.

  An admin runs it, because the pipeline has no Azure credentials yet (PR #32). Still done by
  hand:
  - putting the key and the connector's client secret in Key Vault;
  - importing the connector and its environment variables;
  - running `pa app add data-source` and wiring `connectorLookup` in `App.tsx`.

  `connectors/motorapi/README.md` lists the steps. Until they're done, the app inside Power Apps
  offers manual entry only.
- **A contributor can change a car's km/l, which changes the litres of every km line for it.**
  The register shows where each car's figures came from (looked up, or entered by hand). The
  audit flag on the table (ADR 0005) records who changed what.
- **Estimates are weaker data.** WLTP figures understate real consumption, and NEDC figures (older
  cars) even more, so the page says so, and lines entered in km are counted and flagged.
- **MotorAPI's limit is 100 lookups a day on the free plan.** Going over returns 403, which the
  app explains. A paid plan is needed only if many cars are registered on the same day.
- **A dependency on a small third-party service.** If MotorAPI goes away, the register keeps
  working with manual entry, and the API Management proxy can point at another source.

## Rejected options

- **Synsbasen.** It has electric range, but doesn't say whether figures are WLTP or NEDC. It has
  no published DPA, and it costs from the first lookup.
- **Self-hosting the DMR extract.** It's free, but means 75 GB of XML a week to download, parse
  and host. It's marked not for business-critical use, and has no confirmed WLTP field.
- **A custom connector with an API key.** Every user would have to type in the key (see 2).
- **An Azure Function proxy.** It gives more control (caching, logging), but is our own code to
  deploy, patch and monitor. API Management does the same job with configuration only.
- **Reference only (a car on a line, but litres still required).** It would leave the WLTP data
  unused and give companies without fuel cards no way to enter mobile combustion.
