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
  note?: string
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
