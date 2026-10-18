// portal-wipe 穿窗入景（纵深款）——网格里一张卡放大成全屏窗口，窗内是被点开那张卡的"世界"，
// 只 2 层视差（远景面板 0.08 + 近景 2 枚浮卡 0.3，不加 blur），穿窗完成后 8f 缓停 → 静止读清新景。
//
// 第二轮重设计（瓷白工作台 → 钴蓝预测世界）：
// - look = porcelain（冷白 · 钴蓝）。不再用通用灰阶 FakeDashboard：外景是为镜头设计的 video-shotcraft
//   「Workspace」主页（眉题前挂字标）——96px 问候标题 + 3×2 张「影片项目」卡，每张卡有自己的程序化封面
//   （同心圆 / 柱 / 点阵 / 斜纹 / 弧 / 波形）、40px 标题与 32px 元信息。目标卡 = 第 2 行居中的
//   「Premiere Forecast」（发布片的观看量预测，钴蓝封面 + 三道波形）。
// - 语义闭环：目标卡的**封面就是窗内世界的样子**——窗内是深钴蓝空间，三道同款波形放大成背景地貌；
//   远景层 = 一块玻璃预测面板（64px 标题 + 面积图：实线历史 + 虚线预测区间 + TODAY 标线），
//   近景层 = 两枚浮卡（+18.4% vs last launch / 94% confidence 环），落点压住面板两角，做出前后景。
// - 运动：目标卡先悬浮抬起作预备（−10px、1.03×、阴影变大变虚），邻卡同时退暗；窗放大 40f 用
//   bezier(0.7,0,0.3,1) 先慢后快再缓收；窗内整景 0.42→1 与窗几何同一个 t；面积图的线随 t 画出、
//   与穿窗同时完成；视差散开 Easing.out(cubic) 在穿窗完成后 8f 内速度归零，之后画面真静止。
//
// 时间表（30fps，共 140f）：
//   0–14    hold：Workspace 主页建立（第 0 帧即完整画面）
//   14–26   预备：目标卡抬起、邻卡退暗 18%
//   26–66   窗放大 40f：卡变全屏窗，卡面 0–28% 行程内渐隐露出窗内世界（再慢会被拉成巨字残影）
//   42–74   近/远两层视差散开（66f 穿窗完成后 8f 缓停）
//   74–140  静止 hold 66f：新世界完整可读
//
// [Agent Edit] o chu: title (loi chao / tieu de trang ngoai) / subtitle (dong phu phai) / items (5 ten the khac tren luoi) /
// target (ten the duoc mo = tieu de the gioi ben trong) / target_meta / world_kicker / stat1 + stat1_label (the noi phai tren)
// / stat2 + stat2_label (the noi trai duoi, vong % lay tu stat2 neu la %). o anh `screen` (tuy chon): anh chi tiet (man hinh
// app / trang / bieu do that) — hien trong bia the dich VA trong tam kinh lon cua the gioi ben trong (cover = the gioi,
// giu "khep vong y nghia"); khong co -> bieu do du bao ve bang code nhu ban goc. Nhip goc giu nguyen (cho 14f, nhac the
// 12f, mo cua so 40f bezier(.7,0,.3,1), the gioi 0.42->1 cung t, mat the mo trong 28% dau, 2 lop thi sai 0.08 / 0.3,
// dung han 74f). Khung doc (native): luoi 2 cot x 3 hang (the to 1.57x), the gioi xep doc (tam kinh cao + 2 the noi).
import { useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate } from 'remotion';
import { EASE, FONT, ramp, mix, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { ShotcraftWordmark } from '../../../fixtures/Brand';

export const PORTAL_WIPE_V2_DURATION = 140;

const L = LOOKS.porcelain;
const COBALT = { deep: '#040a26', mid: '#0b1a5c', hi: '#2f5bff', glow: '#7d9bff', mint: '#3fe0c5' };

type Art = 'rings' | 'bars' | 'dots' | 'stripes' | 'waves' | 'arcs';
type Space = { name: string; meta: string; art: Art; c: [string, string] };
const ARTS: { art: Art; c: [string, string]; meta: string }[] = [
  { art: 'rings', c: ['#ff9a6b', '#ff5f6d'], meta: 'Quảng bá · 12 cảnh' },
  { art: 'bars', c: ['#4fd1a5', '#1f9e89'], meta: 'Cập nhật · 8 cảnh' },
  { art: 'dots', c: ['#b9a2ff', '#7a5cff'], meta: 'Hướng dẫn · 21 cảnh' },
  { art: 'stripes', c: ['#f2c879', '#d99a3e'], meta: 'Mẫu · 5 cảnh' },
  { art: 'waves', c: ['#3d6bff', '#0f2a9e'], meta: 'Phân tích · 9 video' },
  { art: 'arcs', c: ['#5cc8e8', '#2a7fb8'], meta: 'Xuất video · 14 việc' },
];
const TARGET = 4;

// 三道波形（封面与窗内世界共用同一组曲线 = 语义闭环）
const wavePath = (w: number, h: number, k: number, phase: number) => {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * w;
    const y = h * (0.62 - 0.1 * k) + Math.sin(i / 48 * Math.PI * 2.2 + phase + k * 0.9) * h * 0.11 - (i / 48) * h * 0.16;
    pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
};

const Cover: React.FC<{ s: Space; w: number; h: number; src?: string }> = ({ s, w, h, src }) => {
  const stroke = 'rgba(255,255,255,0.55)';
  let art: React.ReactNode = null;
  if (s.art === 'rings') art = [0, 1, 2, 3, 4].map((k) => <circle key={k} cx={w * 0.78} cy={h * 0.62} r={(30 + k * 34) * (h / 176)} fill="none" stroke={stroke} strokeWidth={2} opacity={1 - k * 0.16} />);
  if (s.art === 'bars') art = Array.from({ length: 9 }, (_, k) => { const bh = h * (0.25 + 0.5 * Math.abs(Math.sin(k * 1.3 + 0.6))); return <rect key={k} x={w * 0.42 + k * 30 * (w / 520)} y={h - bh} width={16 * (w / 520)} height={bh} rx={4} fill="rgba(255,255,255,0.42)" />; });
  if (s.art === 'dots') art = Array.from({ length: 40 }, (_, k) => <circle key={k} cx={w * 0.46 + (k % 10) * 26 * (w / 520)} cy={h * 0.2 + Math.floor(k / 10) * 32 * (h / 176)} r={(4 + ((k * 7) % 5)) * (h / 176)} fill="rgba(255,255,255,0.45)" />);
  if (s.art === 'stripes') art = Array.from({ length: 12 }, (_, k) => <line key={k} x1={w * 0.3 + k * 34 * (w / 520)} y1={h + 10} x2={w * 0.3 + k * 34 * (w / 520) + 120 * (w / 520)} y2={-10} stroke={stroke} strokeWidth={10} opacity={0.5} />);
  if (s.art === 'arcs') art = [0, 1, 2, 3].map((k) => { const r = (90 + k * 46) * (h / 176); return <path key={k} d={`M ${w * 0.35} ${h + 4} A ${r} ${r} 0 0 1 ${w * 0.35 + 2 * r} ${h + 4}`} fill="none" stroke={stroke} strokeWidth={2.5} />; });
  if (s.art === 'waves') art = [0, 1, 2].map((k) => <path key={k} d={wavePath(w, h, k, 0)} fill="none" stroke={k === 0 ? COBALT.mint : stroke} strokeWidth={k === 0 ? 4 : 2.5} />);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, background: `linear-gradient(135deg, ${s.c[0]} 0%, ${s.c[1]} 100%)`, overflow: 'hidden' }}>
      {src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>{art}</svg>}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 40%)' }} />
    </div>
  );
};

type TileG = { w: number; h: number; cover: number; k: number };
const Tile: React.FC<{ s: Space; g: TileG; src?: string }> = ({ s, g, src }) => {
  const fonts = useShotFonts();
  const nameFs = fitSize(s.name, { family: fonts.sans, size: 40 * g.k, maxWidth: g.w - 52 * g.k, weight: 650, minSize: 22 * g.k });
  const metaFs = fitSize(s.meta, { family: fonts.sans, size: 32 * g.k, maxWidth: g.w - 52 * g.k, weight: 450, minSize: 18 * g.k });
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 22 * g.k, overflow: 'hidden', background: L.surface, border: `1px solid ${L.line}` }}>
      <Cover s={s} w={g.w} h={g.cover} src={src} />
      <div style={{ position: 'absolute', left: 26 * g.k, top: g.cover + 20 * g.k, ...type(nameFs, 650), lineHeight: 1.25, color: L.ink, whiteSpace: 'nowrap' }}>{s.name}</div>
      <div style={{ position: 'absolute', left: 26 * g.k, top: g.cover + 76 * g.k, ...type(metaFs, 450), lineHeight: 1.25, color: L.ink3, whiteSpace: 'nowrap' }}>{s.meta}</div>
    </div>
  );
};

// ───────── 窗内世界：钴蓝预测空间 ─────────
// 预测曲线：确定性序列（0–39 历史实线，39–59 预测虚线 + 区间带）
const SERIES = Array.from({ length: 60 }, (_, i) => 0.28 + i * 0.007 + 0.065 * Math.sin(i * 0.55) + 0.02 * Math.sin(i * 1.7 + 1));
const NOW = 39;

const glass: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(160,185,255,0.13) 0%, rgba(120,150,255,0.05) 100%)',
  border: '1px solid rgba(190,210,255,0.18)',
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 50px 120px -30px rgba(0,2,20,0.8), 0 14px 36px rgba(0,2,20,0.45)`,
};

type WorldText = { kicker: string; title: string; stat1: string; stat1L: string; stat2: string; stat2L: string; ring: number };

const ForecastPanel: React.FC<{ draw: number; box: { x: number; y: number; w: number; h: number }; k: number; t: WorldText; src?: string }> = ({ draw, box, k, t, src }) => {
  const fonts = useShotFonts();
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const pad = 64 * k;
  const titleW = box.w - pad * 2;
  const tl = wrapLines(t.title, fonts.sans, 64 * k, titleW, 700, 2);
  const tFs = Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: 64 * k, maxWidth: titleW, weight: 700, minSize: 34 * k })));
  const kFs = fitSize(t.kicker.toUpperCase(), { family: fonts.sans, size: 28 * k, maxWidth: titleW, weight: 600, minSize: 16 * k, letterSpacingEm: 0.16 });
  const titleBottom = 96 * k + tl.length * tFs * 1.18;
  const legendTop = titleBottom + 20 * k;
  const CH = { x: pad, y: legendTop + 80 * k, w: box.w - pad * 2, h: box.h - (legendTop + 80 * k) - 110 * k };
  const px = (i: number) => CH.x + (i / 59) * CH.w;
  const py = (v: number) => CH.y + CH.h * (1 - v);
  const line = (a: number, b: number) => SERIES.slice(a, b + 1).map((v, j) => `${j ? 'L' : 'M'}${px(a + j).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const up = SERIES.slice(NOW).map((v, j) => `${j ? 'L' : 'M'}${px(NOW + j).toFixed(1)} ${py(v + 0.02 + j * 0.006).toFixed(1)}`).join(' ');
  const dn = SERIES.slice(NOW).map((v, j) => [px(NOW + j), py(v - 0.02 - j * 0.006)] as const).reverse().map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const BAND = `${up} ${dn} Z`;
  const AREA = `${line(0, NOW)} L${px(NOW).toFixed(1)} ${CH.y + CH.h} L${px(0).toFixed(1)} ${CH.y + CH.h} Z`;
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 30 * k, overflow: 'hidden', ...glass }}>
      <div style={{ position: 'absolute', left: pad, top: 52 * k, ...type(kFs, 600), color: COBALT.glow, letterSpacing: '0.16em', whiteSpace: 'nowrap' }}>{t.kicker.toUpperCase()}</div>
      <div style={{ position: 'absolute', left: pad, top: 92 * k }}>
        {tl.map((l, i) => <div key={i} style={{ ...type(tFs, 700), lineHeight: 1.18, color: '#f2f5ff', whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
      {src ? (
        // anh chi tiet that: dat trong tam kinh (cover), vien nhe — hien dan theo `draw` (cung nhip voi duong bieu do goc)
        <div style={{ position: 'absolute', left: pad, top: legendTop + 10 * k, width: box.w - pad * 2, height: box.h - legendTop - 10 * k - pad, borderRadius: 18 * k, overflow: 'hidden', border: '1px solid rgba(190,210,255,0.22)', opacity: 0.25 + 0.75 * Math.min(1, draw * 1.4) }}>
          <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', left: pad, top: legendTop, display: 'flex', gap: 34 * k, ...type(32 * k, 500), color: '#a9b8e8', whiteSpace: 'nowrap' }}>
            <span><span style={{ display: 'inline-block', width: 28 * k, height: 4 * k, borderRadius: 2, background: COBALT.mint, verticalAlign: 'middle', marginRight: 12 * k }} />Lượt xem</span>
            <span><span style={{ display: 'inline-block', width: 28 * k, height: 4 * k, borderRadius: 2, borderTop: `${3 * k}px dashed ${COBALT.glow}`, verticalAlign: 'middle', marginRight: 12 * k }} />90 ngày tới</span>
          </div>
          <svg width={box.w} height={box.h} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id={`pwa${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={COBALT.mint} stopOpacity={0.32} />
                <stop offset="1" stopColor={COBALT.mint} stopOpacity={0} />
              </linearGradient>
              <clipPath id={`pwd${id}`}><rect x={0} y={0} width={CH.x + CH.w * draw + 4} height={box.h} /></clipPath>
            </defs>
            {[0, 1, 2, 3].map((j) => <line key={j} x1={CH.x} x2={CH.x + CH.w} y1={CH.y + (CH.h / 3) * j} y2={CH.y + (CH.h / 3) * j} stroke="rgba(190,210,255,0.1)" strokeWidth={1.5 * k} />)}
            <g clipPath={`url(#pwd${id})`}>
              <path d={AREA} fill={`url(#pwa${id})`} />
              <path d={BAND} fill={alpha(COBALT.glow, 0.16)} />
              <path d={line(0, NOW)} fill="none" stroke={COBALT.mint} strokeWidth={5 * k} strokeLinejoin="round" strokeLinecap="round" />
              <path d={line(NOW, 59)} fill="none" stroke={COBALT.glow} strokeWidth={4 * k} strokeDasharray={`${12 * k} ${10 * k}`} strokeLinecap="round" />
            </g>
            {draw > 0.66 && (
              <g opacity={Math.min(1, (draw - 0.66) * 6)}>
                <line x1={px(NOW)} x2={px(NOW)} y1={CH.y - 16 * k} y2={CH.y + CH.h} stroke="rgba(230,238,255,0.45)" strokeWidth={1.5 * k} strokeDasharray={`${4 * k} ${6 * k}`} />
                <circle cx={px(NOW)} cy={py(SERIES[NOW])} r={10 * k} fill={COBALT.deep} stroke={COBALT.mint} strokeWidth={4 * k} />
                <text x={px(NOW) + 16 * k} y={CH.y - 2 * k} fontFamily={FONT.sans} fontWeight={600} fontSize={24 * k} fill="#a9b8e8" letterSpacing="0.12em">HÔM NAY</text>
              </g>
            )}
          </svg>
          <div style={{ position: 'absolute', left: pad, bottom: 46 * k, right: pad, display: 'flex', justifyContent: 'space-between', ...type(28 * k, 500), color: '#6f7fae' }}>
            <span /><span>T5</span><span>T6</span><span>T7</span><span>T8</span><span>T9</span>
          </div>
        </>
      )}
    </div>
  );
};

// 近景两枚浮卡的**终点**（散开 ×1.3 之后），按画面中心反推散开前的位置
const NEAR_K = 1.3;

const World: React.FC<{ spread: number; draw: number; H: number; portrait: boolean; t: WorldText; src?: string }> = ({ spread, draw, H, portrait, t, src }) => {
  const fonts = useShotFonts();
  const cy = H / 2;
  const k = portrait ? 1.35 : 1;
  const PH = portrait ? Math.min(2200, H - 1000) : 660;
  const panel = portrait ? { x: 120, y: Math.round(cy - PH / 2), w: 1680, h: PH } : { x: 340, y: 200, w: 1240, h: 660 };
  const nearPos = (x: number, y: number) => ({ x: 960 + (x - 960) / NEAR_K, y: cy + (y - cy) / NEAR_K });
  // the A: phai tren (de goc phai tren tam kinh); the B: trai duoi
  const aW = 400 * k, aH = 200 * k, bW = 420 * k, bH = 180 * k;
  const A = nearPos(portrait ? 1820 - aW : 1380, portrait ? panel.y - aH * 0.85 : 64);
  const B = nearPos(portrait ? 100 : 104, portrait ? panel.y + panel.h - bH * 0.2 : 790);
  const s1Fs = fitSize(t.stat1, { family: fonts.sans, size: 84 * k, maxWidth: aW - 60 * k, weight: 750, minSize: 36 * k });
  const s1L = fitSize(t.stat1L, { family: fonts.sans, size: 32 * k, maxWidth: aW - 60 * k, weight: 500, minSize: 16 * k });
  const s2Fs = fitSize(t.stat2, { family: fonts.sans, size: 64 * k, maxWidth: bW - 200 * k, weight: 750, minSize: 30 * k });
  const s2L = fitSize(t.stat2L, { family: fonts.sans, size: 32 * k, maxWidth: bW - 200 * k, weight: 500, minSize: 16 * k });
  const chipBg = 'linear-gradient(180deg, rgba(30,55,160,0.92), rgba(14,30,110,0.92))';
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 30%, ${COBALT.mid} 0%, #071244 50%, ${COBALT.deep} 100%)` }}>
      {/* 背景地貌：封面同款三道波形放大成世界的地平线 */}
      <svg width={1920} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        {[0, 1, 2].map((j) => <path key={j} d={wavePath(1920, 1080, j, 0)} transform={`translate(0 ${210 + (H - 1080) / 2})`} fill="none" stroke={j === 0 ? COBALT.mint : COBALT.glow} strokeOpacity={j === 0 ? 0.35 : 0.22} strokeWidth={j === 0 ? 3 : 2} />)}
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 40% 34% at 50% 18%, ${alpha(COBALT.hi, 0.35)} 0%, ${alpha(COBALT.hi, 0)} 100%)` }} />
      {/* 远景层（系数 0.08） */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${(1 + spread * 0.08).toFixed(4)})`, transformOrigin: `960px ${cy}px` }}>
        <ForecastPanel draw={draw} box={panel} k={k} t={t} src={src} />
      </div>
      {/* 近景层（系数 0.3）：两枚浮卡 */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${(1 + spread * (NEAR_K - 1)).toFixed(4)})`, transformOrigin: `960px ${cy}px` }}>
        {t.stat1.trim() ? (
          <div style={{ position: 'absolute', left: A.x, top: A.y, width: aW / NEAR_K, height: aH / NEAR_K, borderRadius: 22 * k / NEAR_K, ...glass, background: chipBg }}>
            <div style={{ position: 'absolute', left: 30 * k / NEAR_K, top: 26 * k / NEAR_K, ...type(s1Fs / NEAR_K, 750), lineHeight: 1.15, color: COBALT.mint, whiteSpace: 'nowrap' }}>{t.stat1}</div>
            <div style={{ position: 'absolute', left: 32 * k / NEAR_K, top: 128 * k / NEAR_K, ...type(s1L / NEAR_K, 500), lineHeight: 1.25, color: '#c3cff5', whiteSpace: 'nowrap' }}>{t.stat1L}</div>
          </div>
        ) : null}
        {t.stat2.trim() ? (
          <div style={{ position: 'absolute', left: B.x, top: B.y, width: bW / NEAR_K, height: bH / NEAR_K, borderRadius: 22 * k / NEAR_K, ...glass, background: chipBg }}>
            <svg width={120 * k / NEAR_K} height={120 * k / NEAR_K} viewBox="0 0 120 120" style={{ position: 'absolute', left: 28 * k / NEAR_K, top: 30 * k / NEAR_K }}>
              <circle cx={60} cy={60} r={48} fill="none" stroke="rgba(190,210,255,0.16)" strokeWidth={12} />
              <circle cx={60} cy={60} r={48} fill="none" stroke={COBALT.glow} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(2 * Math.PI * 48 * t.ring).toFixed(1)} 400`} transform="rotate(-90 60 60)" />
            </svg>
            <div style={{ position: 'absolute', left: 172 * k / NEAR_K, top: 34 * k / NEAR_K, ...type(s2Fs / NEAR_K, 750), lineHeight: 1.15, color: '#f2f5ff', whiteSpace: 'nowrap' }}>{t.stat2}</div>
            <div style={{ position: 'absolute', left: 174 * k / NEAR_K, top: 108 * k / NEAR_K, ...type(s2L / NEAR_K, 500), lineHeight: 1.25, color: '#c3cff5', whiteSpace: 'nowrap' }}>{t.stat2L}</div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const PortalWipeV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = H > 1080 * 1.2;
  const title = useText('title', 'Chào buổi sáng, Minh.');
  const subtitle = useText('subtitle', '6 dự án · 2 video xuất hôm nay');
  const items = useList('items', ['Phim ra mắt', 'Video cập nhật', 'Hướng dẫn nhập môn', 'Mẫu quảng cáo', 'Hàng chờ xuất']);
  const targetName = useText('target', 'Dự báo lượt xem');
  const targetMeta = useText('target_meta', 'Phân tích · 9 video');
  const worldKicker = useText('world_kicker', 'Dự án · Phân tích');
  const stat1 = useText('stat1', '+18,4%');
  const stat1L = useText('stat1_label', 'so với lần ra mắt trước');
  const stat2 = useText('stat2', '94%');
  const stat2L = useText('stat2_label', 'độ tin cậy');
  const screen = useImage('screen');
  const pct = /%/.test(stat2) ? parseFloat(stat2.replace(',', '.').replace(/[^0-9.]/g, '')) : NaN;
  const wt: WorldText = { kicker: worldKicker, title: targetName, stat1, stat1L, stat2, stat2L, ring: Number.isFinite(pct) ? Math.max(0.04, Math.min(1, pct / 100)) : 0.94 };

  // ── luoi the ──
  const others = items.slice(0, 5);
  const SPACES: Space[] = ARTS.map((a, i) => {
    if (i === TARGET) return { name: targetName, meta: targetMeta, art: a.art, c: a.c };
    const j = i < TARGET ? i : i - 1;
    return { name: others[j] ?? ['Phim ra mắt', 'Video cập nhật', 'Hướng dẫn nhập môn', 'Mẫu quảng cáo', 'Hàng chờ xuất'][j], meta: a.meta, art: a.art, c: a.c };
  });
  const COLS = portrait ? 2 : 3;
  const TK = portrait ? 1.57 : 1;
  const GAPT = 32 * (portrait ? 1.5 : 1);
  const TILE: TileG = portrait
    ? { w: (1920 - 240 - GAPT) / 2, h: Math.round(((1920 - 240 - GAPT) / 2) * 0.74), cover: Math.round(((1920 - 240 - GAPT) / 2) * 0.47), k: TK }
    : { w: 520, h: 300, cover: 176, k: 1 };
  const GRID_X = (1920 - (COLS * TILE.w + (COLS - 1) * GAPT)) / 2;
  const rows = Math.ceil(6 / COLS);
  const gridH = rows * TILE.h + (rows - 1) * GAPT;
  const subW = portrait ? 0 : Math.min(520, measureText(subtitle, fonts.sans, 36, 500));
  const tW = portrait ? 1920 - 2 * GRID_X : 1920 - 2 * GRID_X - subW - 60;
  const tl = portrait ? wrapLines(title, fonts.sans, 150, tW, 720, 2) : [title];
  const tFs = Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: portrait ? 150 : 96, maxWidth: tW, weight: 720, minSize: portrait ? 80 : 38 })));
  const subFs = fitSize(subtitle, { family: fonts.sans, size: portrait ? 52 : 36, maxWidth: portrait ? tW : 520, weight: 500, minSize: 20 });
  const HEAD_H = portrait ? Math.round(64 * TK + tl.length * tFs * 1.16 + 24 + subFs * 1.3 + 80) : 0;
  const GRID_Y = portrait ? Math.round((H - (HEAD_H + gridH)) / 2 + HEAD_H) : 330;
  const slotOf = (i: number) => ({ x: GRID_X + (i % COLS) * (TILE.w + GAPT), y: GRID_Y + Math.floor(i / COLS) * (TILE.h + GAPT) });
  const headTop = portrait ? GRID_Y - HEAD_H : 104;

  // 预备：目标卡悬浮抬起、邻卡退暗
  const hover = ramp(frame, 14, 12, EASE.snappy);
  const slot = slotOf(TARGET);
  const s0 = 1 + 0.03 * hover;
  const c0 = { x: slot.x - (TILE.w * (s0 - 1)) / 2, y: slot.y - 10 * TK * hover - (TILE.h * (s0 - 1)) / 2, w: TILE.w * s0, h: TILE.h * s0, r: 22 * TK };

  // 窗放大：40f 先慢后快再缓收
  const t = interpolate(frame, [26, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.7, 0, 0.3, 1) });
  const x = mix(c0.x, 0, t), y = mix(c0.y, 0, t), w = mix(c0.w, 1920, t), h = mix(c0.h, H, t), r = mix(c0.r, 0, t);
  // 视差散开：穿窗完成（66f）后 8f 内速度归零（74f）
  const spread = interpolate(frame, [42, 74], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const innerScale = mix(0.42, 1, t);
  const draw = ramp(frame, 34, 32, EASE.swift); // 曲线与穿窗同时画完
  const elev = (4 + 18 * hover) * (1 - t) + 56 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t);
  const oldDim = 0.26 * ramp(frame, 26, 34, EASE.out);
  const neighbours = 1 - 0.18 * hover;

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      {/* 外景：Workspace 主页（穿窗完成后不再渲染） */}
      {t < 1 && (
        <>
          <Stage look={L} keyLight={{ x: 0.35, y: 0.0 }} fill={{ x: 0.9, y: 0.95 }} />
          <div style={{ position: 'absolute', left: GRID_X, top: headTop, height: 52 * TK, display: 'flex', alignItems: 'center', gap: 24 * TK }}>
            <ShotcraftWordmark size={30 * TK} tone="light" color={L.ink} markScale={1.7} gap={14 * TK} />
            <span style={{ width: 1.5 * TK, height: 30 * TK, background: L.line }} />
            <span style={{ ...type(30 * TK, 600), color: L.accent, letterSpacing: '0.18em' }}>KHÔNG GIAN LÀM VIỆC</span>
          </div>
          <div style={{ position: 'absolute', left: GRID_X - 4, top: headTop + 64 * TK }}>
            {tl.map((l, i) => <div key={i} style={{ ...type(tFs, 720), lineHeight: 1.16, color: L.ink, whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
          {portrait ? (
            <div style={{ position: 'absolute', left: GRID_X, top: headTop + 64 * TK + tl.length * tFs * 1.16 + 24, ...type(subFs, 500), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap' }}>{subtitle}</div>
          ) : (
            <div style={{ position: 'absolute', right: GRID_X, top: 168 + tFs * 0.62 - subFs * 0.4, ...type(subFs, 500), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap' }}>{subtitle}</div>
          )}
          {SPACES.map((s, i) => {
            if (i === TARGET) return null;
            const p = slotOf(i);
            return (
              <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: TILE.w, height: TILE.h, opacity: neighbours, borderRadius: 22 * TK, boxShadow: softShadow(6, { color: L.shadow, strength: 0.9 }) }}>
                <Tile s={s} g={TILE} />
              </div>
            );
          })}
          {oldDim > 0.002 && <AbsoluteFill style={{ background: alpha(COBALT.deep, oldDim) }} />}
        </>
      )}

      {/* 窗（放大的卡）——内藏新世界 */}
      <div style={{
        position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: r, overflow: 'hidden',
        boxShadow: t < 1 ? softShadow(elev, { color: L.shadow, strength: 1.6 }) : 'none',
      }}>
        {t > 0 && (
          <div style={{
            position: 'absolute', width: 1920, height: H, left: '50%', top: '50%',
            transform: `translate(-50%, -50%) scale(${innerScale.toFixed(4)})`, overflow: 'hidden',
          }}>
            <World spread={spread} draw={draw} H={H} portrait={portrait} t={wt} src={screen} />
          </div>
        )}
        {/* 卡正面：放大初期渐隐，露出窗内世界 */}
        {t < 0.3 && (
          <div style={{ position: 'absolute', inset: 0, opacity: Math.max(0, 1 - t * 3.6) }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: TILE.w, height: TILE.h, transform: `scale(${(w / TILE.w).toFixed(4)}, ${(h / TILE.h).toFixed(4)})`, transformOrigin: '0 0' }}>
              <Tile s={SPACES[TARGET]} g={TILE} src={screen} />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
