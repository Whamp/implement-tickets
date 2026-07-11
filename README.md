# implement-tickets

[![CI](https://github.com/Whamp/implement-tickets/actions/workflows/ci.yml/badge.svg)](https://github.com/Whamp/implement-tickets/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A saved [pi-dynamic-workflows](https://github.com/QuintinShaw/pi-dynamic-workflows) command that applies Matt Pocock's v1.1.0 `/implement` and `/code-review` skills across a dependency graph of tickets with separate implementation and review sessions.

```text
/implement-tickets <parent-spec-or-issue>
```

The workflow never lets a code-writing session review its own work. Blocking review findings become durable remediation tickets that pass through the same implementation and review pipeline as original tickets.

## Upstream skill contract

This project pins [Matt Pocock's skills v1.1.0](https://github.com/mattpocock/skills/tree/d574778f94cf620fcc8ce741584093bc650a61d3) at commit `d574778f94cf620fcc8ce741584093bc650a61d3`. The repository vendors the relevant source and license under [`vendor/mattpocock-skills/v1.1.0`](vendor/mattpocock-skills/v1.1.0). Tests verify every vendored file by SHA-256.

The exact wording is a runtime contract:

- The implementer role contains the complete `/implement` skill verbatim.
- Because `/implement` delegates to `/tdd`, the implementer also receives the complete v1.1.0 `/tdd` skill plus its `tests.md` and `mocking.md` references verbatim.
- Standards, Spec, and final-report roles each contain the complete `/code-review` skill verbatim.
- The workflow supplies the resolved fixed point, three-dot diff command, commit list, standards-source list, ticket, and parent spec required by the upstream prompts.
- Each reviewer returns its original under-400-word axis report as durable structured evidence. Remediation tickets and final output preserve `## Standards` and `## Spec` separately without merging or reranking findings.

The graph workflow makes only these explicit adaptations:

1. A ticket plus its parent spec is the `/implement` input. Their Testing Decisions define the pre-agreed seams; a detached implementer stops when those seams are absent or ambiguous.
2. The workflow performs `/code-review` after the implementer returns, using fresh independent sessions. The code-writing session never reviews itself.
3. Coordinator-owned Git state supplies the fixed point instead of asking the user at each ticket. A bad ref or empty diff still fails before reviewers run.
4. A missing or ambiguous parent/ticket spec fails bootstrap instead of skipping the Spec axis.
5. Structured P0–P3 severities, durable remediation tickets, worktree isolation, and exact-SHA gates extend the upstream skills without replacing their wording.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and Matt Pocock's MIT license.

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
~/.pi/workflows/installations/implement-tickets.json
~/.pi/agents/ticket-implementer.md
~/.pi/agents/ticket-standards-reviewer.md
~/.pi/agents/ticket-spec-reviewer.md
~/.pi/agents/ticket-graph-coordinator.md
~/.pi/agents/ticket-final-reporter.md
```

The installation manifest records the package version and SHA-256 hash of every generated artifact. A later package version can upgrade or retire untouched files from the recorded release while refusing local modifications. Same-version files must still match canonical content, so editing a manifest hash cannot bless a local change. A manifest-less installation is adopted only when every existing file already matches the current canonical release.

The installer rejects symlinked managed directories and trusts only product-owned relative paths under `.pi/agents` and `.pi/workflows`. It stages all writes and retired-file removals before replacing files, then rolls back committed changes when a later operation fails. It refuses to overwrite modified files. To intentionally replace local changes:

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

## Model routing

The workflow uses all three pi-dynamic-workflows tiers:

- **Small:** read-only SHA/worktree capture, independent validation, and failure bookkeeping.
- **Medium:** ordinary ticket implementation, ticket-level Standards review, graph preparation/inventory, integration, remediation creation, release verification, and final reporting.
- **Big:** initial graph bootstrap, remediation-ticket implementation, ticket-level Spec review, both final integrated reviews, and publication.

Read-only Big review calls retry twice. If any ticket-level or final reviewer still returns no result, the workflow records an operational `needs_attention` hold and preserves the candidate worktree. Refreshed graph state must prove ticket-level persistence; a separate read-only check must prove parent-level persistence against the exact candidate SHA. A missing reviewer never becomes a code-remediation ticket, and the workflow never silently downgrades the review tier.

Configure the concrete model behind each tier through pi-dynamic-workflows. Agent role files do not hard-code model providers.

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

Uninstall compares installed files with the hashes recorded at installation, so it can safely remove an untouched older release after the repository advances. It stages removals through sibling backup files and restores them when a later removal fails. It refuses to remove locally modified managed files. Use `--force` only when you intend to discard those changes:

```bash
npm run uninstall:global -- --force
```

## Development

```bash
npm test
```

Tests cover pinned upstream source hashes, verbatim prompt inclusion, review-context propagation, workflow portability and parsing, model routing and reviewer-outage behavior, role bindings, graph/remediation/completion invariants, generated saved-workflow identity, idempotent install and upgrade, conflict protection, Windows profile isolation, command behavior, and safe uninstall. CI runs on Linux, macOS, and Windows.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing orchestration behavior.

## License

The workflow is [MIT licensed](LICENSE). Verbatim Matt Pocock skill material remains under Matt Pocock's MIT license in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
