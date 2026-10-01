import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Luu API keys MA HOA bang safeStorage (macOS dung Keychain de tao khoa ma hoa).
// File chi chua ciphertext base64 — KHONG plaintext.
function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.enc')
}

// 'api_key'      = goi thang API bang khoa tu tra tien
// 'subscription' = goi qua CLI chinh chu da dang nhap (goi Claude Max / ChatGPT Plus / tai khoan Google)
export type AuthMode = 'api_key' | 'subscription'

export interface ProviderConfig {
  base_url: string
  model: string
  api_key: string
  auth_mode: AuthMode
  /** Model dung khi chay bang goi subscription (giu rieng de doi qua lai khong mat cau hinh kia) */
  sub_model: string
  /** Muc suy nghi (reasoning effort) cho Codex CLI; '' = mac dinh cua model */
  sub_effort?: string
}

export type ProvidersMap = Record<string, ProviderConfig>

/** Provider co CLI chinh chu chay bang tai khoan da dang nhap (Codex / Claude Code / Gemini CLI) */
export const SUBSCRIPTION_CAPABLE = ['gpt', 'claude', 'gemini'] as const

const DEFAULTS: ProvidersMap = {
  gemini: {
    base_url: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    api_key: '',
    auth_mode: 'subscription',
    sub_model: 'gemini-3.1-pro-preview',
    sub_effort: ''
  },
  gpt: {
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    api_key: '',
    auth_mode: 'subscription',
    sub_model: 'gpt-6-luna',
    sub_effort: ''
  },
  claude: {
    base_url: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-6',
    api_key: '',
    auth_mode: 'subscription',
    sub_model: 'claude-opus-5',
    sub_effort: ''
  }
}

export function loadProviders(): ProvidersMap {
  const p = secretsPath()
  if (!existsSync(p)) return JSON.parse(JSON.stringify(DEFAULTS))
  try {
    const raw = readFileSync(p)
    let json: string
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(raw)
    } else {
      json = raw.toString('utf-8')
    }
    const parsed = JSON.parse(json) as ProvidersMap
    // merge defaults de luon co du 3 provider
    const out: ProvidersMap = JSON.parse(JSON.stringify(DEFAULTS))
    for (const k of Object.keys(parsed)) {
      out[k] = { ...out[k], ...parsed[k] }
    }
    return out
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS))
  }
}

export function saveProviders(providers: ProvidersMap): void {
  const merged = loadProviders()
  for (const k of Object.keys(providers)) {
    merged[k] = { ...merged[k], ...providers[k] }
    // Provider khong co CLI chinh chu -> khong cho bat che do subscription
    if (merged[k].auth_mode === 'subscription' && !SUBSCRIPTION_CAPABLE.includes(k as never)) {
      merged[k].auth_mode = 'api_key'
    }
  }
  const json = JSON.stringify(merged)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf-8')
  writeFileSync(secretsPath(), data)
}

// Tra ve ban masked cho UI (khong lo key)
export interface MaskedProvider {
  base_url: string
  model: string
  has_key: boolean
  key_hint: string
  auth_mode: AuthMode
  sub_model: string
  sub_effort: string
  subscription_capable: boolean
}

export function maskedProviders(): Record<string, MaskedProvider> {
  const p = loadProviders()
  const out: Record<string, MaskedProvider> = {}
  for (const k of Object.keys(p)) {
    const key = p[k].api_key || ''
    out[k] = {
      base_url: p[k].base_url,
      model: p[k].model,
      has_key: !!key,
      key_hint: key.length >= 4 ? '••••' + key.slice(-4) : key ? 'set' : '',
      auth_mode: p[k].auth_mode || 'api_key',
      sub_model: p[k].sub_model || '',
      sub_effort: p[k].sub_effort || '',
      subscription_capable: SUBSCRIPTION_CAPABLE.includes(k as never)
    }
  }
  return out
}

/** Provider nao da san sang chay (co key, HOAC dang dung goi subscription) */
export function providersConfigured(): Record<string, { ready: boolean; auth_mode: AuthMode }> {
  const p = loadProviders()
  const out: Record<string, { ready: boolean; auth_mode: AuthMode }> = {}
  for (const k of Object.keys(p)) {
    const mode = p[k].auth_mode || 'api_key'
    out[k] = { ready: mode === 'subscription' ? true : !!p[k].api_key, auth_mode: mode }
  }
  return out
}
