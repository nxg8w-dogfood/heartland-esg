# 2. AI review: flag unusual numbers, as suggestions only

- **Status:** Proposed
- **Date:** 2026-09-30
- **Decided so far by:** @mortengad (tech lead and model approver). Scope, suggestions only, the region, excluding line descriptions, and who approves models.

## Context

The brief says Heartland ESG ships a model at runtime. The only approved model is
**GPT-4o on Azure OpenAI**, and anything else needs approval. The planned feature is an
AI-assisted *ESG review*.

Constraints already in force:

- **Authorisation enforced on the server** and **secrets in Key Vault, never in the
  repository** (`SECURITY.md`).
- **Token spend budget and a per-request cap** (cost policy).
- Code apps run in the user's browser (ADR 0001), so anything shipped in the app is visible
  to the user. A model key or a direct call to the model can't live there.

## Decision

### Agreed

1. **Scope:** the review **flags unusual numbers** in an account. Examples are a large
   change from the previous period, a factor far from the factor table, a quantity out of
   line with similar lines, and gaps where data is expected. Other uses, such as drafting
   report text or checking CSRD completeness, are out of scope and would need their own ADR.
2. **Suggestions only:** the review never changes the account. Each flag is shown to the
   user, who can accept it (and then correct the line themselves) or dismiss it. Accepted
   and dismissed flags are recorded with who decided and when, so the audit trail shows a
   person made every change.
3. **Region:** the model runs in **Sweden Central**, as a **Standard (regional)**
   deployment so that data is processed in that region. Data Zone and Global deployment
   types are not used, because they can process data outside Sweden Central.
4. **No line descriptions:** free-text line descriptions and supplier names are **never**
   sent to the model. They can contain names of people or companies, and the security
   profile says *no personal data*. The prompt holds structured fields only.
5. **Model approval:** @mortengad approves which models this project may use. Any model
   other than GPT-4o, including its successor, needs their approval, recorded in this ADR
   or a new one.

### Proposed

6. **Rules first, then the model.** Deterministic checks in `src/calc/` find the candidate
   flags: change from the previous period above a threshold, a factor deviating from the
   factor table, a unit mismatch, missing values. They're plain TypeScript, unit-tested in
   CI, and cost nothing to run. The model then receives the flagged lines and the account's
   totals. It ranks the flags, explains each one in plain Danish, and may add flags the rules
   can't express, marked as model-generated. If the model is unavailable or over budget,
   users still get the rule-based flags.
7. **Server-side call path:**

   ```
   code app ──(user's Entra token)──▶ custom connector ──▶ Azure Function (Sweden Central)
                                                              │  1. validate the token
                                                              │  2. read the account from Dataverse
                                                              │     as the user (on-behalf-of)
                                                              │  3. run the rules, build the prompt
                                                              │  4. enforce the per-request cap
                                                              ▼
                                        Azure OpenAI, Sweden Central (managed identity, no key)
   ```

   - The app sends only the **account ID**, never the numbers. The Function reads the data
     from Dataverse with the user's identity, so Dataverse security roles decide what the user
     may have reviewed. The client can't submit data it isn't allowed to read or change what
     reaches the model.
   - The Function calls Azure OpenAI with its **managed identity**. There is no API key to
     store, leak or rotate.
   - The Function returns flags only. Nothing is written to the account.
8. **Data minimisation:** the prompt contains structured fields only: scope and category,
   quantities, units, factors, period and totals. Line descriptions are excluded (decision 4).
   That also limits prompt injection through imported text.
9. **Cost controls:** every one of these is enforced outside the model:
   - A hard **per-request cap** in the Function: a maximum number of lines per review, and a
     maximum number of output tokens (`max_completion_tokens`) on every call. A request over
     the cap is refused, not truncated silently.
   - A **tokens-per-minute quota** on the deployment, as a platform ceiling a bug in our code
     can't bypass.
   - A monthly **Azure budget** on the resource group with alerts at 50, 80 and 100 %, sent
     to the owning team.
   - Owner, project and environment **tags** on every resource.

## Options considered

- **Send line descriptions to the model (rejected by the tech lead).** Descriptions could
  help the model tell a real anomaly from, say, a one-off purchase. But they can contain
  personal data, and they're an injection path.
- **Model only, no rules (rejected).** Every review would cost tokens, flags would be hard
  to test and could vary between runs, and nothing would work when the model is unavailable.
- **Call Azure OpenAI from the browser (rejected).** The key or token would be visible to
  every user, and there'd be no server-side authorisation or cap.
- **Power Automate flow with an HTTP action (rejected).** It works with code apps, but the
  logic couldn't be unit-tested in CI, and the connection would need a key.
- **Dataverse custom API with a C# plug-in (not chosen).** It is server-side and gets
  Dataverse privileges for free, but it's a second language and toolchain, it would need the
  key as a secret environment variable, and plug-ins have execution time limits. It's worth
  revisiting if the Function adds too much infrastructure.
- **Data Zone Standard EU deployment (rejected).** It has more model versions and capacity,
  but data may be processed anywhere in the EU, not only Sweden Central.

## Consequences

- **The approved model is close to retirement.** On 2026-09-30 Microsoft's
  [model retirement schedule](https://learn.microsoft.com/azure/foundry/openai/concepts/model-retirement-schedule)
  lists `gpt-4o` **2024-11-20** as *Legacy*, **retiring 2027-04-14**, with `gpt-5.1` as the
  replacement. The older GPT-4o versions (2024-05-13 and 2024-08-06) are *Deprecated* and
  closed to new subscriptions. GPT-4o 2024-11-20 is available as a Standard deployment in
  Sweden Central
  ([region availability](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability)),
  so we can build on it now. But the feature will need a successor model within about six
  months of going live. Only an approved model may replace it, so **@mortengad needs to
  approve a successor before April 2027**. To make the swap cheap:
  - the Function calls a **deployment name** from configuration, never a model version;
  - the deployment's upgrade option is set explicitly;
  - a fixed set of test accounts with known expected flags is kept, so the successor can be
    compared before switching.
- **New infrastructure:** an Azure Function, a custom connector, an Azure OpenAI resource
  and their Entra app registrations, each per environment. All of them are deployed from
  the pipeline.
- **Tests:** the rules are unit-tested in CI. The Function's cap and authorisation checks
  are tested with the model call mocked. Model output quality is checked against the fixed
  test accounts, not in every CI run.

## Open questions

1. **Budget numbers.** The monthly token budget, the per-request cap (lines and output
   tokens) and the Azure subscription that pays. These are required before the feature
   ships.
2. **Successor model.** Which successor to GPT-4o should be evaluated for @mortengad to
   approve? `gpt-5.1` is Microsoft's named replacement, but it retires 2027-05-15, a month
   after GPT-4o. Newer models available in Sweden Central last longer.
3. **Thresholds.** What counts as "unusual" (for example a change of more than 25 % from the
   previous period) is a domain decision for the product owner. It should start from the
   CSRD data collection manual.
