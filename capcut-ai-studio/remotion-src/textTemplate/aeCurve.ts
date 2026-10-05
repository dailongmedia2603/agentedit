// Port 1:1 cua LumiFamily/AETools.lua (GetVal theo aeTime = giay) va keyframe tuyen tinh cua CapCut.
import type { AeKey, CcKey } from './spec'

const TWO_D_SPATIAL = 6415
const THREE_D_SPATIAL = 6413

type Prepared = AeKey & { lenInfo?: number[] }

const bez3 = (p1: number[], p2: number[], p3: number[], p4: number[], t: number) => {
  const u = 1 - t
  return [0, 1, 2].map((i) => (p1[i] ?? 0) * u * u * u + 3 * (p2[i] ?? 0) * u * u * t + 3 * (p3[i] ?? 0) * u * t * t + (p4[i] ?? 0) * t * t * t)
}
const bez2 = (p1: number[], p2: number[], p3: number[], p4: number[], t: number) => {
  const u = 1 - t
  return [0, 1].map((i) => p1[i] * u * u * u + 3 * p2[i] * u * u * t + 3 * p3[i] * u * t * t + p4[i] * t * t * t)
}

const cache = new WeakMap<AeKey[], Prepared[]>()
function prepare(keys: AeKey[]): Prepared[] {
  const hit = cache.get(keys)
  if (hit) return hit
  const out = keys.map((k) => {
    const p = [...k] as Prepared
    if ((k[3]?.[0] === THREE_D_SPATIAL || k[3]?.[0] === TWO_D_SPATIAL) && k[4]?.[0] === 0 && k[2].length >= 4) {
      let p0 = k[2][0]
      let total = 0
      const len: number[] = [0]
      for (let i = 1; i <= 200; i++) {
        const c = bez3(k[2][0], k[2][2], k[2][3], k[2][1], i / 200)
        total += Math.hypot(c[0] - p0[0], c[1] - p0[1])
        p0 = c
        len[i] = total
      }
      for (let i = 1; i <= 200; i++) len[i] = len[i] / (len[200] + 0.000001)
      p.lenInfo = len
    }
    return p
  })
  cache.set(keys, out)
  return out
}

const remap01 = (a: number, b: number, x: number) => (x < a ? 0 : x > b ? 1 : (x - a) / (b - a))

function bezier01X(b: number[], x: number, yLen: number) {
  let ts = 0
  let te = 1
  let times = 1
  do {
    const tm = (ts + te) * 0.5
    const v = bez2([0, 0], [b[0], b[1]], [b[2], b[3]], [1, yLen], tm)
    if (v[0] > x) te = tm
    else ts = tm
    times++
  } while (!(te - ts < 0.001 && times < 50))
  return (te + ts) * 0.5
}
const bezier01 = (b: number[], p: number, yLen: number) => bez2([0, 0], [b[0], b[1]], [b[2], b[3]], [1, yLen], bezier01X(b, p, yLen))[1]
const mix = (a: number, b: number, x: number, type: number) => (type === 1 ? a * (1 - x) + b * x : a + x)

function spatial(len: number[], p1: number[], p2: number[], p3: number[], p4: number[], t: number) {
  let p = 0
  if (t <= 0) p = 0
  else if (t >= 1) p = 1
  else {
    let ts = 0
    let te = 200
    for (let i = 1; i <= 200; i++) {
      if (len[i] >= t) {
        te = i
        ts = i - 1
        break
      }
    }
    p = ts / 200 + (0.005 * (t - len[ts])) / (len[te] - len[ts] + 0.000001)
  }
  return bez3(p1, p2, p3, p4, p)
}

/** AETools:GetVal(name, aeTime) */
export function aeVal(keys: AeKey[], time: number): number[] {
  const content = prepare(keys)
  for (const info of content) {
    const [s, e] = info[1]
    if (time >= s && time < e) {
      const cp = remap01(s, e, time)
      const bz = info[0]
      const vr = info[2]
      let yLen = 1
      if (vr[1][0] === vr[0][0] && info[4]?.[0] === 0 && vr[0].length === 1) yLen = 0
      if (info[4]?.[0] === 2) return [...vr[0]]
      if (bz.length > 4) {
        return [0, 1, 2].map((k) => mix(vr[0][k], vr[1][k], bezier01([bz[k], bz[k + 3], bz[k + 6], bz[k + 9]], cp, yLen), yLen))
      }
      const p = bezier01(bz, cp, yLen)
      if ((info[3]?.[0] === THREE_D_SPATIAL || info[3]?.[0] === TWO_D_SPATIAL) && info[4]?.[0] === 0 && info.lenInfo) {
        const c = spatial(info.lenInfo, vr[0], vr[2], vr[3], vr[1], p)
        return info[3][0] === TWO_D_SPATIAL ? [c[0], c[1]] : c
      }
      return vr[0].map((v, j) => mix(v, vr[1][j], p, yLen))
    }
  }
  if (time < content[0][1][0]) return [...content[0][2][0]]
  return [...content[content.length - 1][2][1]]
}

/** Keyframe CapCut: tuyen tinh, hoac bezier (thoi gian, gia tri) khi co tay nam (FreeCurveIn/Out/InOut) */
export function ccVal(keys: CcKey[] | undefined, t: number, fallback: number): number {
  if (!keys || !keys.length) return fallback
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const k0 = keys[i - 1]
      const k1 = keys[i]
      const [t0, v0] = k0
      const [t1, v1] = k1
      if (t1 === t0) return v1
      const rx = k0[4] ?? 0
      const ry = k0[5] ?? 0
      const lx = k1[2] ?? 0
      const ly = k1[3] ?? 0
      if (!rx && !ry && !lx && !ly) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
      // tay nam khong vuot ra ngoai doan (giu x don dieu nhu trinh chinh cong)
      const x1 = Math.min(t1, t0 + Math.max(0, rx))
      const x2 = Math.max(t0, t1 + Math.min(0, lx))
      const y1 = v0 + ry
      const y2 = v1 + ly
      const bx = (u: number) => {
        const w = 1 - u
        return w * w * w * t0 + 3 * w * w * u * x1 + 3 * w * u * u * x2 + u * u * u * t1
      }
      let lo = 0
      let hi = 1
      for (let n = 0; n < 40; n++) {
        const m = (lo + hi) / 2
        if (bx(m) < t) lo = m
        else hi = m
      }
      const u = (lo + hi) / 2
      const w = 1 - u
      return w * w * w * v0 + 3 * w * w * u * y1 + 3 * w * u * u * y2 + u * u * u * v1
    }
  }
  return keys[keys.length - 1][1]
}
