# Guardrail waivers

The brief: a guardrail that can't be met "gets waived on the project, with a reason, by a
person. It does not get worked around in the code." Every waiver is recorded here, and
removed when it ends.

## Protected default branch: the required review

- **Guardrail:** "No direct pushes to the default branch. Changes land through a pull request
  with at least one review."
- **Waived:** the *at least one review* part only.
- **By:** @mortengad, tech lead, on 2026-10-01.
- **Reason:** @mortengad is the only developer. GitHub doesn't let the author of a pull request
  approve it, so with one required approval nothing can be merged.
- **Until:** a second developer joins the project. Then the required approvals go back to 1
  and this section is removed, in the same pull request.
- **What still holds:**
  - Changes still land only through pull requests; direct pushes, force pushes and deleting
    `main` stay blocked.
  - The rules apply to admins too.
  - The required checks, `build` and `secret-scan`, must pass on a branch that's up to date
    with `main`.
  - Each pull request still gets the code review agent's review, as the brief's roles expect.
    It informs; it doesn't approve.
- **Setting changed:** branch protection on `main`, *Require approvals* from 1 to 0. *Require a
  pull request before merging* stays on.

## Dependency scanning: the picomatch advisory GHSA-fc5q-39xc-vjpf

- **Guardrail:** "Dependencies are scanned on a schedule, and known-vulnerable versions are
  patched inside the agreed window." CI's audit fails the build on a high or critical advisory.
- **Waived:** this one advisory only: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
  a high-severity ReDoS in `picomatch` through repeated extglobs.
- **By:** @mortengad, tech lead, on 2026-11-18.
- **Reason:** every version of `picomatch` is affected (up to 4.0.7, the latest) and no patched
  version exists, so there is nothing to upgrade to. It blocked every merge and so every
  deploy. `picomatch` comes in only through `vite` and `vitest`, the build and test tools; it
  isn't in the app that ships. `npm audit fix --force` would downgrade vitest a major version
  and still not fix vite.
- **Until:** a patched `picomatch` is released and vite and vitest can use it. The exception
  in `scripts/lib/audit.ts` has a review date, 2026-12-18: after it the advisory fails the
  build again, until the waiver is renewed here or removed.
- **What still holds:**
  - Every other high or critical advisory still fails the build, including new ones in the
    same packages.
  - CI still runs the full audit and prints the waived advisory on every run.
  - The moderate `minimatch` advisory found at the same time was fixed by `npm audit fix`.
- **Setting changed:** CI runs `npm run audit` (`scripts/audit.ts`) instead of
  `npm audit --audit-level=high`.
