# 6. A group of companies, consolidated by equity share

- **Status:** Accepted. The app's model and the group summary on 2026-10-01; the Dataverse part
  (section 4) by @mortengad on 2026-10-06, together with ADR 0005.
- **Date:** 2026-10-01
- **Decided by:** @mortengad (tech lead), 2026-10-01
- **Changes:** ADR 0005's "one climate account per environment" (section 3)

## Context

Heartland wants climate accounts for several companies in the group, and a summary for the
group as a whole. ADR 0005 had one account per environment, with another company getting its
own environment. That can't give a group total, because no one place sees all the companies.

The GHG Protocol's Corporate Standard requires a group to choose one consolidation approach:
operational control, financial control or equity share. The choice decides how much of each
company counts.

## Decision

### 1. The group and its companies

- One environment holds **one group** with **any number of companies**. Each company has its own
  climate account: lines, locations, surveys, investments, ledger, relevance, and its own
  **factor sources** (decided 2026-10-01).
- The app shows one company at a time (a picker in the header), plus a **Koncern** page for the
  group.
- In the app this is `GroupData` (`src/storage/group.ts`, format version 3). Saved data and
  backups from versions 1 and 2 load as a group with one company.

### 2. Equity share

**The group total consolidates by equity share** (decided 2026-10-01): each company counts with
the group's ownership share in it.

- **Shares are recorded per company, by year.** A share applies from a year until the next
  change. A period is split into calendar years, and each year uses its own share. The
  calculations prorate by days, so the parts add up to the whole period exactly.
- **A year without a recorded share counts as 0 %, and the summary says so.** The share is never
  guessed. The parent company is entered at 100 %.
- **No double counting:** if a company's category 15 lists a holding in another group company,
  that holding is left out of the group total, because the other company already counts through
  its own share. It stays in the company's own figures. Holdings are matched by company name,
  ignoring case and spaces. The summary lists every holding it matched.
- **The original app's category 15 rule stays as it is.** Holdings over 50 % are left out of a
  company's category 15, as consolidated. Under equity share, such a holding should be entered
  as a company in the group, with its share. The summary can't detect a holding that was
  neither entered as a company nor counted in category 15.

### 3. The group summary

The Koncern page shows, for a chosen period:
- the group total, market-based and location-based
- each company's Scope 1, Scope 2 (both methods) and Scope 3, after its share, and at 100 %
- **year over year:** each company and the group per calendar year, for the latest 10 years with
  data, with the change from the year before
- **completeness:**
  - each company's missing factors
  - years with no commuting survey
  - Scope 3 categories marked relevant that the app doesn't calculate
  - categories without a reason for their relevance
  - missing ownership shares
  - holdings excluded as intra-group
  - factors whose source differs between companies

Factor sources are chosen per company. So the summary lists every factor where the companies
chose different sources, because the group total then mixes bases.

### 4. Access per company, enforced by Dataverse

**Each company sees only its own data** (decided 2026-10-01). This changes ADR 0005's tables and
roles:

- **A business unit per company**, under a root business unit for the group. Each company's
  records are owned by teams in its business unit.
  - **The root business unit stands for the group;** the parent company gets its own unit below
    it like every other company (decided by @mortengad on 2026-10-06). The first is
    *Heartland A/S*.
  - **Each company's unit has an owner team,** *<company> – klimaregnskab*, which owns the
    company record. Through the parental relationships (ADR 0007), assigning the company to the
    team moves all its records with it.
  - Set up with `npm run dataverse:company -- --url <environment> --name "<company>"`.
- **A new table, `hlesg_virksomhed`,** holds each company's name and its ownership shares (or a
  child table `hlesg_ejerandel`). Every account table in ADR 0005 gets a lookup to it.
  `hlesg_klimaregnskab` becomes one row per company, not per environment.
- **The roles from ADR 0005 apply per business unit:** *Læser*, *Bidragyder* and *Ansvarlig* read
  and change only their own company.
- **A new group role, *Koncern – Læser*,** reads every company, at organisation level, for the
  summary. Changing a company's data still needs that company's role.
- **Ownership shares are changed only by a new *Koncern – Ansvarlig* role,** because they decide
  the group total.
- **The summary is calculated from what the signed-in user can read.** Dataverse filters the
  rows, so a user without the group role gets a summary of their own company only, and the app
  says so. Hiding companies in the UI is presentation; the server decides.
- **Locking (ADR 0005, section 6) is per company.** Each company's reported periods get their own
  `hlesg_rapportering` snapshot. A reported group summary gets its own snapshot too, listing the
  company snapshots it was built from.

The browser draft store can't enforce any of this. Everyone with the browser sees every company,
as the draft notice already says.

## Options considered

- **Operational control (not chosen).** It's the most common approach, and closest to the
  original app's own category 15 rule (over 50 % is consolidated). It needs no ownership shares,
  only a yes or no per company. The tech lead chose equity share.
- **Financial control (not chosen).** Usually the same result as operational control for wholly
  owned subsidiaries.
- **An environment per company, summed elsewhere (rejected).** That's ADR 0005 as it was. The
  summary would need a separate reporting store that reads every environment, which undoes the
  separation it was meant to give.
- **Everyone sees all companies (rejected by the tech lead).** One business unit is simpler, but
  people in one company could change another's numbers.
- **Factor sources for the whole group (rejected by the tech lead).** That would keep the group
  total on one basis. Choosing per company is more flexible, so the summary flags differences
  instead.

## Consequences

- **ADR 0005, section 3** ("one climate account per environment") is replaced by this ADR. Its
  "Exactly one row per environment" for `hlesg_klimaregnskab` becomes one row per company.
- **Ownership shares are now data that changes the group total.** They need the same care as
  emission factors: who changed them, when, and why. Dataverse auditing covers the first two.
- **Category 15 and equity share overlap,** as described in section 2. Users need guidance:
  enter a group company as a company, not as an investment.
