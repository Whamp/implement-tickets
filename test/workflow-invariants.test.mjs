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
  new vm.Script(`${helperSource}\nglobalThis.helpers = {\n  allowedCompletionKeys,\n  preparedWaveIsCoherent,\n  remediationTransitionIsCoherent,\n  stateTransitionIsCoherent,\n}\n`).runInContext(context)
  return context.helpers
}

const loadRoutingHelpers = async () => {
  const source = await readFile(workflowPath, 'utf8')
  const bootstrapOffset = source.indexOf("\nphase('Bootstrap')")
  assert.notEqual(bootstrapOffset, -1)
  const helperSource = source
    .slice(0, bootstrapOffset)
    .replace(/^export const meta =/u, 'const meta =')
  const context = vm.createContext({ args: {}, cwd: repositoryRoot })
  new vm.Script(`${helperSource}\nglobalThis.routingHelpers = {\n  finalReportModelTier,\n  implementationModelTier,\n  missingReviewAxes,\n  ticketReviewModelTier,\n}\n`).runInContext(context)
  return context.routingHelpers
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
  baseSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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

test('model routing spends Big on Spec review and remediation implementation', async () => {
  const {
    finalReportModelTier,
    implementationModelTier,
    ticketReviewModelTier,
  } = await loadRoutingHelpers()

  assert.equal(implementationModelTier('implementation'), 'medium')
  assert.equal(implementationModelTier('remediation'), 'big')
  assert.equal(ticketReviewModelTier('Standards'), 'medium')
  assert.equal(ticketReviewModelTier('Spec'), 'big')
  assert.equal(finalReportModelTier, 'medium')
})

test('missing reviewer results are classified by axis as operational failures', async () => {
  const { missingReviewAxes } = await loadRoutingHelpers()
  const reviewIndex = [
    { axis: 'Standards', key: 'T' },
    { axis: 'Spec', key: 'T' },
    { axis: 'Standards', key: 'U' },
    { axis: 'Spec', key: 'U' },
  ]
  const reviews = [
    { axis: 'Standards', ticketKey: 'T' },
    null,
    null,
    { axis: 'Spec', ticketKey: 'U' },
  ]

  assert.deepEqual([...missingReviewAxes(reviews, reviewIndex, 'T')], ['Spec'])
  assert.deepEqual([...missingReviewAxes(reviews, reviewIndex, 'U')], ['Standards'])
  assert.deepEqual([...missingReviewAxes(reviews, reviewIndex, 'unknown')], [])
})

test('prepared wave binds every assignment to graph metadata and captured HEAD', async () => {
  const { preparedWaveIsCoherent } = await loadHelpers()
  const tickets = [ticket({ key: 'T' }), ticket({ key: 'U' })]
  const state = stateWith(tickets)
  const waveTarget = {
    baseSha: state.baseSha,
    candidateSha: 'cccccccccccccccccccccccccccccccccccccccc',
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
    coordinatorBranch: state.coordinatorBranch,
    coordinatorHead: waveTarget.candidateSha,
    coordinatorWorktree: state.coordinatorWorktree,
    ok: true,
    reason: '',
    userCheckoutUnchanged: true,
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
  const coordinatorReuse = {
    ...prepared,
    prepared: [
      {
        ...prepared.prepared[0],
        branch: state.coordinatorBranch,
        worktree: state.coordinatorWorktree,
      },
      prepared.prepared[1],
    ],
  }
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    coordinatorReuse,
    { ...validated, assignments: coordinatorReuse.prepared },
    waveTarget,
  ), false)
  const relativeWorktree = {
    ...prepared,
    prepared: [
      { ...prepared.prepared[0], worktree: 'relative/worktree' },
      prepared.prepared[1],
    ],
  }
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    relativeWorktree,
    { ...validated, assignments: relativeWorktree.prepared },
    waveTarget,
  ), false)
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    prepared,
    { ...validated, coordinatorHead: 'dddddddddddddddddddddddddddddddddddddddd' },
    waveTarget,
  ), false)
  const coordinatorAlias = {
    ...prepared,
    prepared: [
      {
        ...prepared.prepared[0],
        worktree: '/worktrees/parent/other/../coordinator',
      },
      prepared.prepared[1],
    ],
  }
  assert.equal(preparedWaveIsCoherent(
    state,
    tickets,
    coordinatorAlias,
    { ...validated, assignments: coordinatorAlias.prepared },
    waveTarget,
  ), false)
})

test('integration completion is limited to the source remediation chain', async () => {
  const { allowedCompletionKeys } = await loadHelpers()
  const state = stateWith([
    ticket({ blockedBy: ['R1'], key: 'T', status: 'blocked' }),
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
    ticket({
      chainRootKey: 'T',
      continuationBaseSha: 'SIBLING',
      key: 'SIBLING',
      kind: 'remediation',
      remediationDepth: 2,
    }),
    ticket({ key: 'U' }),
  ])

  assert.deepEqual([...allowedCompletionKeys(state, 'R2')], ['R1', 'R2', 'T'])

  const branchedState = stateWith([
    ...state.tickets,
    ticket({
      blockedBy: ['R2'],
      chainRootKey: 'T',
      continuationBaseSha: 'BRANCH',
      key: 'BRANCH',
      kind: 'remediation',
      remediationDepth: 2,
      status: 'blocked',
    }),
  ])
  assert.deepEqual([...allowedCompletionKeys(branchedState, 'R2')], [])
})

test('state transition preserves immutable identity for every existing ticket', async () => {
  const { stateTransitionIsCoherent } = await loadHelpers()
  const remediation = ticket({
    chainRootKey: 'T',
    continuationBaseSha: 'CANDIDATE',
    key: 'R1',
    kind: 'remediation',
    remediationDepth: 1,
  })
  const before = stateWith([
    ticket({ blockedBy: ['R1'], key: 'T', status: 'blocked' }),
    remediation,
  ])
  const after = stateWith([
    ticket({ blockedBy: ['R1'], key: 'T', status: 'blocked' }),
    { ...remediation, continuationBaseSha: 'REWRITTEN' },
  ])

  assert.equal(stateTransitionIsCoherent(before, after, [], []), false)
})

test('remediation transition proves exact insertion and source blocking', async () => {
  const { remediationTransitionIsCoherent } = await loadHelpers()
  const before = stateWith([ticket({ key: 'T' })])
  const action = {
    chainRootKey: 'T',
    continuationBaseSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
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
      continuationBaseSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
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
