#!/usr/bin/env node

import { uninstall } from './lib/installation.mjs'

const arguments_ = process.argv.slice(2)
const allowedArguments = new Set(['--force', '--help'])
const unknownArguments = arguments_.filter((argument) => !allowedArguments.has(argument))

if (arguments_.includes('--help')) {
  console.log('Usage: node scripts/uninstall.mjs [--force]')
} else if (unknownArguments.length > 0) {
  console.error(`Unknown option: ${unknownArguments.join(', ')}`)
  process.exitCode = 1
} else {
  try {
    const result = await uninstall({ force: arguments_.includes('--force') })
    if (result.removedPaths.length === 0) {
      console.log('implement-tickets is already absent.')
    } else {
      console.log(`Removed ${result.removedPaths.length} artifacts.`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
