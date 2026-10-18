// orb-flyline-relay｜光斑飞线接力——氛围层（光斑）与事件层（飞线）同帧共振：飞线落点那一帧，
// 节点背后的光斑一起涨亮一拍，背景给前景"搭腔"。
//
// 第二轮重设计（午夜接力 · 三颗玻璃节点）：
// - look = midnight（深蓝夜 · 电光蓝 · 青）。三张灰卡换成三颗 240px 玻璃节点（三步流程），横向起伏排布（中间高、两边低），飞线是节点之间的
//   一跳一跳的弧——读作"接力"而不是连线图。每颗节点背后各有一团 720–820px 的光斑（电光蓝 / 青 / 堇蓝），
//   连同节点一起轻微漂移。
// - 共振（组合命门）：飞线落点帧 = 节点点亮帧 = 背后光斑 surge 起点帧（同一个常量），光斑 5f 涨到
//   1+1.6 倍亮度并放大 12%、15f 消散；节点同帧描边脉冲 + 一圈冲击环。错开 ≥2f 就读不出"搭腔"。
// - 飞线：白芯 + 青蓝两层辉光，亮头领跑带彗尾，生长曲线起步蓄力、进站减速；到站 4f 后整条线 14f 消散
//   成一串细点虚线（能量已经交出去，只留下路径），与 flyline-arc 的"常驻线"区分。
// - 收束：C 点亮后 72px 标题逐词升起（末词用青色），
//   光斑 110–140f out-sine 收敛冻结，末 25f 真静止。
// - 镜头：全程 1→1.04 极缓推进，焦点随接力从 A 漂到 C（起止无速度突变）。
//
// 时间表（30fps，共 165f）：
//   0–20     光斑亮起，三颗节点错峰升起（0 / 4 / 8f）；A 10f 点亮（自带光斑）
//   22–48    线 1 A→B（26f）
//   48       B 点亮 = B 光斑 surge（同帧）
//   58–82    线 2 B→C（24f）
//   82       C 点亮 = C 光斑 surge（同帧）
//   92–122   标题逐词升起；两条线已消散为细点虚线
//   110–140  光斑漂移 out-sine 收敛冻结
//   140–165  真静止 hold
//
// [Agent Edit] o chu: steps (dung 3 ten buoc A -> B -> C) / subs (3 dong phu duoi ten buoc, tuy chon) / title (cau chot
// cuoi canh, TU CUOI to mau nhan). Icon 3 nut co dinh: micro (noi / nhap) -> lap lanh (AI xu ly) -> may bay giay (gui / xuat).
// Khung doc (portrait.mode = 'native'): 3 nut xep DOC ben trai, ten buoc to ben phai, duong bay vong ra mep trai giua cac nut
// (doc nhu mot timeline 3 buoc); tieu de duoi cung. Khung cong huong (LIT_B / LIT_C) va toan bo nhip giu nguyen.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, wrapLines, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha } from '../../../fixtures/Look';

export const ORB_FLYLINE_RELAY_DURATION = 165; // 5.5s：动作 f98 前结束、光斑 f140 冻结、末 25f 真静止

const L = LOOKS.midnight;
const TAU = Math.PI * 2;

type Pt = { x: number; y: number };
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};
const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};
const grow = bezier(0.45, 0, 0.2, 1);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// 漂移时间：0–110 同速，110–140 out-sine 收敛（起始斜率 = 1），之后冻结
const T0 = 110, TS = 30;
const drift = (f: number) => (f <= T0 ? f : T0 + (2 * TS / Math.PI) * Math.sin((Math.PI / 2) * Math.min(1, (f - T0) / TS)));

// ───────────── 节点 ─────────────
const LIT_B = 48; // 线 1 落点 = B 点亮 = B 光斑 surge
const LIT_C = 82; // 线 2 落点 = C 点亮 = C 光斑 surge

type NodeDef = { x: number; y: number; litAt: number; inAt: number; orb: string; orbSize: number; seed: number; icon: React.ReactNode };
const ICON_STROKE = { fill: 'none', strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const NODE_BASE = [
  {
    x: 400, y: 470, litAt: 10, inAt: 0, orb: '#3d63ff', orbSize: 820, seed: 1,
    icon: <g {...ICON_STROKE}><rect x={-18} y={-44} width={36} height={60} rx={18} /><path d="M-34 0 C -34 22 -18 34 0 34 C 18 34 34 22 34 0 M0 34 V48" /></g>,
  },
  {
    x: 960, y: 380, litAt: LIT_B, inAt: 4, orb: L.accent2, orbSize: 760, seed: 2,
    icon: <g {...ICON_STROKE}><path d="M0 -44 C 4 -14 14 -4 44 0 C 14 4 4 14 0 44 C -4 14 -14 4 -44 0 C -14 -4 -4 -14 0 -44 Z" /><path d="M30 -38 v14 M23 -31 h14" /></g>,
  },
  {
    x: 1520, y: 470, litAt: LIT_C, inAt: 8, orb: '#7f74ff', orbSize: 720, seed: 3,
    icon: <g {...ICON_STROKE}><path d="M-40 4 L 38 -34 L 14 40 L 2 12 Z M2 12 L 38 -34" /></g>,
  },
];

// 涨亮一拍：5f out 起升，15f 消散
const surge = (f: number, at: number) => (f < at ? 0 : f <= at + 5 ? ramp(f, at, 5, EASE.out) : 1 - ramp(f, at + 5, 15, EASE.swift));

const edge = (n: { x: number; y: number }, deg: number, R: number): Pt => ({ x: n.x + R * Math.cos((deg * Math.PI) / 180), y: n.y + R * Math.sin((deg * Math.PI) / 180) });

type LineDef = { start: number; dur: number; p0: Pt; p1: Pt; p2: Pt; p3: Pt; k: number };

// Chu "troi len" tu sau mat na — padding tren 0.5em (chu HOA dau chong: Ắ Ấ) / duoi 0.26em giu dau tieng Viet va chan chu g y.
const RiseLine: React.FC<{ words: { w: string; accent: boolean }[]; start: number; each: number; gap: number; style: React.CSSProperties }> = ({ words, start, each, gap, style }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {words.map((u, i) => {
        const p = EASE.snappy(clamp01((f - start - i * gap) / each));
        return (
          <React.Fragment key={i}>
            {i ? ' ' : ''}
            <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.5em 0.04em 0.26em', margin: '-0.5em -0.04em -0.26em' }}>
              <span style={{ display: 'inline-block', color: u.accent ? L.accent2 : undefined, transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.62).toFixed(3)}em))` }}>{u.w}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const N = 80;
const Flyline: React.FC<{ f: number; ln: LineDef }> = ({ f, ln }) => {
  const { start, dur, p0, p1, p2, p3, k } = ln;
  if (f < start) return null;
  const e = grow(Math.min(1, (f - start) / dur));
  const growing = f < start + dur;
  const fade = 1 - ramp(f, start + dur + 4, 14, EASE.swift); // 到站 4f 后整条消散
  const dots = ramp(f, start + dur + 6, 14, EASE.out); // 留下细点虚线路径
  const pts: Pt[] = [];
  const n = Math.max(2, Math.ceil(e * N) + 1);
  for (let i = 0; i < n; i++) pts.push(bez(p0, p1, p2, p3, Math.min(i / N, e)));
  const head = bez(p0, p1, p2, p3, e);
  pts[pts.length - 1] = head;
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const segs = [];
  if (fade > 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const k = Math.min(i / N, e) / Math.max(e, 0.001);
      segs.push(<line key={i} x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y} stroke="#f2f7ff" strokeWidth={3.2 * k} strokeLinecap="butt" strokeOpacity={(0.12 + 0.88 * k * k) * fade} />);
    }
  }
  const comet = pts.slice(Math.max(0, pts.length - 9)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const full = Array.from({ length: 23 }, (_, i) => bez(p0, p1, p2, p3, (i + 1) / 24));
  return (
    <g>
      {dots > 0 && full.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r={2.6 * k} fill={L.accent} opacity={dots * 0.55} />)}
      {fade > 0 && (
        <g>
          <polyline points={poly} fill="none" stroke={L.accent} strokeWidth={20 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.12 * fade} />
          <polyline points={poly} fill="none" stroke={L.accent2} strokeWidth={7 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.3 * fade} />
          {segs}
        </g>
      )}
      {growing && (
        <g>
          <polyline points={comet} fill="none" stroke="#ffffff" strokeWidth={7 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.6} />
          <circle cx={head.x} cy={head.y} r={44 * k} fill="url(#relayHalo)" />
          <circle cx={head.x} cy={head.y} r={7.5 * k} fill="#ffffff" />
        </g>
      )}
    </g>
  );
};

type Lay = { R: number; k: number; portrait: boolean; labelSz: number; subSz: number };
const Node: React.FC<{ f: number; n: NodeDef; ox: number; oy: number; lay: Lay; labelLines: string[]; subLines: string[] }> = ({ f, n, ox, oy, lay, labelLines, subLines }) => {
  const fonts = useShotFonts();
  const { R, k, portrait, labelSz, subSz } = lay;
  const enter = ramp(f, n.inAt, 22, EASE.snappy);
  const lit = ramp(f, n.litAt, 8, EASE.out);
  const pulse = f < n.litAt ? 0 : f <= n.litAt + 6 ? ramp(f, n.litAt, 6, EASE.out) : mix(1, 0.35, ramp(f, n.litAt + 6, 16, EASE.out));
  const ring = n.litAt > 20 ? ramp(f, n.litAt, 20, EASE.linear) : 0;
  const x = n.x + ox, y = n.y + oy + (1 - enter) * 40;
  const c = n.orb;
  const on = lit > 0.5;
  const lh = labelSz * 1.18, sh = subSz * 1.3;
  const textH = labelLines.length * lh + (subLines.length ? 10 * k + subLines.length * sh : 0);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: enter }}>
      {/* 冲击环 */}
      {ring > 0 && ring < 1 && (
        <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}>
          <div style={{
            position: 'absolute', left: -R * mix(1, 2.3, EASE.snappy(ring)), top: -R * mix(1, 2.3, EASE.snappy(ring)),
            width: 2 * R * mix(1, 2.3, EASE.snappy(ring)), height: 2 * R * mix(1, 2.3, EASE.snappy(ring)), borderRadius: '50%',
            border: `${(mix(4, 1, ring) * k).toFixed(2)}px solid ${alpha('#e9f6ff', 0.8 * (1 - ring))}`, boxSizing: 'border-box',
          }} />
        </div>
      )}
      {/* 玻璃节点 */}
      <div style={{
        position: 'absolute', left: x - R, top: y - R, width: 2 * R, height: 2 * R, borderRadius: '50%',
        background: `radial-gradient(circle at 50% 28%, ${alpha('#2a3a66', 0.92)} 0%, ${alpha('#121a30', 0.94)} 62%, ${alpha('#0b1122', 0.96)} 100%)`,
        boxShadow: `inset 0 0 0 ${1.5 * k}px ${alpha(lit > 0 ? c : '#a0beff', 0.14 + 0.66 * pulse)}, inset 0 2px 0 rgba(255,255,255,0.12), ` +
          `inset 0 0 ${(50 * lit * k).toFixed(1)}px ${alpha(c, 0.28 * lit)}, 0 0 ${(70 * pulse * k).toFixed(1)}px ${alpha(c, 0.5 * pulse)}, 0 40px 80px -30px rgba(0,0,0,0.9)`,
      }}>
        <svg width={2 * R} height={2 * R} viewBox="-120 -120 240 240" style={{ position: 'absolute', inset: 0 }}>
          <g stroke={on ? '#ffffff' : L.ink3} style={{ filter: on ? `drop-shadow(0 0 10px ${alpha(c, 0.8)})` : undefined }}>{n.icon}</g>
        </svg>
      </div>
      {/* 标签：khung ngang duoi nut (giua); khung doc ben phai nut (can trai, giua theo chieu doc) */}
      <div style={portrait
        ? { position: 'absolute', left: x + R + 60, top: y - textH / 2, textAlign: 'left' }
        : { position: 'absolute', left: x - 260, width: 520, top: y + R + 34, textAlign: 'center' }}>
        {labelLines.map((l, i) => (
          <div key={i} style={{ fontFamily: fonts.sans, fontSize: labelSz, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.18, whiteSpace: 'nowrap', color: on ? L.ink : L.ink3 }}>{l}</div>
        ))}
        {subLines.length ? (
          <div style={{ marginTop: 10 * k }}>
            {subLines.map((l, i) => (
              <div key={i} style={{ fontFamily: fonts.sans, fontSize: subSz, fontWeight: 450, letterSpacing: '-0.015em', lineHeight: 1.3, whiteSpace: 'nowrap', color: on ? L.ink2 : alpha(L.ink3, 0.7) }}>{l}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// xuong dong can doi (giu so dong cua cach tach tham lam, thu hep be ngang de khong co tu mo coi)
const wrapBalanced = (text: string, family: string, size: number, maxWidth: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxWidth, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxWidth * 0.4, hi = maxWidth;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length > base.length) lo = mid; else hi = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};
// chu nhieu dong vua khung: tach toi da maxLines dong, moi dong thu nho vua be ngang
const fitLines = (text: string, family: string, size: number, maxWidth: number, weight: number, maxLines: number, minSize: number) => {
  if (!text) return { lines: [] as string[], size };
  const lines = wrapBalanced(text, family, size, maxWidth, weight, maxLines);
  const sz = Math.min(...lines.map((l) => fitSize(l, { family, size, maxWidth, weight, minSize })));
  return { lines, size: sz };
};

export const OrbFlylineRelay: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const stepsIn = useList('steps', ['Nói ý tưởng', 'AI lên kịch bản', 'Xuất video']);
  const subsIn = useList('subs', ['Chỉ một câu lệnh', '8 cảnh, khớp nhịp', 'Sẵn sàng đăng']);
  const title = useText('title', 'Nói một lần, phần còn lại để AI lo.');
  const steps = [0, 1, 2].map((i) => stepsIn[i] ?? '');
  const subs = [0, 1, 2].map((i) => subsIn[i] ?? '');
  const t = drift(f);

  // ── bo cuc ──
  const k = portrait ? 1.5 : 1;
  const R = 120 * k;
  const labW = portrait ? 1920 - 400 - R - 60 - 70 : 520;
  const labs = steps.map((s) => fitLines(s, fonts.sans, portrait ? 100 : 52, labW, 650, 2, portrait ? 52 : 30));
  const subl = subs.map((s) => fitLines(s, fonts.sans, portrait ? 56 : 32, labW, 450, 2, portrait ? 34 : 22));
  const labelSz = Math.min(...labs.map((x) => x.size));
  const subSz = Math.min(...subl.map((x) => x.size));
  const TT = portrait ? 132 : 72;
  let tl = wrapBalanced(title, fonts.sans, TT, portrait ? 1680 : 1720, 700, portrait ? 3 : 1);
  let tSz = TT;
  if (!portrait && fitSize(title, { family: fonts.sans, size: TT, maxWidth: 1720, weight: 700 }) < 60) {
    tSz = 60;
    tl = wrapBalanced(title, fonts.sans, tSz, 1720, 700, 2);
  }
  tSz = Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: tSz, maxWidth: portrait ? 1680 : 1720, weight: 700, minSize: portrait ? 70 : 44 })));
  const tLH = tSz * 1.16;

  let NODES: NodeDef[];
  let LINES: LineDef[];
  let titleTop: number;
  if (!portrait) {
    NODES = NODE_BASE;
    LINES = [
      { start: LIT_B - 26, dur: 26, p0: edge(NODES[0], -48, R), p3: edge(NODES[1], 200, R), lift: 170 },
      { start: LIT_C - 24, dur: 24, p0: edge(NODES[1], -20, R), p3: edge(NODES[2], 228, R), lift: 170 },
    ].map((l) => {
      const dx = l.p3.x - l.p0.x;
      const top = Math.min(l.p0.y, l.p3.y) - l.lift;
      return { start: l.start, dur: l.dur, p0: l.p0, p3: l.p3, p1: { x: l.p0.x + dx * 0.22, y: top }, p2: { x: l.p0.x + dx * 0.78, y: top }, k: 1 };
    });
    titleTop = tl.length > 1 ? 838 : 862;
  } else {
    // 3 nut xep doc (nut giua lech phai nhe — giu nhip "nhay" cua ban goc), ten buoc ben phai
    const gapY = 800;
    const total = 2 * gapY + 2 * R + 200 + tl.length * tLH;
    const y0 = Math.round(SH / 2 - total / 2) + R;
    NODES = NODE_BASE.map((n, i) => ({ ...n, x: i === 1 ? 400 : 330, y: y0 + i * gapY, orbSize: n.orbSize * 1.5 }));
    LINES = [
      { start: LIT_B - 26, dur: 26, a: NODES[0], b: NODES[1] },
      { start: LIT_C - 24, dur: 24, a: NODES[1], b: NODES[2] },
    ].map((l) => {
      const p0 = edge(l.a, 150, R), p3 = edge(l.b, 212, R);
      const dy = p3.y - p0.y;
      const lx = Math.max(60, Math.min(p0.x, p3.x) - 230);
      return { start: l.start, dur: l.dur, p0, p3, p1: { x: lx, y: p0.y + dy * 0.22 }, p2: { x: lx, y: p0.y + dy * 0.78 }, k };
    });
    titleTop = NODES[2].y + R + 200;
  }
  const lay: Lay = { R, k, portrait, labelSz, subSz };

  const cam = 1 + 0.04 * ramp(f, 0, 140, EASE.smooth);
  const camP = ramp(f, 10, 100, EASE.smooth);
  const fx = portrait ? 700 : mix(700, 1200, camP);
  const fy = portrait ? mix(NODES[0].y, NODES[2].y, camP) : 470;
  const orbIn = 0.3 + 0.7 * ramp(f, 0, 20, EASE.out);

  // 节点与光斑一起轻漂（节点漂得少 = 视差：光斑在后）
  const offs = NODES.map((n) => {
    const a = h(n.seed * 7 + 1) * TAU, b = h(n.seed * 7 + 2) * TAU;
    return {
      ox: 120 * Math.sin((TAU * t) / (118 + n.seed * 9) + a), oy: 90 * Math.sin((TAU * t) / (134 - n.seed * 11) + b),
    };
  });

  const nodeOffs = offs.map((o) => ({ ox: o.ox * 0.22, oy: o.oy * 0.22 })); // 节点只漂 22%：光斑在后、节点在前的视差
  const allWords = tl.map((l) => l.split(/\s+/).filter(Boolean));
  const nW = allWords.reduce((a, w) => a + w.length, 0);
  const tGap = Math.min(3.5, 24 / Math.max(1, nW));
  let wi = 0;

  return (
    <AbsoluteFill style={{ background: L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: -0.05 }} fill={null} intensity={0.8} />

      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `${fx}px ${fy}px` }}>
        {/* 光斑：每颗节点背后一团；点亮后常亮，落点帧同帧 surge */}
        {NODES.map((n, i) => {
          const s = surge(f, n.litAt);
          const base = n.litAt <= 10 ? 0.4 + 0.6 * ramp(f, n.litAt, 10, EASE.out) : 0.35 + 0.65 * ramp(f, n.litAt, 8, EASE.out);
          const kk = (0.5 * base) * (1 + 1.6 * s);
          const sz = n.orbSize * (1 + 0.12 * s);
          const x = n.x + offs[i].ox, y = n.y + offs[i].oy;
          return (
            <div key={i} style={{
              position: 'absolute', left: x - sz / 2, top: y - sz / 2, width: sz, height: sz, borderRadius: '50%', mixBlendMode: 'screen', opacity: orbIn,
              background: `radial-gradient(circle closest-side, ${alpha(n.orb, Math.min(1, kk))} 0%, ${alpha(n.orb, Math.min(1, kk * 0.55))} 25%, ${alpha(n.orb, kk * 0.22)} 52%, ${alpha(n.orb, kk * 0.06)} 76%, ${alpha(n.orb, 0)} 100%)`,
            }} />
          );
        })}

        <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <radialGradient id="relayHalo">
              <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
              <stop offset="30%" stopColor={alpha(L.accent2, 0.35)} />
              <stop offset="100%" stopColor={alpha(L.accent, 0)} />
            </radialGradient>
          </defs>
          {/* 飞线坐标跟随节点漂移：端点按节点偏移整体平移 */}
          {LINES.map((ln, i) => {
            const a = nodeOffs[i], b = nodeOffs[i + 1];
            const shift = (p: Pt, w: number) => ({ x: p.x + mix(a.ox, b.ox, w), y: p.y + mix(a.oy, b.oy, w) });
            const moved = { ...ln, p0: shift(ln.p0, 0), p1: shift(ln.p1, 0.25), p2: shift(ln.p2, 0.75), p3: shift(ln.p3, 1) };
            return <Flyline key={i} f={f} ln={moved} />;
          })}
        </svg>

        {NODES.map((n, i) => (
          <Node key={i} f={f} n={n} ox={nodeOffs[i].ox} oy={nodeOffs[i].oy} lay={lay} labelLines={labs[i].lines} subLines={subl[i].lines} />
        ))}
      </AbsoluteFill>

      {/* 收束标题（不随镜头推进，稳在画面下缘）；末词用青色 */}
      {allWords.map((ws, li) => {
        const st = 92 + wi * tGap;
        const base = wi;
        wi += ws.length;
        return (
          <RiseLine key={li} start={st} each={18} gap={tGap}
            words={ws.map((w, j) => ({ w, accent: base + j === nW - 1 }))}
            style={{ position: 'absolute', left: 0, right: 0, top: titleTop + li * tLH, textAlign: 'center', fontFamily: fonts.sans, fontSize: tSz, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.16, color: L.ink }} />
        );
      })}
    </AbsoluteFill>
  );
};
