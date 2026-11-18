# 26. An imported category 15 holding gets its sector factor from its business area

- **Status:** Accepted
- **Date:** 2026-11-18
- **Decided by:** @mortengad (tech lead), 2026-11-18, on a proposed matching of the cube's
  business areas to EXIOBASE sectors.

## Context

The data manual estimates a company without a climate account as the amount invested × an
industry-average factor for its sector (ADR 0022). Until now every imported holding waited for
the ESG owner to pick a factor by hand: 79 holdings in the July 2026 company table. That table
gives each company a **BusinessArea** in the cube (ADR 0025), such as Apparel, FinTech or SaaS,
which is the sector the manual's factor is for.

Three business areas carry most of the amount invested: Apparel 55 %, FinTech 22 % and
Farming & Forestry 8 %. The rest is 15 %.

## Decision

1. **A new holding gets the EXIOBASE sector factor of its business area**
   (`src/data/businessAreaFactors.ts`). Matching is case-insensitive. A re-import fills the
   factor in only if the holding has neither a chosen factor nor its own value. Every holding's
   factor can still be changed in the app.
2. **Companies that differ from their area are listed by OrganizationID:**
   - Apparel retailers (Zalando, About You, ASOS, SportsGroup Denmark) get *Retail trade*, and
     the brands keep *Wearing apparel*.
   - Grumeti and the Singita companies get *Hotel and restaurant services*.
   - Greenbeard Forestry gets *Forestry*.
3. **The region is Denmark, except for the largest holdings**, which use their home country:
   Zalando and About You (Germany), ASOS and Funding Circle (UK), Klarna (Sweden). Lunar is Danish.
4. **Where the sector isn't clear, no factor is set and it's chosen in the app.** That covers
   *Transportation* (the K/S and ApS partnerships, FreightSolution), Castleton, Saphire, and
   companies with no business area.
5. **The sectors are added to the factor table without values**, as the other EXIOBASE
   placeholders are: Retail trade (Germany, UK), Wearing apparel (Denmark), Financial
   intermediation (Denmark, Sweden, UK), Crops, Forestry, Other transport equipment, Wholesale
   trade, Research and development, Education, Real estate, Recreation and sport, and Electrical
   machinery. The ESG owner enters each value from EXIOBASE on the Faktorer page. They must not
   be guessed.

| Business area | Sector |
| --- | --- |
| Apparel | Wearing apparel (retailers: Retail trade) |
| FinTech, Finance, VCF | Financial intermediation |
| Farming & Forestry | Crops (exceptions above) |
| FMCG, Q-Commerce | Retail trade |
| SaaS | Computer and related services |
| Space | Other transport equipment |
| Discretionaries | Wholesale trade |
| Energy, Sustainability, ApparelTech | Research and development |
| Education | Education services |
| Real Estate | Real estate services |
| Lodging | Hotel and restaurant services |
| Sports | Recreational, cultural and sporting services |
| Furniture | Furniture |
| Appliances | Electrical machinery |
| Transportation, none | Chosen in the app |

## Options considered

- **One sector for all of Apparel (rejected).** Zalando, ASOS and SportsGroup are 8.4 bn of
  Apparel's 9.2 bn DKK, and they sell clothes rather than make them.
- **The investee's country for every holding (rejected for now).** The table has no country,
  and looking it up for 79 companies is work the ESG owner can do where it matters.
- **Keep the mapping in Dataverse so the ESG owner can edit it (not chosen now).** It would need
  a table and a page. The code is enough while the matching settles, and every holding can be
  changed in the app.

## Consequences

- In the July 2026 table, 55 of the 79 holdings get a factor and 24 are left to choose.
- None of the new sectors has a value yet, so those holdings show *Faktorens værdi mangler*
  until the ESG owner enters it. The total doesn't move until then.
- The new sectors are also offered for spend lines in category 1. Like the others, they have no
  value there until one is entered.
- A new company in the cube with a business area that isn't listed gets no factor until the
  mapping is extended.
