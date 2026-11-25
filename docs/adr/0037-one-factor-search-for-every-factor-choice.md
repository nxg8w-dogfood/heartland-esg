# 37. One factor search wherever a factor is chosen, across scopes, by unit

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decided by:** @mortengad (tech lead), 2026-11-25, on Heartland's request (Line, ESG)

## Context

Factors were chosen in four different ways: a country menu and a type menu on Kontoplan's rules,
on the exceptions on the Scope 3 category pages and on category 15's holdings; a list of the
same factor for other countries on a line; and a free search when tagging one posting. The
country menu started at the chosen factor's country, so a rule using *Other business services
(Danmark)* offered only that one. Lines could only switch to the same factor in another country.
Heartland asked to see every factor, with its country, to be able to search for one everywhere,
and to choose factors without a hard split between Scope 1, 2 and 3.

A factor only means something on a quantity in its unit. A ledger posting is an amount of money,
so a factor per liter or per kg applied to it would give a number with no meaning.

## Decision

1. **One factor search** (`src/factors/FactorSearch.tsx`) everywhere a factor is chosen: rules,
   posting-rule changes and exceptions on Kontoplan, tagging one posting, the exception form on the
   category pages, holdings in category 15, the factor on every line, and the factor when adding
   an activity line. A button names the chosen factor and opens the search in a dialog.
2. **Every factor in the table is listed, whatever its scope**, with source, name and country,
   value, unit and factor year. It searches name, source and country, and can be narrowed by
   country. A family of dated versions (the yearly grid mix) is listed once; the line's date
   still picks the version.
3. **Only a factor whose unit fits can be chosen.** The others that match the search are listed
   after them, greyed, with the reason. What fits:
   - a ledger posting, its rules and exceptions: a factor per unit of a currency (`fitsAmount`);
   - a category 15 holding: per EUR, as before (`fitsInvestment`);
   - a line: the same unit as its type's default factor.
4. The factor year is the spend factor's price year, a dated version's year, or the year in the
   source's name; a family shows the years it spans.

## Options rejected

- **Allow any factor anywhere.** The calculation multiplies the quantity by the factor without
  regard to units, so a wrong unit would silently give a wrong total.
- **Keep the country and type menus and widen them.** Two menus don't search, and with 546
  factors a menu is too long to use.
- **A panel that opens under the button.** In a table it was clipped by the table's scrolling,
  and in a form it ran past the edge of the page. A dialog works the same everywhere.

## Consequences

- A diesel line can now use any factor per liter, such as a Scope 3 well-to-tank factor. That is
  what Heartland asked for; the line's scope is still its type's.
- Only 43 factors are per unit of money until the full EXIOBASE table is loaded, so Kontoplan
  still offers few. The search shows the others so it is clear why they can't be chosen.
