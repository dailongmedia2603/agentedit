// Ve mau chu dong (Kho Text) tu spec du lieu: group long nhau, chu CapCut, keyframe, mask, hieu ung Lumi.
// Ve bang Canvas 2D + tinh hieu ung bang JS (khong can GPU) -> may nao render cung ra cung ket qua.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AbsoluteFill, Html5Audio, Sequence, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion'
import { aeVal, ccVal } from './aeCurve'
import { deepGlow, deepGlow2, type Img } from './deepGlow'
import { capcutBlur, chromeBlur } from './blur'
import { applyColorOps } from './colorAdjust'
import type { AeTrsMatteEffect, ClipMask, EllipseMask, LineMask, FrameSeq, FramesNode, GroupNode, Reveal, SampledAnim, ShapeNode, SlotRef, TemplateNode, TextNode, TextRun, TextTemplateProps, TextTemplateSpec, VectorNode } from './spec'

/** He so quy doi don vi CapCut -> pixel (khung rong 1080). Do bang cach so khung voi video CapCut xuat that. */
export interface TextTune {
  linePerSize: number // px CHIEU CAO DONG (ascent+descent cua font) / 1 don vi font_size o scale 1 — CapCut giu chieu cao dong, khong giu em
  shadowDist: number // px / (distance * em)
  shadowBlur: number // px / (smoothing * em)
  borderWidth: number // px / (width * em)
  maskK: number // vien mem mask: nua do rong h = maskK * feather^maskPow (theo ban truc)
  maskPow: number
  maskShift: number // mep 50% nam o d = 1 + maskShift
  glowGain: number // he so cuong do glow (1 = dung cong thuc shader)
  letterSpacing: number // px / (letter_spacing * em)
  italicPivot: number
  lsByLine: number
  kerning: number // 1 = ap kerning GPOS. CapCut KHONG kern (do tren LE VIP5-09: sai khac 1.96 -> 0.93)
  layoutPx: number // >0: dan chu o co (size * layoutPx / lineEm) px, lam tron do rong tung ky tu roi phong len // 1: letter_spacing tinh theo CHIEU CAO DONG (em * lineEm) thay vi em
  lineFeatherPow: number // mask Tach/Cuon phim: u_diff = feather^pow (do tren video CapCut)
  shapeBorder: number // px vien hinh / 1 don vi border_width (khung rong 1080)
  rot3dSign: number // chieu xoay rotate3d (+1 / -1)
  shapeUnit: number // he so phu cho don vi hinh (1 = khung rong 720)
}
// Do 2026-10-04 tren preset LE VIP5-06 xuat that tu CapCut (1080x1920): co chu khop toi 0.3px, mask sai so 1.4%.
// shadow* / borderWidth chua do duoc (bong + vien den tren nen den) — gia tri tam, can do lai tren nen sang.
export const DEFAULT_TUNE: TextTune = { linePerSize: 6.21, shadowDist: 0.03, shadowBlur: 2.45, borderWidth: 5.5, maskK: 4.86, maskPow: 1.866, maskShift: 0.025, glowGain: 1, letterSpacing: 1, italicPivot: -1, lineFeatherPow: 2, lsByLine: 0, kerning: 0, layoutPx: 0, shapeBorder: 1, rot3dSign: -1, shapeUnit: 1 }

const fontFamily = (spec: TextTemplateSpec, id: string) => `tpl-${spec.id}-${id}`
const joinUrl = (base: string, rel: string) => (/^(https?:|file:|data:)/.test(rel) ? rel : base.replace(/\/$/, '') + '/' + rel.split('/').map(encodeURIComponent).join('/'))

function useAssets(spec: TextTemplateSpec, assetBase: string, fileUrl?: (rel: string) => string) {
  const url = (rel: string) => (fileUrl ? fileUrl(rel) : joinUrl(assetBase, rel))
  const [state, setState] = useState<{ ready: boolean; images: Record<string, HTMLImageElement> }>({ ready: false, images: {} })
  const [handle] = useState(() => delayRender('Nap font + anh cua mau chu'))
  useEffect(() => {
    let alive = true
    const imgFiles = new Set<string>()
    const addSeq = (q: FrameSeq) => {
      for (let i = 0; i < q.count; i++) imgFiles.add(frameFile(q, i))
    }
    const walk = (n: TemplateNode) => {
      if (n.type === 'group') {
        for (const e of n.effects || []) {
          if (e.type === 'ae_trs_matte' && e.matte) imgFiles.add(e.matte.image)
          if (e.type === 'sprite_blend') {
            for (const p of e.passes) for (const f of p.files) imgFiles.add(`${p.dir}/${f}`)
            if (e.lut) imgFiles.add(e.lut.image)
          }
        }
        n.children.forEach(walk)
      } else if (n.type === 'frames') addSeq(n.seq)
      else if (n.type === 'text' && n.fillFrames) addSeq(n.fillFrames)
      if (n.type === 'text' && n.fillImage) imgFiles.add(n.fillImage)
    }
    walk(spec.root)
    const fonts = spec.fonts.map(async (f) => {
      const ff = new FontFace(fontFamily(spec, f.id), `url(${url(f.file)})`)
      await ff.load()
      document.fonts.add(ff)
    })
    const images: Record<string, HTMLImageElement> = {}
    const imgs = [...imgFiles].map(
      (file) =>
        new Promise<void>((res, rej) => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => {
            images[file] = im
            res()
          }
          im.onerror = () => rej(new Error('Khong tai duoc anh ' + file))
          im.src = url(file)
        })
    )
    Promise.all([...fonts, ...imgs])
      .then(() => {
        if (!alive) return
        setState({ ready: true, images })
        continueRender(handle)
      })
      .catch((e) => {
        console.error(e)
        continueRender(handle)
      })
    return () => {
      alive = false
    }
  }, [spec, assetBase, handle])
  return state
}

const frameFile = (q: FrameSeq, i: number) => `${q.dir}/${String(i).padStart(4, '0')}.${q.ext}`
/** khung cua chuoi luc `local` giay (tu dau node) — giong cach CapCut lay khung video (do tren LE VIP2-01) */
function frameAt(q: FrameSeq, local: number, k: Ctx): HTMLImageElement | undefined {
  const i = Math.min(q.count - 1, Math.max(0, Math.floor(q.offset + local * q.speed * q.fps + 1e-3)))
  return k.images[frameFile(q, i)]
}

function drawFrames(n: FramesNode, t: number, dst: CanvasRenderingContext2D, k: Ctx) {
  const local = t - n.start
  if (local < 0 || local >= n.duration) return
  const im = frameAt(n.seq, local, k)
  if (!im) return
  const [x, y, w, h] = n.seq.rect
  const s = k.W / k.spec.width
  dst.drawImage(im, x * s, y * s, w * s, h * s)
}

class Pool {
  private free: HTMLCanvasElement[] = []
  constructor(private w: number, private h: number) {}
  get() {
    const c = this.free.pop() || Object.assign(document.createElement('canvas'), { width: this.w, height: this.h })
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'none'
    ctx.shadowColor = 'transparent'
    ctx.clearRect(0, 0, this.w, this.h)
    return c
  }
  put(c: HTMLCanvasElement) {
    this.free.push(c)
  }
}

interface Ctx {
  spec: TextTemplateSpec
  texts: Record<string, string>
  images: Record<string, HTMLImageElement>
  tune: TextTune
  pool: Pool
  W: number
  H: number
  matteCache: Map<string, HTMLCanvasElement>
  /** pool theo kich thuoc canvas (clip ghep co canvas rieng, vd 1920x1080 trong khung doc) */
  pools?: Map<string, Pool>
  /** chu THAT thay chu mau: co chu (scale) + dich (px trong khung cua group chua node) cho tung node — computeFit */
  adj?: Map<TextNode, { scale: number; ox: number; oy: number }>
}

/** chieu cao dong / em cua font (metric hhea/typo ma trinh duyet dung) */
const lineCache = new Map<string, number>()
function lineEm(k: Ctx, font: string) {
  const fm = k.spec.fonts.find((f) => f.id === font)?.metrics
  if (fm) return fm.ascent + fm.descent
  const fam = fontFamily(k.spec, font)
  let v = lineCache.get(fam)
  if (v === undefined) {
    const c = document.createElement('canvas').getContext('2d')!
    c.font = `100px "${fam}"`
    const m = c.measureText('Hg')
    v = (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100 || 1.2
    lineCache.set(fam, v)
  }
  return v
}

const rgb = (c: number[], a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null
function graphemes(str: string): string[] {
  return segmenter ? Array.from(segmenter.segment(str), (x) => x.segment) : Array.from(str)
}

/** Chia chu that theo cac doan cua mau: doan dau giu so ky tu, doan cuoi nhan phan con lai */
function splitRuns(text: string, runs: TextRun[]): { run: TextRun; str: string }[] {
  const chars = Array.from(text)
  const out: { run: TextRun; str: string }[] = []
  let i = 0
  runs.forEach((r, idx) => {
    const take = idx === runs.length - 1 ? chars.length - i : Math.min(r.len, Math.max(0, chars.length - i))
    out.push({ run: r, str: chars.slice(i, i + take).join('') })
    i += take
  })
  return out.filter((p) => p.str.length)
}

const sampleOf = (k: Ctx, slot: string) => k.spec.slots.find((s) => s.id === slot)?.sample ?? ''
const textOf = (k: Ctx, slot: string) => k.texts[slot] ?? sampleOf(k, slot)

/** Dan chu cua 1 node (do = ve: drawText dung chung) — vi tri tung ky tu + be ngang tong + metric dong */
function layoutText(c: CanvasRenderingContext2D, n: TextNode, raw: string, scale: number, k: Ctx) {
  const text = n.textCase === 'upper' ? raw.toLocaleUpperCase('vi') : raw
  const runs: TextRun[] = n.runs?.length ? n.runs : [{ len: Array.from(text).length, font: n.font, size: n.size, fill: n.fill }]
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  c.fontKerning = k.tune.kerning ? 'normal' : 'none'
  return splitRuns(text, runs).map((p) => {
    // emPx (mask chu CapCut): co chu theo em, khong theo chieu cao dong
    const em = n.emPx ? n.emPx * scale * (k.W / 1080) : (p.run.size * k.tune.linePerSize * scale * (k.W / 1080)) / lineEm(k, p.run.font)
    const font = `${em}px "${fontFamily(k.spec, p.run.font)}"`
    const ls = (n.letterSpacing ?? 0) * k.tune.letterSpacing * (k.tune.lsByLine ? lineEm(k, p.run.font) : 1)
    c.font = font
    c.letterSpacing = `${ls * em}px`
    const m = c.measureText(p.str)
    // vi tri tung ky tu (cum grapheme — giu dau tieng Viet): do o co dan chu cua CapCut, lam tron, roi phong len
    const glyphs = graphemes(p.str)
    const layoutEm = k.tune.layoutPx > 0 ? (p.run.size * k.tune.layoutPx) / lineEm(k, p.run.font) : em
    const ratio = em / layoutEm
    c.font = `${layoutEm}px "${fontFamily(k.spec, p.run.font)}"`
    c.letterSpacing = `${ls * layoutEm}px`
    const xs: number[] = []
    let acc = 0
    let prefix = ''
    let prevW = 0
    for (const g of glyphs) {
      xs.push(acc * ratio)
      prefix += g
      const wNow = c.measureText(prefix).width
      const adv = wNow - prevW
      acc += k.tune.layoutPx > 0 ? Math.round(adv) : adv
      prevW = wNow
    }
    // dong font: metric typo cua mau (CapCut) neu co, khong thi metric trinh duyet (hhea)
    const fm = k.spec.fonts.find((f) => f.id === p.run.font)?.metrics
    const asc = fm ? fm.ascent * em : m.fontBoundingBoxAscent
    const desc = fm ? fm.descent * em : m.fontBoundingBoxDescent
    return { ...p, em, font, glyphs, xs, w: acc * ratio, asc, desc, inkAsc: m.actualBoundingBoxAscent, inkDesc: m.actualBoundingBoxDescent }
  })
}

/** Bo dem so: so trong chu (so cuoi) x frac cua buoc hien tai, giu tien to / hau to / dau phan nghin. Chu khong co so -> giu nguyen */
function counterText(final: string, c: { t: number[]; frac: number[] }, local: number) {
  const m = final.match(/^(\D*?)(\d[\d.,]*)(\D*)$/)
  if (!m) return final
  let i = 0
  while (i < c.t.length - 1 && c.t[i + 1] <= local + 1e-6) i++
  if (i === c.t.length - 1) return final
  const sep = /\d[.,]\d{3}(\D|$)/.test(m[2]) ? (m[2].match(/\d([.,])\d{3}/) || [])[1] || '' : ''
  const target = Number(m[2].replace(/[.,]/g, ''))
  const v = Math.round(target * c.frac[i])
  const digits = String(v)
  const body = sep ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : digits
  return m[1] + body + m[3]
}

/** Trang thai hoat anh lay mau tai `local` (giay tu dau node) */
function sampledState(anims: SampledAnim[] | undefined, local: number) {
  const st = { alpha: 1, scale: 1, rot: 0, dx: [] as { v: number; unit: string }[], dy: [] as { v: number; unit: string }[] }
  for (const a of anims || []) {
    if (a.pre === 'none' && local < a.start) continue // bo dem so gop: hoat anh cua doan cuoi chua toi
    const p = Math.min(1, Math.max(0, (local - a.start) / Math.max(1e-6, a.duration)))
    let i = 0
    while (i < a.t.length - 2 && a.t[i + 1] <= p) i++
    const f = a.t[i + 1] > a.t[i] ? Math.min(1, Math.max(0, (p - a.t[i]) / (a.t[i + 1] - a.t[i]))) : 0
    const at = (arr?: number[]) => (arr ? arr[i] + (arr[Math.min(i + 1, arr.length - 1)] - arr[i]) * f : undefined)
    const al = at(a.alpha)
    if (al !== undefined) st.alpha *= al
    const sc = at(a.scale)
    if (sc !== undefined) st.scale *= sc
    st.rot += at(a.rot) ?? 0
    const ux = at(a.dx)
    if (ux !== undefined) st.dx.push({ v: ux, unit: a.unit || 'px' })
    const uy = at(a.dy)
    if (uy !== undefined) st.dy.push({ v: uy, unit: a.unit || 'px' })
  }
  return st
}

function drawText(n: TextNode, t: number, dst: CanvasRenderingContext2D, k: Ctx) {
  const local = t - n.start
  if (local < 0 || local >= n.duration) return
  const kf = n.keyframes || {}
  const fit = k.adj?.get(n)
  const sa = n.anims ? sampledState(n.anims, local) : null
  const x = ccVal(kf.x, local, n.transform.x)
  const y = ccVal(kf.y, local, n.transform.y)
  const scale0 = ccVal(kf.scale, local, n.transform.scale) * (fit?.scale ?? 1)
  const scale = scale0 * (sa?.scale ?? 1)
  const rot = ccVal(kf.rotation, local, n.transform.rotation) + (sa?.rot ?? 0)
  const alpha = ccVal(kf.alpha, local, n.alpha ?? 1) * (sa?.alpha ?? 1)
  if (alpha <= 0) return
  const text = n.counter ? counterText(textOf(k, n.slot), n.counter, local) : textOf(k, n.slot)
  let cx = k.W / 2 + (x * k.W) / 2 + (fit?.ox ?? 0)
  let cy = k.H / 2 - (y * k.H) / 2 + (fit?.oy ?? 0)

  // chu + vien ve rieng 1 lop, roi do bong cho CA lop (khong chong bong vien + bong chu)
  const tmp = k.pool.get()
  const c = tmp.getContext('2d')!
  const parts = layoutText(c, n, text, scale, k)
  if (!parts.length) {
    k.pool.put(tmp)
    return
  }
  const total = parts.reduce((a, p) => a + p.w, 0)
  const asc = Math.max(...parts.map((p) => p.asc))
  const desc = Math.max(...parts.map((p) => p.desc))
  if (sa && (sa.dx.length || sa.dy.length)) {
    // don vi dich: px (khung 1080, theo co cua node) / be ngang chu / chieu cao dong — o co NGHI (khong tinh scale cua anim)
    const u = (unit: string) =>
      unit === 'textW' ? total / (sa.scale || 1) : unit === 'textH' ? (asc + desc) / (sa.scale || 1) : unit === 'canvas' ? k.W / 1080 : scale0 * (k.W / 1080)
    for (const d of sa.dx) cx += d.v * u(d.unit)
    for (const d of sa.dy) cy += d.v * u(d.unit)
  }
  const base = (asc - desc) / 2
  const em0 = parts[0].em
  c.translate(cx, cy)
  if (rot) c.rotate((rot * Math.PI) / 180)
  const skew = Math.tan(((n.italicDegree ?? 10) * Math.PI) / 180)
  // hoat anh tung ky tu: tien do cua ky tu thu i (0..1)
  const ca = n.charAnim
  const nChars = parts.reduce((a, p) => a + p.glyphs.length, 0)
  let order: number[] | null = null
  const charState = (i: number) => {
    if (!ca) return null
    const autoCd = ca.autoStep !== undefined ? 1 / (ca.autoStep * Math.max(0, nChars - 1) + 1) : 0
    const per = ca.autoStep !== undefined ? ca.duration * autoCd : ca.duration * ca.overlap
    const gap = ca.autoStep !== undefined ? ca.autoStep * autoCd * ca.duration : ca.gap !== undefined ? ca.gap * ca.duration : nChars > 1 ? (ca.duration - per) / (nChars - 1) : 0
    if (ca.shuffle && !order) order = shuffleOrder(nChars)
    // thu tu rieng (vd "Mo dan nhu bong ma"): mang do duoc; ky tu thua -> so gia ngau nhien co dinh theo chi so
    const st0 = ca.starts
      ? (ca.starts[i] ?? (((Math.sin((i + 1) * 12.9898) * 43758.5453) % 1) + 1) % 1 * (ca.startsMax ?? 0.6)) * ca.duration
      : (order ? order[i] : ca.reverse ? nChars - 1 - i : i) * gap + (ca.delay ?? 0) * ca.duration
    const p = Math.min(1, Math.max(0, (local - ca.start - st0) / Math.max(1e-6, per)))
    const e = cubicEase(ca.ease, p)
    return { p, e, alpha: ca.alphaEnd <= 0 ? 1 : Math.min(1, p / Math.max(1e-6, ca.alphaEnd)) }
  }
  // doi mau quet: tien do 0..1 (null = khong co / chua toi -> mau `from`, xong -> mau fill)
  const cs = n.colorSweep
  const sweep = cs ? { cs, p: cubicEase(cs.ease || [0.4, 0, 0.6, 1], clamp01((local - cs.start) / Math.max(1e-6, cs.duration))), unit: k.W / 1080 } : null
  // word-art: anh gian theo khung NET chu (dinh net cao nhat -> day net thap nhat), to thang khi ve glyph
  let imgFill: CanvasPattern | null = null
  const fim = n.fillImage ? k.images[n.fillImage] : undefined
  if (fim) {
    const inkT = base - Math.max(...parts.map((p) => p.inkAsc))
    const inkB = base + Math.max(...parts.map((p) => p.inkDesc))
    imgFill = c.createPattern(fim, 'no-repeat')
    imgFill?.setTransform(new DOMMatrix().translate(-total / 2, inkT).scale(total / fim.width, Math.max(1, inkB - inkT) / fim.height))
  }
  const drawPass = (stroke: boolean) => {
    let px = -total / 2
    let ci = 0
    for (const p of parts) {
      for (let gi = 0; gi < p.glyphs.length; gi++) {
        const gch = p.glyphs[gi]
        c.save()
        c.font = p.font
        c.letterSpacing = '0px'
        const gx = px + p.xs[gi]
        const gw = (gi + 1 < p.xs.length ? p.xs[gi + 1] : p.w) - p.xs[gi]
        const st = charState(ci)
        if (st) {
          if (st.alpha <= 0) {
            c.restore()
            ci++
            continue
          }
          const cxg = gx + gw / 2
          c.globalAlpha = st.alpha
          // do lech con lai: curve (lay mau) hoac 1 - ease; halves: nua sau doi dau dx
          let rem = 1 - st.e
          if (ca!.curve?.length) {
            const cv = ca!.curve
            const q = st.p * (cv.length - 1)
            const qi = Math.min(cv.length - 2, Math.floor(q))
            rem = cv[qi] + (cv[qi + 1] - cv[qi]) * (q - qi)
          }
          const sgn = ca!.halves && ci >= nChars / 2 ? -1 : 1
          c.translate(cxg + sgn * ca!.dx * p.em * rem, ca!.dy * p.em * rem)
          c.rotate(((ca!.rotation * (1 - st.e)) * Math.PI) / 180)
          const sc = ca!.scale + (1 - ca!.scale) * st.e
          c.scale(sc, sc)
          c.translate(-cxg, 0)
          if (ca!.blur && st.e < 1) c.filter = `blur(${(ca!.blur * p.em * (1 - st.e)).toFixed(2)}px)`
        }
        // nghieng quanh duong chan chu: x' = x - skew * (y - base)
        if (p.run.italic) {
          // tam nghieng: italicPivot < 0 -> tam khung NET MUC cua doan chu; 0 = chan chu, 1 = tam dong
          const py0 = k.tune.italicPivot < 0 ? base - (p.inkAsc - p.inkDesc) / 2 : base * (1 - k.tune.italicPivot)
          c.transform(1, 0, -skew, 1, skew * py0, 0)
        }
        if (stroke) {
          c.lineJoin = 'round'
          c.strokeStyle = rgb(n.border!.color, n.border!.alpha)
          c.lineWidth = n.border!.width * k.tune.borderWidth * p.em * 2
          c.strokeText(gch, gx, base)
        } else {
          c.fillStyle = imgFill ?? (sweep ? sweepFill(c, sweep, p.run.fill, total, asc + desc) : rgb(p.run.fill))
          c.fillText(gch, gx, base)
        }
        c.restore()
        ci++
      }
      px += p.w
    }
  }
  if (n.border && n.border.width > 0) drawPass(true)
  if (n.bold) {
    // lam dam = vien cung mau (mask chu CapCut bold_width) — ve truoc chu
    const bc = n.border
    n.border = { color: n.fill, alpha: 1, width: n.bold / k.tune.borderWidth }
    drawPass(true)
    n.border = bc
  }
  drawPass(false)
  if (n.fillFrames) {
    // mask "Van ban": hinh chu (ca vien dam) giu lai, mau lay tu khung video dat o khung cua group
    const im = frameAt(n.fillFrames, local, k)
    const [fx, fy, fw, fh] = n.fillFrames.rect
    const s = k.W / k.spec.width
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'source-in'
    // source-in: ngoai khung anh -> trong suot (mask chi cat clip, khong co nen thi chu khong hien)
    if (im) c.drawImage(im, fx * s, fy * s, fw * s, fh * s)
    else c.clearRect(0, 0, k.W, k.H)
    c.restore()
  }
  if (n.reveal && !revealMask(c, n.reveal, local, -total / 2 - 0.25 * em0, total / 2 + 0.25 * em0, k)) {
    k.pool.put(tmp)
    return
  }

  // vet sang khi dang quet mau: len roi tat theo tien do quet
  const gl = sweep?.cs.glow
  if (gl && sweep.p > 0 && sweep.p < 1) {
    dst.save()
    dst.globalAlpha = alpha
    dst.shadowColor = rgb(gl.color, gl.alpha * Math.sin(Math.PI * sweep.p))
    dst.shadowBlur = gl.blur * sweep.unit
    // chi ve BONG (anh day ra ngoai khung, bong dich nguoc ve) — chu ve 1 lan o duoi, khong day vien
    dst.shadowOffsetX = 4 * k.W
    dst.drawImage(tmp, -4 * k.W, 0)
    dst.restore()
  }
  dst.save()
  dst.globalAlpha = alpha
  if (n.shadow && n.shadow.alpha > 0) {
    const a = (n.shadow.angle * Math.PI) / 180
    const d = n.shadow.distance * k.tune.shadowDist * em0
    dst.shadowColor = rgb(n.shadow.color, n.shadow.alpha)
    dst.shadowBlur = n.shadow.smoothing * k.tune.shadowBlur * em0
    dst.shadowOffsetX = Math.cos(a) * d
    dst.shadowOffsetY = -Math.sin(a) * d
  }
  dst.drawImage(tmp, 0, 0)
  dst.restore()
  k.pool.put(tmp)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** To mau doi mau quet trong toa do chu (goc = tam chu): da quet -> fill, chua quet -> from, mep mem `soft` px */
function sweepFill(c: CanvasRenderingContext2D, sw: { cs: NonNullable<TextNode['colorSweep']>; p: number; unit: number }, fill: number[], total: number, lineH: number) {
  if (sw.p <= 0) return rgb(sw.cs.from)
  if (sw.p >= 1) return rgb(fill)
  const a = ((sw.cs.angle ?? 0) * Math.PI) / 180
  const soft = Math.max(1, (sw.cs.soft ?? 40) * sw.unit)
  const half = total / 2 + (lineH / 2) * Math.abs(Math.tan(a)) + soft
  const g = c.createLinearGradient(-half * Math.cos(a), -half * Math.sin(a), half * Math.cos(a), half * Math.sin(a))
  const s = sw.p * (1 + (2 * soft) / (2 * half)) - soft / (2 * half) // vi tri mep quet (0..1 tren doan gradient)
  const f = soft / (2 * half)
  g.addColorStop(0, rgb(fill))
  g.addColorStop(clamp01(s - f), rgb(fill))
  g.addColorStop(clamp01(s + f), rgb(sw.cs.from))
  g.addColorStop(1, rgb(sw.cs.from))
  return g
}

/** Lo dan theo chieu ngang tren canvas tam (toa do hien tai = toa do cua node, [L, R] = be ngang can lo).
 *  false = chua lo chut nao (bo ve). */
function revealMask(c: CanvasRenderingContext2D, rv: Reveal, local: number, L: number, R: number, k: Ctx): boolean {
  const q = cubicEase(rv.ease || [0.25, 0.8, 0.3, 1], clamp01((local - rv.start) / Math.max(1e-6, rv.duration)))
  if (q >= 1) return true
  if (q <= 0) return false
  const soft = Math.max(0.5, (rv.soft ?? 0) * (k.W / 1080))
  const w = R - L
  // doan hien [a, b] tren truc x cua node
  const [a, b] = rv.from === 'left' ? [L, L + q * w] : rv.from === 'right' ? [R - q * w, R] : [(L + R) / 2 - (q * w) / 2, (L + R) / 2 + (q * w) / 2]
  const x0 = L - 2 * soft
  const x1 = R + 2 * soft
  const g = c.createLinearGradient(x0, 0, x1, 0)
  const pos = (x: number) => clamp01((x - x0) / (x1 - x0))
  // mep CO DINH (phia bat dau lo) hien du; mep DANG CHAY mem +-soft
  const mid = (a + b) / 2
  const aIn = Math.min(a + soft, mid)
  const bIn = Math.max(b - soft, mid)
  if (rv.from === 'left') g.addColorStop(0, '#000')
  else {
    g.addColorStop(pos(a - soft), 'rgba(0,0,0,0)')
    g.addColorStop(pos(aIn), '#000')
  }
  if (rv.from === 'right') g.addColorStop(1, '#000')
  else {
    g.addColorStop(pos(bIn), '#000')
    g.addColorStop(pos(b + soft), 'rgba(0,0,0,0)')
  }
  c.save()
  c.globalCompositeOperation = 'destination-in'
  c.fillStyle = g
  c.fillRect(x0 - k.W, -2 * k.H, x1 - x0 + 2 * k.W, 4 * k.H)
  c.restore()
  return true
}

/** Gio "nghi" cua node chu: sau moi keyframe / hoat anh vao (khung bam cua hinh tinh o day) */
function restLocal(n: TextNode) {
  let t = 0
  for (const ks of Object.values(n.keyframes || {})) for (const kk of ks || []) t = Math.max(t, kk[0])
  for (const a of n.anims || []) t = Math.max(t, a.start + a.duration)
  if (n.charAnim) t = Math.max(t, n.charAnim.start + n.charAnim.duration)
  if (n.reveal) t = Math.max(t, n.reveal.start + n.reveal.duration)
  return Math.min(t, Math.max(0, n.duration - 1e-3))
}

/** Khung chu cua node o vi tri NGHI (gom co vua o + dich cua computeFit), toa do khung group chua node */
function textFrame(n: TextNode, k: Ctx) {
  const c = document.createElement('canvas').getContext('2d')!
  const l = restLocal(n)
  const kf = n.keyframes || {}
  const fit = k.adj?.get(n)
  const scale = ccVal(kf.scale, l, n.transform.scale) * (fit?.scale ?? 1)
  const parts = layoutText(c, n, textOf(k, n.slot), scale, k)
  if (!parts.length) return null
  const cx = k.W / 2 + (ccVal(kf.x, l, n.transform.x) * k.W) / 2 + (fit?.ox ?? 0)
  const cy = k.H / 2 - (ccVal(kf.y, l, n.transform.y) * k.H) / 2 + (fit?.oy ?? 0)
  const total = parts.reduce((a, p) => a + p.w, 0)
  const asc = Math.max(...parts.map((p) => p.asc))
  const desc = Math.max(...parts.map((p) => p.desc))
  const base = cy + (asc - desc) / 2
  return {
    l: cx - total / 2,
    r: cx + total / 2,
    cx,
    t: cy - (asc + desc) / 2,
    b: cy + (asc + desc) / 2,
    cy,
    base,
    inkT: base - Math.max(...parts.map((p) => p.inkAsc)),
    inkB: base + Math.max(...parts.map((p) => p.inkDesc))
  }
}

function resolveRef(ref: SlotRef, sib: TemplateNode[], k: Ctx): number | null {
  const n = sib.find((x) => x.type === 'text' && x.slot === ref.slot) as TextNode | undefined
  const f = n ? textFrame(n, k) : null
  return f ? f[ref.edge] + (ref.off ?? 0) * (k.W / 1080) : null
}

/** Hinh (hop / gach / lap lanh): khung tinh tu cac o chu cung group -> chu that dai / ngan thi hinh di theo */
function drawShape(s: ShapeNode, t: number, dst: CanvasRenderingContext2D, k: Ctx, sib: TemplateNode[]) {
  const local = t - s.start
  if (local < 0 || local >= s.duration) return
  const kf = s.keyframes || {}
  const alpha = ccVal(kf.alpha, local, s.alpha ?? 1)
  const scale = ccVal(kf.scale, local, 1)
  if (alpha <= 0 || scale <= 0) return
  const [l, r, tp, bt] = [s.box.l, s.box.r, s.box.t, s.box.b].map((x) => resolveRef(x, sib, k))
  if (l === null || r === null || tp === null || bt === null) return
  const w = r - l
  const h = bt - tp
  if (w <= 0 || h <= 0 || w < (s.minWidth ?? 0) * (k.W / 1080)) return
  const tmp = k.pool.get()
  const c = tmp.getContext('2d')!
  c.translate((l + r) / 2, (tp + bt) / 2)
  const rot = ccVal(kf.rotation, local, 0)
  if (rot) c.rotate((rot * Math.PI) / 180)
  c.scale(scale, scale)
  c.fillStyle = rgb(s.fill)
  c.beginPath()
  if (s.kind === 'sparkle') {
    // ngoi sao 4 canh (canh cong vao trong) — tia lap lanh
    const R = Math.min(w, h) / 2
    const q = R * 0.16
    c.moveTo(0, -R)
    c.quadraticCurveTo(q, -q, R, 0)
    c.quadraticCurveTo(q, q, 0, R)
    c.quadraticCurveTo(-q, q, -R, 0)
    c.quadraticCurveTo(-q, -q, 0, -R)
  } else c.roundRect(-w / 2, -h / 2, w, h, Math.min((s.radius ?? 0) * (k.W / 1080), w / 2, h / 2))
  c.fill()
  if (s.reveal && !revealMask(c, s.reveal, local, -w / 2, w / 2, k)) {
    k.pool.put(tmp)
    return
  }
  dst.save()
  dst.globalAlpha = Math.min(1, alpha)
  if (s.shadow && s.shadow.alpha > 0) {
    const a = (s.shadow.angle * Math.PI) / 180
    const u = k.W / 1080
    dst.shadowColor = rgb(s.shadow.color, s.shadow.alpha)
    dst.shadowBlur = s.shadow.smoothing * u
    dst.shadowOffsetX = Math.cos(a) * s.shadow.distance * u
    dst.shadowOffsetY = -Math.sin(a) * s.shadow.distance * u
  }
  dst.drawImage(tmp, 0, 0)
  dst.restore()
  k.pool.put(tmp)
}

/** Hinh CapCut: da giac (px quanh tam, truc y LEN) bo goc tung dinh, dat theo transform + keyframe nhu chu */
function drawVector(n: VectorNode, t: number, dst: CanvasRenderingContext2D, k: Ctx) {
  const local = t - n.start
  if (local < 0 || local >= n.duration) return
  const kf = n.keyframes || {}
  const alpha = ccVal(kf.alpha, local, n.alpha ?? 1)
  const scale = ccVal(kf.scale, local, n.transform.scale)
  if (alpha <= 0 || scale <= 0) return
  // toa do hinh CapCut tinh theo khung rong 720 (do tren LE VIP2-03: hop 318 don vi = 477 px @1080)
  const u = (k.W / 720) * k.tune.shapeUnit
  const x = ccVal(kf.x, local, n.transform.x)
  const y = ccVal(kf.y, local, n.transform.y)
  const rot = ccVal(kf.rotation, local, n.transform.rotation)
  dst.save()
  dst.globalAlpha = Math.min(1, alpha)
  dst.translate(k.W / 2 + (x * k.W) / 2, k.H / 2 - (y * k.H) / 2)
  if (rot) dst.rotate((rot * Math.PI) / 180)
  dst.scale(scale * u, scale * u)
  const P = n.points.map(([px, py]) => [px, -py] as [number, number])
  const path = new Path2D()
  const N = P.length
  for (let i = 0; i < N; i++) {
    const a = P[(i - 1 + N) % N]
    const b = P[i]
    const c = P[(i + 1) % N]
    // bo goc dinh b: cung tron tiep xuc 2 canh, ban kinh <= nua canh ngan
    const r = Math.min(n.radius?.[i] ?? 0, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2)
    if (i === 0) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      path.moveTo(m[0], m[1])
    }
    if (r > 0) path.arcTo(b[0], b[1], c[0], c[1], r)
    else path.lineTo(b[0], b[1])
  }
  path.closePath()
  if (n.fill) {
    const f = n.fill
    dst.save()
    dst.globalAlpha *= n.fillAlpha ?? 1
    if (f.type === 'solid') dst.fillStyle = rgb(f.color, f.alpha)
    else {
      // gradient tuyen tinh theo goc (do, nguoc chieu kim dong ho tu truc x), trai het khung bao cua hinh
      const xs = P.map((p) => p[0])
      const ys = P.map((p) => p[1])
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const a = (f.angle * Math.PI) / 180
      // goc CapCut tinh theo truc y HUONG XUONG (do tren LE VIP2-14: hinh thoi xoay 45 do, goc 135 -> dai doc)
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const half = Math.max(...P.map((p) => Math.abs((p[0] - cx) * dx + (p[1] - cy) * dy)))
      const g = dst.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half)
      f.colors.forEach((c, i) => g.addColorStop(clamp01(f.stops[i]), rgb(c, f.alphas[i] ?? 1)))
      dst.fillStyle = g
    }
    dst.fill(path)
    dst.restore()
  }
  if (n.border && n.border.width > 0) {
    dst.strokeStyle = rgb(n.border.color, n.border.alpha)
    dst.lineWidth = n.border.width * k.tune.shapeBorder
    dst.lineJoin = 'round'
    dst.stroke(path)
  }
  dst.restore()
}

/** Xoay mat phang quanh truc doc qua tam (phoi canh fovx): moi cot dich lay 1 cot nguon, co doc quanh tam */
function rotate3d(layer: HTMLCanvasElement, rotY: number, fovx: number, k: Ctx): HTMLCanvasElement {
  const out = k.pool.get()
  const c = out.getContext('2d')!
  const th = (rotY * Math.PI) / 180 * k.tune.rot3dSign
  const d = k.W / 2 / Math.tan((fovx * Math.PI) / 360)
  const cs = Math.cos(th)
  const sn = Math.sin(th)
  for (let X = 0; X < k.W; X++) {
    const xp = X + 0.5 - k.W / 2
    const den = d * cs - xp * sn
    if (den <= 0) continue
    const xs = (xp * d) / den
    const sx = xs + k.W / 2
    if (sx < 0 || sx >= k.W) continue
    const s = d / (d + xs * sn)
    const h = k.H * s
    c.drawImage(layer, Math.floor(sx), 0, 1, k.H, X, k.H / 2 - h / 2, 1, h)
  }
  k.pool.put(layer)
  return out
}

const lutCache8 = new Map<string, Uint8ClampedArray>()

/** CenterCrop.frag + alphaOutput: chuoi anh phu kieu cover giua khung, tron mau (chua nhan alpha) theo blend voi do mo cua
 *  anh, alpha cua lop GIU NGUYEN. Khung chuoi = floor(t * rate * fps), het chuoi giu khung cuoi. */
function spriteBlend(layer: HTMLCanvasElement, e: Extract<GroupNode['effects'], unknown[]>[number] & { type: 'sprite_blend' }, local: number, k: Ctx) {
  const c = layer.getContext('2d')!
  const img = c.getImageData(0, 0, k.W, k.H)
  const d = img.data
  const lutIm = e.lut ? k.images[e.lut.image] : undefined
  if (e.lut && lutIm && e.lut.intensity > 0) {
    // lut8x8 (pass0.frag): o (b % 8, floor(b / 8)) moi o 64x64, r ngang g doc; tron 2 lat b
    let ld = lutCache8.get(e.lut.image)
    if (!ld) {
      const cv = Object.assign(document.createElement('canvas'), { width: lutIm.width, height: lutIm.height })
      const cc = cv.getContext('2d', { willReadFrequently: true })!
      cc.drawImage(lutIm, 0, 0)
      ld = cc.getImageData(0, 0, lutIm.width, lutIm.height).data
      lutCache8.set(e.lut.image, ld)
    }
    const LW = lutIm.width
    const at = (bi: number, r: number, g: number, ch: number) => {
      const x = (bi % 8) * 64 + r
      const y = Math.floor(bi / 8) * 64 + g
      return ld![(y * LW + x) * 4 + ch]
    }
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const r = Math.round((d[i] / 255) * 63)
      const g = Math.round((d[i + 1] / 255) * 63)
      const b = (d[i + 2] / 255) * 63
      const b0 = Math.floor(b)
      const b1 = Math.ceil(b)
      const f = b - b0
      for (let ch = 0; ch < 3; ch++) {
        const v = at(b0, r, g, ch) * (1 - f) + at(b1, r, g, ch) * f
        d[i + ch] = Math.round(d[i + ch] + (v - d[i + ch]) * e.lut.intensity)
      }
    }
  }
  for (const p of e.passes) {
    const raw = Math.floor(local * e.rate * e.fps + 1e-6)
    const fi = e.loop ? ((raw % p.files.length) + p.files.length) % p.files.length : Math.min(p.files.length - 1, Math.max(0, raw))
    const im = k.images[`${p.dir}/${p.files[fi]}`]
    if (!im) continue
    // anh chuoi phu kieu cover len khung
    const sc = Math.max(k.W / im.width, k.H / im.height)
    const tmp = k.pool.get()
    const tc = tmp.getContext('2d')!
    tc.drawImage(im, k.W / 2 - (im.width * sc) / 2, k.H / 2 - (im.height * sc) / 2, im.width * sc, im.height * sc)
    const sd = tc.getImageData(0, 0, k.W, k.H).data
    k.pool.put(tmp)
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const a = sd[i + 3] / 255
      if (a <= 0) continue
      for (let ch = 0; ch < 3; ch++) {
        const b = d[i + ch] / 255
        const s = sd[i + ch] / 255
        let r: number
        if (p.blend === 'screen') r = 1 - (1 - b) * (1 - s)
        else if (p.blend === 'overlay') r = b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)
        else if (p.blend === 'add') r = Math.min(1, b + s)
        else if (p.blend === 'multiply') r = b * s
        else r = s
        d[i + ch] = Math.round((b + (r - b) * a) * 255)
      }
    }
  }
  c.putImageData(img, 0, 0)
}

/** Anh matte (luma -> alpha) da gian theo khung roi phong to quanh tam (MotionBlur2D scale) */
function matteCanvas(e: NonNullable<AeTrsMatteEffect['matte']>, k: Ctx) {
  const key = `${e.image}|${e.scale.join(',')}|${k.W}x${k.H}`
  const hit = k.matteCache.get(key)
  if (hit) return hit
  const im = k.images[e.image]
  const c = Object.assign(document.createElement('canvas'), { width: k.W, height: k.H })
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (im) {
    ctx.translate(k.W / 2, k.H / 2)
    ctx.scale(e.scale[0], e.scale[1])
    ctx.drawImage(im, -k.W / 2, -k.H / 2, k.W, k.H)
    const d = ctx.getImageData(0, 0, k.W, k.H)
    for (let i = 0; i < d.data.length; i += 4) {
      const l = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 255
      d.data[i + 3] = Math.round(l)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.putImageData(d, 0, 0)
  }
  k.matteCache.set(key, c)
  return c
}

function applyTrsMatte(layer: HTMLCanvasElement, e: AeTrsMatteEffect, t: number, k: Ctx): HTMLCanvasElement {
  const te = (t - e.start) * e.speed
  if (t < e.start || t >= e.start + e.duration) return layer
  const sx = k.W / e.compSize[0]
  const sy = k.H / e.compSize[1]
  const pos = e.position ? aeVal(e.position, te) : e.anchor
  const op = e.opacity ? aeVal(e.opacity, te)[0] / 100 : 1
  const out = k.pool.get()
  const c = out.getContext('2d')!
  c.globalAlpha = Math.max(0, Math.min(1, op))
  c.drawImage(layer, (pos[0] - e.anchor[0]) * sx, (pos[1] - e.anchor[1]) * sy)
  c.globalAlpha = 1
  if (e.matte && te >= e.matte.active[0] && te < e.matte.active[1]) {
    c.globalCompositeOperation = 'destination-in'
    c.drawImage(matteCanvas(e.matte, k), 0, 0)
    c.globalCompositeOperation = 'source-over'
  }
  k.pool.put(layer)
  return out
}

/** Mask elip CapCut: tam (centerX, centerY) = nua khung, truc y huong LEN (nhu transform);
 *  width/height = ti le khung; vien mem = smoothstep quanh d = 1 + shift, nua do rong h = K * feather^pow
 *  (d = khoang cach chuan hoa theo ban truc). Do chung tren 2 preset (feather 0.16 va 0.26) xuat that. */
function applyMask(layer: HTMLCanvasElement, m: EllipseMask, k: Ctx) {
  const c = layer.getContext('2d')!
  const cx = k.W / 2 + (m.centerX * k.W) / 2
  const cy = k.H / 2 - (m.centerY * k.H) / 2
  const rx = Math.max(1e-3, (m.width * k.W) / 2)
  const ry = Math.max(1e-3, (m.height * k.H) / 2)
  const h = m.feather > 0 ? k.tune.maskK * Math.pow(m.feather, k.tune.maskPow) : 0
  const lo = 1 + k.tune.maskShift - h
  const hi = 1 + k.tune.maskShift + h
  const th = (-m.rotation * Math.PI) / 180
  const cs = Math.cos(th)
  const sn = Math.sin(th)
  const img = c.getImageData(0, 0, k.W, k.H)
  const d = img.data
  for (let y = 0; y < k.H; y++) {
    for (let x = 0; x < k.W; x++) {
      const i = (y * k.W + x) * 4
      if (d[i + 3] === 0) continue
      const px = x + 0.5 - cx
      const py = y + 0.5 - cy
      const u = (px * cs - py * sn) / rx
      const v = (px * sn + py * cs) / ry
      const dist = Math.sqrt(u * u + v * v)
      let a: number
      if (hi - lo < 1e-6) a = dist <= 1 ? 1 : 0
      else {
        const t = Math.min(1, Math.max(0, (hi - dist) / (hi - lo)))
        a = t * t * (3 - 2 * t)
      }
      if (m.invert) a = 1 - a
      // ImageData chua nhan alpha -> chi nhan kenh alpha
      if (a < 1) d[i + 3] = Math.round(d[i + 3] * a)
    }
  }
  c.putImageData(img, 0, 0)
}

/** "Tach" / "Cuon phim": samp = ((u-.5)*2 - cx) * aspect, (v-.5)*2 - cy (v huong LEN), orient = (-sin r, cos r), r = -rotation */
function applyLineMask(layer: HTMLCanvasElement, m: LineMask, k: Ctx) {
  const c = layer.getContext('2d')!
  const img = c.getImageData(0, 0, k.W, k.H)
  const d = img.data
  const aspect = k.W / k.H
  const r = (-m.rotation * Math.PI) / 180
  const ox = -Math.sin(r)
  const oy = Math.cos(r)
  const fe = Math.pow(Math.max(0, m.feather), k.tune.lineFeatherPow)
  const md = ((r % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
  const decay = Math.sqrt(Math.sqrt(Math.max(0, 1 - Math.pow(md / (Math.PI / 4) - 1, 2))))
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  for (let y = 0; y < k.H; y++) {
    const sy = 1 - ((y + 0.5) / k.H) * 2 - m.centerY
    for (let x = 0; x < k.W; x++) {
      const i = (y * k.W + x) * 4
      if (d[i + 3] === 0) continue
      const sx = (((x + 0.5) / k.W) * 2 - 1 - m.centerX) * aspect
      let a: number
      if (m.type === 'linear') {
        a = ss(-0.005 * decay - fe, fe, ox * sx + oy * sy)
        if (m.invert) a = 1 - a
      } else {
        const dist = Math.abs(ox * sx + oy * sy)
        a = m.height <= 0 ? 1 : ss(m.height - 0.005 * decay - fe, m.height + 0.005 * decay + fe, dist)
        if (!m.invert) a = 1 - a
      }
      if (a < 1) d[i + 3] = Math.round(d[i + 3] * a)
    }
  }
  c.putImageData(img, 0, 0)
}

/** Doi mau (khong nhan alpha) cua diem anh gan mau `from` nhat thanh `to`, giu alpha */
function setColors(layer: HTMLCanvasElement, map: { from: number[]; to: number[] }[]) {
  const c = layer.getContext('2d')!
  const img = c.getImageData(0, 0, layer.width, layer.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    let best = map[0]
    let bd = Infinity
    for (const m of map) {
      const dd = (d[i] / 255 - m.from[0]) ** 2 + (d[i + 1] / 255 - m.from[1]) ** 2 + (d[i + 2] / 255 - m.from[2]) ** 2
      if (dd < bd) {
        bd = dd
        best = m
      }
    }
    d[i] = Math.round(best.to[0] * 255)
    d[i + 1] = Math.round(best.to[1] * 255)
    d[i + 2] = Math.round(best.to[2] * 255)
  }
  c.putImageData(img, 0, 0)
}

function toImg(cv: HTMLCanvasElement): Img {
  const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
  const f = new Float32Array(d.length)
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255
    f[i] = (d[i] / 255) * a
    f[i + 1] = (d[i + 1] / 255) * a
    f[i + 2] = (d[i + 2] / 255) * a
    f[i + 3] = a
  }
  return { w: cv.width, h: cv.height, d: f }
}
function fromImg(img: Img, cv: HTMLCanvasElement) {
  const ctx = cv.getContext('2d')!
  const out = ctx.createImageData(img.w, img.h)
  for (let i = 0; i < img.d.length; i += 4) {
    const a = Math.min(1, Math.max(0, img.d[i + 3]))
    const ia = a > 0 ? 1 / a : 0
    out.data[i] = Math.round(Math.min(1, img.d[i] * ia) * 255)
    out.data[i + 1] = Math.round(Math.min(1, img.d[i + 1] * ia) * 255)
    out.data[i + 2] = Math.round(Math.min(1, img.d[i + 2] * ia) * 255)
    out.data[i + 3] = Math.round(a * 255)
  }
  ctx.putImageData(out, 0, 0)
}

/** Ctx cho noi dung clip ghep co canvas rieng (w x h): chu / hinh / khung tinh theo canvas do (co chu theo be ngang) */
function subCtx(k: Ctx, g: GroupNode): Ctx {
  if (!g.canvas || (g.canvas[0] === k.W && g.canvas[1] === k.H)) return k
  const [w, h] = g.canvas
  k.pools ||= new Map()
  const key = `${w}x${h}`
  let pool = k.pools.get(key)
  if (!pool) k.pools.set(key, (pool = new Pool(w, h)))
  return { ...k, W: w, H: h, pool, matteCache: new Map() }
}
/** canvas rieng -> dat "vua khung" (contain, giua) vao canvas cha — nhu media w x h trong khung CapCut */
function fitMatrix(k: Ctx, g: GroupNode) {
  if (!g.canvas || (g.canvas[0] === k.W && g.canvas[1] === k.H)) return null
  const [w, h] = g.canvas
  const f = Math.min(k.W / w, k.H / h)
  return new DOMMatrix().translate((k.W - w * f) / 2, (k.H - h * f) / 2).scale(f)
}

/** Ve group vao canvas moi (kich thuoc khung CHA) — t la gio trong CHA */
function drawGroup(g: GroupNode, t: number, kp: Ctx): HTMLCanvasElement | null {
  const k = subCtx(kp, g)
  const out = drawGroupIn(g, t, k)
  if (!out || k === kp) return out
  const fm = fitMatrix(kp, g)!
  const dst = kp.pool.get()
  const c = dst.getContext('2d')!
  c.setTransform(fm.a, fm.b, fm.c, fm.d, fm.e, fm.f)
  c.drawImage(out, 0, 0)
  c.setTransform(1, 0, 0, 1, 0, 0)
  k.pool.put(out)
  return dst
}

function drawGroupIn(g: GroupNode, t: number, k: Ctx): HTMLCanvasElement | null {
  const local = t - g.start
  if (local < 0 || local >= g.duration) return null
  const ct = local + g.sourceStart
  let layer = k.pool.get()
  const ctx = layer.getContext('2d')!
  for (const ch of g.children) {
    if (ch.type === 'text') drawText(ch, ct, ctx, k)
    else if (ch.type === 'shape') drawShape(ch, ct, ctx, k, g.children)
    else if (ch.type === 'frames') drawFrames(ch, ct, ctx, k)
    else if (ch.type === 'vector') drawVector(ch, ct, ctx, k)
    else {
      const sub = drawGroup(ch, ct, k)
      if (sub) {
        if ((ch.effects || []).some((e) => e.space === 'canvas')) {
          // hieu ung ap SAU khi dat clip len khung (phoi canh xoay quanh tam KHUNG — do tren LE VIP2-03)
          let full = k.pool.get()
          composite(full.getContext('2d')!, sub, ch, k, ct - ch.start)
          full = applyEffects(full, ch, ct, k, true)
          ctx.drawImage(full, 0, 0)
          k.pool.put(full)
        } else composite(ctx, sub, ch, k, ct - ch.start)
        k.pool.put(sub)
      }
    }
  }
  if (g.mask && g.maskTarget === 'adjust') {
    // clip co CHINH MAU + mask: CapCut dung mask chon VUNG chinh mau (Feature.js u_blendWithMask), clip khong bi cat
    // (do tren LE VIP2-05: ngoai dai sang "Compound" van hien mau goc cua ban sao)
    const adj = k.pool.get()
    adj.getContext('2d')!.drawImage(layer, 0, 0)
    const isColor = (e: { type: string }) => e.type === 'color_adjust' || e.type === 'color_set'
    const done = applyEffects(adj, { ...g, effects: (g.effects || []).filter(isColor) }, ct, k, false)
    const mk = maskAt(g, local)
    if (mk.type === 'ellipse') applyMask(done, mk, k)
    else applyLineMask(done, mk, k)
    const lc = layer.getContext('2d')!
    lc.globalCompositeOperation = 'destination-out'
    lc.drawImage(done, 0, 0)
    lc.globalCompositeOperation = 'lighter'
    lc.drawImage(done, 0, 0)
    lc.globalCompositeOperation = 'source-over'
    k.pool.put(done)
    // hieu ung khac (vd Player 3) ap len ca clip sau khi chinh mau
    return applyEffects(layer, { ...g, effects: (g.effects || []).filter((e) => !isColor(e)) }, ct, k, false)
  }
  layer = applyEffects(layer, g, ct, k, false)
  if (g.mask) {
    const mk = maskAt(g, local)
    if (mk.type === 'ellipse') applyMask(layer, mk, k)
    else applyLineMask(layer, mk, k)
  }
  return layer
}

/** mask cua group luc `local` (gio tu dau segment) — ap keyframe mask */
function maskAt(g: GroupNode, local: number): ClipMask {
  const m = g.mask!
  if (!g.maskKeyframes) return m
  const out: Record<string, unknown> = { ...m }
  for (const [f, ks] of Object.entries(g.maskKeyframes)) out[f] = ccVal(ks, local, (m as unknown as Record<string, number>)[f] ?? 0)
  return out as unknown as ClipMask
}

function applyEffects(layer: HTMLCanvasElement, g: GroupNode, ct: number, k: Ctx, canvas: boolean): HTMLCanvasElement {
  for (const e of g.effects || []) {
    if ((e.space === 'canvas') !== canvas) continue
    if (e.type === 'ae_trs_matte') layer = applyTrsMatte(layer, e, ct, k)
    else if (e.type === 'deep_glow' && e.glowIter !== undefined)
      fromImg(deepGlow2(toImg(layer), { ...e, glowIter: e.glowIter, stepsMult: e.stepsMult ?? 1, downSample: e.downSample ?? 1, ratio: e.ratio ?? 1, rotate: e.rotate ?? 0 }, k.tune.glowGain), layer)
    else if (e.type === 'deep_glow') fromImg(deepGlow(toImg(layer), e, k.tune.glowGain), layer)
    else if (e.type === 'chrome_blur') fromImg(chromeBlur(toImg(layer), e.blur, e.offset, e.flipY ?? true), layer)
    else if (e.type === 'color_set') setColors(layer, e.map)
    else if (e.type === 'color_adjust') applyColorOps(layer, e.ops)
    else if (e.type === 'sprite_blend' && ct >= e.start && ct < e.start + e.duration) spriteBlend(layer, e, ct - e.start, k)
    else if (e.type === 'rotate3d') {
      const ry = ccVal(e.keyframes, ct - (e.start ?? 0), e.rotY)
      if (Math.abs(ry) > 1e-6) layer = rotate3d(layer, ry, e.fovx, k)
    }
    else if (e.type === 'blur' && ct >= e.start && ct < e.start + e.duration) {
      const v = ccVal(e.keyframes, ct - e.start, e.value)
      if (v > 1e-4) fromImg(capcutBlur(toImg(layer), 4 * v), layer)
    }
  }
  return layer
}

// ---------------------------------------------------------------------------
// CHU THAT THAY CHU MAU — giu bo cuc cua mau (2026-10-04)
// Moi o chu (slot) co CO chu sao cho be ngang chu that <= be ngang chu mau (khong bao gio tran khung cua o do), roi
// NEO vao o ben canh: o co hang xom ben trai -> giu mep trai, hang xom ben duoi -> giu mep duoi... -> to hop khit nhu mau
// du chu that dai / ngan hon. Cuoi cung dua ca to hop ve dung tam cu. Do tren khung "day du nhat" (nhieu o cung hien nhat).
// ---------------------------------------------------------------------------
export const FIT_GROW_MAX = 1.12 // chu that ngan hon chu mau: phong toi da 12% (giu phan cap cua mau)
const FIT_SHRINK_MIN = 0.3

interface Hit {
  n: TextNode
  M: DOMMatrix // khung cua group chua node -> khung cua mau
  local: number
  k: Ctx // ctx canvas cua group chua node (clip ghep co canvas rieng)
}
interface Box {
  l: number
  r: number
  t: number
  b: number
}

function compositeMatrix(g: GroupNode, k: Ctx, local: number): { m: DOMMatrix; alpha: number } {
  // GIONG composite(): cung cong thuc transform + keyframe + hoat anh vao/ra
  const kf = g.keyframes || {}
  const tr = g.transform || { x: 0, y: 0, scale: 1, rotation: 0 }
  const x = ccVal(kf.x, local, tr.x)
  const y = ccVal(kf.y, local, tr.y)
  const scale = ccVal(kf.scale, local, tr.scale)
  const rot = ccVal(kf.rotation, local, tr.rotation)
  let alpha = ccVal(kf.alpha, local, g.alpha ?? 1)
  let animScale = 1
  for (const a of g.anims || []) {
    const p = Math.min(1, Math.max(0, (local - a.start) / Math.max(1e-6, a.duration)))
    alpha *= a.alpha[0] + (a.alpha[1] - a.alpha[0]) * cubicEase(a.easeAlpha, p)
    animScale *= a.scale[0] + (a.scale[1] - a.scale[0]) * cubicEase(a.easeScale, p)
  }
  const sa = g.sanims ? sampledState(g.sanims, local) : null
  if (sa) {
    alpha *= sa.alpha
    animScale *= sa.scale
  }
  let m = new DOMMatrix()
  if (sa) m = m.translate(sa.dx.reduce((a, d) => a + d.v, 0) * (k.W / 1080), sa.dy.reduce((a, d) => a + d.v, 0) * (k.W / 1080))
  if (x || y || scale * animScale !== 1 || rot) {
    m = m
      .translate(k.W / 2 + (x * k.W) / 2, k.H / 2 - (y * k.H) / 2)
      .rotate(rot)
      .scale(scale * animScale)
      .translate(-k.W / 2, -k.H / 2)
  }
  return { m, alpha }
}

/** Cac node chu dang hien luc t (gio cua mau) + ma tran tu khung group chua no ra khung mau */
function hitsAt(k: Ctx, t: number): Hit[] {
  const out: Hit[] = []
  const visit = (g: GroupNode, local: number, M: DOMMatrix, kp: Ctx) => {
    if (local < 0 || local >= g.duration) return
    const ct = local + g.sourceStart
    const { m, alpha } = compositeMatrix(g, kp, local)
    if (alpha <= 0) return
    let Mg = M.multiply(m)
    const fm = fitMatrix(kp, g)
    if (fm) Mg = Mg.multiply(fm)
    const kk = subCtx(kp, g)
    for (const e of g.effects || []) {
      if (e.type !== 'ae_trs_matte' || ct < e.start || ct >= e.start + e.duration) continue
      const pos = e.position ? aeVal(e.position, (ct - e.start) * e.speed) : e.anchor
      Mg = Mg.translate((pos[0] - e.anchor[0]) * (kk.W / e.compSize[0]), (pos[1] - e.anchor[1]) * (kk.H / e.compSize[1]))
    }
    for (const ch of g.children) {
      if (ch.type === 'group') {
        visit(ch, ct - ch.start, Mg, kk)
        continue
      }
      if (ch.type !== 'text') continue
      const l = ct - ch.start
      if (l < 0 || l >= ch.duration || ccVal(ch.keyframes?.alpha, l, ch.alpha ?? 1) <= 0) continue
      out.push({ n: ch, M: Mg, local: l, k: kk })
    }
  }
  visit({ ...k.spec.root, start: 0 }, t, new DOMMatrix(), k)
  return out
}

/** Khung chu cua node tren khung mau (chua tinh hoat anh tung ky tu) */
function nodeBox(h: Hit, text: string, c: CanvasRenderingContext2D, _k: Ctx): Box | null {
  const k = h.k
  const n = h.n
  const kf = n.keyframes || {}
  const parts = layoutText(c, n, text, ccVal(kf.scale, h.local, n.transform.scale), k)
  if (!parts.length) return null
  const w = parts.reduce((a, p) => a + p.w, 0)
  const hh = Math.max(...parts.map((p) => p.asc)) + Math.max(...parts.map((p) => p.desc))
  const p0 = h.M.transformPoint(new DOMPoint(k.W / 2 + (ccVal(kf.x, h.local, n.transform.x) * k.W) / 2, k.H / 2 - (ccVal(kf.y, h.local, n.transform.y) * k.H) / 2))
  const s = Math.hypot(h.M.a, h.M.b)
  return { l: p0.x - (w * s) / 2, r: p0.x + (w * s) / 2, t: p0.y - (hh * s) / 2, b: p0.y + (hh * s) / 2 }
}

const unionBox = (bs: Box[]): Box => ({
  l: Math.min(...bs.map((b) => b.l)),
  r: Math.max(...bs.map((b) => b.r)),
  t: Math.min(...bs.map((b) => b.t)),
  b: Math.max(...bs.map((b) => b.b))
})

/** Doan [a, b) dai nhat cua cac khung thoa dieu kien -> giua doan (gio) */
function middleOfLongestRun(ok: boolean[], fps: number): number | null {
  let best: [number, number] | null = null
  let s = -1
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) {
      if (s < 0) s = i
    } else if (s >= 0) {
      if (!best || i - s >= best[1] - best[0]) best = [s, i]
      s = -1
    }
  }
  return best ? (best[0] + best[1] - 1) / 2 / fps : null
}

export function computeFit(k: Ctx): Map<TextNode, { scale: number; ox: number; oy: number }> {
  const adj = new Map<TextNode, { scale: number; ox: number; oy: number }>()
  const slots = k.spec.slots.map((s) => s.id).filter((id) => k.texts[id] !== undefined && k.texts[id] !== sampleOf(k, id))
  if (!slots.length) return adj
  const c = document.createElement('canvas').getContext('2d')!
  const fps = k.spec.fps || 30
  const nF = Math.max(1, Math.round(k.spec.duration * fps))
  const frames = Array.from({ length: nF }, (_, f) => hitsAt(k, f / fps))
  const slotsAt = frames.map((hs) => new Set(hs.map((h) => h.n.slot)))
  // khung "day du nhat": nhieu o cung hien nhat, giua doan dai nhat
  const most = Math.max(...slotsAt.map((s) => s.size))
  const tStar = middleOfLongestRun(slotsAt.map((s) => s.size === most), fps) ?? 0
  const star = hitsAt(k, tStar)

  // 1) co chu tung o: chu that <= be ngang chu mau
  const scaleOf: Record<string, number> = {}
  const refHit: Record<string, Hit> = {}
  for (const id of k.spec.slots.map((s) => s.id)) {
    let hs = star.filter((h) => h.n.slot === id)
    if (!hs.length) {
      const tt = middleOfLongestRun(slotsAt.map((s) => s.has(id)), fps)
      hs = tt === null ? [] : hitsAt(k, tt).filter((h) => h.n.slot === id)
    }
    if (!hs.length) continue
    let best: { h: Hit; w0: number } | null = null
    for (const h of hs) {
      const b = nodeBox(h, sampleOf(k, id), c, k)
      if (b && (!best || b.r - b.l > best.w0)) best = { h, w0: b.r - b.l }
    }
    if (!best) continue
    refHit[id] = best.h
    if (!slots.includes(id)) {
      scaleOf[id] = 1
      continue
    }
    const b1 = nodeBox(best.h, textOf(k, id), c, k)
    const w1 = b1 ? b1.r - b1.l : 0
    // room > 1: o duoc RONG hon chu mau toi room lan, khong co (vd so "10" thay "3" canh khoi chu — no sang ben trong)
    const room = k.spec.slots.find((x) => x.id === id)?.room ?? 1
    const target = room > 1 && w1 > best.w0 ? Math.min(1, (room * best.w0) / w1) : best.w0 / w1
    scaleOf[id] = w1 > 0 ? Math.max(FIT_SHRINK_MIN, Math.min(FIT_GROW_MAX, target)) : 1
  }

  // 2) khung cu / moi cua cac o hien o khung day du nhat
  const oldB: Record<string, Box> = {}
  const rawW: Record<string, number> = {}
  for (const id of new Set(star.map((h) => h.n.slot))) {
    const bs = star.filter((h) => h.n.slot === id).map((h) => nodeBox(h, sampleOf(k, id), c, k)).filter(Boolean) as Box[]
    const ns = star.filter((h) => h.n.slot === id).map((h) => nodeBox(h, textOf(k, id), c, k)).filter(Boolean) as Box[]
    if (!bs.length || !ns.length) continue
    oldB[id] = unionBox(bs)
    rawW[id] = Math.max(...ns.map((b) => b.r - b.l))
  }
  const ids = Object.keys(oldB)
  // DONG CHU: cac o cung co chu nam canh nhau tren mot dong (vd "bí" + "quyết", "video" "này" "nhé") chia CHUNG be
  // ngang dong -> cung mot co, xep lai trai -> phai voi khe cu, tam dong giu nguyen (o dai bu o ngan). Chu cai lon
  // (drop cap) canh chu nho khong cung dong (chieu cao khac xa) -> neo rieng nhu duoi.
  const sameLine = (a: Box, b: Box) => {
    const ha = a.b - a.t
    const hb = b.b - b.t
    const vOver = Math.min(a.b, b.b) - Math.max(a.t, b.t)
    const hOver = Math.min(a.r, b.r) - Math.max(a.l, b.l)
    const gap = Math.max(a.l, b.l) - Math.min(a.r, b.r)
    return ha / hb > 0.6 && ha / hb < 1.67 && vOver >= 0.5 * Math.min(ha, hb) && hOver < 0.35 * Math.min(a.r - a.l, b.r - b.l) && gap < 1.2 * Math.min(ha, hb)
  }
  const lineOf: Record<string, string[]> = {}
  for (const id of ids) {
    if (lineOf[id]) continue
    const comp = [id]
    for (let i = 0; i < comp.length; i++) for (const o of ids) if (!comp.includes(o) && sameLine(oldB[comp[i]], oldB[o])) comp.push(o)
    comp.sort((a, b) => oldB[a].l - oldB[b].l)
    for (const o of comp) lineOf[o] = comp
  }
  const lineX: Record<string, number> = {}
  for (const line of new Set(Object.values(lineOf))) {
    if (line.length < 2) continue
    const span0 = oldB[line[line.length - 1]].r - oldB[line[0]].l
    const gaps = line.slice(1).map((id, i) => oldB[id].l - oldB[line[i]].r)
    const need = line.reduce((a, id) => a + rawW[id], 0) + gaps.reduce((a, g) => a + g, 0)
    const s = need > 0 ? Math.max(FIT_SHRINK_MIN, Math.min(FIT_GROW_MAX, span0 / need)) : 1
    let x = (oldB[line[0]].l + oldB[line[line.length - 1]].r) / 2 - (s * need) / 2
    line.forEach((id, i) => {
      scaleOf[id] = s
      lineX[id] = x + (s * rawW[id]) / 2
      x += s * rawW[id] + (i < gaps.length ? s * gaps[i] : 0)
    })
  }
  const newW: Record<string, number> = {}
  for (const id of ids) newW[id] = rawW[id] * (scaleOf[id] ?? 1)
  const near = (a: Box, b: Box) => {
    const vOver = Math.min(a.b, b.b) - Math.max(a.t, b.t)
    const hOver = Math.min(a.r, b.r) - Math.max(a.l, b.l)
    const minH = Math.min(a.b - a.t, b.b - b.t)
    const minW = Math.min(a.r - a.l, b.r - b.l)
    return {
      // b nam BEN TRAI a (cung dong, sat nhau)
      left: vOver >= 0.3 * minH && (b.l + b.r) / 2 < (a.l + a.r) / 2 && hOver < 0.35 * minW && a.l - b.r < 0.6 * minH,
      right: vOver >= 0.3 * minH && (b.l + b.r) / 2 > (a.l + a.r) / 2 && hOver < 0.35 * minW && b.l - a.r < 0.6 * minH,
      // b nam PHIA TREN a (dong tren, co phan chong theo chieu ngang)
      above: hOver >= 0.2 * minW && (b.t + b.b) / 2 < (a.t + a.b) / 2 && vOver < 0.5 * minH && a.t - b.b < 0.6 * minH,
      below: hOver >= 0.2 * minW && (b.t + b.b) / 2 > (a.t + a.b) / 2 && vOver < 0.5 * minH && b.t - a.b < 0.6 * minH
    }
  }
  const newB: Record<string, Box> = {}
  for (const id of ids) {
    const a = oldB[id]
    const nb = { left: false, right: false, above: false, below: false }
    for (const o of ids) {
      if (o === id) continue
      const r = near(a, oldB[o])
      nb.left ||= r.left
      nb.right ||= r.right
      nb.above ||= r.above
      nb.below ||= r.below
    }
    const s = scaleOf[id] ?? 1
    const w = newW[id]
    const h = (a.b - a.t) * s
    const cx = lineX[id] !== undefined ? lineX[id] : nb.left && !nb.right ? a.l + w / 2 : nb.right && !nb.left ? a.r - w / 2 : (a.l + a.r) / 2
    const cy = nb.above && !nb.below ? a.t + h / 2 : nb.below && !nb.above ? a.b - h / 2 : (a.t + a.b) / 2
    newB[id] = { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }
  }
  // 2b) NET MUC: dau tieng Viet chong (ấ, ầ, ặ...) cao hon dong font -> cham o ngay phia tren (do that: 'rất' duoi
  //     'sản'). Hai o chong nhau theo chieu ngang: khe net muc >= 6% dong (mau chong net co chu dich thi giu muc chong
  //     cua mau) -> day o NHO hon (ca dong cua no) ra xa.
  // net muc TUNG KY TU (khung o tren khung mau): chi cap ky tu CHONG NHAU THEO CHIEU NGANG moi tinh khe — mau LE VIP2-01
  // co moc dau 'Ổ' nho len ngang dong tren nhung nam NGOAI phan chu cua dong tren (khong chong) -> khong phai "chong co
  // chu dich"; chu that 'TĂNG' duoi 'giá vàng' thi dau 'Ă' cham chu 'v' -> phai day ra.
  const inkGlyphs = (id: string, text: string, sc: number, box: Box): Box[] => {
    const out: Box[] = []
    for (const h of star.filter((x) => x.n.slot === id)) {
      const parts = layoutText(c, h.n, text, ccVal(h.n.keyframes?.scale, h.local, h.n.transform.scale) * sc, h.k)
      if (!parts.length) continue
      const total = parts.reduce((s0, p) => s0 + p.w, 0)
      const base = (Math.max(...parts.map((p) => p.asc)) - Math.max(...parts.map((p) => p.desc))) / 2
      const ss = Math.hypot(h.M.a, h.M.b)
      const cx = (box.l + box.r) / 2
      const cy = (box.t + box.b) / 2
      let px = -total / 2
      for (const p of parts) {
        c.font = p.font
        c.letterSpacing = '0px'
        p.glyphs.forEach((g, i) => {
          if (!g.trim()) return
          const m = c.measureText(g)
          const gx = px + p.xs[i]
          out.push({ l: cx + (gx - m.actualBoundingBoxLeft) * ss, r: cx + (gx + m.actualBoundingBoxRight) * ss, t: cy + (base - m.actualBoundingBoxAscent) * ss, b: cy + (base + m.actualBoundingBoxDescent) * ss })
        })
        px += p.w
      }
    }
    return out
  }
  /** khe net muc nho nhat giua cac ky tu o tren / o duoi co chong nhau theo chieu ngang (Infinity = khong cap nao) */
  const inkGap = (up: Box[], dn: Box[]) => {
    let g = Infinity
    for (const a of up) for (const b of dn) if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0) g = Math.min(g, b.t - a.b)
    return g
  }
  const ink0: Record<string, Box[]> = {}
  for (const id of ids) ink0[id] = inkGlyphs(id, sampleOf(k, id), 1, oldB[id])
  for (let pass = 0; pass < 3; pass++) {
    for (const a of ids) {
      for (const b of ids) {
        const A = newB[a]
        const B = newB[b]
        if (a === b || (A.t + A.b) / 2 >= (B.t + B.b) / 2 || Math.min(A.r, B.r) - Math.max(A.l, B.l) <= 0) continue
        const gap = inkGap(inkGlyphs(a, textOf(k, a), scaleOf[a] ?? 1, A), inkGlyphs(b, textOf(k, b), scaleOf[b] ?? 1, B))
        // mau CHONG NET co chu dich (> 25% dong, vd chu viet tay de len chu dam) -> giu dung muc chong cua mau;
        // chi suot nhe (dau cham / dau mu gan cham) -> luon chua khe 6% dong
        const lh = Math.min(A.b - A.t, B.b - B.t)
        const gap0 = inkGap(ink0[a], ink0[b])
        const need = gap0 < -0.25 * lh ? gap0 : 0.06 * lh
        if (!isFinite(gap) || gap >= need - 0.5) continue
        const d = need - gap
        // day o NHO hon — ca DONG cua no (cac o cung dong di cung nhau, khong lech hang)
        const [mv, sign] = A.b - A.t <= B.b - B.t ? [a, -1] : [b, 1]
        for (const o of lineOf[mv] || [mv]) {
          newB[o].t += sign * d
          newB[o].b += sign * d
        }
      }
    }
  }
  // 3) ca to hop ve dung tam cu
  let sx = 0
  let sy = 0
  if (ids.length) {
    const u0 = unionBox(ids.map((i) => oldB[i]))
    const u1 = unionBox(ids.map((i) => newB[i]))
    sx = (u0.l + u0.r) / 2 - (u1.l + u1.r) / 2
    sy = (u0.t + u0.b) / 2 - (u1.t + u1.b) / 2
  }
  // 4) dich tren khung mau -> dich trong khung group cua TUNG node (nghich dao phan tuyen tinh cua ma tran)
  const walk = (g: GroupNode, fn: (n: TextNode) => void) => g.children.forEach((ch) => (ch.type === 'group' ? walk(ch, fn) : ch.type === 'text' ? fn(ch) : null))
  walk(k.spec.root, (n) => {
    const s = scaleOf[n.slot] ?? 1
    let dx = 0
    let dy = 0
    if (oldB[n.slot]) {
      dx = (newB[n.slot].l + newB[n.slot].r) / 2 - (oldB[n.slot].l + oldB[n.slot].r) / 2 + sx
      dy = (newB[n.slot].t + newB[n.slot].b) / 2 - (oldB[n.slot].t + oldB[n.slot].b) / 2 + sy
    }
    if (s === 1 && !dx && !dy) return
    const M = (star.find((h) => h.n === n) || (refHit[n.slot]?.n === n ? refHit[n.slot] : null) || star.find((h) => h.n.slot === n.slot) || refHit[n.slot])?.M
    let ox = 0
    let oy = 0
    if (M && (dx || dy)) {
      const p = new DOMMatrix([M.a, M.b, M.c, M.d, 0, 0]).inverse().transformPoint(new DOMPoint(dx, dy))
      ox = p.x
      oy = p.y
    }
    adj.set(n, { scale: s, ox, oy })
  })
  return adj
}

/** hoan vi co dinh cua n ky tu: order[i] = luot ra san cua ky tu i (LCG hat giong theo n — giong tinh than AnimScript.lua) */
function shuffleOrder(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  let s = (114514 + 1919810 + n * 255) >>> 0
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let j = 0; j <= n; j++) {
    const x = Math.floor(rnd() * n)
    const y = Math.floor(rnd() * n)
    ;[a[x], a[y]] = [a[y], a[x]]
  }
  const order = new Array(n)
  a.forEach((ch, slot) => (order[ch] = slot))
  return order
}

/** getBezierTfromX + getBezierValue cua Transform.lua (controls {x1,y1,x2,y2}) */
function cubicEase(c: [number, number, number, number], x: number) {
  const bez = (a: number, b: number, t: number) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t
  let ts = 0
  let te = 1
  while (te - ts >= 0.0001) {
    const tm = (ts + te) / 2
    if (bez(c[0], c[2], tm) > x) te = tm
    else ts = tm
  }
  return bez(c[1], c[3], (ts + te) / 2)
}

/** Ghep group vao cha voi transform + keyframe cua clip (local = gio tinh tu dau segment) */
function composite(dst: CanvasRenderingContext2D, src: HTMLCanvasElement, g: GroupNode, k: Ctx, local: number) {
  const kf = g.keyframes || {}
  const tr = g.transform || { x: 0, y: 0, scale: 1, rotation: 0 }
  const x = ccVal(kf.x, local, tr.x)
  const y = ccVal(kf.y, local, tr.y)
  const scale = ccVal(kf.scale, local, tr.scale)
  const rot = ccVal(kf.rotation, local, tr.rotation)
  let alpha = ccVal(kf.alpha, local, g.alpha ?? 1)
  let animScale = 1
  for (const a of g.anims || []) {
    // truoc khi bat dau: gia tri dau; sau khi xong: gia tri cuoi (giong Transform.lua)
    const p = Math.min(1, Math.max(0, (local - a.start) / Math.max(1e-6, a.duration)))
    alpha *= a.alpha[0] + (a.alpha[1] - a.alpha[0]) * cubicEase(a.easeAlpha, p)
    animScale *= a.scale[0] + (a.scale[1] - a.scale[0]) * cubicEase(a.easeScale, p)
  }
  const sa = g.sanims ? sampledState(g.sanims, local) : null
  if (sa) {
    alpha *= sa.alpha
    animScale *= sa.scale
  }
  if (alpha <= 0) return
  const sx = sa ? sa.dx.reduce((a, d) => a + d.v, 0) * (k.W / 1080) : 0
  const sy = sa ? sa.dy.reduce((a, d) => a + d.v, 0) * (k.W / 1080) : 0
  dst.save()
  dst.globalAlpha = Math.min(1, alpha)
  if (sx || sy) dst.translate(sx, sy)
  if (x || y || scale * animScale !== 1 || rot) {
    dst.translate(k.W / 2 + (x * k.W) / 2, k.H / 2 - (y * k.H) / 2)
    if (rot) dst.rotate((rot * Math.PI) / 180)
    dst.scale(scale * animScale, scale * animScale)
    dst.translate(-k.W / 2, -k.H / 2)
  }
  dst.drawImage(src, 0, 0)
  dst.restore()
}

export const TextTemplate: React.FC<TextTemplateProps & { tune?: Partial<TextTune> }> = ({ spec, assetBase, texts, background, tune, fit, muted, fileUrl }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { ready, images } = useAssets(spec, assetBase, fileUrl)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const W = spec.width
  const H = spec.height
  const k = useMemo<Ctx>(() => {
    const kk: Ctx = { spec, texts: texts || {}, images, tune: { ...DEFAULT_TUNE, ...(tune || {}) }, pool: new Pool(W, H), W, H, matteCache: new Map() }
    // chu that thay chu mau: do + xep lai bo cuc SAU khi font da nap (do bang font that)
    if (fit && ready && texts && Object.keys(texts).length) kk.adj = computeFit(kk)
    return kk
  }, [spec, texts, images, tune, W, H, fit, ready])
  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv || !ready) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const t = frame / fps
    const out = drawGroup({ ...spec.root, start: 0 }, t, k)
    if (out) {
      composite(ctx, out, spec.root, k, t)
      k.pool.put(out)
    }
  }, [frame, fps, ready, k, spec, W, H])

  return (
    <AbsoluteFill style={{ background: background || 'transparent' }}>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', height: '100%' }} />
      {!muted && spec.audio.map((a, i) => (
        <Sequence key={i} from={Math.round(a.start * fps)} durationInFrames={Math.max(1, Math.round(a.duration * fps))} layout="none">
          <Html5Audio
            src={fileUrl ? fileUrl(a.file) : joinUrl(assetBase, a.file)}
            trimBefore={Math.round(a.sourceStart * fps)}
            // CapCut cho khuech dai (>1); fade vao/ra tuyen tinh theo giay
            volume={(f) => {
              const tt = f / fps
              let v = Math.max(0, a.volume)
              if (a.fadeIn && tt < a.fadeIn) v *= tt / a.fadeIn
              if (a.fadeOut && tt > a.duration - a.fadeOut) v *= Math.max(0, (a.duration - tt) / a.fadeOut)
              return v
            }}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
