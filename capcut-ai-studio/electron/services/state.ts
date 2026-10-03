import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { ENGINE_HOME, STATE_PATH } from './paths'

/**
 * ~/.capcut-studio/state.json. Chi khai cac khoa app con dung; khoa cu (vd cua luong CapCut
 * da go: repo_dir, capcut_projects, caption_font, review_enabled; edit_flow cua nut "Luong Edit moi"
 * da go 2026-09-28) van nam nguyen trong file
 * vi writeState() luon GOP vao ban dang co, khong ghi de ca file.
 */
export interface EngineState {
  os?: string
  engine_home?: string
  /** Python cua venv chay sidecar (Doctor ghi) */
  venv_python?: string
  /** AI lap ke hoach (B1..B7, R4, R5) — Cai dat API ghi, sidecar config.plan_provider() doc */
  plan_provider?: PlanProvider
  /** Tao nhieu video cung luc (src/lib/jobQueue.ts): so video PHAN TICH (Gemini) / LAP PLAN (Claude) cung luc */
  video_jobs_gemini?: number
  video_jobs_claude?: number
  note?: string
}

/** Gioi han so video chay cung luc — khop src/lib/jobQueue.ts DEFAULT_LIMITS / MAX_LIMITS */
export const JOB_LIMIT_DEFAULT = { gemini: 2, claude: 1 }
export const JOB_LIMIT_MAX = { gemini: 20, claude: 20 }

export type JobLimits = { gemini: number; claude: number }

function clampJob(v: unknown, def: number, max: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : def
}

export function jobLimitsOf(s: EngineState): JobLimits {
  return {
    gemini: clampJob(s.video_jobs_gemini, JOB_LIMIT_DEFAULT.gemini, JOB_LIMIT_MAX.gemini),
    claude: clampJob(s.video_jobs_claude, JOB_LIMIT_DEFAULT.claude, JOB_LIMIT_MAX.claude)
  }
}

export function saveJobLimits(v: Partial<JobLimits>): JobLimits {
  const cur = jobLimitsOf(readState())
  const next = {
    gemini: v.gemini === undefined ? cur.gemini : clampJob(v.gemini, cur.gemini, JOB_LIMIT_MAX.gemini),
    claude: v.claude === undefined ? cur.claude : clampJob(v.claude, cur.claude, JOB_LIMIT_MAX.claude)
  }
  writeState({ video_jobs_gemini: next.gemini, video_jobs_claude: next.claude })
  return next
}

export type PlanProvider = 'gpt' | 'claude'

export function planProviderOf(s: EngineState): PlanProvider {
  // 2026-10-01: lap ke hoach LUON bang Claude (bo lua chon trong Cai dat API); gia tri cu trong state bi bo qua
  void s
  return 'claude'
}

export function readState(): EngineState {
  if (existsSync(STATE_PATH)) {
    try {
      return JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
}

export function writeState(patch: Partial<EngineState>): EngineState {
  if (!existsSync(ENGINE_HOME)) mkdirSync(ENGINE_HOME, { recursive: true })
  const cur = readState()
  const next = { ...cur, ...patch, engine_home: ENGINE_HOME }
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
