import { useState } from 'react'
import { AlertTriangle, Cloud, HardDrive, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, CardBody, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { importAndCheck, usePreviewFont, useUploadedFonts } from '@/lib/uploadedFonts'

const SAMPLE = 'Giảm giá SỐC hôm nay — Chữ Việt đầy đủ dấu: ắằẳẵặ ơờởỡợ ưừửữự 0123456789'

function FontRow({ f, canDelete, onDelete }: { f: UploadedFont; canDelete: boolean; onDelete: () => void }) {
  usePreviewFont(f)
  const fam = `"${f.css}", "Be Vietnam Pro", sans-serif`
  return (
    <Card>
      <CardBody className="space-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink-900">{f.label}</span>
          {f.scope === 'shared' ? (
            <Badge tone="brand">
              <Cloud className="mr-1 inline h-3 w-3" />
              Kho chung — mọi máy
            </Badge>
          ) : (
            <Badge tone="neutral">
              <HardDrive className="mr-1 inline h-3 w-3" />
              Chỉ máy này
            </Badge>
          )}
          <span className="text-[12px] text-ink-800/50">
            {f.files.length} file · độ đậm {f.weights.join(', ')}
            {f.italic ? ' · có nghiêng' : ''}
          </span>
          {f.vi_missing ? (
            <Badge tone="warn">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Thiếu {f.vi_missing.length} chữ tiếng Việt
            </Badge>
          ) : (
            <Badge tone="ok">Đủ dấu tiếng Việt</Badge>
          )}
          <div className="flex-1" />
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} title="Gỡ bộ font này">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {[...new Set(f.weights)].map((w) => (
            <div key={w} className="truncate text-[22px] leading-snug text-ink-900" style={{ fontFamily: fam, fontWeight: w }}>
              {SAMPLE}
            </div>
          ))}
        </div>
        {f.vi_missing && (
          <div className="text-[12px] text-amber-700">
            Font không có: {Array.from(f.vi_missing).slice(0, 40).join(' ')}
            {f.vi_missing.length > 40 ? ' …' : ''} — các chữ này sẽ hiện bằng font dự phòng.
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/** Tài nguyên > Font: máy chủ (có token kho chung) tải lên -> đồng bộ mọi máy; máy khác -> chỉ máy này. */
export default function FontLibraryPage() {
  const { fonts, canPublish, loaded, reload, syncing } = useUploadedFonts()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' | 'fail' } | null>(null)
  const scope: 'shared' | 'local' = canPublish ? 'shared' : 'local'

  const upload = async () => {
    const pick = await window.studio.pickFont()
    if (pick.canceled || !pick.filePaths?.length) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await importAndCheck(pick.filePaths, scope)
      const m = r.msg
      if (scope === 'shared' && r.fonts.length) m.text += ' · đã đẩy lên kho chung — máy khác nhận ở lần đồng bộ kho kế tiếp (mở app / nút Đồng bộ kho)'
      setMsg(m)
      await reload()
    } catch (e) {
      setMsg({ text: String((e as Error).message || e), tone: 'fail' })
    } finally {
      setBusy(false)
    }
  }

  const del = async (f: UploadedFont) => {
    const where = f.scope === 'shared' ? ' khỏi KHO CHUNG (mọi máy sẽ gỡ ở lần đồng bộ sau)' : ' khỏi máy này'
    if (!confirm(`Gỡ bộ font "${f.label}"${where}? Video đã chọn font này sẽ dùng font dự phòng.`)) return
    setBusy(true)
    try {
      const r = await window.studio.fontsDelete(f.id)
      setMsg(r.ok ? { text: `Đã gỡ ${f.label}.`, tone: 'ok' } : { text: r.error || 'Gỡ font lỗi.', tone: 'fail' })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const shared = fonts.filter((f) => f.scope === 'shared')
  const local = fonts.filter((f) => f.scope === 'local')

  return (
    <div className="space-y-5 px-8 py-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-900">Kho font</h2>
          <p className="mt-1 text-sm text-ink-800/55">
            Font thương hiệu dùng khi tạo video (chọn ở Brand Guideline › Typography): AI lập kế hoạch và dựng video bằng đúng
            font này.{' '}
            {canPublish
              ? 'Máy này là máy chủ: font tải lên ở đây được đẩy lên kho chung và tự đồng bộ sang mọi máy.'
              : 'Font tải lên ở đây chỉ lưu trên máy này. Font kho chung do máy chủ tải lên sẽ tự đồng bộ về.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={busy}>
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} /> {syncing ? 'Đang đồng bộ…' : 'Tải lại'}
        </Button>
        <Button onClick={upload} disabled={busy}>
          {busy ? <Spinner /> : <Upload className="h-4 w-4" />}
          {uploadLabel(canPublish)}
        </Button>
      </div>
      {msg && (
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-[13px]',
            msg.tone === 'ok' && 'bg-emerald-500/10 text-emerald-700',
            msg.tone === 'warn' && 'bg-amber-500/10 text-amber-700',
            msg.tone === 'fail' && 'bg-red-500/10 text-red-600'
          )}
        >
          {msg.text}
        </div>
      )}
      {!loaded ? (
        <Spinner />
      ) : !fonts.length ? (
        <div className="rounded-2xl border border-dashed border-black/10 px-6 py-10 text-center text-sm text-ink-800/50">
          Chưa có font nào. Bấm “{uploadLabel(canPublish)}” và chọn các file .ttf / .otf / .woff của cùng một bộ font (Regular,
          Bold…).
        </div>
      ) : (
        <>
          {shared.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-ink-800/70">Kho chung ({shared.length})</h3>
              {shared.map((f) => (
                <FontRow key={f.id} f={f} canDelete={canPublish} onDelete={() => void del(f)} />
              ))}
            </section>
          )}
          {local.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-ink-800/70">Chỉ máy này ({local.length})</h3>
              {local.map((f) => (
                <FontRow key={f.id} f={f} canDelete onDelete={() => void del(f)} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function uploadLabel(canPublish: boolean) {
  return canPublish ? 'Tải font lên kho chung' : 'Tải font lên (máy này)'
}
