// letterspace-materialize v3 —— 按批次 11 用户意见修正（截图 superhuman，4 张）：
// ① 字形比例改宽：v2 竖长（60x100），对照终态截图字高≈50/字宽≈58（宽高比≈1.15），
//    v3 重绘全部骨架字形到 78x64 视框（字面 58x54），方正略宽 + 细笔画 + 大字距；
// ② 所有字母同时开始同时完成：去掉 v2 的逐字错峰（PER/jitter），全字符同一帧起笔、
//    pathLength 归一保证不同笔画长度的字母在同一帧齐收（截图 2/3 的全行并行半截态）。
// v4 质感：底景从"三块模糊色块"重做为暮色湖景——分层天空渐变 + 两层程序山脊（大气透视：远淡近深）
//    + 宽幅地平线霞光（铺出画外，不露光带两端）+ 水面（天光倒影 + 缓慢漂移的细波光）+ 字标水面倒影；
//    颗粒防渐变色带；背景极缓推近 3%（远山/近山不同速，微视差），字标本身不位移。
// 品牌轮：SUPERHUMAN → video-shotcraft（全小写字标），字形库换成 13 个几何小写骨架字形（见 GLYPHS），
//    描画节奏、同步齐收、底景与时长不变。
//
// [Agent Edit] o chu: name (chu duoc "ket tinh" — ten san pham / kenh / tu khoa; trong -> ten thuong hieu video).
// Bo net xuong mo rong: du a-z, so, dau cau thuong gap + toan bo dau tieng Viet (sac huyen hoi nga nang, ^, (, moc, đ)
// ve SAU net chu trong cung 1 path (pathLength = 1) -> moi ky tu van cung khung bat dau / cung khung xong (khong lech).
// Chu hoa -> chu thuong (phong chu "toan chu thuong" cua the). Chu dai: tu xuong dong theo tu (2 dong ngang / 3 dong doc),
// co chu + khoang chu thu theo be ngang that; net giu manh (5.5px), khung doc net day hon chut cho de doc.
// Khung doc (native): bau troi + nui + mat nuoc ve theo chieu cao that (duong chan troi ~56%), chu to hon (~2x).
import { useCurrentFrame, useText, useVideoConfig, useBackdrop } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { bezier, ramp, EASE, Grain, Vignette } from '../../../fixtures/Polish';
import { BRAND } from '../../../fixtures/Brand';

// 品牌轮：字标换成 video-shotcraft（品牌规范要求全小写），骨架字形重绘为几何小写单线体。
// 统一 64 高视框：基线 y=59、x 高 y=22、升部 y=5（与原大写字面同高），每个字形有自己的宽度 w；
// 渲染时整体 ×GLYPH_SCALE 放大（小写 x 高比大写矮，放大后与原 SUPERHUMAN 字标同等存在感、整行宽度相近），
// 笔画宽度反向缩放，屏幕上仍是 5.5px 细线。子笔画顺序 = 描画顺序。
const GLYPHS: Record<string, { w: number; d: string }> = {
  v: { w: 42, d: 'M 4 22 L 21 59 L 38 22' },
  i: { w: 14, d: 'M 7 22 L 7 59 M 7 9.5 L 7 10' },
  d: { w: 46, d: 'M 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 M 41.5 5 L 41.5 59' },
  e: { w: 46, d: 'M 4.5 40.5 L 41.5 40.5 A 18.5 18.5 0 1 0 37.2 52.4' },
  o: { w: 46, d: 'M 23 22 A 18.5 18.5 0 0 0 23 59 A 18.5 18.5 0 0 0 23 22' },
  '-': { w: 28, d: 'M 5 41 L 23 41' },
  s: { w: 39, d: 'M 32.6 27.5 C 26.4 21.3, 7.9 20.6, 6.2 28.9 C 4.6 36.4, 14.1 38.4, 19.7 39.8 C 25.8 41.2, 34.8 43.9, 33.1 51.5 C 31.4 59, 9.6 60.4, 4 52.8' },
  h: { w: 41, d: 'M 5 5 L 5 59 M 5 38 C 5 27, 12 22, 20.5 22 C 30 22, 36 27, 36 37 L 36 59' },
  t: { w: 26, d: 'M 12 8 L 12 59 M 3 22 L 23 22' },
  c: { w: 42, d: 'M 37.2 28.6 A 18.5 18.5 0 1 0 37.2 52.4' },
  r: { w: 28, d: 'M 5 22 L 5 59 M 5 38 C 5 27, 13 22, 24 23' },
  a: { w: 46, d: 'M 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 M 41.5 22 L 41.5 59' },
  f: { w: 26, d: 'M 23 7 C 17 4, 11 6, 11 14 L 11 59 M 3 22 L 22 22' },
  // [Agent Edit] bo sung du bang chu cai thuong + so + dau cau, cung he hinh hoc (bat tron r 18.5, x-height 22, chan 59)
  b: { w: 46, d: 'M 4.5 5 L 4.5 59 M 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5' },
  g: { w: 46, d: 'M 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 M 41.5 22 L 41.5 62 C 41.5 73, 33 78, 23 78 C 15 78, 9 75, 6 71' },
  j: { w: 18, d: 'M 12 22 L 12 67 C 12 74, 8 78, 2 77 M 12 9.5 L 12 10' },
  k: { w: 38, d: 'M 5 5 L 5 59 M 33 22 L 5 45 M 14 38 L 34 59' },
  l: { w: 14, d: 'M 7 5 L 7 59' },
  m: { w: 62, d: 'M 5 22 L 5 59 M 5 36 C 5 27, 10 22, 18 22 C 26 22, 31 27, 31 36 L 31 59 M 31 36 C 31 27, 36 22, 44 22 C 52 22, 57 27, 57 36 L 57 59' },
  n: { w: 41, d: 'M 5 22 L 5 59 M 5 38 C 5 27, 12 22, 20.5 22 C 30 22, 36 27, 36 37 L 36 59' },
  p: { w: 46, d: 'M 4.5 22 L 4.5 77 M 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5' },
  q: { w: 46, d: 'M 41.5 40.5 A 18.5 18.5 0 0 0 4.5 40.5 A 18.5 18.5 0 0 0 41.5 40.5 M 41.5 22 L 41.5 77' },
  u: { w: 41, d: 'M 5 22 L 5 43 C 5 53, 11 59, 20.5 59 C 30 59, 36 53, 36 43 M 36 22 L 36 59' },
  w: { w: 62, d: 'M 4 22 L 17 59 L 31 27 L 45 59 L 58 22' },
  x: { w: 38, d: 'M 5 22 L 33 59 M 33 22 L 5 59' },
  y: { w: 42, d: 'M 4 22 L 21 60 M 38 22 L 14 77' },
  z: { w: 38, d: 'M 6 22 L 32 22 L 6 59 L 33 59' },
  '0': { w: 44, d: 'M 22 8 C 9 8, 4 21, 4 33.5 C 4 46, 9 59, 22 59 C 35 59, 40 46, 40 33.5 C 40 21, 35 8, 22 8' },
  '1': { w: 28, d: 'M 6 17 L 17 8 L 17 59' },
  '2': { w: 40, d: 'M 5 18 C 7 11, 13 7, 20 7 C 29 7, 35 13, 35 21 C 35 30, 27 36, 5 59 L 36 59' },
  '3': { w: 40, d: 'M 6 14 C 9 9, 14 7, 20 7 C 28 7, 34 12, 34 19 C 34 27, 27 31, 18 31 C 28 31, 36 36, 36 45 C 36 54, 29 60, 20 60 C 13 60, 7 57, 4 51' },
  '4': { w: 42, d: 'M 30 59 L 30 8 L 4 44 L 39 44' },
  '5': { w: 40, d: 'M 34 8 L 10 8 L 7 31 C 11 28, 15 27, 20 27 C 29 27, 36 34, 36 43 C 36 53, 29 60, 20 60 C 13 60, 8 57, 5 52' },
  '6': { w: 42, d: 'M 33 11 C 30 8, 26 7, 22 7 C 11 7, 5 20, 5 38 C 5 52, 11 60, 21 60 C 30 60, 37 53, 37 44 C 37 35, 30 29, 21 29 C 13 29, 7 34, 5 40' },
  '7': { w: 38, d: 'M 4 8 L 34 8 L 14 59' },
  '8': { w: 40, d: 'M 20 32 C 12 32, 7 27, 7 20 C 7 12, 13 7, 20 7 C 27 7, 33 12, 33 20 C 33 27, 28 32, 20 32 C 11 32, 5 38, 5 46 C 5 54, 12 60, 20 60 C 28 60, 35 54, 35 46 C 35 38, 29 32, 20 32' },
  '9': { w: 42, d: 'M 37 27 C 35 33, 29 38, 21 38 C 12 38, 5 31, 5 22 C 5 13, 12 7, 21 7 C 31 7, 37 15, 37 27 C 37 45, 31 60, 19 60 C 14 60, 10 58, 8 55' },
  '.': { w: 12, d: 'M 6 58.5 L 6 59' },
  ',': { w: 12, d: 'M 7 56 L 4 66' },
  '!': { w: 12, d: 'M 6 6 L 6 44 M 6 58.5 L 6 59' },
  '?': { w: 34, d: 'M 5 15 C 7 9, 12 6, 18 6 C 25 6, 30 11, 30 18 C 30 27, 18 29, 18 40 L 18 44 M 18 58.5 L 18 59' },
  ':': { w: 12, d: 'M 6 26 L 6 26.5 M 6 58.5 L 6 59' },
  "'": { w: 10, d: 'M 5 6 L 5 16' },
  '/': { w: 30, d: 'M 26 5 L 4 63' },
  '+': { w: 38, d: 'M 19 26 L 19 54 M 5 40 L 33 40' },
  '%': { w: 46, d: 'M 40 8 L 6 59 M 12 8 A 7 7 0 1 0 12 22 A 7 7 0 1 0 12 8 M 34 45 A 7 7 0 1 0 34 59 A 7 7 0 1 0 34 45' },
  '&': { w: 44, d: 'M 40 59 L 12 28 C 8 23, 9 8, 20 8 C 30 8, 32 20, 24 26 L 12 35 C 5 40, 4 47, 6 52 C 9 59, 22 62, 30 54 L 40 42' },
};
// dau thanh / dau phu tieng Viet (NFD): ve sau net chu (cung pathLength -> van cung khung xong). cx = tam ngang, lift = day len
// khi chong tren mu / trang. Nguyen am co dau ^ / ( -> dau thanh dat cao hon (y 0..8).
const MARK: Record<string, (cx: number, lift: number, w: number) => string> = {
  '\u0301': (c, l) => `M ${c - 3} ${18 - l} L ${c + 5} ${10 - l}`,
  '\u0300': (c, l) => `M ${c - 5} ${10 - l} L ${c + 3} ${18 - l}`,
  '\u0309': (c, l) => `M ${c - 4} ${10 - l} C ${c - 1} ${7 - l}, ${c + 5} ${8 - l}, ${c + 4} ${12 - l} C ${c + 3} ${15 - l}, ${c} ${15 - l}, ${c} ${18 - l}`,
  '\u0303': (c, l) => `M ${c - 9} ${16 - l} C ${c - 6} ${10 - l}, ${c - 2} ${11 - l}, ${c} ${13 - l} C ${c + 2} ${15 - l}, ${c + 6} ${16 - l}, ${c + 9} ${11 - l}`,
  '\u0323': (c) => `M ${c} 68.5 L ${c} 69`,
  '\u0302': (c) => `M ${c - 8} 17 L ${c} 9 L ${c + 8} 17`,
  '\u0306': (c) => `M ${c - 8} 10 C ${c - 7} 16, ${c - 3} 18, ${c} 18 C ${c + 3} 18, ${c + 7} 16, ${c + 8} 10`,
  '\u031B': (_c, _l, w) => `M ${w - 9} 25 C ${w - 3} 23, ${w + 1} 19, ${w} 13`,
};
const ABOVE_BASE = new Set(['\u0302', '\u0306']);
const TONE_ABOVE = new Set(['\u0301', '\u0300', '\u0309', '\u0303']);
const I_NODOT = 'M 7 22 L 7 59';
const D_BAR = ' M 33 13 L 49 13';

type Glyph = { w: number; d: string };
// 1 ky tu (da NFC, chu thuong) -> net xuong (bo chu + dau)
const glyphOf = (ch: string): Glyph => {
  if (ch === 'đ') return { w: 48, d: GLYPHS.d.d + D_BAR };
  const parts = Array.from(ch.normalize('NFD'));
  const base = parts[0];
  const marks = parts.slice(1);
  const g = GLYPHS[base];
  if (!g) return { w: 26, d: '' }; // ky tu khong co trong bo net: de trong (giu khoang)
  let d = g.d;
  let w = g.w;
  const hasAbove = marks.some((m) => ABOVE_BASE.has(m) || TONE_ABOVE.has(m));
  if (base === 'i' && hasAbove) d = I_NODOT;
  const stacked = marks.some((m) => ABOVE_BASE.has(m));
  const cx = base === 'i' ? 7 : base === 'y' ? 21 : g.w / 2;
  for (const m of marks) {
    const f = MARK[m];
    if (!f) continue;
    const lift = TONE_ABOVE.has(m) && stacked ? 10 : 0;
    // dau thanh tren mu ^ / trang: lech phai nhe (kieu chu Viet)
    d += ' ' + f(cx + (lift ? 6 : 0), lift, g.w);
    if (m === '\u031B') w = g.w + 4;
  }
  return { w, d };
};

const BASE_SCALE = 1.3; // 视框 → 屏幕放大倍数（goc）
const TRACK_EM = 30 / BASE_SCALE; // 字距（视框单位）：大字距是本卡身份（goc 30px o scale 1.3）
const SPACE_W = 30; // khoang trang giua cac tu (视框单位, cong them 2 lan TRACK)
const START = 16;   // 全字符统一起画帧（无错峰）
const DUR = 52;     // 全字符统一画完帧数（pathLength 归一→同帧齐收）
export const LETTERSPACE_MATERIALIZE_DURATION = 105; // 静置 16f + 描画 52f + 终态 hold 37f（>1s，R1）

// 描画曲线：起笔缓、中段快、收笔略长（手写的落笔→行笔→收笔）
const strokeEase = bezier(0.5, 0, 0.3, 1);

// 程序山脊：若干正弦叠加的确定性轮廓（无随机源）
const ridge = (seed: number, base: number, amp: number, horizon: number) => {
  const pts: string[] = [];
  for (let x = -60; x <= 1980; x += 20) {
    const y =
      base -
      amp * (0.55 * Math.sin(x / 233 + seed) + 0.3 * Math.sin(x / 97 + seed * 2.1) + 0.15 * Math.sin(x / 41 + seed * 3.7) + 0.6);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M -60 ${horizon + 2} L ${pts.join(' L ')} L 1980 ${horizon + 2} Z`;
};

// 水面细波光：确定性的若干条横向短亮线，缓慢左右漂移（depthPx = 水面深度）
const glints = (horizon: number, depthPx: number) =>
  Array.from({ length: 22 }, (_, i) => {
    const s = Math.sin(i * 91.7) * 43758.5453;
    const r = s - Math.floor(s);
    const s2 = Math.sin(i * 47.3 + 5) * 24634.6345;
    const r2 = s2 - Math.floor(s2);
    const depth = (i + 0.5) / 22; // 0 = 近水天线，1 = 近画面底
    return {
      y: horizon + 8 + depth * depth * (depthPx - 40),
      x: 960 + (r - 0.5) * (500 + depth * 1100),
      w: 40 + r2 * 120 + depth * 160,
      a: 0.05 + (1 - depth) * 0.12,
      ph: r * 6.28,
    };
  });

const lineWidth = (gs: Glyph[]) => gs.reduce((a, g) => a + g.w, 0) + Math.max(0, gs.length - 1) * TRACK_EM;

const Word: React.FC<{ lines: Glyph[][]; e: number; glowAmt: number; scale: number; stroke: number; lineGap: number; halo?: boolean }> = ({ lines, e, glowAmt, scale, stroke, lineGap, halo }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: lineGap }}>
    {lines.map((gs, k) => (
      <div key={k} style={{ display: 'flex', gap: TRACK_EM * scale, alignItems: 'center' }}>
        {gs.map((g, li) => (
          <svg key={li} width={g.w * scale} height={64 * scale} viewBox={`0 0 ${g.w} 64`} style={{ overflow: 'visible', display: 'block' }}>
            {e > 0 && g.d && (
              <path
                d={g.d}
                fill="none"
                stroke="#f6f3fa"
                strokeWidth={stroke / scale}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - e}
                style={{
                  // [Agent Edit] nen anh AI: them bong toi nhe duoi net sang cho de doc tren anh that
                  filter: `drop-shadow(0 0 ${(5 + glowAmt * 10) / scale}px rgba(245,225,240,${0.3 + glowAmt * 0.38}))${halo ? ` drop-shadow(0 ${2 / scale}px ${18 / scale}px rgba(0,0,0,0.55))` : ''}`,
                }}
              />
            )}
          </svg>
        ))}
      </div>
    ))}
  </div>
);

export const LetterspaceMaterialize: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const portrait = H > 1080 * 1.2;
  const nameT = useText('name', '');
  // [Agent Edit] DOT 2: co nen anh AI -> bo canh ho hoang hon ve bang code (troi, nui, mat nuoc, bong chu duoi nuoc,
  // toi goc, hat nhieu); chi con dong chu tu viet tren anh nen
  const bd = useBackdrop();
  const word = (nameT.trim() || BRAND.name || 'xin chào').normalize('NFC').toLocaleLowerCase('vi');

  // ── bo cuc: xuong dong theo tu, chon co chu lon nhat vua be ngang ──
  const maxW = portrait ? 1700 : 1680;
  const maxLines = portrait ? 3 : 2;
  const words = word.split(/\s+/).filter(Boolean).map((w) => Array.from(w).map(glyphOf));
  const spaceG: Glyph = { w: SPACE_W, d: '' };
  const layout = (sc: number, mw = maxW) => {
    const lines: Glyph[][] = [];
    let cur: Glyph[] = [];
    for (const w of words) {
      const cand = cur.length ? [...cur, spaceG, ...w] : w;
      if (cur.length && lineWidth(cand) * sc > mw) {
        lines.push(cur);
        cur = w;
      } else cur = cand;
    }
    if (cur.length) lines.push(cur);
    return lines;
  };
  const target = portrait ? 2.4 : BASE_SCALE;
  let scale = target;
  let lines = layout(scale);
  while ((lines.length > maxLines || Math.max(...lines.map(lineWidth)) * scale > maxW) && scale > 0.5) {
    scale *= 0.95;
    lines = layout(scale);
  }
  // can bang cac dong (tranh dong cuoi chi 1-2 chu)
  if (lines.length > 1) {
    const n = lines.length;
    const total = lineWidth(lines.flatMap((l, i) => (i ? [spaceG, ...l] : l))) * scale;
    for (let mw = total / n; mw <= maxW; mw += 40) {
      const t = layout(scale, mw);
      if (t.length <= n) {
        lines = t;
        break;
      }
    }
  }
  const stroke = Math.max(4.5, Math.min(portrait ? 9 : 6.5, 5.5 * Math.sqrt(scale / BASE_SCALE)));
  const glyphH = 64 * scale;
  const lineGap = 44 * scale;
  const blockH = lines.length * glyphH + (lines.length - 1) * lineGap;

  const HORIZON = portrait ? Math.round(H * 0.63) : 640; // 水天线 y
  const MARK_Y = portrait ? Math.round(Math.min(H * 0.47, HORIZON - blockH / 2 - 130 * (scale / BASE_SCALE))) : 470 - (lines.length - 1) * (glyphH + lineGap) * 0.5; // 字标中心 y
  const FAR_RIDGE = ridge(1.3, HORIZON, portrait ? 110 : 70, HORIZON);
  const NEAR_RIDGE = ridge(4.1, HORIZON + 2, portrait ? 52 : 34, HORIZON);
  const GLINTS = glints(HORIZON, H - HORIZON);
  const hp = (y: number) => `${((y / H) * 100).toFixed(2)}%`;

  // 全字符共享同一进度：同时开始、同时完成
  const e = ramp(frame, START, DUR, strokeEase);
  // 画完瞬间轻微提亮回落（结晶收束）——全字符同帧发生；收笔前 30% 逐渐蓄亮
  const rise = ramp(frame, START + DUR * 0.7, DUR * 0.3, EASE.swift);
  const fall = 1 - ramp(frame, START + DUR, 14, EASE.out);
  const glowAmt = e >= 1 ? fall : rise;

  // 背景极缓推近：远山 1→1.02，近景/水面 1→1.035（微视差）；字标不动
  const push = ramp(frame, 0, LETTERSPACE_MATERIALIZE_DURATION, EASE.smooth);
  const sFar = 1 + 0.02 * push;
  const sNear = 1 + 0.035 * push;
  // 霞光随结晶微微升亮（字标"点亮"了天边）
  const dawn = 0.85 + 0.15 * ramp(frame, START + DUR * 0.5, DUR, EASE.out);
  const skyTop = portrait
    ? `linear-gradient(180deg, #100e2a 0%, #17153a ${hp(HORIZON * 0.35)}, #24204f ${hp(HORIZON * 0.6)}, #3a2f63 ${hp(HORIZON * 0.78)}, #5f4270 ${hp(HORIZON * 0.9)}, #8a5878 ${hp(HORIZON - 14)}, #1c1838 ${hp(HORIZON)}, #0b0a17 100%)`
    : `linear-gradient(180deg, #17153a 0%, #24204f 24%, #3a2f63 42%, #5f4270 53%, #8a5878 ${((HORIZON - 14) / 1080) * 100}%, #1c1838 ${(HORIZON / 1080) * 100}%, #0b0a17 100%)`;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#120f24', overflow: 'hidden' }}>
      {!bd && (
        <>
      {/* 天空 + 远山（远层） */}
      <AbsoluteFill style={{ transform: `scale(${sFar})`, transformOrigin: `50% ${HORIZON}px` }}>
        <AbsoluteFill style={{ background: skyTop }} />
        {/* 宽幅地平线霞光：椭圆铺出画外，两端无断口 */}
        <div
          style={{
            position: 'absolute', left: -480, right: -480, top: HORIZON - (portrait ? 520 : 260), height: portrait ? 1040 : 520, opacity: dawn,
            background: 'radial-gradient(ellipse 50% 50% at 54% 50%, rgba(246,168,170,0.42) 0%, rgba(214,130,160,0.2) 35%, rgba(140,100,170,0.06) 65%, rgba(0,0,0,0) 80%)',
          }}
        />
        <svg width={1920} height={H} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="lm-far" x1="0" y1={HORIZON - 120} x2="0" y2={HORIZON} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#5a4473" />
              <stop offset="1" stopColor="#3e3260" />
            </linearGradient>
          </defs>
          {/* 远山：偏亮、偏霞色（大气透视） */}
          <path d={FAR_RIDGE} fill="url(#lm-far)" opacity={0.75} style={{ filter: 'blur(1.2px)' }} />
        </svg>
      </AbsoluteFill>

      {/* 近山 + 水面（近层，推得更快） */}
      <AbsoluteFill style={{ transform: `scale(${sNear})`, transformOrigin: `50% ${HORIZON}px` }}>
        <svg width={1920} height={H} style={{ position: 'absolute', inset: 0 }}>
          <path d={NEAR_RIDGE} fill="#271f43" />
        </svg>
        {/* 水面：天光倒影（霞光在水里拉长变淡）+ 渐深到画面底 */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: HORIZON, bottom: 0,
            background:
              `radial-gradient(ellipse 46% ${portrait ? 26 : 40}% at 54% 0%, rgba(230,150,165,0.22) 0%, rgba(150,105,160,0.08) 50%, rgba(0,0,0,0) 80%), ` +
              'linear-gradient(180deg, #2a2346 0%, #18142e 30%, #0d0b1a 100%)',
          }}
        />
        {/* 水天线一道极细亮边 */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: HORIZON - 1, height: 2,
            background: 'linear-gradient(90deg, rgba(255,200,210,0) 8%, rgba(255,200,210,0.35) 54%, rgba(255,200,210,0) 92%)',
          }}
        />
        {/* 细波光：缓慢漂移 */}
        {GLINTS.map((g, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', top: g.y, height: portrait ? 2.5 : 1.5, borderRadius: 1, width: g.w,
              left: g.x - g.w / 2 + Math.sin(frame / 38 + g.ph) * 14,
              background: `linear-gradient(90deg, rgba(255,215,225,0), rgba(255,215,225,${(g.a * (0.75 + 0.25 * Math.sin(frame / 23 + g.ph))).toFixed(3)}), rgba(255,215,225,0))`,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* 字标水面倒影：以水天线为轴镜像，低透明 + 轻虚 + 向下渐隐 */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 2 * HORIZON - MARK_Y - blockH / 2, height: blockH,
          display: 'flex', justifyContent: 'center',
          transform: 'scaleY(-1)', opacity: 0.12, filter: 'blur(2.4px)',
          WebkitMaskImage: 'linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.2) 100%)',
          maskImage: 'linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.2) 100%)',
        }}
      >
        <Word lines={lines} e={e} glowAmt={glowAmt * 0.5} scale={scale} stroke={stroke} lineGap={lineGap} />
      </div>
        </>
      )}

      {/* 大字距字标：全字符并行连续描画 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: MARK_Y - blockH / 2, height: blockH, display: 'flex', justifyContent: 'center' }}>
        <Word lines={lines} e={e} glowAmt={glowAmt} scale={scale} stroke={stroke} lineGap={lineGap} halo={!!bd} />
      </div>

      {!bd && <Vignette strength={0.45} inner={0.5} color="#05040c" cy={0.5} />}
      {!bd && <Grain opacity={0.08} blend="soft-light" />}
    </AbsoluteFill>
  );
};
