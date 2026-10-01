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
