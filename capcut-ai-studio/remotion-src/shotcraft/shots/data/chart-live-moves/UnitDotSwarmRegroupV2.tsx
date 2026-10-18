// unit-dot-swarm-regroup-v2 —— 单位点阵重组：320 个点（每点 ≈ 40 次渲染）三幕迁徙——
// 散布 → 按片型聚成三簇 → 列队成柱 → 拼成大数字「12,847」。同一批点，观众能跟着某一颗看它归队。
//
// 第二轮重设计（瓷白 · 信息图发布镜头）：
// - look = porcelain（冷白 · 钴蓝）。三组配色只用一个强调色：Promo 雾蓝灰 / Launch film 钴蓝（主角）/ Explainer 深海军蓝。
// - 点改成 20px 实心小珠（顶部受光微渐变 + 贴地软影），高速迁徙时按速度沿运动方向拉成胶囊（速度感），停下变回圆。
// - 文字层级：左上眉题（video-shotcraft 标志 + 字标 · Renders · Q3 2026）+ 84px 叙事标题，每幕换一句
//   （Every dot is 40 renders → Split by format → Stacked by format → Total renders），旧句上推出、新句从线下升起；
//   簇标签 / 柱顶数值 60px，片型名 32px。
// - 终幕：数字点按弧长连续分配给三组（Promo 拼出 12,8 / Launch film 接上 4 / Explainer 收尾 7），
//   数字本身就是一根构成条；下方三枚图例把颜色含义留在海报上。
//
// 时间表（30fps，共 192f）：
//   0–20    开场：点从画面中心向外逐颗弹出（按距中心错峰，先密后疏）并缓慢漂浮；标题升起
//   24–48   第一幕迁徙 → 三簇（随机错峰 8f，spring stiffness 150 / damping 13）；38f 起簇标签浮现
//   62–86   第二幕 → 三根柱（按行自底向上码放，越往上越快）；76f 起柱顶数值 + 套餐名
//   100–128 第三幕 → 数字（按目标 x 自左向右扫入）；118f 起图例与标题落定
//   128–192 hold 64f：极缓推镜 1 → 1.02
//
// [Agent Edit] o chu (so lieu tu loi noi): kicker, groups (2-3 ten nhom) + values (so cua tung nhom; so cham moi nhom
// ti le theo so), total (so lon cham ghep thanh — chi chu so va . , % + - K M x; khong co -> tong cac nhom), unit
// (vd "người dùng" -> "Mỗi chấm ≈ 40 người dùng"), h1..h4 (4 cau ke theo tung man; h1/h4 tu sinh tu unit neu bo trong).
// Chu so cham: bo net don 0-9 tu ve (cung kieu "12,847" goc), lay mau deu theo do dai net, hang doi theo phap tuyen;
// so ngan -> net day hon (them hang) de 320 cham van khong chong len nhau. Khung doc (native): cham to hon (R 16),
// 3 cot rong hon, tieu de to + xuong dong, chu thich xep doc; ca khoi can giua theo chieu cao.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { balance2, fmtBare, parseNum, realValue } from './numfmt';

export const UNIT_DOT_SWARM_REGROUP_V2_DURATION = 192;

const L = LOOKS.porcelain;
const N = 320;

const M1 = 24;
const M2 = 62;
const M3 = 100;
const DUR = 24;
const STAG = 8;

const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
type P2 = [number, number];

const toRgb = (h: string): number[] => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(h.trim());
  if (!m) return [91, 128, 255];
  const f = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((k) => parseInt(f.slice(k, k + 2), 16));
};
const mixHex = (a: string, b: string, t: number) => {
  const A = toRgb(a);
  const B = toRgb(b);
  return '#' + A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join('');
};
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ── 单线字形（字框 0..200 × 22..258，基线 258；与原版 "12,847" 同一套骨架）──
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48, ry = r): P2[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + ry * Math.sin(a)];
  });
const qb = (p0: P2, p1: P2, p2: P2, n = 24): P2[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });
const GLYPH: Record<string, { w: number; strokes: P2[][] }> = {
  '0': { w: 200, strokes: [arc(100, 140, 76, -90, 270, 64, 118)] },
  '1': { w: 200, strokes: [[[58, 64], [112, 22], [112, 258]], [[52, 258], [172, 258]]] },
  '2': { w: 200, strokes: [[...arc(100, 86, 64, 198, 378), [36, 258], [172, 258]]] },
  '3': { w: 200, strokes: [[...arc(100, 82, 58, 200, 450, 40), ...arc(100, 196, 62, -90, 160, 44).slice(1)]] },
  '4': { w: 200, strokes: [[[142, 258], [142, 22], [26, 188], [118, 188]], [[164, 188], [200, 188]]] },
  '5': { w: 200, strokes: [[[166, 24], [50, 24], [37, 124], ...arc(96, 178, 80, -138, 140, 48).slice(1)]] },
  '6': { w: 200, strokes: [[...qb([150, 26], [34, 84], [30, 186]), ...arc(100, 186, 70, 180, 540, 56).slice(1)]] },
  '7': { w: 200, strokes: [[[26, 24], [176, 24], [84, 258]]] },
  '8': { w: 200, strokes: [arc(100, 76, 53, -90, 270, 56), arc(100, 198, 62, -90, 270, 64)] },
  '9': { w: 200, strokes: [[...arc(100, 94, 70, 0, 360, 56), ...qb([170, 94], [168, 196], [52, 258]).slice(1)]] },
  ',': { w: 46, strokes: [[[22, 236], [4, 290]]] },
  '.': { w: 40, strokes: [[[24, 232], [14, 266]]] },
  '%': { w: 200, strokes: [arc(44, 66, 38, 0, 360, 36), [[170, 24], [30, 258]], arc(156, 214, 38, 0, 360, 36)] },
  '+': { w: 200, strokes: [[[100, 66], [100, 234]], [[16, 150], [184, 150]]] },
  '-': { w: 160, strokes: [[[20, 150], [140, 150]]] },
  K: { w: 200, strokes: [[[30, 22], [30, 258]], [[172, 22], [30, 172]], [[84, 118], [180, 258]]] },
  M: { w: 210, strokes: [[[20, 258], [20, 22], [105, 190], [190, 22], [190, 258]]] },
  X: { w: 200, strokes: [[[30, 22], [170, 258]], [[170, 22], [30, 258]]] },
};
const ADV = 32; // 字间距
const glyphText = (s: string) =>
  Array.from(s.replace(/[−–]/g, '-').replace(/[kK]/g, 'K').replace(/[mM]/g, 'M').replace(/[xX×]/g, 'X'))
    .filter((c) => GLYPH[c])
    .join('');
// 原版 "12,847"（GS 1.08）的骨架总长：320 点 = 160 采样 × 双排，以此为点距基准
const rawOf = (s: string) => {
  let x = 0;
  let len = 0;
  const strokes: P2[][] = [];
  for (const c of s) {
    const g = GLYPH[c];
    g.strokes.forEach((st) => {
      strokes.push(st.map(([a, b]) => [a + x, b] as P2));
      for (let k = 0; k < st.length - 1; k++) len += Math.hypot(st[k + 1][0] - st[k][0], st[k + 1][1] - st[k][1]);
    });
    x += g.w + ADV;
  }
  return { strokes, width: Math.max(1, x - ADV), len };
};
const LEN0 = rawOf('12,847').len * 1.08;

// 骨架 → N 个点：等弧长采样 S 个，每个采样沿法向排 rows 排（排距 21·k）
const digitPoints = (s: string, k: number, maxW: number, maxGS: number, cx: number, cy: number) => {
  const raw = rawOf(s);
  const GS = Math.min(maxW / raw.width, maxGS);
  const len = raw.len * GS;
  const rows = Math.max(2, Math.min(6, Math.floor((LEN0 * k * 2) / Math.max(1, len))));
  const S = Math.ceil(N / rows);
  const gx = cx - (raw.width * GS) / 2;
  const gy = cy - (140 + 18) * GS; // 字形视觉中心 ≈ y 140（逗号下伸不计）
  const segs: Array<{ a: P2; b: P2; len: number }> = [];
  raw.strokes.forEach((st) => {
    for (let q = 0; q < st.length - 1; q++) {
      const a: P2 = [gx + st[q][0] * GS, gy + st[q][1] * GS];
      const b: P2 = [gx + st[q + 1][0] * GS, gy + st[q + 1][1] * GS];
      segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  });
  const total = segs.reduce((t, x) => t + x.len, 0);
  const out: P2[] = [];
  let si = 0;
  let acc = 0;
  const gap = 21 * k;
  for (let q = 0; q < S && out.length < N; q++) {
    const target = ((q + 0.5) / S) * total;
    while (si < segs.length - 1 && acc + segs[si].len < target) acc += segs[si++].len;
    const { a, b, len: sl } = segs[si];
    const u = sl > 0 ? (target - acc) / sl : 0;
    const nx = -(b[1] - a[1]) / (sl || 1);
    const ny = (b[0] - a[0]) / (sl || 1);
    const x = a[0] + (b[0] - a[0]) * u;
    const y = a[1] + (b[1] - a[1]) * u;
    for (let r = 0; r < rows && out.length < N; r++) {
      const o = (r - (rows - 1) / 2) * gap;
      out.push([x + nx * o, y + ny * o]);
    }
  }
  return { pts: out, x0: gx, w: raw.width * GS, h: 236 * GS };
};

// 叙事标题：逐词从线下升起（遮罩上 0.32em / 下 0.26em 留白：越南语叠加声调不被裁）、上推出
const Rise: React.FC<{ text: string; inF: number; outF?: number; g: number; style: React.CSSProperties }> = ({ text, inF, outF, g, style }) => {
  const frame = useCurrentFrame();
  const ws = text.split(/\s+/).filter(Boolean);
  const outE = outF !== undefined ? EASE.exit(Math.min(1, Math.max(0, (frame - outF) / 10))) : 0;
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {ws.map((w, i) => {
        const p = EASE.snappy(Math.min(1, Math.max(0, (frame - inF - i * g) / 16)));
        const d = 1 - p + outE;
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.24em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${(d * 105).toFixed(2)}% + ${(d * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

export const UnitDotSwarmRegroupV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;

  // ── 文案 / 数据 ──
  const kicker = useText('kicker', 'Người dùng · Quý 3/2026');
  const unit = useText('unit', 'người dùng');
  const namesIn = useList('groups', ['Khách mới', 'Quay lại', 'Giới thiệu']);
  const valsIn = useList('values', ['7.210', '4.102', '1.535']);
  const G = Math.max(2, Math.min(3, namesIn.length));
  const names = Array.from({ length: G }, (_, g) => namesIn[g] ?? '');
  const valsS = Array.from({ length: G }, (_, g) => (valsIn[g] ?? '').trim());
  const valsN = valsS.map((v) => parseNum(v, 1));
  const sum = valsN.reduce((t, v) => t + Math.max(0, realValue(v)), 0);
  const totalS = useText('total', fmtBare(sum, valsN[0], Math.max(...valsN.map((v) => v.dec))));
  const totalN = parseNum(totalS, sum);
  const per = realValue(totalN) / N;
  const perS = fmtBare(per, totalN, per >= 10 ? 0 : per >= 1 ? 1 : 2);
  const h1 = useText('h1', unit ? `Mỗi chấm là ${perS} ${unit}` : 'Mỗi chấm là một con số');
  const h2 = useText('h2', 'Chia theo nhóm');
  const h3 = useText('h3', 'Xếp thành cột');
  const h4 = useText('h4', unit ? `Tổng ${unit}` : 'Tổng cộng');
  const digits = glyphText(totalS) || glyphText(fmtBare(sum, valsN[0])) || '0';

  // 各组点数：按数值比例分配（每组 ≥ 14 颗），最大余数法凑满 N
  const minPer = 14;
  const weights = valsN.map((v) => Math.max(0, realValue(v)));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const quota = weights.map((w) => minPer + ((N - minPer * G) * w) / wsum);
  const GROUP_N = quota.map(Math.floor);
  let rest = N - GROUP_N.reduce((a, b) => a + b, 0);
  quota.map((q, g) => [q - Math.floor(q), g]).sort((a, b) => b[0] - a[0]).forEach(([, g]) => {
    if (rest > 0) {
      GROUP_N[g]++;
      rest--;
    }
  });
  const START = GROUP_N.map((_, g) => GROUP_N.slice(0, g).reduce((a, b) => a + b, 0));
  const groupOf = (i: number) => (i < START[1] ? 0 : G > 2 && i >= START[2] ? 2 : 1);
  const idxIn = (i: number) => i - START[groupOf(i)];
  const FOCUS = 1; // 第二组 = 主角（强调色）
  const ACC0 = mixHex(L.accent, '#ffffff', 0.12);
  const ACC1 = mixHex(L.accent, '#000000', 0.18);
  const COL: Array<[string, string]> = [
    ['#b9c3da', '#97a3c0'], // 雾蓝灰
    [ACC0, ACC1], // 强调色（主角）
    ['#2b3554', '#121a33'], // 深海军蓝
  ];

  // ── 版式（横向 = 原版坐标；纵向 = 点放大 1.6×、整块按画面高度居中）──
  const k = portrait ? 1.6 : 1;
  const R = 10 * k;
  const VOGEL = 12.6 * k;
  const SP = 23 * k;
  const headTop = portrait ? 230 : 92;
  const hSize0 = portrait ? 150 : 84;
  const hMaxW = portrait ? 1740 : 1740;
  const heads = [h1, h2, h3, h4];
  const headLines = heads.map((h) => {
    const one = fitSize(h, { family: fonts.sans, size: hSize0, maxWidth: hMaxW, weight: 760, minSize: hSize0 * 0.8 });
    if (measureText(h, fonts.sans, one, 760) <= hMaxW) return { lines: [h], size: one };
    const two = wrapLines(h, fonts.sans, hSize0 * 0.8, hMaxW, 760, 2);
    const bal = two.length === 2 ? balance2(h.split(/\s+/).filter(Boolean), (t) => measureText(t, fonts.sans, hSize0 * 0.8, 760)) ?? two : two;
    const sz = Math.min(...bal.map((l) => fitSize(l, { family: fonts.sans, size: hSize0 * 0.8, maxWidth: hMaxW, weight: 760, minSize: 36 })));
    return { lines: bal, size: sz };
  }).map((h, hi) => {
    // 词间错峰按词数压缩：最后一个词要在被下一句推走前 ≥4f 完全升起（每词 16f）
    const inF = [2, M1 + 14, M2 + 12, M3 + 14][hi];
    const outF = [M1 + 4, M2 + 2, M3 + 2, undefined][hi];
    const nw = h.lines.join(' ').split(/\s+/).filter(Boolean).length;
    const room = (outF ?? 150) - inF - 20;
    return { ...h, inF, outF, g: Math.max(0.4, Math.min(3, room / Math.max(1, nw - 1))) };
  });
  const headBottom = headTop + (portrait ? 96 : 60) + Math.max(...headLines.map((h) => h.lines.length * h.size * 1.16));
  const mid = portrait ? Math.round((headBottom + SH - 120) / 2) : 650;
  const colX = portrait ? (G === 3 ? [380, 960, 1540] : [620, 1300]) : G === 3 ? [520, 1000, 1420] : [700, 1220];
  const CY = portrait ? mid - 120 : 650;
  const BASE = portrait ? mid + 600 : 900;
  const maxRows = portrait ? 30 : 22;
  const cols = GROUP_N.map((n) => Math.max(8, Math.ceil(n / maxRows)));
  const scatterBox = portrait ? { x: 140, w: 1640, y: mid - 820, h: 1640 } : { x: 200, w: 1520, y: 330, h: 640 };
  const legSize0 = portrait ? 66 : 36;
  const digPre = digitPoints(digits, k, portrait ? 1720 : 1700, portrait ? 2.5 : 1.4, 960, 0);
  // 纵向终幕：数字 + 图例 + 脚注整块居中
  const finalBlock = digPre.h + 150 + G * legSize0 * 1.5 + 40 + 70;
  const digitCY = portrait ? Math.round(mid - finalBlock / 2 + digPre.h / 2) : 523;
  const DIG = digitPoints(digits, k, portrait ? 1720 : 1700, portrait ? 2.5 : 1.4, 960, digitCY);
  const DIGIT = DIG.pts;
  const legendTop = portrait ? digitCY + DIG.h / 2 + 150 : 790;

  // ── 每颗点的三幕目标 ──
  const scatter = (i: number): P2 => [
    scatterBox.x + ((rnd(i, 1) + rnd(i, 11)) / 2) * scatterBox.w,
    scatterBox.y + ((rnd(i, 2) + rnd(i, 12)) / 2) * scatterBox.h,
  ];
  const drift = (i: number, f: number): P2 => [9 * k * Math.sin(f / 21 + rnd(i, 8) * 6.28), 7 * k * Math.cos(f / 27 + rnd(i, 9) * 6.28)];
  // 第 1 幕：三簇（向日葵螺旋紧密排布：等面积、不重叠）
  const CR = GROUP_N.map((n) => VOGEL * Math.sqrt(n) + R);
  const cluster = (i: number): P2 => {
    const g = groupOf(i);
    const kk = idxIn(i) + 0.5;
    const r = VOGEL * Math.sqrt(kk);
    const a = kk * 2.39996 + g;
    return [colX[g] + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  // 第 2 幕：柱（cols 列网格自底向上）
  const row = (i: number) => Math.floor(idxIn(i) / cols[groupOf(i)]);
  const bar = (i: number): P2 => {
    const g = groupOf(i);
    return [colX[g] + ((idxIn(i) % cols[g]) - (cols[g] - 1) / 2) * SP, BASE - R - row(i) * SP];
  };
  const barTop = (g: number) => BASE - R - (Math.ceil(GROUP_N[g] / cols[g]) - 1) * SP;
  const stagOf = (i: number, phase: 0 | 1 | 2) => {
    if (phase === 0) return rnd(i, 7) * STAG;
    if (phase === 1) {
      const rows = Math.ceil(GROUP_N[groupOf(i)] / cols[groupOf(i)]);
      return Math.sqrt(row(i) / Math.max(1, rows - 1)) * STAG + rnd(i, 13) * 2;
    }
    return ((DIGIT[i][0] - DIG.x0) / Math.max(1, DIG.w)) * (STAG + 4) + rnd(i, 14) * 1.5;
  };
  const posAt = (i: number, f: number): P2 => {
    const mig = (start: number, phase: 0 | 1 | 2) =>
      spring({ frame: f - start - stagOf(i, phase), fps: 30, config: { damping: 13, stiffness: 150, mass: 0.8 }, durationInFrames: DUR, durationRestThreshold: 0.0001 });
    const d = drift(i, f);
    const s0 = scatter(i);
    let p: P2 = [s0[0] + d[0], s0[1] + d[1]];
    p = lerp2(p, cluster(i), mig(M1, 0));
    p = lerp2(p, bar(i), mig(M2, 1));
    p = lerp2(p, DIGIT[i], mig(M3, 2));
    return p;
  };
  // 开场弹出顺序：按距中心
  const scx = scatterBox.x + scatterBox.w / 2;
  const scy = scatterBox.y + scatterBox.h / 2;
  const popDelay = (i: number) => {
    const s0 = scatter(i);
    const d = Math.hypot(s0[0] - scx, (s0[1] - scy) * (portrait ? 1 : 1.6)) / (900 * (portrait ? 1.1 : 1));
    return EASE.out(Math.min(1, d)) * 10;
  };

  const cam = mix(1, 1.02, ramp(frame, M3 + 20, UNIT_DOT_SWARM_REGROUP_V2_DURATION - M3 - 20, EASE.smooth));
  const clusterOp = Math.min(ramp(frame, 38, 12, EASE.out), 1 - ramp(frame, M2 - 2, 8, EASE.exit));
  const barOp = Math.min(ramp(frame, 78, 12, EASE.out), 1 - ramp(frame, M3 - 2, 8, EASE.exit));
  const legendIn = (g: number) => ramp(frame, 120 + g * 4, 14, EASE.snappy);

  // 标签字号
  const colW = portrait ? 540 : 400;
  const nameSize0 = portrait ? 54 : 32;
  const valSize0 = portrait ? 100 : 60;
  const caps = names.every((n) => n.length <= 14);
  const nameTxt = (n: string) => (caps ? n.toUpperCase() : n);
  const nameSz = (n: string) => fitSize(nameTxt(n), { family: fonts.sans, size: nameSize0, maxWidth: colW, weight: 650, minSize: nameSize0 * 0.55 });
  const valSz = (v: string) => fitSize(v, { family: fonts.sans, size: valSize0, maxWidth: colW, weight: 750, minSize: valSize0 * 0.5 });
  // 图例：横向一行（放不下整体缩字）；纵向竖排
  const legW = names.reduce((t, n, g) => t + 22 + 16 + measureText(n, fonts.sans, legSize0, 650) + 16 + measureText(valsS[g], fonts.sans, legSize0, 450), 0) + 64 * (G - 1);
  const legSize = portrait ? Math.min(legSize0, ...names.map((n, g) => fitSize(`${n}  ${valsS[g]}`, { family: fonts.sans, size: legSize0, maxWidth: 1600, weight: 650, minSize: 36 }))) : legW > 1760 ? Math.max(22, (legSize0 * 1760) / legW) : legSize0;
  const footSize = portrait ? 54 : 32;
  const foot = unit ? `Mỗi chấm ≈ ${perS} ${unit}` : '';
  const legendRows = portrait ? G : 1;
  const footTop = legendTop + (portrait ? legendRows * legSize * 1.5 + 40 : 72);

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.3 }} fill={null} />

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: `50% ${portrait ? mid - 200 : SH * 0.52}px` }}>
        {/* 眉题 + 叙事标题 */}
        <div style={{ position: 'absolute', left: 96, right: 96, top: headTop, display: 'flex', alignItems: 'center', gap: 12 * k, ...type(32 * k, 650), color: L.ink3, opacity: ramp(frame, 0, 12, EASE.out), whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {BRAND.name ? (
            <>
              <ShotcraftMark size={38 * k} tone="light" style={{ marginTop: -2 }} />
              <span style={{ fontFamily: BRAND.font, fontWeight: 700, letterSpacing: '0.03em', color: L.ink }}>{BRAND.name}</span>
              {kicker ? <span>·</span> : null}
            </>
          ) : null}
          <span style={{ fontSize: fitSize(kicker, { family: fonts.sans, size: 32 * k, maxWidth: 1728 - (BRAND.name ? measureText(BRAND.name, fonts.sans, 32 * k, 700) + 90 * k : 0), weight: 650, minSize: 20 }) }}>{kicker}</span>
        </div>
        <div style={{ position: 'absolute', left: 90, top: headTop + (portrait ? 96 : 60), color: L.ink }}>
          {headLines.map((h, hi) => (
            <React.Fragment key={hi}>
              {h.lines.map((l, li) => (
                <Rise
                  key={li}
                  text={l}
                  inF={h.inF + h.lines.slice(0, li).join(' ').split(/\s+/).filter(Boolean).length * h.g}
                  g={h.g}
                  outF={h.outF}
                  style={{ position: 'absolute', left: 0, top: li * h.size * 1.16, ...type(h.size, 760), lineHeight: 1.16 }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* 簇标签 */}
        {clusterOp > 0.01 && names.map((n, g) => (
          <div key={g} style={{
            position: 'absolute', left: colX[g] - colW / 2, top: CY - CR[g] - (nameSize0 + valSize0) * 1.42, width: colW, textAlign: 'center', whiteSpace: 'nowrap',
            opacity: clusterOp, transform: `translateY(${mix(14, 0, ramp(frame, 38 + g * 3, 14, EASE.snappy)).toFixed(2)}px)`,
          }}>
            <div style={{ ...type(nameSz(n), 650), lineHeight: 1.3, letterSpacing: '0.02em', color: g === FOCUS ? L.accent : L.ink2 }}>{nameTxt(n)}</div>
            <div style={{ ...type(valSz(valsS[g]), 750), lineHeight: 1.15, color: g === FOCUS ? L.accent : L.ink, marginTop: 4 }}>{valsS[g]}</div>
          </div>
        ))}

        {/* 柱：基线 + 柱顶数值 + 组名 */}
        <div style={{
          position: 'absolute', left: colX[0] - (portrait ? 300 : 220), width: colX[G - 1] - colX[0] + (portrait ? 600 : 440), top: BASE + 2, height: 3 * k, borderRadius: 2, background: L.ink,
          transform: `scaleX(${Math.min(ramp(frame, M2 + 4, 18, EASE.snappy), 1 - ramp(frame, M3 - 2, 10, EASE.exit))})`, transformOrigin: '0% 50%',
          opacity: 0.85,
        }} />
        {barOp > 0.01 && names.map((n, g) => (
          <React.Fragment key={g}>
            <div style={{
              position: 'absolute', left: colX[g] - colW / 2, top: barTop(g) - R - valSize0 * 1.5, width: colW, textAlign: 'center', whiteSpace: 'nowrap', ...type(valSz(valsS[g]), 750), lineHeight: 1.15,
              color: g === FOCUS ? L.accent : L.ink, opacity: barOp, transform: `translateY(${mix(16, 0, ramp(frame, 78 + g * 3, 14, EASE.snappy)).toFixed(2)}px)`,
            }}>{valsS[g]}</div>
            <div style={{
              position: 'absolute', left: colX[g] - colW / 2, top: BASE + 22 * k, width: colW, textAlign: 'center', whiteSpace: 'nowrap', ...type(nameSz(n), 650), lineHeight: 1.3, letterSpacing: '0.02em',
              color: g === FOCUS ? L.accent : L.ink2, opacity: barOp,
            }}>{nameTxt(n)}</div>
          </React.Fragment>
        ))}

        {/* 点 */}
        {Array.from({ length: N }, (_, i) => {
          const p = posAt(i, frame);
          const q = posAt(i, frame - 1);
          const vx = p[0] - q[0];
          const vy = p[1] - q[1];
          const sp = Math.hypot(vx, vy);
          const stretch = Math.min(sp * 0.45, 20 * k); // 速度拉伸（px）
          const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
          const pop = spring({ frame: frame - popDelay(i), fps: 30, config: { damping: 12, stiffness: 200 } });
          const g = groupOf(i);
          const w = 2 * R + stretch;
          // 落进数字后统一收拢成强调色（数字是终幕主角；构成信息交给下方图例）
          const land = ramp(frame, M3 + stagOf(i, 2) + 10, 12, EASE.out);
          const c0 = land > 0 ? mixHex(COL[g][0], ACC0, land) : COL[g][0];
          const c1 = land > 0 ? mixHex(COL[g][1], ACC1, land) : COL[g][1];
          return (
            <div key={i} style={{
              position: 'absolute', left: p[0] - w / 2, top: p[1] - R, width: w, height: 2 * R, borderRadius: R,
              background: `linear-gradient(180deg, ${c0}, ${c1})`,
              boxShadow: `0 ${(2 + stretch * 0.05).toFixed(1)}px ${(4 + stretch * 0.1).toFixed(1)}px ${alpha(L.shadow, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
              transform: `rotate(${sp > 0.3 ? ang.toFixed(2) : 0}deg) scale(${pop.toFixed(4)}, ${(pop * (1 - Math.min(stretch / (120 * k), 0.18))).toFixed(4)})`,
            }} />
          );
        })}

        {/* 图例 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: legendTop, display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: portrait ? legSize * 0.5 : 64 }}>
          {names.map((n, g) => (
            <div key={g} style={{
              display: 'flex', alignItems: 'center', gap: 16 * k, opacity: legendIn(g), whiteSpace: 'nowrap',
              transform: `translateY(${mix(18, 0, legendIn(g)).toFixed(2)}px)`,
            }}>
              <span style={{ width: legSize * 0.6, height: legSize * 0.6, borderRadius: legSize, background: `linear-gradient(180deg, ${COL[g][0]}, ${COL[g][1]})` }} />
              <span style={{ ...type(legSize, 650), lineHeight: 1.3, color: g === FOCUS ? L.accent : L.ink }}>{n}</span>
              <span style={{ ...type(legSize, 450), lineHeight: 1.3, color: L.ink2 }}>{valsS[g]}</span>
            </div>
          ))}
        </div>
        {foot ? (
          <div style={{
            position: 'absolute', left: 96, right: 96, top: footTop, textAlign: 'center', whiteSpace: 'nowrap', ...type(fitSize(foot, { family: fonts.sans, size: footSize, maxWidth: 1728, weight: 500, minSize: 22 }), 500), lineHeight: 1.3, color: L.ink3,
            opacity: ramp(frame, 132, 14, EASE.out),
          }}>
            {foot}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
