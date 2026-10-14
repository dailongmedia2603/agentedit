// Doc luong `claude -p --output-format stream-json` -> buoc dang lam (hien cho nguoi dung) + dong nhat ky de doc.
// Module thuan -> tests/test_motion.mts.

export const STAGES: { id: string; label: string }[] = [
  { id: 'prepare', label: 'Chuẩn bị' },
  { id: 'brand', label: 'Tìm hiểu thương hiệu' },
  { id: 'idea', label: 'Lên ý tưởng & kịch bản' },
  { id: 'voice', label: 'Tạo giọng đọc' },
  { id: 'build', label: 'Dựng chuyển động' },
  { id: 'review', label: 'Tự kiểm tra & sửa' },
  { id: 'final', label: 'Xuất video hoàn chỉnh' },
  { id: 'note', label: 'Viết báo cáo' }
]

export function stageLabel(id?: string): string {
  return STAGES.find((s) => s.id === id)?.label || 'Đang tạo video'
}

/** Buoc ung voi 1 lan Claude goi cong cu (null = khong doi buoc). */
export function stageOfTool(name: string, input: Record<string, unknown> | undefined): string | null {
  const inp = input || {}
  if (name === 'Bash') {
    const full = String(inp.command || '')
    // bo noi dung heredoc (cat > film/NOTE.md <<'EOF' ... nhac ten script trong chu, khong phai lenh chay)
    const c = full.split(/<<-?\s*['"]?\w+['"]?/)[0]
    if (/NOTE\.md/i.test(c) && /<</.test(full)) return 'note'
    // chi tinh khi script THUC SU duoc chay (node / python3 ... <script>), khong tinh grep / cat / --help
    if (/\s--help\b/.test(c)) return null
    const run = (script: string, rest = '') => new RegExp(`(?:node|python3?)\\s+[^\\n|;&]*?${script}["']?${rest}`).test(c)
    if (run('brand\\.mjs') || run('fetch_logo\\.mjs')) return 'brand'
    if (run('precedent\\.py')) return 'idea'
    if (run('voice\\.py', '\\s+(vo|split)\\b') || run('sync\\.mjs')) return 'voice'
    if (run('render\\.mjs', '[^\\n|;&]*final\\.mp4')) return 'final'
    if (run('look\\.py') || run('lint\\.mjs')) return 'review'
    if (run('render\\.mjs') || run('imagegen\\.py') || run('mix\\.py')) return 'build'
    return null
  }
  if (name === 'Write' || name === 'Edit') {
    const f = String(inp.file_path || '')
    if (/STORYBOARD\.md$|vo\.txt$/i.test(f)) return 'idea'
    if (/NOTE\.md$/i.test(f)) return 'note'
    if (/\.html$/i.test(f)) return 'build'
  }
  if (name === 'Skill') return 'idea'
  return null
}

export interface StreamInfo {
  stage?: string
  /** dong nhat ky de doc (da rut gon) */
  lines: string[]
  /** su kien ket thuc */
  result?: { ok: boolean; text: string; costUsd?: number; turns?: number }
  /** model thuc chay (system init) */
  model?: string
}

const short = (s: string, n = 220) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** 1 dong JSON cua stream -> thong tin. Dong hong / khong quan tam -> { lines: [] }. */
export function parseStreamLine(line: string): StreamInfo {
  const out: StreamInfo = { lines: [] }
  let d: any
  try {
    d = JSON.parse(line)
  } catch {
    return out
  }
  if (!d || typeof d !== 'object') return out
  if (d.type === 'system' && d.subtype === 'init') {
    out.model = d.model
    out.lines.push(`Claude bắt đầu (model ${d.model || '?'})`)
    if (Array.isArray(d.skills) && !d.skills.includes('motionmaxxing')) out.lines.push('CẢNH BÁO: Claude không nạp được skill motionmaxxing')
    return out
  }
  if (d.type === 'assistant' && Array.isArray(d.message?.content)) {
    for (const c of d.message.content) {
      if (c?.type === 'text' && c.text?.trim()) out.lines.push('AI: ' + short(c.text, 400))
      if (c?.type === 'tool_use') {
        const st = stageOfTool(c.name, c.input)
        if (st) out.stage = st
        const inp = c.input || {}
        const what =
          c.name === 'Bash'
            ? String(inp.description || inp.command || '')
            : c.name === 'Write' || c.name === 'Edit' || c.name === 'Read'
              ? String(inp.file_path || '')
              : c.name === 'Skill'
                ? String(inp.skill || inp.name || '')
                : JSON.stringify(inp)
        out.lines.push(`▸ ${c.name}: ${short(what)}`)
      }
    }
    return out
  }
  if (d.type === 'result') {
    out.result = {
      ok: d.subtype === 'success' && !d.is_error,
      text: String(d.result || d.error || d.subtype || ''),
      costUsd: typeof d.total_cost_usd === 'number' ? d.total_cost_usd : undefined,
      turns: d.num_turns
    }
    out.lines.push(out.result.ok ? 'Claude đã xong.' : 'Claude dừng với lỗi: ' + short(out.result.text, 400))
  }
  return out
}
