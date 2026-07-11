# Contributing

## Canonical files

Edit these files in the repository:

- `workflow/implement-tickets.js`
- `agents/*.md`
- `scripts/lib/installation.mjs`

Do not edit installed files under `~/.pi` and copy them back. Run the installer to generate those files from the repository. Bump `package.json` whenever canonical installed artifacts change after a release; recorded hashes are trusted for upgrades only across package versions.

## Development loop

Use one red-green test cycle per behavior:

1. Add a test at a public seam.
2. Run `npm test` and confirm the intended failure.
3. Make the smallest change that passes the test.
4. Run the full suite.

Keep implementation, Standards review, Spec review, and coordination in separate agent sessions. Do not weaken exact-SHA checks or turn blocking findings into an in-memory fixer loop.

## Upstream prompt contract

Matt Pocock's pinned skill wording is a runtime contract, not prose to summarize. The [upstream adaptation ledger](docs/upstream-adaptations.md) is the human compatibility record and upgrade procedure; [`docs/upstream-contract.json`](docs/upstream-contract.json) is its machine-checkable instruction registry.

- Read the ledger and registry before changing the pinned upstream version or any workflow-owned adaptation.
- Import upstream files from an immutable release tag or commit into `vendor/mattpocock-skills/<version>/` without editing them.
- Diff and classify every changed upstream instruction; every semantic change needs a stable registry ID, exact upstream quote, primary disposition, runtime owner, support path, verification path, and explanatory ledger entry.
- Keep upstream text byte-exact inside the relevant agent roles.
- Put graph/worktree/SHA adaptations after the verbatim source block and label them explicitly.
- Update the ledger, registry, pinned hashes, README mapping, third-party notice, and fidelity tests in the same change.
- Never silently paraphrase, omit, or supersede an upstream instruction to save prompt tokens.

## Verification

```bash
npm test
npm run install:global
npm run check:global
```

Use a temporary home directory when testing destructive installation behavior. Never run force-install or force-uninstall tests against a contributor's real home directory.

## Pull requests

Explain:

- the workflow behavior that changed;
- the failure mode the change prevents or enables;
- the tests that prove it; and
- any migration required for installed users.
