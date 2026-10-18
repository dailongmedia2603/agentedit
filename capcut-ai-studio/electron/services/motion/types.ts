// TAO VIDEO BANG AI (skill motionmaxxing) — kieu dung chung cho main process (2026-10-14).
// Tach HOAN TOAN khoi luong Edit Video (Remotion): du lieu o ~/.capcut-studio/motion, khong dung projects.json.
// Ban sao kieu cho renderer: src/global.d.ts (Motion*). Sua o day thi sua ca ben do.

export type MotionAspect = '9:16' | '16:9' | '1:1'

/** Quy trinh dung: motionmaxxing (dong goi trong app, mac dinh) | mvd = skill motion-video-director CA NHAN tren may nay
 *  (pipeline B: anh AI nhat quan + nhac theo nhip — motion/mvd.ts; khong dong goi cho khach). */
export type MotionEngine = 'motionmaxxing' | 'mvd'

/** Thong tin skill can de tao 1 video hoan chinh (form "Tao video" / thong tin chung du an Automation + 1 tin). */
export interface MotionBrief {
  /** Ten san pham / thuong hieu / kenh */
  name: string
  /** Website (skill tu lay logo, mau, font, anh chup man hinh) */
  website?: string
  /** Loai video: launch | promo | feature | brand | kinetic | social_ad | explainer | news */
  videoType: string
  /** Noi dung chinh muon noi (bat buoc voi "Tao video"; Automation lay tu tin) */
  message: string
  audience?: string
  /** Muc tieu: nguoi xem lam gi sau khi xem */
  goal?: string
  /** Loi keu goi / ket thuc (vd "Tai app tai agentedit.vn") */
  cta?: string
  /** Tong / cam xuc */
  tone?: string
  aspect: MotionAspect
  /** Giay */
  duration: number
  /** Ngon ngu chu tren video + loi doc: 'vi' | 'en' */
  language: string
  /** Mau thuong hieu (hex / mo ta) */
  colors?: string
  /** Font thuong hieu (ten) */
  fonts?: string
  /** File nguoi dung tai len (logo, anh san pham, anh chup man hinh) — duong dan tuyet doi, chep vao inputs/ cua job */
  assets?: string[]
  voice: MotionVoice
  /** Ghi chu them cho AI */
  notes?: string
  /** Automation: tin lay ve (tieu de, noi dung, link, anh) */
  source?: MotionSourceItem
  /** Quy trinh dung (trong = motionmaxxing) */
  engine?: MotionEngine
}

export interface MotionVoice {
  enabled: boolean
  /** id giong SaydiVoice (vd vi-mark-rober-hot-tiktok, vc_... = giong rieng) */
  voiceId?: string
  voiceName?: string
  /** 0.7 - 1.3 */
  speed?: number
  /** Loi doc nguoi dung viet san (trong = AI tu viet) */
  script?: string
}

export interface MotionSourceItem {
  /** id on dinh cua tin (guid / link / id bai Facebook) */
  id: string
  title: string
  url?: string
  summary?: string
  content?: string
  image?: string
  published?: string
  sourceName?: string
}

export type MotionStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled' | 'interrupted'

export interface MotionJob {
  id: string
  kind: 'single' | 'auto'
  automationId?: string
  title: string
  brief: MotionBrief
  status: MotionStatus
  /** Buoc dang chay (stages.ts) */
  stage?: string
  /** Cac buoc da qua (thu tu lan dau gap) */
  stages?: string[]
  createdAt: number
  startedAt?: number
  finishedAt?: number
  /** Thu muc lam viec ~/.capcut-studio/motion/jobs/<id> */
  dir: string
  /** MP4 hoan chinh (film/final.mp4) */
  output?: string
  /** true = chi co ban nhap (AI chua xuat ban cuoi) */
  draftOnly?: boolean
  meta?: { width?: number; height?: number; seconds?: number; size?: number }
  /** NOTE.md cua skill (bao cao trung thuc: y tuong, cong G0-G5) */
  note?: string
  error?: string
  model?: string
  costUsd?: number
}

export type MotionSourceType = 'web' | 'facebook'

export interface AutoSource {
  id: string
  type: MotionSourceType
  /** web: link trang tin / chuyen muc / RSS; facebook: link trang hoac id trang */
  url: string
  label?: string
  /** Facebook Page Access Token — luu MA HOA (safeStorage), khong tra ve renderer */
  tokenEnc?: string
}

/** Thong tin chung cua du an Automation = brief tru noi dung (noi dung lay tu tin moi) */
export type AutoDefaults = Omit<MotionBrief, 'message' | 'source'> & { message?: string }

export interface AutoProject {
  id: string
  name: string
  enabled: boolean
  createdAt: number
  defaults: AutoDefaults
  sources: AutoSource[]
  /** Phut giua 2 lan kiem tin moi (>= 5) */
  intervalMin: number
  /** Toi da video tao moi lan kiem */
  maxPerCheck: number
  /** Toi da video / ngay (bao ve han muc Claude + Saydi) */
  maxPerDay: number
  /** Lan dau kiem 1 nguon: chi ghi nhan tin dang co, KHONG tao video (chi tin dang SAU do) */
  skipExisting: boolean
  lastCheckAt?: number
  nextCheckAt?: number
  lastResult?: string
  lastError?: string
  /** id tin da xu ly theo nguon (giu toi da 500 / nguon) */
  seen: Record<string, string[]>
  /** nguon da qua lan dau */
  primed: Record<string, boolean>
  /** ngay (YYYY-MM-DD) -> so video da tao */
  daily?: Record<string, number>
  /** Tu dong dang video xong len kenh qua Phone Agent (iPhone + kich ban) — electron/services/phoneagent/auto.ts */
  post?: AutoPostConfig
}

/** Cau hinh tu dong dang cua 1 du an Automation (2026-10-19) */
export interface AutoPostConfig {
  enabled: boolean
  deviceId: string
  deviceName?: string
  scriptId: string
  scriptName?: string
  /** ten bien chua id video (send_file) — trong = tu do luc dang */
  videoVar?: string
  /** bien cua kich ban (mau) — {title} {summary} {link} {source} {channel} {date} thay theo tung video */
  variables: Record<string, string>
  /** now = dang ngay khi video xong; delay = sau delayMin phut; slots = khung gio co dinh trong ngay */
  timing: 'now' | 'delay' | 'slots'
  delayMin?: number
  /** "HH:MM" — moi khung 1 video / ngay */
  slots?: string[]
  /** luc bat tu dong dang — video xong TRUOC moc nay khong tu dang */
  enabledAt?: number
}
