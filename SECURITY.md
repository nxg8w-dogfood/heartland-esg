# Security

**Level:** Low
**Profile:** Internal · No personal data · Internal only · Entra ID

## Controls that apply

- **Secrets in Key Vault, never in the repository** — Connection strings, keys and certificates live in Key Vault or environment configuration, injected at deploy time. The repository is scanned and the scan blocks the merge.
- **TLS 1.2 or better on every hop** — No plaintext anywhere, including between internal services. HTTP redirects to HTTPS and HSTS is set.
- **Authorisation enforced on the server** — Every request re-checks what the caller is allowed to do. Hiding a button in the UI is presentation, never protection.
- **Dependencies patched inside the agreed window** — Automated scanning on a schedule, with known-vulnerable versions upgraded before the window closes.

Each control applies because of an answer given about this project's data and exposure.
They are not a checklist to negotiate down.
