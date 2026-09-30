import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { TOOLS_BIN } from './paths'

// PATH bo sung de process con (uv/git/python) tim duoc binary khi app chay tu Finder
// (GUI app khong ke thua PATH cua shell).
export function augmentedEnv(): NodeJS.ProcessEnv {
  const extra = [
    TOOLS_BIN,
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.cargo', 'bin'),
    join(homedir(), '.local', 'node', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].filter((p) => existsSync(p) || p.startsWith('/usr') || p.startsWith('/bin') || p.startsWith('/sbin'))
  const current = process.env.PATH || ''
  const merged = Array.from(new Set([...extra, ...current.split(':')])).filter(Boolean).join(':')
  return { ...process.env, PATH: merged }
}

export function findBinary(name: string): string | null {
  const dirs = [
    TOOLS_BIN,
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin'
  ]
  for (const d of dirs) {
    const p = join(d, name)
    if (existsSync(p)) return p
  }
  return null
}
