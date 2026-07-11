# Agent instructions

## Source of truth

This repository is canonical. Never make primary edits in generated files under `~/.pi`.

- Workflow: `workflow/implement-tickets.js`
- Agent roles: `agents/*.md`
- Installation boundary: `scripts/lib/installation.mjs`

## Required process

- Use red-green TDD at the public seams in `test/`.
- Run `npm test` before committing.
- Keep the workflow's implementation, Standards review, Spec review, and coordinator sessions separate.
- Preserve exact ticket, branch, worktree, and SHA validation.
- Represent P0/P1 fixes as durable remediation tickets, not private fixer loops.
- Never add machine-specific absolute paths to workflow or role files.
- Bump the package version when a released generated artifact changes; upgrade provenance is version-bound.

## Generated installation

Run `npm run install:global` to update the user installation. The installer refuses to overwrite local differences unless `--force` is explicit. Run `npm run check:global` after installation.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues; external pull requests are also a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.
