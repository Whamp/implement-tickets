import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repositoryRoot, 'workflow', 'implement-tickets.js')
const roleNames = [
  'ticket-final-reporter',
  'ticket-graph-coordinator',
  'ticket-implementer',
  'ticket-spec-reviewer',
  'ticket-standards-reviewer',
]

const assertPortable = (source, sourcePath) => {
  assert.doesNotMatch(source, /\/home\/[a-z0-9_-]+/iu, `${sourcePath} contains a Linux user path`)
  assert.doesNotMatch(source, /\/Users\/[a-z0-9_-]+/iu, `${sourcePath} contains a macOS user path`)
  assert.doesNotMatch(source, /\bWill\b/u, `${sourcePath} contains a user-specific name`)
}

test('canonical workflow is portable and runtime-parseable', async () => {
  const source = await readFile(workflowPath, 'utf8')

  assert.match(source, /^export const meta = \{/u)
  assertPortable(source, workflowPath)
  assert.doesNotMatch(source, /\.agents\/skills\//u)

  const runnableSource = source.replace(/^export const meta =/u, 'const meta =')
  new vm.Script(`(async () => {\n${runnableSource}\n})()`, {
    filename: workflowPath,
  })
})

test('all workflow agent roles are portable and bound by the workflow', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  for (const roleName of roleNames) {
    const rolePath = path.join(repositoryRoot, 'agents', `${roleName}.md`)
    const role = await readFile(rolePath, 'utf8')

    assertPortable(role, rolePath)
    assert.match(role, new RegExp(`^name: ${roleName}$`, 'mu'))
    assert.match(workflow, new RegExp(`agentType: '${roleName}'`, 'u'))
  }
})
