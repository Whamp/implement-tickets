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
