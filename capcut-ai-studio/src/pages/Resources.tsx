import { useEffect, useState } from 'react'
import { Music2, Disc3, Laugh, Type, Sparkles, CaseSensitive } from 'lucide-react'
import { cn } from '@/lib/utils'
import SfxPage from '@/pages/Sfx'
import MusicLibraryPage from '@/pages/MusicLibrary'
import MemesPage from '@/pages/Memes'
import TextTemplatesPage from '@/pages/TextTemplates'
import FxLibraryPage from '@/pages/FxLibrary'
import FontLibraryPage from '@/pages/FontLibrary'

type ResourceTab = 'sfx' | 'music' | 'memes' | 'text' | 'fx' | 'fonts'

const KEY = 'studio.resourcesTab'

function loadTab(): ResourceTab {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'sfx' || v === 'music' || v === 'memes' || v === 'text' || v === 'fx' || v === 'fonts') return v
  } catch {
    /* localStorage khong dung duoc (vd che do rieng tu) -> mac dinh */
  }
  return 'sfx'
}

function saveTab(t: ResourceTab) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* bo qua, chi mat nho tab o lan mo sau */
  }
}

const TABS: { id: ResourceTab; label: string; icon: typeof Music2 }[] = [
  { id: 'sfx', label: 'Kho âm thanh', icon: Music2 },
  { id: 'music', label: 'Nhạc nền', icon: Disc3 },
  { id: 'memes', label: 'Kho meme', icon: Laugh },
  { id: 'text', label: 'Kho Text', icon: Type },
  { id: 'fx', label: 'Kho hiệu ứng', icon: Sparkles },
  { id: 'fonts', label: 'Kho font', icon: CaseSensitive }
]

/** Trang "Tài nguyên": gộp Kho âm thanh + Nhạc nền + Kho meme + Kho Text + Kho hiệu ứng + Kho font vào tab con (nhớ tab vừa mở). */
export default function ResourcesPage() {
  const [tab, setTab] = useState<ResourceTab>(loadTab)

  useEffect(() => {
    saveTab(tab)
  }, [tab])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-black/5 bg-white/40 px-8 pt-5">
        <h1 className="text-2xl font-bold text-ink-900">Tài nguyên</h1>
        <p className="mt-1 text-sm text-ink-800/50">
          Các kho tài nguyên dùng chung khi AI dựng video: âm thanh, nhạc nền, meme chèn, mẫu chữ động, hiệu ứng đã viết và font thương hiệu.
        </p>
        <div className="mt-4 flex gap-1">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-ink-800/50 hover:text-ink-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={tab === 'sfx' ? '' : 'hidden'}>
          <SfxPage />
        </div>
        <div className={tab === 'music' ? '' : 'hidden'}>
          <MusicLibraryPage />
        </div>
        <div className={tab === 'memes' ? '' : 'hidden'}>
          <MemesPage />
        </div>
        <div className={tab === 'text' ? '' : 'hidden'}>
          <TextTemplatesPage />
        </div>
        <div className={tab === 'fx' ? '' : 'hidden'}>
          <FxLibraryPage />
        </div>
        <div className={tab === 'fonts' ? '' : 'hidden'}>
          <FontLibraryPage />
        </div>
      </div>
    </div>
  )
}
