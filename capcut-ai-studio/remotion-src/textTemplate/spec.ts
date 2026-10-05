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

export type NodeEffect = AeTrsMatteEffect | DeepGlowEffect | BlurEffect | ChromeBlurEffect | ColorSetEffect

export interface GroupNode {
  type: 'group'
  id: string
  start: number // giay trong cha
  duration: number
  sourceStart: number // giay bat dau trong noi dung con
  transform?: CcTransform
  alpha?: number
  keyframes?: Partial<Record<'alpha' | 'x' | 'y' | 'scale' | 'rotation', CcKey[]>>
  /** hoat anh vao/ra kieu Transform.lua cua CapCut (vd "Mo dan"): nhan vao do hien/scale cua clip */
  anims?: ClipAnim[]
  mask?: ClipMask
  effects?: NodeEffect[]
  children: TemplateNode[] // duoi -> tren
}

export type TemplateNode = TextNode | ShapeNode | FramesNode | GroupNode

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
  fonts: { id: string; file: string }[]
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
