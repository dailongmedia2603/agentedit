import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Film, RefreshCw } from 'lucide-react'
import { Button, Input, Spinner } from '@/components/ui/primitives'
import { Field, TextArea } from '@/components/motion/BriefForm'
import { deviceStatusLabel, usePaCatalog } from '@/components/phoneagent/usePhoneAgent'

export interface PostTarget {
  deviceId: string
  deviceName?: string
  scriptId: string
  scriptName?: string
  videoVar?: string
  variables: Record<string, string>
}

export interface PickerMeta {
  /** du thong tin de dang (iPhone + kich ban co bien video + bien bat buoc da dien) */
  ok: boolean
  problem?: string
}

const selectCls = 'no-drag h-10 w-full rounded-xl border border-black/10 bg-ink-50 px-3 text-sm text-ink-900 outline-none focus:border-brand-400'

/**
 * Chon iPhone + kich ban Phone Agent + dien bien cua kich ban (bien video app tu dien = video dang dang).
 * Dung chung: hop thoai "Dang video" va muc "Tu dong dang" cua du an Automation.
 */
export function PostTargetPicker({
  value,
  onChange,
  onMeta,
  defaultCaption,
  tokenHint
}: {
  value: PostTarget
  onChange: (v: PostTarget) => void
  onMeta?: (m: PickerMeta) => void
  /** caption goi y khi o caption con trong */
  defaultCaption?: string
  /** dong goi y bien mau (Automation: {title} {summary}...) */
  tokenHint?: string
}) {
  const cat = usePaCatalog()
  const [fields, setFields] = useState<PaScriptFields | null>(null)
  const [fieldsErr, setFieldsErr] = useState('')
  const [loadingFields, setLoadingFields] = useState(false)
  const latest = useRef(value)
  latest.current = value

  // doi kich ban -> doc bien cua kich ban, dien san caption / gia tri mac dinh
  useEffect(() => {
    setFields(null)
    setFieldsErr('')
    if (!value.scriptId || !cat.masked?.has_key) return
    let alive = true
    setLoadingFields(true)
    window.studio.phoneagentScriptFields(value.scriptId).then((r) => {
      if (!alive) return
      setLoadingFields(false)
      if (!r.ok) {
        setFieldsErr(r.error)
        return
      }
      setFields(r)
      const cur = latest.current
      const vars = { ...cur.variables }
      for (const f of r.fields) {
        if (f.role === 'video') continue
        if (vars[f.name] === undefined || vars[f.name] === '') {
          if (f.role === 'caption' && defaultCaption) vars[f.name] = defaultCaption.slice(0, f.maxLength || 5000)
          else if (f.default !== undefined) vars[f.name] = String(f.default)
        }
      }
      // bo bien khong con trong kich ban
      for (const k of Object.keys(vars)) if (!r.fields.some((f) => f.name === k && f.role !== 'video')) delete vars[k]
      onChange({ ...cur, scriptName: r.name, videoVar: r.videoVar, variables: vars })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.scriptId, cat.masked?.has_key])

  // bao cho cha biet da du thong tin chua
  useEffect(() => {
    let problem = ''
    if (!cat.masked?.has_key) problem = 'Chưa nhập API token Phone Agent (Cài đặt API).'
    else if (!value.deviceId) problem = 'Chọn iPhone.'
    else if (!value.scriptId) problem = 'Chọn kịch bản đăng.'
    else if (loadingFields || (!fields && !fieldsErr)) problem = 'Đang đọc kịch bản…'
    else if (fieldsErr) problem = fieldsErr
    else if (fields && !fields.videoVar) problem = 'Kịch bản chưa có biến video ở bước “Truyền file” — không truyền được video vào iPhone.'
    else if (fields) {
      const miss = fields.fields.find((f) => f.role !== 'video' && f.required && f.default === undefined && !String(value.variables[f.name] ?? '').trim())
      if (miss) problem = `Điền “${miss.label || miss.name}”.`
    }
    onMeta?.({ ok: !problem, problem: problem || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.masked?.has_key, value.deviceId, value.scriptId, value.variables, fields, fieldsErr, loadingFields])

  if (cat.masked && !cat.masked.has_key) {
    return (
      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
        Chưa nhập API token Phone Agent — vào <b>Cài đặt API › API Phone Agent</b> để nhập token và kiểm tra kết nối.
      </div>
    )
  }

  const setVar = (k: string, v: string) => onChange({ ...value, variables: { ...value.variables, [k]: v } })
  const dev = cat.devices.find((d) => d.id === value.deviceId)
  const scr = cat.scripts.find((s) => s.id === value.scriptId)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="iPhone" required hint={dev && dev.status !== 'online' ? `Máy đang ${deviceStatusLabel(dev.status)} — lượt đăng sẽ chờ máy sẵn sàng.` : undefined}>
          <select
            className={selectCls}
            value={value.deviceId}
            onChange={(e) => {
              const d = cat.devices.find((x) => x.id === e.target.value)
              onChange({ ...value, deviceId: e.target.value, deviceName: d?.name })
            }}
          >
            <option value="">{cat.loading ? 'Đang tải…' : '— Chọn iPhone —'}</option>
            {value.deviceId && !dev && <option value={value.deviceId}>{value.deviceName || value.deviceId} (không thấy trong tài khoản)</option>}
            {cat.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {deviceStatusLabel(d.status)}
                {typeof d.battery === 'number' ? ` · pin ${d.battery}%` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kịch bản đăng" required hint={scr?.description || undefined}>
          <div className="flex gap-2">
            <select
              className={selectCls}
              value={value.scriptId}
              onChange={(e) => {
                const s = cat.scripts.find((x) => x.id === e.target.value)
                onChange({ ...value, scriptId: e.target.value, scriptName: s?.name, videoVar: undefined })
              }}
            >
              <option value="">{cat.loading ? 'Đang tải…' : '— Chọn kịch bản —'}</option>
              {value.scriptId && !scr && <option value={value.scriptId}>{value.scriptName || value.scriptId} (không thấy trong tài khoản)</option>}
              {cat.scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.shared ? ' (dùng chung)' : ''}
                  {s.channel ? ` · ${s.channel}` : ''}
                </option>
              ))}
            </select>
            <Button variant="outline" className="h-10 shrink-0 px-3" onClick={cat.reload} disabled={cat.loading} title="Tải lại iPhone + kịch bản">
              {cat.loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </Field>
      </div>
      {cat.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{cat.error}</div>}

      {value.scriptId && loadingFields && (
        <div className="flex items-center gap-2 text-[12.5px] text-ink-800/55">
          <Spinner /> Đang đọc các biến của kịch bản…
        </div>
      )}
      {fieldsErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{fieldsErr}</div>}
      {fields && (
        <div className="space-y-3 rounded-xl border border-black/8 bg-white p-3">
          {fields.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </div>
          ))}
          {!fields.fields.length && <div className="text-[12.5px] text-ink-800/50">Kịch bản không có biến nào.</div>}
          {fields.fields.map((f) => {
            const label = (f.label || f.name) + (f.label && f.label !== f.name ? ` ({{${f.name}}})` : ` {{${f.name}}}`)
            if (f.role === 'video') {
              return (
                <Field key={f.name} label={label}>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-50 px-3 text-[13px] text-emerald-800">
                    <Film className="h-4 w-4" /> Video này — app tự tải lên và truyền vào iPhone
                  </div>
                </Field>
              )
            }
            const v = value.variables[f.name] ?? ''
            const hint = [f.description, f.maxLength ? `${String(v).length}/${f.maxLength} ký tự` : '', f.role === 'caption' ? tokenHint : ''].filter(Boolean).join(' · ') || undefined
            const req = !!f.required && f.default === undefined
            if (f.type === 'enum' && f.options?.length) {
              return (
                <Field key={f.name} label={label} required={req} hint={hint}>
                  <select className={selectCls} value={v} onChange={(e) => setVar(f.name, e.target.value)}>
                    <option value="">— Chọn —</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              )
            }
            if (f.type === 'boolean') {
              return (
                <label key={f.name} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-800/75">
                  <input type="checkbox" className="accent-brand-500" checked={v === 'true'} onChange={(e) => setVar(f.name, e.target.checked ? 'true' : 'false')} />
                  {label}
                </label>
              )
            }
            if (f.type === 'text' || f.role === 'caption') {
              return (
                <Field key={f.name} label={label} required={req} hint={hint}>
                  <TextArea rows={4} value={v} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => setVar(f.name, e.target.value)} />
                </Field>
              )
            }
            return (
              <Field key={f.name} label={label} required={req} hint={hint}>
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  min={f.min}
                  max={f.max}
                  maxLength={f.maxLength}
                  value={v}
                  placeholder={f.placeholder || (f.default !== undefined ? `Mặc định: ${String(f.default)}` : '')}
                  onChange={(e) => setVar(f.name, e.target.value)}
                />
              </Field>
            )
          })}
        </div>
      )}
    </div>
  )
}
