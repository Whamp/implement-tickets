#!/usr/bin/env node

import { checkInstallation } from './lib/installation.mjs'

const arguments_ = process.argv.slice(2)

if (arguments_.includes('--help')) {
  console.log('Usage: node scripts/check.mjs')
} else if (arguments_.length > 0) {
  console.error(`Unknown option: ${arguments_.join(', ')}`)
  process.exitCode = 1
} else {
  const result = await checkInstallation()
  if (result.ok) {
    console.log('implement-tickets installation is current.')
  } else {
    console.error('implement-tickets installation is not current.')
    for (const missingPath of result.missingPaths) {
      console.error(`missing: ${missingPath}`)
    }
    for (const mismatchedPath of result.mismatchedPaths) {
      console.error(`mismatched: ${mismatchedPath}`)
    }
    process.exitCode = 1
  }
}
