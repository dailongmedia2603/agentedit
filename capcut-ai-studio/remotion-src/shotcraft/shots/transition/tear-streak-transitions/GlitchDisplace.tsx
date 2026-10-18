// glitch-displace｜噪声置换撕裂——整页被切成 16 条不等高横条，各条在 ±70px 内高速左右错位抖动，
// 抖动最猛时硬切到下一页，再抖几帧归位。条带系撕裂：每条内容完整，读作"信号跳变"而不是"页面碎了"。
//
// 第二轮重设计（暗场发布控制台 · "上线那一下"）：
// - look = midnight（深蓝夜 · 电光蓝 · 青绿点缀），等宽技术感版式。A/B 是同一块发布控制台的两态：
//   A「Rolling out Shotcraft」进度卡在 99%、18 个区域格亮了 17 个、日志在滚；
//   B「Shotcraft is live.」18/18 全亮青绿、p95 延迟大数字、三项上线指标。两页网格完全一致，
//   撕裂扫过时读作"系统状态瞬间跳变"——故障语义正好服务"上线切换"。顶栏是 video-shotcraft 的
//   镜刻标志 + 字标（剪影重影里标志随页面一起单色化）；版本号 4.0.0 只是控制台示意值。
// - 撕裂的专业讲究：条带不等高（最窄约最宽 1/3）；按条分"能量"（约两成不动、三成满幅、其余轻颤），
//   位移值过一道指数推向两端；重影改成双色剪影（同一页内容的青绿 / 电光蓝单色副本，±12px 错开、screen 叠加），
//   挂在条带里随条一起错位——比灰阶明暗重影更"信号"；错位条上沿 1px 亮线 = 撕口切边；
//   撕裂期另有 2 根全宽扫描亮线逐帧跳位 + 信号颗粒；切点帧曝光抬升 + 整屏 1.6% 冲击放大掩护硬切。
// - 预备：30–31f 两条细条先轻颤 ±12px（前兆），进度条同时卡在 99%——观众先"感到不对"。
// - 页面底是每页自带的不透明渐变 + 点阵（条带必须不透明才不叠影）；暗角和颗粒只在最上层画一次。
//
// 时间表（30fps，共 135f）：
//   0–40    A 态：进度 86%→99%（ease-out 越走越慢），区域格逐个点亮，日志三行错峰升起；整屏极缓推进
//   30–31   前兆 2f
//   44–60   撕裂 16f：44–47 out-cubic 冲起 → 平台 → 54 硬切 B（藏在满幅抖动里）→ 54–60 线性消散归位
//   60      摘罩：条带 / 重影 / 扫描线全部条件卸载，直出裸 B
//   58–100  余波：区域格一道青绿波从左到右扫过（stagger）、p95 从 58→41ms 计数、三项指标错峰升起
//   100–135 hold 35f：整屏推进收尾，Live 信号点每 40f 一次脉冲
//
// [Agent Edit] Bang dieu khien A/B = "truoc -> sau" cua loi noi: o chu title_a (trang thai truoc: dang lam / dang cho)
// va title_b (trang thai sau: da xong / da len song — TU CUOI to mau xanh ngoc phat sang), kicker_a / kicker_b (dong nho
// tren tieu de), number (con so lon cua trang thai B, tu dem toi gia tri) + label (chu duoi con so). Chu giao dien con lai
// (log, chi so, nhan nut) = tieng Viet trung tinh. Thuong hieu cua video o thanh tren (khong co -> dau hieu trung tinh).
// Tieu de dai ngan bat ky: thu co chu lon nhat de <= 3 dong vua khoi. Khung doc (portrait.mode = 'native'): trang
// xep doc (tieu de to, con so, bieu do rong, 18 o thanh 2 hang x 9, log / chi so) can giua chieu cao that; 16 dai xe
// chia theo chieu cao that (giu ti le khong deu, nang luong, bien do ±70px, bong mau ±12px).
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, Grain, Vignette, ramp } from '../../../fixtures/Polish';
import { LOOKS, alpha, glow, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const GLITCH_DISPLACE_DURATION = 135; // A 44 + 撕裂 16 + 余波/静止 75

const M = LOOKS.midnight;
const W = 1920;
const STRIPS = 16;
const AMP = 70; // 峰值条带错位（一眼可见的撕裂档）
const GHOST = 12; // 双色剪影错位 px
const PRE = [30, 31]; // 前兆帧
const TEAR_IN = 44;
const CUT = 54; // 硬切：满幅抖动中
const TEAR_OUT = 60; // 摘罩
const CELLS = 18;

// 库内标准伪随机
const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};

// 16 条不等高条带：权重 0.45–1.35 归一化到页面高 H，最后一条吃掉余数
const bandsFor = (H: number) => {
  const w = Array.from({ length: STRIPS }, (_, i) => 0.45 + h(i * 13 + 5) * 0.9);
  const sum = w.reduce((a, b) => a + b, 0);
  let top = 0;
  return w.map((wi, i) => {
    const hh = i === STRIPS - 1 ? H - top : Math.round((wi / sum) * H);
    const band = { top, h: hh };
    top += hh;
    return band;
  });
};

// 每条的「能量」：约两成静止、三成满幅、其余轻颤（固定，不随帧变）
const ENERGY = Array.from({ length: STRIPS }, (_, i) => {
  const r = h(i * 7 + 101);
  return r < 0.2 ? 0 : r > 0.68 ? 1 : 0.18 + r * 0.35;
});

// ───────────── 页面（A / B 两态同网格） ─────────────
// tint 给定时只画内容剪影（单色、透明底），用作撕裂重影
type Tone = { bg: boolean; ink: string; ink2: string; ink3: string; accent: string; teal: string; line: string; cell: string };
const toneOf = (tint?: string): Tone =>
  tint
    ? { bg: false, ink: tint, ink2: tint, ink3: tint, accent: tint, teal: tint, line: tint, cell: 'transparent' }
    : { bg: true, ink: M.ink, ink2: M.ink2, ink3: M.ink3, accent: M.accent, teal: M.accent2, line: M.line, cell: M.surface2 };

// giao dien gia (tieng Viet trung tinh)
const LOGS = [
  { mark: '✓', region: 'Máy chủ 01', state: 'ổn định', ms: '38 ms' },
  { mark: '✓', region: 'Máy chủ 02', state: 'ổn định', ms: '44 ms' },
  { mark: '◌', region: 'Máy chủ 03', state: 'đang chuyển lưu lượng…', ms: '' },
];
const STATS = [
  { v: '99,99%', l: 'ổn định' },
  { v: '0', l: 'lỗi phát sinh' },
  { v: '2:14', l: 'phút hoàn tất' },
];

// 曲线数据（0–1，越大越高）
const TRAFFIC = [0.02, 0.03, 0.05, 0.08, 0.14, 0.22, 0.33, 0.45, 0.58, 0.7, 0.8, 0.88, 0.93, 0.96, 0.98];
const LATENCY = [0.92, 0.9, 0.86, 0.88, 0.8, 0.72, 0.66, 0.56, 0.5, 0.42, 0.36, 0.3, 0.27, 0.25, 0.24];
type Box = { x: number; y: number; w: number; h: number };
const linePath = (v: number[], CH: Box) =>
  v.map((y, i) => `${i ? 'L' : 'M'} ${((i / (v.length - 1)) * CH.w).toFixed(1)} ${((1 - y) * CH.h).toFixed(1)}`).join(' ');

const Chart: React.FC<{ live: boolean; f: number; prog: number; T: Tone; CH: Box; k: number }> = ({ live, f, prog, T, CH, k }) => {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const v = live ? LATENCY : TRAFFIC;
  const c = live ? T.teal : T.accent;
  // A 画到进度处；B 切后 24f 从左画满
  const drawn = live ? 0.35 + 0.65 * ramp(f, CUT + 2, 24, EASE.out) : 0.25 + 0.75 * ((prog - 0.86) / 0.13);
  const d = linePath(v, CH);
  const n = v.length - 1;
  const xi = drawn * n;
  const i0 = Math.min(n - 1, Math.floor(xi));
  const yEnd = v[i0] + (v[i0 + 1] - v[i0]) * (xi - i0);
  const ex = drawn * CH.w;
  const ey = (1 - yEnd) * CH.h;
  const m = 20 * k;
  return (
    <svg width={CH.w + 2 * m} height={CH.h + 2 * m} viewBox={`${-m} ${-m} ${CH.w + 2 * m} ${CH.h + 2 * m}`} style={{ position: 'absolute', left: CH.x - m, top: CH.y - m, overflow: 'visible' }}>
      <defs>
        <linearGradient id={`ga${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity={T.bg ? 0.32 : 0} />
          <stop offset="1" stopColor={c} stopOpacity={0} />
        </linearGradient>
        <clipPath id={`gc${id}`}><rect x={-m} y={-m} width={ex + m} height={CH.h + 2 * m} /></clipPath>
      </defs>
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={0} x2={CH.w} y1={g * CH.h} y2={g * CH.h} stroke={T.bg ? alpha(M.ink2, 0.14) : T.line} strokeWidth={1.5 * k} strokeDasharray={`${4 * k} ${8 * k}`} />
      ))}
      <g clipPath={`url(#gc${id})`}>
        <path d={`${d} L ${CH.w} ${CH.h} L 0 ${CH.h} Z`} fill={`url(#ga${id})`} />
        <path d={d} fill="none" stroke={c} strokeWidth={4.5 * k} strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <circle cx={ex} cy={ey} r={9 * k} fill={T.bg ? M.ink : c} stroke={c} strokeWidth={4 * k} />
      {T.bg && <circle cx={ex} cy={ey} r={22 * k} fill={alpha(c, 0.18)} />}
    </svg>
  );
};

// Bo cuc trang (tinh 1 lan trong component chinh, dung chung cho trang that + bong mau)
type Lay = {
  portrait: boolean; H: number; PAD: number; k: number;
  topY: number; kickerY: number; kickerSize: number;
  titleY: number; titleSize: number; titleLH: number; linesA: string[]; linesB: string[];
  numBox: { x: number; y: number; w: number; align: 'left' | 'right' }; numSize: number; numLabelSize: number; numLabelLines: string[];
  chart: Box; cellsY: number; cellH: number; cellRows: number;
  lowerY: number; footY: number;
  kickerA: string; kickerB: string; number: string; label: string;
};

// So lon cua trang thai B: tach "41ms" -> 41 + "ms"; dem tu 0.6 lan len gia tri (giu nhip dem 30f cua goc)
const parseNum = (s: string) => {
  const m = /^([^0-9]*)([0-9]+(?:[.,][0-9]+)?)(.*)$/.exec(s.trim());
  if (!m) return null;
  const raw = m[2];
  const dec = /[.,]\d{1,2}$/.test(raw) && !/^\d{1,3}([.,]\d{3})+$/.test(raw) ? raw.split(/[.,]/)[1].length : 0;
  const n = dec ? parseFloat(raw.replace(',', '.')) : parseInt(raw.replace(/[.,]/g, ''), 10);
  return { pre: m[1], n, dec, sep: raw.includes(',') ? ',' : '.', unit: m[3], grouped: !dec && /[.,]/.test(raw) };
};
const fmtNum = (p: NonNullable<ReturnType<typeof parseNum>>, v: number) => {
  let s = p.dec ? v.toFixed(p.dec).replace('.', p.sep) : String(Math.round(v));
  if (p.grouped) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, p.sep);
  return s;
};

// [Agent Edit] NEN ANH AI: trang phai DAC (cac dai xe ve lai ca trang, trong suot thi lo chu trang goc ben duoi) ->
// trang ve lai chinh anh nen (cung cach ShotStage ve: cover, mo + toi + lop toi) thay cho gradient / quang code;
// dai xe keo ca anh theo -> anh nen cung bi "xe" nhu tin hieu nhay.
const BackdropPlate: React.FC<{ src: string }> = ({ src }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
    <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.06)', filter: 'blur(5px) brightness(0.5) saturate(0.9)' }} />
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,6,10,0.55) 0%, rgba(4,6,10,0.38) 45%, rgba(4,6,10,0.62) 100%)' }} />
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 100%)' }} />
  </div>
);

const Page: React.FC<{ s: 'A' | 'B'; f: number; tint?: string; L: Lay }> = ({ s, f, tint, L }) => {
  const T = toneOf(tint);
  const bd = useBackdrop();
  const live = s === 'B';
  const { PAD, k } = L;
  // A：进度 86 → 99（ease-out 越走越慢，卡在 99）
  const prog = 0.86 + 0.13 * ramp(f, 0, 40, EASE.out);
  const lit = live ? CELLS : Math.min(CELLS - 1, Math.floor(prog * CELLS + 0.4));
  // B：大数字计数（从 0.6 倍升到目标值；原版 58→41 同一条 30f ease-out）
  const pn = parseNum(L.number);
  const cnt = ramp(f, CUT + 4, 30, EASE.out);
  const ping = live ? ((f - CUT) % 40) / 40 : 0;
  const markC = live ? T.teal : T.accent;
  const lines = live ? L.linesB : L.linesA;
  const numSmall = Math.round(L.numSize * 0.43);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', textShadow: bd && T.bg ? '0 2px 18px rgba(0,0,0,0.55)' : undefined }}>
      {T.bg && bd && <BackdropPlate src={bd.src} />}
      {T.bg && !bd && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${M.bg[0]} 0%, ${M.bg[1]} 55%, ${M.bg[2]} 100%)` }} />
          {/* 主光：A 冷灰蓝、B 电光蓝通电 */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse 62% ${L.portrait ? 40 : 70}% at 22% 18%, ${alpha(live ? M.light : '#3a4a72', live ? 0.42 : 0.3)} 0%, ${alpha(M.light, 0)} 70%), ` +
              `radial-gradient(ellipse 60% ${L.portrait ? 20 : 34}% at 70% 104%, ${alpha(live ? M.accent2 : '#2a3a60', live ? 0.2 : 0.14)} 0%, rgba(0,0,0,0) 72%)`,
          }} />
          {/* [Agent Edit] luoi cham trang tri (点阵) da bo */}
        </>
      )}

      {/* 顶栏 */}
      <div style={{ position: 'absolute', left: PAD, top: L.topY, display: 'flex', alignItems: 'center', gap: 20 * k, height: 58 * k }}>
        {/* 品牌标志：正片用暗底反白版；剪影重影（tint）里随页面一起画成单色 */}
        <ShotcraftMark size={48 * k} tone="dark" frameColor={tint} cutColor={tint} />
        {BRAND.name ? <span style={{ fontFamily: BRAND.font, fontSize: 38 * k, fontWeight: 700, letterSpacing: '0.03em', color: T.ink, whiteSpace: 'nowrap', maxWidth: L.portrait ? 760 : 560, overflow: 'hidden', textOverflow: 'ellipsis' }}>{BRAND.name}</span> : null}
        {BRAND.name ? <span style={{ ...type(34 * k, 450), color: T.ink3 }}>/</span> : null}
        <span style={{ ...type(34 * k, 500), color: T.ink2, whiteSpace: 'nowrap' }}>Phát hành</span>
      </div>
      <div style={{
        position: 'absolute', right: PAD, top: L.topY - 6 * k, height: 58 * k, padding: `0 ${26 * k}px`, borderRadius: 29 * k, display: 'flex', alignItems: 'center',
        border: `${1.5 * k}px solid ${T.bg ? alpha(markC, 0.45) : T.line}`, background: T.bg ? alpha(markC, 0.1) : 'transparent',
        fontFamily: FONT.sans, fontSize: 28 * k, fontWeight: 700, letterSpacing: '0.06em', color: markC, gap: 18 * k, whiteSpace: 'nowrap',
      }}>
        <span style={{ position: 'relative', width: 14 * k, height: 14 * k }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: 7 * k, background: markC }} />
          {live && T.bg && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 7 * k, border: `${2 * k}px solid ${markC}`,
              transform: `scale(${1 + ping * 1.5})`, opacity: (1 - ping) * 0.8,
            }} />
          )}
        </span>
        {live ? 'ĐANG CHẠY' : 'ĐANG TRIỂN KHAI'}
      </div>

      {/* 眉题 + 主标题 */}
      {(live ? L.kickerB : L.kickerA) ? (
        <div style={{ position: 'absolute', left: PAD, top: L.kickerY, fontFamily: FONT.sans, fontSize: L.kickerSize, fontWeight: 650, letterSpacing: '0.08em', color: markC, whiteSpace: 'nowrap' }}>
          {live ? L.kickerB : L.kickerA}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: PAD - 6, top: L.titleY, ...type(L.titleSize, 720), lineHeight: `${L.titleLH}px`, color: T.ink, whiteSpace: 'nowrap' }}>
        {lines.map((ln, i) => {
          const last = i === lines.length - 1;
          if (!live) return <div key={i} style={{ color: i > 0 ? T.ink2 : T.ink }}>{ln}</div>;
          if (!last) return <div key={i}>{ln}</div>;
          const sp = ln.lastIndexOf(' ');
          return (
            <div key={i}>
              {sp > 0 ? ln.slice(0, sp + 1) : ''}
              <span style={{ color: T.teal, textShadow: T.bg ? glow(M.accent2, 0.5) : undefined }}>{sp > 0 ? ln.slice(sp + 1) : ln}</span>
            </div>
          );
        })}
      </div>

      {/* 中区曲线：A 流量切换爬升（随进度画出）/ B 回落；填满标题与大数字之间的空当 */}
      <Chart live={live} f={f} prog={prog} T={T} CH={L.chart} k={k} />

      {/* 大数字：A 进度 / B 讲话里的数字 */}
      <div style={{ position: 'absolute', left: L.numBox.x, top: L.numBox.y, width: L.numBox.w, textAlign: L.numBox.align }}>
        <div style={{ fontFamily: FONT.mono, fontSize: L.numSize, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1.1, color: T.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {live ? (
            pn ? (
              <>{pn.pre}{fmtNum(pn, pn.n * (0.6 + 0.4 * cnt))}<span style={{ fontSize: numSmall, color: T.ink2, letterSpacing: '-0.02em' }}>{pn.unit}</span></>
            ) : (
              L.number
            )
          ) : (
            <>{Math.floor(prog * 100)}<span style={{ fontSize: numSmall, color: T.ink2 }}>%</span></>
          )}
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: L.numLabelSize, fontWeight: 500, lineHeight: 1.3, color: T.ink2, marginTop: 10 * k }}>
          {live ? L.numLabelLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>) : 'đã hoàn tất'}
        </div>
      </div>

      {/* 18 区域格（竖屏 2 行 × 9） */}
      <div style={{ position: 'absolute', left: PAD, right: PAD, top: L.cellsY, display: 'grid', gridTemplateColumns: `repeat(${CELLS / L.cellRows}, 1fr)`, gap: 12 * k }}>
        {Array.from({ length: CELLS }, (_, i) => {
          const on = i < lit;
          const waiting = !live && i === lit;
          // B：一道青绿波从左扫到右
          const wave = live ? ramp(f, CUT + 6 + i * 1.3, 6, EASE.out) * (1 - ramp(f, CUT + 12 + i * 1.3, 16, EASE.out)) : 0;
          const c = live ? T.teal : T.accent;
          const blink = waiting ? 0.35 + 0.35 * Math.sin(f / 3.2) : 0;
          return (
            <div key={i} style={{
              height: L.cellH, borderRadius: 12 * k, boxSizing: 'border-box',
              background: T.bg ? (on ? `linear-gradient(180deg, ${alpha(c, 0.95)} 0%, ${alpha(c, 0.72)} 100%)` : T.cell) : on ? c : 'transparent',
              border: on ? 'none' : `${1.5 * k}px solid ${T.bg ? alpha(M.accent, 0.18 + blink) : T.line}`,
              boxShadow: T.bg && on ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 ${18 + wave * 40}px ${alpha(c, 0.25 + wave * 0.5)}` : undefined,
              filter: wave > 0.01 ? `brightness(${1 + wave * 0.6})` : undefined,
            }} />
          );
        })}
      </div>

      {/* 下部：A 日志 / B 三项指标 */}
      {!live ? (
        <div style={{ position: 'absolute', left: PAD, right: PAD, top: L.lowerY }}>
          {LOGS.map((l, i) => {
            const kk = ramp(f, 4 + i * 9, 14, EASE.snappy);
            return (
              <div key={i} style={{
                display: 'flex', gap: 28 * k, height: 52 * k, alignItems: 'center', fontFamily: FONT.sans, fontSize: 32 * k, fontWeight: 500,
                color: T.ink2, opacity: kk, transform: `translateY(${(1 - kk) * 18 * k}px)`, whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 30 * k, color: l.mark === '✓' ? T.accent : T.ink3 }}>{l.mark}</span>
                <span style={{ width: 300 * k, color: T.ink }}>{l.region}</span>
                <span style={{ flex: 1, color: l.ms ? T.ink2 : T.ink3 }}>{l.state}</span>
                <span style={{ fontFamily: FONT.mono, color: T.ink3 }}>{l.ms}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ position: 'absolute', left: PAD, right: PAD, top: L.lowerY + (L.portrait ? 0 : 18), display: 'flex', gap: 48 * (L.portrait ? 0.8 : 1) }}>
          {STATS.map((st, i) => {
            const kk = ramp(f, CUT + 10 + i * 5, 20, EASE.snappy);
            return (
              <div key={i} style={{ flex: 1, borderTop: `${2 * k}px solid ${T.bg ? alpha(M.accent2, 0.5) : T.line}`, paddingTop: 22 * k, opacity: kk, transform: `translateY(${(1 - kk) * 26 * k}px)` }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 72 * k, fontWeight: 600, letterSpacing: '-0.04em', color: T.ink, lineHeight: 1 }}>{st.v}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 32 * k, fontWeight: 500, lineHeight: 1.3, color: T.ink2, marginTop: 12 * k }}>{st.l}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 页脚：纹理小字 */}
      <div style={{
        position: 'absolute', left: PAD, right: PAD, top: L.footY, display: 'flex', justifyContent: 'space-between',
        fontFamily: FONT.mono, fontSize: 22 * k, letterSpacing: '0.08em', color: T.ink3, opacity: 0.8,
      }}>
        <span>v4.0.0 · SHA 9F3C2E1</span>
        <span style={{ fontFamily: FONT.sans }}>{live ? 'HOÀN TẤT 18/18' : 'THỬ NGHIỆM → TOÀN BỘ'}</span>
      </div>
    </div>
  );
};

// 标题：在 maxW × maxH 内找最大字号（≤ 3 行）
const fitBlock = (text: string, family: string, size0: number, minSize: number, maxW: number, maxH: number, lh: number) => {
  for (let size = size0; size >= minSize; size -= 4) {
    const lines = wrapLines(text, family, size, maxW, 720, 3);
    const wide = Math.max(...lines.map((l) => measureText(l, family, size, 720)));
    if (wide <= maxW && lines.length * size * lh <= maxH) return { size, lines };
  }
  const lines = wrapLines(text, family, minSize, maxW, 720, 3);
  const size = Math.min(...lines.map((l) => fitSize(l, { family, size: minSize, maxWidth: maxW, weight: 720, minSize: minSize * 0.6 })));
  return { size, lines };
};

export const GlitchDisplace: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const bd = useBackdrop();
  const titleA = useText('title_a', 'Đang chuẩn bị ra mắt');
  const titleB = useText('title_b', 'Chính thức lên sóng.');
  const kickerA = useText('kicker_a', 'PHIÊN BẢN 4.0 · ĐANG CẬP NHẬT');
  const kickerB = useText('kicker_b', 'PHIÊN BẢN 4.0 · ĐÃ XONG 18/18');
  const number = useText('number', '41ms');
  const label = useText('label', 'phản hồi trung bình');
  const portrait = SH > 1080 * 1.2;
  const H = portrait ? SH : 1080;

  // ── bo cuc ──
  const LH = 1.12; // dau tieng Viet chong tang
  let L: Lay;
  if (!portrait) {
    const PAD = 120;
    const k = 1;
    const kickerSize = fitSize([kickerA, kickerB].reduce((a, b) => (a.length > b.length ? a : b)), { family: fonts.sans, size: 30, maxWidth: 1180, weight: 650, minSize: 20, letterSpacingEm: 0.08 });
    // tieu de: cot trai 120..790 (bieu do bat dau o 820), cao 298..600
    const tA = fitBlock(titleA, fonts.sans, 132, 64, 660, 310, LH);
    const tB = fitBlock(titleB, fonts.sans, 132, 64, 660, 310, LH);
    const titleSize = Math.min(tA.size, tB.size);
    const linesA = titleSize === tA.size ? tA.lines : wrapLines(titleA, fonts.sans, titleSize, 660, 720, 3);
    const linesB = titleSize === tB.size ? tB.lines : wrapLines(titleB, fonts.sans, titleSize, 660, 720, 3);
    const nl = Math.max(linesA.length, linesB.length);
    const numW = 1920 - PAD - 1420;
    const numSize = Math.min(196, fitSize(number, { family: fonts.mono, size: 196, maxWidth: numW, weight: 600, minSize: 70 }));
    const numLabelLines = wrapLines(label, fonts.sans, 34, numW, 500, 2);
    const numLabelSize = Math.min(...numLabelLines.map((l) => fitSize(l, { family: fonts.sans, size: 34, maxWidth: numW, weight: 500, minSize: 22 })));
    L = {
      portrait, H, PAD, k, topY: 76, kickerY: 248, kickerSize,
      titleY: 298 + Math.max(0, (310 - nl * titleSize * LH) / 2) * 0.3, titleSize, titleLH: Math.round(titleSize * LH), linesA, linesB,
      numBox: { x: 1420, y: 300, w: numW, align: 'right' }, numSize, numLabelSize, numLabelLines,
      chart: { x: 820, y: 318, w: 560, h: 220 }, cellsY: 628, cellH: 84, cellRows: 1, lowerY: 772, footY: 1080 - 64 - 26,
      kickerA, kickerB, number, label,
    };
  } else {
    const PAD = 120;
    const k = 1.75; // giao dien to hon cho dien thoai
    const IW = 1920 - PAD * 2;
    const kickerSize = fitSize([kickerA, kickerB].reduce((a, b) => (a.length > b.length ? a : b)), { family: fonts.sans, size: 52, maxWidth: IW, weight: 650, minSize: 30, letterSpacingEm: 0.08 });
    const tA = fitBlock(titleA, fonts.sans, 230, 110, IW, 230 * LH * 3, LH);
    const tB = fitBlock(titleB, fonts.sans, 230, 110, IW, 230 * LH * 3, LH);
    const titleSize = Math.min(tA.size, tB.size);
    const linesA = titleSize === tA.size ? tA.lines : wrapLines(titleA, fonts.sans, titleSize, IW, 720, 3);
    const linesB = titleSize === tB.size ? tB.lines : wrapLines(titleB, fonts.sans, titleSize, IW, 720, 3);
    const nl = Math.max(linesA.length, linesB.length);
    const titleLH = Math.round(titleSize * LH);
    const numSize = Math.min(300, fitSize(number, { family: fonts.mono, size: 300, maxWidth: IW, weight: 600, minSize: 120 }));
    const numLabelLines = wrapLines(label, fonts.sans, 64, IW, 500, 2);
    const numLabelSize = Math.min(...numLabelLines.map((l) => fitSize(l, { family: fonts.sans, size: 64, maxWidth: IW, weight: 500, minSize: 40 })));
    const chartH = 380;
    const cellH = 130;
    // tong chieu cao khoi noi dung (tu kicker toi het log/chi so)
    const hKick = kickerSize * 1.4 + 40;
    const hTitle = nl * titleLH;
    const hNum = numSize * 1.1 + 10 * k + numLabelLines.length * numLabelSize * 1.3;
    const lowerH = 3 * 52 * k + 40;
    const gaps = [90, 110, 110, 100];
    const blockH = hKick + hTitle + gaps[0] + hNum + gaps[1] + chartH + gaps[2] + (cellH * 2 + 12 * k) + gaps[3] + lowerH;
    const topY = 200;
    const footY = SH - 190;
    const y0 = Math.max(topY + 160, Math.round((SH - blockH) / 2));
    const kickerY = y0;
    const titleY = kickerY + hKick;
    const numY = titleY + hTitle + gaps[0];
    const chartY = numY + hNum + gaps[1];
    const cellsY = chartY + chartH + gaps[2];
    const lowerY = cellsY + cellH * 2 + 12 * k + gaps[3];
    L = {
      portrait, H, PAD, k, topY, kickerY, kickerSize,
      titleY, titleSize, titleLH, linesA, linesB,
      numBox: { x: PAD, y: numY, w: IW, align: 'left' }, numSize, numLabelSize, numLabelLines,
      chart: { x: PAD, y: chartY, w: IW, h: chartH }, cellsY, cellH, cellRows: 2, lowerY, footY,
      kickerA, kickerB, number, label,
    };
  }
  const BANDS = bandsFor(H);

  const s: 'A' | 'B' = frame >= CUT ? 'B' : 'A';
  const precursor = PRE.includes(frame);
  const tearing = frame >= TEAR_IN && frame < TEAR_OUT;

  // 整屏极缓推进 1 → 1.018（对称 in-out，起止无速度突变）+ 切点冲击放大 1.6%（5f 收回）
  const push = 1 + 0.018 * ramp(frame, 0, 135, EASE.smooth);
  const kick = frame >= CUT ? 0.016 * (1 - ramp(frame, CUT, 6, EASE.out)) : 0.006 * ramp(frame, TEAR_IN, CUT - TEAR_IN, EASE.exit);
  const zoom = push + kick;

  // 幅度包络：44–47 out-cubic 冲起 → 平台 → 54–60 线性消散
  const rise = ramp(frame, TEAR_IN, 3, (t) => 1 - Math.pow(1 - t, 3));
  const decay = 1 - ramp(frame, CUT, TEAR_OUT - CUT, EASE.linear);
  const env = tearing ? Math.min(rise, decay) : 0;
  const exposure = frame === CUT ? 1.28 : frame === CUT + 1 ? 1.12 : 1;

  const strips = BANDS.map((b, i) => {
    let dx = 0;
    if (precursor) {
      dx = i === 5 || i === 12 ? (h(i * 31 + frame * 7) > 0.5 ? 12 : -12) : 0;
    } else if (tearing) {
      const r = h(i * 31 + frame * 7) * 2 - 1;
      dx = Math.sign(r) * Math.pow(Math.abs(r), 0.6) * AMP * ENERGY[i] * env;
    }
    return { ...b, dx, ghost: tearing ? Math.min(1, Math.abs(dx) / 36) * env : 0 };
  });
  const active = precursor || tearing;

  // 扫描亮线：撕裂期每帧 2 根随机高度的全宽细线
  const scans = tearing
    ? [0, 1].map((k) => ({ y: Math.floor(h(frame * 13 + k * 71) * H), a: (0.25 + 0.55 * h(frame * 5 + k)) * env, w: 1 + Math.floor(h(frame + k * 9) * 3) }))
    : [];

  return (
    <AbsoluteFill style={{ background: bd ? '#000' : M.bg[2], overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, transform: `scale(${zoom.toFixed(5)})`,
        filter: exposure > 1 ? `brightness(${exposure})` : undefined,
      }}>
        {/* 底：完整页（静止条直接露出它；摘罩后只剩它） */}
        <Page s={s} f={frame} L={L} />

        {active &&
          strips.map((st, i) =>
            Math.abs(st.dx) < 0.5 ? null : (
              <div key={i} style={{ position: 'absolute', top: st.top, left: 0, width: W, height: st.h, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: -st.top, width: W, height: H, transform: `translateX(${st.dx.toFixed(1)}px)` }}>
                  <Page s={s} f={frame} L={L} />
                  {st.ghost > 0.04 && (
                    <>
                      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${GHOST}px)`, opacity: 0.55 * st.ghost, mixBlendMode: 'screen' }}>
                        <Page s={s} f={frame} tint={M.accent2} L={L} />
                      </div>
                      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-GHOST}px)`, opacity: 0.6 * st.ghost, mixBlendMode: 'screen' }}>
                        <Page s={s} f={frame} tint={M.accent} L={L} />
                      </div>
                    </>
                  )}
                </div>
                {/* 撕口切边：上沿亮线、下沿暗线 */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, background: alpha('#dfe8ff', 0.5), opacity: Math.max(0, Math.min(1, (Math.abs(st.dx) - 25) / 30)) }} />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'linear-gradient(180deg, rgba(0,2,10,0) 0%, rgba(0,2,10,0.75) 100%)', opacity: Math.min(1, Math.abs(st.dx) / 30) }} />
              </div>
            ),
          )}

        {scans.map((sc, k) => (
          <div key={k} style={{
            position: 'absolute', left: 0, right: 0, top: sc.y, height: sc.w,
            background: `linear-gradient(90deg, ${alpha(M.accent2, 0)} 0%, ${alpha(M.accent2, sc.a)} 30%, ${alpha('#ffffff', sc.a)} 60%, ${alpha(M.accent, 0)} 100%)`,
            boxShadow: `0 0 12px ${alpha(M.accent2, sc.a * 0.6)}`,
          }} />
        ))}
      </div>

      <Vignette strength={0.5} color={M.shadow} inner={0.45} />
      <Grain opacity={0.08 + 0.14 * env} step={tearing ? 1 : 2} blend="soft-light" />
    </AbsoluteFill>
  );
};
