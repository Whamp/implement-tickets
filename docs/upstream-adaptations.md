# Upstream adaptation ledger

This document records how `implement-tickets` operationalizes Matt Pocock's `/implement`, `/tdd`, and `/code-review` skills inside a deterministic ticket-graph workflow.

The current contract is Matt Pocock skills v1.1.0 at commit [`d574778f94cf620fcc8ce741584093bc650a61d3`](https://github.com/mattpocock/skills/tree/d574778f94cf620fcc8ce741584093bc650a61d3). The byte-exact source and license live under [`vendor/mattpocock-skills/v1.1.0`](../vendor/mattpocock-skills/v1.1.0).

No upstream source text is deleted or rewritten in the runtime roles. Verbatim inclusion does not mean that every role executes every instruction itself: the workflow pre-resolves some inputs, delegates some steps to separate sessions, replaces interactive fallbacks with safe holds, and adds graph-level safety around the original behavior. This ledger makes those differences explicit.

The machine-checkable registry at [`docs/upstream-contract.json`](upstream-contract.json) anchors 106 normative clauses to unique exact upstream quotes. The pinned full-file hashes protect each quote's surrounding text. Every registry entry has one primary disposition, a runtime owner, workflow support, verification evidence, and a rationale when behavior is replaced or not executed. The tables below are the user-facing summary; the registry is the exhaustive compatibility index.

## Classification

Each registry entry has exactly one primary disposition:

| Disposition | Meaning |
| --- | --- |
| **Preserved** | The responsible runtime role follows the upstream instruction without a semantic change. |
| **Pre-resolved** | The workflow obtains and validates an input before the responsible role starts. |
| **Delegated** | Another isolated workflow role performs the instruction. The behavior remains required. |
| **Replaced** | Deterministic orchestration uses a different behavior. The replacement and reason must remain explicit. |
| **Not executed** | The workflow treats the upstream operation as a prerequisite or intentionally excludes it. |

The registry separately records whether the upstream evaluation rule remains intact. Extensions belong in the entry's support and note fields rather than becoming a second disposition. `Preserved` describes behavior, not merely prompt inclusion. A future upstream change is compatible only after its behavior has been traced through the workflow and reclassified here.

## Instruction-by-instruction ledger

### `/implement` and delegated `/tdd`

| Registry IDs | Upstream instruction | Disposition | Dynamic-workflow behavior | Why it differs |
| --- | --- | --- | --- | --- |
| `IMP-01` | Implement the work described by the user's spec or tickets. | Pre-resolved | The implementer receives one complete implementation or remediation ticket plus its parent spec. It must read both before editing. | A graph worker owns one bounded ticket rather than the whole parent effort. |
| `IMP-02`, `TDD-06` | Use `/tdd` only at pre-agreed seams. | Pre-resolved | Testing Decisions in the ticket and parent spec are the agreement. The implementer uses only those public seams. | Detached background agents cannot safely invent a seam. |
| `TDD-07`, `TDD-16` | **TDD seam confirmation:** identify the public interface, write down its test seams, and confirm them with the user. | Replaced | The foreground spec/ticket process must record the confirmed seams. If they are absent or ambiguous, the implementer stops and reports a blocker. | The workflow converts an interactive question into a required input and fails closed when it is missing. |
| `TDD-01`–`TDD-05`, `TDD-14`–`TDD-15` | Apply every TDD section during every cycle; consult the test and mocking guidance; read `CONTEXT.md`, respect ADRs, and test observable behavior at public seams. | Preserved | The implementer follows the complete embedded `/tdd` instructions in its assigned repository worktree. | No orchestration change is needed. |
| `TDD-08`–`TDD-10`, `TEST-01`–`TEST-13` | Use integration-style tests and avoid implementation coupling, tautologies, and horizontal slicing. Tests use public APIs, survive refactors, describe what rather than how, contain one logical assertion, verify through the interface, and use independent expected values. | Preserved | The complete `/tdd` and `tests.md` sources are embedded in the implementer role. | These are evaluation rules, not control-flow instructions. |
| `MOCK-01`–`MOCK-15` | Mock only system boundaries; design those boundaries for mockability; do not mock owned internals; use dependency injection and operation-specific SDK-style interfaces with simple, typed test doubles. | Preserved | The complete `mocking.md` source is embedded in the implementer role. | The workflow does not alter test-boundary design guidance. |
| `TDD-11`–`TDD-12` | Red before green, one vertical slice at a time. | Preserved | The implementer follows one failing test, one minimal implementation, and no speculative work per cycle. | No orchestration change is needed. |
| `TDD-13` | Refactoring is outside the TDD loop and belongs to the review stage. | Preserved | The implementer never refactors during red → green. Review may identify changes that a fresh remediation implementer performs afterward. | Remediation is a workflow extension, not delegation of the TDD-loop rule to a read-only reviewer. |
| `IMP-03`–`IMP-05` | Run typechecking and focused tests regularly, then the full suite once at the end. | Preserved | The implementer performs the upstream checks. The coordinator additionally runs repository-required integrated verification. | Graph integration needs evidence beyond a ticket's isolated suite. |
| `IMP-06` | **`/code-review` invocation:** once implementation is done, use `/code-review`. | Delegated | The implementer returns a clean candidate commit. The workflow validates it and launches fresh Standards and Spec sessions. | A code-writing session must never review its own work. |
| `IMP-07` | Commit work to the **current branch**. | Pre-resolved | “Current branch” means the assigned persistent issue branch in the assigned absolute worktree. The implementer commits there and returns the exact SHA. | Multiple tickets can run concurrently without touching the user's checkout. |

### `/code-review`

| Registry IDs | Upstream instruction | Disposition | Dynamic-workflow behavior | Why it differs |
| --- | --- | --- | --- | --- |
| `REVIEW-01`, `REVIEW-40`–`REVIEW-41` | Review the change independently against both Standards and Spec using the original axis questions. | Preserved | Every ticket candidate and the final integrated branch receive both axes. | No evaluation change is needed. |
| `REVIEW-04` | **Fixed-point selection:** use the fixed point supplied by the user. | Pre-resolved | Ticket review uses the validated ticket base SHA; final review uses the pinned parent base SHA. | The fixed point is durable coordinator-owned Git state. |
| `REVIEW-05` | Ask for a fixed point when absent. | Replaced | The coordinator derives an exact fixed point or the workflow stops. | Detached reviewers do not acquire conversational state. |
| `REVIEW-06`–`REVIEW-09` | Resolve the fixed point, reject a bad ref or empty diff, and capture the three-dot diff and commit list before review. | Delegated | A read-only coordinator session proves all of this before reviewers run. | Reviewers receive one immutable candidate and cannot move the target. |
| `REVIEW-11` | Use a spec path supplied by the user. | Pre-resolved | The `/implement-tickets` parent argument identifies the authoritative parent source. | The graph has an explicit scope root. |
| `REVIEW-10`, `REVIEW-12` | Discover a spec from commit references or branch-matching repository files. | Replaced | Bootstrap resolves the explicit parent and its tracker relationships instead of guessing from commit or branch names. | Heuristic discovery is too ambiguous for automated graph mutation. |
| `REVIEW-13` | Ask the user when no spec is found. | Replaced | Missing or ambiguous specification data produces a safe hold. | Detached runs cannot wait on an unplanned conversation. |
| `REVIEW-14`, `REVIEW-34` | **Missing-spec behavior:** skip the Spec agent and report `no spec available`. | Replaced | Both ticket-level review axes are mandatory before integration. | Integrating without a Spec gate would weaken acceptance. |
| `REVIEW-15` | Find repository standards. | Delegated | Coordinator validation records canonical standards paths; the Standards role reads them. | Discovery and evaluation remain separate. |
| `REVIEW-16`–`REVIEW-19`, `REVIEW-42`, `SMELL-01`–`SMELL-12` | Match each complete Fowler smell definition and remedy against the diff, while preserving repository precedence, judgement-call labels, and tooling deduplication. | Preserved | The entire baseline and its rules remain embedded in the Standards role. | No evaluation rule changes. |
| `REVIEW-03` | Run **`/setup-matt-pocock-skills`** when tracker instructions are missing. | Not executed | Tracker support is a workflow prerequisite; bootstrap holds when it cannot operate the tracker. | A background run cannot mutate the user's skill configuration. |
| `REVIEW-02` | **Parallel review agents:** run both axes in parallel, isolated contexts, then aggregate. | Delegated | The outer workflow owns parallel sessions; the final reporter owns aggregation. | No reviewer creates or supervises its peer. |
| `REVIEW-20`–`REVIEW-21` | Use two `Agent` calls with general-purpose sub-agents. | Replaced | `parallel()` launches named, read-only Standards and Spec agent types. | Named roles bind tools, axis prompts, model routing, retries, and isolation. |
| `REVIEW-22`–`REVIEW-23`, `REVIEW-39`, `REVIEW-43` | Supply both agents' diff and commit list, plus the standards sources, smell baseline, and spec path or fetched contents. | Pre-resolved | The workflow validates and supplies each input through explicit prompt-data boundaries. | Automated integration requires machine-verifiable provenance. |
| `REVIEW-24`–`REVIEW-28` | Standards must cite rule violations, name and quote smell hunks, distinguish hard findings from judgement calls, skip tooling-enforced issues, and stay under 400 words. | Preserved | The Standards role executes the complete brief and returns the original report plus mirrored structured findings. | Structure drives gates without replacing upstream evidence. |
| `REVIEW-29`–`REVIEW-33` | Spec must find missing or partial requirements, scope creep, and incorrect implementations; quote the spec; stay under 400 words. | Preserved | The Spec role executes the complete brief and returns the original report plus mirrored structured findings. | No Spec evaluation rule changes. |
| `REVIEW-35` | **Review aggregation:** preserve separate `## Standards` and `## Spec` reports verbatim or lightly cleaned. | Delegated | Ticket evidence remains separate; the final reporter performs user-facing aggregation. | Review, integration, and reporting use separate least-privilege sessions. |
| `REVIEW-36`–`REVIEW-38` | Do not merge or rerank axes; report counts and the worst issue within each axis so neither masks the other. | Preserved | Coordinator gates and final reporting retain independent axis meaning. | The upstream two-axis model remains the reporting contract. |

## Deliberate operational omissions

The following operations remain visible in the verbatim source blocks but do not execute in their original location:

1. **Mid-run user questions.** Detached agents do not ask for a fixed point, spec, or testing seam. The workflow pre-resolves the answer or stops safely.
2. **Spec-axis skipping.** The workflow does not use the upstream `no spec available` success path. An implementation ticket cannot integrate without both axes.
3. **Automatic tracker-skill setup.** The workflow does not run `/setup-matt-pocock-skills`; tracker support is a prerequisite.
4. **Nested review-agent creation.** Standards and Spec roles do not invoke sub-agents. The outer workflow creates both sessions in parallel.
5. **Self-initiated review by the implementer.** The implementer does not invoke the slash command itself. It returns a candidate to the workflow-owned review stage.
6. **Single-session end-to-end ownership.** No one agent implements, reviews, fixes, integrates, and reports the same change.

These are control-flow omissions, not silent deletions of review criteria. Any future change to this list requires an explicit compatibility decision and a test.

## Workflow extensions

Matt Pocock's skills describe implementation and review of one change. `implement-tickets` adds the machinery needed to apply that contract safely across a resumable dependency graph:

- dependency-frontier scheduling and bounded parallel implementation;
- persistent issue branches and worktrees outside the user's checkout;
- separate implementer, Standards, Spec, coordinator, and final-reporter sessions;
- exact branch, worktree, base-SHA, candidate-SHA, reviewed-SHA, and integration provenance checks;
- structured P0–P3 findings, where P0/P1 block integration;
- durable remediation tickets handled by fresh implementers and fresh reviewers;
- integrated verification and a second two-axis review of the whole coordinator branch;
- durable operational holds for missing reviewer output instead of treating outages as code findings;
- publication only from the accepted, reviewed coordinator SHA; and
- optional pull-request creation without automatic merge or parent-spec closure.

Extensions may consume upstream reports, but they must not rewrite findings, merge the two axes, weaken a test or review rule, or let a code-writing session approve itself.

## Upgrading the pinned skills

Treat an upstream version change as a contract migration, not a file refresh. Use this sequence.

### 1. Diff upstream before editing the workflow

- Select an immutable upstream tag or commit and verify its license and provenance.
- Diff every currently vendored file against its replacement, including referenced support files.
- Record additions, deletions, wording changes, new tool assumptions, new interactive questions, and changed output requirements.
- Do not copy new bytes into runtime roles until the semantic diff is understood.

### 2. Reclassify every changed instruction

For each changed instruction, choose exactly one primary disposition: `Preserved`, `Pre-resolved`, `Delegated`, `Replaced`, or `Not executed`. Record workflow extensions in the registry entry's support and note fields, never as a disposition.

- Update the corresponding registry entry and summary row in this ledger.
- Add a row for every new upstream instruction.
- Explain every replacement or non-executed operation.
- Check whether a previously safe adaptation now contradicts the upstream text.
- Never treat verbatim prompt inclusion as proof that runtime behavior still matches.

Use this worksheet in the pull request:

| Registry ID and exact upstream quote | Old behavior | New upstream behavior | Primary disposition | Runtime owner | Workflow support | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| _Fill one row per semantic change._ | | | | | | |

### 3. Update vendored bytes and provenance

- Copy the immutable upstream files byte-for-byte under `vendor/mattpocock-skills/<version>/`.
- Preserve upstream copyright and license material in `THIRD_PARTY_NOTICES.md`.
- Update pinned commit, version, SHA-256 expectations, and `.gitattributes` LF coverage.
- Keep old vendored versions only when a released artifact or migration test still requires them.

### 4. Update runtime roles and orchestration together

- Replace the verbatim source blocks in every affected role without editing upstream bytes.
- Keep workflow-owned adaptations outside those blocks and label them.
- Add any newly required pre-resolved input to coordinator capture, validation, schemas, and reviewer prompts.
- Revisit tool permissions, model routing, retries, structured fields, and untrusted-data boundaries when upstream assumptions change.
- Update this ledger, `docs/upstream-contract.json`, the README summary, `CONTRIBUTING.md`, and a draft of the GitHub release notes in the same pull request.
- When any generated installation artifact changes, bump `package.json` and `package-lock.json` together, for example with `npm version <version> --no-git-tag-version`.

### 5. Run adversarial and fidelity verification

At minimum, validate installation against a disposable home before merge:

```bash
npm test
git diff --check
TEMP_HOME="$(mktemp -d)"
HOME="$TEMP_HOME" USERPROFILE="$TEMP_HOME" npm run install:global
HOME="$TEMP_HOME" USERPROFILE="$TEMP_HOME" npm run check:global
rm -rf "$TEMP_HOME"
```

Do not use a contributor's real Pi home for pre-merge force, upgrade, or uninstall testing.

The tests must prove:

- vendored hashes and licenses match the selected immutable source;
- every required role contains the complete byte-exact source;
- line endings preserve byte identity on Linux, macOS, and Windows;
- orchestration supplies every input required by the new prompts;
- reports remain bound to the exact axis and candidate SHA;
- repository-controlled data cannot escape its prompt-data boundary; and
- the installed workflow source, saved command, roles, and manifest match the canonical repository.

Add focused red tests for every changed instruction before changing runtime behavior.

### 6. Review and release the migration

- Run fresh Standards and Spec reviews over the complete migration diff.
- Ask both reviewers to compare the new upstream contract, this ledger, runtime roles, workflow prompts, and tests.
- Require cross-platform CI on the exact candidate commit before merge and again on the exact merge commit.
- Publish a GitHub release and tag that exact merge commit. The release notes must name every changed classification and any installation migration.
- Only after the release exists, upgrade the real installation without force, run `npm run check:global`, verify the installation manifest and canonical/saved workflow identity, and run a saved-command smoke test.
- Keep the previous release supported until the new installation and rollback boundaries are verified.

A migration is complete only when every upstream semantic change has a ledger row, a runtime owner, and evidence. Unclassified changes are release blockers.

## Evidence and source locations

| Concern | Canonical source |
| --- | --- |
| Pinned upstream bytes and license | [`vendor/mattpocock-skills/v1.1.0`](../vendor/mattpocock-skills/v1.1.0) |
| Implement and TDD runtime contract | [`agents/ticket-implementer.md`](../agents/ticket-implementer.md) |
| Standards runtime contract | [`agents/ticket-standards-reviewer.md`](../agents/ticket-standards-reviewer.md) |
| Spec runtime contract | [`agents/ticket-spec-reviewer.md`](../agents/ticket-spec-reviewer.md) |
| Aggregation contract | [`agents/ticket-final-reporter.md`](../agents/ticket-final-reporter.md) |
| Orchestration and structured gates | [`workflow/implement-tickets.js`](../workflow/implement-tickets.js) |
| Machine-checkable instruction registry | [`docs/upstream-contract.json`](upstream-contract.json) |
| Byte, mapping, and documentation tests | [`test/upstream-prompt-fidelity.test.mjs`](../test/upstream-prompt-fidelity.test.mjs) |
| Third-party attribution | [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) |
