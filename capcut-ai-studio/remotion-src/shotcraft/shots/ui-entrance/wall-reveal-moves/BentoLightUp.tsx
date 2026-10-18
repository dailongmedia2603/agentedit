import React from 'react';
// bento-light-up：暗场里 3×2 bento 墙压暗待命，随节拍逐格点亮——
// 边框流光先描一圈（琥珀），格内内容随后提亮上浮弹出；六格全亮后整体微推收住。
// 节拍：0–20 建立(hold) → 每格间隔 12f 依次激活(描边 8f + 内容弹出 8f)
//       → ~96f 全亮 → 96–121 scale 1→1.04 缓推 → 121–150 静止收尾。
// 质感改版：
// - 真 bento：两行宽窄互补（600/420/420 ↔ 420/420/600），不再是六张等大格子；
// - 卡面用暗色出版级 Card（tone=dark），暗场品牌段里不再"白卡亮瞎"，点亮读作通电而非换色；
// - 流光描边改为"彗星"：亮头 + 渐隐尾的描边段跑一圈后收成常亮细边，辉光只在描边上（不外溢成方框）；
// - 标题改为眉标 + 主标题的字阶；暗场柔光底（暖色余光）+ 暗角 + 颗粒。
//
// [Agent Edit] Card cua fixtures con chu tieng Anh -> the toi tu ve trong file. O chu: kicker (dong nho tren tieu de; co thuong
// hieu thi hien logo + ten) / title (tieu de) / items (3–6 nhan the) / values (so lieu tuong ung, tuy chon).
// So o theo so muc: 3 = 1 hang, 4 = 2+2, 5 = 3+2, 6 = 3+3 (hai hang rong-hep bu nhau nhu ban goc). Nhip 12f/o giu nguyen;
// it o hon thi cu day phong to bat dau som hon (= khung o cuoi sang + 16f).
// Khung doc (portrait.mode = 'native'): luoi 2 cot rong-hep xen ke (muc le: o cuoi rong het hang), tieu de to o tren,
// chi tiet trong o phong 1.6x, ca khoi giua khung.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useBrand, useShotFonts, measureText, fitSize, wrapLines } from '../../../runtime';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { ShotcraftMark } from '../../../fixtures/Brand';
import { Backdrop, Grain } from '../../../fixtures/Polish';

export const BENTO_LIGHT_UP_DURATION = 150;

const AMBER = '#e8b45e';
const FIRST = 20; // 首格激活帧
const GAP = 12; // 格间节拍
const GUT = 44;
const U = 480; // 宽窄格基准：宽 1.25U=600，窄 0.875U=420
// bang mau the toi (cung tong voi Card tone="dark")
const UI = {
  surface: '#18191e', line: 'rgba(255,255,255,0.07)', ink: '#ededf0', ink2: '#a3a5ad', ink3: '#6c6e76',
  fill: 'rgba(255,255,255,0.05)', fill2: 'rgba(255,255,255,0.08)', chart: 'rgba(255,255,255,0.12)', accent: '#8088f0', accentSoft: 'rgba(128,136,240,0.16)',
};

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

const DarkCard: React.FC<{ g: CardGeo }> = ({ g }) => {
  const fonts = useShotFonts();
  const { r, k, chart: c } = g;
  // toa do trong the (the dat trong khung tuong doi cua o)
  const X = (x: number) => x - r.x, Y = (y: number) => y - r.y;
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 14 * k, background: UI.surface, border: `1px solid ${UI.line}`, boxSizing: 'border-box', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px -8px rgba(0,0,0,0.55)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: X(g.icon.x), top: Y(g.icon.y), width: g.icon.w, height: g.icon.h, borderRadius: 8 * k, background: g.seed % 2 ? UI.accentSoft : UI.fill, boxShadow: `inset 0 0 0 1px ${UI.line}` }} />
      <div style={{ position: 'absolute', left: X(g.label.x), top: Y(g.label.cy) - g.label.size * 0.65, fontFamily: fonts.sans, fontSize: g.label.size, fontWeight: 600, lineHeight: 1.3, color: UI.ink, whiteSpace: 'nowrap' }}>{g.label.text}</div>
      <div style={{ position: 'absolute', left: r.w - g.pad - 34 * k, top: Y(g.icon.y) + 5 * k, width: 34 * k, height: 20 * k, borderRadius: 6 * k, background: UI.fill2 }} />
      {g.value ? (
        <div style={{ position: 'absolute', left: X(g.value.x), top: Y(g.value.cy) - g.value.size * 0.62, fontFamily: fonts.sans, fontSize: g.value.size, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.24, color: UI.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{g.value.text}</div>
      ) : null}
      <svg width={r.w} height={r.h} viewBox={`${r.x} ${r.y} ${r.w} ${r.h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {g.kind === 0 && (() => {
          const d = smoothPath(wavePts(c.x, c.x + c.w, c.y, c.y + c.h, g.seed));
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
            <rect x={c.x} y={p.y} width={c.w * p.pct} height={7 * k} rx={3.5 * k} fill={j === 0 ? UI.accent : 'rgba(255,255,255,0.22)'} />
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
    </div>
  );
};

const clampI = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Cell: React.FC<{ i: number; frame: number; g: CardGeo }> = ({ i, frame, g }) => {
  const start = FIRST + i * GAP;
  const { x, y, w, h: CELL_H } = g.r;
  const k = g.k;

  // ① 边框流光：彗星段（长 22% 周长）沿 pathLength=100 跑一圈，8f；随后整圈细边常亮
  const draw = interpolate(frame, [start, start + 8], [0, 1], { ...clampI, easing: Easing.out(Easing.cubic) });
  // 描完后流光退火：琥珀亮边 → 弱化成常亮细边
  const strokeFade = interpolate(frame, [start + 12, start + 26], [1, 0.4], { ...clampI, easing: Easing.out(Easing.quad) });
  const ring = interpolate(frame, [start + 2, start + 10], [0, 1], { ...clampI, easing: Easing.out(Easing.quad) });

  // ② 内容提亮 + 上浮弹出：描边过半后接力，8f 弹出（back-out 带一点过冲）
  const lit = interpolate(frame, [start + 6, start + 14], [0, 1], { ...clampI, easing: Easing.out(Easing.cubic) });
  const rise = interpolate(frame, [start + 6, start + 14], [0, 1], { ...clampI, easing: Easing.bezier(0.3, 1.4, 0.5, 1) });
  const opacity = 0.18 + 0.82 * lit;
  const ty = 20 * k * (1 - rise);
  // seed 正弦哈希做每格微差（点亮瞬间的辉光强度略有随机感）
  const jitter = Math.abs((Math.sin(i * 127.3) * 43758.5453) % 1);
  const pulse = lit * (1 - lit) * 4; // 点亮中段最亮的辉光脉冲
  const head = 100 * draw; // 彗星头位置（周长百分比）
  const TAIL = 22;
  const rx = 14 * k;

  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: CELL_H }}>
      {/* 暗态卡 + 点亮后的内容（同一张卡，靠 opacity/translateY 提亮浮出） */}
      <div style={{ position: 'absolute', inset: 0, opacity, transform: `translateY(${ty.toFixed(2)}px)`, borderRadius: rx }}>
        <DarkCard g={g} />
        {/* 点亮瞬间卡内一层暖光（裁在圆角内，脉冲后归零） */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: rx, pointerEvents: 'none',
          background: `radial-gradient(90% 70% at 50% 0%, rgba(232,180,94,${(0.16 * pulse * (0.8 + jitter * 0.4)).toFixed(3)}), rgba(232,180,94,0) 70%)`,
        }} />
      </div>
      {/* 边框流光：SVG rect 描边 */}
      {draw > 0 && (
        <svg width={w} height={CELL_H} viewBox={`0 0 ${w} ${CELL_H}`} style={{ position: 'absolute', left: 0, top: ty, overflow: 'visible' }}>
          <defs>
            <filter id={`blu-glow-${i}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={(4 + jitter * 2) * k} />
            </filter>
          </defs>
          {/* 常亮细边：随彗星走过逐段出现，退火后保持 */}
          <rect
            x={0.75} y={0.75} width={w - 1.5} height={CELL_H - 1.5} rx={rx} fill="none"
            stroke={AMBER} strokeWidth={1.5 * k} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - draw)}
            opacity={ring * strokeFade}
          />
          {/* 彗星：辉光层 + 亮芯层，跑完一圈后随退火淡去 */}
          {[0, 1].map((q) => (
            <rect
              key={q}
              x={1.5} y={1.5} width={w - 3} height={CELL_H - 3} rx={rx} fill="none"
              stroke={q ? '#ffe3ae' : AMBER}
              strokeWidth={(q ? 2.5 : 6) * k}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${TAIL} ${100 - TAIL}`}
              strokeDashoffset={TAIL - head}
              opacity={(1 - interpolate(frame, [start + 8, start + 16], [0, 1], clampI)) * (q ? 1 : 0.8)}
              filter={q ? undefined : `url(#blu-glow-${i})`}
            />
          ))}
        </svg>
      )}
    </div>
  );
};

export const BentoLightUp: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'TÍNH NĂNG');
  const title = useText('title', 'Mọi thứ bạn cần, gói gọn một nơi.');
  const items = useList('items', ['Người dùng', 'Trang xem nhiều', 'Doanh thu', 'Mục tiêu quý', 'Lịch hoạt động', 'Phiên truy cập']).slice(0, 6);
  const values = useList('values', ['12.480', '48.210', '1,2 tỷ', '86%', '214', '3.912']);
  const n = Math.max(1, items.length);

  // ── bo cuc ──
  const k = portrait ? 1.6 : 1;
  const rects: Rect[] = [];
  let titleLines: string[], tSz: number, kSz: number, titleTop: number, LEFT: number;
  if (!portrait) {
    const ROW_W = U * 3 + GUT * 2;
    LEFT = (1920 - ROW_W) / 2;
    const rowsN = n <= 3 ? [n] : n === 4 ? [2, 2] : n === 5 ? [3, 2] : [3, 3];
    const CELL_H = rowsN.length === 1 ? 420 : 330;
    const TOP = (1080 - (CELL_H * rowsN.length + GUT * (rowsN.length - 1))) / 2 + 44;
    rowsN.forEach((cnt, ri) => {
      // hang 3 o: rong-hep bu nhau (600/420/420 ↔ 420/420/600); hang 2 o: 0.58/0.42 xen ke; hang 1-2 o con lai chia deu
      const ks = cnt === 3 ? (ri % 2 ? [0.875, 0.875, 1.25] : [1.25, 0.875, 0.875]).map((v) => v * U) : cnt === 2 ? (ri % 2 ? [0.42, 0.58] : [0.58, 0.42]).map((v) => v * (ROW_W - GUT)) : [(ROW_W - GUT * (cnt - 1)) / cnt];
      let x = LEFT;
      for (let c = 0; c < cnt; c++) {
        const w = ks[Math.min(c, ks.length - 1)];
        rects.push({ x, y: TOP + ri * (CELL_H + GUT), w, h: CELL_H });
        x += w + GUT;
      }
    });
    kSz = 17;
    tSz = fitSize(title, { family: fonts.sans, size: 56, maxWidth: ROW_W, weight: 700, minSize: 36, letterSpacingEm: -0.03 });
    titleLines = [title];
    titleTop = TOP - 132;
  } else {
    const ROW_W = 1760;
    LEFT = 80;
    const rowsN = Math.ceil(n / 2);
    const CELL_H = rowsN >= 3 ? 640 : 780;
    kSz = 40;
    const TS = 124;
    titleLines = wrapLines(title, fonts.sans, TS, ROW_W, 700, 3);
    tSz = Math.min(...titleLines.map((l) => fitSize(l, { family: fonts.sans, size: TS, maxWidth: ROW_W, weight: 700, minSize: 72, letterSpacingEm: -0.03 })));
    const headH = kSz * 1.3 + 24 + titleLines.length * tSz * 1.16 + 90;
    const total = headH + rowsN * CELL_H + (rowsN - 1) * GUT;
    titleTop = Math.round(SH / 2 - total / 2);
    const TOP = titleTop + headH;
    for (let i = 0; i < n; i++) {
      const ri = Math.floor(i / 2), ci = i % 2;
      const full = n % 2 === 1 && i === n - 1;
      const ws = full ? [ROW_W] : (ri % 2 ? [0.44, 0.56] : [0.56, 0.44]).map((v) => v * (ROW_W - GUT));
      const x = LEFT + (full || ci === 0 ? 0 : ws[0] + GUT);
      rects.push({ x, y: TOP + ri * (CELL_H + GUT), w: full ? ROW_W : ws[ci], h: CELL_H });
    }
  }
  const cards = rects.map((r, i) => cardGeo(r, k, items[i] ?? '', values.length ? values[i] ?? '' : '', i, fonts.sans));

  // ③ 全亮后整体缓推 scale 1→1.04，25f 收住，之后真静止（o cuoi sang xong + 16f）
  const pushAt = FIRST + (n - 1) * GAP + 16;
  const push = interpolate(frame, [pushAt, pushAt + 25], [1, 1.04], { ...clampI, easing: Easing.bezier(0.33, 0, 0.2, 1) });

  // 标题随首格点亮微微提亮，交代场景
  const titleLit = interpolate(frame, [FIRST, FIRST + 20], [0.25, 1], { ...clampI, easing: Easing.out(Easing.quad) });
  // 全亮后地面暖光稍起
  const allLit = interpolate(frame, [FIRST + (n - 1) * GAP + 6, FIRST + (n - 1) * GAP + 30], [0, 1], { ...clampI, easing: Easing.out(Easing.quad) });
  const top = [brand?.name, kicker].filter(Boolean).join(' · ');

  // [Agent Edit] NEN ANH AI: bo nen toi + quang am mat dat; tieu de nam truc tiep tren nen co bong do
  const bd = useBackdrop();

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {!bd && <Backdrop tone="dark" light={{ x: 0.5, y: 0.1 }} accent={AMBER} grain={0} vignette={0.55} />}
      {!bd && <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 50% 40% at 50% 62%, rgba(232,180,94,0.10), rgba(232,180,94,0) 70%)',
        opacity: 0.3 + 0.7 * allLit,
      }} />}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `960px ${SH / 2}px` }}>
        <div style={{ position: 'absolute', left: LEFT, top: titleTop, fontFamily: fonts.sans, opacity: titleLit, textShadow: bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined }}>
          {top ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 * k, height: kSz * 1.3 }}>
              {brand ? <ShotcraftMark size={kSz * 1.4} tone="dark" /> : null}
              <span style={{ fontSize: kSz, fontWeight: 700, letterSpacing: '0.08em', color: AMBER, opacity: 0.9, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{top}</span>
            </div>
          ) : null}
          <div style={{ marginTop: portrait ? 24 : 10, fontSize: tSz, fontWeight: 700, letterSpacing: '-0.03em', color: '#f1efe9', lineHeight: 1.16 }}>
            {titleLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        </div>
        {cards.map((g, i) => (
          <Cell key={i} i={i} frame={frame} g={g} />
        ))}
      </div>
      <Grain opacity={0.08} blend="soft-light" />
    </AbsoluteFill>
  );
};
