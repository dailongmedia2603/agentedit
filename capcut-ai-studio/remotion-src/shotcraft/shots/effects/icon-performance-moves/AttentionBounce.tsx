// 求关注弹跳（attention-bounce）——macOS Dock 语汇：图标原地连跳讨拍，一次比一次高，镜头被它吸引过去。
//
// 第二轮重设计（午后窗光 · 一枚日历图标）：
// - look = sand（米色暖光 · 赤陶强调）。背景墙上斜打两道百叶窗光（生活方式的午后），画面下缘是一条
//   贯穿画幅、被画框裁掉两端的磨砂奶油色 Dock；主角是 360px 的 video-shotcraft app 图标——奶油底上
//   一枚「镜刻」标志（取景框 + 琥珀斜切），比通用铃铛更有辨识度。左右邻居图标（鼠尾草 / 石板蓝 / 沙色 /
//   炭黑）用低饱和色压住。
// - 弹跳按真实抛体：4 跳高度 0.35 → 0.6 → 0.85 → 1.2 倍图标高，每跳时长 ∝ √高度（14 / 18 / 22 / 26f），
//   空中按竖向速度拉长、落地 2f 接触压扁（越跳越重，末跳宽 1.2x 高 0.8x），落点一圈玻璃涟漪 + 几颗溅点。
// - "被吸引"：第二跳起邻居图标逐渐失焦变淡（rack focus，世界退后），最高那跳镜头 smooth 推近 8%。
// - 落定：阻尼回弹稳住 → 同帧角标弹出、Dock 下方亮起运行指示点 → 功能面板从图标右上角弹簧展开
//   （父先到、行晚 3f 错峰），面板文字 ≥32px，结尾帧是一张完整的"New in Shotcraft"海报（一支宣传片的分镜时间线）。
//
// 时间表（30fps，共 156f）：
//   0–12    预备：画面已有 Dock 与图标，镜头极缓推进；6–12f 蹲一下蓄力
//   12–100  4 跳递增（12 / 28 / 48 / 72f 起跳，100f 末跳落地）；邻居 30–96f 失焦；镜头 72–90f 推近 8%
//   100–110 落定回弹；角标 100f 弹出；运行点亮起
//   106–132 面板弹簧展开（106f），三行 114f 起错峰
//   132–156 hold：极缓推进 + 窗光微漂，干净落定
//
// [Agent Edit] o chu: kicker (nhan dau panel; mac dinh "MỚI TRÊN <thuong hieu>" / "TÍNH NĂNG MỚI"), title (tieu de panel),
// items (2-4 dong tinh nang) + metas (nhan nho ben phai tung dong, tuy chon), badge (so tren cham do, mac dinh "1").
// O anh `icon` (tuy chon): icon app / logo san pham lam nhan vat chinh; khong co -> logo thuong hieu cua video
// (hoac dau hieu trung tinh). Khung doc (native): icon 1.3x, Dock o 3/4 duoi khung, panel rong 1700 can giua phan tren
// Dock, chu to; cu dong / bong / tieng nay giu nguyen thong so goc (4 cu nhay tang dan 0.35 -> 1.2 lan icon).
import { useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const ATTENTION_BOUNCE_DURATION = 156; // 5.2s

const L = LOOKS.sand;

// 4 跳：起跳帧、空中时长、峰高（相对图标高）；时长 ∝ √高度（同一重力下的抛体）
const JUMPS = [
  { start: 12, dur: 14, peak: 0.35 },
  { start: 28, dur: 18, peak: 0.6 },
  { start: 48, dur: 22, peak: 0.85 },
  { start: 72, dur: 26, peak: 1.2 },
];
const LAND = 100; // 末跳落地帧（72 + 26 + 2f 接触余量）
const LAND_FINAL = JUMPS[3].start + JUMPS[3].dur; // 98

const hs = (n: number) => {
  const x = Math.sin(n * 91.345 + 47.853) * 43758.5453;
  return x - Math.floor(x);
};

// 主角身体状态：离地高度 y（px）、竖向速度（归一化）、接触压扁量
const body = (f: number, ICON: number) => {
  let y = 0, v = 0, squash = 0;
  JUMPS.forEach((j, ji) => {
    const t = (f - j.start) / j.dur;
    if (t > 0 && t < 1) {
      y = j.peak * ICON * 4 * t * (1 - t);
      v = 1 - 2 * t; // +1 起跳最快 → 0 顶点 → -1 落地最快
    }
    // 落地接触 2f：压扁量随跳高递增（末跳 0.2 = 宽 1.2x 高 0.8x）
    const land = j.start + j.dur;
    const q = 0.1 + 0.1 * (ji / 3);
    if (ji < 3 && f >= land && f < land + 2) squash = q * (1 - (f - land) / 2) + q * 0.4;
  });
  // 起跳前蹲一下
  if (f >= 6 && f < 12) squash = 0.08 * EASE.out((f - 6) / 6);
  // 末跳落地：压扁 → 回拉 → 稳住（阻尼余弦）
  if (f >= LAND_FINAL) {
    const k = f - LAND_FINAL;
    squash = 0.2 * Math.exp(-k * 0.38) * Math.cos(k * 0.72);
  }
  return { y, v, squash };
};

// 落地帧列表（涟漪 / 溅点用）
const LANDINGS = JUMPS.map((j, i) => ({ at: j.start + j.dur, k: i }));

// ───────────── 图标 ─────────────

// 主角 app 图标：奶油 squircle + 视频品牌标志（或真实 app 图标图片，cover 铺满）
const HeroIcon: React.FC<{ size: number; rad: number; src?: string }> = ({ size, rad, src }) => (
  <div style={{
    position: 'absolute', inset: 0, borderRadius: rad, overflow: 'hidden',
    background: 'linear-gradient(180deg, #fffaf2 0%, #f6ecdd 100%)',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -6px 14px rgba(120,80,40,0.12), inset 0 0 0 1px rgba(70,45,20,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {src ? (
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      <ShotcraftMark size={size * 0.62} tone="light" />
    )}
    {/* 顶部柔光 */}
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse closest-side at 38% 0%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)',
    }} />
  </div>
);

// 邻居图标：低饱和色块 + 简单字形
const Neighbor: React.FC<{ kind: number; rad: number }> = ({ kind, rad }) => {
  const bgs = [
    'linear-gradient(180deg, #9db59a 0%, #6f8f70 100%)',
    'linear-gradient(180deg, #6b7e9c 0%, #44567a 100%)',
    'linear-gradient(180deg, #e9dcc4 0%, #cdb894 100%)',
    'linear-gradient(180deg, #4a4741 0%, #2b2925 100%)',
  ];
  const ink = kind === 2 ? '#6d5d4c' : '#fbf6ef';
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: rad, overflow: 'hidden', background: bgs[kind],
      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -6px 14px rgba(0,0,0,0.12)',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 360 360" style={{ position: 'absolute', inset: 0 }}>
        <g fill="none" stroke={ink} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round">
          {kind === 0 && <path d="M110 250 C 110 150, 190 100, 260 100 C 260 190, 210 250, 110 250 Z M110 250 L 200 160" />}
          {kind === 1 && <g><rect x={90} y={120} width={180} height={130} rx={18} /><path d="M95 130 L180 195 L265 130" /></g>}
          {kind === 2 && <g><rect x={95} y={130} width={170} height={120} rx={22} /><circle cx={180} cy={190} r={36} /><path d="M140 130 L150 108 L210 108 L220 130" /></g>}
          {kind === 3 && <g><path d="M150 240 L150 110 L250 92 L250 222" /><circle cx={128} cy={242} r={24} fill={ink} /><circle cx={228} cy={224} r={24} fill={ink} /></g>}
        </g>
      </svg>
    </div>
  );
};

const ROW_COLORS = ['#3d5a80', '#7d9a7e', L.accent, '#b08a4f'];

export const AttentionBounce: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;

  const kicker = useText('kicker', BRAND.name ? `MỚI TRÊN ${BRAND.name.toUpperCase()}` : 'TÍNH NĂNG MỚI');
  const title = useText('title', 'Dựng video nhanh gấp đôi.');
  const itemsIn = useList('items', ['Tự cắt theo nhịp nhạc', 'Phụ đề tiếng Việt chuẩn', 'Hiệu ứng logo một chạm']);
  const metasIn = useList('metas', ['12 cảnh', 'AI', '+ âm thanh']);
  const badge = useText('badge', '1');
  const iconSrc = useImage('icon');
  const items = itemsIn.slice(0, 4);
  const metas = items.map((_, i) => (metasIn[i] ?? '').trim());

  // ── 几何 ──
  const K = portrait ? 1.3 : 1;
  const ICON = 360 * K; // 图标边长（半屏级）
  const RAD = 82 * K; // squircle 圆角
  const CX = portrait ? 960 : 600; // 主角图标中心 x
  const GROUND = portrait ? Math.round(SH * 0.74) : 960; // 图标静止时的底边 y（Dock 内）
  const DOCK_TOP = GROUND - ICON - 30 * K;
  const neighborsX = portrait ? [CX - ICON * 1.17, CX + ICON * 1.17, CX - ICON * 2.34, CX + ICON * 2.34] : [CX - 420, CX + 420, CX + 840, CX + 1260];

  // ── 面板版式 ──
  const PW = portrait ? 1700 : 860;
  const PPX = portrait ? 70 : 46; // 内边距
  const IW = PW - PPX * 2;
  const kSz = fitSize(kicker, { family: fonts.sans, size: portrait ? 46 : 24, maxWidth: IW - 80, weight: 700, minSize: 16, letterSpacingEm: 0.16 });
  const tSz0 = portrait ? 140 : 68;
  const tOne = fitSize(title, { family: fonts.sans, size: tSz0, maxWidth: IW, weight: 700, minSize: tSz0 * 0.7 });
  const tLines = measureText(title, fonts.sans, tOne, 700) <= IW ? [title] : wrapLines(title, fonts.sans, tSz0 * 0.7, IW, 700, 2);
  const tSz = tLines.length === 1 ? tOne : Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSz0 * 0.7, maxWidth: IW, weight: 700, minSize: tSz0 * 0.4 })));
  const rowH = portrait ? 120 : 58;
  const rowGap = portrait ? 14 : 8;
  const numW = portrait ? 110 : 76;
  const rowFs = portrait ? 70 : 36;
  const metaFs = portrait ? 56 : 32;
  const metaW = (m: string) => (m ? measureText(m, fonts.sans, metaFs, 450) + 24 : 0);
  const itemSz = (t: string, m: string) => fitSize(t, { family: fonts.sans, size: rowFs, maxWidth: IW - numW - 24 - 8 - 24 - Math.min(metaW(m), IW * 0.32), weight: 600, minSize: rowFs * 0.5 });
  const itemSzAll = Math.min(...items.map((it, i) => itemSz(it, metas[i])));
  const metaSz = (m: string) => fitSize(m, { family: fonts.sans, size: metaFs, maxWidth: IW * 0.3, weight: 450, minSize: 16 });
  const PH = Math.round((portrait ? 60 : 36) * 2 + kSz * 1.3 + (portrait ? 26 : 18) + tLines.length * tSz * 1.16 + (portrait ? 34 : 22) + items.length * (rowH + rowGap));
  // 横向：面板底边钉在原位（y 540）；纵向：面板在 Dock 上方空间里竖直居中
  const panelTop = portrait ? Math.max(160, Math.round(DOCK_TOP - 150 - PH)) : Math.max(110, 540 - PH);
  const panelLeft = portrait ? (1920 - PW) / 2 : 880;

  const { y, v, squash } = body(f, ICON);
  const stretch = Math.abs(v) * 0.1 * (y > 0 ? 1 : 0);
  const sx = 1 + squash - stretch * 0.5;
  const sy = 1 - squash + stretch;
  const lift = y / (1.2 * ICON); // 0 贴地 → 1 最高

  // 镜头：开场极缓推进 1→1.015；最高那跳 smooth 推近到 1.08；hold 段再推 1%
  const zoom = 1 + 0.015 * ramp(f, 0, 72, EASE.smooth) + 0.065 * ramp(f, 72, 18, EASE.smooth) + 0.012 * ramp(f, 110, 46, EASE.smooth);
  const focus = portrait ? { x: CX, y: GROUND - ICON * 1.2 } : { x: CX + 120, y: 700 };

  // 邻居失焦（rack focus）
  const defocus = ramp(f, 30, 66, EASE.swift);

  // 角标、运行点、面板
  const badgeS = f >= LAND ? springAt(f, LAND, { damping: 11, stiffness: 260 }) : 0;
  const dot = ramp(f, LAND + 2, 8, EASE.out);
  const panel = f >= 106 ? springAt(f, 106, { damping: 17, stiffness: 150 }) : 0;
  const row = (i: number) => ramp(f, 114 + i * 3, 16, EASE.snappy);

  // 窗光微漂
  const shaft = Math.sin(f / 70) * 14;
  const badgeD = 104 * K * (badge.length > 1 ? 1 + 0.3 * (badge.length - 1) : 1);

  return (
    <AbsoluteFill style={{ background: L.bg[1] }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.85, y: 0.2 }} style={{ background: 'linear-gradient(180deg, #e6d9c6 0%, #dccdb8 60%, #d3c3ac 100%)' }} />
      {/* 百叶窗光：两道斜光带打在背景墙上 */}
      <div style={{
        position: 'absolute', left: -400 + shaft, top: -200, width: 2800 + (portrait ? 1600 : 0), height: 1500 * (portrait ? 2.2 : 1), transform: 'rotate(-24deg)', transformOrigin: '0 0',
        background: `repeating-linear-gradient(90deg, transparent 0px, transparent ${250 * K}px, ${alpha('#fffaf0', 0.85)} ${280 * K}px, ${alpha('#fff6e6', 0.7)} ${400 * K}px, transparent ${430 * K}px, transparent ${620 * K}px)`,
        filter: 'blur(6px)', opacity: 0.9, mixBlendMode: 'soft-light',
        WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 45%, transparent 75%)', maskImage: 'linear-gradient(180deg, #000 0%, #000 45%, transparent 75%)',
      }} />

      {/* 镜头层 */}
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${focus.x}px ${focus.y}px` }}>
        {/* Dock：贯穿画幅的磨砂奶油玻璃条，两端被画框裁掉 */}
        <div style={{
          position: 'absolute', left: -80, right: -80, top: DOCK_TOP, height: ICON + 64 * K, borderRadius: 72 * K,
          background: 'linear-gradient(180deg, rgba(255,251,244,0.72) 0%, rgba(250,242,230,0.6) 100%)',
          boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(70,45,20,0.07), ${softShadow(30 * K, { color: L.shadow, strength: 1.1 })}`,
        }} />

        {/* 邻居图标（失焦变淡） */}
        {neighborsX.map((x, i) => (
          <div key={i} style={{
            position: 'absolute', left: x - ICON / 2, top: GROUND - ICON, width: ICON, height: ICON,
            filter: `blur(${(defocus * 7 * K).toFixed(2)}px) saturate(${1 - 0.3 * defocus})`, opacity: 1 - 0.4 * defocus,
            boxShadow: softShadow(8 * K, { color: L.shadow }), borderRadius: RAD,
          }}>
            <Neighbor kind={i === 0 ? 0 : i} rad={RAD} />
          </div>
        ))}

        {/* 落点涟漪 + 溅点 */}
        <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {LANDINGS.map(({ at, k }) => {
            const t = (f - at) / 18;
            if (t <= 0 || t >= 1) return null;
            const e = EASE.snappy(t);
            const strength = 0.5 + k * 0.17;
            return (
              <g key={at}>
                <ellipse cx={CX} cy={GROUND + 6 * K} rx={mix(ICON * 0.48, ICON * (0.85 + 0.15 * k), e)} ry={mix(14, 34 + 6 * k, e) * K}
                  fill="none" stroke={L.ink2} strokeWidth={mix(10, 3, e) * K} opacity={(1 - t) * strength * 0.3} style={{ filter: 'blur(2.5px)' }} />
                {Array.from({ length: 4 }, (_, i) => {
                  const side = i % 2 ? 1 : -1;
                  const dx = side * (ICON * 0.5 + (40 + 60 * hs(k * 7 + i)) * K * e * (0.7 + k * 0.25));
                  const dy = -(30 + 40 * hs(k * 11 + i)) * K * 4 * t * (1 - t) * (0.6 + k * 0.2);
                  return <circle key={i} cx={CX + dx} cy={GROUND - 4 * K + dy} r={(4 + 3 * hs(i + k)) * K} fill={L.ink3} opacity={(1 - t) * 0.7} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* 接触影：近地小而实（随高度迅速变淡）+ 远地大而虚 */}
        <div style={{
          position: 'absolute', left: CX - ICON * 0.42 * sx * (1 - lift * 0.4), width: ICON * 0.84 * sx * (1 - lift * 0.4),
          top: GROUND - 10 * K, height: 22 * K, borderRadius: '50%', background: alpha(L.shadow, 0.34), filter: 'blur(7px)', opacity: Math.max(0, 1 - lift * 1.8),
        }} />
        <div style={{
          position: 'absolute', left: CX - ICON * 0.52 * (1 - lift * 0.25), width: ICON * 1.04 * (1 - lift * 0.25),
          top: GROUND - 16 * K, height: 46 * K, borderRadius: '50%', background: alpha(L.shadow, 0.16), filter: 'blur(16px)', opacity: 1 - lift * 0.6,
        }} />

        {/* 运行指示点 */}
        <div style={{
          position: 'absolute', left: CX - 7 * K, top: GROUND + 16 * K, width: 14 * K, height: 14 * K, borderRadius: 7 * K,
          background: L.ink2, opacity: dot, transform: `scale(${dot})`,
        }} />

        {/* 主角图标（按底边中心挤压拉伸） */}
        <div style={{
          position: 'absolute', left: CX - ICON / 2, top: GROUND - ICON - y, width: ICON, height: ICON,
          transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, transformOrigin: '50% 100%',
          borderRadius: RAD, boxShadow: softShadow((10 + lift * 40) * K, { color: L.shadow, strength: 1.2 }),
        }}>
          <HeroIcon size={ICON} rad={RAD} src={iconSrc} />
          {/* 角标 */}
          {badgeS > 0 && badge ? (
            <div style={{
              position: 'absolute', right: -34 * K, top: -34 * K, minWidth: 104 * K, width: badgeD, height: 104 * K, borderRadius: 52 * K,
              background: 'linear-gradient(180deg, #e0603a 0%, #c4452a 100%)', color: '#fff8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
              ...type(56 * K * (badge.length > 2 ? 0.8 : 1), 700), letterSpacing: '-0.02em',
              boxShadow: `0 0 0 ${7 * K}px ${L.bg[0]}, 0 10px 22px ${alpha('#7a2a10', 0.35)}`, transform: `scale(${badgeS})`,
            }}>{badge}</div>
          ) : null}
        </div>

        {/* 功能面板：从图标方向弹簧展开（横向右上角；纵向在图标上方） */}
        {panel > 0.001 && (
          <div style={{
            position: 'absolute', left: panelLeft, top: panelTop, width: PW, height: PH, boxSizing: 'border-box',
            transform: portrait
              ? `translate(0px, ${(1 - panel) * 300}px) scale(${mix(0.2, 1, panel)})`
              : `translate(${(1 - panel) * -120}px, ${(1 - panel) * 260}px) scale(${mix(0.2, 1, panel)})`,
            transformOrigin: portrait ? '50% 100%' : '0% 100%',
            opacity: Math.min(1, panel * 2.5),
            background: 'linear-gradient(180deg, #fffdf9 0%, #fbf5ec 100%)', borderRadius: 36 * K, padding: `${portrait ? 60 : 36}px ${PPX}px`,
            boxShadow: `inset 0 1.5px 0 rgba(255,255,255,1), inset 0 0 0 1px rgba(70,45,20,0.08), ${softShadow(44 * K, { color: L.shadow, strength: 1.25 })}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ ...type(kSz, 700), lineHeight: 1.3, letterSpacing: '0.16em', color: L.accent, whiteSpace: 'nowrap' }}>{kicker}</div>
              <div style={{ flex: 1, height: 1.5, background: L.line }} />
            </div>
            <div style={{ marginTop: portrait ? 26 : 18 }}>
              {tLines.map((l, i) => (
                <div key={i} style={{ ...type(tSz, 700), lineHeight: 1.16, color: L.ink, whiteSpace: 'nowrap' }}>{l}</div>
              ))}
            </div>
            <div style={{ marginTop: portrait ? 34 : 22, display: 'flex', flexDirection: 'column', gap: rowGap }}>
              {items.map((it, i) => {
                const r = row(i);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 24 * (portrait ? 1.2 : 1), height: rowH, opacity: r, transform: `translateY(${(1 - r) * 22}px)`, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ fontFamily: FONT.mono, fontSize: metaFs, color: L.ink3, width: numW, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ width: 8 * K, height: rowH * 0.86, borderRadius: 4 * K, background: ROW_COLORS[i % ROW_COLORS.length], flexShrink: 0 }} />
                    <div style={{ ...type(itemSzAll, 600), lineHeight: 1.3, color: L.ink }}>{it}</div>
                    {metas[i] ? <div style={{ marginLeft: 'auto', ...type(metaSz(metas[i]), 450), lineHeight: 1.3, color: L.ink2 }}>{metas[i]}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
