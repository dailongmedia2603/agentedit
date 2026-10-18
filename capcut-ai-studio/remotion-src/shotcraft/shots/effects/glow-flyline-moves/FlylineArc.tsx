// flyline-arc —— 飞线连接
// 暗场 dashboard（tu ve, tieng Viet）压暗当底，左上卡→右下卡一条贝塞尔弧线"打"过去（22f, out-cubic 生长），
// 亮点头部领跑、亮头暗尾拖尾；到达帧目标卡描边脉冲点亮。随后第二条线接力打到上中卡。
// 收尾真静止：全部动画在 f86 前结束，之后所有元素冻结。
//
// 质感升级：本卡定位是暗场段落（md「库内第一张整卡住在暗场」），底图换 FakeDashboard 深色版并
// 压暗 0.65 + 暗角，飞线成为前景层；线体从"白线 + 深灰衬底"改为暗场版"白芯 + 两层靛蓝辉光"，
// butt 端分段消除珠串；光头加彗尾亮段与靛蓝光晕；起点亮起一个锚点、落点留下一个节点；
// 卡脉冲在暗场里改为提亮（强调色描边 + 外辉光 + 极淡卡面提亮），落点同帧一圈冲击环；颗粒防色带。
//
// [Agent Edit] Nen dashboard toi tu ve (FakeDashboard cua fixtures con chu tieng Anh / ten video-shotcraft) — giao dien
// tieng Viet trung tinh, logo / ten cua video o thanh ben (khong co -> an). O chu: title (ten trang dashboard) /
// labels (3 nhan the: the xuat phat -> the dich 1 -> the dich 2) / values (3 con so tuong ung). 3 the con lai la so lieu nen.
// Khung doc (portrait.mode = 'native'): dashboard kieu app dien thoai — tieu de trang + luoi 2 cot x 3 hang the lon,
// duong bay zic-zac A(trai tren) -> B(phai giua) -> C(trai duoi); thoi gian / do day net / xung sang giu nguyen.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, useBrand, fitSize } from '../../../runtime';
import React, { useId } from 'react';
import { interpolate, Easing } from 'remotion';
import { Grain, Vignette } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const FLYLINE_ARC_DURATION = 140; // ~4.7s：动画 f86 前结束，末 54f 真静止

type Pt = { x: number; y: number };

// 手写 cubic bezier 采样
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

const N = 100; // 采样段数
const GLOW = '128,138,255'; // 飞线辉光色（与暗场 dashboard 的强调色同族）

const clampX = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// 一条飞线：靛蓝辉光衬底 + 亮头暗尾白芯分段 + 光头领跑（条件挂载）
const Flyline: React.FC<{
  frame: number;
  start: number; // 生长起始帧
  haloId: string; // 光头径向渐变 ID（父组件按实例生成）
  p0: Pt; p1: Pt; p2: Pt; p3: Pt;
  k?: number; // khung doc: phong do day net / quang sang theo co the
}> = ({ frame, start, haloId, p0, p1, p2, p3, k = 1 }) => {
  const DUR = 22;
  if (frame < start) return null;
  const e = interpolate(frame, [start, start + DUR], [0, 1], { easing: Easing.out(Easing.cubic), ...clampX });
  const growing = frame < start + DUR;
  // 到达后 10f 内尾部亮度抹匀（ease-out）→ 之后完全静止
  const settle = interpolate(frame, [start + DUR, start + DUR + 10], [0, 1], { easing: Easing.out(Easing.quad), ...clampX });
  // 起点锚：生长前 6f 亮起
  const anchor = interpolate(frame, [start, start + 6], [0, 1], { easing: Easing.out(Easing.cubic), ...clampX });

  const pts: Pt[] = [];
  const nDrawn = Math.max(2, Math.ceil(e * N) + 1);
  for (let i = 0; i < nDrawn; i++) {
    const t = Math.min(i / N, e);
    pts.push(bez(p0, p1, p2, p3, t));
  }
  const head = bez(p0, p1, p2, p3, e);
  pts[pts.length - 1] = head;

  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // 亮头暗尾：每段按"离头距离"给 opacity；到达后 settle 抹匀到 1。butt 端，相邻段不叠加出珠串
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const tSeg = Math.min(i / N, e) / Math.max(e, 0.001); // 0 尾 → 1 头
    const grad = 0.3 + 0.7 * tSeg * tSeg;
    const op = grad + (1 - grad) * settle;
    segs.push(
      <line
        key={i}
        x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y}
        stroke="#f6f6ff" strokeWidth={3.5 * k} strokeLinecap="butt" strokeOpacity={op}
      />
    );
  }
  const comet = pts.slice(Math.max(0, pts.length - 9)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <g>
      {/* 起点锚 */}
      <circle cx={p0.x} cy={p0.y} r={9 * k * anchor} fill={`rgba(${GLOW},0.25)`} />
      <circle cx={p0.x} cy={p0.y} r={4.5 * k * anchor} fill="#ffffff" />
      {/* 辉光衬底：宽幅低透明 + 次宽中透明两层 */}
      <polyline points={poly} fill="none" stroke={`rgb(${GLOW})`} strokeWidth={18 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.1 + 0.04 * settle} />
      <polyline points={poly} fill="none" stroke="rgb(150,160,255)" strokeWidth={7 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.24} />
      {segs}
      {/* 光头 + 彗尾：仅生长期挂载，摘罩即真静止 */}
      {growing && (
        <g>
          <polyline points={comet} fill="none" stroke="#ffffff" strokeWidth={6 * k} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.55} />
          <circle cx={head.x} cy={head.y} r={40 * k} fill={`url(#${haloId})`} />
          <circle cx={head.x} cy={head.y} r={7 * k} fill="#ffffff" />
        </g>
      )}
      {/* 落点节点：到达后常驻 */}
      {!growing && (
        <g>
          <circle cx={p3.x} cy={p3.y} r={11 * k} fill={`rgba(${GLOW},0.22)`} />
          <circle cx={p3.x} cy={p3.y} r={5 * k} fill="#ffffff" />
        </g>
      )}
    </g>
  );
};

// 目标卡脉冲：暗场里提亮——强调色描边 + 外辉光 + 极淡卡面提亮；落点同帧一圈冲击环 —— 条件挂载
const CardPulse: React.FC<{
  frame: number;
  at: number; // 触发帧
  rect: { x: number; y: number; w: number; h: number; cx: number; cy: number };
  k?: number;
}> = ({ frame, at, rect, k = 1 }) => {
  if (frame < at) return null;
  // 扩散(起升)用 out-cubic 6f，消散 12f 到残余 0.25（被点亮的卡保持轻微描边，交代"已连接"）
  const amp =
    frame <= at + 6
      ? interpolate(frame, [at, at + 6], [0, 1], { easing: Easing.out(Easing.cubic), ...clampX })
      : interpolate(frame, [at + 6, at + 18], [1, 0.25], { easing: Easing.out(Easing.quad), ...clampX });
  const ring = interpolate(frame, [at, at + 14], [0, 1], { easing: Easing.out(Easing.cubic), ...clampX });
  return (
    <g>
      <defs>
        <filter id={`pulse-glow-${at}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={10 * k} />
        </filter>
      </defs>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={14 * k} fill="none" stroke={`rgb(${GLOW})`} strokeWidth={8 * k}
        strokeOpacity={0.5 * amp} filter={`url(#pulse-glow-${at})`} />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={14 * k} fill={`rgba(200,206,255,${(0.05 * amp).toFixed(3)})`} />
      <rect x={rect.x + 0.75} y={rect.y + 0.75} width={rect.w - 1.5} height={rect.h - 1.5} rx={13.5 * k} fill="none"
        stroke="#c9ceff" strokeWidth={1.5} strokeOpacity={0.9 * amp} />
      {ring < 1 && (
        <circle cx={rect.cx} cy={rect.cy} r={(12 + 80 * ring) * k} fill="none" stroke="#c9ceff"
          strokeWidth={2.5 * (1 - ring) + 0.5} strokeOpacity={0.75 * (1 - ring)} />
      )}
    </g>
  );
};

type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
// cy = diem neo duong bay: vung bieu do nua duoi the (khong de net sang de len con so — con so la thong diep)
const rectOf = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h, cx: x + w / 2, cy: y + h * 0.7 });

// bang mau dashboard toi (cung tong voi FakeDashboard tone="dark")
const D = {
  canvas: 'linear-gradient(180deg, #121318 0%, #0e0f13 100%)', surface: '#18191e', raised: '#141519', side: '#0b0c0f',
  line: 'rgba(255,255,255,0.07)', ink: '#ededf0', ink2: '#a3a5ad', ink3: '#6c6e76', fill: 'rgba(255,255,255,0.05)',
  chart: 'rgba(255,255,255,0.14)', accent: '#8088f0', up: '#5fd4a0',
};
const hsh = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const NAV = ['Tổng quan', 'Phân tích', 'Dự án', 'Khách hàng', 'Báo cáo', 'Thanh toán', 'Cài đặt'];
const NAV_ICON = [
  'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z', 'M3 13V9M6.5 13V4.5M10 13V7M13.5 13V3',
  'M2.5 4.75c0-.7.55-1.25 1.25-1.25h2.6l1.5 1.5h4.4c.7 0 1.25.55 1.25 1.25v5.5c0 .7-.55 1.25-1.25 1.25h-8.5c-.7 0-1.25-.55-1.25-1.25z',
  'M6 7.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM2 13c.5-2.1 2-3.25 4-3.25S9.5 10.9 10 13',
  'M4.25 2.5h4.5l3 3v7.25H4.25zM5.75 9h4.5M5.75 11.25h3', 'M2.5 4h11v8h-11zM2.5 6.75h11', 'M3 4.5h5.5M11.5 4.5H13M3 11.5h1.5M7.5 11.5H13M10 3v3M6 10v3',
];
const Icon: React.FC<{ d: string; size: number; color: string }> = ({ d, size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: 'none' }}>
    <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// the so lieu: nhan + con so lon + chip tang truong + duong xu huong (hoac cot)
const StatCard: React.FC<{ r: Rect; label: string; value: string; delta: string; seed: number; k: number; bars?: boolean }> = ({ r, label, value, delta, seed, k, bars }) => {
  const fonts = useShotFonts();
  const pad = 30 * k;
  const iw = r.w - pad * 2;
  const vs = fitSize(value, { family: fonts.sans, size: 92 * k, maxWidth: iw, weight: 700, minSize: 40 * k, letterSpacingEm: -0.035 });
  const ls = fitSize(label, { family: fonts.sans, size: 26 * k, maxWidth: iw - 20 * k, weight: 550, minSize: 16 * k });
  const chartH = r.h * 0.36;
  const n = 14;
  const pts = Array.from({ length: n }, (_, i) => {
    const v = 0.35 * (i / (n - 1)) + 0.18 * Math.sin(i * 0.6 + seed * 1.7) + 0.08 * Math.sin(i * 1.4 + seed) + 0.05 * hsh(seed * 31 + i);
    return v;
  });
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const ys = pts.map((v) => (1 - (v - lo) / (hi - lo || 1)) * (chartH - 12 * k) + 6 * k);
  const line = ys.map((y, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * iw).toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <div style={{
      position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: 'border-box', borderRadius: 14 * k, background: D.surface,
      border: `1px solid ${D.line}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -8px rgba(0,0,0,0.55)', fontFamily: fonts.sans,
    }}>
      <div style={{ position: 'absolute', left: pad, right: pad, top: pad, display: 'flex', alignItems: 'center', gap: 12 * k }}>
        <div style={{ width: 12 * k, height: 12 * k, borderRadius: 4 * k, background: seed % 2 ? D.accent : D.chart, flex: 'none' }} />
        <div style={{ fontSize: ls, fontWeight: 550, color: D.ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{label}</div>
      </div>
      <div style={{ position: 'absolute', left: pad - 2 * k, top: pad + 56 * k, fontSize: vs, fontWeight: 700, color: D.ink, letterSpacing: '-0.035em', lineHeight: 1.15, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{
        position: 'absolute', left: pad, top: pad + 56 * k + vs * 1.15 + 14 * k, padding: `${5 * k}px ${12 * k}px`, borderRadius: 20 * k,
        background: 'rgba(95,212,160,0.13)', color: D.up, fontSize: 21 * k, fontWeight: 650, fontVariantNumeric: 'tabular-nums',
      }}>{delta}</div>
      <svg width={iw} height={chartH} style={{ position: 'absolute', left: pad, bottom: pad }}>
        {bars ? ys.map((y, i) => (
          <rect key={i} x={(i / n) * iw + 3 * k} y={y} width={iw / n - 8 * k} height={chartH - y} rx={4 * k} fill={i === n - 1 ? D.accent : D.chart} />
        )) : (
          <>
            <path d={`${line} L${iw},${chartH} L0,${chartH} Z`} fill="rgba(128,136,240,0.10)" />
            <path d={line} fill="none" stroke={seed % 2 ? D.accent : 'rgba(255,255,255,0.45)'} strokeWidth={3 * k} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
};

export const FlylineArc: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  // 渐变 ID 按实例生成，多实例同场不串引（useId 的 «:» 在 url() 里非法，需清洗）
  const haloId = `headHalo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const title = useText('title', 'Tổng quan tuần này');
  const labelsIn = useList('labels', ['Chi phí quảng cáo', 'Doanh thu', 'Khách hàng mới']);
  const valuesIn = useList('values', ['12,4 triệu', '86 triệu', '+1.240']);
  const labels = [0, 1, 2].map((i) => labelsIn[i] ?? '');
  const values = [0, 1, 2].map((i) => valuesIn[i] ?? '');
  const FILL = [
    { label: 'Lượt truy cập', value: '48.210', delta: '+8,2%' },
    { label: 'Tỉ lệ chuyển đổi', value: '3,8%', delta: '+0,6%' },
    { label: 'Đơn hàng', value: '2.947', delta: '+12%' },
  ];
  const DELTA = ['+4,1%', '+23%', '+17%'];

  // ── bo cuc ──
  const k = portrait ? 1.55 : 1;
  let cards: Rect[]; // 6 the: [A, B, C, nen, nen, nen]
  let L1: { p0: Pt; p1: Pt; p2: Pt; p3: Pt }, L2: { p0: Pt; p1: Pt; p2: Pt; p3: Pt };
  let headTop = 0, gridTop = 0;
  if (!portrait) {
    // FakeDashboard variant A 实测网格：A 左上 / B 右下 / C 上中；其余为背景卡
    const col = [256, 808, 1360], row = [108, 590];
    cards = [rectOf(col[0], row[0], 524, 454), rectOf(col[2], row[1], 524, 454), rectOf(col[1], row[0], 524, 454), rectOf(col[2], row[0], 524, 454), rectOf(col[0], row[1], 524, 454), rectOf(col[1], row[1], 524, 454)];
    const [A, B, C] = cards;
    // diem neo ha xuong 0.2h (=91px) so voi tam the goc -> diem dieu khien ha cung luong, giu nguyen dang cung goc
    L1 = { p0: { x: A.cx, y: A.cy }, p1: { x: 818, y: 60 + 91 }, p2: { x: 1322, y: 380 + 91 }, p3: { x: B.cx, y: B.cy } };
    L2 = { p0: { x: B.cx, y: B.cy }, p1: { x: 1760, y: 560 + 91 }, p2: { x: 1360, y: 150 + 91 }, p3: { x: C.cx, y: C.cy } };
  } else {
    const cw = 830, ch = 660, gap = 44, x0 = (1920 - cw * 2 - gap) / 2;
    const total = 300 + 3 * ch + 2 * gap;
    headTop = Math.round(SH / 2 - total / 2);
    gridTop = headTop + 300;
    const at = (c: number, r: number) => rectOf(x0 + c * (cw + gap), gridTop + r * (ch + gap), cw, ch);
    cards = [at(0, 0), at(1, 1), at(0, 2), at(1, 0), at(0, 1), at(1, 2)];
    const [A, B, C] = cards;
    // zic-zac: A -> B vong len phai, B -> C vong ra mep phai roi cat xuong trai
    L1 = { p0: { x: A.cx, y: A.cy }, p1: { x: A.cx + 420, y: A.cy - 520 }, p2: { x: B.cx + 260, y: B.cy - 640 }, p3: { x: B.cx, y: B.cy } };
    L2 = { p0: { x: B.cx, y: B.cy }, p1: { x: B.cx + 520, y: B.cy + 260 }, p2: { x: C.cx + 700, y: C.cy - 200 }, p3: { x: C.cx, y: C.cy } };
  }
  // [Agent Edit] NEN ANH AI: bo nen trang dashboard (canvas toi) -> the / thanh giao dien noi tren anh nen; chu nam
  // truc tiep tren nen (dau trang khung doc) co bong do de doc ro
  const bd = useBackdrop();
  const ts = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;
  const titleSz = portrait ? fitSize(title, { family: fonts.sans, size: 96, maxWidth: 1600, weight: 700, minSize: 56 }) : 15;

  // 时间轴：线1 生长 10–32f → 卡B 脉冲 32–50f；线2 生长 46–68f → 卡C 脉冲 68–86f
  // f86 后全静止（140f 总长 → 静止 54f ≥ 35f）
  return (
    <div style={{ width: 1920, height: SH, position: 'relative', background: bd ? 'transparent' : '#0b0c10', overflow: 'hidden' }}>
      {/* 背景：深色 dashboard 压暗 0.65，常量、不动画——让飞线成为前景层 */}
      <div style={{ position: 'absolute', inset: 0, filter: bd ? 'brightness(0.8) saturate(0.9)' : 'brightness(0.65) saturate(0.9)', background: bd ? 'transparent' : D.canvas, fontFamily: fonts.sans }}>
        {!portrait ? (
          <>
            {/* 侧栏 */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, background: bd ? 'rgba(11,12,15,0.72)' : D.side, boxShadow: `inset -1px 0 0 ${D.line}`, padding: '28px 22px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 24, height: 40 }}>
                {brand ? <ShotcraftMark size={30} tone="dark" /> : null}
                <div style={{ fontSize: 15, fontWeight: 650, color: D.ink, whiteSpace: 'nowrap', overflow: 'hidden' }}>{brand?.name || ''}</div>
              </div>
              {NAV.map((n, i) => (
                <div key={n} style={{ height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 11, padding: '0 10px', marginBottom: 6, background: i === 0 ? 'rgba(255,255,255,0.07)' : 'transparent', color: i === 0 ? D.ink : D.ink3, fontSize: 14, fontWeight: i === 0 ? 550 : 450 }}>
                  <Icon d={NAV_ICON[i]} size={16} color={i === 0 ? D.ink : D.ink3} />
                  {n}
                </div>
              ))}
            </div>
            {/* 顶栏 */}
            <div style={{ position: 'absolute', left: 220, right: 0, top: 0, height: 72, background: bd ? 'rgba(20,21,25,0.72)' : D.raised, borderBottom: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 10, fontSize: titleSz }}>
              <span style={{ color: D.ink3 }}>Bảng điều khiển</span>
              <span style={{ color: D.ink3 }}>›</span>
              <span style={{ color: D.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: D.fill, fontSize: 13 }}>
                {['7 ngày', '30 ngày', '90 ngày'].map((t, i) => (
                  <div key={t} style={{ padding: '5px 11px', borderRadius: 6, color: i === 0 ? D.ink : D.ink3, background: i === 0 ? D.surface : 'transparent' }}>{t}</div>
                ))}
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: 'linear-gradient(145deg, #3a3c44, #23242a)', marginLeft: 16 }} />
            </div>
          </>
        ) : (
          <>
            {/* khung doc: dau trang kieu app dien thoai */}
            <div style={{ position: 'absolute', left: 64, right: 64, top: headTop, display: 'flex', alignItems: 'center', gap: 22, textShadow: ts }}>
              {brand ? <ShotcraftMark size={64} tone="dark" /> : null}
              <div style={{ fontSize: 36, fontWeight: 600, color: D.ink3, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{brand?.name ? `${brand.name} · ` : ''}Bảng điều khiển</div>
              <div style={{ marginLeft: 'auto', width: 72, height: 72, borderRadius: 36, background: 'linear-gradient(145deg, #3a3c44, #23242a)' }} />
            </div>
            <div style={{ position: 'absolute', left: 64, top: headTop + 104, fontSize: titleSz, fontWeight: 700, color: D.ink, letterSpacing: '-0.03em', lineHeight: 1.2, whiteSpace: 'nowrap', textShadow: ts }}>{title}</div>
          </>
        )}
        {cards.map((r, i) => (
          <StatCard key={i} r={r} k={k} seed={i + 1} bars={i === 1 || i === 4}
            label={i < 3 ? labels[i] : FILL[i - 3].label} value={i < 3 ? values[i] : FILL[i - 3].value} delta={i < 3 ? DELTA[i] : FILL[i - 3].delta} />
        ))}
      </div>
      {!bd && <Vignette strength={0.5} inner={0.45} color="#030408" />}
      <svg width={1920} height={SH} viewBox={`0 0 1920 ${SH}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <defs>
          <radialGradient id={haloId}>
            <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="30%" stopColor="rgba(170,178,255,0.3)" />
            <stop offset="100%" stopColor="rgba(128,138,255,0)" />
          </radialGradient>
        </defs>
        <CardPulse frame={frame} at={32} rect={cards[1]} k={k} />
        <CardPulse frame={frame} at={68} rect={cards[2]} k={k} />
        <Flyline frame={frame} start={10} haloId={haloId} k={k} {...L1} />
        <Flyline frame={frame} start={46} haloId={haloId} k={k} {...L2} />
      </svg>
      <Grain opacity={0.07} blend="soft-light" />
    </div>
  );
};
