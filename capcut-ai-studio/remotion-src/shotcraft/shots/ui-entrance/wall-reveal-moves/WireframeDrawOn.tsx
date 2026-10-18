import React from 'react';
// wireframe-draw-on〔入场退场〕：界面先以蓝图细线描画成形（stroke-dashoffset
// 分组错峰），随后一条发光竖线从左向右扫过，扫过之处线框实体化为真实界面。
// 节拍：0–20 hold 空底 → 20–82 分组描线 → 88–118 光线扫描实体化 → 118–150 hold。
// 质感改版：
// - 线框按 Phase 0 新版 FakeDashboard A 的真实几何逐件重排（侧栏 logo/导航/项目/用量卡、顶栏面包屑/
//   分段控件/搜索/头像、六卡的表头/大数字/各自的图表形态/页脚），扫描线扫过时不再"跳位"；
// - 蓝图化：冷灰蓝细线（外框 1.6px、内件 1.25px）+ 淡蓝点阵底 + 卡角裁切标记，读作设计稿而不是灰色占位；
// - 扫描前沿身后带一段渐隐暖光（实体层刚"显影"的余温），竖线与 clip 前沿同一 scan 值驱动；
// - 补 WIREFRAME_DRAW_ON_DURATION = 150。
//
// [Agent Edit] FakeDashboard cua fixtures con chu tieng Anh + ten video-shotcraft -> giao dien tu ve NGAY TRONG FILE, lop thuc
// va lop ban ve cung lay tu MOT bo hinh hoc (cung toa do, be ngang chu do bang measureText) -> quet sang khong bao gio "nhay vi tri".
// O chu: title (ten trang, tren thanh dau) / items (3–6 nhan the) / values (so lieu tuong ung, tuy chon — khong co thi bo dong so,
// bieu do cao len). So the theo so muc: 3 = 1 hang, 4 = 2×2, 5 = 3+2, 6 = 3×2.
// Khung doc (portrait.mode = 'native'): giao dien kieu app dien thoai — dau trang (ten trang to) + luoi 2 cot (muc le: the cuoi
// rong het hang), chi tiet trong the phong 1.5x; duong quet doc van chay trai -> phai, cao het khung.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useBrand, useShotFonts, measureText, fitSize } from '../../../runtime';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { Grain, Vignette } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const WIREFRAME_DRAW_ON_DURATION = 150;

const INK = '#6c7894'; // 蓝图线色
const PAPER = '#eef0f2';
// bang mau lop thuc (giao dien sang, cung tong voi FakeDashboard tone="light")
const UI = {
  canvas: '#f2f2f0', surface: '#ffffff', raised: '#fafaf9', side: '#17181c', line: 'rgba(20,22,28,0.09)', ink: '#17181c', ink2: '#5d5f66', ink3: '#9b9da3',
  fill: '#f3f3f1', fill2: '#e7e7e4', chart: '#dcdde1', accent: '#5b63d3', accentSoft: 'rgba(91,99,211,0.12)', sideInk: 'rgba(255,255,255,0.92)', sideInk2: 'rgba(255,255,255,0.5)',
};
const NAV = ['Tổng quan', 'Phân tích', 'Dự án', 'Khách hàng', 'Báo cáo', 'Cài đặt'];

const seedFrac = (i: number) => {
  const v = Math.sin(i * 127.3) * 43758.5453;
  return v - Math.floor(v);
};
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 平滑折线 → 贝塞尔（Catmull-Rom）
const smoothPath = (pts: [number, number][]) => {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
const wavePts = (x0: number, x1: number, yTop: number, yBot: number, seed: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const k = i / 11;
    const v = 0.45 * k + 0.2 * Math.sin(i * 0.9 + seed) + 0.12 * seedFrac(seed * 7 + i);
    return [x0 + (x1 - x0) * k, yBot - (yBot - yTop) * Math.min(1, Math.max(0, v + 0.15))] as [number, number];
  });

type Rect = { x: number; y: number; w: number; h: number };
// hinh hoc chung cua 1 the (toa do tuyet doi) — lop ban ve va lop thuc cung doc
type CardGeo = {
  r: Rect; k: number; pad: number; icon: Rect; label: { x: number; cy: number; w: number; size: number; text: string };
  value: { x: number; cy: number; w: number; size: number; text: string } | null; chart: Rect; kind: number; seed: number;
};
const cardGeo = (r: Rect, k: number, label: string, value: string, i: number, family: string): CardGeo => {
  const pad = 22 * k;
  const icon = { x: r.x + pad, y: r.y + pad, w: 30 * k, h: 30 * k };
  const lx = icon.x + icon.w + 12 * k;
  const ls = fitSize(label, { family, size: 19 * k, maxWidth: r.x + r.w - pad - 50 * k - lx, weight: 600, minSize: 12 * k });
  const lab = { x: lx, cy: icon.y + icon.h / 2, w: measureText(label, family, ls, 600), size: ls, text: label };
  let val: CardGeo['value'] = null;
  let chartTop = icon.y + icon.h + 26 * k;
  if (value) {
    const vs = fitSize(value, { family, size: 48 * k, maxWidth: r.w - pad * 2, weight: 700, minSize: 24 * k, letterSpacingEm: -0.035 });
    val = { x: r.x + pad, cy: icon.y + icon.h + 22 * k + vs * 0.6, w: measureText(value, family, vs, 700) * 0.965, size: vs, text: value };
    chartTop = val.cy + vs * 0.6 + 28 * k;
  }
  return { r, k, pad, icon, label: lab, value: val, chart: { x: r.x + pad, y: chartTop, w: r.w - pad * 2, h: r.y + r.h - pad - chartTop }, kind: i % 4, seed: i + 1 };
};

// bieu do trong the: cung tham so cho ca hai lop
const bars = (c: Rect, seed: number) => {
  const n = Math.max(8, Math.min(16, Math.round(c.w / 34)));
  const slot = c.w / n;
  return Array.from({ length: n }, (_, j) => {
    const hh = (0.2 + 0.8 * (0.25 + 0.75 * Math.min(1, j / (n * 0.6))) * (0.7 + 0.3 * seedFrac(j + seed * 9))) * c.h;
    return { x: c.x + j * slot + slot * 0.2, y: c.y + c.h - hh, w: slot * 0.6, h: hh, peak: j === n - 2 };
  });
};
const progRows = (c: Rect, k: number) => {
  const n = Math.max(2, Math.min(5, Math.floor(c.h / (46 * k))));
  const rh = c.h / n;
  return Array.from({ length: n }, (_, j) => ({ y: c.y + j * rh + rh * 0.35, lw: (50 + j * 9) * k, pct: 0.9 - j * 0.14 }));
};
const heatGrid = (c: Rect, k: number) => {
  const gap = 5 * k;
  const cell = Math.max(8 * k, Math.min(22 * k, (c.h - gap * 6) / 7));
  const cols = Math.max(4, Math.floor((c.w + gap) / (cell + gap)));
  return { gap, cell, cols, w: cols * (cell + gap) - gap, h: 7 * (cell + gap) - gap };
};

const SolidCard: React.FC<{ g: CardGeo }> = ({ g }) => {
  const fonts = useShotFonts();
  const { r, k, chart: c } = g;
  return (
    <>
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 14 * k, background: UI.surface, border: `1px solid ${UI.line}`, boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(16,18,24,0.06), 0 6px 18px -6px rgba(16,18,24,0.10)' }} />
      <div style={{ position: 'absolute', left: g.icon.x, top: g.icon.y, width: g.icon.w, height: g.icon.h, borderRadius: 8 * k, background: g.seed % 2 ? UI.accentSoft : UI.fill, boxShadow: `inset 0 0 0 1px ${UI.line}` }} />
      <div style={{ position: 'absolute', left: g.label.x, top: g.label.cy - g.label.size * 0.65, fontFamily: fonts.sans, fontSize: g.label.size, fontWeight: 600, lineHeight: 1.3, color: UI.ink, whiteSpace: 'nowrap' }}>{g.label.text}</div>
      <div style={{ position: 'absolute', left: r.x + r.w - g.pad - 34 * k, top: g.icon.y + 5 * k, width: 34 * k, height: 20 * k, borderRadius: 6 * k, background: UI.fill2 }} />
      {g.value ? (
        <div style={{ position: 'absolute', left: g.value.x, top: g.value.cy - g.value.size * 0.62, fontFamily: fonts.sans, fontSize: g.value.size, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.24, color: UI.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{g.value.text}</div>
      ) : null}
      <svg width={1920} height={4000} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {g.kind === 0 && (() => {
          const pts = wavePts(c.x, c.x + c.w, c.y, c.y + c.h, g.seed);
          const d = smoothPath(pts);
          return (
            <>
              <path d={`${d} L${c.x + c.w},${c.y + c.h} L${c.x},${c.y + c.h} Z`} fill={UI.accentSoft} />
              <path d={d} fill="none" stroke={UI.accent} strokeWidth={2.5 * k} strokeLinecap="round" />
            </>
          );
        })()}
        {g.kind === 1 && bars(c, g.seed).map((b, j) => <rect key={j} x={b.x} y={b.y} width={b.w} height={b.h} rx={3 * k} fill={b.peak ? UI.accent : UI.chart} />)}
        {g.kind === 2 && progRows(c, k).map((p, j) => (
          <g key={j}>
            <rect x={c.x} y={p.y - 14 * k} width={p.lw} height={7 * k} rx={3.5 * k} fill={UI.fill2} />
            <rect x={c.x} y={p.y} width={c.w} height={7 * k} rx={3.5 * k} fill={UI.fill2} />
            <rect x={c.x} y={p.y} width={c.w * p.pct} height={7 * k} rx={3.5 * k} fill={j === 0 ? UI.accent : '#c4c6cc'} />
          </g>
        ))}
        {g.kind === 3 && (() => {
          const hg = heatGrid(c, k);
          return Array.from({ length: hg.cols * 7 }, (_, q) => {
            const col = Math.floor(q / 7), row = q % 7;
            const lvl = Math.min(4, Math.floor(Math.pow(seedFrac(g.seed * 13 + q), 1.7) * 3.3 + (col / hg.cols) * 1.5));
            return <rect key={q} x={c.x + col * (hg.cell + hg.gap)} y={c.y + row * (hg.cell + hg.gap)} width={hg.cell} height={hg.cell} rx={3 * k}
              fill={lvl < 2 ? (lvl ? UI.chart : UI.fill2) : UI.accent} fillOpacity={[1, 1, 0.32, 0.58, 0.9][lvl]} />;
          });
        })()}
      </svg>
    </>
  );
};

export const WireframeDrawOn: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const title = useText('title', 'Tổng quan');
  const items = useList('items', ['Người dùng hoạt động', 'Trang xem nhiều', 'Doanh thu', 'Mục tiêu quý', 'Lượt triển khai', 'Phiên truy cập']).slice(0, 6);
  const values = useList('values', ['12.480', '48.210', '1,2 tỷ', '86%', '214', '3.912']);
  const n = Math.max(1, items.length);

  // 描线进度：每组 30f 画完，start 错峰
  const draw = (start: number) =>
    interpolate(frame, [start, start + 30], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.3, 1) });

  // ── bo cuc ──
  const k = portrait ? 1.6 : 1;
  const rects: Rect[] = [];
  let headTitle: { x: number; cy: number; size: number } ;
  if (!portrait) {
    const X0 = 256, Y0 = 108, AW = 1628, AH = 936, G = 28;
    const rowsN = n <= 3 ? [n] : n === 4 ? [2, 2] : n === 5 ? [3, 2] : [3, 3];
    const rh = (AH - G * (rowsN.length - 1)) / rowsN.length;
    rowsN.forEach((cnt, ri) => {
      const cw = (AW - G * (cnt - 1)) / cnt;
      for (let c = 0; c < cnt; c++) rects.push({ x: X0 + c * (cw + G), y: Y0 + ri * (rh + G), w: cw, h: rh });
    });
    headTitle = { x: 252, cy: 36, size: 15 };
  } else {
    const X0 = 80, AW = 1760, G = 40;
    const rowsN = Math.ceil(n / 2);
    const rh = rowsN >= 3 ? 680 : 820;
    const headH = 330;
    const total = headH + rowsN * rh + (rowsN - 1) * G;
    const Y0h = Math.round(SH / 2 - total / 2);
    const Y0 = Y0h + headH;
    for (let i = 0; i < n; i++) {
      const ri = Math.floor(i / 2), ci = i % 2;
      const full = n % 2 === 1 && i === n - 1;
      const cw = full ? AW : (AW - G) / 2;
      rects.push({ x: X0 + (full ? 0 : ci * (cw + G)), y: Y0 + ri * (rh + G), w: cw, h: rh });
    }
    headTitle = { x: 80, cy: Y0h + 190, size: fitSize(title, { family: fonts.sans, size: 120, maxWidth: 1760, weight: 700, minSize: 64 }) };
  }
  const cards = rects.map((r, i) => cardGeo(r, k, items[i] ?? '', values.length ? values[i] ?? '' : '', i, fonts.sans));

  const tSide = draw(20); // 侧栏
  const tTop = draw(30); // 顶栏
  const tCards = cards.map((_, i) => draw(40 + i * 3)); // 卡片错峰

  // 实体化扫描：88–118 从左向右
  const scan = interpolate(frame, [88, 118], [0, 1], { ...clamp, easing: Easing.bezier(0.55, 0, 0.25, 1) });
  const scanX = scan * 1920;
  const lineOpacity = interpolate(frame, [86, 92, 112, 120], [0, 1, 1, 0], clamp);
  // [Agent Edit] NEN ANH AI: bo giay ban ve + nen canvas cua lop thuc (anh nen hien ra); lop ban ve chi con o phan
  // chua quet (khong ke duoi lop thuc trong suot); chu dau trang (khung doc) co bong sang. Luoi cham da bo (ca khi khong co anh)
  const bd = useBackdrop();
  const ts = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  // 描线小工具：pathLength=1 + dashoffset 从 1 → 0
  const stroke = (t: number, w = 1.25): React.SVGAttributes<SVGElement> => ({
    fill: 'none',
    stroke: INK,
    strokeWidth: w * (portrait ? 1.4 : 1),
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - t,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: t > 0 ? 1 : 0,
  });

  // thanh dau (khung ngang): duong dan + o tim kiem + avatar; do be ngang chu that
  const crumbA = 'Bảng điều khiển';
  const crumbAW = measureText(crumbA, fonts.sans, 15, 400);
  const titleW = measureText(title, fonts.sans, headTitle.size, portrait ? 700 : 600);
  const brandName = brand?.name || '';
  const brandW = brandName ? Math.min(110, measureText(brandName, fonts.sans, 15, 650)) : 0;
  const pBrand = portrait ? `${brandName ? brandName + ' · ' : ''}Bảng điều khiển` : '';
  const pBrandW = portrait ? measureText(pBrand, fonts.sans, 36, 600) : 0;

  // ve the (ban ve)
  const wireCard = (g: CardGeo, i: number, t: number) => {
    const { r, k: kk, chart: c } = g;
    const td = (q: number) => draw(46 + i * 3 + q);
    return (
      <g key={`c${i}`}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14 * kk} {...stroke(t, 1.6)} />
        {/* 裁切标记 */}
        {[[r.x - 10, r.y - 10, 1, 1], [r.x + r.w + 10, r.y - 10, -1, 1], [r.x - 10, r.y + r.h + 10, 1, -1], [r.x + r.w + 10, r.y + r.h + 10, -1, -1]].map(([x, y, sx, sy], q) => (
          <path key={q} d={`M${x},${y + sy * 14} L${x},${y} L${x + sx * 14},${y}`} {...stroke(t, 1)} opacity={t > 0 ? 0.55 : 0} />
        ))}
        <rect x={g.icon.x} y={g.icon.y} width={g.icon.w} height={g.icon.h} rx={8 * kk} {...stroke(td(0))} />
        {g.label.text ? <line x1={g.label.x} y1={g.label.cy} x2={g.label.x + g.label.w} y2={g.label.cy} {...stroke(td(1), 2)} /> : null}
        <rect x={r.x + r.w - g.pad - 34 * kk} y={g.icon.y + 5 * kk} width={34 * kk} height={20 * kk} rx={6 * kk} {...stroke(td(1))} />
        {g.value ? <line x1={g.value.x} y1={g.value.cy} x2={g.value.x + g.value.w} y2={g.value.cy} {...stroke(td(2), 3)} /> : null}
        {g.kind === 0 && <path d={smoothPath(wavePts(c.x, c.x + c.w, c.y, c.y + c.h, g.seed))} {...stroke(draw(52 + i * 2), 2)} />}
        {g.kind === 1 && bars(c, g.seed).map((b, j) => <rect key={j} x={b.x} y={b.y} width={b.w} height={b.h} rx={3 * kk} {...stroke(draw(54 + i + j))} />)}
        {g.kind === 2 && progRows(c, kk).map((p, j) => (
          <g key={j}>
            <line x1={c.x} y1={p.y - 10 * kk} x2={c.x + p.lw} y2={p.y - 10 * kk} {...stroke(draw(56 + j * 2))} />
            <rect x={c.x} y={p.y} width={c.w} height={7 * kk} rx={3.5 * kk} {...stroke(draw(57 + j * 2))} />
          </g>
        ))}
        {g.kind === 3 && (() => {
          const hg = heatGrid(c, kk);
          return (
            <g>
              <rect x={c.x} y={c.y} width={hg.w} height={hg.h} rx={4} {...stroke(draw(60))} />
              {Array.from({ length: 6 }, (_, q) => {
                const y = c.y + (q + 1) * (hg.cell + hg.gap) - hg.gap / 2;
                return <line key={q} x1={c.x} y1={y} x2={c.x + hg.w} y2={y} {...stroke(draw(62 + q), 1)} />;
              })}
            </g>
          );
        })()}
      </g>
    );
  };

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : PAPER, overflow: 'hidden' }}>
      {/* —— 线框层（蓝图描线） —— */}
      <svg width={1920} height={SH} viewBox={`0 0 1920 ${SH}`} style={{ position: 'absolute', inset: 0, clipPath: bd && scan > 0 ? `inset(0 0 0 ${(scan * 100).toFixed(3)}%)` : undefined }}>
        {!portrait ? (
          <>
            {/* 侧栏 */}
            <rect x={1} y={1} width={219} height={1078} rx={2} {...stroke(tSide, 1.6)} />
            {brand ? <rect x={22} y={28} width={40} height={40} rx={10} {...stroke(draw(24))} /> : null}
            {brandName ? <line x1={73} y1={48} x2={73 + brandW} y2={48} {...stroke(draw(25))} /> : null}
            {NAV.map((nv, q) => {
              const cy = 113 + q * 40;
              const w = measureText(nv, fonts.sans, 14, q === 0 ? 550 : 450);
              return (
                <g key={`s${q}`}>
                  {q === 0 ? <rect x={22} y={cy - 17} width={176} height={34} rx={8} {...stroke(draw(26))} /> : null}
                  <rect x={33} y={cy - 7} width={14} height={14} rx={3} {...stroke(draw(26 + q * 2))} />
                  <line x1={59} y1={cy} x2={59 + w} y2={cy} {...stroke(draw(27 + q * 2))} />
                </g>
              );
            })}
            <rect x={22} y={1001} width={176} height={50} rx={10} {...stroke(draw(46))} />
            <line x1={34} y1={1038} x2={186} y2={1038} {...stroke(draw(48))} />
            {/* 顶栏 */}
            <line x1={220} y1={72} x2={1920} y2={72} {...stroke(tTop, 1.6)} />
            <line x1={252} y1={36} x2={252 + crumbAW} y2={36} {...stroke(draw(33))} />
            <line x1={252 + crumbAW + 30} y1={36} x2={252 + crumbAW + 30 + titleW} y2={36} {...stroke(draw(34))} />
            <rect x={1512} y={18} width={320} height={36} rx={10} {...stroke(draw(36))} />
            <circle cx={1870} cy={36} r={18} {...stroke(draw(38))} />
          </>
        ) : (
          <>
            {/* khung doc: dau trang */}
            {brand ? <rect x={80} y={headTitle.cy - 190 - 32} width={64} height={64} rx={16} {...stroke(draw(24))} /> : null}
            <line x1={80 + (brand ? 86 : 0)} y1={headTitle.cy - 190} x2={80 + (brand ? 86 : 0) + pBrandW} y2={headTitle.cy - 190} {...stroke(tSide, 2)} />
            <circle cx={1804} cy={headTitle.cy - 190} r={36} {...stroke(draw(26))} />
            <line x1={80} y1={headTitle.cy} x2={80 + titleW} y2={headTitle.cy} {...stroke(tTop, 4)} />
          </>
        )}
        {cards.map((g, i) => wireCard(g, i, tCards[i]))}
      </svg>

      {/* —— 实体层：clip-path inset 从左向右展开 —— */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${((1 - scan) * 100).toFixed(3)}% 0 0)`, fontFamily: fonts.sans }}>
        {!bd && <div style={{ position: 'absolute', inset: 0, background: UI.canvas }} />}
        {!portrait ? (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 220, height: 1080, background: UI.side }} />
            {brand ? <div style={{ position: 'absolute', left: 22, top: 28, width: 40, height: 40, borderRadius: 10, background: '#2a2a26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ShotcraftMark size={26} tone="dark" /></div> : null}
            {brandName ? <div style={{ position: 'absolute', left: 73, top: 38, width: 115, fontSize: 15, fontWeight: 650, lineHeight: 1.3, color: UI.sideInk, whiteSpace: 'nowrap', overflow: 'hidden' }}>{brandName}</div> : null}
            {NAV.map((nv, q) => {
              const cy = 113 + q * 40;
              return (
                <React.Fragment key={nv}>
                  {q === 0 ? <div style={{ position: 'absolute', left: 22, top: cy - 17, width: 176, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.08)' }} /> : null}
                  <div style={{ position: 'absolute', left: 33, top: cy - 7, width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${q === 0 ? UI.sideInk : UI.sideInk2}`, boxSizing: 'border-box' }} />
                  <div style={{ position: 'absolute', left: 59, top: cy - 10, fontSize: 14, fontWeight: q === 0 ? 550 : 450, lineHeight: '20px', color: q === 0 ? UI.sideInk : UI.sideInk2, whiteSpace: 'nowrap' }}>{nv}</div>
                </React.Fragment>
              );
            })}
            <div style={{ position: 'absolute', left: 22, top: 1001, width: 176, height: 50, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'absolute', left: 34, top: 1036, width: 152, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}>
              <div style={{ width: '68%', height: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.7)' }} />
            </div>
            <div style={{ position: 'absolute', left: 220, top: 0, right: 0, height: 72, background: UI.raised, borderBottom: `1px solid ${UI.line}` }} />
            <div style={{ position: 'absolute', left: 252, top: 26, fontSize: 15, lineHeight: '20px', color: UI.ink3, whiteSpace: 'nowrap' }}>{crumbA}</div>
            <div style={{ position: 'absolute', left: 252 + crumbAW + 9, top: 26, fontSize: 15, lineHeight: '20px', color: UI.ink3 }}>›</div>
            <div style={{ position: 'absolute', left: 252 + crumbAW + 30, top: 26, fontSize: 15, fontWeight: 600, lineHeight: '20px', color: UI.ink, whiteSpace: 'nowrap' }}>{title}</div>
            <div style={{ position: 'absolute', left: 1512, top: 18, width: 320, height: 36, borderRadius: 10, background: UI.surface, border: `1px solid ${UI.line}`, boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14, color: UI.ink3 }}>Tìm kiếm…</div>
            <div style={{ position: 'absolute', left: 1852, top: 18, width: 36, height: 36, borderRadius: 18, background: 'linear-gradient(145deg, #3a3c44, #23242a)' }} />
          </>
        ) : (
          <>
            {brand ? <div style={{ position: 'absolute', left: 80, top: headTitle.cy - 222, width: 64, height: 64, borderRadius: 16, background: '#2a2a26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ShotcraftMark size={42} tone="dark" /></div> : null}
            <div style={{ position: 'absolute', left: 80 + (brand ? 86 : 0), top: headTitle.cy - 190 - 24, fontSize: 36, fontWeight: 600, lineHeight: '48px', color: UI.ink3, whiteSpace: 'nowrap', textShadow: ts }}>{pBrand}</div>
            <div style={{ position: 'absolute', left: 1768, top: headTitle.cy - 226, width: 72, height: 72, borderRadius: 36, background: 'linear-gradient(145deg, #3a3c44, #23242a)' }} />
            <div style={{ position: 'absolute', left: 80, top: headTitle.cy - headTitle.size * 0.66, fontSize: headTitle.size, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.3, color: UI.ink, whiteSpace: 'nowrap', textShadow: ts }}>{title}</div>
          </>
        )}
        {cards.map((g, i) => <SolidCard key={i} g={g} />)}
        {/* 前沿余温：刚显影的一段带暖光，向左渐隐 */}
        {scan > 0 && scan < 1 && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: scanX - 260, width: 260, pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(255,196,107,0) 0%, rgba(255,196,107,0.10) 70%, rgba(255,196,107,0.22) 100%)',
            mixBlendMode: 'multiply',
          }} />
        )}
      </div>

      {/* —— 4px 发光扫描竖线（琥珀微光） —— */}
      <div
        style={{
          position: 'absolute', left: scanX - 2 * k, top: 0, width: 4 * k, height: SH,
          background: 'linear-gradient(180deg, rgba(255,214,150,0.6), #ffc46b 20%, #ffd28a 50%, #ffc46b 80%, rgba(255,214,150,0.6))',
          opacity: lineOpacity,
          boxShadow: '0 0 18px 6px rgba(232, 163, 61, 0.55), 0 0 60px 18px rgba(232, 163, 61, 0.22)',
        }}
      />
      <Vignette strength={0.12} color="#2a3040" inner={0.55} />
      <Grain opacity={0.04} />
    </AbsoluteFill>
  );
};
