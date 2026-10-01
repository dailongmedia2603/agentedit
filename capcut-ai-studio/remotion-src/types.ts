// RenderSpec — hop dong giua sidecar (remotion_plan.build_spec) va bo dung Remotion.
// Moi moc gio o day la gio TREN TIMELINE (giay), da quy doi xong tu gio nguon.
// Composition chi VE theo spec, khong tu quyet dinh noi dung — muon doi cach
// chon thi sua o sidecar, muon doi cach ve thi sua o remotion-src/.

export interface RSTransition {
  type: string // id trong remotion_catalog.json -> transitions
  duration: number // giay
  /** true = can chat lieu hai ben diem cat (hoa tan, day...). Sidecar da kiem du chat lieu. */
  overlap: boolean
}

export interface RSClip {
  id: string
  kind: 'body' | 'hook' | 'insert'
  path: string
  start: number // gio timeline
  end: number
  srcStart: number // gio trong file
  speed: number
  volume: number // 0..1
  /** cover = phu kin khung; blur = giu tron khung hinh, lap phan thua bang nen mo */
  fit: 'cover' | 'blur'
  scale: number // phong them tren nen fit (1 = khong)
  /** ZOOM MUOT: clip bat dau o muc zoom nay (= muc clip truoc dang giu) roi ease in-out toi `scale` trong
   *  `zoomDur` giay — khong bao gio nhay zoom o diem cat (sidecar remotion_plan._smooth_zoom). */
  zoomFrom?: number
  zoomDur?: number
  x: number // lech ngang, phan so cua canvas (-1..1)
  y: number
  /** Chuyen canh SANG clip ke tiep, nam giua diem cat `end`. */
  transitionOut: RSTransition | null
  /** Vi tri khuon mat trong khung NGUON (0..1, goc tren-trai) -> canh khung khi cat vao cua so nho */
  face?: { cx: number; cy: number; h: number } | null
  /** kich thuoc khung nguon (px) — de tinh khung cat theo khuon mat */
  srcW?: number
  srcH?: number
  /** Dong bang 1 khung (freeze frame) suot clip */
  freeze?: boolean
  /** Video CHI CO NGUOI (nen trong suot, WebM VP9 alpha) cho doan [srcStart, srcEnd] gio nguon —
   *  ve de len lop chu `behind` de chu nam SAU nguoi. */
  subject?: { path: string; srcStart: number; srcEnd: number }
}

// ---------------------------------------------------------------------------
// BO CUC (scene): A-roll dat o dau, nen gi, B-roll o dau — theo tung khoang thoi gian
// ---------------------------------------------------------------------------
export type RSLayout = 'full' | 'split' | 'card' | 'circle' | 'broll' | 'graphic'

export interface RSRect {
  x: number // mep trai, phan so be ngang canvas
  y: number // mep tren, phan so chieu cao canvas
  w: number
  h: number
  /** bo goc, phan so be ngang canvas; >= 0.5*min(w,h) = tron */
  radius: number
}

export interface RSBackground {
  kind: 'gradient' | 'color' | 'image' | 'blur_aroll'
  /** anh nen la TU LIEU cua nguoi dung (id) — chi de bao cao, khong anh huong cach ve */
  um?: string
  colors?: string[]
  angle?: number
  path?: string
  /** hoa van trang tri tren nen */
  pattern?: 'curves' | 'grid' | 'dots' | 'rays' | 'none'
  patternColor?: string
  /** anh nen: lam mo / den trang */
  blur?: number
  grade?: string
}

export interface RSMedia {
  kind: 'image' | 'video' | 'source'
  path: string
  /** panel la TU LIEU cua nguoi dung (id). 'video' = tu lieu video (tat tieng, chay tu srcStart) */
  um?: string
  srcStart?: number
  fit?: 'cover' | 'contain'
  /** chuyen dong cham tren anh tinh (Ken Burns) */
  kenburns?: 'in' | 'out' | 'left' | 'right' | 'up' | 'none'
  grade?: string
  blur?: number
}

export interface RSScene {
  id: string
  start: number
  end: number
  layout: RSLayout
  bg?: RSBackground | null
  /** B-roll: nua tren (split) hoac full (broll) */
  panel?: RSMedia | null
  /** khung chua A-roll (card / circle / split) */
  aroll?: (RSRect & { border?: string; shadow?: boolean }) | null
  /** khung chua panel B-roll (split / broll) */
  panelRect?: RSRect | null
  /** giay de chuyen muot tu bo cuc truoc sang bo cuc nay (0 = cat thang) */
  morph?: number
  /** POP-OUT (card/circle): khung video keo dai len tren them bay nhieu (phan chieu cao canvas);
   *  phan do chi hien NGUOI (clip.subject) -> dau troi ra khoi mep khung */
  popout?: number
}

// ---------------------------------------------------------------------------
// LOP DO HOA (layer): chu, hinh, anh, icon... voi keyframe + hieu ung vao/ra/lap
// ---------------------------------------------------------------------------
export interface RSShadow {
  x: number
  y: number
  blur: number
  color: string
}

export interface RSSpan {
  text: string
  font?: string
  size?: number
  weight?: number
  italic?: boolean
  uppercase?: boolean
  color?: string
  gradient?: string[]
  glow?: { color: string; size: number } | null
  stroke?: { width: number; color: string } | null
  /** xuong dong TRUOC span nay */
  newline?: boolean
  /** dich doc (em) — de xep chong "so to + chu nho" */
  dy?: number
  opacity?: number
}

export interface RSKeyframe {
  t: number // giay, tinh tu luc lop bat dau
  x?: number
  y?: number
  scale?: number
  scaleX?: number
  rotation?: number
  skewX?: number
  opacity?: number
  blur?: number
  easing?: string
}

export interface RSMotion {
  preset: string
  duration?: number
  stagger?: number
  easing?: string
  from?: 'left' | 'right' | 'top' | 'bottom'
  amount?: number
  speed?: number
}

export interface RSLayer {
  id: string
  start: number
  end: number
  track: number
  type: 'text' | 'box' | 'circle' | 'ring' | 'line' | 'arrow' | 'image' | 'emoji' | 'badge' | 'counter' | 'progress' | 'speedlines' | 'video'
  /** Lop dung TU LIEU cua nguoi dung (id): anh / video hien len video (sidecar user_media.py) */
  um?: string
  /** Lop 'video': giay bat dau trong file tu lieu */
  mediaStart?: number
  x: number
  y: number
  w?: number
  h?: number
  anchor?: 'center' | 'left' | 'right' | 'top' | 'bottom'
  rotation?: number
  skewX?: number
  scale?: number
  opacity?: number
  // chu
  spans?: RSSpan[]
  font?: string
  size?: number
  weight?: number
  italic?: boolean
  uppercase?: boolean
  color?: string
  gradient?: string[]
  letterSpacing?: number
  lineHeight?: number
  align?: 'left' | 'center' | 'right'
  maxWidth?: number
  stroke?: { width: number; color: string } | null
  shadow?: RSShadow[] | null
  glow?: { color: string; size: number } | null
  box?: { color: string; radius?: number; padX?: number; padY?: number; border?: string; blur?: number } | null
  /** lam sang dan tung chu theo loi noi (the "prompt") */
  reveal?: 'none' | 'dim_to_bright'
  /** Chu noi bat ve bang ANH AI — moi tang 1 anh (px khung), words = khoang x (0..1) tung tu */
  art?: { src: string; w: number; h: number; mt?: number; words?: [number, number][] }[]
  words?: RSWord[] | null
  // hinh
  fill?: string
  fillGradient?: string[]
  strokeColor?: string
  strokeWidth?: number
  radius?: number
  /** duong / mui ten: cac diem (phan so canvas), cong theo curve */
  points?: [number, number][]
  curve?: number
  // anh / emoji / huy hieu / bo dem
  path?: string
  fit?: 'cover' | 'contain'
  mask?: 'none' | 'round' | 'circle'
  border?: string
  emoji?: string
  label?: string
  value?: string
  active?: boolean
  from?: number
  to?: number
  prefix?: string
  suffix?: string
  decimals?: number
  // chuyen dong
  enter?: RSMotion | null
  exit?: RSMotion | null
  loop?: RSMotion | null
  keyframes?: RSKeyframe[] | null
  motionBlur?: boolean
  /** an phu de trong luc lop nay hien (chu nhan thay cho phu de) */
  replacesSubtitle?: boolean
  /** Nam SAU nguoi noi (giua nen video va nguoi) — can clip.subject */
  behind?: boolean
}

export type CaptionRole = 'hero' | 'support' | 'micro'

export interface RSWord {
  text: string
  start: number
  end: number
}

export interface RSCaption {
  id: string
  text: string
  start: number
  end: number
  role: CaptionRole
  style: string // id caption_styles
  font: string // id fonts
  color: string
  accent: string
  /** -1 (mep tren) .. 1 (mep duoi), 0 = giua khung */
  y: number
  /** co chu (px o khung rong 1080) */
  size: number
  emphasis: string[]
  uppercase: boolean
  /** Moc tung chu (karaoke). null -> composition tu chia deu theo do dai chu. */
  words: RSWord[] | null
}

export interface RSEffect {
  id: string
  type: string // id effects
  start: number
  end: number
  intensity: number // 0..1
  params?: Record<string, string>
}

export interface RSAudio {
  id: string
  path: string
  start: number
  volume: number
  srcStart: number
  srcEnd: number | null
  role: 'sfx' | 'bgm'
  name?: string
  /** do to khi phat so voi giong noi cua video (dB) — SFX da can theo giong (plan_guard.mix_sfx) */
  rel?: number | null
  /** tieng code tu gan khi CHU hien (luat moi chu co tieng) — luat hook khong tinh la tieng gay chu y */
  textAuto?: boolean
}

export interface RSOverlay {
  id: string
  path: string
  start: number
  end: number
  srcStart: number
  volume: number
  scale: number
  x: number
  y: number
}

export interface RenderSpec {
  version: 1
  /** 2 = video HDR da doi sang ban lam viec SDR + lop tach nguoi khop khung (sidecar SPEC_MEDIA_VERSION).
   *  Thieu / < 2 = spec cu -> UI dung lai tu plan khi mo du an. */
  media?: number
  fps: number
  width: number
  height: number
  duration: number
  title?: string
  grade: { preset: string; intensity: number }
  clips: RSClip[]
  captions: RSCaption[]
  effects: RSEffect[]
  audio: RSAudio[]
  overlays: RSOverlay[]
  /** bo cuc theo thoi gian (khong co = A-roll full suot video) */
  scenes?: RSScene[]
  /** lop do hoa (motion graphics) */
  layers?: RSLayer[]
  /** Hieu ung TU VIET (khung SVG ve san trong hop cach ly, tai tu file) */
  fx?: RSFx[]
  /** Bien doi KHUNG VIDEO tu viet (so tinh san tung khung) */
  fxTransforms?: RSFxTransform[]
  /** Electron chen vao luc chay: goc URL cua may chu media cuc bo. */
  mediaBase?: string
}

/** Hieu ung tu viet — lop phu: file JSON {fps, n, frames: [svg], idx: [chi so khung]} */
export interface RSFx {
  id: string
  start: number
  end: number
  layer?: 'front' | 'behind'
  file: string
}

/** Hieu ung tu viet — bien doi khung video: values[khoa][khung] */
export interface RSFxTransform {
  id: string
  start: number
  end: number
  n: number
  values: Partial<Record<'scale' | 'x' | 'y' | 'rotate' | 'blur' | 'brightness' | 'contrast' | 'saturate' | 'hueRotate', number[]>>
}

export interface AutoEditProps {
  spec: RenderSpec
  [key: string]: unknown
}
