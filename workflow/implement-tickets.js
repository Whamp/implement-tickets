export const meta = {
  name: 'implement_tickets',
  description: 'Implement a dependency graph of tickets with independent implementation and two-axis review sessions',
  phases: [
    { title: 'Bootstrap' },
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Integrate' },
    { title: 'Final review' },
    { title: 'Publish' },
    { title: 'Report' },
  ],
}

const parentInput = String(args.parent || args._ || '').trim()
const createPullRequest = String(args.pr === undefined ? 'true' : args.pr).toLowerCase() !== 'false'
const maxRemediationDepth = 3
const maxWaves = 100

const graphSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ok',
    'repoRoot',
    'parentReference',
    'parentTitle',
    'baseBranch',
    'baseSha',
    'coordinatorBranch',
    'coordinatorWorktree',
    'tickets',
    'runnableKeys',
    'allDone',
    'stopReason',
  ],
  properties: {
    ok: { type: 'boolean' },
    repoRoot: { type: 'string' },
    parentReference: { type: 'string' },
    parentTitle: { type: 'string' },
    baseBranch: { type: 'string' },
    baseSha: { type: 'string' },
    coordinatorBranch: { type: 'string' },
    coordinatorWorktree: { type: 'string' },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'key',
          'title',
          'reference',
          'status',
          'kind',
          'blockedBy',
          'remediationDepth',
          'continuationBaseSha',
          'chainRootKey',
          'integratedCandidateSha',
          'coordinatorSha',
          'verificationPassed',
        ],
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          reference: { type: 'string' },
          status: { type: 'string', enum: ['open', 'claimed', 'blocked', 'complete', 'needs_attention'] },
          kind: { type: 'string', enum: ['implementation', 'remediation'] },
          blockedBy: { type: 'array', items: { type: 'string' } },
          remediationDepth: { type: 'number', minimum: 0, maximum: 3 },
          continuationBaseSha: { type: 'string' },
          chainRootKey: { type: 'string' },
          integratedCandidateSha: { type: 'string' },
          coordinatorSha: { type: 'string' },
          verificationPassed: { type: 'boolean' },
        },
      },
    },
    runnableKeys: { type: 'array', items: { type: 'string' } },
    allDone: { type: 'boolean' },
    stopReason: { type: 'string' },
  },
}

const preparedSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prepared', 'failed'],
  properties: {
    prepared: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'key',
          'title',
          'reference',
          'kind',
          'remediationDepth',
          'chainRootKey',
          'branch',
          'worktree',
          'baseSha',
        ],
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          reference: { type: 'string' },
          kind: { type: 'string' },
          remediationDepth: { type: 'number', minimum: 0, maximum: 3 },
          chainRootKey: { type: 'string' },
          branch: { type: 'string' },
          worktree: { type: 'string' },
          baseSha: { type: 'string' },
        },
      },
    },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'reason'],
        properties: {
          key: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const implementationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'key',
    'ok',
    'status',
    'branch',
    'worktree',
    'baseSha',
    'candidateSha',
    'summary',
    'verification',
    'blockers',
  ],
  properties: {
    key: { type: 'string' },
    ok: { type: 'boolean' },
    status: { type: 'string' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    baseSha: { type: 'string' },
    candidateSha: { type: 'string' },
    summary: { type: 'string' },
    verification: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const candidateValidationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'key', 'branch', 'worktree', 'baseSha', 'candidateSha', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    key: { type: 'string' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    baseSha: { type: 'string' },
    candidateSha: { type: 'string' },
    reason: { type: 'string' },
  },
}

const reviewTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'baseSha', 'candidateSha', 'worktree', 'clean', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    baseSha: { type: 'string' },
    candidateSha: { type: 'string' },
    worktree: { type: 'string' },
    clean: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['axis', 'ticketKey', 'reviewedSha', 'verdict', 'findings', 'summary'],
  properties: {
    axis: { type: 'string', enum: ['Standards', 'Spec'] },
    ticketKey: { type: 'string' },
    reviewedSha: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'severity', 'summary', 'evidence', 'requiredChange'],
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          summary: { type: 'string' },
          evidence: { type: 'string' },
          requiredChange: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const actionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'sourceKey', 'createdTicketKey', 'createdTicketReference', 'coordinatorSha', 'completedKeys', 'details'],
  properties: {
    status: { type: 'string' },
    sourceKey: { type: 'string' },
    createdTicketKey: { type: 'string' },
    createdTicketReference: { type: 'string' },
    coordinatorSha: { type: 'string' },
    completedKeys: { type: 'array', items: { type: 'string' } },
    details: { type: 'string' },
  },
}

const integrationValidationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'sourceKey', 'candidateSha', 'coordinatorSha', 'completedKeys', 'verificationPassed', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    sourceKey: { type: 'string' },
    candidateSha: { type: 'string' },
    coordinatorSha: { type: 'string' },
    completedKeys: { type: 'array', items: { type: 'string' } },
    verificationPassed: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

const releaseVerificationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'baseSha', 'candidateSha', 'branch', 'worktree', 'remoteSha', 'pullRequestHeadSha', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    baseSha: { type: 'string' },
    candidateSha: { type: 'string' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    remoteSha: { type: 'string' },
    pullRequestHeadSha: { type: 'string' },
    reason: { type: 'string' },
  },
}

const publishSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'pullRequestUrl', 'coordinatorBranch', 'coordinatorWorktree', 'coordinatorSha', 'verification', 'qa', 'details'],
  properties: {
    verdict: { type: 'string', enum: ['pr_ready', 'hold', 'no_work'] },
    pullRequestUrl: { type: 'string' },
    coordinatorBranch: { type: 'string' },
    coordinatorWorktree: { type: 'string' },
    coordinatorSha: { type: 'string' },
    verification: { type: 'array', items: { type: 'string' } },
    qa: { type: 'string' },
    details: { type: 'string' },
  },
}

const blockingFindings = (reviews) => reviews
  .filter(Boolean)
  .flatMap((review) => review.findings || [])
  .filter((finding) => finding.severity === 'P0' || finding.severity === 'P1')

const nonBlockingFindings = (reviews) => reviews
  .filter(Boolean)
  .flatMap((review) => review.findings || [])
  .filter((finding) => finding.severity === 'P2' || finding.severity === 'P3')

const ticketByKey = (state, key) => state.tickets.find((ticket) => ticket.key === key)

const graphIsCoherent = (state) => {
  if (!state || !state.ok) return false
  const keys = state.tickets.map((ticket) => ticket.key)
  const keySet = new Set(keys)
  const byKey = new Map(state.tickets.map((ticket) => [ticket.key, ticket]))
  if (keySet.size !== keys.length) return false
  if (state.tickets.some((ticket) => !Number.isInteger(ticket.remediationDepth) || ticket.remediationDepth < 0 || ticket.remediationDepth > maxRemediationDepth)) return false
  if (state.tickets.some((ticket) => ticket.kind === 'remediation' && !ticket.continuationBaseSha)) return false
  if (state.tickets.some((ticket) => ticket.status === 'complete' && (!ticket.integratedCandidateSha || !ticket.coordinatorSha || !ticket.verificationPassed))) return false
  if (state.tickets.some((ticket) => ticket.status !== 'complete' && ticket.verificationPassed)) return false
  if (state.tickets.some((ticket) => ticket.blockedBy.some((blocker) => !keySet.has(blocker)))) return false
  if (state.runnableKeys.some((key) => !keySet.has(key))) return false
  if (state.runnableKeys.some((key) => {
    const ticket = byKey.get(key)
    return !ticket || ticket.status !== 'open' || ticket.blockedBy.some((blocker) => byKey.get(blocker).status !== 'complete')
  })) return false
  if (state.allDone && (state.runnableKeys.length > 0 || state.tickets.some((ticket) => ticket.status !== 'complete'))) return false

  const visiting = new Set()
  const visited = new Set()
  const hasCycle = (key) => {
    if (visiting.has(key)) return true
    if (visited.has(key)) return false
    visiting.add(key)
    const cycle = byKey.get(key).blockedBy.some((blocker) => hasCycle(blocker))
    visiting.delete(key)
    visited.add(key)
    return cycle
  }
  if (keys.some((key) => hasCycle(key))) return false
  return true
}

const stateTransitionIsCoherent = (before, after, integrations) => {
  if (!before || !after) return false
  const beforeByKey = new Map(before.tickets.map((ticket) => [ticket.key, ticket]))
  const afterByKey = new Map(after.tickets.map((ticket) => [ticket.key, ticket]))
  if (before.tickets.some((ticket) => !afterByKey.has(ticket.key))) return false
  if (after.tickets.some((ticket) => !beforeByKey.has(ticket.key) && ticket.kind !== 'remediation')) return false
  if (before.tickets.some((ticket) => {
    if (ticket.status !== 'complete') return false
    const current = afterByKey.get(ticket.key)
    return current.status !== 'complete' ||
      current.integratedCandidateSha !== ticket.integratedCandidateSha ||
      current.coordinatorSha !== ticket.coordinatorSha ||
      !current.verificationPassed
  })) return false

  const newlyComplete = after.tickets.filter((ticket) => beforeByKey.get(ticket.key)?.status !== 'complete' && ticket.status === 'complete')

  for (const ticket of newlyComplete) {
    const evidence = integrations.find((item) => item && item.ok && item.completedKeys.includes(ticket.key))
    if (!evidence) return false
    if (!evidence.verificationPassed || evidence.candidateSha !== ticket.integratedCandidateSha || evidence.coordinatorSha !== ticket.coordinatorSha) return false
  }

  for (const evidence of integrations.filter(Boolean)) {
    if (!evidence.ok || !evidence.verificationPassed || !evidence.candidateSha || !evidence.coordinatorSha) return false
    for (const key of evidence.completedKeys) {
      const ticket = afterByKey.get(key)
      if (!ticket || ticket.status !== 'complete') return false
      if (ticket.integratedCandidateSha !== evidence.candidateSha || ticket.coordinatorSha !== evidence.coordinatorSha || !ticket.verificationPassed) return false
    }
  }
  return true
}

const inventoryPrompt = (state) => `
Re-inventory the implementation graph for ${state.parentReference}.

Repository: ${state.repoRoot}
Coordinator worktree: ${state.coordinatorWorktree}
Coordinator branch: ${state.coordinatorBranch}
Pinned base: ${state.baseSha}
Maximum remediation depth: ${maxRemediationDepth}

Read the parent spec, every scoped implementation ticket, all tracker comments/relationships, and current Git/worktree state. Include remediation tickets created by this workflow. A ticket is runnable only when it is open, unclaimed by another coordinator, and all completion blockers are integrated and verified. A remediation ticket may be runnable from its continuationBaseSha while its source ticket remains incomplete. Preserve the pinned base SHA from the supplied state.

Normalize status to open, claimed, blocked, complete, or needs_attention; normalize kind to implementation or remediation. Return unique keys, include every referenced blocker, and keep remediationDepth between zero and ${maxRemediationDepth}. For every complete ticket, reconstruct and return its integratedCandidateSha, coordinatorSha, and verificationPassed evidence from Git plus durable tracker records; use empty SHAs and false for incomplete tickets. Set allDone only when every scoped original and remediation ticket is complete because it was integrated and verified. If work remains but runnableKeys is empty, explain why in stopReason. Do not edit product code.
`

phase('Bootstrap')

if (!parentInput) {
  const missing = await agent('Return a concise error explaining that /implement-tickets requires a parent spec or parent issue reference. Do not inspect or modify any repository.', {
    label: 'missing parent',
    tier: 'small',
  })
  return { ok: false, verdict: 'hold', report: missing }
}

let state = await agent(`
Bootstrap a durable implementation coordination session for parent spec or issue: ${parentInput}

The command was explicitly invoked, which authorizes implementation and ${createPullRequest ? 'PR preparation' : 'local integration without creating a PR'}.

Work from the current repository, but never modify the user's checkout. Read the repository instructions, parent spec, full ticket bodies/comments, and configured issue-tracker operations. Discover every implementation ticket belonging to the parent and its blocking edges. Reject cycles, missing ticket references, ambiguous scope, or tickets that are actively claimed by another coordinator.

Fetch the default remote without force. Pin the remote default branch to an exact base SHA. Create or safely reuse a persistent coordinator branch and sibling coordinator worktree outside the user's checkout. Use a project-local .worktrees root only when it is already ignored; otherwise use ~/worktrees/<repo>/<parent-slug>/. Do not use pi-dynamic-workflows disposable isolation worktrees. Record the user's checkout HEAD and porcelain status in a durable session-baseline file beside the coordinator worktree; later validators use it to detect accidental writes outside assigned worktrees. Do not change product code.

Return the complete graph and durable coordinator details. Normalize status to open, claimed, blocked, complete, or needs_attention; normalize kind to implementation or remediation. Use unique keys, include every referenced blocker, and keep remediationDepth between zero and ${maxRemediationDepth}. For every complete ticket, reconstruct and return its integratedCandidateSha, coordinatorSha, and verificationPassed evidence from Git plus durable tracker records; use empty SHAs and false for incomplete tickets. A ticket is runnable only when every completion blocker is integrated and verified. Remediation tickets use their recorded continuation base SHA. Set allDone only when every scoped original and remediation ticket is integrated and verified.
`, {
  label: 'bootstrap graph',
  tier: 'big',
  agentType: 'ticket-graph-coordinator',
  schema: graphSchema,
})

if (state && !graphIsCoherent(state)) {
  state = { ...state, ok: false, stopReason: 'The discovered graph failed deterministic coherence checks.' }
}

if (!state || !state.ok) {
  const failed = await agent(`Explain why implementation bootstrap failed and give the exact safe next action. Parent input: ${parentInput}. Bootstrap result: ${JSON.stringify(state)}`, {
    label: 'bootstrap failure',
    tier: 'medium',
    agentType: 'ticket-final-reporter',
  })
  return { ok: false, verdict: 'hold', report: failed }
}

const sessionIdentity = {
  repoRoot: state.repoRoot,
  parentReference: state.parentReference,
  baseBranch: state.baseBranch,
  baseSha: state.baseSha,
  coordinatorBranch: state.coordinatorBranch,
  coordinatorWorktree: state.coordinatorWorktree,
}
const stateMatchesSession = (candidate) => candidate && Object.entries(sessionIdentity).every(([key, value]) => candidate[key] === value)

let wave = 0
let finalReviewRound = 0
let finalAccepted = false
let acceptedReleaseTarget = null
const waveHistory = []
const finalReviewHistory = []

while (!finalAccepted && state && state.ok && wave < maxWaves) {
  while (state && state.ok && !state.allDone && state.runnableKeys.length > 0 && wave < maxWaves) {
    wave += 1
    phase('Implement')

    const runnableTickets = state.runnableKeys
      .map((key) => ticketByKey(state, key))
      .filter(Boolean)

    const prepared = await agent(`
Prepare this dependency-frontier wave in stable ticket-key order:
${JSON.stringify(runnableTickets)}

Repository: ${state.repoRoot}
Coordinator: ${state.coordinatorWorktree}
Parent: ${state.parentReference}

For each ticket, re-check tracker ownership, then claim it with a stable marker containing the coordinator branch. Create or safely reuse one persistent issue branch and worktree. For a normal ticket, branch from the current coordinator HEAD captured at wave start. For a remediation ticket, branch from its exact continuationBaseSha. Create worktrees serially to avoid Git metadata races. Never use disposable workflow isolation. Do not edit product code. Return absolute worktree paths and exact base SHAs.
`, {
      label: `prepare wave ${wave}`,
      tier: 'medium',
      agentType: 'ticket-graph-coordinator',
      schema: preparedSchema,
    })

    if (!prepared) break
    const expectedKeys = runnableTickets.map((ticket) => ticket.key).sort()
    const accountedKeys = [
      ...prepared.prepared.map((ticket) => ticket.key),
      ...prepared.failed.map((failure) => failure.key),
    ].sort()
    if (new Set(accountedKeys).size !== accountedKeys.length || JSON.stringify(accountedKeys) !== JSON.stringify(expectedKeys)) {
      state = { ...state, ok: false, stopReason: 'Wave preparation did not account for every runnable ticket exactly once.' }
      break
    }

    const implementationResults = await parallel(
      prepared.prepared.map((ticket, index) => () => agent(`
Implement ticket ${ticket.key}: ${ticket.title}
Ticket reference: ${ticket.reference}
Parent spec: ${state.parentReference}
Repository: ${state.repoRoot}
Assigned worktree: ${ticket.worktree}
Assigned branch: ${ticket.branch}
Expected base SHA: ${ticket.baseSha}
Ticket kind: ${ticket.kind}
Chain root: ${ticket.chainRootKey}

Work only in the assigned worktree. Read the full ticket, parent spec, repository instructions, relevant source, and test guidance. For remediation tickets, read the originating review findings and preserve all original acceptance criteria.

Use red-green-refactor TDD at the agreed seams. Run focused tests and typechecking regularly, then the repository-required verification for this ticket. Do not invoke pi-subagents. Do not review your own work. Do not merge, update tracker status, close tickets, push, or create a PR. Commit all intended changes, leave the worktree clean, and return the exact candidate commit SHA with verification evidence.
`, {
        label: `implement ${wave}.${index + 1} ${ticket.key}`,
        tier: 'medium',
        agentType: 'ticket-implementer',
        schema: implementationSchema,
      })),
    )

    const validationResults = await parallel(
      prepared.prepared.map((ticket, index) => () => agent(`
Validate the implementer result against the coordinator-owned assignment. Trust the assignment and Git, not fields echoed by the implementer.

Expected ticket key: ${ticket.key}
Expected branch: ${ticket.branch}
Expected worktree: ${ticket.worktree}
Expected base SHA: ${ticket.baseSha}
Implementer result: ${JSON.stringify(implementationResults[index])}
Repository: ${state.repoRoot}

Verify the expected worktree exists, is clean, is on the expected branch, and its tip is a commit descended from the expected base with a non-empty diff. Verify the user's checkout HEAD and porcelain status still match the durable session baseline; any mismatch fails validation and must be reported without modifying that checkout. Return only coordinator-observed values. Do not edit product code or tracker state.
`, {
        label: `validate candidate ${wave}.${index + 1} ${ticket.key}`,
        tier: 'small',
        agentType: 'ticket-graph-coordinator',
        schema: candidateValidationSchema,
      })),
    )

    phase('Review')

    const candidates = validationResults
      .map((result, index) => {
        const expected = prepared.prepared[index]
        if (!result || !result.ok || !result.candidateSha) return null
        if (result.key !== expected.key || result.branch !== expected.branch || result.worktree !== expected.worktree || result.baseSha !== expected.baseSha) return null
        return { ...expected, candidateSha: result.candidateSha }
      })
      .filter(Boolean)
    const reviewTasks = []
    const reviewIndex = []

    candidates.forEach((candidate, index) => {
      const ticket = prepared.prepared.find((item) => item.key === candidate.key)
      reviewTasks.push(() => agent(`
Perform the Standards axis review for ticket ${candidate.key}.
Ticket: ${ticket ? ticket.reference : candidate.key}
Parent spec: ${state.parentReference}
Repository: ${state.repoRoot}
Worktree: ${candidate.worktree}
Fixed point: ${candidate.baseSha}
Candidate SHA: ${candidate.candidateSha}

First prove the worktree branch tip equals the candidate SHA and inspect the exact three-dot diff from the fixed point. Read and apply the repository's own standards. Review for correctness hazards, unnecessary complexity, unsafe boundaries, and maintainability, with documented repository standards taking precedence. Do not invent standards the repository has not adopted. Run read-only checks when useful. Do not edit files, commit, merge, update tickets, or invoke pi-subagents.

Return only evidence-backed findings. Use P0, P1, P2, or P3. P0/P1 block integration. Set axis=Standards, ticketKey=${candidate.key}, reviewedSha=${candidate.candidateSha}, and verdict=pass only when no P0/P1 finding exists.
`, {
        label: `standards ${wave}.${index + 1} ${candidate.key}`,
        tier: 'medium',
        agentType: 'ticket-standards-reviewer',
        isolation: 'worktree',
        schema: reviewSchema,
      }))
      reviewIndex.push({ key: candidate.key, axis: 'Standards' })

      reviewTasks.push(() => agent(`
Perform the Spec axis review for ticket ${candidate.key}.
Ticket: ${ticket ? ticket.reference : candidate.key}
Parent spec: ${state.parentReference}
Repository: ${state.repoRoot}
Worktree: ${candidate.worktree}
Fixed point: ${candidate.baseSha}
Candidate SHA: ${candidate.candidateSha}

First prove the worktree branch tip equals the candidate SHA and inspect the exact three-dot diff from the fixed point. Read the full ticket, parent spec, relevant comments, acceptance criteria, and decision sources. Report missing or partial requirements, wrong behavior, and scope creep. Run read-only checks when useful. Do not edit files, commit, merge, update tickets, or invoke pi-subagents.

Return only evidence-backed findings. Use P0, P1, P2, or P3. P0/P1 block integration. Set axis=Spec, ticketKey=${candidate.key}, reviewedSha=${candidate.candidateSha}, and verdict=pass only when no P0/P1 finding exists.
`, {
        label: `spec ${wave}.${index + 1} ${candidate.key}`,
        tier: 'medium',
        agentType: 'ticket-spec-reviewer',
        isolation: 'worktree',
        schema: reviewSchema,
      }))
      reviewIndex.push({ key: candidate.key, axis: 'Spec' })
    })

    const reviewResults = reviewTasks.length > 0 ? await parallel(reviewTasks) : []

    phase('Integrate')

    const dispositions = []
    const integrationEvidence = []
    for (const failed of prepared.failed) {
      dispositions.push(await agent(`
Record ticket ${failed.key} as needs-attention for this coordinator session because preparation failed: ${failed.reason}
Do not change product code. Preserve any existing branch/worktree and add durable tracker evidence.
`, {
        label: `record prep failure ${wave} ${failed.key}`,
        tier: 'small',
        agentType: 'ticket-graph-coordinator',
        schema: actionSchema,
      }))
    }

    for (let index = 0; index < prepared.prepared.length; index += 1) {
      const assignment = prepared.prepared[index]
      const implementation = implementationResults[index]
      const validation = validationResults[index]
      const assignmentMatches = validation && validation.ok &&
        validation.key === assignment.key &&
        validation.branch === assignment.branch &&
        validation.worktree === assignment.worktree &&
        validation.baseSha === assignment.baseSha &&
        Boolean(validation.candidateSha)
      if (assignmentMatches) continue
      dispositions.push(await agent(`
Record ticket ${assignment.key} as blocked or needs-attention because its implementer did not produce a coordinator-validated clean commit.
Expected assignment: ${JSON.stringify(assignment)}
Implementation result: ${JSON.stringify(implementation)}
Validation result: ${JSON.stringify(validation)}
Coordinator: ${state.coordinatorWorktree}
Do not change product code. Preserve the issue branch/worktree and add durable tracker evidence. A missing/null agent result is a failure, not success.
`, {
        label: `record implementation failure ${wave} ${assignment.key}`,
        tier: 'small',
        agentType: 'ticket-graph-coordinator',
        schema: actionSchema,
      }))
    }

    for (const candidate of candidates) {
      const ticket = prepared.prepared.find((item) => item.key === candidate.key)
      const indexedReviews = reviewResults.filter((review, index) => review &&
        reviewIndex[index].key === candidate.key &&
        review.ticketKey === candidate.key &&
        review.axis === reviewIndex[index].axis)
      const shaMismatch = indexedReviews.some((review) => review.reviewedSha !== candidate.candidateSha)
      const axes = indexedReviews.map((review) => review.axis).sort().join(',')
      const rejected = indexedReviews.some((review) => review.verdict !== 'pass')
      const blockers = blockingFindings(indexedReviews)
      const nonBlockers = nonBlockingFindings(indexedReviews)

      if (shaMismatch || indexedReviews.length !== 2 || axes !== 'Spec,Standards' || rejected || blockers.length > 0) {
        const effectiveFindings = blockers.slice()
        if (shaMismatch || indexedReviews.length !== 2 || axes !== 'Spec,Standards' || rejected) {
          effectiveFindings.push({
            id: 'REVIEW-INTEGRITY',
            severity: 'P1',
            summary: 'The coordinator-validated candidate did not receive passing Standards and Spec reviews of its exact SHA.',
            evidence: JSON.stringify(indexedReviews),
            requiredChange: 'Restore a stable clean candidate commit and obtain both independent passing reviews.',
          })
        }

        dispositions.push(await agent(`
Create exactly one durable remediation ticket for this blocking review round.

Source ticket: ${ticket ? ticket.reference : candidate.key}
Source key: ${candidate.key}
Chain root: ${ticket ? ticket.chainRootKey : candidate.key}
Current remediation depth: ${ticket ? ticket.remediationDepth : 0}
Maximum remediation depth: ${maxRemediationDepth}
Candidate SHA / continuation base: ${candidate.candidateSha}
Standards and Spec review evidence: ${JSON.stringify(indexedReviews)}
Blocking findings: ${JSON.stringify(effectiveFindings)}

Aggregate all P0/P1 findings into one ticket. Link the source ticket, exact reviewed SHA, both review reports, required changes, and original acceptance criteria. Record continuationBaseSha=${candidate.candidateSha}, chainRootKey=${ticket ? ticket.chainRootKey : candidate.key}, and remediationDepth=${ticket ? ticket.remediationDepth + 1 : 1}. Make the source ticket blocked by the remediation ticket. Do not mark either complete and do not change product code.

If creating this ticket would exceed depth ${maxRemediationDepth}, create no ticket; mark the entire chain needs-attention and preserve all branches/worktrees.
`, {
          label: `remediate review ${wave} ${candidate.key}`,
          tier: 'medium',
          agentType: 'ticket-graph-coordinator',
          schema: actionSchema,
        }))
        continue
      }

      const integration = await agent(`
Integrate the independently reviewed candidate transactionally.

Source ticket: ${ticket ? ticket.reference : candidate.key}
Source key: ${candidate.key}
Chain root: ${ticket ? ticket.chainRootKey : candidate.key}
Candidate worktree: ${candidate.worktree}
Candidate branch: ${candidate.branch}
Reviewed candidate SHA: ${candidate.candidateSha}
Coordinator worktree: ${state.coordinatorWorktree}
Coordinator branch: ${state.coordinatorBranch}
Parent: ${state.parentReference}
Non-blocking findings: ${JSON.stringify(nonBlockers)}

Before integration, prove both reviews covered the exact candidate SHA, the candidate worktree is clean, and the branch tip still equals that SHA. Merge with --no-ff into the dedicated coordinator worktree. Do not resolve product-code conflicts yourself. If a conflict occurs, abort and return status=conflict. Run repository-required integrated verification. If verification fails, restore the dedicated coordinator branch to its exact pre-merge SHA, preserve the candidate branch/worktree, and return status=verification_failed.

On success, return status=integrated, sourceKey=${candidate.key}, the exact post-merge coordinatorSha, and completedKeys containing the source plus every remediation/source ticket completed in its chain. Add durable tracker evidence, create durable follow-up tracking for unresolved P2/P3 findings, and mark those tickets complete because the final candidate is now integrated and verified. Never close the parent spec. Do not push or create a PR yet.
`, {
        label: `integrate ${wave} ${candidate.key}`,
        tier: 'medium',
        agentType: 'ticket-graph-coordinator',
        schema: actionSchema,
      })
      dispositions.push(integration)

      let integrationProof = null
      const integrationClaimsSuccess = integration &&
        integration.status === 'integrated' &&
        integration.sourceKey === candidate.key &&
        Boolean(integration.coordinatorSha) &&
        integration.completedKeys.includes(candidate.key)

      if (integrationClaimsSuccess) {
        integrationProof = await agent(`
Independently validate this claimed integration from durable Git, verification, and tracker state.

Expected source key: ${candidate.key}
Expected candidate SHA: ${candidate.candidateSha}
Expected coordinator branch: ${state.coordinatorBranch}
Expected coordinator worktree: ${state.coordinatorWorktree}
Claimed integration: ${JSON.stringify(integration)}

Verify the candidate commit is reachable from the claimed coordinator SHA, that SHA is the current clean coordinator branch tip, integrated verification passed, every claimed completed key has durable tracker evidence for this same candidate/coordinator pair, the source key is included, and the user's checkout still matches the session baseline. Return only independently observed evidence. Do not modify code or tracker state.
`, {
          label: `validate integration ${wave} ${candidate.key}`,
          tier: 'small',
          agentType: 'ticket-graph-coordinator',
          schema: integrationValidationSchema,
        })
      }

      const integrationIsValid = integrationProof &&
        integrationProof.ok &&
        integrationProof.verificationPassed &&
        integrationProof.sourceKey === candidate.key &&
        integrationProof.candidateSha === candidate.candidateSha &&
        integrationProof.coordinatorSha === integration.coordinatorSha &&
        integrationProof.completedKeys.includes(candidate.key)

      if (integrationIsValid) integrationEvidence.push(integrationProof)

      if (!integrationIsValid) {
        const integrationFailure = integrationProof || integration || {
          status: 'integration_agent_failed',
          reason: 'The integration agent returned no validated result.',
        }
        dispositions.push(await agent(`
Create exactly one durable remediation ticket for this failed integration attempt.

Source ticket: ${ticket ? ticket.reference : candidate.key}
Source key: ${candidate.key}
Chain root: ${ticket ? ticket.chainRootKey : candidate.key}
Current remediation depth: ${ticket ? ticket.remediationDepth : 0}
Maximum remediation depth: ${maxRemediationDepth}
Candidate SHA / continuation base: ${candidate.candidateSha}
Integration result: ${JSON.stringify(integrationFailure)}

The remediation ticket must require a fresh implementer to reconcile the candidate with current coordinator state or repair the verification/provenance failure, while preserving the original acceptance criteria. Reopen the source or chain if an invalid integration prematurely marked it complete. Record the exact continuation base and integration evidence. Make the source ticket blocked by the remediation ticket. If the depth cap would be exceeded, create no ticket and mark the chain needs-attention. Do not change product code.
`, {
          label: `remediate integration ${wave} ${candidate.key}`,
          tier: 'medium',
          agentType: 'ticket-graph-coordinator',
          schema: actionSchema,
        }))
      }
    }

    waveHistory.push({ wave, prepared, implementationResults, validationResults, reviewResults, dispositions, integrationEvidence })

    const previousState = state
    state = await agent(inventoryPrompt(state), {
      label: `inventory after wave ${wave}`,
      tier: 'medium',
      agentType: 'ticket-graph-coordinator',
      schema: graphSchema,
    })

    if (state && (!graphIsCoherent(state) || !stateMatchesSession(state) || !stateTransitionIsCoherent(previousState, state, integrationEvidence))) {
      state = { ...state, ok: false, stopReason: 'The refreshed graph failed deterministic coherence, session-identity, or integration-provenance checks.' }
    }
    if (!state || !state.ok) break
  }

  if (!state || !state.ok || !state.allDone) break

  phase('Final review')
  finalReviewRound += 1

  const finalTarget = await agent(`
Capture the exact final-review target from durable Git state.
Repository: ${state.repoRoot}
Coordinator worktree: ${state.coordinatorWorktree}
Expected coordinator branch: ${state.coordinatorBranch}
Pinned base SHA: ${state.baseSha}

Verify the worktree exists, is clean, is on the expected branch, and has a non-empty three-dot diff from the pinned base. Verify the user's checkout still matches the durable session baseline. Return the actual coordinator HEAD as candidateSha and the resolved pinned base as baseSha. Do not edit product code or tracker state.
`, {
    label: `capture final target ${finalReviewRound}`,
    tier: 'small',
    agentType: 'ticket-graph-coordinator',
    schema: reviewTargetSchema,
  })

  if (!finalTarget ||
      !finalTarget.ok ||
      !finalTarget.clean ||
      finalTarget.baseSha !== state.baseSha ||
      finalTarget.worktree !== state.coordinatorWorktree ||
      !finalTarget.candidateSha) {
    finalReviewHistory.push({ round: finalReviewRound, target: finalTarget, reviews: [] })
    break
  }

  const finalReviews = await parallel([
    () => agent(`
Perform the final integrated Standards review for parent ${state.parentReference}.
Repository: ${state.repoRoot}
Coordinator worktree: ${finalTarget.worktree}
Pinned base SHA: ${finalTarget.baseSha}
Exact candidate SHA: ${finalTarget.candidateSha}

Prove the branch tip still equals the exact candidate SHA and inspect the complete three-dot diff from the pinned base. Read and apply the repository's own standards. Review for correctness hazards, unnecessary complexity, unsafe boundaries, maintainability, cross-ticket interactions, and architecture. Do not invent standards the repository has not adopted. Do not edit, commit, merge, update tickets, or invoke pi-subagents. Set axis=Standards, ticketKey=parent, reviewedSha exactly, and verdict=pass only when no P0/P1 finding exists.
`, {
      label: `final standards ${finalReviewRound}`,
      tier: 'big',
      agentType: 'ticket-standards-reviewer',
      isolation: 'worktree',
      schema: reviewSchema,
    }),
    () => agent(`
Perform the final integrated Spec review for parent ${state.parentReference}.
Repository: ${state.repoRoot}
Coordinator worktree: ${finalTarget.worktree}
Pinned base SHA: ${finalTarget.baseSha}
Exact candidate SHA: ${finalTarget.candidateSha}

Prove the branch tip still equals the exact candidate SHA and inspect the complete three-dot diff from the pinned base. Read the full parent spec, every implementation and remediation ticket, decisions, comments, and acceptance criteria. Find parent-level omissions, wrong behavior, scope creep, and cross-ticket failures. Do not edit, commit, merge, update tickets, or invoke pi-subagents. Set axis=Spec, ticketKey=parent, reviewedSha exactly, and verdict=pass only when no P0/P1 finding exists.
`, {
      label: `final spec ${finalReviewRound}`,
      tier: 'big',
      agentType: 'ticket-spec-reviewer',
      isolation: 'worktree',
      schema: reviewSchema,
    }),
  ])

  finalReviewHistory.push({ round: finalReviewRound, target: finalTarget, reviews: finalReviews })
  const finalBlockers = blockingFindings(finalReviews)
  const finalAxes = finalReviews.filter(Boolean).map((review) => review.axis).sort().join(',')
  const finalIntegrity = finalTarget.baseSha === state.baseSha &&
    finalTarget.worktree === state.coordinatorWorktree &&
    finalReviews.length === 2 &&
    finalReviews.every((review) => review && review.ticketKey === 'parent' && review.reviewedSha === finalTarget.candidateSha && review.verdict === 'pass') &&
    finalAxes === 'Spec,Standards'
  const finalEffectiveBlockers = finalBlockers.slice()
  if (!finalIntegrity) {
    finalEffectiveBlockers.push({
      id: 'FINAL-REVIEW-INTEGRITY',
      severity: 'P1',
      summary: 'The exact coordinator HEAD did not receive passing independent Standards and Spec reviews.',
      evidence: JSON.stringify(finalReviews),
      requiredChange: 'Obtain both passing reviews against the captured coordinator HEAD.',
    })
  }

  if (finalEffectiveBlockers.length === 0 &&
      finalTarget.baseSha === state.baseSha &&
      finalTarget.worktree === state.coordinatorWorktree) {
    finalAccepted = true
    acceptedReleaseTarget = finalTarget
    break
  }

  const finalHead = finalTarget.candidateSha
  const finalRemediation = await agent(`
Create one parent-level remediation ticket for final integrated review round ${finalReviewRound}.
Parent: ${state.parentReference}
Coordinator branch: ${state.coordinatorBranch}
Coordinator HEAD / continuation base: ${finalHead}
Maximum remediation depth: ${maxRemediationDepth}
Review evidence: ${JSON.stringify(finalReviews)}
Blocking findings: ${JSON.stringify(finalEffectiveBlockers)}

The ticket belongs to the parent's implementation graph and must pass the normal fresh implementer plus two fresh reviewer pipeline. Record remediationDepth=${finalReviewRound}, continuationBaseSha=${finalHead}, and a parent-level chain root. Return status=remediation_created, sourceKey=parent, and the exact created ticket key/reference. Do not close the parent or change product code. If round ${finalReviewRound} reaches the depth cap, create no further ticket, mark the parent coordination session needs-attention, and return status=needs_attention.
`, {
    label: `publish final remediation ${finalReviewRound}`,
    tier: 'medium',
    agentType: 'ticket-graph-coordinator',
    schema: actionSchema,
  })

  if (finalReviewRound >= maxRemediationDepth) {
    if (!finalRemediation || finalRemediation.status !== 'needs_attention') {
      state = { ...state, ok: false, stopReason: 'The final-review remediation depth cap was not recorded durably.' }
    }
    break
  }

  if (!finalRemediation ||
      finalRemediation.status !== 'remediation_created' ||
      finalRemediation.sourceKey !== 'parent' ||
      !finalRemediation.createdTicketKey ||
      !finalRemediation.createdTicketReference) {
    state = { ...state, ok: false, stopReason: 'The final-review remediation ticket was not created and identified durably.' }
    break
  }

  const beforeFinalRemediation = state
  state = await agent(inventoryPrompt(state), {
    label: `inventory final remediation ${finalReviewRound}`,
    tier: 'medium',
    agentType: 'ticket-graph-coordinator',
    schema: graphSchema,
  })
  const insertedRemediation = state ? ticketByKey(state, finalRemediation.createdTicketKey) : null
  if (state && (!graphIsCoherent(state) ||
      !stateMatchesSession(state) ||
      !stateTransitionIsCoherent(beforeFinalRemediation, state, []) ||
      state.allDone ||
      !insertedRemediation ||
      insertedRemediation.kind !== 'remediation' ||
      insertedRemediation.status === 'complete' ||
      insertedRemediation.continuationBaseSha !== finalHead ||
      insertedRemediation.remediationDepth !== finalReviewRound)) {
    state = { ...state, ok: false, stopReason: 'The final-remediation graph failed insertion, provenance, coherence, or session-identity checks.' }
  }
}

phase('Publish')

const deterministicReleaseReady = Boolean(
  state &&
  graphIsCoherent(state) &&
  stateMatchesSession(state) &&
  state.allDone &&
  finalAccepted &&
  acceptedReleaseTarget &&
  acceptedReleaseTarget.baseSha === state.baseSha &&
  acceptedReleaseTarget.worktree === state.coordinatorWorktree &&
  acceptedReleaseTarget.candidateSha,
)

let publishResult = {
  verdict: 'hold',
  pullRequestUrl: '',
  coordinatorBranch: state ? state.coordinatorBranch : '',
  coordinatorWorktree: state ? state.coordinatorWorktree : '',
  coordinatorSha: '',
  verification: [],
  qa: '',
  details: deterministicReleaseReady ? 'Publication has not run.' : 'Deterministic release prerequisites did not pass; the publishing agent was not called.',
}
let prePublishTarget = null
let releaseVerification = null

if (deterministicReleaseReady) {
  prePublishTarget = await agent(`
Re-capture the immutable release target immediately before publication.
Repository: ${state.repoRoot}
Expected branch: ${state.coordinatorBranch}
Expected worktree: ${state.coordinatorWorktree}
Expected pinned base: ${state.baseSha}
Expected accepted HEAD: ${acceptedReleaseTarget.candidateSha}

Stay read-only. Verify the coordinator worktree is clean, the user's checkout matches the session baseline, and the current branch tip/base/worktree exactly match the expected release identity. Return actual Git values; do not push, create a PR, edit code, or update tracker state.
`, {
    label: 'verify pre-publish target',
    tier: 'small',
    agentType: 'ticket-graph-coordinator',
    schema: reviewTargetSchema,
  })

  const prePublishIdentityMatches = prePublishTarget &&
    prePublishTarget.ok &&
    prePublishTarget.clean &&
    prePublishTarget.baseSha === state.baseSha &&
    prePublishTarget.worktree === state.coordinatorWorktree &&
    prePublishTarget.candidateSha === acceptedReleaseTarget.candidateSha

  if (prePublishIdentityMatches) {
    publishResult = await agent(`
Publish the already accepted immutable release without changing its commit.

Parent: ${state.parentReference}
Repository: ${state.repoRoot}
Coordinator worktree: ${state.coordinatorWorktree}
Coordinator branch: ${state.coordinatorBranch}
Pinned base SHA: ${state.baseSha}
Only publishable SHA: ${acceptedReleaseTarget.candidateSha}
Create or update PR: ${createPullRequest}

Re-run the full repository-required verification and affected-surface local QA without committing or changing HEAD. Require the coordinator worktree to remain clean and exactly at the only publishable SHA. If verification or QA changes tracked files, fails, or moves HEAD, return verdict=hold and do not push.

On success, push only the coordinator branch without force and ${createPullRequest ? 'create or update the integration PR' : 'do not create a PR'}. Return coordinatorBranch=${state.coordinatorBranch}, coordinatorWorktree=${state.coordinatorWorktree}, coordinatorSha=${acceptedReleaseTarget.candidateSha}, and verdict=pr_ready. Never merge the PR or close the parent spec.
`, {
      label: 'publish integration',
      tier: 'big',
      agentType: 'ticket-graph-coordinator',
      schema: publishSchema,
    })

    const claimedIdentityMatches = publishResult &&
      publishResult.coordinatorBranch === state.coordinatorBranch &&
      publishResult.coordinatorWorktree === state.coordinatorWorktree &&
      publishResult.coordinatorSha === acceptedReleaseTarget.candidateSha

    if (publishResult && publishResult.verdict === 'pr_ready' && claimedIdentityMatches) {
      releaseVerification = await agent(`
Verify the published release read-only from local Git, the remote, and the tracker.

Repository: ${state.repoRoot}
Expected base: ${state.baseSha}
Expected branch: ${state.coordinatorBranch}
Expected worktree: ${state.coordinatorWorktree}
Expected published SHA: ${acceptedReleaseTarget.candidateSha}
Expected PR URL: ${publishResult.pullRequestUrl}
PR required: ${createPullRequest}

Fetch read-only. Prove the clean local coordinator tip and remote branch equal the expected SHA. ${createPullRequest ? 'Prove the PR exists and its head equals that SHA.' : 'Return an empty pullRequestHeadSha.'} Verify the parent remains open. Do not modify code, tracker state, branches, or the PR.
`, {
        label: 'verify published release',
        tier: 'medium',
        agentType: 'ticket-graph-coordinator',
        schema: releaseVerificationSchema,
      })
    }

    const publicationVerified = releaseVerification &&
      releaseVerification.ok &&
      releaseVerification.baseSha === state.baseSha &&
      releaseVerification.branch === state.coordinatorBranch &&
      releaseVerification.worktree === state.coordinatorWorktree &&
      releaseVerification.candidateSha === acceptedReleaseTarget.candidateSha &&
      releaseVerification.remoteSha === acceptedReleaseTarget.candidateSha &&
      (!createPullRequest || releaseVerification.pullRequestHeadSha === acceptedReleaseTarget.candidateSha)

    if (publishResult && publishResult.verdict === 'pr_ready' && (!claimedIdentityMatches || !publicationVerified)) {
      publishResult = {
        ...publishResult,
        verdict: 'hold',
        details: `${publishResult.details} Post-publication identity verification failed.`,
      }
    }
  } else {
    publishResult.details = 'The pre-publication target no longer matched the SHA accepted by final review; nothing was published.'
  }
}

phase('Report')

const report = await agent(`
Produce the final concise implementation report for the user.

Parent input: ${parentInput}
Final graph: ${JSON.stringify(state)}
Waves: ${JSON.stringify(waveHistory)}
Final review: ${JSON.stringify(finalReviewHistory)}
Pre-publish target: ${JSON.stringify(prePublishTarget)}
Publish result: ${JSON.stringify(publishResult)}
Post-publish verification: ${JSON.stringify(releaseVerification)}

State exactly one verdict: PR ready, hold, or no work. Include the pinned base SHA, coordinator branch/worktree, PR URL when present, completed tickets, blocked tickets, needs-attention tickets, remediation tickets created, verification/QA evidence, preserved worktrees, and merge recommendation. Explain that tickets count complete only after integration and verification, while the parent remains open until the PR merges. Give one exact next action. Do not modify anything or invoke pi-subagents.
`, {
  label: 'final implementation report',
  tier: 'big',
  agentType: 'ticket-final-reporter',
})

return {
  ok: Boolean(finalAccepted && publishResult && publishResult.verdict === 'pr_ready'),
  verdict: publishResult ? publishResult.verdict : 'hold',
  fixedPoint: state ? state.baseSha : '',
  coordinatorBranch: state ? state.coordinatorBranch : '',
  coordinatorWorktree: state ? state.coordinatorWorktree : '',
  pullRequestUrl: publishResult ? publishResult.pullRequestUrl : '',
  waveCount: wave,
  finalReviewRounds: finalReviewRound,
  report,
}
