// Mau chu dong (Kho Text) — spec du lieu thuan, ve bang TextTemplate.tsx.
// Moi thong so lay tu file preset CapCut (draft_content.json + goi hieu ung Lumi), KHONG doan tay:
// - toa do transform theo quy uoc CapCut: x = nua chieu rong, y = nua chieu cao, truc y huong LEN
// - keyframe AE (Lumi) dung dung bang {bezier, [t0,t1], [v0,v1,(tiep tuyen)], [kieu], [che do]}
// Chu trong mau chi la CHU MAU: khi dung that, slot nhan chu that tu loi noi.
// Mau TU THIET KE (khong tu preset CapCut, vd text-designs/): dung cung quy uoc, them hinh (ShapeNode), lo dan (reveal),
// doi mau quet (colorSweep), in hoa (textCase) — renderer nay la chuan, so khop voi anh mau bang khung render.

/** Khoa keyframe AE/Lumi: [bezier(4 hoac 12 so), [t0, t1] (giay), [v0, v1, tan0?, tan1?], [kieu], [che do]] */
export type AeKey = [number[], [number, number], number[][], number[], number[]]

/** Keyframe CapCut (common_keyframes): [t (giay tu dau segment), gia tri, tayTrai.x, tayTrai.y, tayPhai.x, tayPhai.y]
 *  tay nam tuong doi (giay, don vi gia tri); doan giua 2 moc = bezier (t, v) — het tay nam = tuyen tinh */
export type CcKey = [number, number] | [number, number, number, number, number, number]

export interface CcTransform {
  x: number
  y: number
  scale: number
  rotation: number // do, theo chieu kim dong ho nhu CapCut UI
}

export interface TextShadow {
  color: [number, number, number]
  alpha: number
  distance: number
  angle: number
  smoothing: number
}

export interface TextNode {
  type: 'text'
  id: string
  slot: string
  start: number
  duration: number
  font: string // id trong spec.fonts
  size: number // font_size CapCut (15 = mac dinh)
  fill: [number, number, number]
  border?: { color: [number, number, number]; width: number; alpha: number }
  shadow?: TextShadow
  transform: CcTransform
  alpha?: number
  keyframes?: Partial<Record<'alpha' | 'x' | 'y' | 'scale' | 'rotation', CcKey[]>>
  /** chu nhieu kieu (rich text): cac doan noi nhau. len = so ky tu o chu mau; doan CUOI nhan phan con lai.
   *  Thieu -> 1 doan tu font/size/fill cua node. */
  runs?: TextRun[]
  /** CapCut italic_degree (chu nghieng gia lap) */
  italicDegree?: number
  /** CapCut letter_spacing (ti le em, am = khit) */
  letterSpacing?: number
  /** hoat anh tung ky tu (vd CapCut "Kich ban xuat hien" — script ma hoa, tham so DO tu video CapCut xuat that) */
  charAnim?: CharAnim
  /** hoat anh vao / ra CA KHOI chu (CapCut Transform.lua / LeftIn.lua / TextAnim.lua, hoac do tu video): bang mau theo thoi gian */
  anims?: SampledAnim[]
  /** 'upper': chu that luon IN HOA (o chu mau viet hoa — AI dien chu thuong van giu kieu chu cua mau) */
  textCase?: 'upper'
  /** lo dan (wipe) theo chieu ngang khung chu */
  reveal?: Reveal
  /** doi mau: chu hien mau `from` roi vet quet doi sang `fill` (kem vet sang tuy chon) */
  colorSweep?: ColorSweep
  /** co chu theo EM (px @ khung rong 1080, nhan transform.scale) thay cho size — mask chu CapCut do theo em */
  emPx?: number
  /** lam dam (CapCut bold_width cua mask chu): vien CUNG MAU day `bold` em moi ben */
  bold?: number
  /** bo dem so: tu t[i] (giay tu dau node) hien so = frac[i] x so cua chu (giu tien to / hau to / dau phan nghin) */
  counter?: { t: number[]; frac: number[] }
  /** to chu bang 1 anh gian theo khung NET chu (word-art CapCut text_effect) */
  fillImage?: string
  /** to chu bang khung video (CapCut mask "Van ban" tren clip video): hinh chu = mask, mau = khung video luc do */
  fillFrames?: FrameSeq
}

/** Chuoi khung anh trich tu clip video cua preset (chi doan thuc su hien). Khung i o thoi gian `local` (giay tu dau
 *  node): i = floor(offset + local * speed * fps), giu khung cuoi khi het. rect = [x, y, w, h] px tren khung mau. */
export interface FrameSeq {
  dir: string
  ext: 'png' | 'jpg'
  count: number
  fps: number
  speed: number
  offset: number
  rect: [number, number, number, number]
}

/** Clip video thuong (vd net quet .mov co alpha) — ve chuoi khung; hieu ung / keyframe nam o group boc ngoai */
export interface FramesNode {
  type: 'frames'
  id: string
  start: number
  duration: number
  seq: FrameSeq
}

/** Lo dan theo chieu ngang: phan hien chay tu `from` (trai / phai / giua) theo tien do 0 -> 1 */
export interface Reveal {
  start: number // giay tu dau node
  duration: number
  from: 'left' | 'right' | 'center'
  ease?: [number, number, number, number]
  soft?: number // px vien mem cua mep lo (khung mau rong 1080)
}

export interface ColorSweep {
  start: number // giay tu dau node
  duration: number
  from: [number, number, number] // mau truoc khi quet
  ease?: [number, number, number, number]
  soft?: number // px chuyen mau o mep quet
  angle?: number // do nghieng vet quet (do, 0 = dung thang)
  glow?: { color: [number, number, number]; blur: number; alpha: number } // vet sang khi dang quet (len roi tat)
}

/** Moc tren khung chu cua 1 o (vi tri NGHI cua chu sau khi thay chu that + co vua o) — hinh bam theo chu that.
 *  l / r / cx: mep trai / phai / giua theo be ngang chu; t / b / cy: dong font; base: duong chan chu;
 *  inkT / inkB: dinh / day net muc that (gom dau tieng Viet). off: px cong them (khung mau rong 1080). */
export interface SlotRef {
  slot: string
  edge: 'l' | 'r' | 'cx' | 't' | 'b' | 'cy' | 'base' | 'inkT' | 'inkB'
  off?: number
}

/** Hinh ve (khong co chu): hop sau chu, gach chan, tia lap lanh — khung bam theo cac o chu cung group */
export interface ShapeNode {
  type: 'shape'
  id: string
  kind: 'rect' | 'sparkle' // sparkle: ngoi sao 4 canh o tam khung, co = canh ngan cua khung
  start: number
  duration: number
  fill: [number, number, number]
  alpha?: number
  radius?: number // rect: bo goc (px)
  box: { l: SlotRef; r: SlotRef; t: SlotRef; b: SlotRef }
  minWidth?: number // khung hep hon (px) -> khong ve (vd gach sau chu khi chu that dai het cho)
  keyframes?: Partial<Record<'alpha' | 'scale' | 'rotation', CcKey[]>>
  reveal?: Reveal
  shadow?: TextShadow // hinh: distance / smoothing tinh bang px (khung rong 1080), khong theo em nhu chu
}

/** Hinh CapCut (Shape "rect_item" / "polycon_item"): da giac quanh tam (px, truc y LEN), bo goc tung dinh,
 *  to dac / gradient tuyen tinh, vien. Dat theo transform nhu chu (x, y = nua khung, scale, rotation). */
export interface VectorNode {
  type: 'vector'
  id: string
  start: number
  duration: number
  transform: CcTransform
  keyframes?: Partial<Record<'alpha' | 'x' | 'y' | 'scale' | 'rotation', CcKey[]>>
  alpha?: number
  points: [number, number][]
  radius?: number[]
  fill: VectorFill | null
  fillAlpha?: number
  border?: { color: [number, number, number]; width: number; alpha: number }
}

export type VectorFill =
  | { type: 'solid'; color: [number, number, number]; alpha: number }
  | { type: 'linear'; colors: [number, number, number][]; alphas: number[]; stops: number[]; angle: number }

/** Hoat anh lay mau: gia tri tai t[i] (0..1 cua duration), noi suy tuyen tinh. dx / dy theo `unit`:
 *  'px' (khung rong 1080, nhan scale cua node), 'textW' / 'textH' (be ngang / chieu cao dong cua chu THAT dang ve).
 *  alpha / scale nhan vao; rot cong them (do). Truoc start: mau dau; sau start + duration: mau cuoi. */
export interface SampledAnim {
  start: number
  duration: number
  unit?: 'px' | 'canvas' | 'textW' | 'textH' // canvas: px khung 1080 KHONG nhan co cua node
  t: number[]
  alpha?: number[]
  dx?: number[]
  dy?: number[]
  scale?: number[]
  rot?: number[]
  /** 'none': truoc start KHONG ap (mac dinh giu mau dau) */
  pre?: 'none'
}

export interface CharAnim {
  type: 'stagger_in'
  start: number // giay tu dau lop chu
  duration: number // tong thoi luong (CapCut anim duration)
  overlap: number // 0..1: moi ky tu chay trong overlap * duration
  gap?: number // khoang khoi dong giua 2 ky tu (phan cua duration); thieu -> rai deu trong phan con lai
  dx: number // do lech luc dau (theo em; x sang phai, y xuong duoi)
  dy: number
  rotation: number // do luc dau (theo chieu kim dong ho)
  scale: number // ti le luc dau
  ease: [number, number, number, number] // bezier chuyen dong (x1,y1,x2,y2)
  alphaEnd: number // 0..1: ky tu hien du sau alphaEnd phan thoi gian cua no
  /** thoi diem bat dau RIENG tung ky tu (phan cua duration, theo chi so ky tu) — thu tu "ngau nhien" do tu video;
   *  ky tu vuot qua mang: gia tri gia ngau nhien co dinh trong [0, startsMax] */
  starts?: number[]
  startsMax?: number
  /** nhoe luc dau (em), giam ve 0 theo tien do ky tu */
  blur?: number
  /** ky tu CUOI chay truoc (thu tu phai -> trai) */
  reverse?: boolean
  /** tre truoc ky tu dau (phan cua duration) */
  delay?: number
  /** thu tu xao tron co dinh (hoan vi gia ngau nhien theo so ky tu) */
  shuffle?: boolean
  /** "Ha ngau nhien" (AnimScript.lua): thoi luong ky tu = 1 / (step * (n - 1) + 1), ky tu sau tre step * thoi luong ky tu;
   *  bo qua overlap / gap */
  autoStep?: number
  /** he so do lech dx / dy theo tien do ky tu (lay mau deu 0..1) — thay cho (1 - ease); cho phep vuot qua / dao dong */
  curve?: number[]
  /** nua dau chu lech dx, nua sau lech -dx (hai nua chay vao giua — "Awkward Reunion") */
  halves?: boolean
}

export interface TextRun {
  len: number
  font: string
  size: number
  fill: [number, number, number]
  italic?: boolean
}

export interface ClipAnim {
  start: number // giay, tinh tu dau segment
  duration: number
  alpha: [number, number]
  scale: [number, number]
  /** bezier [x1, y1, x2, y2] (tu 0,0 den 1,1) cho alpha / scale */
  easeAlpha: [number, number, number, number]
  easeScale: [number, number, number, number]
}

/** Mask CapCut: centerX/centerY = nua kich thuoc khung, width/height = ti le khung */
export interface EllipseMask {
  type: 'ellipse'
  centerX: number
  centerY: number
  width: number
  height: number
  feather: number
  rotation: number
  invert: boolean
}

/** Lop Lumi "trs + luma matte" (vd hieu ung CapCut "May phat nhac 3" khi texture/xoay/glow tat) */
/** Mask CapCut "Tach" (lumi_linear_mask) va "Cuon phim" (lumi_mirror_mask) — cong thuc chep tu shader goc */
export interface LineMask {
  type: 'linear' | 'mirror'
  centerX: number
  centerY: number
  rotation: number
  feather: number
  height: number // chi 'mirror': nua be day dai (don vi nua chieu cao)
  invert: boolean
}

export type ClipMask = EllipseMask | LineMask

export interface AeTrsMatteEffect {
  type: 'ae_trs_matte'
  start: number // giay, trong thoi gian cua group chua no
  duration: number
  speed: number
  compSize: [number, number]
  anchor: [number, number]
  position?: AeKey[]
  opacity?: AeKey[]
  matte?: { image: string; scale: [number, number]; active: [number, number] }
}

/** LumiDeepGlow (CapCut "Phat sang"/"Glow") — cong thuc chep tu shader goc */
export interface DeepGlowEffect {
  type: 'deep_glow'
  radius: number
  exposure: number
  glowIntensity: number
  threshold: number
  thresholdSmooth: number
  gammaValue: number
  gammaCorrect: boolean
  quality: number
  unmult: boolean
  blendMode: 'screen' | 'add'
  sourceOpacity: number
  /** co -> LumiDeepGlow BAN MOI (GlowIter.lua) — deepGlow2 */
  glowIter?: number
  stepsMult?: number
  downSample?: number
  ratio?: number
  rotate?: number
}

/** CapCut "Mo" (mo-hu): nhoe 2 luot; value = thanh truot effects_adjust_blur (0..1), co the co keyframe */
export interface BlurEffect {
  type: 'blur'
  start: number
  duration: number
  value: number
  keyframes?: CcKey[] // gio tinh tu dau segment hieu ung
}

/** CapCut "Mo chrome": nhoe huong tam + tach mau (alpha giu nguyen) */
export interface ChromeBlurEffect {
  type: 'chrome_blur'
  blur: number
  offset: number
  flipY?: boolean
}

/** Chinh mau cua CapCut (do sang/tuong phan/vung sang/duong cong) — thuat toan khong cong khai: mau RA DO tren
 *  video CapCut xuat that cho tung mau VAO (chu trong mau la mau dac) */
export interface ColorSetEffect {
  type: 'color_set'
  map: { from: [number, number, number]; to: [number, number, number] }[]
}

/** Xoay mat phang quanh truc DOC qua tam khung, chieu phoi canh camera fovx (do) — MotionBlur3D cua Lumi */
export interface Rotate3dEffect {
  type: 'rotate3d'
  rotY: number
  fovx: number
  /** keyframe goc (gio tinh tu `start`, giay trong group) */
  keyframes?: CcKey[]
  start?: number
}

/** Chinh mau CapCut (curves -> color wheels -> adjustColor) — cong thuc chep tu shader goc, xem colorAdjust.ts */
export interface ColorAdjustEffect {
  type: 'color_adjust'
  ops: import('./colorAdjust').ColorOp[]
}

/** Hieu ung chuoi anh (CapCut "Shockwave"): moi luot phu 1 chuoi PNG (cover, giua khung) bang blend, giu ALPHA cua lop */
export interface SpriteBlendEffect {
  type: 'sprite_blend'
  start: number
  duration: number
  rate: number // toc do chuoi (seekToTime(t * rate))
  fps: number
  passes: { dir: string; files: string[]; blend: 'screen' | 'overlay' | 'add' | 'multiply' | 'normal' }[]
  /** chuoi LAP lai (mac dinh giu khung cuoi) */
  loop?: boolean
  /** LUT 8x8 (anh 512x512, 64 muc) ap TRUOC cac luot, tron theo intensity */
  lut?: { image: string; intensity: number }
}

/** space 'canvas': hieu ung ap SAU transform cua group (tren khung cha), vd lop dieu chinh Lumi tren clip co vi tri */
export type NodeEffect = (AeTrsMatteEffect | DeepGlowEffect | BlurEffect | ChromeBlurEffect | ColorSetEffect | Rotate3dEffect | ColorAdjustEffect | SpriteBlendEffect) & { space?: 'canvas' }

export interface GroupNode {
  type: 'group'
  id: string
  start: number // giay trong cha
  duration: number
  sourceStart: number // giay bat dau trong noi dung con
  /** canvas rieng cua clip ghep (vd 1920x1080 trong khung doc): con ve theo canvas nay roi dat "vua khung" vao cha */
  canvas?: [number, number]
  transform?: CcTransform
  alpha?: number
  keyframes?: Partial<Record<'alpha' | 'x' | 'y' | 'scale' | 'rotation', CcKey[]>>
  /** hoat anh vao/ra kieu Transform.lua cua CapCut (vd "Mo dan"): nhan vao do hien/scale cua clip */
  anims?: ClipAnim[]
  /** hoat anh lay mau (don vi px khung 1080) — Transform.lua kieu actions tren clip ghep */
  sanims?: SampledAnim[]
  mask?: ClipMask
  /** 'adjust': mask chi chon vung CHINH MAU (clip co chinh mau + mask), khong cat clip */
  maskTarget?: 'adjust'
  /** keyframe cua mask (gio tinh tu dau segment) — ghi de truong cung ten cua mask */
  maskKeyframes?: Partial<Record<'centerX' | 'centerY' | 'rotation' | 'feather' | 'width' | 'height', CcKey[]>>
  effects?: NodeEffect[]
  children: TemplateNode[] // duoi -> tren
}

export type TemplateNode = TextNode | ShapeNode | FramesNode | VectorNode | GroupNode

export interface TemplateAudio {
  file: string
  start: number
  duration: number
  sourceStart: number
  volume: number
  fadeIn?: number
  fadeOut?: number
}

export interface TextTemplateSpec {
  id: string
  name: string
  version: number
  width: number
  height: number
  fps: number
  duration: number
  /** accept 'number': o chi nhan con so (vd "3" trong "3 bước") — code kiem khi AI dien chu.
   *  room > 1: chu that duoc rong toi room x chu mau truoc khi bi co (o co cho no ra, vd so "10" thay "3") */
  slots: { id: string; role: string; sample: string; accept?: 'number'; room?: number }[]
  /** thu tu doc khai bao (mau tu thiet ke) — thieu thi sidecar doan theo hinh hoc */
  readingOrder?: string[]
  /** metrics: OS/2 typo ascent / descent (ti le em) — CapCut tinh chieu cao dong theo bang nay (mau cu: thieu -> do bang trinh duyet) */
  fonts: { id: string; file: string; metrics?: { ascent: number; descent: number } }[]
  audio: TemplateAudio[]
  root: GroupNode
}

export type TextTemplateProps = {
  spec: TextTemplateSpec
  /** URL goc cua thu muc mau (file trong spec la duong dan tuong doi) */
  assetBase: string
  /** chu that cho tung slot; thieu -> dung chu mau */
  texts?: Record<string, string>
  /** nen (mac dinh trong suot) */
  background?: string
  /** chu that dai / ngan khac chu mau -> co + neo tung o de giu bo cuc cua mau (computeFit) */
  fit?: boolean
  /** khong phat tieng cua mau (video chinh: tieng mau da tron san thanh 1 file, can theo giong noi o sidecar) */
  muted?: boolean
  /** duong dan tuong doi trong thu muc mau -> URL (video chinh: may chu media cua app) */
  fileUrl?: (rel: string) => string
}
