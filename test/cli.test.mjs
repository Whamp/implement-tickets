import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const withTemporaryHome = async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'implement-tickets-cli-'))
  t.after(() => rm(home, { force: true, recursive: true }))
  return home
}

const runScript = (scriptName, home, ...arguments_) => spawnSync(
  process.execPath,
  [path.join(repositoryRoot, 'scripts', scriptName), ...arguments_],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
    },
  },
)

test('CLI installs, checks, and uninstalls the global workflow', async (t) => {
  const home = await withTemporaryHome(t)

  const beforeInstall = runScript('check.mjs', home)
  assert.equal(beforeInstall.status, 1)
  assert.match(beforeInstall.stderr, /not current/iu)
  const reportedPaths = beforeInstall.stderr
    .split('\n')
    .filter((line) => line.startsWith('missing: '))
    .map((line) => line.slice('missing: '.length))
  assert.equal(reportedPaths.length, 8)
  for (const reportedPath of reportedPaths) {
    const relativePath = path.relative(home, reportedPath)
    assert.equal(relativePath.startsWith('..') || path.isAbsolute(relativePath), false)
  }

  const installation = runScript('install.mjs', home)
  assert.equal(installation.status, 0, installation.stderr)
  assert.match(installation.stdout, /installed 8 artifacts/iu)

  const current = runScript('check.mjs', home)
  assert.equal(current.status, 0, current.stderr)
  assert.match(current.stdout, /installation is current/iu)

  const repeated = runScript('install.mjs', home)
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.match(repeated.stdout, /already current/iu)

  const removal = runScript('uninstall.mjs', home)
  assert.equal(removal.status, 0, removal.stderr)
  assert.match(removal.stdout, /removed 8 artifacts/iu)

  const afterRemoval = runScript('check.mjs', home)
  assert.equal(afterRemoval.status, 1)
})
