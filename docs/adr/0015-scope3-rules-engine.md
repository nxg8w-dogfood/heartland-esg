# 15. Spend-based tagging with the ESG owner's account and posting rules

- **Status:** Accepted; decision 1 is superseded for posting rules by ADR 0018 (2026-11-13)
- **Date:** 2026-11-12
- **Decided by:** @mortengad (tech lead) with the ESG owner, 2026-11-12

## Context

The ESG owner's working document (*Klimaregnskabsmodel*, version 1.0) says Scope 3.1, 3.2 and
3.6 are built by tagging ledger postings: each account has a default category and EXIOBASE
factor, and exceptions either exclude a posting or give it a specific factor. It comes with two
files:

- `kontoregler.csv`: 188 accounts with Medtages (include), Kategori, FaktorID (e.g. `EXIO-OBS`),
  Grundlag (Datamanual, Skøn – bekræft, Afklar) and Begrundelse.
- `posteringsregler.csv`: 46 search-word rules in priority order. Each has a handling (Udelad,
  Medtag, Medtag – review, Afventer), can set a FaktorID and move the posting to another
  category (FlytTilKategori), may apply to one category only (GaelderForKategori), and carries
  an approval stamp.

The Kontoplan screen already had user-defined rules (conditions, tag or exclude) and manual
actions per posting, stored in Dataverse (`hlesg_regel`, `hlesg_postering`), but tagged to
category 1 only.

## Decision

1. **The ESG owner's rules are seed data in code** (`src/data/scope3Rules.ts`), generated from
   the two files by `scripts/scope3-rules-seed.ts`. The parser (`src/calc/ruleSeed.ts`) handles
   the account file's irregular quoting and refuses unexpected columns or values rather than
   guessing. The CSV files aren't committed. Changing an approved rule is a pull request, so the
   change is reviewed and stays in the history.
2. **Users add exceptions on top, in two kinds.** From any posting on the 3.1, 3.2 and 3.6
   pages, an exception can apply to *that posting only* (a manual action: exclude it, or give it a
   factor and category, overriding the account mapping and every rule) or to *all postings that
   match* (a rule). Both keep their existing shape and storage (`hlesg_postering`'s manual
   columns and `hlesg_regel`), so the Dataverse schema doesn't change. Both can also be edited on
   Kontoplan, and a single-posting override can be undone ("Følg reglerne").
3. **Order of precedence** (`classify` in `src/calc/ledger.ts`): a manual action on the posting,
   then the first matching exception, then the account rule. An account that isn't in the rules
   is *untagged*; one with Medtages = Nej is *excluded*. For an included account, the first
   posting rule by priority whose search word is in the posting text or supplier, and whose
   GaelderForKategori matches the account's category (or is empty), decides; otherwise the
   account rule does.
4. **Search words are matched case-sensitively, exactly as written**, spaces included (R10
   `"DSB "` keeps its trailing space so it doesn't match "Skodsborg"). User exceptions keep the
   old case-insensitive matching.
5. **Statuses:** *included* (Medtag, or an account rule from the data manual), *for review*
   (Medtag – review, or an account rule marked Skøn – bekræft), *pending* (Afventer), *excluded*
   and *untagged*. Included and for review count in the climate account; for review is flagged.
   Pending is shown but doesn't count until it's decided.
6. **A factor register** (`src/data/spendFactorRegister.ts`) maps every FaktorID the files use to
   a factor in the factor table and to the EXIOBASE sector named in the data manual. Seven
   FaktorIDs had no factor; they're added to the factor table with no value ("må ikke gættes"),
   so their postings are pending a factor until someone enters one under Faktorer.
7. **Category 2 gets its own page and is calculated** from ledger postings; **category 6 adds the
   spend-based postings** to its activity-based lines.
8. **The approval stamp is kept as its date only.** The stamp holds the approver's initials, and
   this project keeps no personal data.

## Options considered

- **Seed the rules into Dataverse per company (not chosen).** Users could edit them in the app,
  but it needs new tables and columns, a regenerated data source, and a way to update approved
  rules in every company without overwriting local edits. An edit wouldn't be reviewed.
- **Commit the CSV files and parse them at runtime (rejected).** The posting rules carry the
  approver's initials, and the account file's quoting would make every load depend on a lenient
  parser.
- **Case-insensitive search words (rejected).** The file relies on case and spaces (R10 `"DSB "`
  vs R44 `"dsb."`).

## Consequences

- The rules apply to every company in the group. They were written for Heartland A/S's chart of
  accounts; another company with the same account numbers for something else needs exceptions,
  or a per-company switch later.
- Postings tagged to a category the app doesn't calculate yet (account 220001 Husleje → 3.8) show
  on Kontoplan but count nowhere.
- New or changed rule files are applied by rerunning the script and reviewing the diff.

## Confirmed with the ESG owner (2026-11-12)

- The decisions above, including that Skøn – bekræft counts but is flagged for review, Afventer
  doesn't count, posting rules never pull in an excluded account, the rules apply to every
  company, and approval stamps keep only their date.
- The four Afklar accounts (101002, 101116, 210010, 210019) stay excluded.
- Porto og gebyrer (210008) and Kontingenter (210016) are included in 3.1 with the data manual's
  factors (EXIO-POST and EXIO-OBS); the rule file was updated and regenerated.
- The EXIOBASE values exist and are entered by hand under Faktorer.
- The 14 Skøn – bekræft accounts have the right factors. Their basis is now *Bekræftet*, so
  they count as included rather than for review. That includes 220001 Husleje (3.8) with BEIS UK
  2022 at 0.1499 kg CO2e/GBP, now entered as the factor's value. 3.8 isn't calculated yet.
- Posting rules R25–R43 stay pending. The ESG owner decides each posting by overriding it
  individually, which is why single-posting exceptions override the account mapping.
- Amounts are converted at the rate on the transaction date (ADR 0016).
