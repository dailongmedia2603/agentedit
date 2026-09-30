// Nhat ky xu ly theo tung lan tao video — cung file voi sidecar/run_log.py:
//   ~/.capcut-studio/runs/<project_id>/events.jsonl
// Sidecar ghi su kien AI/pipeline; o day ghi su kien phia UI va DOC file theo byte
// offset de renderer hien realtime (khong phu thuoc sidecar con song hay khong).
import { appendFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { ENGINE_HOME } from './paths'

export const RUNS_DIR = join(ENGINE_HOME, 'runs')

// Moi lan doc toi da bay nhieu byte (1 su kien goi AI co the vai tram KB)
const MAX_CHUNK = 8 * 1024 * 1024

function safeId(id: string): string {
  return String(id || '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80)
}

export function runDir(runId: string): string {
  return join(RUNS_DIR, safeId(runId))
}

function eventsPath(runId: string): string {
  return join(runDir(runId), 'events.jsonl')
}

export interface RunEvent {
  id: string
  ts: number
  kind: string
  title: string
  step?: string | null
  level?: string
  [k: string]: unknown
}

export function readRunLog(runId: string, offset = 0): { events: RunEvent[]; offset: number; size: number } {
  if (!safeId(runId)) return { events: [], offset: 0, size: 0 }
  const p = eventsPath(runId)
  if (!existsSync(p)) return { events: [], offset: 0, size: 0 }
  const size = statSync(p).size
  // File bi xoa/tao lai (vd bam "Xoa nhat ky") -> doc lai tu dau
  if (offset > size) offset = 0
  const len = Math.min(size - offset, MAX_CHUNK)
  if (len <= 0) return { events: [], offset, size }
  const buf = Buffer.alloc(len)
  const fd = openSync(p, 'r')
  try {
    readSync(fd, buf, 0, len, offset)
  } finally {
    closeSync(fd)
  }
  // Chi lay toi dong hoan chinh cuoi cung — dong dang ghi do se doc o lan sau
  const end = buf.lastIndexOf(0x0a)
  if (end < 0) {
    // 1 dong dai hon ca MAX_CHUNK: bo qua dong do de khong ket mai
    return len === MAX_CHUNK ? { events: [], offset: offset + len, size } : { events: [], offset, size }
  }
  const events: RunEvent[] = []
  for (const line of buf.subarray(0, end).toString('utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      /* dong hong -> bo */
    }
  }
  return { events, offset: offset + end + 1, size }
}

export function appendRunLog(
  runId: string,
  ev: { kind?: string; title: string; step?: string; level?: string; [k: string]: unknown }
): void {
  if (!safeId(runId) || !ev?.title) return
  const dir = runDir(runId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const line =
    JSON.stringify({
      id: randomBytes(6).toString('hex'),
      ts: Date.now() / 1000,
      kind: 'ui',
      level: 'info',
      step: null,
      ...ev
    }) + '\n'
  appendFileSync(eventsPath(runId), line, 'utf-8')
}

export function clearRunLog(runId: string): void {
  const dir = runDir(runId)
  if (safeId(runId) && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}
