# 11. For now, the app fetches electricity and heating consumption itself

- **Status:** Proposed
- **Date:** 2026-11-10
- **Decided by:** @mortengad (tech lead), 2026-11-10: the app calls Eloverblik and Varmeoverblik
  directly for now, instead of going through API Management first. How tokens are handled (below)
  still needs confirming.

## Context

ADR 0010 (draft PR #48) puts both utility APIs behind Azure API Management. In that design the
refresh tokens sit in Key Vault and an Azure Function works out heating per month. None of it
exists in any environment yet. Heartland wants Scope 2 consumption in the app now.

Both APIs work the same way. A long-lived **refresh token**, created by the company on
eloverblik.dk or varmeoverblik.dk, is exchanged for a short-lived **access token**, which is
valid for 24 hours. Both APIs allow calls from a browser on another site (CORS
`Access-Control-Allow-Origin: *`, checked 2026-11-10). Each API checks the token itself: it
only returns meters that the token's owner has access to.

A code app enforces a Content Security Policy, and its default `connect-src` is `'none'`
([code apps CSP](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy)).
Inside Power Apps, the browser therefore blocks both APIs until an environment admin allows them.

## Decision

1. **The app calls both APIs from the browser.** It does this on the Scope 2 page, under *Hent
   forbrug fra Eloverblik og Varmeoverblik* (`src/scope2/UtilityImport.tsx`, `src/utility/`).
2. **Tokens are pasted per session and never stored.** The person fetching pastes the refresh
   token into a password field, which the browser doesn't save. It is kept in the component's
   memory only and is cleared as soon as the fetch finishes. It isn't written to Dataverse, environment
   variables, local storage or the repository. Storing it in any of those would hand one
   company's token to every user of the app, and the project keeps secrets in Key Vault only.
3. **Authorisation stays on the server.** Eloverblik and Varmeoverblik decide which meters a
   token may read. Dataverse security roles decide who may add Scope 2 lines (ADR 0005). The app
   adds no permission check of its own. Because whoever fetches must hold the company's own
   token, ADR 0010's open question (one app role reaching every company) doesn't arise here.
4. **Monthly lines, in Danish local time.**
   - *Electricity:* the Eloverblik `Month` aggregation, consumption metering points (`E17`)
     only. Requests go in batches of 10 metering points and at most 12 months at a time.
   - *Heating:* Varmeoverblik's `energi` register is an hourly meter reading in MWh. A month's
     consumption is the reading at local midnight starting the next month, minus the reading at
     local midnight starting this month. Only readings around each month boundary are fetched,
     so a year takes 13 small requests per installation. Repeated timestamps (the API returns
     each one twice) are dropped.
   - A boundary without an exact reading is interpolated, and the line says it is an estimate.
   - A month with no readings, or one where the meter went backwards, isn't imported. The user
     is told to enter it by hand.
   - Only months that have ended are fetched.
5. **Imports don't double-count silently.**
   - Each meter's lines carry its source in the description (`Eloverblik · <metering point> ·
     <address>`, `Varmeoverblik · <utility> · <address>`). Fetching again skips months already
     imported for that meter.
   - If another line for the same location and type covers part of a month, such as a yearly
     bill typed in by hand, the month is still imported, and the user is told to check it. Other meters' fetched lines
     don't count as overlaps, because one location often has several meters.
   - The user picks a location for each meter. A meter without a location is skipped.
6. **Inside Power Apps, an admin must allow the two hosts.** `https://api.eloverblik.dk` and
   `https://api.varmeoverblik.dk` are added to `connect-src` in the environment's code-app CSP
   (Power Platform admin center, or the REST API in the link above). Until then the app says the
   connection was blocked and names the setting. `npm run dev` in a plain browser has no such
   policy.

## Consequences

- **A token reaches the browser of the person fetching**, and no one else's. During the session,
  browser extensions or a script injected into the page could read it. CSP limits script sources,
  and the code app's own code is the only script on the page. Varmeoverblik has no way to revoke
  an access token, so a leaked token works until it expires (24 hours).
- **Fetching is manual and per person.** It suits a yearly or monthly import by the *Ansvarlig*.
  It isn't a scheduled sync.
- **Rate limits are the user's to wait out.** Eloverblik allows 2 token calls a minute per IP and
  120 calls a minute in total. A 429 or 503 shows "vent et minut".
- **The environment CSP change applies to every code app in the environment**, not only this one.
- **No new Azure resources**, so no new cost.
- **Checked against the live APIs on 2026-11-10:** Eloverblik for 2025 returned 7 metering
  points with monthly kWh (unit `KWH`, one `Period` per month), including a point without data
  (error 30018) and one with only part of the year.
- **Not yet verified against the live APIs:**
  - a full Varmeoverblik fetch through the app;
  - the 48-hour fallback when a heating meter has a gap;
  - the CSP change inside Power Apps.

  The heating maths was checked against readings from Varmeoverblik on 2026-11-10.

## Rejected options

- **Store the token in Dataverse or app settings.** It's simpler for users, but it puts the
  token in every user's browser and breaks the rule that secrets live in Key Vault.
- **A custom connector, with the token on each user's connection.** It keeps the token out of the
  browser after setup, but means a connector to import and maintain per environment now.
  Revisit it if fetching becomes routine for many users.
- **Wait for ADR 0010.** It's the better long-term design (Key Vault, scheduled sync, no token in
  the browser), but nothing in Azure is set up yet. This ADR doesn't replace ADR 0010. When the
  proxy exists, the import UI can call it instead and the token fields go away.

## Open questions

- **Confirm that pasting the token per session is acceptable** under the brief's secrets
  control. The alternative is to wait for ADR 0010.
- **Who may fetch?** Anyone who can add Scope 2 lines and holds a token. *Proposed:* fine for now,
  because the token is the real gate.
