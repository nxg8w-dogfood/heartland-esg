// Every script loads under Node, not just under the bundler.
//
// The scripts are run by `npm run` and by the deploy, so Node resolves their imports, and Node
// resolves no extension of its own: `from './schema'` throws ERR_MODULE_NOT_FOUND there while
// Vitest and Vite resolve it happily. dataverse:check shipped with exactly that import and failed
// on its first real run, after the unit tests and the build had passed, because nothing ran the
// script itself (ADR 0020).
//
// Each script is run with no arguments, which reaches its own usage message and exits before any
// network call, so this needs no environment and no credentials. What it proves is that the whole
// import graph resolves.

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

/** The script's exit code and output, however it ended. */
async function runScript(script: string): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [`scripts/${script}`], { cwd: root })
    return { code: 0, output: stdout + stderr }
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string }
    return { code: err.code ?? 1, output: (err.stdout ?? '') + (err.stderr ?? '') }
  }
}

describe.each(['dataverse-check.ts', 'dataverse-apply.ts'])('%s', (script) => {
  it('resolves its imports under Node and asks for --url', async () => {
    const { code, output } = await runScript(script)
    expect(output).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/)
    expect(output).toContain('Usage:')
    expect(output).toContain('--url')
    // environment() exits 2 for a missing or malformed --url, before it signs in to anything.
    expect(code).toBe(2)
  }, 30_000)
})
