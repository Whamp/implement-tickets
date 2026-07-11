import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = path.join(
  repositoryRoot,
  'vendor',
  'mattpocock-skills',
  'v1.1.0',
)

const upstreamFiles = {
  'LICENSE': '0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5',
  'skills/engineering/code-review/SKILL.md': '6a65cc61114f96db07ec41e3920e67c9c5bf70dd6e0901eb9460ebcb2bdc209f',
  'skills/engineering/implement/SKILL.md': '6d3fd9e83b8f36e5213854779db49b256a457a7ebb4a503e53fa7dcff696adc3',
  'skills/engineering/tdd/SKILL.md': '5363bb2775679fe9311fbb67947f95359169c6e7f1fac77c0f25e190bca6cf2f',
  'skills/engineering/tdd/mocking.md': '3ceb807fdf4a47d6a93d4d9a891e5ba6d362a6247bd08adc451feebfc17361ef',
  'skills/engineering/tdd/tests.md': '859f9e592c188fda4fc7277dd180e4ce9c7a2e13f6efe1f6f29eccc9d28c106a',
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex')
const readUpstream = (relativePath) => readFile(path.join(upstreamRoot, relativePath), 'utf8')
const readRole = (name) => readFile(path.join(repositoryRoot, 'agents', `${name}.md`), 'utf8')

const assertContainsVerbatim = (prompt, source, description) => {
  assert.equal(
    prompt.includes(source),
    true,
    `${description} must contain the byte-exact upstream source`,
  )
}

test('verbatim source and its runtime containers use LF on every platform', async () => {
  const attributes = await readFile(path.join(repositoryRoot, '.gitattributes'), 'utf8')
  for (const pattern of [
    'agents/*.md text eol=lf',
    'THIRD_PARTY_NOTICES.md text eol=lf',
    'vendor/mattpocock-skills/v1.1.0/** text eol=lf',
  ]) {
    assert.equal(attributes.split(/\r?\n/u).includes(pattern), true, pattern)
  }
})

test('vendored Matt Pocock v1.1.0 prompt sources are byte-exact', async () => {
  for (const [relativePath, expectedHash] of Object.entries(upstreamFiles)) {
    const content = await readUpstream(relativePath)
    assert.equal(sha256(content), expectedHash, relativePath)
  }
})

test('implementer receives verbatim implement and delegated TDD sources', async () => {
  const implementer = await readRole('ticket-implementer')
  const requiredSources = [
    'skills/engineering/implement/SKILL.md',
    'skills/engineering/tdd/SKILL.md',
    'skills/engineering/tdd/tests.md',
    'skills/engineering/tdd/mocking.md',
  ]

  for (const relativePath of requiredSources) {
    assertContainsVerbatim(
      implementer,
      await readUpstream(relativePath),
      `ticket-implementer.md (${relativePath})`,
    )
  }

  assert.doesNotMatch(implementer, /Use red-green-refactor TDD\./u)
  assert.match(implementer, /ticket and parent spec define the pre-agreed seams/iu)
  assert.match(implementer, /workflow launches the independent code-review sessions/iu)
})

test('review roles receive the complete verbatim code-review skill', async () => {
  const codeReview = await readUpstream('skills/engineering/code-review/SKILL.md')

  for (const roleName of [
    'ticket-standards-reviewer',
    'ticket-spec-reviewer',
    'ticket-final-reporter',
  ]) {
    assertContainsVerbatim(await readRole(roleName), codeReview, `${roleName}.md`)
  }

  const finalReporter = await readRole('ticket-final-reporter')
  assert.match(finalReporter, /When both final axis reports are supplied/iu)
  assert.match(finalReporter, /When either final axis report is unavailable/iu)
})

test('workflow supplies the context required by the verbatim review prompts', async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, 'workflow', 'implement-tickets.js'),
    'utf8',
  )

  assert.match(workflow, /commitList/u)
  assert.match(workflow, /standardsSources/u)
  assert.match(workflow, /<untrusted-spec-sources-json>/u)
  assert.match(workflow, /git log .*\.\.HEAD --oneline/u)
  assert.match(workflow, /git diff .*\.\.\.HEAD/u)
  assert.match(workflow, /Do \*\*not\*\* merge or rerank findings/u)
  assert.match(workflow, /## Standards/u)
  assert.match(workflow, /## Spec/u)
})

test('README and notices identify the exact upstream contract and license', async () => {
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8')
  const notices = await readFile(path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const upstreamLicense = await readUpstream('LICENSE')

  assert.match(readme, /Matt Pocock(?:'s|’s) v1\.1\.0 `\/implement` and `\/code-review` skills/u)
  assert.match(readme, /d574778f94cf620fcc8ce741584093bc650a61d3/u)
  assert.match(readme, /verbatim/iu)
  assertContainsVerbatim(notices, upstreamLicense, 'THIRD_PARTY_NOTICES.md')
})

test('upstream adaptation ledger records control-flow changes and upgrade procedure', async () => {
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8')
  const contributing = await readFile(path.join(repositoryRoot, 'CONTRIBUTING.md'), 'utf8')
  const ledger = await readFile(
    path.join(repositoryRoot, 'docs', 'upstream-adaptations.md'),
    'utf8',
  )
  const registry = JSON.parse(await readFile(
    path.join(repositoryRoot, 'docs', 'upstream-contract.json'),
    'utf8',
  ))

  assert.match(readme, /\[upstream adaptation ledger\]\(docs\/upstream-adaptations\.md\)/iu)
  assert.match(contributing, /docs\/upstream-adaptations\.md/u)
  assert.match(ledger, /docs\/upstream-contract\.json/u)
  assert.match(ledger, /d574778f94cf620fcc8ce741584093bc650a61d3/u)
  assert.equal(registry.schemaVersion, 1)
  assert.equal(registry.upstream.version, 'v1.1.0')
  assert.equal(registry.upstream.commit, 'd574778f94cf620fcc8ce741584093bc650a61d3')

  for (const heading of [
    'Classification',
    'Instruction-by-instruction ledger',
    'Deliberate operational omissions',
    'Workflow extensions',
    'Upgrading the pinned skills',
  ]) {
    assert.match(ledger, new RegExp(`^## ${heading}$`, 'mu'))
  }

  for (const requiredContract of [
    'TDD seam confirmation',
    '`/code-review` invocation',
    'Fixed-point selection',
    'Missing-spec behavior',
    'Parallel review agents',
    'Review aggregation',
    '`/setup-matt-pocock-skills`',
    'Current branch',
  ]) {
    assert.equal(
      ledger.toLowerCase().includes(requiredContract.toLowerCase()),
      true,
      requiredContract,
    )
  }

  for (const upgradeStep of [
    'Diff upstream before editing the workflow',
    'Reclassify every changed instruction',
    'Update vendored bytes and provenance',
    'Update runtime roles and orchestration together',
    'Run adversarial and fidelity verification',
    'Review and release the migration',
  ]) {
    assert.equal(ledger.includes(upgradeStep), true, upgradeStep)
  }

  for (const releaseRequirement of [
    '`package.json` and `package-lock.json` together',
    'exact candidate commit',
    'exact merge commit',
    'GitHub release and tag',
  ]) {
    assert.equal(ledger.includes(releaseRequirement), true, releaseRequirement)
  }
  assert.doesNotMatch(ledger, /choose[^\n]+`Extended`/u)

  assert.match(
    ledger,
    /\| Registry ID and exact upstream quote \| Old behavior \| New upstream behavior \| Primary disposition \| Runtime owner \| Workflow support \| Verification \|/u,
  )
  assert.match(ledger, /\| _Fill one row per semantic change\._ \|/u)

  const disposableHomeSection = ledger.slice(
    ledger.indexOf('### 5. Run adversarial and fidelity verification'),
    ledger.indexOf('### 6. Review and release the migration'),
  )
  const disposableHomeSequence = [
    'TEMP_HOME="$(mktemp -d)"',
    'HOME="$TEMP_HOME" USERPROFILE="$TEMP_HOME" npm run install:global',
    'HOME="$TEMP_HOME" USERPROFILE="$TEMP_HOME" npm run check:global',
    'rm -rf "$TEMP_HOME"',
  ]
  let previousIndex = -1
  for (const step of disposableHomeSequence) {
    const stepIndex = disposableHomeSection.indexOf(step)
    assert.equal(stepIndex > previousIndex, true, step)
    previousIndex = stepIndex
  }

  const releaseSection = ledger.slice(
    ledger.indexOf('### 6. Review and release the migration'),
    ledger.indexOf('## Evidence and source locations'),
  )
  const releaseSequence = [
    'Publish a GitHub release and tag that exact merge commit.',
    'Only after the release exists',
    'upgrade the real installation without force',
    '`npm run check:global`',
    'verify the installation manifest and canonical/saved workflow identity',
    'saved-command smoke test',
  ]
  previousIndex = -1
  for (const step of releaseSequence) {
    const stepIndex = releaseSection.indexOf(step)
    assert.equal(stepIndex > previousIndex, true, step)
    previousIndex = stepIndex
  }

  const instructionRanges = {
    IMP: 7,
    TDD: 16,
    TEST: 13,
    MOCK: 15,
    REVIEW: 43,
    SMELL: 12,
  }
  const expectedIds = Object.entries(instructionRanges).flatMap(([prefix, count]) =>
    Array.from({ length: count }, (_, index) =>
      `${prefix}-${String(index + 1).padStart(2, '0')}`,
    ),
  )
  const actualIds = registry.instructions.map((instruction) => instruction.id)
  assert.deepEqual([...actualIds].sort(), [...expectedIds].sort())
  assert.equal(new Set(actualIds).size, actualIds.length)
  assert.match(readme, new RegExp(`anchors ${expectedIds.length} normative clauses`, 'u'))

  const allowedDispositions = new Set([
    'preserved',
    'pre-resolved',
    'delegated',
    'replaced',
    'not-executed',
  ])
  const allowedSources = new Set(Object.keys(upstreamFiles).filter((name) => name !== 'LICENSE'))
  const allowedOwners = new Set([
    'workflow/implement-tickets.js',
    'agents/ticket-final-reporter.md',
    'agents/ticket-graph-coordinator.md',
    'agents/ticket-implementer.md',
    'agents/ticket-spec-reviewer.md',
    'agents/ticket-standards-reviewer.md',
  ])
  const allowedSupport = new Set([...allowedOwners, 'README.md'])
  const allowedVerification = new Set([
    'test/upstream-prompt-fidelity.test.mjs',
    'test/workflow-contract.test.mjs',
    'test/workflow-invariants.test.mjs',
  ])
  for (const instruction of registry.instructions) {
    assert.equal(allowedDispositions.has(instruction.disposition), true, instruction.id)
    assert.equal(allowedSources.has(instruction.source), true, instruction.id)
    assert.equal(typeof instruction.preservesEvaluation, 'boolean', instruction.id)
    assert.equal(instruction.quote.trim().length > 0, true, instruction.id)
    assert.equal(instruction.note.trim().length > 0, true, instruction.id)
    assert.equal(instruction.owners.length > 0, true, instruction.id)
    assert.equal(instruction.support.length > 0, true, instruction.id)
    assert.equal(instruction.verification.length > 0, true, instruction.id)

    if (['preserved', 'pre-resolved', 'delegated'].includes(instruction.disposition)) {
      assert.equal(instruction.preservesEvaluation, true, instruction.id)
    }
    if (instruction.disposition === 'not-executed') {
      assert.equal(instruction.preservesEvaluation, false, instruction.id)
    }

    const upstreamSource = await readUpstream(instruction.source)
    assert.equal('expectedOccurrences' in instruction, false, instruction.id)
    assert.equal(
      upstreamSource.split(instruction.quote).length - 1,
      1,
      `${instruction.id}: quote anchor must occur exactly once`,
    )

    for (const [references, allowed, kind] of [
      [instruction.owners, allowedOwners, 'owner'],
      [instruction.support, allowedSupport, 'support'],
      [instruction.verification, allowedVerification, 'verification'],
    ]) {
      for (const reference of references) {
        assert.equal(path.posix.isAbsolute(reference), false, `${instruction.id}: ${kind}`)
        assert.equal(reference.includes('\\'), false, `${instruction.id}: ${kind}`)
        assert.equal(reference.split('/').includes('..'), false, `${instruction.id}: ${kind}`)
        assert.equal(allowed.has(reference), true, `${instruction.id}: ${kind} ${reference}`)
        await assert.doesNotReject(
          () => readFile(path.join(repositoryRoot, reference)),
          `${instruction.id}: ${reference}`,
        )
      }
    }

    if (instruction.disposition === 'replaced' || instruction.disposition === 'not-executed') {
      assert.equal(instruction.rationale.trim().length > 0, true, instruction.id)
    }
  }
})
