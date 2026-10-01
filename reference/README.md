# Reference: the original app

`heartland-klimaregnskab-app.html` is the original Heartland Klimaregnskab app, exactly as it
was exported from the AI tool it was built in. It is a compiled, minified single-file build,
and its source can't be recovered.

It is the functional spec for the rebuild ([ADR 0001](../docs/adr/0001-rebuild-as-power-apps-code-app.md)):
when porting a feature, open the file in a browser and check that the new code gives the
same results, or that any difference is deliberate and documented.

- **Don't edit it.** It records what the app did.
- **It isn't part of the build** and isn't deployed.
- **It stores data in your browser only** (IndexedDB and localStorage). Anything you enter
  stays on your machine.
