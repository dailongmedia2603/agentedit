// Port 1:1 LumiDeepGlow (threshold.frag + GlowIter x8 (blur.frag X/Y) + blend.frag) sang JS.
// Anh vao/ra: Float32Array RGBA da nhan alpha (premultiplied), 0..1. Lay mau song tuyen tinh + kep bien nhu GPU.
import type { DeepGlowEffect } from './spec'

export interface Img {
  w: number
  h: number
  d: Float32Array // RGBA
}

const newImg = (w: number, h: number): Img => ({ w, h, d: new Float32Array(w * h * 4) })

/** texture2D(tex, uv) — bilinear, CLAMP_TO_EDGE */
function sample(img: Img, u: number, v: number, out: Float32Array, o = 0) {
  const x = u * img.w - 0.5
  const y = v * img.h - 0.5
  let x0 = Math.floor(x)
  let y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  let x1 = x0 + 1
  let y1 = y0 + 1
  const W = img.w - 1
  const H = img.h - 1
  x0 = x0 < 0 ? 0 : x0 > W ? W : x0
  x1 = x1 < 0 ? 0 : x1 > W ? W : x1
  y0 = y0 < 0 ? 0 : y0 > H ? H : y0
  y1 = y1 < 0 ? 0 : y1 > H ? H : y1
  const d = img.d
  const i00 = (y0 * img.w + x0) * 4
  const i10 = (y0 * img.w + x1) * 4
  const i01 = (y1 * img.w + x0) * 4
  const i11 = (y1 * img.w + x1) * 4
  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy
  for (let c = 0; c < 4; c++) out[o + c] = d[i00 + c] * w00 + d[i10 + c] * w10 + d[i01 + c] * w01 + d[i11 + c] * w11
}

const pw = (x: number, g: number) => (x <= 0 ? 0 : Math.pow(x, g))

function thresholdPass(input: Img, w: number, h: number, p: DeepGlowEffect): Img {
  const out = newImg(w, h)
  const s = new Float32Array(4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sample(input, (x + 0.5) / w, (y + 0.5) / h, s)
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let v = Math.max(s[c], 0)
        if (v < p.threshold) {
          const pct = v / Math.max(p.threshold, 0.0001)
          v = pct * v * p.thresholdSmooth
        }
        out.d[i + c] = p.gammaCorrect ? pw(v, p.gammaValue) : v
      }
      out.d[i + 3] = 1
    }
  }
  return out
}

const normpdf = (x: number, sigma: number) => (0.39894 * Math.exp((-0.5 * x * x) / (sigma * sigma))) / sigma

function blurPass(input: Img, angle: number, samples: number, downSample: number, gamma: number): Img {
  const { w, h } = input
  const out = newImg(w, h)
  const theta = (angle / 180) * 3.1415926
  const mn = Math.min(w, h)
  const rx = (720 * w) / mn
  const ry = (720 * h) / mn
  const ux = (Math.cos(theta) / rx) * downSample
  const uy = (Math.sin(theta) / ry) * downSample
  const sigma = 4
  const first = normpdf(0, sigma)
  const weights: number[] = []
  for (let i = 1; i <= samples; i++) weights.push(normpdf((i / samples) * 16, sigma))
  let sumW = first
  for (const wt of weights) sumW += wt * 2
  const a = new Float32Array(4)
  const b = new Float32Array(4)
  const inv = 1 / gamma
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      sample(input, u, v, a)
      let r = pw(a[0], gamma) * first
      let g = pw(a[1], gamma) * first
      let bl = pw(a[2], gamma) * first
      for (let k = 0; k < samples; k++) {
        const i = k + 1
        const wt = weights[k]
        sample(input, u + i * ux, v + i * uy, a)
        sample(input, u - i * ux, v - i * uy, b)
        r += (pw(a[0], gamma) + pw(b[0], gamma)) * wt
        g += (pw(a[1], gamma) + pw(b[1], gamma)) * wt
        bl += (pw(a[2], gamma) + pw(b[2], gamma)) * wt
      }
      const o = (y * w + x) * 4
      out.d[o] = pw(r / sumW, inv)
      out.d[o + 1] = pw(g / sumW, inv)
      out.d[o + 2] = pw(bl / sumW, inv)
      out.d[o + 3] = 1
    }
  }
  return out
}

const screen = (a: number, b: number) => 1 - (1 - a) * (1 - b)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Tra ve anh moi (cung kich thuoc input). radius <= 0 -> giu nguyen. */
export function deepGlow(input: Img, p: DeepGlowEffect, gain = 1): Img {
  if (p.radius <= 0) return input
  const W = input.w
  const H = input.h
  // LumiDeepGlow:onUpdate — RT nhoe = OutputTex * 0.5 * quality
  const w = Math.max(1, Math.round(W * 0.5 * p.quality))
  const h = Math.max(1, Math.round(H * 0.5 * p.quality))
  const r = p.radius
  const down = [1, 1, Math.max(Math.min(r / 128, 2), 1), Math.max(Math.min(r / 64, 4), 1), Math.max(r / 32, 1), Math.max(r / 16, 1), Math.max(r / 8, 1), Math.max(r / 4, 1)]
  const inten = [
    (r / 16) * 0.125,
    (r / 16) * 0.25,
    (r / 16 / down[2]) * 0.5,
    r / 16 / down[3],
    (r / down[4]) * 0.125,
    (r / down[5]) * 0.25,
    (r / down[6]) * 0.5,
    r / down[7]
  ]
  let cur = thresholdPass(input, w, h, p)
  const comps: Img[] = []
  for (let k = 0; k < 8; k++) {
    const n = Math.floor(Math.max(inten[k], 0))
    const bx = blurPass(cur, 0, n, down[k], p.gammaValue)
    cur = blurPass(bx, 90, n, down[k], p.gammaValue)
    comps.push(cur)
  }
  // blend.frag
  const out = newImg(W, H)
  const intensity = pw(p.glowIntensity * p.exposure, 1 / p.gammaValue) * gain
  const s = new Float32Array(4)
  const dis = new Float32Array(4)
  const g = p.gammaValue
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W
      for (let k = 0; k < 8; k++) {
        sample(comps[k], u, v, s)
        for (let c = 0; c < 4; c++) {
          const d = clamp01(s[c] * intensity)
          if (k === 0) dis[c] = d
          else dis[c] = p.blendMode === 'screen' ? screen(dis[c], d) : Math.min(dis[c] + d, 1)
        }
      }
      const m = Math.max(intensity, 1)
      // glowColor -> pow(gamma) -> (gammaCorrect) rgb pow(1/gamma)
      let gr = clamp01(dis[0] * m)
      let gg = clamp01(dis[1] * m)
      let gb = clamp01(dis[2] * m)
      let ga = pw(clamp01(dis[3] * m), g)
      gr = pw(gr, g)
      gg = pw(gg, g)
      gb = pw(gb, g)
      if (p.gammaCorrect) {
        gr = pw(gr, 1 / g)
        gg = pw(gg, 1 / g)
        gb = pw(gb, 1 / g)
      }
      if (p.unmult) {
        const br = Math.max(gr, gg, gb)
        if (br > 0) ga = br
        else gr = gg = gb = ga = 0
      }
      const i = (y * W + x) * 4
      const ar = input.d[i]
      const ag = input.d[i + 1]
      const ab = input.d[i + 2]
      const aa = input.d[i + 3]
      // composite(inputTex, result)
      const ia = Math.max(aa, 0.0001)
      const ib = Math.max(ga, 0.0001)
      const cr = ar * (1 - ga) + gr * (1 - aa) + aa * ga * screen(ar / ia, gr / ib)
      const cg = ag * (1 - ga) + gg * (1 - aa) + aa * ga * screen(ag / ia, gg / ib)
      const cb = ab * (1 - ga) + gb * (1 - aa) + aa * ga * screen(ab / ia, gb / ib)
      const ca = aa + ga - aa * ga
      const so = p.sourceOpacity
      out.d[i] = gr + (cr - gr) * so
      out.d[i + 1] = gg + (cg - gg) * so
      out.d[i + 2] = gb + (cb - gb) * so
      out.d[i + 3] = ga + (ca - ga) * so
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// LumiDeepGlow BAN MOI (goi co GlowIter.lua: glowIter / stepsMult / downSample) — port 1:1 LumiDeepGlow.lua + GlowIter.lua
// + shader (preprocess / downscale / blur / comp / postprocess, doc tu shaderGLES). Khac ban cu: moi vong lay ket qua vong
// truoc, tron screen voi do mo gamma/i * falloff, NHAN exposure (mult) moi vong. Lua dat u_blurTex = blurTex SAU cung ->
// hau xu ly dung ket qua vong co chi so le cuoi (glowIter 8 -> vong 7) — giu nguyen nhu ban goc.
export interface DeepGlow2Params {
  radius: number
  exposure: number
  threshold: number
  thresholdSmooth: number
  gammaValue: number
  gammaCorrect: boolean
  quality: number
  unmult: boolean
  sourceOpacity: number
  glowIter: number
  stepsMult: number
  downSample: number
  ratio: number
  rotate: number
}

function pass(w: number, h: number, fn: (u: number, v: number, o: Float32Array, i: number) => void): Img {
  const out = newImg(w, h)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) fn((x + 0.5) / w, v, out.d, (y * w + x) * 4)
  }
  return out
}

export function deepGlow2(input: Img, p: DeepGlow2Params, gain = 1): Img {
  const W = input.w
  const H = input.h
  const g = p.gammaCorrect ? p.gammaValue : 1
  const s = new Float32Array(4)
  const s2 = new Float32Array(4)
  // preprocess (view = Final Render)
  const thr = pass(W, H, (u, v, o, i) => {
    sample(input, u, v, s)
    for (let c = 0; c < 3; c++) {
      let t = s[c]
      if (t < p.threshold) t = (t / p.threshold) * t * p.thresholdSmooth
      o[i + c] = p.gammaCorrect ? pw(t, p.gammaValue) : t
    }
    o[i + 3] = p.gammaCorrect ? pw(s[3], p.gammaValue) : s[3]
  })
  const N = 8
  const radius = p.radius * 5
  const rf = radius / 500
  const mapSteps = radius < 500 ? 1 : 1 + 1.5 * ((radius - 500) / 1500)
  const stepsMult = p.stepsMult * mapSteps
  const iters = Math.floor(p.glowIter)
  const gold = [1, 1]
  for (let i = 2; i < N; i++) gold.push(gold[i - 1] + gold[i - 2])
  const mx = Math.max(W, H)
  const aspect = [W / mx, H / mx]
  const ratio = Math.min(2, Math.max(0, p.ratio))
  const stepsInt = Math.max(1, Math.floor(1 / p.downSample))
  const gauss = (x: number, sg: number) => Math.exp(-(x * x) / (2 * sg * sg)) / (2.5066282749176025 * sg)
  const blur = (src: Img, angleDeg: number, steps: number, stride: number): Img => {
    const a = (angleDeg * Math.PI) / 180
    const r = (p.rotate * Math.PI) / 180
    const dx0 = Math.cos(a) / aspect[0]
    const dy0 = Math.sin(a) / aspect[1]
    // mat2(vec2(c,-s), vec2(s,c)) * v (cot) = (c*x + s*y, -s*x + c*y)
    const dx = Math.cos(r) * dx0 + Math.sin(r) * dy0
    const dy = -Math.sin(r) * dx0 + Math.cos(r) * dy0
    const n = Math.floor(steps)
    const w0 = gauss(0, 4)
    const taps: { t: number; wt: number }[] = []
    for (let t = 1; t < 32 && t < n; t += stepsInt) taps.push({ t, wt: gauss((t / steps) * 15, 4) })
    let sumW = w0
    for (const tp of taps) sumW += tp.wt * 2
    return pass(src.w, src.h, (u, v, o, i) => {
      sample(src, u, v, s)
      let rr = pw(s[0], g) * w0
      let gg = pw(s[1], g) * w0
      let bb = pw(s[2], g) * w0
      for (const tp of taps) {
        const ox = dx * tp.t * stride
        const oy = dy * tp.t * stride
        sample(src, u + ox, v + oy, s)
        sample(src, u - ox, v - oy, s2)
        rr += (pw(s[0], g) + pw(s2[0], g)) * tp.wt
        gg += (pw(s[1], g) + pw(s2[1], g)) * tp.wt
        bb += (pw(s[2], g) + pw(s2[2], g)) * tp.wt
      }
      o[i] = pw(rr / sumW, 1 / g)
      o[i + 1] = pw(gg / sumW, 1 / g)
      o[i + 2] = pw(bb / sumW, 1 / g)
      o[i + 3] = 1
    })
  }
  const outs: Img[] = []
  let cur = thr
  for (let i = 1; i <= Math.min(iters, N); i++) {
    const ds = (i === 1 || i === iters ? 0.5 : 0.25) * p.quality
    const dw = Math.max(1, Math.floor(W * ds))
    const dh = Math.max(1, Math.floor(H * ds))
    const down = pass(dw, dh, (u, v, o, k) => {
      sample(cur, u, v, s)
      o[k] = s[0]
      o[k + 1] = s[1]
      o[k + 2] = s[2]
      o[k + 3] = s[3]
    })
    const maxSteps = Math.min(i * rf, i * 6)
    const st = Math.min(rf * gold[i - 1], maxSteps)
    const stride = (rf * i) / mx / stepsMult
    const bA = blur(blur(down, 0, st * ratio, stride), 90, st * (2 - ratio), stride)
    const opacity = (p.gammaValue / i) * Math.pow(0.05, i / N / i)
    const src = cur
    // comp: u_comp = 1, blendMode Screen; vao/ra deu o khong gian gamma (pow g / pow 1/g)
    cur = pass(W, H, (u, v, o, k) => {
      sample(src, u, v, s)
      sample(bA, u, v, s2)
      const aw = s[3]
      const bw = s2[3]
      const ia = Math.max(aw, 0.001)
      for (let c = 0; c < 3; c++) {
        const p0 = pw(s[c], g)
        const p1 = pw(s2[c], g)
        const A = p0 / ia
        const B = p1 / ia
        const scr = (A - 1) * (1 - B) + 1
        const mixd = scr * opacity + A * (1 - opacity)
        const val = (p0 * (1 - bw) + p1 * (1 - aw) + mixd * (aw * bw)) * p.exposure * gain
        o[k + c] = clamp01(pw(val, 1 / g))
      }
      o[k + 3] = clamp01((bw * (1 - aw) + aw) * p.exposure * gain)
    })
    outs.push(cur)
  }
  // postprocess: u_blurTex = blurTex = ket qua vong le cuoi cung
  let last = outs.length - 1
  if (last % 2 === 1) last -= 1
  const bt = outs[Math.max(0, last)]
  return pass(W, H, (u, v, o, k) => {
    sample(bt, u, v, s)
    sample(input, u, v, s2)
    let r = s[0]
    let gg = s[1]
    let b = s[2]
    let a = s[3]
    if (p.unmult) {
      const m = Math.max(r, gg, b)
      if (m > 0) a = m
      else r = gg = b = a = 0
    }
    // mix(glow, screen(input, glow), srcOpacity)
    const sc = [s2[0], s2[1], s2[2]].map((x, c) => (x - 1) * (1 - [r, gg, b][c]) + 1)
    const sa = -s2[3] * a + (s2[3] + a)
    const so = p.sourceOpacity
    o[k] = r + (sc[0] - r) * so
    o[k + 1] = gg + (sc[1] - gg) * so
    o[k + 2] = b + (sc[2] - b) * so
    o[k + 3] = a + (sa - a) * so
  })
}
