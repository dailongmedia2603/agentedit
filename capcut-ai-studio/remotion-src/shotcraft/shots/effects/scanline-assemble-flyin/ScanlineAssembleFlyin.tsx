// scanline-assemble-flyin — 扫描装配组件飞入：开场只有一张蓝图画板（网格 + 虚线槽位），一条扫描线自上而下
// 匀速掠过；扫描线走到哪个槽位，该处组件就从画外飞入、过冲贴合进槽，落位瞬间四角闪出咬合角标——扫完整页恰好装完。
//
// 第二轮重设计（午夜蓝图 · AI 生成落地页）：
// - look = midnight（深蓝 · 电光蓝 · 青）。画面是一张 1640×860 的蓝图画板：120px 主网格 + 24px 细网格、
//   画板尺寸标注、每个组件的虚线槽位（带「NAV 1640×96」类小标）——第 1 帧就有完整的"施工图"，不是空黑屏。
// - 扫描线是施工进度条：电光蓝光芯 + 身后被"刷出来"的页面底色（扫过之处蓝图变成真实页面表面）+ 网格余晖。
// - 七个组件为镜头设计：video-shotcraft 的落地页——导航（镜刻标志 + 字标）、徽章、120px 两行 H1「Shoot the / launch film.」
//  （渐变强调词）、正文、CTA、样片镜头卡（程序化银河：确定性星点 + 银河带 + 山脊剪影）、三项数据。各自从所在方位的画外飞入：
//   位移 380–900px、±2–7° 起始旋转，EASE.overshoot 过冲贴合；飞行中按速度沿方向 SpeedBlur，落定清零。
// - 落定后：槽位虚线消失、四角咬合角标 2→12f 闪现收掉；全部装完后蓝图网格退到 30%、银河卡亮起，
//   状态行停表「BUILT IN 2.9 s」。全程 1.000→1.03 极缓推镜。
//
// 时间表（30fps，共 156f）：
//   0–8     蓝图画板 + 槽位在场，状态行亮起
//   8–92    扫描线匀速 −20→880（84f）；组件在扫描线越过槽位下缘时落位（飞行 14f 提前起飞，≥4f 间隔）：
//           NAV ~19f · BADGE ~29f · H1 ~54f · BODY ~66f · MEDIA ~75f · CTA ~79f · STATS ~87f
//   92–104  扫描线淡出；蓝图退场；银河卡亮起；状态行停表
//   104–156 hold：完整落地页海报，极缓推镜
//
// [Agent Edit] o chu: badge (chip "MOI") / title + title2 (H1 hai dong, dong 2 to mau chuyen sac) / subtitle (doan mo ta) /
// cta + cta2 (nut chinh / phu) / nav_cta (nut tren thanh dieu huong) / menu (3 muc dieu huong, khung ngang) /
// stats_numbers + stats_labels (2-3 so lieu) / media_label (chip tren the hinh). Thuong hieu: logo + ten tren thanh dieu
// huong (khong co -> o `name`, khong co nua thi an). o anh `screen` (tuy chon): anh trong the hinh (cover); khong co ->
// bau troi sao ve bang code nhu ban goc. Chu dai: fitSize / wrapLines theo be ngang o; o (slot) tinh lai theo noi dung ->
// moc "quet toi day thi bay vao" (land = frameAtY(day o)) van tinh tu toa do that, khoang cach >= 4f giu nguyen.
// Khung doc (native): trang kieu di dong 1680 rong, xep doc (nav / chip / H1 3 dong / mo ta / nut / hinh / so lieu),
// cao theo noi dung, can giua; quet van 84f deu tu tren xuong, chu to gap ~1.4 lan.
import { useCurrentFrame, useImage, useShotFonts, useText, useList, useVideoConfig, useBackdrop, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, SpeedBlur, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, glow } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const SCANLINE_ASSEMBLE_FLYIN_DURATION = 156;

const L = LOOKS.midnight;

// 扫描线（画板坐标）：严格匀速（Y1 = 画板高 + 20，theo bo cuc that）
const SCAN0 = 8;
const SCAN1 = 92;
const FLIGHT = 14; // 飞行帧数（提前起飞，落位 = 扫描线越过槽位下缘）

type Box = [number, number, number, number];
type Plan = { key: string; name: string; box: Box; from: [number, number]; rot: number; land: number };

// 位姿（帧的纯函数，便于中心差分求速度）
const poseAt = (p: Plan, f: number) => {
  const a = ramp(f, p.land - FLIGHT, FLIGHT, EASE.overshoot); // 0→1，过冲 ~8% 再回落
  return { a, x: mix(p.from[0], 0, a), y: mix(p.from[1], 0, a), r: mix(p.rot, 0, a) };
};

// ───────────── 确定性伪随机 ─────────────
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const STARS = Array.from({ length: 150 }, (_, i) => ({
  x: rnd(i * 3.1) * 628, y: rnd(i * 7.7 + 2) * 430, s: 0.8 + rnd(i * 5.3 + 9) ** 3 * 3.2, a: 0.35 + rnd(i * 2.9 + 4) * 0.65,
}));
// 银河带里的密集微星：沿 −32° 带轴分布，离轴距离取近似高斯（三个均匀数求和）
const BAND = Array.from({ length: 320 }, (_, i) => {
  const u = rnd(i * 4.3 + 17) * 900 - 140;
  const off = (rnd(i * 1.7 + 3) + rnd(i * 2.3 + 5) + rnd(i * 3.7 + 7) - 1.5) * 70;
  const ang = (-32 * Math.PI) / 180;
  return { x: 336 + (u - 380) * Math.cos(ang) - off * Math.sin(ang), y: 222 + (u - 380) * Math.sin(ang) + off * Math.cos(ang), s: 0.5 + rnd(i * 6.1) * 1.1, a: 0.25 + rnd(i * 8.3) * 0.55 };
});

// ───────────── 组件内容 ─────────────
const Media: React.FC<{ lit: number; w: number; h: number; src?: string; label: string; k: number }> = ({ lit, w, h, src, label, k }) => (
  <div style={{ position: 'absolute', inset: 0, borderRadius: 26 * k, overflow: 'hidden', background: 'linear-gradient(180deg, #070b1d 0%, #111a44 48%, #2a1d4a 74%, #0b0a18 100%)', boxShadow: `inset 0 0 0 1px ${alpha('#b4c6ff', 0.14)}, inset 0 1px 0 ${alpha('#ffffff', 0.12)}` }}>
    {src ? (
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: `brightness(${(0.82 + 0.18 * lit).toFixed(3)})` }} />
    ) : (
      <div style={{ position: 'absolute', left: 0, top: 0, width: 628, height: 560, transform: `scale(${Math.max(w / 628, h / 560).toFixed(4)})`, transformOrigin: '0 0' }}>
    {/* 银河带：斜向椭圆光 + 暖色核心 + 暗尘带 */}
    <div style={{ position: 'absolute', left: -120, top: 30, width: 880, height: 300, transform: 'rotate(-32deg)', borderRadius: '50%', background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(196,210,255,${(0.32 + 0.22 * lit).toFixed(3)}) 0%, rgba(150,170,255,0.12) 45%, rgba(150,170,255,0) 72%)` }} />
    <div style={{ position: 'absolute', left: 140, top: 150, width: 380, height: 150, transform: 'rotate(-32deg)', borderRadius: '50%', background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,206,170,${(0.28 + 0.25 * lit).toFixed(3)}) 0%, rgba(255,170,140,0) 70%)` }} />
    <div style={{ position: 'absolute', left: 40, top: 150, width: 640, height: 46, transform: 'rotate(-32deg)', borderRadius: '50%', background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(8,8,24,0.5) 0%, rgba(8,8,24,0) 70%)' }} />
    <svg width={628} height={560} style={{ position: 'absolute', left: 0, top: 0 }}>
      {BAND.map((s, i) => (
        <circle key={`b${i}`} cx={s.x} cy={s.y} r={s.s} fill={i % 5 ? '#e6ecff' : '#ffd9c2'} opacity={s.a * (0.7 + 0.3 * lit)} />
      ))}
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#ffffff" opacity={s.a * (0.75 + 0.25 * lit)} />
      ))}
      {/* 山脊剪影 + 轮廓光 */}
      <path d="M0 470 L70 430 L120 446 L190 392 L250 428 L320 380 L380 420 L440 398 L520 440 L580 418 L628 436 L628 560 L0 560 Z" fill="#05060f" />
      <path d="M0 470 L70 430 L120 446 L190 392 L250 428 L320 380 L380 420 L440 398 L520 440 L580 418 L628 436" fill="none" stroke={alpha('#9db8ff', 0.35)} strokeWidth={1.5} />
    </svg>
      </div>
    )}
    {label ? (
      <div style={{ position: 'absolute', left: 26 * k, bottom: 24 * k, padding: `${8 * k}px ${14 * k}px`, borderRadius: 10 * k, background: alpha('#0b1226', 0.7), border: `1px solid ${L.line}`, font: `600 ${22 * k}px ${FONT.sans}`, color: L.ink2, whiteSpace: 'nowrap', maxWidth: w - 52 * k, overflow: 'hidden' }}>
        {label}
      </div>
    ) : null}
  </div>
);

// 落位咬合角标：槽位外扩 10px、臂长 22px 的电光蓝 L 角
const SnapTicks: React.FC<{ w: number; h: number; o: number; g: number }> = ({ w, h, o, g }) => {
  if (o <= 0.01) return null;
  const a = 22;
  const d = [
    `M${-g} ${-g + a}V${-g}H${-g + a}`,
    `M${w + g - a} ${-g}H${w + g}V${-g + a}`,
    `M${w + g} ${h + g - a}V${h + g}H${w + g - a}`,
    `M${-g + a} ${h + g}H${-g}V${h + g - a}`,
  ].join('');
  return (
    <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: o, filter: `drop-shadow(0 0 6px ${alpha(L.accent, 0.9)})` }}>
      <path d={d} fill="none" stroke="#a9c1ff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const ScanlineAssembleFlyin: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const K = portrait ? 1.4 : 1; // he so chu khung doc

  const nameT = useText('name', '');
  const brandName = (BRAND.name || nameT).trim();
  const menu = useList('menu', ['Tính năng', 'Bảng giá', 'Hướng dẫn']).slice(0, 3);
  const navCta = useText('nav_cta', 'Dùng thử');
  const badgeTag = 'MỚI';
  const badge = useText('badge', 'Trình dựng video bằng AI');
  const title = useText('title', 'Dựng cả trang');
  const title2 = useText('title2', 'chỉ trong vài giây.');
  const sub = useText('subtitle', 'Chỉ cần một câu mô tả, AI tự xếp bố cục, viết nội dung và chọn hình ảnh cho bạn.');
  const cta = useText('cta', 'Bắt đầu ngay');
  const cta2 = useText('cta2', 'Xem video demo');
  const statN = useList('stats_numbers', ['1', '7', '3 giây']).slice(0, 3);
  const statL = useList('stats_labels', ['câu lệnh duy nhất', 'khối tự động xếp', 'để hoàn tất']).slice(0, 3);
  const mediaLabel = useText('media_label', 'Bản xem trước · tự động tạo');
  const screen = useImage('screen');

  // ── bo cuc (toa do trong画板) ──
  const AW = portrait ? 1680 : 1640;
  const AX = (1920 - AW) / 2;
  const PADX = 72;
  const IW = AW - PADX * 2;
  const NAV_H = portrait ? 132 : 96;
  // H1
  const h1Size0 = portrait ? 168 : 120;
  const h1W = portrait ? IW : 820;
  const h1Src = portrait ? [title, title2] : [title, title2];
  const h1Rows = h1Src.filter((x) => x.trim());
  const h1Size = Math.min(...h1Rows.map((l) => fitSize(l, { family: fonts.sans, size: h1Size0, maxWidth: h1W, weight: 800, minSize: h1Size0 * 0.45, letterSpacingEm: -0.048 })));
  const h1H = Math.round(h1Rows.length * h1Size * 1.1 + h1Size * 0.16);
  // body
  const bodySize0 = portrait ? 48 : 34;
  const bodyW = portrait ? IW : 760;
  let bodySize = bodySize0;
  let bodyLines = wrapLines(sub, fonts.sans, bodySize, bodyW, 450, 99);
  while (bodyLines.length > (portrait ? 3 : 2) && bodySize > bodySize0 * 0.62) {
    bodySize = Math.floor(bodySize * 0.94);
    bodyLines = wrapLines(sub, fonts.sans, bodySize, bodyW, 450, 99);
  }
  if (bodyLines.length > (portrait ? 3 : 2)) bodyLines = wrapLines(sub, fonts.sans, bodySize, bodyW, 450, portrait ? 3 : 2);
  const bodyH = Math.round(bodyLines.length * bodySize * 1.36);
  // badge
  const badgeSize = fitSize(badge, { family: fonts.sans, size: 26 * K, maxWidth: (portrait ? IW : 640) - 140 * K, weight: 600, minSize: 16 * K });
  const badgeW = Math.round(18 * K + measureText(badgeTag, fonts.sans, 20 * K, 750) + 20 * K + 14 * K + measureText(badge, fonts.sans, badgeSize, 600) + 26 * K);
  const badgeH = Math.round(56 * K);
  // cta
  const ctaSize = 30 * K;
  const ctaMax = (portrait ? IW : 820) * 0.55;
  const ctaFs = fitSize(cta, { family: fonts.sans, size: ctaSize, maxWidth: ctaMax - 76 * K, weight: 700, minSize: 18 * K });
  const ctaW = measureText(cta, fonts.sans, ctaFs, 700) + 76 * K;
  const cta2Max = (portrait ? IW : 820) - ctaW - 34 * K - 42 * K;
  const cta2Fs = fitSize(cta2, { family: fonts.sans, size: ctaSize, maxWidth: cta2Max, weight: 600, minSize: 16 * K });
  const ctaH = Math.round(76 * K);
  // stats
  const nStats = Math.max(1, Math.min(statN.length, statL.length || statN.length));

  let boxes: Record<string, Box>;
  let AH: number;
  if (!portrait) {
    AH = 860;
    boxes = {
      nav: [0, 0, AW, NAV_H],
      badge: [PADX, 150, Math.min(640, badgeW), badgeH],
      h1: [PADX, 228, 820, 250],
      body: [PADX, 508, 760, 96],
      media: [940, 140, 628, 560],
      cta: [PADX, 640, 560, ctaH],
      stats: [PADX, 752, 1496, 80],
    };
  } else {
    let y = NAV_H + 70;
    const b = (h: number, gap: number, w = IW): Box => {
      const r: Box = [PADX, y, w, h];
      y += h + gap;
      return r;
    };
    const badgeB = b(badgeH, 44, Math.min(IW, badgeW));
    const h1B = b(h1H, 36);
    const bodyB = b(bodyH, 56);
    const ctaB = b(ctaH, 70);
    const mediaB = b(Math.round(IW * 0.62), 64);
    const statsB = b(Math.round(96 * K + 40 * K * 2.6), 60);
    AH = y;
    boxes = { nav: [0, 0, AW, NAV_H], badge: badgeB, h1: h1B, body: bodyB, media: mediaB, cta: ctaB, stats: statsB };
  }
  const AY = portrait ? Math.round((SH - AH) / 2 + 50) : 150;
  const Y0 = -20;
  const Y1 = AH + 20;
  const scanY = (f: number) => Y0 + (Y1 - Y0) * Math.min(1, Math.max(0, (f - SCAN0) / (SCAN1 - SCAN0)));
  const frameAtY = (y: number) => SCAN0 + ((y - Y0) / (Y1 - Y0)) * (SCAN1 - SCAN0);

  // ───────────── 组件飞入方案：box = 槽位（画板坐标），from = 画外起点位移，rot = 起始旋转 ─────────────
  const ps: Plan[] = [
    { key: 'nav', name: 'ĐIỀU HƯỚNG', box: boxes.nav, from: [0, -260 * K], rot: 0, land: 0 },
    { key: 'badge', name: 'NHÃN', box: boxes.badge, from: [-620 * K, -60], rot: -7, land: 0 },
    { key: 'h1', name: 'TIÊU ĐỀ', box: boxes.h1, from: [-980 * K, 90], rot: -4, land: 0 },
    { key: 'body', name: 'MÔ TẢ', box: boxes.body, from: [-860 * K, 220], rot: -2, land: 0 },
    { key: 'media', name: 'HÌNH ẢNH', box: boxes.media, from: [900 * K, 80], rot: 6, land: 0 },
    { key: 'cta', name: 'NÚT', box: boxes.cta, from: [-120, 460 * K], rot: 3, land: 0 },
    { key: 'stats', name: 'SỐ LIỆU', box: boxes.stats, from: [140, 420 * K], rot: -2, land: 0 },
  ];
  let prev = -99;
  for (const p of [...ps].sort((a, b) => a.box[1] + a.box[3] - (b.box[1] + b.box[3]))) {
    p.land = Math.max(frameAtY(p.box[1] + p.box[3]), prev + 4);
    prev = p.land;
  }
  const PLAN = ps;
  const P = Object.fromEntries(PLAN.map((p) => [p.key, p])) as Record<string, Plan>;
  const LAST_LAND = Math.max(...PLAN.map((p) => p.land));

  const ly = scanY(frame);
  const lineOn = ramp(frame, SCAN0 - 5, 6, EASE.out) * (1 - ramp(frame, SCAN1, 10, EASE.exit));
  const done = ramp(frame, LAST_LAND + 4, 12, EASE.out);
  const placed = PLAN.filter((p) => frame >= p.land).length;
  const push = 1 + 0.03 * ramp(frame, 0, SCANLINE_ASSEMBLE_FLYIN_DURATION, EASE.swift);
  const clock = Math.min(frame, LAST_LAND + 4) / 30; // 停表：装完那一刻定格
  const lit = ramp(frame, LAST_LAND + 2, 20, EASE.out);
  const blueprint = mix(1, 0.3, done);

  const Fly: React.FC<{ p: Plan; children: React.ReactNode }> = ({ p, children }) => {
    const pose = poseAt(p, frame);
    const start = p.land - FLIGHT;
    if (frame < start) return null;
    const v0 = poseAt(p, frame - 0.5);
    const v1 = poseAt(p, frame + 0.5);
    const moving = frame < p.land + 4;
    const [bx, by, bw, bh] = p.box;
    const tick = ramp(frame, p.land + 1, 3, EASE.out) * (1 - ramp(frame, p.land + 5, 9, EASE.out));
    const tickGap = 10 + 10 * (1 - ramp(frame, p.land + 1, 6, EASE.snappy)); // 角标从外 20px 咬进 10px
    return (
      <SpeedBlur vx={moving ? v1.x - v0.x : 0} vy={moving ? v1.y - v0.y : 0} amount={0.32} max={18}>
        <div style={{
          position: 'absolute', left: bx, top: by, width: bw, height: bh,
          opacity: ramp(frame, start, 4, EASE.out),
          transform: `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px) rotate(${pose.r.toFixed(3)}deg)`,
        }}>
          {children}
          {p.key !== 'nav' && <SnapTicks w={bw} h={bh} o={tick} g={tickGap} />}
        </div>
      </SpeedBlur>
    );
  };

  // [Agent Edit] DOT 2: bo luoi ke o "ban thiet ke" phu nen (ke ca khi khong co nen anh); vet sang sau tia quet giu lai
  // thanh mot dai sang mau nhan tron (khong ke o)
  const lyF = AY + ly; // 扫描线帧坐标
  const halo = useBackdrop() ? '0 2px 18px rgba(0,0,0,0.55)' : undefined; // chu dong trang thai nam tren nen anh AI

  // ── noi dung cac khoi ──
  const navMark = 56 * K;
  const navNameFs = brandName ? fitSize(brandName, { family: BRAND.font, size: 32 * K, maxWidth: portrait ? IW * 0.5 : 480, weight: 700, minSize: 18 * K }) : 0;
  const navCtaFs = fitSize(navCta, { family: fonts.sans, size: 24 * K, maxWidth: 260 * K, weight: 650, minSize: 14 * K });
  const nav = (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: `0 ${PADX}px`, borderBottom: `1px solid ${L.line}`, fontFamily: FONT.sans }}>
      {brandName || BRAND.name ? <ShotcraftMark size={navMark} tone="dark" style={{ marginLeft: -7 * K, flex: 'none' }} /> : null}
      {brandName ? <div style={{ marginLeft: 10 * K, font: `700 ${navNameFs}px ${BRAND.font}`, letterSpacing: '0.01em', color: L.ink, whiteSpace: 'nowrap' }}>{brandName}</div> : null}
      {!portrait ? (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 44, font: `550 26px ${FONT.sans}`, color: L.ink2, whiteSpace: 'nowrap' }}>
          {menu.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      ) : (
        <div style={{ marginLeft: 'auto' }} />
      )}
      <div style={{ marginLeft: portrait ? 0 : 48, height: 52 * K, padding: `0 ${26 * K}px`, borderRadius: 26 * K, background: alpha(L.ink, 0.08), border: `1px solid ${alpha(L.ink, 0.16)}`, display: 'flex', alignItems: 'center', font: `650 ${navCtaFs}px ${FONT.sans}`, color: L.ink, whiteSpace: 'nowrap' }}>
        {navCta}
      </div>
      {portrait ? (
        <svg width={44 * K} height={44 * K} viewBox="0 0 44 44" style={{ marginLeft: 30 * K }}><path d="M8 13H36M8 22H36M8 31H36" stroke={L.ink2} strokeWidth={3.2} strokeLinecap="round" /></svg>
      ) : null}
    </div>
  );
  const badgeEl = (
    <div style={{ position: 'absolute', left: 0, top: 0, height: badgeH, padding: `0 ${24 * K}px 0 ${18 * K}px`, borderRadius: badgeH / 2, display: 'flex', alignItems: 'center', gap: 14 * K, background: alpha(L.accent2, 0.1), border: `1px solid ${alpha(L.accent2, 0.35)}`, font: `600 ${badgeSize}px ${FONT.sans}`, color: L.ink, whiteSpace: 'nowrap' }}>
      <span style={{ padding: `${4 * K}px ${10 * K}px`, borderRadius: 8 * K, background: L.accent2, color: L.onAccent, font: `750 ${20 * K}px ${FONT.sans}`, letterSpacing: '0.06em' }}>{badgeTag}</span>
      {badge}
    </div>
  );
  const h1El = (
    <div style={{ position: 'absolute', left: -4, top: h1Size * (portrait ? 0.12 : 0.06), font: `800 ${h1Size}px ${FONT.sans}`, letterSpacing: '-0.048em', lineHeight: 1.1, color: L.ink, whiteSpace: 'nowrap' }}>
      {h1Rows.map((l, i) =>
        i === h1Rows.length - 1 && h1Rows.length > 1 ? (
          <div key={i}><span style={{ backgroundImage: `linear-gradient(90deg, ${L.accent} 0%, #9db8ff 55%, ${L.accent2} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', padding: '0.2em 0.04em 0.12em', margin: '-0.2em -0.04em -0.12em' }}>{l}</span></div>
        ) : (
          <div key={i}>{l}</div>
        ),
      )}
    </div>
  );
  const bodyEl = (
    <div style={{ position: 'absolute', left: 0, top: 0, width: bodyW, font: `450 ${bodySize}px ${FONT.sans}`, lineHeight: 1.36, color: L.ink2, letterSpacing: '-0.012em' }}>
      {bodyLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
    </div>
  );
  const ctaEl = (
    <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: 34 * K, fontFamily: FONT.sans }}>
      <div style={{ height: ctaH, padding: `0 ${38 * K}px`, borderRadius: ctaH / 2, background: `linear-gradient(180deg, #7aa2ff 0%, ${L.accent} 100%)`, color: L.onAccent, display: 'flex', alignItems: 'center', font: `700 ${ctaFs}px ${FONT.sans}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap', boxShadow: `0 14px 34px -12px ${alpha(L.accent, 0.8)}, inset 0 1px 0 rgba(255,255,255,0.45)` }}>
        {cta}
      </div>
      {cta2.trim() ? (
        <div style={{ font: `600 ${cta2Fs}px ${FONT.sans}`, color: L.ink, display: 'flex', alignItems: 'center', gap: 12 * K, whiteSpace: 'nowrap' }}>
          <svg width={30 * K} height={30 * K} viewBox="0 0 30 30"><circle cx={15} cy={15} r={13.5} fill="none" stroke={L.ink2} strokeWidth={2} /><path d="M12 9.5 L20.5 15 L12 20.5 Z" fill={L.ink} /></svg>
          {cta2}
        </div>
      ) : null}
    </div>
  );
  const [, , sw] = boxes.stats;
  const colW = sw / nStats;
  const statsEl = (
    <div style={{ position: 'absolute', inset: 0, borderTop: `1px solid ${L.line}`, display: 'flex', alignItems: portrait ? 'flex-start' : 'flex-end', paddingTop: 18 * K }}>
      {statN.slice(0, nStats).map((n, i) => {
        const lab = statL[i] ?? '';
        if (!portrait) {
          const nFs = fitSize(n, { family: fonts.sans, size: 52, maxWidth: colW * 0.45, weight: 780, minSize: 30 });
          const nW = measureText(n, fonts.sans, nFs, 780) * 0.96;
          const lw = colW - nW - 16 - 30;
          const one = fitSize(lab, { family: fonts.sans, size: 26, maxWidth: lw, weight: 500, minSize: 13 });
          // nhan dai: xuong 2 dong (co >= 19) thay vi thu qua nho
          const ll = one >= 20 ? [lab] : wrapLines(lab, fonts.sans, 22, lw, 500, 2);
          const lFs = one >= 20 ? one : Math.min(...ll.map((l) => fitSize(l, { family: fonts.sans, size: 22, maxWidth: lw, weight: 500, minSize: 15 })));
          return (
            <div key={i} style={{ width: colW, display: 'flex', alignItems: ll.length > 1 ? 'flex-end' : 'baseline', gap: 16, whiteSpace: 'nowrap' }}>
              <span style={{ font: `780 ${nFs}px ${FONT.sans}`, letterSpacing: '-0.04em', lineHeight: 1, color: i === 0 ? L.accent : L.ink, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span style={{ display: 'flex', flexDirection: 'column', font: `500 ${lFs}px ${FONT.sans}`, lineHeight: 1.2, color: L.ink2, paddingBottom: ll.length > 1 ? 2 : 0 }}>
                {ll.map((l, j) => <span key={j}>{l}</span>)}
              </span>
            </div>
          );
        }
        const nFs = fitSize(n, { family: fonts.sans, size: 96, maxWidth: colW - 30, weight: 780, minSize: 44 });
        const ll = wrapLines(lab, fonts.sans, 38, colW - 30, 500, 2);
        const lFs = Math.min(...ll.map((l) => fitSize(l, { family: fonts.sans, size: 38, maxWidth: colW - 30, weight: 500, minSize: 22 })));
        return (
          <div key={i} style={{ width: colW, whiteSpace: 'nowrap' }}>
            <div style={{ font: `780 ${nFs}px ${FONT.sans}`, letterSpacing: '-0.04em', lineHeight: 1.15, color: i === 0 ? L.accent : L.ink, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
            {ll.map((l, j) => <div key={j} style={{ font: `500 ${lFs}px ${FONT.sans}`, lineHeight: 1.3, color: L.ink2 }}>{l}</div>)}
          </div>
        );
      })}
    </div>
  );
  const statusFs = 30 * (portrait ? 1.3 : 1);

  return (
    <AbsoluteFill>
      <Stage look={L} keyLight={{ x: 0.62, y: 0.0 }} fill={{ x: 0.1, y: 0.95 }} intensity={0.85} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: '50% 52%' }}>
        {/* ── 扫描线身后被照亮的一段（[Agent Edit] 无网格：纯色柔光带）── */}
        {lineOn > 0.01 && (
          <div style={{
            position: 'absolute', inset: -40, opacity: lineOn * 0.5, background: alpha(L.accent, 0.22),
            WebkitMaskImage: `linear-gradient(180deg, transparent ${lyF - 180 + 40}px, #000 ${lyF + 40}px, transparent ${lyF + 42}px)`,
            maskImage: `linear-gradient(180deg, transparent ${lyF - 180 + 40}px, #000 ${lyF + 40}px, transparent ${lyF + 42}px)`,
          }} />
        )}

        {/* ── 状态行（画板上方）── */}
        <div style={{ position: 'absolute', left: AX, top: AY - 84 * (portrait ? 1.5 : 1), width: AW, height: 48 * (portrait ? 1.3 : 1), display: 'flex', alignItems: 'center', font: `600 ${statusFs}px ${FONT.sans}`, color: L.ink, opacity: ramp(frame, 0, 10, EASE.out), whiteSpace: 'nowrap', textShadow: halo }}>
          <span style={{ color: done > 0.5 ? L.accent2 : L.accent, letterSpacing: '0.06em', textShadow: done > 0.5 ? glow(L.accent2, 0.5) : 'none' }}>
            {done > 0.5 ? '✓ ĐÃ DỰNG XONG' : '▸ ĐANG DỰNG'}
          </span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
            <span style={{ color: L.ink3, fontWeight: 500 }}>KHỐI </span>
            <span style={{ color: placed === PLAN.length ? L.accent2 : L.ink }}>{String(placed).padStart(2, '0')}</span>
            <span style={{ color: L.ink3 }}> / {String(PLAN.length).padStart(2, '0')}</span>
            <span style={{ color: L.ink3, fontWeight: 500, marginLeft: 34 }}>{clock.toFixed(1).replace('.', ',')} giây</span>
          </span>
        </div>

        {/* ── 画板 ── */}
        <div style={{ position: 'absolute', left: AX, top: AY, width: AW, height: AH }}>
          {/* 页面表面：扫描线扫过之处由蓝图"刷"成页面底色 */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 28,
            background: `linear-gradient(180deg, ${alpha('#101a36', 0.96)} 0%, ${alpha('#0b1328', 0.96)} 100%)`,
            boxShadow: `0 40px 120px -40px ${alpha('#000208', 0.9)}, inset 0 0 0 1px ${alpha('#a9c1ff', 0.12)}, inset 0 1px 0 ${alpha('#ffffff', 0.08)}`,
            WebkitMaskImage: `linear-gradient(180deg, #000 ${ly - 30}px, transparent ${ly + 2}px)`,
            maskImage: `linear-gradient(180deg, #000 ${ly - 30}px, transparent ${ly + 2}px)`,
          }} />
          {/* 画板外框 + 尺寸标注（蓝图元素，装完后退场） */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 28, border: `1.5px dashed ${alpha('#a9c1ff', 0.3)}`, opacity: blueprint }} />
          <div style={{ position: 'absolute', left: 0, top: -30, width: AW, display: 'flex', alignItems: 'center', gap: 14, opacity: blueprint * 0.9, font: `500 20px ${FONT.sans}`, color: alpha('#a9c1ff', 0.55) }}>
            <div style={{ flex: 1, height: 1, background: alpha('#a9c1ff', 0.3) }} />{AW}<div style={{ flex: 1, height: 1, background: alpha('#a9c1ff', 0.3) }} />
          </div>
          {/* 槽位：虚线框 + 小标（纹理），组件落位时消失 */}
          {PLAN.map((p) => {
            const [bx, by, bw, bh] = p.box;
            const o = (1 - ramp(frame, p.land - 2, 4, EASE.out)) * blueprint;
            if (o <= 0.01) return null;
            return (
              <div key={p.key} style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, opacity: o, borderRadius: 12, border: `1.5px dashed ${alpha('#a9c1ff', 0.5)}`, background: alpha('#5b8cff', 0.06), overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 14, top: 8, font: `600 ${18 * K}px ${FONT.sans}`, color: alpha('#a9c1ff', 0.75), letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  {p.name} <span style={{ opacity: 0.6 }}>{Math.round(bw)}×{Math.round(bh)}</span>
                </div>
              </div>
            );
          })}

          {/* 组件 */}
          <Fly p={P.nav}>{nav}</Fly>
          <Fly p={P.badge}>{badgeEl}</Fly>
          <Fly p={P.h1}>{h1El}</Fly>
          <Fly p={P.body}>{bodyEl}</Fly>
          <Fly p={P.media}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 26 * K, boxShadow: `0 30px 80px -30px ${alpha('#000208', 0.95)}, 0 0 ${(60 * lit).toFixed(1)}px ${alpha(L.accent, 0.22 * lit)}` }} />
            <Media lit={lit} w={boxes.media[2]} h={boxes.media[3]} src={screen} label={mediaLabel} k={K} />
          </Fly>
          <Fly p={P.cta}>{ctaEl}</Fly>
          <Fly p={P.stats}>{statsEl}</Fly>

          {/* 扫描线：光芯 + 柔辉 + 两端渐隐（画板宽 + 两侧各出 60px） */}
          {lineOn > 0.01 && (
            <div style={{
              position: 'absolute', left: -60, width: AW + 120, top: ly - 2, height: 4 * (portrait ? 1.5 : 1), opacity: lineOn,
              background: 'linear-gradient(90deg, transparent 0%, #dfe8ff 8%, #ffffff 50%, #dfe8ff 92%, transparent 100%)',
              boxShadow: `0 0 12px ${alpha(L.accent, 0.95)}, 0 0 36px ${alpha(L.accent, 0.6)}, 0 0 90px ${alpha(L.accent, 0.35)}`,
            }} />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
