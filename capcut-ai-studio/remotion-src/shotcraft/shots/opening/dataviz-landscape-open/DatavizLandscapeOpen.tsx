/**
 * DatavizLandscapeOpen — 暗场支流线束地景开场
 * 配方卡: references/shots/opening/dataviz-landscape-open.md
 *
 * 第二轮重设计（石墨 · 荧光黄绿 · 真透视地景）：
 * - look = lime。不再是平面 SVG 横移：整片线束画在一张真透视的地平面上（针孔投影，相机高 220、焦距 1100），
 *   一条荧光黄绿主干从镜头脚下蜿蜒奔向画面右 1/3 处的消失点（汇点），11 条灰绿支流从两侧画外切向汇入。
 *   景深 / 视差 / 雾全部由投影深度算出来：近处线条又宽又虚（按深度分进模糊层）、中景锐利、远处变细隐入地平线。
 * - 相机低空沿河道前飞 + 横向缓移（dolly + truck），整段 bezier 减速：开场即在飞、收尾缓停接字标，不急刹。
 * - 中景支流上钉 3–6 枚标签（立杆图钉 + 等宽编号胶囊 + 数据流名），随透视逐渐变大、向两侧散开；
 *   隐喻：每条支流是一个镜头，汇成主干这一支成片；
 *   生长完成后沿线有亮脉冲低速流向汇点（数据在流）。
 * - 收尾：消失点亮起一团黄绿光（交棒亮部），天空里落一行大标题（两部分，第二部分强调色；眉题 = 品牌名），
 *   结尾帧是完整的海报。
 *
 * 时间表（30fps，共 180f）：
 *   0–10    从深场浮出（地平线光带首帧就在）
 *   0–36    主干由近及远 draw-on（out-cubic），笔尖光点
 *   8–70    支流错峰生长（每条 4–6f，近处先），笔尖光点
 *   44–104  标签非均匀错峰立起（图钉过冲 → 立杆 → 胶囊去模糊），104f 后不再新增
 *   60–180  流动脉冲；相机全程前飞，140f 后明显减速
 *   104–140 标题：眉题 + 两行逐词升起；汇点光 120f 起升亮
 *   140–180 hold：相机缓停、脉冲流动，海报落定
 *
 * [Agent Edit] o chu: kicker (dong nho tren tieu de; trong -> ten thuong hieu) / line1 + line2 (tieu de 2 phan, phan 2 mau
 * nhan) / tags (3-6 nhan noi tren cac nhanh: luong du lieu / nguon / tinh nang). Tieu de tu xuong dong + co chu theo do
 * dai that; chu "troi len" dung mat na co dem tren 0.32em (dau tieng Viet chong tang). Khung doc (native): cung mot dia
 * hinh phoi canh, duong chan troi ha xuong ~45-50% chieu cao, bau troi phia tren chua tieu de lon, mat dat phia duoi
 * keo dai toi sat ong kinh (nhanh chinh di tu day khung len diem tu); nhan to hon 1.35x.
 */
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import {EASE, FONT, bezier, mix, ramp} from '../../../fixtures/Polish';
import {Dust, LOOKS, Stage, alpha, type} from '../../../fixtures/Look';
import {BRAND} from '../../../fixtures/Brand';

const DUR = 180; // 6s @30fps
export const DATAVIZ_LANDSCAPE_OPEN_DURATION = DUR;

const L = LOOKS.lime;
const HY0 = 420; // 地平线（屏幕 y，横屏）
const F = 1100; // 焦距
const CAM_H = 220; // 相机离地高度
const SLOPE = 0.29; // 主干总体走向（dX/dZ）→ 消失点 x = 960 + F*SLOPE ≈ 1279（右 1/3）
const VPX = 960 + F * SLOPE;

// ───────────── 相机 ─────────────
const camPath = bezier(0.3, 0.3, 0.55, 1); // 匀速起步、尾段减速缓停
const CAM_DIST = 950;
const camAt = (frame: number) => {
  const t = Math.min(1, Math.max(0, frame / (DUR - 1)));
  const z = CAM_DIST * camPath(t);
  const lat = mix(-140, 110, EASE.smooth(t)); // 横向缓移：近远景相对错动 = 视差
  return {z, x: SLOPE * z + lat};
};

type P3 = {x: number; z: number};
const project = (p: P3, cam: {x: number; z: number}, HY = HY0, camH = CAM_H) => {
  const zr = p.z - cam.z;
  return {sx: 960 + (F * (p.x - cam.x)) / zr, sy: HY + (F * camH) / zr, zr};
};

// ───────────── 世界几何（地平面 X/Z）─────────────
const trunkX = (z: number) => SLOPE * z - 160 + 150 * Math.sin(z / 950);
const trunkDX = (z: number) => SLOPE + (150 / 950) * Math.cos(z / 950);

// 主干：-300 → 14000，近密远疏采样
const TRUNK: P3[] = Array.from({length: 261}, (_, i) => {
  const z = -300 + Math.pow(i / 260, 1.7) * 14300;
  return {x: trunkX(z), z};
});

// 三次贝塞尔按弧长等距重采样
const bez = (a: P3, b: P3, c: P3, d: P3, t: number): P3 => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    z: u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z,
  };
};
const resample = (at: (t: number) => P3, n: number) => {
  const raw = Array.from({length: 241}, (_, i) => at(i / 240));
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const total = cum[cum.length - 1];
  const out: P3[] = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    while (j < raw.length - 1 && cum[j] < target) j++;
    const f = (target - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    out.push({x: mix(raw[j - 1].x, raw[j].x, f), z: mix(raw[j - 1].z, raw[j].z, f)});
  }
  return out;
};

// 支流：起点在两侧画外，切向汇入主干（汇入点切线 = 主干切线）
type TribSpec = {side: number; z0: number; off: number; zm: number; lm: number; grow: number; w: number};
const TRIB_SPECS: TribSpec[] = [
  {side: -1, z0: -260, off: 700, zm: 1500, lm: 520, grow: 8, w: 5},
  {side: 1, z0: -120, off: 900, zm: 2100, lm: 640, grow: 11, w: 5},
  {side: -1, z0: 500, off: 1500, zm: 2700, lm: 760, grow: 16, w: 4.4},
  {side: 1, z0: 800, off: 1800, zm: 3300, lm: 820, grow: 20, w: 4.4},
  {side: -1, z0: 1400, off: 2300, zm: 3900, lm: 900, grow: 25, w: 4.2},
  {side: 1, z0: 1700, off: 2500, zm: 4600, lm: 980, grow: 29, w: 4.2},
  {side: -1, z0: 2500, off: 2900, zm: 5300, lm: 1050, grow: 34, w: 4.2},
  {side: 1, z0: 3100, off: 3200, zm: 6100, lm: 1150, grow: 38, w: 4.2},
  {side: -1, z0: 4100, off: 3600, zm: 7100, lm: 1250, grow: 43, w: 4.2},
  {side: 1, z0: 5000, off: 3900, zm: 8200, lm: 1350, grow: 47, w: 4.2},
  {side: 1, z0: -420, off: 260, zm: 980, lm: 380, grow: 4, w: 6}, // 贴着镜头右下方掠过的近景支流（大虚焦）
];
const TRIBS = TRIB_SPECS.map((s) => {
  const end: P3 = {x: trunkX(s.zm), z: s.zm};
  const dx = trunkDX(s.zm);
  const dl = Math.hypot(dx, 1);
  const p2: P3 = {x: end.x - (dx / dl) * s.lm, z: end.z - (1 / dl) * s.lm};
  const p0: P3 = {x: trunkX(s.z0) + s.side * s.off, z: s.z0};
  const p1: P3 = {x: p0.x + (end.x - p0.x) * 0.12, z: p0.z + (end.z - p0.z) * 0.5};
  return {...s, pts: resample((t) => bez(p0, p1, p2, end, t), 90)};
});

// ───────────── 线段渲染：按深度分层（近虚 / 中实 / 远雾）─────────────
const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
type Seg = {x1: number; y1: number; x2: number; y2: number; w: number; o: number; c: string};

const emitLine = (
  pts: P3[], g: number, cam: {x: number; z: number}, opts: {w: number; color: string; base: number; ramp?: boolean; pulse: (u: number) => number},
  sharp: Seg[], near: Seg[], HY: number, SH: number, camH: number,
) => {
  const n = pts.length - 1;
  const reach = g * n;
  const kMax = Math.min(n, Math.ceil(reach));
  for (let k = 0; k < kMax; k++) {
    const a = pts[k];
    const b0 = pts[k + 1];
    const f = Math.min(1, reach - k);
    const b = f < 1 ? {x: mix(a.x, b0.x, f), z: mix(a.z, b0.z, f)} : b0;
    if (a.z - cam.z < 70 || b.z - cam.z < 70) continue;
    const pa = project(a, cam, HY, camH);
    const pb = project(b, cam, HY, camH);
    if ((pa.sx < -200 && pb.sx < -200) || (pa.sx > 2120 && pb.sx > 2120) || (pa.sy > SH + 220 && pb.sy > SH + 220)) continue;
    const zr = (pa.zr + pb.zr) / 2;
    const u = (k + 0.5 * f) / n;
    const fog = 1 - smooth01(2600, 11000, zr); // 远处雾化
    const lift = opts.ramp ? 0.3 + 0.7 * Math.pow(u, 0.8) : 1; // 支流：源头淡、汇入处亮
    // 脉冲只在中远景显形：近处一段线在屏幕上很长，逐段明暗会读成台阶
    const pv = opts.pulse(u);
    const o = opts.base * fog * lift * mix(1, pv, smooth01(500, 1400, zr));
    if (o < 0.01) continue;
    const w = Math.max(0.9, Math.min(46, (opts.w * F) / zr));
    const nearW = 1 - smooth01(420, 1050, zr); // 近景权重 → 进模糊层
    const seg = {x1: pa.sx, y1: pa.sy, x2: pb.sx, y2: pb.sy, w, c: opts.color};
    if (nearW < 0.98) sharp.push({...seg, o: o * (1 - nearW)});
    if (nearW > 0.02) near.push({...seg, w: w * 1.3, o: o * nearW * 0.7});
  }
  // 笔尖
  if (g > 0 && g < 1) {
    const k = Math.min(n - 1, Math.floor(reach));
    const f = reach - k;
    const tip = {x: mix(pts[k].x, pts[k + 1].x, f), z: mix(pts[k].z, pts[k + 1].z, f)};
    if (tip.z - cam.z > 70) return project(tip, cam, HY, camH);
  }
  return null;
};

// ───────────── 标签（中景：编号 + 视频里的数据流 / 来源名，投影位置不变）─────────────
// 位置按投影逐帧核过：起止两端都错开（不叠、不压汇点、不出画），近处一枚随前飞明显变大
type LabelSpec = {trib: number; u: number; id: string; note: string; appear: number};
const LABEL_SLOTS = [
  {trib: 2, u: 0.6, appear: 44},
  {trib: 1, u: 0.75, appear: 53},
  {trib: 3, u: 0.6, appear: 62},
  {trib: 6, u: 0.3, appear: 73},
  {trib: 7, u: 0.45, appear: 84},
  {trib: 8, u: 0.45, appear: 96},
];
const LABELS = LABEL_SLOTS;

const Label: React.FC<{spec: LabelSpec; at: P3; frame: number; cam: {x: number; z: number}; HY: number; camH: number; boost: number}> = ({spec, at, frame, cam, HY, camH, boost}) => {
  const pr = project(at, cam, HY, camH);
  if (pr.zr < 200) return null;
  const k = boost * Math.min(1.7, Math.max(0.7, 1500 / pr.zr)); // 透视缩放（近大远小），钳住可读区间
  const fog = 1 - smooth01(3600, 8000, pr.zr);
  const pin = ramp(frame, spec.appear, 10, EASE.overshoot);
  const pinOp = ramp(frame, spec.appear, 4, EASE.out);
  const stem = ramp(frame, spec.appear + 2, 12, EASE.snappy);
  const tag = ramp(frame, spec.appear + 6, 14, EASE.snappy);
  // 立杆世界高度远低于相机高度 → 标签落在地平线以下、按深度上下错开（杆高≈相机高时所有标签都投影到地平线上挤成一排）
  const stemH = 44 * k;
  const fs = 25 * k;
  // 胶囊默认挂在立杆右侧；会出画右缘 → 翻到左侧（文字长短不定）
  const chipW = 36 * k + measureText(spec.id, FONT.mono, fs, 600) * 1.02 + 10 * k + measureText(spec.note, FONT.sans, fs * 0.82, 500) + 2;
  const chipL = pr.sx - 2 * k + chipW > 1890 ? pr.sx + 2 * k - chipW : pr.sx - 2 * k;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, opacity: fog}}>
      {/* 图钉（落在线上） */}
      <div style={{
        position: 'absolute', left: pr.sx - 6 * k, top: pr.sy - 6 * k, width: 12 * k, height: 12 * k, borderRadius: 2.5 * k,
        background: L.accent, opacity: pinOp, transform: `scale(${pin})`,
        boxShadow: `0 0 0 ${3 * k}px ${alpha(L.bg[2], 0.9)}, 0 0 ${18 * k}px ${alpha(L.accent, 0.7)}`,
      }} />
      {/* 立杆 */}
      <div style={{
        position: 'absolute', left: pr.sx - 0.75, top: pr.sy - 8 * k - stemH * stem, width: 1.5, height: stemH * stem,
        background: `linear-gradient(0deg, ${alpha(L.accent, 0.7)}, ${alpha(L.ink, 0.25)})`,
      }} />
      {/* ID 胶囊 */}
      <div style={{
        position: 'absolute', left: chipL, top: pr.sy - 8 * k - stemH - 46 * k + (1 - tag) * 14 * k,
        height: 46 * k, padding: `0 ${14 * k}px 0 ${12 * k}px`, borderRadius: 10 * k, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 10 * k, whiteSpace: 'nowrap',
        background: alpha('#141711', 0.82), border: `1px solid ${alpha(L.ink, 0.12)}`,
        boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 ${10 * k}px ${28 * k}px ${alpha('#000000', 0.5)}`,
        opacity: tag, filter: tag < 0.98 ? `blur(${((1 - tag) * 6).toFixed(2)}px)` : undefined,
      }}>
        <div style={{width: 7 * k, height: 7 * k, borderRadius: 4 * k, background: L.accent}} />
        <span style={{fontFamily: FONT.mono, fontSize: fs, fontWeight: 600, color: L.ink, letterSpacing: '0.02em'}}>{spec.id}</span>
        <span style={{fontFamily: FONT.sans, fontSize: fs * 0.82, fontWeight: 500, color: L.ink3}}>{spec.note}</span>
      </div>
    </div>
  );
};

// 均衡折行：行数不变、宽度收到最窄（避免末行只剩一个词）
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

// 逐词升起（遮罩上留 0.32em、下留 0.26em：越南语叠加声调符号不被裁掉）
const RiseWords: React.FC<{words: {t: string; start: number}[]; frame: number; each: number}> = ({words, frame, each}) => (
  <span style={{whiteSpace: 'nowrap'}}>
    {words.map((w, i) => {
      const p = EASE.snappy(Math.min(1, Math.max(0, (frame - w.start) / each)));
      return (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          <span style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em'}}>
            <span style={{display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))`}}>{w.t}</span>
          </span>
        </React.Fragment>
      );
    })}
  </span>
);

// ───────────── 组件 ─────────────
export const DatavizLandscapeOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const {height: SH} = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', '') || BRAND.name;
  const line1 = useText('line1', 'Mọi luồng dữ liệu,');
  const line2 = useText('line2', 'về một nơi.');
  const tags = useList('tags', ['Đơn hàng', 'Khách hàng', 'Tồn kho', 'Thanh toán', 'Vận chuyển', 'Đánh giá']).slice(0, 6);
  // 标签：n 枚按 6 个已核过的位置均匀取用（编号 + 文字）
  const nT = tags.length;
  const labels: LabelSpec[] = tags.map((t, i) => {
    const slot = LABELS[nT <= 1 ? 2 : Math.round((i * 5) / (nT - 1))];
    return {...slot, id: `#${String(i + 1).padStart(2, '0')}`, note: t};
  });
  const labelPts = labels.map((l) => {
    const pts = TRIBS[l.trib].pts;
    return {p: pts[Math.round(l.u * (pts.length - 1))]};
  });

  // 标题排版：横屏左上天空（108px，两部分各 ≤2 行，总高 ≤ 300）；竖屏 200px 级、可 4 行，天空在上半
  const TW = portrait ? 1680 : 1240;
  let TS = portrait ? 210 : 108;
  const wrapAll = (size: number) => {
    const a = line1 ? balanced(line1, fonts.sans, size, TW, 650, 2) : [];
    const b = line2 ? balanced(line2, fonts.sans, size, TW, 650, 2) : [];
    return {a, b};
  };
  let parts = wrapAll(TS);
  const maxH = portrait ? 1000 : 300;
  const nLines = parts.a.length + parts.b.length;
  if (nLines * TS * 1.12 > maxH) {
    TS = Math.max(portrait ? 130 : 64, maxH / (nLines * 1.12));
    parts = wrapAll(TS);
  }
  TS = Math.min(TS, ...[...parts.a, ...parts.b].map((l) => fitSize(l, {family: fonts.sans, size: TS, maxWidth: TW, weight: 650, minSize: 48})));
  const TLH = TS * 1.12;
  const titleTop = portrait ? 300 : 128;
  const kickSize = portrait ? 46 : 28;
  const titleY = titleTop + (kicker ? kickSize * 1.3 + (portrait ? 40 : 26) : 0);
  const titleBottom = titleY + (parts.a.length + parts.b.length) * TLH;
  const HY = portrait ? Math.max(SH * 0.4, titleBottom + 300) : HY0;
  // 竖屏：地面占画面一大半 → 相机抬高，让中景（标签层）在纵向铺开，而不是全挤在地平线下一窄条
  const camH = portrait ? CAM_H * Math.max(1, (SH - HY) / (1080 - HY0)) : CAM_H;
  // 逐词升起：第一部分从 110f 起、词间 ≤5f；第二部分先换气 6f；整段在 ~146f 前落定
  const allWords = [...parts.a, ...parts.b].join(' ').split(/\s+/).filter(Boolean).length;
  const gap = Math.min(5, 26 / Math.max(1, allWords));
  let wi = 0;
  const mkRows = (rows: string[], extra: number) => rows.map((r) => r.split(/\s+/).filter(Boolean).map((t) => ({t, start: 110 + extra + (wi++) * gap})));
  const rowsA = mkRows(parts.a, 0);
  const rowsB = mkRows(parts.b, parts.a.length ? 6 : 0);

  const cam = camAt(frame);
  const fadeUp = ramp(frame, 0, 12, EASE.out);
  const VPY = HY;

  const sharp: Seg[] = [];
  const near: Seg[] = [];
  const tips: {sx: number; sy: number; zr: number; trunk: boolean}[] = [];

  // 流动脉冲：生长完后沿线流向汇点的亮脉冲（窄峰，低速）
  const flowIn = (end: number) => ramp(frame, end, 24, EASE.smooth);
  const pulseFn = (end: number, n: number, speed: number, seed: number) => {
    const on = flowIn(end);
    return (u: number) => {
      const ph = u * n - frame * speed + seed;
      const c = Math.cos(ph * Math.PI * 2);
      return 0.7 + on * 0.55 * Math.pow(Math.max(0, c), 4);
    };
  };

  const trunkG = ramp(frame, 0, 36, EASE.out);
  TRIBS.forEach((t, i) => {
    const g = ramp(frame, t.grow, 34, EASE.out);
    const tip = emitLine(t.pts, g, cam, {w: t.w, color: L.ink2, base: 0.62, ramp: true, pulse: pulseFn(t.grow + 34, 2.2, 0.018, i * 0.37)}, sharp, near, HY, SH, camH);
    if (tip) tips.push({...tip, trunk: false});
  });
  const tTip = emitLine(TRUNK, trunkG, cam, {w: 11, color: L.accent, base: 0.95, pulse: pulseFn(36, 4, 0.022, 0)}, sharp, near, HY, SH, camH);
  if (tTip) tips.push({...tTip, trunk: true});
  const trunkSegs = sharp.filter((s) => s.c === L.accent);

  // 地面点阵：与世界锁定的网格，前飞时从远处涌来
  // [Agent Edit] bo luoi cham mat dat (luoi cham trang tri, ke ca khi khong co nen anh)
  // [Agent Edit] nen anh AI: bo nen toi + bui troi + mat dat toi (Stage tu trong suot); chu tren troi co bong toi
  const bd = useBackdrop();
  const TSH = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  const handoff = ramp(frame, 118, 50, EASE.swift);
  const lineRender = (s: Seg, i: number) => (
    <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} strokeWidth={s.w} strokeOpacity={s.o} strokeLinecap="butt" />
  );
  const kickP = ramp(frame, 104, 14, EASE.out);

  return (
    <AbsoluteFill style={{background: bd ? 'transparent' : L.bg[2], overflow: 'hidden'}}>
      <AbsoluteFill style={{opacity: 0.35 + 0.65 * fadeUp}}>
        <Stage look={L} keyLight={{x: VPX / 1920, y: HY / SH}} fill={{x: 0.12, y: 0.95}} horizon={HY / SH} intensity={0.55} grain={0.1} vignette={0.6}>
          {/* 天空里的极淡浮尘 */}
          {!bd && <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: HY, overflow: 'hidden'}}>
            <Dust look={L} count={26} seed={7} drift={0.12} opacity={0.35} color={L.ink2} />
            {portrait && <div style={{position: 'absolute', left: 0, right: 0, top: 1080, height: 1080}}><Dust look={L} count={26} seed={19} drift={0.12} opacity={0.3} color={L.ink2} /></div>}
          </div>}
          {/* 地面：地平线以下略亮一档的冷灰绿，向近处压暗 */}
          {!bd && <div style={{
            position: 'absolute', left: 0, right: 0, top: HY, height: SH - HY,
            background: `linear-gradient(180deg, ${alpha('#2a3122', 0.55)} 0%, ${alpha('#141811', 0.3)} ${portrait ? 18 : 30}%, ${alpha('#050604', 0)} 100%)`,
          }} />}
          {/* 地平线发丝线 */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: HY - 0.5, height: 1,
            background: `linear-gradient(90deg, ${alpha(L.ink, 0)} 0%, ${alpha(L.ink, 0.16)} 40%, ${alpha(L.accent, 0.35)} 66%, ${alpha(L.ink, 0.12)} 85%, ${alpha(L.ink, 0)} 100%)`,
          }} />
        </Stage>

        <svg width={1920} height={SH} style={{position: 'absolute', inset: 0}}>
          <defs>
            <filter id="dv-near" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="11" /></filter>
            <filter id="dv-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7" /></filter>
            <radialGradient id="dv-tip">
              <stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
              <stop offset="0.3" stopColor={L.accent} stopOpacity={0.35} />
              <stop offset="1" stopColor={L.accent} stopOpacity={0} />
            </radialGradient>
          </defs>
          {/* 主干泛光（只给主角） */}
          <g filter="url(#dv-glow)" opacity={0.75}>
            {trunkSegs.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={L.accent} strokeWidth={s.w * 3} strokeOpacity={s.o * 0.45} strokeLinecap="butt" />)}
          </g>
          {sharp.map(lineRender)}
          {tips.map((t, i) => {
            const r = Math.max(3, Math.min(18, (t.trunk ? 7000 : 4200) / t.zr));
            return (
              <g key={i}>
                <circle cx={t.sx} cy={t.sy} r={r * 5} fill="url(#dv-tip)" />
                <circle cx={t.sx} cy={t.sy} r={r * 0.6} fill="#ffffff" />
              </g>
            );
          })}
        </svg>

        {/* 汇点交棒亮部：消失点一团黄绿光，收尾升亮 */}
        <div style={{
          position: 'absolute', left: VPX - 520, top: VPY - 260, width: 1040, height: 520, pointerEvents: 'none',
          background: `radial-gradient(50% 50% at 50% 50%, ${alpha('#f4ffd6', 0.55)} 0%, ${alpha(L.accent, 0.22)} 22%, ${alpha(L.accent, 0)} 70%)`,
          opacity: 0.25 + 0.75 * handoff, mixBlendMode: 'screen',
        }} />
        <div style={{
          position: 'absolute', left: VPX - 4, top: VPY - 4, width: 8, height: 8, borderRadius: 4, background: '#f6ffe0',
          boxShadow: `0 0 18px 6px ${alpha(L.accent, 0.6)}`, opacity: 0.4 + 0.6 * handoff,
        }} />

        {/* 远的先画、近的后画：近处胶囊正确遮住远处图钉 */}
        {labels.map((l, i) => ({l, p: labelPts[i].p, i}))
          .sort((a, b) => b.p.z - a.p.z)
          .map(({l, p, i}) => (frame >= l.appear ? <Label key={i} spec={l} at={p} frame={frame} cam={cam} HY={HY} camH={camH} boost={portrait ? 1.7 : 1} /> : null))}

        {/* 近景大虚焦层（在标签之上：前景掠过） */}
        <svg width={1920} height={SH} style={{position: 'absolute', inset: 0}}>
          <g filter="url(#dv-near)">{near.map(lineRender)}</g>
        </svg>
      </AbsoluteFill>

      {/* 标题：天空左上，收尾落字 */}
      <div style={{position: 'absolute', left: 120, top: titleTop}}>
        {kicker ? (
          <div style={{
            fontFamily: FONT.mono, fontSize: kickSize, fontWeight: 600, color: L.accent, letterSpacing: '0.12em', lineHeight: 1.3, whiteSpace: 'nowrap', textShadow: TSH,
            opacity: kickP, transform: `translateY(${(1 - ramp(frame, 104, 18, EASE.snappy)) * 12}px)`,
          }}>
            {kicker}
          </div>
        ) : null}
      </div>
      {[...rowsA.map((r) => ({r, c: L.ink})), ...rowsB.map((r) => ({r, c: L.accent}))].map(({r, c}, i) => (
        <div key={i} style={{position: 'absolute', left: 120 - TS * 0.04, top: titleY + i * TLH, ...type(TS, 650), lineHeight: 1.12, color: c, textShadow: TSH}}>
          <RiseWords words={r} frame={frame} each={20} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
