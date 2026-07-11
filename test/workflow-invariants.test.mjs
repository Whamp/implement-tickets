import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repositoryRoot, 'workflow', 'implement-tickets.js')

const loadHelpers = async () => {
  const source = await readFile(workflowPath, 'utf8')
  const bootstrapOffset = source.indexOf("\nphase('Bootstrap')")
  assert.notEqual(bootstrapOffset, -1)
  const helperSource = source
    .slice(0, bootstrapOffset)
    .replace(/^export const meta =/u, 'const meta =')
  const context = vm.createContext({ args: {}, cwd: repositoryRoot })
  new vm.Script(`${helperSource}\nglobalThis.helpers = {\n  allowedCompletionKeys,\n  preparedWaveIsCoherent,\n  remediationTransitionIsCoherent,\n}\n`).runInContext(context)
  return context.helpers
}

const ticket = ({
  blockedBy = [],
  chainRootKey,
  continuationBaseSha = '',
  key,
  kind = 'implementation',
  reference = `issue:${key}`,
  remediationDepth = 0,
  status = 'open',
  title = key,
}) => ({
  blockedBy,
  chainRootKey: chainRootKey ?? key,
  continuationBaseSha,
  coordinatorSha: '',
  integratedCandidateSha: '',
  key,
  kind,
  reference,
  remediationDepth,
  status,
  title,
  verificationPassed: false,
})

const stateWith = (tickets) => ({
  allDone: false,
  baseBranch: 'main',
  baseSha: 'BASE',
  coordinatorBranch: 'epic/parent',
  coordinatorWorktree: '/worktrees/parent/coordinator',
  ok: true,
  parentReference: 'issue:parent',
  parentTitle: 'Parent',
  repoRoot: '/repo',
  runnableKeys: tickets.filter((item) => item.status === 'open').map((item) => item.key),
  stopReason: '',
  tickets,
})

test('prepared wave binds every assignment to graph metadata and captured HEAD', async () => {
  const { preparedWaveIsCoherent } = await loadHelpers()
  const tickets = [ticket({ key: 'T' }), ticket({ key: 'U' })]
  const state = stateWith(tickets)
  const waveTarget = {
    baseSha: 'BASE',
    candidateSha: 'COORDINATOR_HEAD',
    clean: true,
    ok: true,
    worktree: state.coordinatorWorktree,
  }
  const prepared = {
    failed: [],
    prepared: tickets.map((item) => ({
      baseSha: waveTarget.candidateSha,
      branch: `issue/${item.key}`,
      chainRootKey: item.chainRootKey,
      key: item.key,
      kind: item.kind,
      reference: item.reference,
      remediationDepth: item.remediationDepth,
      title: item.title,
      worktree: `/worktrees/parent/${item.key}`,
    })),
  }
  const validated = {
    assignments: prepared.prepared,
    ok: true,
    reason: '',
  }

  assert.equal(preparedWaveIsCoherent(state, tickets, prepared, validated, waveTarget), true)
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    {
      ...prepared,
      prepared: [
        { ...prepared.prepared[0], reference: tickets[1].reference },
        prepared.prepared[1],
      ],
    },
    validated,
    waveTarget,
  ), false)
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    {
      ...prepared,
      prepared: [
        prepared.prepared[0],
        { ...prepared.prepared[1], worktree: prepared.prepared[0].worktree },
      ],
    },
    validated,
    waveTarget,
  ), false)
})

test('integration completion is limited to the source remediation chain', async () => {
  const { allowedCompletionKeys } = await loadHelpers()
  const state = stateWith([
    ticket({ key: 'T' }),
    ticket({
      blockedBy: ['R2'],
      chainRootKey: 'T',
      continuationBaseSha: 'C1',
      key: 'R1',
      kind: 'remediation',
      remediationDepth: 1,
      status: 'blocked',
    }),
    ticket({
      chainRootKey: 'T',
      continuationBaseSha: 'C2',
      key: 'R2',
      kind: 'remediation',
      remediationDepth: 2,
    }),
    ticket({ key: 'U' }),
  ])

  assert.deepEqual([...allowedCompletionKeys(state, 'R2')], ['R1', 'R2', 'T'])
})

test('remediation transition proves exact insertion and source blocking', async () => {
  const { remediationTransitionIsCoherent } = await loadHelpers()
  const before = stateWith([ticket({ key: 'T' })])
  const action = {
    chainRootKey: 'T',
    continuationBaseSha: 'CANDIDATE',
    createdTicketKey: 'R1',
    createdTicketReference: 'issue:R1',
    details: '',
    remediationDepth: 1,
    sourceKey: 'T',
    status: 'remediation_created',
  }
  const after = stateWith([
    ticket({ blockedBy: ['R1'], key: 'T', status: 'blocked' }),
    ticket({
      chainRootKey: 'T',
      continuationBaseSha: 'CANDIDATE',
      key: 'R1',
      kind: 'remediation',
      remediationDepth: 1,
      reference: 'issue:R1',
    }),
  ])

  assert.equal(remediationTransitionIsCoherent(before, after, [action]), true)
  assert.equal(remediationTransitionIsCoherent(before, after, [
    { ...action, continuationBaseSha: 'WRONG' },
  ]), false)
  assert.equal(remediationTransitionIsCoherent(before, before, [action]), false)
})
