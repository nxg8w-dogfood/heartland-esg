# 8. The app is styled with the HEARTLAND Design System

- **Status:** Accepted
- **Date:** 2026-11-10
- **Decided by:** @mortengad (tech lead), 2026-11-10

## Context

The rebuild started with a neutral stylesheet: system font, a teal accent, rounded cards, and a
dark palette that followed the operating system. It was never meant to be Heartland's look.

Heartland publishes a design system, *HEARTLAND Design System 0.1*
(https://witty-beach-0db1a1203-heartland.westeurope.7.azurestaticapps.net/). It's derived from
the HEARTLAND Annual Report 2024/25 and defines colour tokens (`--hl-*`), five light "chapter"
themes (Linen, Paper, Moss, Bark, Sage), a serif type scale with bold tracked caps for
headings, a 4–128px spacing scale, square corners, report-style financial tables, key figures,
buttons, fields, tags, tabs, alerts and a categorical chart palette. It ships no npm package:
the site is a compiled React page, so tokens and components can only be copied.

The site itself doesn't name an owner or say whether apps should use it, so @mortengad was
asked on 2026-11-10. The answers:

- It **is the official Heartland design system** for this app.
- It **fully replaces** the current styling, not just its colours and font.
- The app is **light only**, because the design system defines no dark theme.
- The **HEARTLAND logotype may be used** in the app; Heartland's permission is confirmed.

## Decision

- **Tokens are copied into `src/brand/tokens.css`,** value for value, from the design system's
  Linen theme (`:root`). App styles in `src/index.css` only refer to `--hl-*` tokens. When the
  design system changes, its values are copied over again.
- **App styles are rewritten on those tokens,** keeping the app's existing class names, so the
  screens' markup and tests didn't change. The design system's components are matched in CSS,
  not by porting its React components (see *Mapping* below).
- **Type:** Plantin MT Pro is a licensed font and is not bundled. The font stack is the design
  system's own: Plantin if installed, then **Newsreader** (SIL Open Font License 1.1) from
  `@fontsource-variable/newsreader`, bundled by Vite so nothing loads from a CDN at runtime.
- **Logotype:** the HEARTLAND wordmark's SVG paths are in `src/brand/Logotype.tsx`, drawn in
  `currentColor`, with a comment recording where they come from and the permission.
- **Light only:** `color-scheme: light`, and the previous dark palette is removed.
- **Accessibility:** the result is checked against WCAG 2.2 AA (contrast and focus). Focus is
  the design system's 2px Bark outline (7.5:1 on Linen). The current page in the navigation is
  marked by a dash underneath and bold weight, not by colour alone.

### Mapping

| App element | Design system |
| --- | --- |
| Page background, text | Linen theme: `--hl-surface`, `--hl-text` |
| Page title (`h1`) | Heading at H2 size (30px) with the dash; scales down on phones |
| Section (`h2`), sub-section (`h3`) | Headings at H3 (22px) and H4 (17px) |
| `.lead` | Lead, at the `lg` size (18px) |
| Header and navigation | Site header and chapter nav: logotype, tracked caps links, dash under the current page |
| Buttons, `.secondary`, `.link` | Primary, secondary and ghost buttons |
| Inputs, selects, labels, errors | Field, input, select, field label and field error |
| Checkboxes | Check (`accent-color` Moss) |
| `.tile`, `.tile.accent` | Key figure; the accent tile is the highlight band (Moss) |
| Tables, `tfoot` totals | Financial table (`hl-ftable`) and its total row |
| `.notice` (draft store bar) | Policy box (`--hl-note-bg`) |
| `.warning`, `.pending`, `.error` | Warning alert, warning and danger colours |
| `.card`, `.period`, `.params`, `.company-editor` | Square panels on Paper with a rule |

## Consequences

- The app looks like Heartland's other material, and new styles have a set of tokens to use.
- The tokens are a copy. Nothing warns when the design system changes; whoever changes it has
  to copy the values here too.
- Plantin only shows where it's installed. Everyone else sees Newsreader, which is what the
  design system specifies as its fallback.
- Users who prefer dark mode get the light theme. If dark mode is needed later, it belongs in
  the design system first.
- The design system's charts, tags and tabs aren't used yet because the app has no charts,
  status tags or tabbed views. Their tokens are left out of `tokens.css` until they are.

## Options rejected

- **Keep the neutral styling and only swap colours and font.** Rejected by @mortengad: the
  design system replaces the styling.
- **Load the design system's compiled CSS from its site.** It isn't published as a package or a
  stable URL (its file names are build hashes), it'd add a runtime dependency on another host,
  and its class names (`hl-*`) would mean rewriting every screen's markup.
- **Port the design system's React components.** There's no source to import, only a compiled
  bundle, and the app's markup already has the semantics it needs.
- **Derive a dark theme from the Moss chapter.** It'd be our own invention rather than
  Heartland's design, so light only was chosen until the design system defines one.
- **Bundle Plantin MT Pro.** The design system marks it as licensed, and the project holds no
  licence to redistribute it in an app. Newsreader is the design system's own open fallback.
