# Per-environment deploy config

One folder per Power Platform environment (`dev/`, `test/`, `prod/`), each holding the
`power.config.json` that the environment's first publish created. It contains IDs, not
secrets. The deploy workflow copies the right one into place before publishing.

How to set up an environment: [docs/deploy.md](../docs/deploy.md).
