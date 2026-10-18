// 文字视频遮罩（text-as-mask）——超粗大标题字内部透出缓慢平移的产品画面，结尾字形放大溢出、
// 内部画面接管全屏。字是门，产品在门里。
//
// 第二轮重设计（瓷白舞台 · 暗色实时面板）：
// - look = porcelain。冷白瓷舞台上切出一个 470px 的 Black 字重「SCALE」——字形是一扇窗：
//   窗外的瓷白舞台有主光与暗角，窗下投一层带色相的软影（字像被"挖"进舞台）。
// - 窗里是为镜头设计的暗色实时面板「video-shotcraft · Render throughput」（渲染农场看板）：钴蓝→青的流式面积图一直在向左流、
//   渲染帧数在计数、渲染队列柱状图在呼吸——大块的饱和色与亮线让笔画里一眼看出"里面有个活的产品"，
//   而不是原版那种白卡（白字里透白卡 = 普通白字）。
// - 字的入场：遮罩从基线向上擦出（clip 从下往上收），字整体 1.04→1 落定；眉题字距收拢、副题升起。
// - 接管：先吸一口气（字 1→0.965，副题与眉题退场，8f）→ 指数冲入（对数空间 t^1.8，24f 到 46×，
//   每帧放大比例越来越大 = 越冲越快）；放大原点钉在 L 竖笔实心处；内容层 1/S 反向补偿不畸变；
//   冲入后段无遮罩全屏层淡入补齐字缝；面板 1.32→1 用 expo-out 落到标准构图，晚冲入 6f 收敛（跟随）。
// - 收尾：完整的暗色面板做最后一张海报，流式图仍在缓慢流动（不是死帧）。
//
// 时间表（30fps，共 165f）：
//   0–18    瓷白舞台 + 字形自基线擦出、1.04→1 落定；6–26 眉题、14–32 副题
//   18–96   字内面板漂移（translateX +150→-150，两端轻缓）；面板自身流式图/计数一直在动
//   96–104  吸气：字 1→0.965，眉题/副题 exit 退场
//   104–128 冲入：遮罩 0.965→46×（对数空间 t^1.8 加速），~121–126 接管层淡入
//   104–132 面板 1.32→1、漂移归零（expo-out，落定比冲入晚 6f）
//   132–165 hold：全屏面板，流式图缓慢流动
//
// [Agent Edit] o chu: word (TU lam cua so — 1-2 tu ngan, in hoa; khung doc tu xep 2 dong to hon) / kicker (dong nho tren
// tu; khong co -> ten thuong hieu cua video) / subtitle (cau phu duoi tu) / screen_title (tieu de bang dieu khien = tam
// "poster" cuoi). o anh screen (tuy chon): anh / khung hinh dam mau THAT thay bang dieu khien ve san (cover).
// Mat na chu: SVG <clipPath><text> NAM TRONG DOM (dung font cua shot, du dau tieng Viet) thay cho mask data-URI (anh SVG
// khong doc duoc web font). Diem phong to (origin) phai nam trong net dac: tim tu dong bang bien doi khoang cach tren
// canvas (net day nhat, gan giua) — chu nao cung dung; MAX_S tang theo do day net de luon phu kin khung khi chuyen lop.
// Khung doc (portrait.mode = 'native'): bang dieu khien bo cuc doc rieng (phu kin chieu cao), chu xep doc can giua.
import { useBrand, useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate } from 'remotion';
import { EASE, bezier, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const TEXT_AS_MASK_DURATION = 165;

const L = LOOKS.porcelain;
const W = 1920;

// —— 节拍 ——
const IN_END = 18;
const DRIFT0 = 18;
const DRIFT1 = 96;
const BREATH0 = 96;
const RUSH0 = 104;
const RUSH1 = 128;
const LAND1 = 132;
const DASH_S0 = 1.32;

// —— 字形几何 ——
type Glyphs = { lines: string[]; fs: number; ls: number; baselines: number[]; top: number; bottom: number };
// 放大原点：字形内"最厚"的实心点（距离变换最大值，偏向画面中线），换词自动重算
type Origin = { x: number; y: number; d: number };
const originCache = new Map<string, Origin>();
const findOrigin = (g: Glyphs, family: string, H: number): Origin => {
  const key = `${family}|${H}|${g.fs}|${g.lines.join('/')}|${g.baselines.join(',')}`;
  const hit = originCache.get(key);
  if (hit) return hit;
  const k = 0.25;
  const cw = Math.round(W * k);
  const ch = Math.round(H * k);
  let res: Origin = { x: W / 2, y: g.baselines[0] - g.fs * 0.36, d: g.fs * 0.09 };
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `900 ${g.fs * k}px ${family}`;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(g.ls * k).toFixed(2)}px`;
      g.lines.forEach((l, i) => ctx.fillText(l, cw / 2, g.baselines[i] * k));
      const a = ctx.getImageData(0, 0, cw, ch).data;
      // 两遍 chamfer 距离变换（3-4 权重）
      const BIG = 1e9;
      const dist = new Float32Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) dist[i] = a[i * 4 + 3] > 200 ? BIG : 0;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const i = y * cw + x;
          if (!dist[i]) continue;
          let v = dist[i];
          if (x > 0) v = Math.min(v, dist[i - 1] + 3);
          if (y > 0) {
            v = Math.min(v, dist[i - cw] + 3);
            if (x > 0) v = Math.min(v, dist[i - cw - 1] + 4);
            if (x < cw - 1) v = Math.min(v, dist[i - cw + 1] + 4);
          }
          if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) v = Math.min(v, 3);
          dist[i] = v;
        }
      let best = -1;
      for (let y = ch - 1; y >= 0; y--)
        for (let x = cw - 1; x >= 0; x--) {
          const i = y * cw + x;
          if (!dist[i]) continue;
          let v = dist[i];
          if (x < cw - 1) v = Math.min(v, dist[i + 1] + 3);
          if (y < ch - 1) {
            v = Math.min(v, dist[i + cw] + 3);
            if (x < cw - 1) v = Math.min(v, dist[i + cw + 1] + 4);
            if (x > 0) v = Math.min(v, dist[i + cw - 1] + 4);
          }
          dist[i] = v;
          // 评分：厚度为主，轻微偏向画面中线（冲入时要拉回中线的距离短）
          const score = v - (Math.abs(x - cw / 2) / cw) * 6;
          if (score > best) {
            best = score;
            res = { x: x / k, y: y / k, d: v / 3 / k };
          }
        }
    }
  }
  originCache.set(key, res);
  return res;
};

// —— 窗里的产品：暗色实时看板（W×H 作画；竖屏单独纵向排版）——
const D = { bg: '#0a0f1e', panel: '#0f1730', panel2: '#131d3b', line: 'rgba(150,180,255,0.12)', ink: '#eef3ff', ink2: '#9aa8c8', ink3: '#5d6a8a', blue: '#4d7cff', teal: '#19d3b4' };

// 确定性流式曲线：u = 横向样本位置（随帧递增 = 数据向左流）
const wave = (u: number) => 0.52 + 0.17 * Math.sin(u * 0.11) + 0.09 * Math.sin(u * 0.31 + 1.3) + 0.05 * Math.sin(u * 0.73 + 0.4) + 0.12 * Math.max(0, Math.sin(u * 0.045 - 0.6));

type DashText = { title: string; brand: string; sans: string; mono: string };
const Card: React.FC<{ x: number; y: number; w: number; h: number; pad: number; children: React.ReactNode }> = ({ x, y, w, h, pad, children }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: pad * 0.8, background: `linear-gradient(180deg, ${D.panel2}, ${D.panel})`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${D.line}`, boxSizing: 'border-box', padding: `${pad}px ${pad * 1.15}px`, overflow: 'hidden' }}>{children}</div>
);

const Dashboard: React.FC<{ frame: number; H: number; t: DashText }> = ({ frame, H, t }) => {
  const portrait = H > 1080 * 1.2;
  const u = portrait ? 1.7 : 1; // 竖屏字号/控件放大（手机上 1920 舞台缩到 1080 宽）
  const flow = frame * 0.55; // 流速（样本/帧）
  const reqs = 1.92 + 0.56 * ramp(frame, 10, 96, EASE.out);
  const bars = Array.from({ length: 24 }, (_, i) => 0.3 + 0.6 * Math.abs(Math.sin(i * 1.7 + frame * 0.05)) * (0.6 + 0.4 * Math.sin(i * 0.45)));
  const regions: [string, number][] = [['Hà Nội', 0.92], ['TP.HCM', 0.74], ['Đà Nẵng', 0.58], ['Cần Thơ', 0.41]];
  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ fontSize: 22 * u, fontWeight: 650, letterSpacing: '0.1em', color: D.ink2, whiteSpace: 'nowrap' }}>{children}</div>;

  // 版式：横屏 = 原版（侧栏 230 + 右侧网格）；竖屏 = 顶部页眉 + 3 KPI 一行 + 高主图 + 2×2 区域
  const M = portrait ? 90 : 0;
  const gx = portrait ? M : 290; // 内容区左
  const gw = portrait ? W - 2 * M : 1570;
  const headY = portrait ? Math.round(H * 0.06) : 44;
  const kpiY = portrait ? headY + 330 : 150;
  const kpiH = portrait ? 380 : 200;
  const chartY = kpiY + kpiH + (portrait ? 40 : 26);
  const regH = portrait ? 520 : 170;
  const regY = portrait ? H - Math.round(H * 0.06) - regH : 870;
  const chartH = regY - (portrait ? 40 : 24) - chartY;
  const CW = gw - 10;
  const CH = chartH - (portrait ? 170 : 90);
  const N = 96;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const x = (i / N) * CW;
    const y = CH - wave(i + flow) * CH * 0.92;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${CW} ${CH} L0 ${CH} Z`;
  const last = pts[pts.length - 1];
  const kw = (gw - 2 * 24 * u) / 3;
  const titleSize = fitSize(t.title, { family: t.sans, size: 56 * u, maxWidth: portrait ? gw - 380 : 1060, weight: 720, minSize: 30 * u });
  const big = 96 * (portrait ? 1.45 : 1);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, background: `radial-gradient(ellipse 70% 60% at 60% 30%, #12204a 0%, ${D.bg} 70%)`, fontFamily: t.sans, color: D.ink }}>
      {/* 侧栏（横屏）/ 品牌行（竖屏） */}
      {portrait ? (
        t.brand ? (
          <div style={{ position: 'absolute', left: M, top: headY, display: 'flex', alignItems: 'center', gap: 22 }}>
            <ShotcraftMark size={64} tone="dark" />
            <div style={{ fontSize: 44, fontWeight: 700, whiteSpace: 'nowrap' }}>{t.brand}</div>
          </div>
        ) : null
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 230, borderRight: `1px solid ${D.line}`, padding: '36px 26px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShotcraftMark size={40} tone="dark" />
            <div style={{ fontSize: fitSize(t.brand, { family: t.sans, size: 28, maxWidth: 120, weight: 700, minSize: 16 }), fontWeight: 700, whiteSpace: 'nowrap' }}>{t.brand}</div>
          </div>
          {['Tổng quan', 'Doanh thu', 'Khách hàng', 'Báo cáo', 'Cài đặt'].map((n, i) => (
            <div key={n} style={{ marginTop: i ? 14 : 54, fontSize: 23, fontWeight: i === 1 ? 650 : 500, color: i === 1 ? D.ink : D.ink3, padding: '10px 14px', borderRadius: 10, background: i === 1 ? 'rgba(77,124,255,0.16)' : 'transparent', whiteSpace: 'nowrap' }}>{n}</div>
          ))}
        </div>
      )}
      {/* 页眉 */}
      <div style={{ position: 'absolute', left: gx, top: portrait ? headY + 110 : headY, display: 'flex', alignItems: 'center', gap: 20 * u }}>
        <div style={{ ...type(titleSize, 720), lineHeight: 1.2, color: D.ink, whiteSpace: 'nowrap', fontFamily: t.sans }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u, padding: `${8 * u}px ${16 * u}px`, borderRadius: 999, background: 'rgba(25,211,180,0.14)', color: D.teal, fontSize: 24 * u, fontWeight: 650, whiteSpace: 'nowrap', flex: 'none' }}>
          <div style={{ width: 10 * u, height: 10 * u, borderRadius: 5 * u, background: D.teal, boxShadow: `0 0 12px ${D.teal}`, opacity: 0.6 + 0.4 * Math.sin(frame / 5) }} />Trực tiếp
        </div>
      </div>
      {!portrait && <div style={{ position: 'absolute', right: 60, top: 54, fontSize: 24, color: D.ink2, padding: '10px 18px', borderRadius: 12, boxShadow: `0 0 0 1px ${D.line}` }}>24 giờ qua</div>}
      {/* KPI */}
      <Card x={gx} y={kpiY} w={portrait ? kw : 520} h={kpiH} pad={26 * u}>
        <Label>LƯỢT TRUY CẬP</Label>
        <div style={{ ...type(big, 760), marginTop: 14 * u, fontFamily: t.sans }}>{reqs.toFixed(2).replace('.', ',')}M</div>
      </Card>
      <Card x={portrait ? gx + kw + 24 * u : 834} y={kpiY} w={portrait ? kw : 500} h={kpiH} pad={26 * u}>
        <Label>PHẢN HỒI</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 14 * u, flexWrap: 'wrap' }}>
          <div style={{ ...type(big, 760), fontFamily: t.sans }}>42<span style={{ fontSize: big / 2, color: D.ink2, marginLeft: 6 }}>s</span></div>
          <div style={{ fontSize: 26 * u, fontWeight: 650, color: D.teal }}>−18%</div>
        </div>
      </Card>
      <Card x={portrait ? gx + 2 * (kw + 24 * u) : 1358} y={kpiY} w={portrait ? kw : 502} h={kpiH} pad={26 * u}>
        <Label>HÀNG ĐỢI</Label>
        <svg width={portrait ? kw - 70 * u : 440} height={100 * u} viewBox="0 0 440 100" preserveAspectRatio="none" style={{ marginTop: 16 * u, display: 'block' }}>
          {bars.map((b, i) => <rect key={i} x={i * 18.5} y={100 - b * 100} width={12} height={b * 100} rx={3} fill={i > 17 ? D.teal : D.blue} opacity={0.5 + 0.5 * b} />)}
        </svg>
      </Card>
      {/* 主图：流式面积图 */}
      <Card x={gx} y={chartY} w={gw} h={chartH} pad={26 * u}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Label>LƯỢT / GIÂY</Label>
          <div style={{ fontSize: 22 * u, color: D.ink3, fontFamily: t.mono }}>mỗi 1 giây</div>
        </div>
        <svg width={CW} height={CH} style={{ position: 'absolute', left: 4, top: portrait ? 140 : 70, overflow: 'visible' }}>
          <defs>
            <linearGradient id="tam-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={D.blue} stopOpacity={0.55} />
              <stop offset="1" stopColor={D.blue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tam-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={D.blue} />
              <stop offset="1" stopColor={D.teal} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={CW} y1={CH * g} y2={CH * g} stroke={D.line} strokeWidth={1.5} />)}
          <path d={area} fill="url(#tam-area)" />
          <path d={line} fill="none" stroke="url(#tam-line)" strokeWidth={5 * u} strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r={10 * u} fill={D.teal} />
          <circle cx={last[0]} cy={last[1]} r={22 * u} fill={D.teal} opacity={0.22} />
        </svg>
      </Card>
      {/* 区域 */}
      <Card x={gx} y={regY} w={gw} h={regH} pad={26 * u}>
        <div style={{ display: 'grid', gridTemplateColumns: portrait ? '1fr 1fr' : 'repeat(4, 1fr)', columnGap: 48 * u, rowGap: 60, alignContent: 'center', height: '100%' }}>
          {regions.map(([name, v]) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 * u }}>
                <span style={{ color: D.ink2 }}>{name}</span>
                <span style={{ fontWeight: 650 }}>{Math.round(v * 100)}%</span>
              </div>
              <div style={{ marginTop: 14 * u, height: 12 * u, borderRadius: 6 * u, background: 'rgba(150,180,255,0.1)' }}>
                <div style={{ width: `${v * 100}%`, height: '100%', borderRadius: 6 * u, background: `linear-gradient(90deg, ${D.blue}, ${D.teal})` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// 均衡折行（不留单词孤行）
const balancedWrap = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

export const TextAsMask: React.FC = () => {
  const f = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = H > 1080 * 1.2;
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const word = useText('word', 'DỮ LIỆU').trim().toUpperCase();
  const kicker = useText('kicker', '').trim() || (brand?.name ?? '').trim();
  const subtitle = useText('subtitle', 'Mọi chỉ số kinh doanh, cập nhật theo từng giây.').trim();
  const screenTitle = useText('screen_title', 'Hiệu suất kinh doanh');
  const shot = useImage('screen');
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  // —— 字形排版：Black 字重、字距 −0.047em（原版 470px / −22）；横屏 1 行（宽 ≤ 80%），竖屏按词折成 ≤3 行放大 ——
  const FAM = fonts.sans;
  const LSE = -22 / 470;
  const maxW = W * (portrait ? 0.86 : 0.8);
  const fsMax = portrait ? 1000 : 470;
  let lines = portrait ? wrapLines(word, FAM, fsMax, maxW, 900, 3) : [word];
  if (portrait && lines.length === 1 && word.includes(' ')) {
    // 两个词以上：竖屏优先上下两行（字更大）
    const ws = word.split(/\s+/);
    const h = Math.ceil(ws.length / 2);
    lines = [ws.slice(0, h).join(' '), ws.slice(h).join(' ')];
  }
  const fs = Math.min(...lines.map((l) => fitSize(l, { family: FAM, size: fsMax, maxWidth: maxW, weight: 900, letterSpacingEm: LSE, minSize: 120 })));
  const ls = LSE * fs;
  const cap = fs * 0.72;
  const acc = fs * 0.3; // 大写字母上的叠加声调（Ữ Ậ）高出 ~0.3em
  const lineGap = cap + acc + fs * 0.12;
  const kickerH = kicker ? (portrait ? 80 : 50) + (portrait ? 90 : 60) : 0;
  const subSize = portrait ? 72 : 40;
  const subLines = subtitle ? balancedWrap(subtitle, FAM, subSize, portrait ? W - 260 : 1500, 500, 2) : [];
  const subGap = fs * 0.2 + (portrait ? 80 : 50); // 下加声调（ệ ộ 的点）在基线下 ~0.2em
  const subH = subLines.length ? subGap + subLines.length * subSize * 1.3 : 0;
  const wordH = acc + cap + (lines.length - 1) * lineGap;
  const blockH = kickerH + wordH + subH;
  const top0 = Math.round(H / 2 - blockH / 2);
  const wordTop = top0 + kickerH;
  const baselines = lines.map((_, i) => wordTop + acc + cap + i * lineGap);
  const g: Glyphs = { lines, fs, ls, baselines, top: wordTop, bottom: baselines[baselines.length - 1] };
  const O = findOrigin(g, FAM, H);
  const ORIGIN = `${O.x.toFixed(1)}px ${O.y.toFixed(1)}px`;
  // 放大倍率：按笔画厚度配，保证接管层淡入时（rush^… ≈ 0.86）实心笔画已盖住整个画幅（原版 46×）
  const halfDiag = Math.hypot(W / 2, H / 2);
  const MAX_S = Math.min(160, Math.max(46, (1.75 * halfDiag) / Math.max(8, O.d)));

  // 入场：遮罩从上向下擦出 + 1.04→1 落定
  const intro = ramp(f, 0, IN_END, EASE.snappy);
  const wipe = ramp(f, 0, 16, EASE.out);
  const introS = 1.04 - 0.04 * intro;

  // 吸气 → 冲入（对数空间 ease-in：每帧放大比例越来越大）
  const breath = ramp(f, BREATH0, RUSH0 - BREATH0, EASE.swift);
  const rush = Math.pow(ramp(f, RUSH0, RUSH1 - RUSH0, EASE.linear), 1.8); // 对数空间里 t^1.8：越冲越快
  const s0 = introS * (1 - 0.035 * breath);
  const maskS = s0 * Math.pow(MAX_S / s0, rush);
  // 冲入时把实心笔画同步拉回画面中心（相机对准门洞）；内容层做同一变换的逆，产品画面不动
  const cdx = (W / 2 - O.x) * rush;
  const cdy = (H / 2 - O.y) * rush;
  const wrapT = `translate(${cdx.toFixed(2)}px, ${cdy.toFixed(2)}px) scale(${maskS})`;
  const innerT = `scale(${1 / maskS}) translate(${(-cdx).toFixed(2)}px, ${(-cdy).toFixed(2)}px)`;

  // 面板：漂移（两端轻缓）→ 冲入时归位（expo-out，晚 4f 收敛 = 跟随）
  const drift = ramp(f, DRIFT0, DRIFT1 - DRIFT0, bezier(0.3, 0, 0.7, 1));
  const land = ramp(f, RUSH0, LAND1 - RUSH0, EASE.snappy);
  const dx = (150 - 300 * drift) * (1 - land);
  // 漂移期面板上移，让流式图的亮线穿过字的腰线、面积渐变铺满字的下半截（竖屏按字块位置换算）
  const dy = (portrait ? Math.max(-500, Math.min(0, (wordTop + (g.bottom - wordTop) * 0.5) - H * 0.62)) : -110) * (1 - land);
  const dashS = DASH_S0 + (1 - DASH_S0) * land;
  // 接管层：笔画撑满全屏之后才淡入补齐字缝（更早 = 亮底上一层灰纱）
  const cover = interpolate(rush, [0.86, 0.95], [0, 1], clamp);
  const rim = 1 - interpolate(rush, [0, 0.25], [0, 1], clamp);
  // 眉题 / 副题
  const eyebrow = ramp(f, 6, 20, EASE.out);
  const sub = ramp(f, 14, 18, EASE.out);
  const out = 1 - ramp(f, BREATH0, 10, EASE.exit);

  const dash = (
    <div style={{ position: 'absolute', inset: 0, transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${dashS.toFixed(4)})`, transformOrigin: '50% 50%' }}>
      {shot ? (
        <div style={{ position: 'absolute', inset: 0, background: D.bg }}>
          <Img src={shot} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <Dashboard frame={f} H={H} t={{ title: screenTitle, brand: (brand?.name ?? '').trim() || 'Tổng quan', sans: FAM, mono: fonts.mono }} />
      )}
    </div>
  );
  const clipBottom = `inset(0 0 ${((1 - wipe) * (H - wordTop)).toFixed(1)}px 0)`;
  const textEls = (fill: string) =>
    lines.map((l, i) => (
      <text key={i} x={W / 2} y={baselines[i]} fill={fill} textAnchor="middle" style={{ fontFamily: FAM, fontSize: fs, fontWeight: 900, letterSpacing: `${ls.toFixed(2)}px` }}>
        {l}
      </text>
    ));

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.42, y: 0.12 }} fill={{ x: 0.85, y: 0.9 }} vignette={0.22} />
      {/* 字形遮罩定义（DOM 内 SVG：用镜头字体，越语声调完整） */}
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <clipPath id={`tam-clip-${uid}`} clipPathUnits="userSpaceOnUse">{textEls('#fff')}</clipPath>
        </defs>
      </svg>

      {/* 字形投影：窗被"挖"进舞台的一层带色相软影 */}
      <div style={{ position: 'absolute', inset: 0, clipPath: clipBottom }}>
        <svg width={W} height={H} style={{
          position: 'absolute', left: 0, top: 26, opacity: 0.2 * rim * intro, filter: 'blur(22px)', overflow: 'visible',
          transform: wrapT, transformOrigin: ORIGIN,
        }}>
          {textEls('#0c1a3a')}
        </svg>
      </div>

      {/* 遮罩层：wrapper 负责字形裁切 + 放大；inner 用 1/S 反向缩放抵消内容形变 */}
      <div style={{ position: 'absolute', inset: 0, clipPath: clipBottom }}>
        <div style={{ position: 'absolute', inset: 0, transform: wrapT, transformOrigin: ORIGIN, clipPath: `url(#tam-clip-${uid})` }}>
          <div style={{ position: 'absolute', inset: 0, transform: innerT, transformOrigin: ORIGIN }}>{dash}</div>
        </div>
      </div>

      {/* 接管层：同一运动变换的全屏面板，冲入后段淡入 */}
      {cover > 0 && <div style={{ position: 'absolute', inset: 0, opacity: cover }}>{dash}</div>}

      {/* 眉题（品牌 / kicker）+ 副题 */}
      {kicker ? (
        <div style={{ position: 'absolute', top: top0, width: '100%', textAlign: 'center', opacity: eyebrow * out }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: portrait ? 22 : 14, verticalAlign: 'middle' }}>
            {brand ? <ShotcraftMark size={portrait ? 72 : 44} tone="light" /> : null}
            <span style={{ fontFamily: FAM, fontSize: fitSize(kicker, { family: FAM, size: portrait ? 60 : 30, maxWidth: W - 400, weight: 700, minSize: 22 }), fontWeight: 700, color: L.ink, whiteSpace: 'nowrap', letterSpacing: `${(0.03 + (1 - eyebrow) * 0.3).toFixed(3)}em` }}>{kicker}</span>
          </span>
        </div>
      ) : null}
      {subLines.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', top: g.bottom + subGap + i * subSize * 1.3, width: '100%', textAlign: 'center', fontFamily: FAM, fontSize: subSize, fontWeight: 500,
          lineHeight: 1.3, letterSpacing: '-0.015em', color: i === subLines.length - 1 ? L.ink : L.ink2, opacity: sub * out, transform: `translateY(${((1 - sub) * 16).toFixed(2)}px)`, whiteSpace: 'nowrap',
        }}>
          {l}
        </div>
      ))}
    </AbsoluteFill>
  );
};
