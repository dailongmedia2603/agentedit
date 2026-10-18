// scanline-annotate-focus — 扫描分析取景标注：一条扫描线自上而下匀速掠过一张已存在的品牌官网，
// 扫过哪个区块的下缘，哪块就被一组取景角标"收拢对准"，随后贴一枚机器标签把它命名；顶部状态行实时计数。
//
// 第二轮重设计（暖沙官网 × 钴蓝机器视线）：
// - look = sand（米色 · 赤陶）。被分析的是 video-shotcraft 的官网：镜刻标志 + 字标、大号粗黑体 H1「Your product, in motion.」、
//   一支样片（陶器品牌 Tide Vase 的发布片封面，手绘感陶瓶）、赤陶色 CTA、四色色板——页面本身就是一张好看的品牌页。
// - 两套颜色严格分工：赤陶 = 品牌（页面内容），钴蓝 = 机器（扫描线 / 角标 / 标签 / 状态行）。
//   标签照设计工具的选中标签惯例做成钴蓝底白字小签，32px 等宽字，任何底上都读得清。
// - 页面放进一扇有两层软阴影的浏览器窗（1560×840），状态行在窗外上方；全程 1.000→1.035 极缓推镜。
// - 扫描线严格匀速（机器的视线，不加缓动）：3px 钴蓝光芯 + 身后 140px 渐隐的"已读"淡蓝余晖与点阵；
//   窗框两侧各一枚随线滑动的游标，左侧读出当前 Y 坐标。
// - 取景框：四个 L 角从外扩 76px 处按弹簧（damping 15，一次可见过冲）收拢到 bbox，臂长晚 3f 收一档（跟随）；
//   对准瞬间框内钴蓝对焦闪；标签 5f 后从左擦出、文字逐字打出（机器在写）。
//
// 时间表（30fps，共 150f）：
//   0–6     页面已在场（它本来就存在），状态行亮起 READING
//   6–80    扫描线匀速 −20→860（74f）；越过 bbox 下缘即触发（≥4f 最小间隔）：
//           LOGO ~19f · NAV ~23f · H1 ~47f · CTA ~66f · HERO ~70f · PALETTE ~75f
//   ft+0–14 角标弹簧收拢；ft+5–14 标签擦出 + 打字
//   80–88   扫描线淡出；状态行切 BRAND READ · 6 SIGNALS（钴蓝）
//   88–150  hold：全部标注就位，极缓推镜让画面活着，尾帧是一张完整海报
//
// [Agent Edit] Trang web gia (giu nguyen hinh ve giao dien) nhan noi dung that:
// o chu name (ten trang / thuong hieu; bo trong -> ten thuong hieu cua video -> mau) / title (H1, tu cuoi to mau nhan) /
// subtitle (doan mo ta) / cta (nut) / caption (nhan tren anh chinh) / reading + done (dong trang thai may).
// o anh photo (tuy chon, ti le bat ky, cover): anh chinh cua trang (khong co -> binh gom ve san).
// Toa do cac khoi (bbox) TINH TU chu that (measureText) -> thoi diem quet trung + nhan may tu theo; nhan may do be ngang that.
// Khung doc (portrait.mode = 'native'): trang chuyen thanh bo cuc DOC kieu mobile (cac khoi xep doc, chu to hon), cua so
// cao theo noi dung, can giua khung; khung ngang giu bo cuc goc.
import { useCurrentFrame, useBrand, useImage, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const SCANLINE_ANNOTATE_FOCUS_DURATION = 150;

const L = LOOKS.sand;
const MACHINE = '#2b4fd8'; // 机器色（钴蓝）：扫描线 / 角标 / 标签 / 状态行专用，页面内容不用
const TERRA = L.accent; // 品牌色（赤陶）：只在页面内容里出现

// 扫描线：严格匀速（页面坐标，窗内 y：Y0 → WH+20）
const SCAN0 = 6;
const SCAN1 = 80;
const Y0 = -20;

// ───────────── 分析目标（页面坐标；tag = 标签相对 bbox 的放置） ─────────────
type Tag = 'right' | 'above' | 'below' | 'belowRight' | 'aboveRight';
type Target = { key: string; x: number; y: number; w: number; h: number; head: string; detail: string; tag: Tag; ft: number };

// ───────────── 页面内容（产品图位：陶瓶插画 / 真实图片） ─────────────
const Vase: React.FC = () => (
  <svg width={620} height={580} viewBox="0 0 620 580" style={{ position: 'absolute', left: 0, top: 0 }}>
    <defs>
      <linearGradient id="haf-vase" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#7d3418" />
        <stop offset="0.3" stopColor="#c45a31" />
        <stop offset="0.46" stopColor="#e9925f" />
        <stop offset="0.62" stopColor="#c2552c" />
        <stop offset="1" stopColor="#6e2c13" />
      </linearGradient>
      <linearGradient id="haf-bowl" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#a99a83" />
        <stop offset="0.4" stopColor="#f3ece1" />
        <stop offset="0.7" stopColor="#ddd1bf" />
        <stop offset="1" stopColor="#8f8069" />
      </linearGradient>
      <radialGradient id="haf-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#5a3a1c" stopOpacity="0.38" />
        <stop offset="1" stopColor="#5a3a1c" stopOpacity="0" />
      </radialGradient>
      <clipPath id="haf-clip"><path d="M228 118 C226 150 214 168 196 196 C150 262 142 336 168 398 C186 444 214 466 268 468 C322 466 350 444 368 398 C394 336 386 262 340 196 C322 168 310 150 308 118 Z" /></clipPath>
      <linearGradient id="haf-glaze" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
        <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    {/* 接触影 */}
    <ellipse cx={268} cy={470} rx={150} ry={22} fill="url(#haf-shadow)" />
    <ellipse cx={452} cy={478} rx={98} ry={15} fill="url(#haf-shadow)" />
    {/* 陶瓶：窄口 · 鼓腹 · 收足 */}
    <path
      d="M228 118 C226 150 214 168 196 196 C150 262 142 336 168 398 C186 444 214 466 268 468 C322 466 350 444 368 398 C394 336 386 262 340 196 C322 168 310 150 308 118 Z"
      fill="url(#haf-vase)"
    />
    <path
      d="M228 118 C226 150 214 168 196 196 C150 262 142 336 168 398 C186 444 214 466 268 468 C322 466 350 444 368 398 C394 336 386 262 340 196 C322 168 310 150 308 118 Z"
      fill="url(#haf-glaze)"
    />
    <ellipse cx={268} cy={118} rx={40} ry={9} fill="#5e260f" />
    <ellipse cx={268} cy={116} rx={40} ry={8} fill="none" stroke="#e7a073" strokeWidth={2} opacity={0.7} />
    {/* 拉坯留下的轮纹：几道极淡的横向弧线，手作感 */}
    <g clipPath="url(#haf-clip)">
      {[176, 222, 270, 320, 370, 420].map((y, i) => (
        <path key={i} d={`M60 ${y} Q268 ${y + 14} 476 ${y}`} fill="none" stroke="#3e1608" strokeWidth={1.6} opacity={0.09} />
      ))}
    </g>
    {/* 釉面流挂的一道亮痕 */}
    <path d="M232 210 C214 262 206 330 222 400" fill="none" stroke="#ffd2b0" strokeWidth={6} strokeLinecap="round" opacity={0.28} />
    {/* 骨白小碗 */}
    <path d="M362 402 C366 452 404 478 452 478 C500 478 538 452 542 402 Z" fill="url(#haf-bowl)" />
    <ellipse cx={452} cy={402} rx={90} ry={14} fill="#efe6d8" />
    <ellipse cx={452} cy={404} rx={78} ry={9} fill="#cdbfa9" />
  </svg>
);

// 版式：landscape = 原版网页（1560×840）；portrait = 竖排移动版（宽 1600，高随内容）
type Layout = {
  portrait: boolean; WW: number; WH: number; chrome: number;
  logo: { x: number; y: number; mark: number; fs: number };
  nav: { right: number; y: number; fs: number; gap: number };
  h1: { x: number; y: number; fs: number; lines: string[] };
  body: { x: number; y: number; fs: number; lines: string[] };
  cta: { x: number; y: number; h: number; fs: number; w: number };
  hero: { x: number; y: number; w: number; h: number };
  pal: { x: number; y: number; d: number };
  tagFs: number; tagH: number; pad: number;
};

const Page: React.FC<{ g: Layout; name: string; nav: string[]; cta: string; caption: string; photo?: string }> = ({ g, name, nav, cta, caption, photo }) => {
  const last = g.h1.lines.length - 1;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f8f2e9', fontFamily: FONT.sans, color: L.ink }}>
      {/* 浏览器顶栏 */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: g.WW, height: g.chrome, background: '#efe7db', borderBottom: `1px solid ${L.line}` }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: 'absolute', left: 24 + i * 22 * (g.chrome / 52), top: g.chrome / 2 - 6 * (g.chrome / 52), width: 12 * (g.chrome / 52), height: 12 * (g.chrome / 52), borderRadius: 8, background: alpha(L.ink, 0.16) }} />
        ))}
        <div style={{ position: 'absolute', left: g.WW / 2 - 260, top: g.chrome * 0.21, width: 520, height: g.chrome * 0.58, borderRadius: 8, background: alpha('#ffffff', 0.7), border: `1px solid ${L.line}` }} />
      </div>
      {/* logo：标志 + 名称 */}
      <div style={{ position: 'absolute', left: g.logo.x + 9, top: g.logo.y + 6, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShotcraftMark size={g.logo.mark} tone="light" />
        <div style={{ font: `700 ${g.logo.fs}px ${BRAND.font}`, letterSpacing: '0.01em', color: BRAND.ink, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{name}</div>
      </div>
      {/* 导航（portrait = 汉堡菜单） */}
      <div style={{ position: 'absolute', right: g.nav.right, top: g.nav.y, display: 'flex', alignItems: 'center', gap: g.nav.gap, font: `550 ${g.nav.fs}px ${FONT.sans}`, color: L.ink2, letterSpacing: '-0.01em', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
        {g.portrait ? (
          <>
            <span>{nav[nav.length - 1]}</span>
            <svg width={g.nav.fs * 1.1} height={g.nav.fs * 1.1} viewBox="0 0 24 24" fill="none" stroke={L.ink} strokeWidth={2.2} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </>
        ) : (
          nav.map((n, i) => <span key={i} style={i === nav.length - 1 ? { color: L.ink } : undefined}>{n}</span>)
        )}
      </div>
      {/* H1：末词赤陶色 */}
      <div style={{ position: 'absolute', left: g.h1.x + 12, top: g.h1.y + 14, font: `850 ${g.h1.fs}px ${FONT.sans}`, letterSpacing: '-0.04em', lineHeight: 1.08, whiteSpace: 'nowrap' }}>
        {g.h1.lines.map((l, i) => {
          if (i !== last) return <div key={i}>{l}</div>;
          const k = l.lastIndexOf(' ');
          return <div key={i}>{k > 0 ? l.slice(0, k + 1) : ''}<span style={{ color: TERRA }}>{k > 0 ? l.slice(k + 1) : l}</span></div>;
        })}
      </div>
      {/* 正文 */}
      <div style={{ position: 'absolute', left: g.body.x, top: g.body.y, font: `450 ${g.body.fs}px ${FONT.sans}`, lineHeight: 1.36, color: L.ink2, letterSpacing: '-0.012em', whiteSpace: 'nowrap' }}>
        {g.body.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      {/* CTA */}
      <div style={{ position: 'absolute', left: g.cta.x + 16, top: g.cta.y + 12, height: g.cta.h - 24, padding: `0 ${g.cta.fs * 1.13}px`, borderRadius: 60, background: TERRA, color: L.onAccent, display: 'flex', alignItems: 'center', gap: 14, font: `650 ${g.cta.fs}px ${FONT.sans}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap', boxShadow: `0 10px 24px -10px ${alpha('#7a2a10', 0.55)}, inset 0 1px 0 rgba(255,255,255,0.25)` }}>
        {cta} <span style={{ fontWeight: 500 }}>→</span>
      </div>
      {/* 釉色板 */}
      <div style={{ position: 'absolute', left: g.pal.x + 16, top: g.pal.y + 12, display: 'flex', alignItems: 'center', gap: g.pal.d * 0.28 }}>
        {['#ebe5da', '#5d6c4f', TERRA, '#d6c3a5'].map((c, i) => (
          <div key={i} style={{ width: g.pal.d, height: g.pal.d, borderRadius: g.pal.d / 2, background: `radial-gradient(circle at 35% 30%, ${alpha('#ffffff', 0.45)}, ${alpha('#ffffff', 0)} 55%), ${c}`, boxShadow: `inset 0 0 0 1px ${alpha(L.ink, 0.12)}` }} />
        ))}
      </div>
      {/* 产品图卡 */}
      <div style={{ position: 'absolute', left: g.hero.x + 8, top: g.hero.y + 8, width: g.hero.w - 16, height: g.hero.h - 16, borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(180deg, #ecdcc7 0%, #e2cbae 62%, #d4b896 62.2%, #cdb08c 100%)' }}>
        {photo ? (
          <Img src={photo} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 55% at 70% 18%, rgba(255,248,236,0.75) 0%, rgba(255,248,236,0) 70%)' }} />
            <div style={{ position: 'absolute', left: (g.hero.w - 16) / 2 - 302 - 8 + 40, top: (g.hero.h - 16) / 2 - 258 - 24, transform: g.portrait ? 'scale(1.45)' : undefined, transformOrigin: '302px 290px' }}>
              <Vase />
            </div>
          </>
        )}
        {caption ? (
          <div style={{ position: 'absolute', left: 28 * (g.portrait ? 1.4 : 1), bottom: 26 * (g.portrait ? 1.4 : 1), padding: g.portrait ? '14px 24px' : '10px 18px', borderRadius: 14, background: alpha('#fbf6ef', 0.86), font: `600 ${g.portrait ? 34 : 24}px ${FONT.sans}`, color: L.ink, letterSpacing: '-0.01em', lineHeight: 1.3, whiteSpace: 'nowrap', maxWidth: g.hero.w - 120, overflow: 'hidden' }}>
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ───────────── 取景框 + 标签 ─────────────
const Bracket: React.FC<{ t: Target; frame: number; PAD: number; WW: number; WH: number; sw: number }> = ({ t, frame, PAD, WW, WH, sw }) => {
  const f = frame - t.ft;
  if (f < 0) return null;
  const s = springAt(frame, t.ft, { damping: 15, stiffness: 210 }); // 0→1（过冲 ~1.06）
  const pad = PAD * (1 - s); // 外扩 76px → 0（过冲时略收进 bbox）
  const op = Math.min(1, f / 3);
  const arm = (40 - 14 * ramp(frame, t.ft + 3, 12, EASE.out)) * (sw / 3.5); // 臂长晚一拍收一档
  const flash = ramp(frame, t.ft + 3, 3, EASE.out) * (1 - ramp(frame, t.ft + 6, 12, EASE.out));
  const x = t.x - pad;
  const y = t.y - pad;
  const w = t.w + pad * 2;
  const h = t.h + pad * 2;
  const d = [
    `M${x} ${y + arm}V${y}H${x + arm}`,
    `M${x + w - arm} ${y}H${x + w}V${y + arm}`,
    `M${x + w} ${y + h - arm}V${y + h}H${x + w - arm}`,
    `M${x + arm} ${y + h}H${x}V${y + h - arm}`,
  ].join('');
  return (
    <>
      <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, borderRadius: 6, background: alpha(MACHINE, 0.075 * flash), boxShadow: `inset 0 0 0 2px ${alpha(MACHINE, 0.4 * flash)}` }} />
      <svg width={WW} height={WH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: op }}>
        <path d={d} fill="none" stroke={MACHINE} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
};

const Label: React.FC<{ t: Target; frame: number; fs: number; th: number; mono: string }> = ({ t, frame, fs, th, mono }) => {
  const s0 = t.ft + 5;
  if (frame < s0) return null;
  const rise = ramp(frame, s0, 12, EASE.out);
  const pop = ramp(frame, s0, 4, EASE.out);
  const full = `${t.head} · ${t.detail}`;
  const typedF = Math.min(full.length, (frame - s0) * 2.2 + 1); // 机器在写：~2 字/帧
  const typed = Math.floor(typedF);
  const padX = fs * 0.53;
  const w = Math.round(measureText(full, mono, fs, 600) + padX * 2 + 4); // 定位用的最终宽度（实测）
  const wNow = Math.min(w, (typedF / full.length) * (w - padX * 2) + padX * 2); // 签条随字长出来
  const typing = typed < full.length;
  let x = t.x;
  let y = t.y;
  if (t.tag === 'right') { x = t.x + t.w + 16; y = t.y + (t.h - th) / 2; }
  if (t.tag === 'above') { x = t.x; y = t.y - th - 10; }
  if (t.tag === 'aboveRight') { x = t.x + t.w - w; y = t.y - th - 10; }
  if (t.tag === 'below') { x = t.x; y = t.y + t.h + 12; }
  if (t.tag === 'belowRight') { x = t.x + t.w - w; y = t.y + t.h + 10; }
  const right = t.tag === 'belowRight' || t.tag === 'aboveRight';
  const head = full.slice(0, Math.min(typed, t.head.length));
  const rest = typed > t.head.length ? full.slice(t.head.length, typed) : '';
  return (
    <div style={{
      position: 'absolute', left: right ? x + w - wNow : x, top: y, width: wNow, height: th, borderRadius: 10, background: MACHINE,
      boxShadow: `0 10px 22px -10px ${alpha('#0c1a5a', 0.55)}, inset 0 1px 0 rgba(255,255,255,0.22)`,
      opacity: pop, overflow: 'hidden',
      transform: `translateY(${((1 - rise) * 8).toFixed(2)}px)`,
      display: 'flex', alignItems: 'center', paddingLeft: padX, boxSizing: 'border-box',
      font: `600 ${fs}px ${mono}`, letterSpacing: 0, whiteSpace: 'pre', color: '#ffffff', lineHeight: 1.3,
    }}>
      <span style={{ fontWeight: 750 }}>{head}</span>
      <span style={{ color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>{rest}</span>
      {typing && <span style={{ display: 'inline-block', width: fs * 0.44, height: fs * 0.94, marginLeft: 2, background: 'rgba(255,255,255,0.85)' }} />}
    </div>
  );
};

export const ScanlineAnnotateFocus: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const MONO = fonts.mono;
  const SANS = fonts.sans;
  const name = useText('name', ' ').trim() || (brand?.name ?? '').trim() || 'Gốm Mộc';
  const title = useText('title', 'Gốm thủ công, đậm chất mộc.');
  const sub = useText('subtitle', 'Mỗi chiếc bình là một tác phẩm, nặn tay từ đất sét Bát Tràng.');
  const cta = useText('cta', 'Xem bộ sưu tập');
  const caption = useText('caption', '▶ Bộ sưu tập mùa thu · 0:30');
  const reading = useText('reading', 'ĐANG QUÉT');
  const doneText = useText('done', 'ĐÃ PHÂN TÍCH');
  const photo = useImage('photo');
  const nav = portrait ? ['Sản phẩm', 'Câu chuyện', 'Cửa hàng', 'Liên hệ'] : ['Sản phẩm', 'Cửa hàng', 'Liên hệ'];

  // ── 版式（全部按真实文字宽度计算 bbox）──
  const P = portrait;
  const WW = P ? 1600 : 1560;
  const WX = (1920 - WW) / 2;
  const chrome = P ? 72 : 52;
  const logo = P ? { x: 52, y: 112, mark: 84, fs: 50 } : { x: 48, y: 64, mark: 56, fs: 34 };
  const logoNameFs = fitSize(name, { family: SANS, size: logo.fs, maxWidth: P ? 760 : 340, weight: 700, minSize: logo.fs * 0.5 });
  const logoW = 18 + logo.mark + 12 + measureText(name, SANS, logoNameFs, 700) + 14;
  const logoH = logo.mark + 10;
  const navFs = P ? 42 : 28;
  const navGap = P ? 22 : 46;
  const navW = P ? measureText(nav[nav.length - 1], SANS, navFs, 550) + navGap + navFs * 1.1 : nav.reduce((a, n) => a + measureText(n, SANS, navFs, 550), 0) + navGap * (nav.length - 1);
  const navY = P ? logo.y + (logoH - navFs * 1.3) / 2 : 84;
  // H1
  const H1MAX = P ? 1440 : 780;
  const H1FS = P ? 176 : 120;
  let h1fs = H1FS;
  let h1Lines = wrapLines(title, SANS, h1fs, H1MAX, 850, 9);
  for (let k = 0; k < 8 && h1Lines.length > (P ? 3 : 2); k++) {
    h1fs = Math.round(h1fs * 0.9);
    h1Lines = wrapLines(title, SANS, h1fs, H1MAX, 850, 9);
  }
  h1Lines = wrapLines(title, SANS, h1fs, H1MAX, 850, P ? 3 : 2);
  h1fs = Math.min(h1fs, ...h1Lines.map((l) => fitSize(l, { family: SANS, size: h1fs, maxWidth: H1MAX, weight: 850, minSize: 40 })));
  const h1Y = P ? 404 : 222;
  const h1W = Math.max(...h1Lines.map((l) => measureText(l, SANS, h1fs, 850) * 0.97)) + 30;
  const h1H = h1Lines.length * h1fs * 1.08 + 28;
  // 正文
  const BMAX = P ? 1440 : 720;
  let bfs = P ? 52 : 34;
  let bLines = wrapLines(sub, SANS, bfs, BMAX, 450, 9);
  if (bLines.length > (P ? 3 : 2)) {
    bfs = Math.round(bfs * 0.84);
    bLines = wrapLines(sub, SANS, bfs, BMAX, 450, 3);
  }
  const bodyY = P ? h1Y + h1H + 40 : Math.max(500, h1Y + h1H + 14);
  const bodyBottom = bodyY + bLines.length * bfs * 1.36;
  // CTA
  const ctaFs0 = P ? 46 : 30;
  const ctaFs = fitSize(`${cta} →`, { family: SANS, size: ctaFs0, maxWidth: P ? 1100 : 560, weight: 650, minSize: ctaFs0 * 0.6 });
  const ctaH = P ? 120 : 88;
  const ctaW = measureText(`${cta} →`, SANS, ctaFs, 650) + ctaFs * 2.26 + 14 + 32;
  const ctaY = P ? bodyBottom + 56 : Math.max(632, bodyBottom + 24);
  // 产品图 + 色板
  const hero = P ? { x: 56, y: ctaY + ctaH + 110, w: 1488, h: 1220 } : { x: 892, y: 216, w: 620, h: 532 };
  const pal = P ? { x: 48, y: hero.y + hero.h + 40, d: 64 } : { x: 48, y: Math.max(756, ctaY + ctaH + 36), d: 42 };
  const palW = pal.d * 4 + pal.d * 0.28 * 3 + 32;
  const palH = pal.d + 24;
  const WH = P ? pal.y + palH + 70 : 840;
  const g: Layout = {
    portrait: P, WW, WH, chrome, logo: { ...logo, fs: logoNameFs }, nav: { right: 64, y: navY, fs: navFs, gap: navGap },
    h1: { x: 48, y: h1Y, fs: h1fs, lines: h1Lines }, body: { x: 64, y: bodyY, fs: bfs, lines: bLines },
    cta: { x: 48, y: ctaY, h: ctaH, fs: ctaFs, w: ctaW }, hero, pal: { ...pal },
    tagFs: P ? 44 : 32, tagH: P ? 70 : 50, pad: P ? 100 : 76,
  };
  const statusH = P ? 130 : 84;
  const WY = P ? Math.round((SH - WH - statusH) / 2 + statusH) : 168;
  const Y1 = WH + 20;
  const scanY = (f: number) => Y0 + (Y1 - Y0) * Math.min(1, Math.max(0, (f - SCAN0) / (SCAN1 - SCAN0)));
  const frameAtY = (y: number) => SCAN0 + ((y - Y0) / (Y1 - Y0)) * (SCAN1 - SCAN0);

  const accentHex = TERRA.toUpperCase();
  const ts: Target[] = [
    { key: 'logo', x: logo.x, y: logo.y, w: logoW, h: logoH, head: 'LOGO', detail: P ? 'chữ + biểu tượng' : 'biểu tượng', tag: P ? 'below' : 'right', ft: 0 },
    { key: 'nav', x: WW - 64 - navW - 12, y: navY - (P ? 22 : 20), w: navW + 24, h: navFs * 1.3 + (P ? 44 : 38), head: 'MENU', detail: `${P ? 4 : nav.length} mục`, tag: 'belowRight', ft: 0 },
    { key: 'h1', x: 48, y: h1Y, w: h1W, h: h1H, head: 'TIÊU ĐỀ', detail: 'đậm 850', tag: 'above', ft: 0 },
    { key: 'cta', x: 48, y: ctaY, w: ctaW, h: ctaH, head: 'CTA', detail: accentHex, tag: 'right', ft: 0 },
    { key: 'hero', x: hero.x, y: hero.y, w: hero.w, h: hero.h, head: 'ẢNH CHÍNH', detail: photo ? 'ảnh thật' : 'sản phẩm', tag: P ? 'aboveRight' : 'below', ft: 0 },
    { key: 'palette', x: pal.x, y: pal.y, w: palW, h: palH, head: 'BẢNG MÀU', detail: '4 màu', tag: 'right', ft: 0 },
  ];
  // 触发 = 扫描线越过 bbox 下缘的那一帧；按下缘排序后钳制最小间隔 4f（两块同高的不会同帧弹）
  let prev = -99;
  for (const t of [...ts].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    t.ft = Math.max(frameAtY(t.y + t.h), prev + 4);
    prev = t.ft;
  }
  const TARGETS = ts;
  const LAST_FIRE = Math.max(...TARGETS.map((t) => t.ft));

  const ly = scanY(frame);
  const lineOn = ramp(frame, SCAN0 - 4, 5, EASE.out) * (1 - ramp(frame, SCAN1, 8, EASE.exit));
  const fired = TARGETS.filter((t) => frame >= t.ft).length;
  const done = ramp(frame, LAST_FIRE + 8, 8, EASE.out);
  const push = 1 + 0.035 * ramp(frame, 0, SCANLINE_ANNOTATE_FOCUS_DURATION, EASE.swift); // 极缓推镜
  const statusIn = ramp(frame, 0, 10, EASE.out);
  const scanProg = Math.min(1, Math.max(0, (frame - SCAN0) / (SCAN1 - SCAN0)));
  const stFs = P ? 40 : 30;
  const curFs = P ? 30 : 22;

  return (
    <AbsoluteFill>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.9, y: 0.95 }} vignette={0.2} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `50% ${WY + WH * 0.45}px` }}>
        {/* ── 状态行（窗外上方）── */}
        <div style={{ position: 'absolute', left: WX, top: WY - statusH, width: WW, height: stFs * 1.6, opacity: statusIn, font: `600 ${stFs}px ${MONO}`, color: L.ink, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          <div style={{ width: stFs * 0.47, height: stFs * 0.47, borderRadius: stFs, marginRight: 16, flex: 'none', background: done > 0.5 ? MACHINE : alpha(MACHINE, 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(frame / 3))), boxShadow: `0 0 0 6px ${alpha(MACHINE, 0.12)}` }} />
          <span style={{ color: done > 0.5 ? MACHINE : L.ink, letterSpacing: '0.06em' }}>{done > 0.5 ? doneText : reading}</span>
          {P ? null : <span style={{ color: L.ink3, marginLeft: 18, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 }}>{name}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: P ? 260 : 220, height: P ? 8 : 6, borderRadius: 4, background: alpha(L.ink, 0.1), overflow: 'hidden' }}>
              <div style={{ width: `${(scanProg * 100).toFixed(2)}%`, height: '100%', background: MACHINE, borderRadius: 3 }} />
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
              <span style={{ color: L.ink3, fontWeight: 500 }}>TÍN HIỆU </span>
              <span style={{ color: fired === TARGETS.length ? MACHINE : L.ink }}>{String(fired).padStart(2, '0')}</span>
              <span style={{ color: L.ink3 }}> / {String(TARGETS.length).padStart(2, '0')}</span>
            </span>
          </div>
        </div>

        {/* ── 浏览器窗：页面 + 扫描余晖（裁进窗内）── */}
        <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: 20, overflow: 'hidden', boxShadow: `${softShadow(30, { color: L.shadow, strength: 1.1 })}, 0 0 0 1px ${alpha(L.ink, 0.08)}` }}>
          <Page g={g} name={name} nav={nav} cta={cta} caption={caption} photo={photo} />
          {/* 已读余晖：扫描线身后 140px 的淡蓝洗色 + 点阵（机器"读过"的痕迹） */}
          {lineOn > 0.01 && (
            <>
              <div style={{
                position: 'absolute', left: 0, width: WW, top: ly - 140, height: 140, opacity: lineOn,
                background: `linear-gradient(180deg, ${alpha(MACHINE, 0)} 0%, ${alpha(MACHINE, 0.05)} 60%, ${alpha(MACHINE, 0.13)} 100%)`,
              }} />
              <div style={{
                position: 'absolute', left: 0, width: WW, top: ly - 90, height: 90, opacity: lineOn * 0.8,
                backgroundImage: `radial-gradient(circle, ${alpha(MACHINE, 0.55)} 1.3px, transparent 1.9px)`, backgroundSize: '18px 18px', backgroundPosition: '0 0',
                WebkitMaskImage: 'linear-gradient(180deg, transparent, #000)', maskImage: 'linear-gradient(180deg, transparent, #000)',
              }} />
              <div style={{
                position: 'absolute', left: 0, width: WW, top: ly - 1.5, height: P ? 4 : 3, opacity: lineOn, background: MACHINE,
                boxShadow: `0 0 10px ${alpha(MACHINE, 0.55)}, 0 0 28px ${alpha(MACHINE, 0.3)}`,
              }} />
            </>
          )}
        </div>

        {/* ── 窗框两侧游标：随线滑动，左侧读出 Y ── */}
        {lineOn > 0.01 && (
          <div style={{ opacity: lineOn }}>
            <svg width={22} height={26} viewBox="0 0 22 26" style={{ position: 'absolute', left: WX - 30, top: WY + ly - 13 }}>
              <path d="M2 2 L20 13 L2 24 Z" fill={MACHINE} />
            </svg>
            <svg width={22} height={26} viewBox="0 0 22 26" style={{ position: 'absolute', left: WX + WW + 8, top: WY + ly - 13 }}>
              <path d="M20 2 L2 13 L20 24 Z" fill={MACHINE} />
            </svg>
            {P ? null : (
              <div style={{ position: 'absolute', left: WX - 150, top: WY + ly - 14, width: 112, textAlign: 'right', font: `600 ${curFs}px ${MONO}`, color: MACHINE, fontVariantNumeric: 'tabular-nums' }}>
                Y {String(Math.max(0, Math.round(ly))).padStart(4, '0')}
              </div>
            )}
          </div>
        )}

        {/* ── 取景框与标签（页面坐标，叠在窗上；不裁切，标签可略出框）── */}
        <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH }}>
          {TARGETS.map((t) => <Bracket key={t.key} t={t} frame={frame} PAD={g.pad} WW={WW} WH={WH} sw={P ? 5 : 3.5} />)}
          {TARGETS.map((t) => <Label key={t.key} t={t} frame={frame} fs={g.tagFs} th={g.tagH} mono={MONO} />)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
