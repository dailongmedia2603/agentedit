// assemble-then-type-flyin — 先骨架后文字：页面"自己长出来"
//
// 第二轮重设计（石墨暗场 · 胶片金 · 发布页）：
// - look = graphite（近单色暗场，accent2 胶片金作唯一强调色）。成形后的画面是一张发布页：玻璃导航条（品牌标志 + 字标）、
//   112px 衬线大标题两行（第二行末词金色斜体）、说明句、金色 CTA + 描边次按钮、三枚指标块；右侧是一张 640×760 的「调色台」卡
//   （上半是一帧胶片画面，下半是三只色轮）。
// - 两段式手法不变、维度分开：
//   ① 骨架段 6–50f：10 个无字骨架件（框、色块、分隔线、色轮圈）从画外 120–420px 平面飞入，
//      overshoot 过冲贴合 + ±7° 旋转回正，按真实速度给方向性运动模糊；开场画面里先有 12 栏版式参考线。
//   ② 文字段 58–128f：每个字符带确定性种子的 dx ±260 / dy ±200 / dz −200→−760 / rotateX/Y/Z ±120–190°，
//      perspective(900px) 下翻滚着落位，远处虚近处实；先大标题、后导航与说明、最后 mono 小标注。
//      块内字间隔按字数自适应，保证全部在 128f 前落定。
// - 收尾一笔（落定后的"定稿"信号）：CTA 由描边通电成金色实底；胶片画面从扁平的 log 灰片被一道竖向
//   擦除线"调色"成暖金成片 —— 呼应标题。
//
// 时间表（30fps，共 168f）：
//   0–8     版式参考线就位（第 1 帧即有画面）
//   6–50    骨架飞入（10 件，起飞间隔先密后疏）
//   50–58   停半拍：骨架齐了、参考线退淡（两段之间的语义断点）
//   58–128  文字 3D 逐字落位（大字 58/66 → 导航/说明 76–92 → 指标 96–102 → 小标注 104–114）
//   118–146 CTA 通电、胶片画面调色擦除（124–146），色轮控制点同步从中性推到偏色位
//   128–168 hold（40f）：整页 1.5% 极缓推近
//
// [Agent Edit] o chu: kicker / line1 / line2 (tu cuoi = nhan vang nghieng) / subtitle / cta / cta2 / stats (3 so) /
// stat_labels (3 nhan); o anh `photo` (tuy chon, ti le bat ky — thay khung phim, van "chinh mau" tu xam log sang mau that).
// Menu / nhan mau tren giao dien gia = tieng Viet trung tinh. Chu that dai ngan bat ky: moi khoi tu thu nho / xuong dong
// (do bang font that); vi tri menu tinh tu be ngang that. Ky tu chuan hoa NFC (dau tieng Viet khong bi tach khoi chu).
// Khung doc (native): trang xep doc — nav, kicker, tieu de ~200px, cau phu, 2 nut, the "phim + banh xe mau", 3 chi so;
// ca khoi can giua theo chieu cao that.
import { useBackdrop, useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';

import { EASE, FONT, SpeedBlur, ramp } from '../../../fixtures/Polish';
import { LOOKS, SERIF, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const ASSEMBLE_THEN_TYPE_FLYIN_DURATION = 168;

const L = LOOKS.graphite;

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ───────────── 骨架件（无字）：from = 飞入起点位移，rot = 起始旋转，at = 起飞帧 ─────────────
type Shell = { from: [number, number]; rot: number; at: number };
const SHELL_DUR = 16;
const SH: Record<string, Shell> = {
  nav: { from: [0, -180], rot: 0, at: 6 },
  card: { from: [420, 40], rot: 6, at: 10 },
  logo: { from: [-220, -80], rot: -7, at: 15 },
  wheels: { from: [260, 220], rot: 5, at: 19 },
  divider: { from: [-320, 0], rot: 0, at: 23 },
  cta: { from: [-160, 200], rot: -5, at: 27 },
  ghost: { from: [120, 220], rot: 4, at: 31 },
  stat1: { from: [-240, 260], rot: -6, at: 35 },
  stat2: { from: [0, 300], rot: 3, at: 39 },
  stat3: { from: [220, 280], rot: 6, at: 44 },
};

// ───────────── 文字块：逐字 3D 落位 ─────────────
type Seg = { s: string; color?: string; italic?: boolean };
type Block = { x: number; y: number; start: number; style: React.CSSProperties; segs: Seg[]; w?: number; align?: 'center' | 'right'; cta?: boolean };
const TEXT_END = 128; // 每块最后一字落定上限
const CHAR_DUR = 16;

type CharP = { dx: number; dy: number; dz: number; rx: number; ry: number; rz: number };
const charParams = (blocks: Block[]): CharP[][][] => {
  let seedK = 0;
  return blocks.map((b) =>
    b.segs.map((sg) =>
      Array.from(sg.s, () => {
        const k = seedK++;
        return {
          dx: (rand(k) - 0.5) * 520, dy: (rand(k + 50) - 0.5) * 400, dz: -200 - rand(k + 99) * 560,
          rx: (rand(k + 7) - 0.5) * 340, ry: (rand(k + 13) - 0.5) * 380, rz: (rand(k + 23) - 0.5) * 240,
        };
      }),
    ),
  );
};

const FlyBlock: React.FC<{ b: Block; params: CharP[][]; frame: number }> = ({ b, params, frame }) => {
  const n = Math.max(1, params.reduce((a, s) => a + s.length, 0));
  const step = Math.min(1.6, Math.max(0.35, (TEXT_END - b.start - CHAR_DUR) / n));
  let ci = 0;
  return (
    <div style={{
      position: 'absolute', left: b.x, top: b.y, width: b.w, textAlign: b.align, whiteSpace: 'nowrap', ...b.style,
    }}>
      {b.segs.map((sg, si) => (
        <span key={si} style={{ color: sg.color, fontStyle: sg.italic ? 'italic' : undefined }}>
          {Array.from(sg.s, (ch, k) => {
            const c = params[si][k];
            const ft = b.start + ci++ * step;
            const a = ramp(frame, ft, CHAR_DUR, EASE.snappy);
            const far = (1 - a) * (1 - a);
            const blur = far * (1 + (-c.dz / 760) * 7);
            const glyph = ch === ' ' ? ' ' : ch; // 空格塞成不换行空格，否则 inline-block 空 span 宽度归零
            return (
              <span key={k} style={{
                display: 'inline-block', opacity: a > 0 ? Math.min(1, a * 1.8) : 0,
                filter: a > 0 && a < 1 && blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
                transform: a >= 1 ? 'none' :
                  `perspective(900px) translate3d(${((1 - a) * c.dx).toFixed(1)}px,${((1 - a) * c.dy).toFixed(1)}px,${((1 - a) * c.dz).toFixed(1)}px) ` +
                  `rotateX(${((1 - a) * c.rx).toFixed(1)}deg) rotateY(${((1 - a) * c.ry).toFixed(1)}deg) rotateZ(${((1 - a) * c.rz).toFixed(1)}deg)`,
              }}>
                {glyph}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
};

// 面板材质：带色相的深色 + 低透明度白描边 + 顶部内高光 + 两层软阴影
const PANEL: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1d1e22 0%, #16171a 100%)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.85)',
};

const LOG = 'saturate(0.12) contrast(0.62) brightness(1.18)';
const GRADED = 'saturate(1.15) contrast(1.08)';

// 胶片画面：暮色天空 + 低悬的太阳 + 三层山影 + 水面反光（纯渐变 / SVG，graded 控制 log 灰片 ↔ 成片）
// [Agent Edit] co anh that (o `photo`) -> anh cover giua khung, cung bo loc log ↔ graded
const FilmStill: React.FC<{ graded: boolean; w: number; h: number; src?: string }> = ({ graded, w, h, src }) => {
  if (src) {
    return <img src={src} style={{ position: 'absolute', inset: 0, width: w, height: h, objectFit: 'cover', objectPosition: '50% 50%', filter: graded ? GRADED : LOG }} />;
  }
  const s = Math.max(w / 640, h / 500);
  return (
    <div style={{ position: 'absolute', left: (w - 640 * s) / 2, top: (h - 500 * s) / 2, width: 640, height: 500, transform: `scale(${s.toFixed(4)})`, transformOrigin: '0 0' }}>
      <div style={{
        position: 'absolute', inset: 0,
        filter: graded ? GRADED : LOG,
        background: 'linear-gradient(180deg, #1c2a3a 0%, #6b5a5a 38%, #e09a52 60%, #f2c27a 66%, #3a2a22 67%, #1a1410 100%)',
      }}>
        <div style={{ position: 'absolute', left: 300, top: 196, width: 120, height: 120, borderRadius: 60, background: 'radial-gradient(circle, #fff1cf 0%, #ffd58a 45%, rgba(255,190,110,0) 72%)' }} />
        <svg width={640} height={500} viewBox="0 0 640 500" style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d="M0 300 L80 262 L150 284 L240 236 L330 276 L420 244 L520 280 L640 250 L640 340 L0 340 Z" fill="#7a5040" opacity={0.7} />
          <path d="M0 322 L110 292 L210 314 L300 286 L400 318 L500 296 L640 318 L640 340 L0 340 Z" fill="#4a3028" />
          <rect x={0} y={334} width={640} height={166} fill={`url(#water${graded ? 'g' : 'l'})`} />
          <defs>
            <linearGradient id={`water${graded ? 'g' : 'l'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c47a3c" />
              <stop offset="0.25" stopColor="#4a3226" />
              <stop offset="1" stopColor="#120d0a" />
            </linearGradient>
          </defs>
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={338 - i * 6} y={346 + i * 18} width={44 + i * 12} height={3} rx={1.5} fill="#ffd9a0" opacity={0.55 - i * 0.07} />
          ))}
        </svg>
      </div>
    </div>
  );
};

const Wheel: React.FC<{ cx: number; hue: string; dot: [number, number]; k: number; s?: number }> = ({ cx, hue, dot, k, s = 1 }) => (
  <div style={{ position: 'absolute', left: cx - 74 * s, top: 0, width: 148, height: 148, transform: `scale(${s})`, transformOrigin: '0 0' }}>
    <div style={{
      position: 'absolute', inset: 0, borderRadius: '50%',
      background: `conic-gradient(from 90deg, #c95a5a, #c9b25a, #5ac97a, #5ab2c9, #6a5ac9, #c95ab2, #c95a5a)`, opacity: 0.55,
      WebkitMaskImage: 'radial-gradient(circle, transparent 54%, #000 56%, #000 70%, transparent 71%)',
      maskImage: 'radial-gradient(circle, transparent 54%, #000 56%, #000 70%, transparent 71%)',
    }} />
    <div style={{ position: 'absolute', inset: 26, borderRadius: '50%', background: 'radial-gradient(circle, #2a2b30 0%, #1a1b1f 100%)', border: '1px solid rgba(255,255,255,0.08)' }} />
    <div style={{ position: 'absolute', left: 74 + dot[0] * k - 9, top: 74 + dot[1] * k - 9, width: 18, height: 18, borderRadius: 9, background: hue, boxShadow: `0 0 0 3px rgba(0,0,0,0.5), 0 0 12px ${hue}` }} />
  </div>
);

// 多行折行：字号逐步缩小直到行数 ≤ maxLines 且每行都装得下
const wrapFit = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number, minSize: number) => {
  let sz = size;
  for (;;) {
    const lines = wrapLines(text, family, sz, maxW, weight, 99);
    const ok = lines.length <= maxLines && lines.every((l) => measureText(l, family, sz, weight) <= maxW);
    if (ok || sz <= minSize) return { size: sz, lines: lines.length <= maxLines ? lines : wrapLines(text, family, sz, maxW, weight, maxLines) };
    sz = Math.max(minSize, Math.floor(sz * 0.93));
  }
};

type R = { x: number; y: number; w: number; h: number };

export const AssembleThenTypeFlyin: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SHH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SHH > 1080 * 1.2;
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: khong ve nen code, chu tren nen co bong do nhe
  const onBg: React.CSSProperties = bd ? { textShadow: '0 2px 18px rgba(0,0,0,0.55)' } : {};
  const GOLD = L.accent2;
  const MONO = fonts.mono;

  const nfc = (s: string) => s.normalize('NFC');
  const kicker = nfc(useText('kicker', 'TRỢ LÝ AI · DỰNG VIDEO TỰ ĐỘNG'));
  const line1 = nfc(useText('line1', 'Ý tưởng thành hình.'));
  const line2 = nfc(useText('line2', 'Dựng thành video.'));
  const sub = nfc(useText('subtitle', 'Video sản phẩm chuẩn điện ảnh, trợ lý AI dựng giúp bạn.'));
  const ctaT = nfc(useText('cta', 'Dùng thử ngay'));
  const cta2T = nfc(useText('cta2', 'Xem video mẫu'));
  const statsRaw = useList('stats', ['1 câu lệnh', '4K', '30 giây']);
  const labelsRaw = useList('stat_labels', ['RA VIDEO HOÀN CHỈNH', 'CHẤT LƯỢNG XUẤT', 'MỖI VIDEO']);
  const stats = [0, 1, 2].map((i) => nfc(statsRaw[i] ?? ''));
  const labels = [0, 1, 2].map((i) => nfc(labelsRaw[i] ?? ''));
  const photo = useImage('photo');
  const brandName = nfc(BRAND.name || '');
  const NAV = ['Tính năng', 'Mẫu video', 'Bảng giá'];
  const NAV_BTN = 'Đăng ký';
  const CARD_LABEL = 'KHUNG 04 · CẬN CẢNH';
  const WHEEL_LABELS = ['VÙNG TỐI', 'TRUNG TÍNH', 'VÙNG SÁNG'];

  // 标题第二行：末词金色斜体
  const l2w = line2.split(/\s+/).filter(Boolean);
  const l2last = l2w.length > 1 ? l2w[l2w.length - 1] : line2;
  const l2head = l2w.length > 1 ? l2w.slice(0, -1).join(' ') + ' ' : '';

  // ───────── 版式（横版 = 原版坐标；竖版 = 纵向重排）─────────
  const M = 120;
  const CW = P ? 1680 : 980; // 左栏 / 竖版内容宽
  const sz = {
    nav: P ? 44 : 28, brand: P ? 52 : 34, logo: P ? 64 : 40, kick: P ? 40 : 24,
    title: P ? 210 : 112, sub: P ? 64 : 36, btn: P ? 58 : 32, stat: P ? 100 : 56, statLb: P ? 32 : 22, mono: P ? 32 : 22,
  };
  const kickS = fitSize(kicker, { family: MONO, size: sz.kick, maxWidth: CW, weight: 600, minSize: sz.kick * 0.6, letterSpacingEm: 0.12 });
  const titleS = Math.min(
    fitSize(line1, { family: fonts.serif, size: sz.title, maxWidth: CW, weight: 400, minSize: sz.title * 0.5 }),
    fitSize(line2, { family: fonts.serif, size: sz.title, maxWidth: CW, weight: 400, italic: true, minSize: sz.title * 0.5 }),
  );
  const subFit = wrapFit(sub, fonts.sans, sz.sub, CW, 400, P ? 3 : 2, P ? 42 : 24);
  const subLH = subFit.size * (P ? 1.3 : 1.22);

  let nav: R, logo: R, kickY: number, t1Y: number, t2Y: number, subY: number, divY: number, cta: R, ghost: R, card: R, filmH: number, wheels: R, statR: R[];
  if (!P) {
    nav = { x: 120, y: 64, w: 1680, h: 80 };
    logo = { x: 140, y: 84, w: 40, h: 40 };
    kickY = 246; t1Y = 298; t2Y = 424;
    subY = subFit.lines.length > 1 ? 596 : 604;
    divY = 572;
    cta = { x: 120, y: 700, w: 320, h: 80 };
    ghost = { x: 466, y: 700, w: 320, h: 80 };
    card = { x: 1160, y: 220, w: 640, h: 760 };
    filmH = 500;
    wheels = { x: 1160, y: 744, w: 640, h: 150 };
    statR = [0, 1, 2].map((i) => ({ x: 120 + i * 338, y: 836, w: 314, h: 144 }));
  } else {
    const navH = 132, gapK = 170, titleLH = titleS * 1.16, ctaH = 150, filmH0 = 760, wheelsH = 330, statH = 280;
    const total = navH + gapK + 56 + titleS * 0.3 + 2 * titleLH + 50 + subFit.lines.length * subLH + 60 + 70 + ctaH + 110 + (filmH0 + wheelsH) + 70 + statH;
    let y = Math.max(90, Math.round((SHH - total) / 2));
    nav = { x: M, y, w: CW, h: navH }; logo = { x: M + 28, y: y + (navH - sz.logo) / 2, w: sz.logo, h: sz.logo };
    y += navH + gapK; kickY = y;
    y += 56 + titleS * 0.3; t1Y = y; t2Y = y + titleLH;
    y += 2 * titleLH + 50; subY = y;
    y += subFit.lines.length * subLH + 60; divY = y;
    y += 70; cta = { x: M, y, w: (CW - 40) / 2, h: ctaH }; ghost = { x: M + (CW + 40) / 2, y, w: (CW - 40) / 2, h: ctaH };
    y += ctaH + 110; card = { x: M, y, w: CW, h: filmH0 + wheelsH }; filmH = filmH0;
    wheels = { x: M, y: y + filmH0 + 36, w: CW, h: 240 };
    y += filmH0 + wheelsH + 70;
    statR = [0, 1, 2].map((i) => ({ x: M + i * ((CW - 72) / 3 + 36), y, w: (CW - 72) / 3, h: statH }));
  }
  const wheelS = P ? 1.5 : 1;
  const wheelCx = [card.w / 6, card.w / 2, (card.w * 5) / 6];

  // 导航项：从按钮左侧向左按真实宽度排布
  const navBtn: R = { x: nav.x + nav.w - 12 - (P ? 300 : 202), y: nav.y + 12, w: P ? 300 : 202, h: nav.h - 24 };
  const navItemX: number[] = [];
  {
    let x = navBtn.x - (P ? 64 : 48);
    for (let i = NAV.length - 1; i >= 0; i--) {
      const w = measureText(NAV[i], fonts.sans, sz.nav, 500);
      x -= w;
      navItemX[i] = x;
      x -= P ? 60 : 44;
    }
  }
  const navTextY = nav.y + (nav.h - sz.nav * 1.3) / 2 + (P ? 0 : 0);
  const brandMaxW = Math.max(60, navItemX[0] - (logo.x + logo.w + 16) - 40);
  const brandS = brandName ? fitSize(brandName, { family: fonts.sans, size: sz.brand, maxWidth: brandMaxW, weight: 700, minSize: sz.brand * 0.5 }) : sz.brand;

  const btnText = (t: string, w: number) => fitSize(t, { family: fonts.sans, size: sz.btn, maxWidth: w - (P ? 70 : 40), weight: 650, minSize: sz.btn * 0.55 });
  const ctaS = btnText(ctaT, cta.w);
  const cta2S = btnText(cta2T, ghost.w);
  const statInner = statR[0].w - (P ? 70 : 60);
  const statS = Math.min(...stats.map((s) => fitSize(s || '0', { family: fonts.sans, size: sz.stat, maxWidth: statInner, weight: 750, minSize: sz.stat * 0.45 })));
  const lbS = Math.min(...labels.map((s) => fitSize(s || '-', { family: MONO, size: sz.statLb, maxWidth: statInner, weight: 400, minSize: sz.statLb * 0.55, letterSpacingEm: 0.12 })));
  const statPad = P ? 36 : 30;
  const statNumY = (r: R) => r.y + (P ? 50 : 26);
  const statLbY = (r: R) => statNumY(r) + statS * 1.15 + (P ? 26 : 14);

  const titleStyle: React.CSSProperties = { fontFamily: SERIF, fontSize: titleS, fontWeight: 400, letterSpacing: '-0.025em', color: L.ink, lineHeight: 1 };
  const monoStyle = (size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: MONO, fontSize: size, letterSpacing: '0.12em', lineHeight: 1.3, ...extra });
  const btnY = (r: R, s: number) => r.y + (r.h - s * 1.3) / 2;

  const BLOCKS: Block[] = [
    { x: M, y: t1Y, start: 58, style: { ...titleStyle, ...onBg }, segs: [{ s: line1 }] },
    { x: M, y: t2Y, start: 66, style: { ...titleStyle, ...onBg, fontStyle: 'italic' }, segs: [{ s: l2head }, { s: l2last, color: GOLD }] },
    { x: logo.x + logo.w + 16, y: nav.y + (nav.h - brandS * 1.3) / 2, start: 76, style: { ...type(brandS, 700), fontFamily: BRAND.font, letterSpacing: '0.03em', color: L.ink, lineHeight: 1.3 }, segs: [{ s: brandName }] },
    ...NAV.map((t, i): Block => ({ x: navItemX[i], y: navTextY, start: 79 + i, style: { ...type(sz.nav, 500), color: L.ink2, lineHeight: 1.3 }, segs: [{ s: t }] })),
    { x: navBtn.x, y: nav.y + (nav.h - sz.nav * 1.3) / 2, w: navBtn.w, align: 'center', start: 84, style: { ...type(sz.nav, 650), color: L.ink, lineHeight: 1.3 }, segs: [{ s: NAV_BTN }] },
    { x: M, y: kickY, start: 86, style: monoStyle(kickS, { fontWeight: 600, color: GOLD, ...onBg }), segs: [{ s: kicker }] },
    ...subFit.lines.map((l, i): Block => ({ x: M, y: subY + i * subLH, start: 88 + i * 3, style: { ...type(subFit.size, 400), color: L.ink2, lineHeight: 1.22, ...onBg }, segs: [{ s: l }] })),
    { x: cta.x, y: btnY(cta, ctaS), w: cta.w, align: 'center', start: 92, cta: true, style: { ...type(ctaS, 650), color: '#16120a', lineHeight: 1.3 }, segs: [{ s: ctaT }] },
    { x: ghost.x, y: btnY(ghost, cta2S), w: ghost.w, align: 'center', start: 95, style: { ...type(cta2S, 550), color: L.ink, lineHeight: 1.3 }, segs: [{ s: cta2T }] },
    ...statR.map((r, i): Block => ({ x: r.x + statPad, y: statNumY(r), start: 96 + i * 3, style: { ...type(statS, 750), color: L.ink, lineHeight: 1.15 }, segs: [{ s: stats[i] }] })),
    ...statR.map((r, i): Block => ({ x: r.x + statPad, y: statLbY(r), start: 104 + i * 2, style: monoStyle(lbS, { color: L.ink3 }), segs: [{ s: labels[i] }] })),
    { x: card.x + (P ? 44 : 36), y: card.y + (P ? 40 : 32), start: 110, style: monoStyle(sz.mono, { letterSpacing: '0.1em', color: alpha('#ffffff', 0.85) }), segs: [{ s: CARD_LABEL }] },
    ...WHEEL_LABELS.map((t, i): Block => ({
      x: card.x + wheelCx[i] - card.w / 6, y: wheels.y + 148 * wheelS + (P ? 22 : 16), w: card.w / 3, align: 'center', start: 112 + i,
      style: monoStyle(fitSize(t, { family: MONO, size: sz.mono, maxWidth: card.w / 3 - 20, minSize: 12, letterSpacingEm: 0.14 }), { letterSpacing: '0.14em', color: L.ink2 }), segs: [{ s: t }],
    })),
  ];
  const params = charParams(BLOCKS);

  const shellAt = (s: Shell, f: number) => {
    const a = ramp(f, s.at, SHELL_DUR, EASE.overshoot);
    return { x: (1 - a) * s.from[0], y: (1 - a) * s.from[1], r: (1 - ramp(f, s.at, SHELL_DUR + 4, EASE.snappy)) * s.rot };
  };
  const shelled = (s: Shell, style: React.CSSProperties, children?: React.ReactNode) => {
    if (frame < s.at) return null;
    const p = shellAt(s, frame);
    const p0 = shellAt(s, frame - 0.5);
    const p1 = shellAt(s, frame + 0.5);
    const op = Math.min(1, ramp(frame, s.at, 6, EASE.out) * 1.2);
    return (
      <SpeedBlur vx={p1.x - p0.x} vy={p1.y - p0.y} amount={0.32} max={18}>
        <div style={{ position: 'absolute', opacity: op, transform: `translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px) rotate(${p.r.toFixed(2)}deg)`, ...style }}>
          {children}
        </div>
      </SpeedBlur>
    );
  };
  const rect = (r: R): React.CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

  const ctaOn = ramp(frame, 118, 14, EASE.out);
  const wipe = ramp(frame, 124, 22, EASE.swift); // 胶片调色擦除 0→1（左→右）
  const push = 1 + 0.015 * ramp(frame, 120, 48, EASE.smooth);

  return (
    <div style={{ width: 1920, height: SHH, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans, background: bd ? 'transparent' : L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.85, y: 0.55 }} intensity={0.75} breathe={0.3} />
      {/* [Agent Edit] bo 12 cot duong ke o (luoi ke o trang tri) theo yeu cau user */}

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: '50% 50%' }}>
        {/* ── 骨架段 ── */}
        {shelled(SH.nav, { ...PANEL, ...rect(nav), borderRadius: P ? 34 : 24, background: 'linear-gradient(180deg, rgba(40,41,46,0.75), rgba(26,27,30,0.75))' },
          <div style={{
            position: 'absolute', right: 12, top: 12, width: navBtn.w, height: navBtn.h, borderRadius: P ? 24 : 16, boxSizing: 'border-box',
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
          }} />,
        )}
        {shelled(SH.logo, rect(logo),
          // 品牌标志：作为一件无字骨架件飞入，暗底反白版
          <ShotcraftMark size={logo.w} tone="dark" />,
        )}
        {shelled(SH.card, { ...PANEL, ...rect(card), borderRadius: P ? 40 : 30, overflow: 'hidden' }, <>
          <div style={{ position: 'absolute', left: 0, top: 0, width: card.w, height: filmH, overflow: 'hidden' }}>
            <FilmStill graded={false} w={card.w} h={filmH} src={photo} />
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${((1 - wipe) * 100).toFixed(2)}% 0 0)` }}>
              <FilmStill graded w={card.w} h={filmH} src={photo} />
            </div>
            {wipe > 0 && wipe < 1 && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: wipe * card.w - 1, width: P ? 3 : 2, background: GOLD, boxShadow: `0 0 18px ${alpha(GOLD, 0.9)}` }} />
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: P ? 180 : 120, background: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: filmH, width: card.w, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </>)}
        {shelled(SH.wheels, rect(wheels), <>
          {/* 色轮控制点：log 灰片时居中（中性），调色擦除时同步推到各自的偏色位置 */}
          <Wheel cx={wheelCx[0]} hue="#7fb2ff" dot={[-16, 22]} k={wipe} s={wheelS} />
          <Wheel cx={wheelCx[1]} hue="#f2d9a8" dot={[12, -10]} k={wipe} s={wheelS} />
          <Wheel cx={wheelCx[2]} hue={GOLD} dot={[24, -20]} k={wipe} s={wheelS} />
        </>)}
        {shelled(SH.divider, { left: M, top: divY, width: P ? CW : 980, height: P ? 2 : 1, background: `linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0))` })}
        {shelled(SH.cta, {
          ...rect(cta), borderRadius: cta.h / 2, boxSizing: 'border-box',
          border: `1.5px solid ${alpha(GOLD, 0.5 + 0.5 * ctaOn)}`,
          background: `linear-gradient(180deg, ${alpha('#f0d6a2', 0.06 + 0.94 * ctaOn)}, ${alpha(GOLD, 0.04 + 0.96 * ctaOn)})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,${(0.1 + 0.35 * ctaOn).toFixed(2)}), 0 16px 40px -14px ${alpha(GOLD, 0.55 * ctaOn)}`,
        })}
        {shelled(SH.ghost, { ...rect(ghost), borderRadius: ghost.h / 2, boxSizing: 'border-box', border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.03)' })}
        {(['stat1', 'stat2', 'stat3'] as const).map((k, i) =>
          <React.Fragment key={k}>{shelled(SH[k], { ...PANEL, ...rect(statR[i]), borderRadius: P ? 30 : 22 })}</React.Fragment>,
        )}

        {/* ── 文字段：逐字 3D 翻滚落位 ── */}
        {BLOCKS.map((b, bi) => {
          const text = b.cta ? { ...b, style: { ...b.style, color: ctaOn > 0.5 ? '#16120a' : '#f0d6a2' } } : b; // CTA 字随通电由金转深
          return <FlyBlock key={bi} b={text} params={params[bi]} frame={frame} />;
        })}
      </div>
    </div>
  );
};
