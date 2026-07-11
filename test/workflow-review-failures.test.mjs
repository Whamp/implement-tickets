import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repositoryRoot, 'workflow', 'implement-tickets.js')
const baseSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const waveSha = 'cccccccccccccccccccccccccccccccccccccccc'
const candidateSha = 'dddddddddddddddddddddddddddddddddddddddd'

const implementationTicket = (status = 'open') => ({
  blockedBy: [],
  chainRootKey: 'T',
  continuationBaseSha: '',
  coordinatorSha: '',
  integratedCandidateSha: '',
  key: 'T',
  kind: 'implementation',
  reference: 'issue:T',
  remediationDepth: 0,
  status,
  title: 'Ticket T',
  verificationPassed: false,
})

const graphState = ({ runnable = true, status = 'open', stopReason = '' } = {}) => ({
  allDone: false,
  baseBranch: 'main',
  baseSha,
  coordinatorBranch: 'epic/parent',
  coordinatorWorktree: '/worktrees/parent/coordinator',
  ok: true,
  parentReference: 'issue:parent',
  parentTitle: 'Parent',
  repoRoot: '/repo',
  runnableKeys: runnable ? ['T'] : [],
  stopReason,
  tickets: [implementationTicket(status)],
})

const action = (sourceKey, details) => ({
  completedKeys: [],
  coordinatorSha: '',
  createdTicketKey: '',
  createdTicketReference: '',
  details,
  sourceKey,
  status: 'needs_attention',
})

const runWorkflow = async (respond) => {
  const source = await readFile(workflowPath, 'utf8')
  const runnableSource = source.replace(/^export const meta =/u, 'const meta =')
  const calls = []
  const context = vm.createContext({
    agent: async (prompt, options) => {
      calls.push({ options, prompt })
      return respond(options.label, options, prompt)
    },
    args: { parent: 'issue:parent', pr: false },
    cwd: repositoryRoot,
    parallel: async (thunks) => Promise.all(thunks.map((thunk) => thunk())),
    phase: () => {},
  })
  const result = await new vm.Script(`(async () => {\n${runnableSource}\n})()`, {
    filename: workflowPath,
  }).runInContext(context)
  return { calls, result }
}

const callFor = (calls, label) => calls.find((call) => call.options.label === label)

test('missing ticket reviewer becomes operational needs-attention without remediation', async () => {
  const initialState = graphState()
  const preparedAssignment = {
    baseSha: waveSha,
    branch: 'issue/T',
    chainRootKey: 'T',
    key: 'T',
    kind: 'implementation',
    reference: 'issue:T',
    remediationDepth: 0,
    title: 'Ticket T',
    worktree: '/worktrees/parent/T',
  }
  const afterReviewFailure = graphState({
    runnable: false,
    status: 'needs_attention',
    stopReason: 'Ticket T needs a fresh Spec reviewer.',
  })

  const { calls, result } = await runWorkflow(async (label) => {
    if (label === 'bootstrap graph') {
      return initialState
    }
    if (label === 'capture wave target 1') {
      return { baseSha, candidateSha: waveSha, clean: true, ok: true, reason: '', worktree: initialState.coordinatorWorktree }
    }
    if (label === 'prepare wave 1') {
      return { failed: [], prepared: [preparedAssignment] }
    }
    if (label === 'validate preparation 1') {
      return {
        assignments: [preparedAssignment],
        coordinatorBranch: initialState.coordinatorBranch,
        coordinatorHead: waveSha,
        coordinatorWorktree: initialState.coordinatorWorktree,
        ok: true,
        reason: '',
        userCheckoutUnchanged: true,
      }
    }
    if (label === 'implement 1.1 T') {
      return {
        baseSha: waveSha,
        blockers: [],
        branch: preparedAssignment.branch,
        candidateSha,
        key: 'T',
        ok: true,
        status: 'implemented',
        summary: 'Implemented T.',
        verification: ['tests passed'],
        worktree: preparedAssignment.worktree,
      }
    }
    if (label === 'validate candidate 1.1 T') {
      return {
        baseSha: waveSha,
        branch: preparedAssignment.branch,
        candidateSha,
        key: 'T',
        ok: true,
        reason: '',
        worktree: preparedAssignment.worktree,
      }
    }
    if (label === 'standards 1.1 T') {
      return {
        axis: 'Standards',
        findings: [],
        reviewedSha: candidateSha,
        summary: 'Standards pass.',
        ticketKey: 'T',
        verdict: 'pass',
      }
    }
    if (label === 'spec 1.1 T') {
      return null
    }
    if (label === 'record review failure 1 T') {
      return action('T', 'Spec reviewer unavailable after retries.')
    }
    if (label === 'inventory after wave 1') {
      return afterReviewFailure
    }
    if (label === 'final implementation report') {
      return 'hold: retry the missing Spec review'
    }
    throw new Error(`Unexpected agent call: ${label}`)
  })

  assert.equal(result.ok, false)
  assert.equal(result.verdict, 'hold')
  assert.equal(callFor(calls, 'implement 1.1 T').options.tier, 'medium')
  assert.equal(callFor(calls, 'standards 1.1 T').options.tier, 'medium')
  assert.equal(callFor(calls, 'spec 1.1 T').options.tier, 'big')
  assert.equal(callFor(calls, 'spec 1.1 T').options.retries, 2)
  assert.equal(callFor(calls, 'record review failure 1 T').options.tier, 'small')
  assert.equal(callFor(calls, 'final implementation report').options.tier, 'medium')
  assert.equal(calls.some((call) => call.options.label.startsWith('remediate review')), false)
})

test('missing final reviewer holds the parent without final remediation', async () => {
  const finalSha = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  const completedState = {
    ...graphState({ runnable: false, status: 'complete' }),
    allDone: true,
    tickets: [{
      ...implementationTicket('complete'),
      coordinatorSha: finalSha,
      integratedCandidateSha: candidateSha,
      verificationPassed: true,
    }],
  }

  const { calls, result } = await runWorkflow(async (label) => {
    if (label === 'bootstrap graph') {
      return completedState
    }
    if (label === 'capture final target 1') {
      return {
        baseSha,
        candidateSha: finalSha,
        clean: true,
        ok: true,
        reason: '',
        worktree: completedState.coordinatorWorktree,
      }
    }
    if (label === 'final standards 1') {
      return {
        axis: 'Standards',
        findings: [],
        reviewedSha: finalSha,
        summary: 'Final Standards pass.',
        ticketKey: 'parent',
        verdict: 'pass',
      }
    }
    if (label === 'final spec 1') {
      return null
    }
    if (label === 'record final review failure 1') {
      return action('parent', 'Final Spec reviewer unavailable after retries.')
    }
    if (label === 'final implementation report') {
      return 'hold: retry the final Spec review'
    }
    throw new Error(`Unexpected agent call: ${label}`)
  })

  assert.equal(result.ok, false)
  assert.equal(result.verdict, 'hold')
  assert.equal(callFor(calls, 'final standards 1').options.tier, 'big')
  assert.equal(callFor(calls, 'final standards 1').options.retries, 2)
  assert.equal(callFor(calls, 'final spec 1').options.tier, 'big')
  assert.equal(callFor(calls, 'final spec 1').options.retries, 2)
  assert.equal(callFor(calls, 'record final review failure 1').options.tier, 'small')
  assert.equal(callFor(calls, 'final implementation report').options.tier, 'medium')
  assert.equal(calls.some((call) => call.options.label.startsWith('publish final remediation')), false)
  assert.equal(calls.some((call) => call.options.label === 'publish integration'), false)
})
