# 18. A company can change the ESG owner's posting rules in the app

- **Status:** Accepted
- **Date:** 2026-11-13
- **Decided by:** @mortengad (tech lead), 2026-11-13
- **Supersedes:** ADR 0015 decision 1, for posting rules only

## Context

ADR 0015 kept the ESG owner's account and posting rules in code: changing an approved rule went
through a pull request, and editing them in the app was considered and rejected. In practice
posting rules R25–R43 are *Afventer* until the ESG owner decides them, and the app gave no way to
decide one. R33 («Dorte Mandrup», architect consulting) is one example: its 12 postings stayed
pending although the rule already names EXIO-OBS. The only way round it was an exception or a
manual action on every posting, which hides the decision instead of recording it on the rule.

Exceptions (the user's own rules) were also shown as one card each, unlike the standard rules'
tables, which made a long list hard to scan.

## Decision

1. **A posting rule can be changed per company, from Kontoplan.** Each row in *Posteringsregler*
   has *Rediger*, which opens an editor under the row. A change sets the rule's handling (Udelad,
   Medtag, Medtag – review, Afventer), factor, the category it moves postings to, and reason.
   The search word, priority and the category it applies to stay as approved, so a change can't
   widen what the rule matches.
2. **The approved rule stays in code** (`src/data/scope3Rules.ts`, ADR 0015). A change is stored
   next to it (`PostingRuleEdit`, applied by `withRuleEdits` in `src/calc/ledger.ts`), the table
   shows *Ændret* with the date and what was approved, and *Gendan godkendt regel* removes the
   change. A change to a rule that later disappears from the rule file is ignored.
3. **The factor is chosen from the factor table**, like exceptions, not as a FaktorID. An
   unchanged rule's editor starts from its approved factor. No factor means the account's factor.
4. **Changes are stored in `hlesg_regel`**, the table that already holds the company's
   exceptions, as rows with `hlesg_standardregel` set to the RegelID. Four columns are added:
   `hlesg_standardregel`, `hlesg_handling` (choice), `hlesg_flyttil` and `hlesg_aendret`.
   Exceptions leave them empty. Reading splits the rows on `hlesg_standardregel`.
5. **Same precedence as before:** a manual action, then exceptions, then the posting rule (now
   with the company's change), then the account rule.
6. **Who may change a rule is who may change the company's exceptions:** the same table, so the
   same Dataverse privileges (`src/dataverse/roles.ts`), checked by Dataverse on every request.
7. **Exceptions are shown like the standard rules:** a folded table, *Undtagelser (n)*, with a
   row per exception and *Rediger* opening the existing editor under the row.
8. **Account rules stay read-only in the app.** Nobody asked to change them, and an account
   rule decides every posting on an account. They still change through a pull request.

## Options considered

- **A new table for rule changes (not chosen).** Cleaner in Dataverse, but it needs a new
  generated data source, and the rows have the same owner, company and lifetime as exceptions.
- **Group-wide changes (rejected).** The rules apply to every company, but a group-wide table
  isn't tied to a company's business unit (ADR 0006), so it would need its own role and a
  server-side check that only the ESG owner writes it.
- **"Rediger" creates a prefilled exception (rejected).** No schema change, but exceptions only
  include or exclude, match without regard to case, and can't apply to one category. It would
  look like an edit without being one.
- **Keep changes as pull requests (rejected).** It keeps every change reviewed, but every pending
  rule would wait for a developer, and pending rules are exactly the ones the ESG owner needs to
  decide.

## Consequences

- A rule change isn't reviewed like a pull request. It's visible on the rule (*Ændret*, with the
  approved handling next to it) and can be undone, but there's no history of who changed it,
  since the project keeps no personal data. Dataverse's own `modifiedon` is the only trail.
- Changes are per company. If every company makes the same change, the rule file should be
  updated and regenerated (README, *Update the ESG owner's rules*), and the changes removed.
- The columns must exist before a build that reads them is deployed: run
  `npm run dataverse:apply` against each environment first. The `.power` schema and the
  generated model for `hlesg_regel` were updated by hand to match; regenerate them with
  `npx pa app add data-source --connector dataverse --table hlesg_regel` once the columns exist.
