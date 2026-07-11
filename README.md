# implement-tickets

[![CI](https://github.com/Whamp/implement-tickets/actions/workflows/ci.yml/badge.svg)](https://github.com/Whamp/implement-tickets/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A saved [pi-dynamic-workflows](https://github.com/QuintinShaw/pi-dynamic-workflows) command that implements a dependency graph of tickets with separate implementation and review sessions.

```text
/implement-tickets <parent-spec-or-issue>
```

The workflow never lets a code-writing session review its own work. Blocking review findings become durable remediation tickets that pass through the same implementation and review pipeline as original tickets.

## What it does

For each runnable ticket, the workflow:

1. Creates or reuses a persistent issue branch and worktree.
2. Starts a fresh implementer agent.
3. Validates the resulting branch, worktree, base SHA, and candidate SHA.
4. Starts independent Standards and Spec reviewers in separate sessions.
5. Creates a remediation ticket when either review reports a P0 or P1 finding.
6. Integrates only an exact candidate SHA accepted by both reviewers.
7. Verifies the integration before marking tickets complete.

After the graph is complete, two fresh reviewers inspect the full integrated diff. The workflow then pushes the reviewed coordinator SHA and can create or update an integration pull request. It never merges the pull request or closes the parent spec.

```text
parent spec
    │
    ▼
dependency frontier ─────┐
    │                    │ parallel tickets
    ▼                    ▼
implementer          implementer
    │                    │
    ├─ Standards review  ├─ Standards review
    └─ Spec review       └─ Spec review
    │                    │
    ├─ P0/P1 ─► remediation ticket ─► same pipeline
    │
    ▼
verified coordinator branch
    │
    ├─ final Standards review
    └─ final Spec review
    │
    ▼
push exact reviewed SHA + optional PR
```

## Requirements

- [Pi](https://pi.dev)
- [pi-dynamic-workflows](https://github.com/QuintinShaw/pi-dynamic-workflows) 2.12.1 or newer
- Node.js 20 or newer for installation and tests
- Git
- A parent spec or issue with discoverable child tickets and dependency edges
- Repository tooling that lets agents read and update the configured tracker, such as `gh` for GitHub Issues or a project-local Markdown tracker
- At least one configured Pi model; three model tiers are recommended

Install pi-dynamic-workflows first:

```bash
pi install npm:@quintinshaw/pi-dynamic-workflows
```

Then run `/reload` in Pi.

## Install

```bash
git clone https://github.com/Whamp/implement-tickets.git
cd implement-tickets
npm test
npm run install:global
```

Run `/reload` in Pi after installation. The installer creates:

```text
~/.pi/workflows/sources/implement-tickets.js
~/.pi/workflows/saved/implement-tickets.json
~/.pi/agents/ticket-implementer.md
~/.pi/agents/ticket-standards-reviewer.md
~/.pi/agents/ticket-spec-reviewer.md
~/.pi/agents/ticket-graph-coordinator.md
~/.pi/agents/ticket-final-reporter.md
```

The installer refuses to overwrite modified files. To intentionally replace local changes:

```bash
npm run install:global -- --force
```

## Use

From a Git repository containing the parent and its implementation tickets:

```text
/implement-tickets https://github.com/acme/project/issues/42
```

A local tracker reference also works:

```text
/implement-tickets .scratch/account-migration/spec.md
```

PR creation defaults to true. Disable it with:

```text
/implement-tickets parent=.scratch/account-migration/spec.md pr=false
```

The command runs in the background through pi-dynamic-workflows. Inspect it with `/workflows`.

## Ticket completion

A ticket counts as complete only after its accepted candidate is integrated and verified on the coordinator branch. The parent remains open until a human merges the integration pull request.

P0 and P1 findings block integration. One review round produces one remediation ticket containing both reviewers' blocking findings. The source ticket remains incomplete while the remediation chain runs. After three unsuccessful remediation rounds, the lane stops with `needs_attention`; unrelated frontier tickets may continue.

P2 and P3 findings do not block integration. The coordinator records durable follow-up work when the reviewer recommends it.

## Safety model

The workflow fails closed around these identities:

- ticket key;
- assigned branch and worktree;
- fixed-point SHA;
- candidate SHA;
- reviewer axis and reviewed SHA;
- integrated candidate and coordinator SHAs; and
- published local, remote, and pull-request SHAs.

It records the user's checkout baseline and rejects accidental writes outside assigned worktrees. Integration conflicts create remediation work instead of letting the coordinator improvise product-code changes. Publication requires two passing final reviews of one exact coordinator SHA plus post-publish remote verification.

This is still agent-driven automation. Review the integration pull request before merging it.

## Update and verify

The repository is canonical. Files under `~/.pi` are generated installation output.

```bash
git pull --ff-only
npm test
npm run install:global
npm run check:global
```

Run `/reload` after an update.

## Uninstall

```bash
npm run uninstall:global
```

Uninstall refuses to remove locally modified managed files. Use `--force` only when you intend to discard those changes:

```bash
npm run uninstall:global -- --force
```

## Development

```bash
npm test
```

Tests cover workflow portability and parsing, role bindings, generated saved-workflow identity, idempotent installation, conflict protection, command behavior, and safe uninstall.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing orchestration behavior.

## License

[MIT](LICENSE)
