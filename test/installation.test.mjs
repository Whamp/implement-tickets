import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  checkInstallation,
  install,
  uninstall,
} from '../scripts/lib/installation.mjs'

const roleNames = [
  'ticket-final-reporter',
  'ticket-graph-coordinator',
  'ticket-implementer',
  'ticket-spec-reviewer',
  'ticket-standards-reviewer',
]

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

const withTemporaryHome = async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'implement-tickets-'))
  t.after(() => rm(home, { force: true, recursive: true }))
  return home
}

test('install creates a verifiable global workflow installation', async (t) => {
  const home = await withTemporaryHome(t)
  const installedAt = new Date('2026-07-11T01:00:00.000Z')

  const result = await install({ home, installedAt })

  assert.equal(result.changedPaths.length, 8)
  assert.equal(result.unchangedPaths.length, 0)

  const workflowSource = await readFile(
    path.join(home, '.pi', 'workflows', 'sources', 'implement-tickets.js'),
    'utf8',
  )
  const savedWorkflow = JSON.parse(await readFile(
    path.join(home, '.pi', 'workflows', 'saved', 'implement-tickets.json'),
    'utf8',
  ))

  assert.equal(savedWorkflow.name, 'implement-tickets')
  assert.equal(savedWorkflow.location, 'user')
  assert.equal(savedWorkflow.savedAt, installedAt.toISOString())
  assert.equal(savedWorkflow.script, workflowSource)
  assert.deepEqual(savedWorkflow.parameters, {
    parent: {
      type: 'string',
      description: 'Parent spec path, issue number, or issue URL',
      required: false,
    },
    pr: {
      type: 'boolean',
      description: 'Create or update an integration PR after acceptance',
      required: false,
      default: true,
    },
  })

  const manifest = JSON.parse(await readFile(
    path.join(home, '.pi', 'workflows', 'installations', 'implement-tickets.json'),
    'utf8',
  ))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.packageVersion, '0.1.0')
  assert.equal(Object.keys(manifest.files).length, 7)
  assert.equal(
    manifest.files['.pi/workflows/sources/implement-tickets.js'],
    sha256(workflowSource),
  )

  for (const roleName of roleNames) {
    const role = await readFile(path.join(home, '.pi', 'agents', `${roleName}.md`), 'utf8')
    assert.match(role, new RegExp(`^name: ${roleName}$`, 'mu'))
  }

  assert.deepEqual(await checkInstallation({ home }), {
    mismatchedPaths: [],
    missingPaths: [],
    ok: true,
  })
})

test('install is idempotent and protects locally modified files', async (t) => {
  const home = await withTemporaryHome(t)
  const firstInstalledAt = new Date('2026-07-11T01:00:00.000Z')
  const laterInstalledAt = new Date('2026-07-12T01:00:00.000Z')
  const savedPath = path.join(home, '.pi', 'workflows', 'saved', 'implement-tickets.json')
  const rolePath = path.join(home, '.pi', 'agents', 'ticket-implementer.md')

  await install({ home, installedAt: firstInstalledAt })
  const repeated = await install({ home, installedAt: laterInstalledAt })
  const repeatedSavedWorkflow = JSON.parse(await readFile(savedPath, 'utf8'))

  assert.equal(repeated.changedPaths.length, 0)
  assert.equal(repeated.unchangedPaths.length, 8)
  assert.equal(repeatedSavedWorkflow.savedAt, firstInstalledAt.toISOString())

  await writeFile(rolePath, 'local customization\n', 'utf8')
  await assert.rejects(
    install({ home, installedAt: laterInstalledAt }),
    (error) => error.code === 'INSTALL_CONFLICT' && error.paths.includes(rolePath),
  )

  const forced = await install({ force: true, home, installedAt: laterInstalledAt })
  const manifestPath = path.join(home, '.pi', 'workflows', 'installations', 'implement-tickets.json')
  assert.deepEqual(forced.changedPaths.sort(), [rolePath, manifestPath].sort())
  assert.equal(forced.unchangedPaths.length, 6)
  assert.equal((await checkInstallation({ home })).ok, true)
})

test('uninstall removes only canonical artifacts unless forced', async (t) => {
  const home = await withTemporaryHome(t)
  const rolePath = path.join(home, '.pi', 'agents', 'ticket-spec-reviewer.md')

  await install({ home })
  const cleanRemoval = await uninstall({ home })
  assert.equal(cleanRemoval.removedPaths.length, 8)
  assert.equal(cleanRemoval.missingPaths.length, 0)
  assert.equal((await checkInstallation({ home })).missingPaths.length, 8)

  await install({ home })
  await writeFile(rolePath, 'local customization\n', 'utf8')

  await assert.rejects(
    uninstall({ home }),
    (error) => error.code === 'UNINSTALL_CONFLICT' && error.paths.includes(rolePath),
  )
  assert.equal((await checkInstallation({ home })).missingPaths.length, 0)

  const forcedRemoval = await uninstall({ force: true, home })
  assert.equal(forcedRemoval.removedPaths.length, 8)
  assert.equal((await checkInstallation({ home })).missingPaths.length, 8)
})

test('uninstall removes untouched artifacts recorded by an older manifest', async (t) => {
  const home = await withTemporaryHome(t)
  const sourcePath = path.join(home, '.pi', 'workflows', 'sources', 'implement-tickets.js')
  const manifestPath = path.join(home, '.pi', 'workflows', 'installations', 'implement-tickets.json')
  const relativeSourcePath = '.pi/workflows/sources/implement-tickets.js'

  await install({ home })
  const oldOfficialSource = "export const meta = { name: 'old_release' }\n"
  await writeFile(sourcePath, oldOfficialSource, 'utf8')
  const oldManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  oldManifest.packageVersion = '0.0.9'
  oldManifest.files[relativeSourcePath] = sha256(oldOfficialSource)
  await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`, 'utf8')

  const removal = await uninstall({ home })
  assert.equal(removal.removedPaths.length, 8)
  assert.equal((await checkInstallation({ home })).missingPaths.length, 8)
})

test('install upgrades untouched artifacts recorded by an older manifest', async (t) => {
  const home = await withTemporaryHome(t)
  const sourcePath = path.join(home, '.pi', 'workflows', 'sources', 'implement-tickets.js')
  const manifestPath = path.join(home, '.pi', 'workflows', 'installations', 'implement-tickets.json')
  const relativeSourcePath = '.pi/workflows/sources/implement-tickets.js'

  await install({ home, installedAt: new Date('2026-07-11T01:00:00.000Z') })
  const oldOfficialSource = "export const meta = { name: 'old_release' }\n"
  await writeFile(sourcePath, oldOfficialSource, 'utf8')
  const oldManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  oldManifest.packageVersion = '0.0.9'
  oldManifest.files[relativeSourcePath] = sha256(oldOfficialSource)
  await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`, 'utf8')

  const upgraded = await install({
    home,
    installedAt: new Date('2026-07-12T01:00:00.000Z'),
  })

  assert.equal(upgraded.changedPaths.includes(sourcePath), true)
  assert.equal(upgraded.changedPaths.includes(manifestPath), true)
  assert.equal((await readFile(sourcePath, 'utf8')).includes("name: 'old_release'"), false)
  assert.equal((await checkInstallation({ home })).ok, true)

  await unlink(manifestPath)
  const adopted = await install({
    home,
    installedAt: new Date('2026-07-13T01:00:00.000Z'),
  })
  assert.deepEqual(adopted.changedPaths, [manifestPath])
  assert.equal((await checkInstallation({ home })).ok, true)
})
