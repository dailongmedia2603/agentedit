// cursor-flyover — 光标导游的四站巡览（第二轮重设计）
// 手法不变：整页俯瞰 → 相机依次飞到四个功能区特写，光标同步到位指点、点击并留下涟漪，界面即时响应。
//
// 设计决定
// - look：porcelain（冷白 + 钴蓝，SaaS 交互演示）。产品是 video-shotcraft 的工作台总览，按 1:1 原生排版画在
//   2400×1500 的世界画布上（不再是 480×270 设计坐标放大），俯瞰 0.66x 是全貌、特写 1.3x 字号 ≥40px 可读。
// - 只留讲清手法的四个模块，每个都有一次"点了就有反应"的交互：
//   ① Frames rendered：分段控件点 90D → 大数字换档（旧值上滑淡出、新值从线下升起）+ 12 根柱子错峰弹到新高度
//   ② Shot previews：点曲线上的数据点 → 引导线下落、数据点放大、tooltip 过冲弹出
//   ③ Release flags：点开关 → 滑块弹簧滑过去、轨道染钴蓝、灰度进度条 0→25% 走起
//   ④ Top shots：点第二行 → 行底染色 + 左侧强调条 + 勾选框描出对勾
//   最后相机拉回俯瞰，四处状态同时在场——尾帧是一张"巡览结束"的全家福海报。
// - 光标是"手"，相机是"眼"：光标先走（swift 16f，一条轻弧），相机晚 2f 起步、晚 6f 落定（smooth 20f），
//   光标在目标上"瞄"一拍再按下（3f 缩到 0.84，过冲回弹）；途中相机额外拉远 ~8% 再推回（hop），
//   按屏幕速度加方向性运动模糊。光标逐帧按 1/s 反缩放，屏幕上恒为 40px。
//
// 时间表（30fps，240f = 8s）
//   0–22     俯瞰：整台 0.62→0.66 缓推落定，光标在画面中央
//   22–66    第 1 站：22 光标起步 / 24–44 相机飞行 / 44 按下 / 46 起界面响应 / 停留到 66
//   66–110   第 2 站（同结构，各 +44f）
//   110–154  第 3 站
//   154–198  第 4 站
//   198–222  拉回俯瞰（smooth 24f），四处状态同框
//   222–239  hold：极缓推近 1%
//
// [Agent Edit] Bang dieu khien tieng Viet trung tinh; o chu `items` (4 ten khu chuc nang = tieu de 4 the, theo thu tu
// tham quan), `number` (so lon cua the 1 sau khi bam — tu loi noi; so cu tu suy ra ~1/3). Thuong hieu cua video o
// thanh tren (khong co -> 'Bảng điều khiển'). Khung doc (portrait.mode = 'native'): the giao dien HEP (be ngang thiet ke
// 700 thay 1120, chu x1.6) xep luoi 2x2; toan canh ~0.77x phu kin be ngang, can canh ~1.6x (the phu ~94% be ngang);
// bang camera / con tro tinh lai theo the — nhip (chay 16f / camera tre 2f, bay 20f, bam +22f, hop 8%, keo ve 24f) giu nguyen.
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, SpeedBlur, bezier, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const CURSOR_FLYOVER_DURATION = 240; // 8s @30fps

const L = LOOKS.porcelain;
const UP = '#0f9d76'; // 正向涨幅（accent2 压暗一档，白底上够对比）

type Rect = { x: number; y: number; w: number; h: number };
// 世界几何：MOD = 模块在世界中的矩形（px），T = 模块内容放大（竖屏 1.6），DW = 模块设计宽（横 1120 / 竖 700）
type Geo = {
  portrait: boolean; H: number; WW: number; WH: number; T: number; DW: number; DH: number;
  MOD: { rev: Rect; users: Rect; flags: Rect; accts: Rect };
  TARGETS: { x: number; y: number }[]; CAMS: { x: number; y: number; s: number }[]; cur0: { x: number; y: number };
};
const center = (m: Rect) => ({ x: m.x + m.w / 2, y: m.y + m.h / 2 });

// 折线：12 点，第 9 点是点击目标（模块设计坐标）
const LY = [0.62, 0.55, 0.58, 0.46, 0.5, 0.4, 0.44, 0.33, 0.37, 0.24, 0.3, 0.18];
const HOT = 9;
const chartBox = (g: Geo) => ({ x: 64, y: 190, w: g.DW - 128, h: g.DH - 190 - 90 });
const ptX = (g: Geo, i: number) => { const c = chartBox(g); return c.x + (i / (LY.length - 1)) * c.w; };
const ptY = (g: Geo, i: number) => { const c = chartBox(g); return c.y + LY[i] * c.h; };
// 分段控件位置（竖屏窄卡：挪到标题下方）
const segBox = (g: Geo) => (g.portrait ? { left: 64, top: 160 } : { left: g.DW - 40 - 360, top: 40 });

const geoFor = (portrait: boolean, SH: number): Geo => {
  if (!portrait) {
    const WW = 2400, WH = 1500;
    const MOD = {
      rev: { x: 60, y: 150, w: 1120, h: 640 },
      users: { x: 1220, y: 150, w: 1120, h: 640 },
      flags: { x: 1220, y: 830, w: 1120, h: 640 },
      accts: { x: 60, y: 830, w: 1120, h: 640 },
    };
    const g: Geo = { portrait, H: 1080, WW, WH, T: 1, DW: 1120, DH: 640, MOD, TARGETS: [], CAMS: [], cur0: { x: WW / 2 + 40, y: WH / 2 + 80 } };
    g.CAMS = [
      { x: WW / 2, y: WH / 2 + 30, s: 0.66 },
      { ...center(MOD.rev), s: 1.3 },
      { ...center(MOD.users), s: 1.3 },
      { ...center(MOD.flags), s: 1.3 },
      { ...center(MOD.accts), s: 1.3 },
    ];
    return g;
  }
  // 竖屏：2×2 窄卡（设计 700 × 720，内容 ×1.6），巡览顺序同横屏：左上 → 右上 → 右下 → 左下
  const T = 1.6, DW = 700, DH = 720;
  const w = DW * T, h = DH * T, gap = 40, top = 190;
  const WW = 60 * 2 + w * 2 + gap;
  const cell = (c: number, r: number) => ({ x: 60 + c * (w + gap), y: top + r * (h + gap), w, h });
  const MOD = { rev: cell(0, 0), users: cell(1, 0), flags: cell(1, 1), accts: cell(0, 1) };
  const WH = top + 2 * h + gap + 60;
  const s0 = Math.min(1920 / (WW + 80), (SH - 160) / WH);
  const s1 = (1920 * 0.94) / w;
  const g: Geo = { portrait, H: SH, WW, WH, T, DW, DH, MOD, TARGETS: [], CAMS: [], cur0: { x: WW / 2 + 40, y: WH / 2 + 80 } };
  g.CAMS = [
    { x: WW / 2, y: WH / 2, s: s0 },
    { ...center(MOD.rev), s: s1 },
    { ...center(MOD.users), s: s1 },
    { ...center(MOD.flags), s: s1 },
    { ...center(MOD.accts), s: s1 },
  ];
  return g;
};
const withTargets = (g: Geo): Geo => {
  const { MOD, T, DW } = g;
  const sb = segBox(g);
  g.TARGETS = [
    { x: MOD.rev.x + (sb.left + 5 + 236 + 57) * T, y: MOD.rev.y + (sb.top + 30) * T }, // 90N 分段
    { x: MOD.users.x + ptX(g, HOT) * T, y: MOD.users.y + ptY(g, HOT) * T }, // 数据点
    { x: MOD.flags.x + (DW - 64 - 46) * T, y: MOD.flags.y + (196 + 31) * T }, // 第一行开关
    { x: MOD.accts.x + 100 * T, y: MOD.accts.y + (196 + 104 + 50) * T }, // 第二行勾选框
  ];
  return g;
};

const LEG0 = 22; // 第 1 站光标起步
const LEG = 44; // 每站周期
const legStart = (k: number) => LEG0 + k * LEG;
const clickAt = (k: number) => legStart(k) + 22;
const BACK = 198; // 拉回俯瞰
const CAM_EASE = bezier(0.55, 0, 0.18, 1); // 起步干脆、落位很软

// 相机（帧的纯函数，可取小数帧）
const camAt = (f: number, g: Geo) => {
  let { x, y, s } = g.CAMS[0];
  s *= mix(0.94, 1, ramp(f, 0, 22, EASE.snappy));
  let hop = 0;
  for (let k = 0; k < 4; k++) {
    const u = ramp(f, legStart(k) + 2, 20, CAM_EASE);
    const to = g.CAMS[k + 1];
    x = mix(x, to.x, u); y = mix(y, to.y, u); s = mix(s, to.s, u);
    if (k > 0 && u > 0 && u < 1) hop = 0.08 * Math.sin(Math.PI * u);
  }
  const b = ramp(f, BACK, 24, EASE.smooth);
  x = mix(x, g.CAMS[0].x, b); y = mix(y, g.CAMS[0].y, b); s = mix(s, g.CAMS[0].s, b);
  s *= (1 - hop) * (1 + 0.01 * ramp(f, 222, 18, EASE.smooth));
  return { x, y, s };
};

// 光标（世界坐标）：先于相机出发，轻弧线
const cursorAt = (f: number, g: Geo) => {
  let { x, y } = g.cur0;
  for (let k = 0; k < 4; k++) {
    const u = ramp(f, legStart(k), 16, EASE.swift);
    const to = g.TARGETS[k];
    const dx = to.x - x, dy = to.y - y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const bow = Math.sin(Math.PI * u) * Math.min(90 * g.T, len * 0.12);
    const nx = mix(x, to.x, u) + (-dy / len) * bow;
    const ny = mix(y, to.y, u) + (dx / len) * bow;
    x = nx; y = ny;
  }
  return { x, y };
};

// 点击后的界面响应进度
const resp = (f: number, k: number, dur = 16, ease = EASE.snappy) => ramp(f, clickAt(k) + 2, dur, ease);

// ───────── 模块外壳（设计坐标 DW × DH，整体 ×T 放进世界矩形） ─────────
const Module: React.FC<{ m: Rect; g: Geo; title: string; meta: string; active: number; titleMax: number; children: React.ReactNode }> = ({ m, g, title, meta, active, titleMax, children }) => {
  const fonts = useShotFonts();
  const ts = fitSize(title, { family: fonts.sans, size: 34, maxWidth: titleMax, weight: 650, minSize: 20 });
  return (
    <div style={{ position: 'absolute', left: m.x, top: m.y, width: g.DW, height: g.DH, transform: `scale(${g.T})`, transformOrigin: '0 0' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 28, background: L.surface, overflow: 'hidden',
        border: `1.5px solid ${active > 0.01 ? alpha(L.accent, 0.18 * active) : L.line}`,
        boxShadow: `inset 0 1.5px 0 #ffffff, ${softShadow(6 + 14 * active, { color: L.shadow, strength: 0.9 })}`,
      }}>
        <div style={{ position: 'absolute', left: 64, top: 52, ...type(ts, 650), lineHeight: 1.3, color: L.ink, whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ position: 'absolute', left: 64, top: 104, ...type(26, 500), lineHeight: 1.3, color: L.ink3, whiteSpace: 'nowrap' }}>{meta}</div>
        {children}
      </div>
    </div>
  );
};

// 数字：讲话里的新值 → 旧值按 ~1/3 推出（保留格式：小数逗号 / 千位点 / 单位）
const parseNum = (s: string) => {
  const m = /^([^0-9]*)([0-9]+(?:[.,][0-9]+)*)(.*)$/.exec(s.trim());
  if (!m) return null;
  const raw = m[2];
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
  const dec = !grouped && /[.,]\d+$/.test(raw) ? raw.split(/[.,]/).pop()!.length : 0;
  const n = dec ? parseFloat(raw.replace(',', '.')) : parseInt(raw.replace(/[.,]/g, ''), 10);
  const sep = raw.includes(',') ? ',' : '.';
  return { pre: m[1], n, dec, sep, unit: m[3], grouped };
};
const fmtNum = (p: NonNullable<ReturnType<typeof parseNum>>, v: number) => {
  let s = p.dec ? v.toFixed(p.dec).replace('.', p.sep) : String(Math.round(v));
  if (p.grouped) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, p.sep);
  return p.pre + s + p.unit;
};

// ① Doanh thu
const REV_BARS_A = [0.42, 0.5, 0.46, 0.58, 0.52, 0.6, 0.55, 0.64, 0.6, 0.7, 0.66, 0.74];
const REV_BARS_B = [0.3, 0.38, 0.45, 0.42, 0.55, 0.62, 0.58, 0.7, 0.76, 0.82, 0.88, 0.96];
const Revenue: React.FC<{ f: number; g: Geo; title: string; number: string }> = ({ f, g, title, number }) => {
  const fonts = useShotFonts();
  const ACC = L.accent;
  const r = resp(f, 0);
  const seg = ['7N', '30N', '90N'];
  const sel = ramp(f, clickAt(0), 8, EASE.snappy); // 分段滑块 30N → 90N
  const sb = segBox(g);
  const pn = parseNum(number);
  const vNew = number;
  const vOld = pn ? fmtNum(pn, pn.n * 0.34) : '0'; // [Agent Edit] khong dung dau gach lam so cho
  const numTop = g.portrait ? 250 : 168;
  const numW = g.portrait ? g.DW - 128 : g.DW - 64 - 64 - 220; // 竖屏：涨幅 chip 挪到分段控件右侧，数字占满宽
  const numSize = Math.min(fitSize(vNew, { family: fonts.sans, size: 150, maxWidth: numW, weight: 720, minSize: 60 }), fitSize(vOld, { family: fonts.sans, size: 150, maxWidth: numW, weight: 720, minSize: 60 }));
  const barsH = g.portrait ? g.DH - (numTop + 180) - 64 : 200;
  return (
    <Module m={g.MOD.rev} g={g} title={title} meta={sel > 0.5 ? '90 ngày qua' : '30 ngày qua'} active={r} titleMax={g.portrait ? g.DW - 128 : g.DW - 64 - 360 - 80}>
      {/* 分段控件：滑块平移 */}
      <div style={{ position: 'absolute', left: sb.left, top: sb.top, width: 360, height: 60, borderRadius: 16, background: L.surface2, border: `1.5px solid ${L.line}` }}>
        <div style={{ position: 'absolute', top: 5, left: 5 + mix(118, 236, sel), width: 114, height: 47, borderRadius: 12, background: '#ffffff', boxShadow: softShadow(3, { color: L.shadow }) }} />
        {seg.map((s, i) => (
          <div key={s} style={{
            position: 'absolute', top: 0, left: 5 + i * 118, width: 114, height: 57, display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...type(26, 650), color: (i === 1 && sel < 0.5) || (i === 2 && sel >= 0.5) ? L.ink : L.ink3,
          }}>{s}</div>
        ))}
      </div>
      {/* 大数字换档 */}
      <div style={{ position: 'absolute', left: 60, top: numTop, height: 180, width: numW + 20, overflow: 'hidden' }}>
        {[{ v: vOld, p: -r }, { v: vNew, p: 1 - r }].map(({ v, p }, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, top: 0, ...type(numSize, 720), lineHeight: 1.15, color: L.ink, whiteSpace: 'nowrap',
            transform: `translateY(${(p * 160).toFixed(1)}px)`, opacity: 1 - Math.abs(p) * 0.9,
          }}>{v}</div>
        ))}
      </div>
      <div style={{
        position: 'absolute', right: 64, top: g.portrait ? sb.top + 4 : numTop + 68, height: 52, padding: '0 20px', borderRadius: 26, display: 'flex', alignItems: 'center', gap: 8,
        background: alpha(UP, 0.1), color: UP, ...type(30, 700),
      }}>▲ {r > 0.5 ? '24,6%' : '18,2%'}</div>
      {/* 柱子：点击后错峰弹到新高度 */}
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 64, height: barsH, display: 'flex', alignItems: 'flex-end', gap: g.portrait ? 12 : 18 }}>
        {REV_BARS_A.map((a, i) => {
          const sp = f < clickAt(0) + 2 ? 0 : springAt(f, clickAt(0) + 2 + i * 1.4, { damping: 15, stiffness: 190 });
          const h = mix(a, REV_BARS_B[i], sp);
          const last = i === REV_BARS_A.length - 1;
          return (
            <div key={i} style={{
              flex: 1, height: `${(h * 100).toFixed(2)}%`, borderRadius: 10,
              background: last ? `linear-gradient(180deg, ${ACC}, ${alpha(ACC, 0.7)})` : alpha(ACC, 0.14 + 0.1 * r * (i / 11)),
            }} />
          );
        })}
      </div>
    </Module>
  );
};

// ② Lượt truy cập
const smoothPath = (pts: [number, number][]) => {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
const Users: React.FC<{ f: number; g: Geo; title: string }> = ({ f, g, title }) => {
  const ACC = L.accent;
  const CH = chartBox(g);
  const LINE = smoothPath(LY.map((_, i) => [ptX(g, i), ptY(g, i)] as [number, number]));
  const r = resp(f, 1);
  const tip = f < clickAt(1) + 2 ? 0 : springAt(f, clickAt(1) + 2, { damping: 14, stiffness: 210 });
  const guide = resp(f, 1, 12, EASE.snappy);
  const hx = ptX(g, HOT), hy = ptY(g, HOT);
  const base = CH.y + CH.h;
  const tipL = Math.min(g.DW - 24 - 300, hx - 150);
  return (
    <Module m={g.MOD.users} g={g} title={title} meta="Theo tuần · Tháng 9" active={r} titleMax={g.DW - 128 - 170}>
      <div style={{ position: 'absolute', right: 64, top: 52, ...type(34, 700), lineHeight: 1.3, color: L.ink }}>48,2k</div>
      <svg width={g.DW} height={g.DH} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <linearGradient id="cf2-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACC} stopOpacity={0.2} />
            <stop offset="1" stopColor={ACC} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <line key={k} x1={CH.x} x2={CH.x + CH.w} y1={CH.y + (k * CH.h) / 3} y2={CH.y + (k * CH.h) / 3} stroke={L.line} strokeWidth={1.5} />
        ))}
        <path d={`${LINE} L${CH.x + CH.w},${base} L${CH.x},${base} Z`} fill="url(#cf2-area)" />
        <path d={LINE} fill="none" stroke={ACC} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        {/* 引导线自上而下落到底 */}
        <line x1={hx} x2={hx} y1={hy} y2={hy + (base - hy) * guide} stroke={ACC} strokeWidth={2} strokeDasharray="6 6" opacity={0.8} />
        <circle cx={hx} cy={hy} r={9 + 7 * tip} fill="#ffffff" stroke={ACC} strokeWidth={5} />
        {['1/9', '8/9', '15/9', '22/9', '29/9'].map((m, i) => (
          <text key={m} x={CH.x + (i * CH.w) / 4} y={base + 48} fill={L.ink3} fontSize={24} fontFamily={FONT.sans} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{m}</text>
        ))}
      </svg>
      {/* tooltip：过冲弹出 */}
      <div style={{
        position: 'absolute', left: tipL, top: hy - 168, width: 300, height: 124, borderRadius: 20, padding: '18px 26px', boxSizing: 'border-box',
        background: L.ink, color: '#ffffff', boxShadow: softShadow(24, { color: L.shadow, strength: 1.4 }),
        opacity: Math.min(1, tip * 2), transform: `translateY(${((1 - tip) * 16).toFixed(1)}px) scale(${(0.86 + 0.14 * tip).toFixed(3)})`, transformOrigin: `${hx - tipL}px 100%`,
      }}>
        <div style={{ ...type(22, 600), lineHeight: 1.3, letterSpacing: '0.06em', color: alpha('#ffffff', 0.6) }}>22/9</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ ...type(46, 720) }}>51.204</span>
          <span style={{ ...type(26, 700), color: '#5ee0b8' }}>+12%</span>
        </div>
      </div>
    </Module>
  );
};

// ③ Tính năng mới
const FLAGS = [
  { n: 'Thanh toán QR', d: 'Khách quét mã là xong' },
  { n: 'Thông báo tự động', d: 'Nhắc khách khi có ưu đãi' },
  { n: 'Xuất báo cáo', d: 'Gửi file Excel mỗi tuần' },
];
const Toggle: React.FC<{ on: number }> = ({ on }) => (
  <div style={{ position: 'relative', width: 92, height: 54, borderRadius: 27, background: on > 0.5 ? L.accent : '#d5dbe6' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 27, background: L.accent, opacity: Math.min(1, Math.max(0, on)) }} />
    <div style={{ position: 'absolute', top: 5, left: 5 + 38 * on, width: 44, height: 44, borderRadius: 22, background: '#ffffff', boxShadow: '0 2px 6px rgba(12,26,58,0.25)' }} />
  </div>
);
const Flags: React.FC<{ f: number; g: Geo; title: string }> = ({ f, g, title }) => {
  const on = f < clickAt(2) + 1 ? 0 : springAt(f, clickAt(2) + 1, { damping: 16, stiffness: 240 });
  const roll = resp(f, 2, 26, EASE.out);
  const step = g.portrait ? 160 : 140;
  return (
    <Module m={g.MOD.flags} g={g} title={title} meta="Bật / tắt tính năng" active={resp(f, 2)} titleMax={g.DW - 128}>
      {FLAGS.map((fl, i) => {
        const first = i === 0;
        const v = first ? on : i === 1 ? 1 : 0;
        return (
          <div key={fl.n} style={{ position: 'absolute', left: 64, right: 64, top: 196 + i * step, height: first ? 132 : 100, borderTop: i ? `1.5px solid ${L.line}` : undefined }}>
            <div style={{ position: 'absolute', left: 0, top: i ? 18 : 2, ...type(36, 650), lineHeight: 1.3, color: L.ink, whiteSpace: 'nowrap' }}>{fl.n}</div>
            <div style={{ position: 'absolute', left: 0, top: i ? 68 : 52, ...type(26, 450), lineHeight: 1.3, color: L.ink3, whiteSpace: 'nowrap' }}>{fl.d}</div>
            <div style={{ position: 'absolute', right: 0, top: i ? 22 : 4 }}><Toggle on={v} /></div>
            {first && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 104, display: 'flex', alignItems: 'center', gap: 18, opacity: Math.min(1, roll * 3) }}>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: L.surface2, overflow: 'hidden' }}>
                  <div style={{ width: `${(roll * 25).toFixed(2)}%`, height: '100%', borderRadius: 4, background: L.accent }} />
                </div>
                <div style={{ ...type(24, 650), color: L.accent, width: 210, textAlign: 'right', whiteSpace: 'nowrap' }}>Đang mở · {Math.round(roll * 25)}%</div>
              </div>
            )}
          </div>
        );
      })}
    </Module>
  );
};

// ④ Bán chạy（gói · nhãn · lượt bán tháng này）
const ACCTS = [
  { n: 'Gói Cơ bản', p: 'Phổ biến', v: '4.280' },
  { n: 'Gói Pro', p: 'Tăng mạnh', v: '3.125' },
  { n: 'Gói Nhóm', p: 'Mới', v: '1.890' },
  { n: 'Gói Doanh nghiệp', p: 'Ổn định', v: '941' },
];
const Accounts: React.FC<{ f: number; g: Geo; title: string }> = ({ f, g, title }) => {
  const r = resp(f, 3, 14);
  const tick = resp(f, 3, 12, EASE.out);
  const step = g.portrait ? 116 : 104;
  return (
    <Module m={g.MOD.accts} g={g} title={title} meta="Theo lượt bán tháng này" active={r} titleMax={g.DW - 128}>
      {ACCTS.map((a, i) => {
        const sel = i === 1 ? r : 0;
        return (
          <div key={a.n} style={{
            position: 'absolute', left: 40, right: 40, top: 196 + i * step, height: 100, borderRadius: 18,
            background: sel > 0 ? alpha(L.accent, 0.08 * sel) : 'transparent',
            borderTop: i && sel < 0.01 && i !== 2 ? `1.5px solid ${L.line}` : '1.5px solid transparent',
          }}>
            <div style={{ position: 'absolute', left: 0, top: 22, width: 6, height: 56, borderRadius: 3, background: L.accent, transform: `scaleY(${sel.toFixed(3)})` }} />
            {/* 勾选框 */}
            <div style={{
              position: 'absolute', left: 42, top: 32, width: 36, height: 36, borderRadius: 10, boxSizing: 'border-box',
              border: `2.5px solid ${sel > 0.3 ? L.accent : '#c4cbd8'}`, background: sel > 0.3 ? L.accent : '#ffffff',
            }}>
              {i === 1 && (
                <svg width={36} height={36} viewBox="0 0 36 36" style={{ position: 'absolute', left: -2.5, top: -2.5 }}>
                  <path d="M10 18.5 L15.5 24 L26 12.5" fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={26} strokeDashoffset={26 * (1 - tick)} />
                </svg>
              )}
            </div>
            <div style={{ position: 'absolute', left: 112, top: 24, ...type(36, sel > 0.5 ? 700 : 560), lineHeight: 1.3, color: L.ink, whiteSpace: 'nowrap' }}>{a.n}</div>
            {!g.portrait && (
              <div style={{ position: 'absolute', left: 600, top: 30, height: 40, padding: '0 16px', borderRadius: 20, display: 'flex', alignItems: 'center', background: L.surface2, ...type(24, 600), color: L.ink2 }}>{a.p}</div>
            )}
            <div style={{ position: 'absolute', right: 32, top: 24, ...type(36, 650), lineHeight: 1.3, color: L.ink }}>{a.v}</div>
          </div>
        );
      })}
    </Module>
  );
};

// 光标：macOS 式箭头（黑芯白边 + 两层影），屏幕恒定尺寸
const Cursor: React.FC<{ press: number; size: number }> = ({ press, size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{
    position: 'absolute', left: -3 * (size / 40), top: -2 * (size / 40), overflow: 'visible',
    filter: 'drop-shadow(0 2px 2px rgba(12,26,58,0.35)) drop-shadow(0 8px 12px rgba(12,26,58,0.25))',
    transform: `scale(${(1 - 0.16 * press).toFixed(3)})`, transformOrigin: '3px 2px',
  }}>
    <path d="M4.5 2.5 L4.5 19.2 L8.9 15 L11.9 21.6 L14.9 20.3 L11.9 13.8 L18.2 13.4 Z" fill="#0d1324" stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

export const CursorFlyover: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const titles = useList('items', ['Doanh thu', 'Lượt truy cập', 'Tính năng mới', 'Sản phẩm bán chạy']);
  const tt = [0, 1, 2, 3].map((i) => titles[i] ?? ['Doanh thu', 'Lượt truy cập', 'Tính năng mới', 'Sản phẩm bán chạy'][i]);
  const number = useText('number', '7,31 tỷ');
  const g = withTargets(geoFor(portrait, SH));
  const CY = g.H / 2;
  const cam = camAt(frame, g);
  const scr = (f: number) => {
    const c = camAt(f, g);
    return { x: 960 - c.x * c.s, y: CY - c.y * c.s };
  };
  const a = scr(frame + 0.5), b = scr(frame - 0.5);
  const cur = cursorAt(frame, g);
  const cx = 960 + (cur.x - cam.x) * cam.s;
  const cy = CY + (cur.y - cam.y) * cam.s;
  // 按下：每站 clickAt 前 1.5f 压下、之后过冲回弹
  let press = 0;
  let ripple = -1;
  for (let k = 0; k < 4; k++) {
    const pf = frame - clickAt(k);
    if (pf > -2 && pf < 8) press = Math.max(press, pf < 1 ? ramp(pf, -2, 3, EASE.swift) : 1 - ramp(pf, 1, 6, EASE.overshoot));
    if (pf >= 0 && pf < 18) ripple = pf / 18;
  }
  const intro = ramp(frame, 0, 14, EASE.out);
  const CS = portrait ? 68 : 40; // 光标屏幕尺寸
  const RP = portrait ? 132 : 80; // 涟漪直径
  const TB = portrait ? 1.5 : 1; // 顶栏放大
  const name = BRAND.name || 'Bảng điều khiển';
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: bo nen dac code (cua so app van giu)
  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: -0.1 }} fill={{ x: 0.1, y: 1 }} />
      <SpeedBlur vx={a.x - b.x} vy={a.y - b.y} amount={0.09} max={8}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: g.WW, height: g.WH, transformOrigin: '0 0',
          transform: `translate(${(960 - cam.x * cam.s).toFixed(2)}px, ${(CY - cam.y * cam.s).toFixed(2)}px) scale(${cam.s.toFixed(5)})`,
          opacity: intro,
        }}>
          {/* 应用窗口底板 */}
          <div style={{
            position: 'absolute', left: -40, top: -30, width: g.WW + 80, height: g.WH + 60, borderRadius: 48,
            background: `linear-gradient(180deg, #f4f7fb, #edf1f7)`, border: `1.5px solid ${L.line}`,
            boxShadow: `inset 0 2px 0 #ffffff, ${softShadow(40, { color: L.shadow, strength: 1.2 })}`,
          }} />
          {/* 顶栏 */}
          <div style={{ position: 'absolute', left: 60, top: 36, right: 60, height: 76 * TB, display: 'flex', alignItems: 'center' }}>
            <ShotcraftMark size={60 * TB} tone="light" />
            <div style={{ marginLeft: 18 * TB, fontFamily: BRAND.font, fontSize: 38 * TB, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.3, color: BRAND.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: portrait ? 640 : 520 }}>{name}</div>
            {!portrait && (
              <div style={{ marginLeft: 72, display: 'flex', gap: 14 }}>
                {['Tổng quan', 'Sản phẩm', 'Báo cáo', 'Phát hành'].map((t, i) => (
                  <div key={t} style={{ height: 56, padding: '0 26px', borderRadius: 16, display: 'flex', alignItems: 'center', ...type(28, i ? 520 : 650), color: i ? L.ink3 : L.ink, background: i ? 'transparent' : '#ffffff', boxShadow: i ? undefined : softShadow(3, { color: L.shadow }), whiteSpace: 'nowrap' }}>{t}</div>
                ))}
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
              {!portrait && <div style={{ height: 56, width: 320, borderRadius: 16, background: '#ffffff', border: `1.5px solid ${L.line}`, display: 'flex', alignItems: 'center', padding: '0 22px', boxSizing: 'border-box', ...type(26, 450), color: L.ink3, whiteSpace: 'nowrap' }}>Tìm kiếm  ⌘K</div>}
              <div style={{ width: 56 * TB, height: 56 * TB, borderRadius: 28 * TB, background: 'linear-gradient(135deg, #ffd2a8, #ff9f7a)', border: '3px solid #ffffff', boxShadow: softShadow(3, { color: L.shadow }) }} />
            </div>
          </div>
          <Revenue f={frame} g={g} title={tt[0]} number={number} />
          <Users f={frame} g={g} title={tt[1]} />
          <Flags f={frame} g={g} title={tt[2]} />
          <Accounts f={frame} g={g} title={tt[3]} />
        </div>
      </SpeedBlur>
      {/* 点击涟漪 + 光标（屏幕空间，恒定尺寸） */}
      {ripple >= 0 && (
        <div style={{
          position: 'absolute', left: cx - RP / 2, top: cy - RP / 2, width: RP, height: RP, borderRadius: RP / 2,
          border: `${3 * (RP / 80)}px solid ${alpha(L.accent, (1 - ripple) * 0.9)}`, background: alpha(L.accent, (1 - ripple) * 0.12),
          transform: `scale(${(0.3 + EASE.out(ripple) * 1.2).toFixed(3)})`,
        }} />
      )}
      <div style={{ position: 'absolute', left: cx, top: cy, opacity: intro }}>
        <Cursor press={press} size={CS} />
      </div>
    </AbsoluteFill>
  );
};
