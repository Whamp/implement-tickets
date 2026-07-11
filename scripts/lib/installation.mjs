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

const readCanonicalFiles = async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, 'workflow', 'implement-tickets.js'),
    'utf8',
  )
  const roles = await Promise.all(roleNames.map(async (roleName) => ({
    roleName,
    content: await readFile(path.join(repositoryRoot, 'agents', `${roleName}.md`), 'utf8'),
  })))

  return { roles, workflow }
}

const installationArtifacts = async ({ home, installedAt }) => {
  const { roles, workflow } = await readCanonicalFiles()
  const sourcePath = path.join(home, '.pi', 'workflows', 'sources', 'implement-tickets.js')
  const savedPath = path.join(home, '.pi', 'workflows', 'saved', 'implement-tickets.json')
  const savedWorkflow = {
    ...savedWorkflowDefinition,
    script: workflow,
    path: savedPath,
    savedAt: installedAt.toISOString(),
  }

  return [
    { content: workflow, kind: 'text', path: sourcePath },
    ...roles.map(({ content, roleName }) => ({
      content,
      kind: 'text',
      path: path.join(home, '.pi', 'agents', `${roleName}.md`),
    })),
    {
      content: `${JSON.stringify(savedWorkflow, null, 2)}\n`,
      kind: 'saved-workflow',
      path: savedPath,
    },
  ]
}

const writeAtomically = async (targetPath, content) => {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${process.pid}`

  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, targetPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

const withoutSavedAt = (savedWorkflow) => {
  const { savedAt: _savedAt, ...stableDefinition } = savedWorkflow
  return stableDefinition
}

const artifactMatches = (artifact, actualContent) => {
  if (artifact.kind === 'text') return actualContent === artifact.content

  try {
    const actual = withoutSavedAt(JSON.parse(actualContent))
    const expected = withoutSavedAt(JSON.parse(artifact.content))
    return JSON.stringify(actual) === JSON.stringify(expected)
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
  const artifacts = await installationArtifacts({ home, installedAt })
  const inspected = await Promise.all(artifacts.map(async (artifact) => {
    const actualContent = await readInstalledArtifact(artifact.path)
    return {
      actualContent,
      artifact,
      matches: actualContent !== null && artifactMatches(artifact, actualContent),
    }
  }))
  const conflictingPaths = inspected
    .filter(({ actualContent, matches }) => actualContent !== null && !matches)
    .map(({ artifact }) => artifact.path)

  if (!force && conflictingPaths.length > 0) {
    throw new InstallationConflictError(conflictingPaths)
  }

  const changedPaths = []
  const unchangedPaths = []
  for (const { artifact, matches } of inspected) {
    if (matches) {
      unchangedPaths.push(artifact.path)
      continue
    }

    await writeAtomically(artifact.path, artifact.content)
    changedPaths.push(artifact.path)
  }

  return { changedPaths, unchangedPaths }
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
  const artifacts = await installationArtifacts({ home, installedAt: new Date(0) })
  const inspected = await Promise.all(artifacts.map(async (artifact) => {
    const actualContent = await readInstalledArtifact(artifact.path)
    return {
      actualContent,
      artifact,
      matches: actualContent !== null && artifactMatches(artifact, actualContent),
    }
  }))
  const conflictingPaths = inspected
    .filter(({ actualContent, matches }) => actualContent !== null && !matches)
    .map(({ artifact }) => artifact.path)

  if (!force && conflictingPaths.length > 0) {
    throw new UninstallConflictError(conflictingPaths)
  }

  const missingPaths = []
  const removedPaths = []
  for (const { actualContent, artifact } of inspected) {
    if (actualContent === null) {
      missingPaths.push(artifact.path)
      continue
    }

    await rm(artifact.path, { force: true })
    removedPaths.push(artifact.path)
  }

  return { missingPaths, removedPaths }
}

export const checkInstallation = async ({ home = os.homedir() } = {}) => {
  const artifacts = await installationArtifacts({ home, installedAt: new Date(0) })
  const mismatchedPaths = []
  const missingPaths = []

  for (const artifact of artifacts) {
    const actualContent = await readInstalledArtifact(artifact.path)
    if (actualContent === null) {
      missingPaths.push(artifact.path)
    } else if (!artifactMatches(artifact, actualContent)) {
      mismatchedPaths.push(artifact.path)
    }
  }

  return {
    mismatchedPaths,
    missingPaths,
    ok: mismatchedPaths.length === 0 && missingPaths.length === 0,
  }
}
