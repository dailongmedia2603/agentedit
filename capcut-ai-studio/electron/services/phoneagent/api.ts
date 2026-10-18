// Phone Agent — doc thiet bi / kich ban / bien cua kich ban (2026-10-19). Da doi chieu source phoneclaw-dashboard
// (server/routes/external-api.ts, services/script-inputs.ts, helpers/inject-variables.ts):
// - /scripts KHONG co `inputs` -> phai goi /scripts/:id/inputs; kich ban cu (khong khai bao inputs) -> do {{bien}} trong steps.
// - Ten bien hop le /^[a-z_][a-z0-9_]{0,63}$/ (kich ban khong co inputs: khoa CHU HOA bi bo qua im lang).
// - Node send_file chi doc params.videoId (id video da dang ky /videos/register) — iPhone tu tai URL cua video do.
import { paCall } from './client'

export interface PaDevice {
  id: string
  name: string
  status: 'online' | 'offline' | 'running' | 'connecting' | string
  model?: string
  iosVersion?: string
  battery?: number
  lastSeen?: string
  currentScript?: string | null
  group?: string
  account?: string
}

export interface PaScript {
  id: string
  name: string
  description?: string
  channel?: string
  status?: string
  shared?: boolean
  runCount?: number
  lastRun?: string
}

export interface PaScriptInput {
  name: string
  label?: string
  type: 'string' | 'text' | 'number' | 'boolean' | 'url' | 'video' | 'enum' | string
  required?: boolean
  default?: string | number | boolean
  description?: string
  options?: string[]
  maxLength?: number
  min?: number
  max?: number
  placeholder?: string
}

/** 1 o nhap cho 1 bien cua kich ban (UI tu dung form). role: video = app tu dien id video; caption = chu dang kem. */
export interface PaField extends PaScriptInput {
  role: 'video' | 'caption' | 'other'
}

export interface PaScriptFields {
  scriptId: string
  name: string
  /** true = kich ban khai bao inputs (may chu kiem gia tri); false = do tu {{bien}} trong cac buoc */
  declared: boolean
  fields: PaField[]
  /** ten bien chua id video (node send_file) — app tu dien */
  videoVar?: string
  hasSendFile: boolean
  warnings: string[]
}

export interface PaExecutionStep {
  index: number
  type: string
  description?: string
  status: 'pending' | 'running' | 'success' | 'error' | string
  startedAt?: string
  finishedAt?: string
  error?: string
  screenshotUrl?: string
}

export interface PaExecution {
  id: string
  scheduleId?: string
  scheduleName: string
  scriptName: string
  targetName: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'success' | 'error' | string
  error?: string | null
  steps: PaExecutionStep[]
}

const VAR_NAME = /^[a-z_][a-z0-9_]{0,63}$/

export async function paMe(token?: string, base?: string) {
  return paCall<{ id: string; name: string; email: string; role: string; stats?: { totalDevices: number; onlineDevices: number; totalScripts: number; totalSchedules: number } }>(
    '/me',
    { token, base, retries: 0, timeoutMs: 20000 }
  )
}

export async function paDevices(): Promise<PaDevice[]> {
  const list = await paCall<PaDevice[]>('/devices')
  return (Array.isArray(list) ? list : []).map((d) => ({
    id: String(d.id),
    name: String(d.name || d.id),
    status: String(d.status || 'offline'),
    model: d.model,
    iosVersion: d.iosVersion,
    battery: typeof d.battery === 'number' ? d.battery : undefined,
    lastSeen: d.lastSeen,
    currentScript: d.currentScript ?? null
  }))
}

export async function paDevice(id: string): Promise<PaDevice> {
  const d = await paCall<PaDevice>(`/devices/${encodeURIComponent(id)}`)
  return { id: String(d.id), name: String(d.name || d.id), status: String(d.status || 'offline'), battery: d.battery, model: d.model, currentScript: d.currentScript ?? null }
}

export async function paScripts(): Promise<PaScript[]> {
  const d = await paCall<{ own?: PaScript[]; shared?: PaScript[] }>('/scripts')
  const map = (s: PaScript, shared: boolean): PaScript => ({
    id: String(s.id),
    name: String(s.name || s.id),
    description: s.description,
    channel: s.channel,
    status: s.status,
    shared,
    runCount: s.runCount,
    lastRun: s.lastRun
  })
  return [...(d?.own || []).map((s) => map(s, false)), ...(d?.shared || []).map((s) => map(s, true))]
}

/** Duyet moi buoc (ke ca children cua repeat) */
function walkSteps(steps: unknown, fn: (st: { type?: string; params?: Record<string, unknown> }) => void): void {
  if (!Array.isArray(steps)) return
  for (const st of steps) {
    if (!st || typeof st !== 'object') continue
    fn(st as never)
    const s = st as { children?: unknown; params?: { children?: unknown } }
    walkSteps(s.children, fn)
    walkSteps(s.params?.children, fn)
  }
}

const CAPTION_NAMES = [/caption/, /noi_dung|content/, /mo_ta|desc/, /text/, /tieu_de|title/]
const isCaptionName = (n: string) => CAPTION_NAMES.some((re) => re.test(n))
/** do uu tien lam caption (nho = uu tien): caption > noi dung > mo ta > text > tieu de */
const captionRank = (n: string) => {
  const i = CAPTION_NAMES.findIndex((re) => re.test(n))
  return i < 0 ? 99 : i
}

/** Bien cua kich ban + vai tro (video / caption) de app tu dien. */
export async function paScriptFields(scriptId: string): Promise<PaScriptFields> {
  const id = encodeURIComponent(scriptId)
  const [inp, full] = await Promise.all([
    paCall<{ scriptId: string; name: string; inputs?: PaScriptInput[] }>(`/scripts/${id}/inputs`),
    paCall<{ id: string; name: string; steps?: unknown[] }>(`/scripts/${id}`)
  ])
  const warnings: string[] = []
  // node send_file: bien nao dien vao videoId
  let hasSendFile = false
  let sendVar: string | undefined
  let fixedVideo = false
  const placeholders: string[] = []
  const sendVars = new Set<string>()
  walkSteps(full?.steps, (st) => {
    const params = st.params || {}
    if (st.type === 'send_file') {
      hasSendFile = true
      const m = /^\s*\{\{\s*([A-Za-z0-9_]+)\s*\}\}\s*$/.exec(String(params.videoId ?? ''))
      if (m) {
        sendVars.add(m[1])
        sendVar = sendVar || m[1]
      } else if (params.videoId) fixedVideo = true
    }
    for (const v of Object.values(params)) {
      if (typeof v !== 'string') continue
      for (const m of v.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!placeholders.includes(m[1])) placeholders.push(m[1])
    }
  })
  const inputs = Array.isArray(inp?.inputs) ? inp.inputs.filter((x) => x && x.name) : []
  let fields: PaField[]
  if (inputs.length) {
    fields = inputs.map((x) => ({
      ...x,
      role: x.type === 'video' || sendVars.has(x.name) ? 'video' : (x.type === 'text' || x.type === 'string') && isCaptionName(x.name) ? 'caption' : 'other'
    }))
  } else {
    fields = placeholders.map((n) => {
      const video = sendVars.has(n) || /video/.test(n) || /_file$/.test(n)
      return {
        name: n,
        label: n,
        type: video ? 'video' : /_url$/.test(n) ? 'url' : isCaptionName(n) ? 'text' : 'string',
        required: true,
        role: video ? 'video' : isCaptionName(n) ? 'caption' : 'other'
      } as PaField
    })
    for (const n of placeholders) if (!VAR_NAME.test(n)) warnings.push(`Biến {{${n}}} có chữ HOA / ký tự lạ — Phone Agent sẽ bỏ qua biến này (chỉ nhận chữ thường, số, gạch dưới).`)
  }
  // nhieu o video: uu tien bien cua send_file
  const videoField = fields.find((f) => f.role === 'video' && sendVars.has(f.name)) || fields.find((f) => f.role === 'video')
  for (const f of fields) if (f.role === 'video' && f !== videoField) f.role = 'other'
  // chi 1 o caption (app dien san chu dang kem) — cac o con lai la bien thuong
  const caps = fields.filter((f) => f.role === 'caption').sort((a, b) => captionRank(a.name) - captionRank(b.name))
  for (const f of caps.slice(1)) f.role = 'other'
  // chua co o caption ro rang -> o chu dau tien (text) la caption
  if (!fields.some((f) => f.role === 'caption')) {
    const t = fields.find((f) => f.role === 'other' && (f.type === 'text' || f.type === 'string'))
    if (t) t.role = 'caption'
  }
  if (!hasSendFile) warnings.push('Kịch bản không có bước “Truyền file” (send_file) — video sẽ KHÔNG được chuyển vào iPhone.')
  else if (!videoField) {
    warnings.push(
      fixedVideo
        ? 'Bước “Truyền file” đang chọn cố định 1 video trong thư viện — sửa thành {{video_id}} để app truyền đúng video vừa tạo.'
        : 'Không thấy biến video ({{video_id}}) trong bước “Truyền file”.'
    )
  }
  return {
    scriptId: String(full?.id || scriptId),
    name: String(full?.name || inp?.name || scriptId),
    declared: inputs.length > 0,
    fields,
    videoVar: videoField?.name || sendVar,
    hasSendFile,
    warnings
  }
}

export async function paRegisterVideo(url: string, name: string, size: number): Promise<{ id: string; urlReachable?: boolean }> {
  const d = await paCall<{ id: string; urlReachable?: boolean }>('/videos/register', {
    method: 'POST',
    body: { url, name: name.slice(0, 120), mimeType: 'video/mp4', size },
    retries: 1,
    timeoutMs: 120000
  })
  if (!d?.id) throw new Error('Phone Agent không trả về id video.')
  return d
}

export async function paDeleteVideo(id: string): Promise<void> {
  await paCall(`/videos/${encodeURIComponent(id)}`, { method: 'DELETE', retries: 1 })
}

export async function paRunScript(scriptId: string, deviceId: string, variables: Record<string, string>) {
  return paCall<{ message: string; scriptId: string; deviceId: string; hasVariables: boolean; resolvedVariables?: string[] }>(
    `/scripts/${encodeURIComponent(scriptId)}/run`,
    // KHONG tu thu lai: lenh chay co the da nhan (mat phan hoi) -> thu lai = dang 2 lan
    { method: 'POST', body: { deviceId, variables }, retries: 0, timeoutMs: 60000 }
  )
}

export async function paExecutions(limit = 15): Promise<PaExecution[]> {
  const d = await paCall<PaExecution[]>('/executions', { query: { limit } })
  return Array.isArray(d) ? d : []
}

export async function paExecution(id: string): Promise<PaExecution> {
  return paCall<PaExecution>(`/executions/${encodeURIComponent(id)}`, { timeoutMs: 60000 })
}
