import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

const manifestRelativePath = '.pi/workflows/installations/implement-tickets.json'
const roleNames = [
  'ticket-final-reporter',
  'ticket-graph-coordinator',
  'ticket-implementer',
  'ticket-spec-reviewer',
  'ticket-standards-reviewer',
]

const savedWorkflowDefinition = {
  name: 'implement-tickets',
  description: 'Implement a parent spec ticket graph with independent implementation and two-axis review agents',
  parameters: {
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
  },
  location: 'user',
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

const homePath = (home, relativePath) => path.join(home, ...relativePath.split('/'))

const readCanonicalFiles = async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, 'workflow', 'implement-tickets.js'),
    'utf8',
  )
  const packageDefinition = JSON.parse(await readFile(
    path.join(repositoryRoot, 'package.json'),
    'utf8',
  ))
  const roles = await Promise.all(roleNames.map(async (roleName) => ({
    roleName,
    content: await readFile(path.join(repositoryRoot, 'agents', `${roleName}.md`), 'utf8'),
  })))

  return {
    packageVersion: packageDefinition.version,
    roles,
    workflow,
  }
}

const installationArtifacts = async ({ home, installedAt }) => {
  const { packageVersion, roles, workflow } = await readCanonicalFiles()
  const savedRelativePath = '.pi/workflows/saved/implement-tickets.json'
  const savedPath = homePath(home, savedRelativePath)
  const savedWorkflow = {
    ...savedWorkflowDefinition,
    script: workflow,
    path: savedPath,
    savedAt: installedAt.toISOString(),
  }

  return {
    artifacts: [
      {
        content: workflow,
        kind: 'text',
        path: homePath(home, '.pi/workflows/sources/implement-tickets.js'),
        relativePath: '.pi/workflows/sources/implement-tickets.js',
      },
      ...roles.map(({ content, roleName }) => {
        const relativePath = `.pi/agents/${roleName}.md`
        return {
          content,
          kind: 'text',
          path: homePath(home, relativePath),
          relativePath,
        }
      }),
      {
        content: `${JSON.stringify(savedWorkflow, null, 2)}\n`,
        kind: 'saved-workflow',
        path: savedPath,
        relativePath: savedRelativePath,
      },
    ],
    packageVersion,
  }
}

const withoutSavedAt = (savedWorkflow) => {
  const { savedAt: _savedAt, ...stableDefinition } = savedWorkflow
  return stableDefinition
}

const savedAtIsValid = (savedWorkflow) => typeof savedWorkflow.savedAt === 'string' &&
  !Number.isNaN(Date.parse(savedWorkflow.savedAt))

const artifactMatches = (artifact, actualContent) => {
  if (artifact.kind === 'text') return actualContent === artifact.content

  try {
    const actualSavedWorkflow = JSON.parse(actualContent)
    const expectedSavedWorkflow = JSON.parse(artifact.content)
    if (!savedAtIsValid(actualSavedWorkflow)) return false
    return JSON.stringify(withoutSavedAt(actualSavedWorkflow)) ===
      JSON.stringify(withoutSavedAt(expectedSavedWorkflow))
  } catch {
    return false
  }
}

const readInstalledArtifact = async (artifactPath) => {
  try {
    return await readFile(artifactPath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const manifestIsValid = (manifest) => manifest !== null &&
  typeof manifest === 'object' &&
  manifest.schemaVersion === 1 &&
  typeof manifest.packageVersion === 'string' &&
  typeof manifest.installedAt === 'string' &&
  !Number.isNaN(Date.parse(manifest.installedAt)) &&
  manifest.files !== null &&
  typeof manifest.files === 'object' &&
  !Array.isArray(manifest.files) &&
  Object.entries(manifest.files).every(([relativePath, hash]) => (
    typeof relativePath === 'string' &&
    /^[a-f0-9]{64}$/u.test(hash)
  ))

const readManifest = async (home) => {
  const manifestPath = homePath(home, manifestRelativePath)
  const content = await readInstalledArtifact(manifestPath)
  if (content === null) {
    return { content: null, manifest: null, path: manifestPath, valid: false }
  }

  try {
    const manifest = JSON.parse(content)
    return {
      content,
      manifest,
      path: manifestPath,
      valid: manifestIsValid(manifest),
    }
  } catch {
    return { content, manifest: null, path: manifestPath, valid: false }
  }
}

const createManifestContent = ({ artifacts, installedAt, packageVersion }) => {
  const files = Object.fromEntries(artifacts.map((artifact) => [
    artifact.relativePath,
    sha256(artifact.content),
  ]))
  return `${JSON.stringify({
    schemaVersion: 1,
    packageVersion,
    installedAt: installedAt.toISOString(),
    files,
  }, null, 2)}\n`
}

const manifestMatchesDesiredState = ({ desiredArtifacts, manifest, packageVersion }) => {
  if (!manifestIsValid(manifest) || manifest.packageVersion !== packageVersion) return false
  const desiredEntries = desiredArtifacts.map((artifact) => [
    artifact.relativePath,
    sha256(artifact.content),
  ])
  if (Object.keys(manifest.files).length !== desiredEntries.length) return false
  return desiredEntries.every(([relativePath, hash]) => manifest.files[relativePath] === hash)
}

const temporarySibling = (targetPath, purpose) => (
  `${targetPath}.${purpose}-${process.pid}-${randomUUID()}`
)

const applyWrites = async (changes) => {
  const staged = []
  const committed = []

  try {
    for (const change of changes) {
      await mkdir(path.dirname(change.path), { recursive: true })
      const temporaryPath = temporarySibling(change.path, 'tmp')
      await writeFile(temporaryPath, change.content, 'utf8')
      staged.push({ ...change, temporaryPath })
    }

    for (const change of staged) {
      const backupPath = change.hadOriginal
        ? temporarySibling(change.path, 'backup')
        : null
      if (backupPath !== null) await rename(change.path, backupPath)

      try {
        await rename(change.temporaryPath, change.path)
      } catch (error) {
        if (backupPath !== null) await rename(backupPath, change.path)
        throw error
      }
      committed.push({ ...change, backupPath })
    }
  } catch (error) {
    for (const change of committed.reverse()) {
      await rm(change.path, { force: true })
      if (change.backupPath !== null) await rename(change.backupPath, change.path)
    }
    for (const change of staged) {
      await rm(change.temporaryPath, { force: true })
    }
    throw error
  }

  for (const change of committed) {
    if (change.backupPath !== null) await rm(change.backupPath, { force: true })
  }
}

const applyRemovals = async (removals) => {
  const moved = []

  try {
    for (const removal of removals) {
      const backupPath = temporarySibling(removal.path, 'uninstall')
      await rename(removal.path, backupPath)
      moved.push({ ...removal, backupPath })
    }
  } catch (error) {
    for (const removal of moved.reverse()) {
      await rename(removal.backupPath, removal.path)
    }
    throw error
  }

  for (const removal of moved) {
    await rm(removal.backupPath, { force: true })
  }
}

export class InstallationConflictError extends Error {
  constructor(paths) {
    super(`Refusing to overwrite modified installation files:\n${paths.join('\n')}`)
    this.code = 'INSTALL_CONFLICT'
    this.name = 'InstallationConflictError'
    this.paths = paths
  }
}

export const install = async ({
  force = false,
  home = os.homedir(),
  installedAt = new Date(),
} = {}) => {
  const { artifacts, packageVersion } = await installationArtifacts({ home, installedAt })
  const manifestState = await readManifest(home)
  const inspected = await Promise.all(artifacts.map(async (artifact) => {
    const actualContent = await readInstalledArtifact(artifact.path)
    const recordedHash = manifestState.valid
      ? manifestState.manifest.files[artifact.relativePath]
      : undefined
    const actualMatchesRecorded = actualContent !== null &&
      recordedHash !== undefined &&
      sha256(actualContent) === recordedHash
    const matchesCanonical = actualContent !== null && artifactMatches(artifact, actualContent)
    return {
      actualContent,
      actualMatchesRecorded,
      artifact,
      matchesCanonical,
    }
  }))

  const conflictingPaths = []
  if (manifestState.content !== null && !manifestState.valid) {
    conflictingPaths.push(manifestState.path)
  }
  for (const item of inspected) {
    if (item.actualContent === null || item.matchesCanonical || item.actualMatchesRecorded) continue
    conflictingPaths.push(item.artifact.path)
  }
  if (!force && conflictingPaths.length > 0) {
    throw new InstallationConflictError(conflictingPaths)
  }

  const desiredArtifacts = inspected.map((item) => ({
    ...item.artifact,
    content: item.matchesCanonical ? item.actualContent : item.artifact.content,
  }))
  const artifactChanges = inspected
    .map((item, index) => ({
      content: desiredArtifacts[index].content,
      hadOriginal: item.actualContent !== null,
      path: item.artifact.path,
      shouldChange: item.actualContent === null || !item.matchesCanonical,
    }))
    .filter((change) => change.shouldChange)
  const shouldWriteManifest = manifestState.content === null ||
    artifactChanges.length > 0 ||
    !manifestMatchesDesiredState({
      desiredArtifacts,
      manifest: manifestState.manifest,
      packageVersion,
    })
  const manifestContent = createManifestContent({
    artifacts: desiredArtifacts,
    installedAt,
    packageVersion,
  })
  const changes = artifactChanges.map(({ shouldChange: _shouldChange, ...change }) => change)
  if (shouldWriteManifest) {
    changes.push({
      content: manifestContent,
      hadOriginal: manifestState.content !== null,
      path: manifestState.path,
    })
  }

  await applyWrites(changes)

  const changedPathSet = new Set(changes.map((change) => change.path))
  const allPaths = [...artifacts.map((artifact) => artifact.path), manifestState.path]
  return {
    changedPaths: allPaths.filter((artifactPath) => changedPathSet.has(artifactPath)),
    unchangedPaths: allPaths.filter((artifactPath) => !changedPathSet.has(artifactPath)),
  }
}

export class UninstallConflictError extends Error {
  constructor(paths) {
    super(`Refusing to remove modified installation files:\n${paths.join('\n')}`)
    this.code = 'UNINSTALL_CONFLICT'
    this.name = 'UninstallConflictError'
    this.paths = paths
  }
}

export const uninstall = async ({
  force = false,
  home = os.homedir(),
} = {}) => {
  const { artifacts } = await installationArtifacts({ home, installedAt: new Date(0) })
  const manifestState = await readManifest(home)
  const inspected = await Promise.all(artifacts.map(async (artifact) => {
    const actualContent = await readInstalledArtifact(artifact.path)
    const recordedHash = manifestState.valid
      ? manifestState.manifest.files[artifact.relativePath]
      : undefined
    return {
      actualContent,
      artifact,
      safe: actualContent === null ||
        (recordedHash !== undefined && sha256(actualContent) === recordedHash) ||
        artifactMatches(artifact, actualContent),
    }
  }))

  const conflictingPaths = []
  if (manifestState.content !== null && !manifestState.valid) {
    conflictingPaths.push(manifestState.path)
  }
  for (const item of inspected) {
    if (!item.safe) conflictingPaths.push(item.artifact.path)
  }
  if (!force && conflictingPaths.length > 0) {
    throw new UninstallConflictError(conflictingPaths)
  }

  const allInstalled = [
    ...inspected
      .filter((item) => item.actualContent !== null)
      .map((item) => ({ path: item.artifact.path })),
    ...(manifestState.content === null ? [] : [{ path: manifestState.path }]),
  ]
  await applyRemovals(allInstalled)

  const allPaths = [...artifacts.map((artifact) => artifact.path), manifestState.path]
  const removedPathSet = new Set(allInstalled.map((item) => item.path))
  return {
    missingPaths: allPaths.filter((artifactPath) => !removedPathSet.has(artifactPath)),
    removedPaths: allPaths.filter((artifactPath) => removedPathSet.has(artifactPath)),
  }
}

export const checkInstallation = async ({ home = os.homedir() } = {}) => {
  const { artifacts, packageVersion } = await installationArtifacts({
    home,
    installedAt: new Date(0),
  })
  const manifestState = await readManifest(home)
  const mismatchedPaths = new Set()
  const missingPaths = []

  if (manifestState.content === null) {
    missingPaths.push(manifestState.path)
  } else if (!manifestState.valid || manifestState.manifest.packageVersion !== packageVersion) {
    mismatchedPaths.add(manifestState.path)
  }

  for (const artifact of artifacts) {
    const actualContent = await readInstalledArtifact(artifact.path)
    if (actualContent === null) {
      missingPaths.push(artifact.path)
      continue
    }
    if (!artifactMatches(artifact, actualContent)) {
      mismatchedPaths.add(artifact.path)
    }
    if (manifestState.valid && manifestState.manifest.files[artifact.relativePath] !== sha256(actualContent)) {
      mismatchedPaths.add(artifact.path)
    }
  }

  if (manifestState.valid && Object.keys(manifestState.manifest.files).length !== artifacts.length) {
    mismatchedPaths.add(manifestState.path)
  }

  return {
    mismatchedPaths: [...mismatchedPaths],
    missingPaths,
    ok: mismatchedPaths.size === 0 && missingPaths.length === 0,
  }
}
