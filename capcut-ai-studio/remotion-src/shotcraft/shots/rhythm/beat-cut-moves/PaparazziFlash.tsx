// paparazzi-flash（B 连闪定格）—— 高光时刻三连白闪，每闪硬切同一画面的不同裁切
// （全景 → 奖牌卡 → 数字特写），快门余韵沉降，第三闪停在数字上收束。
//
// 第二轮重设计（颁奖夜 · 你就是那台相机）：
// - look = graphite（近单色暗场，白为闪光，香槟金只给奖项信息）。画面是颁奖背板（step-and-repeat：
//   视频品牌标志 / 名称砖砌平铺）前的一块年度大奖卡：奖项名 + 「Top 1」+ 说明 + 获奖者。三个裁切层层逼近：全景 → 卡片 → 280px 的「Take 1」。
// - 取景器 HUD（屏幕层，不随裁切缩放）：四角取景框、曝光读数、张数计数、闪光灯充电指示。
//   每一闪之前 8f，对焦框从大收到"下一张要拍的裁切范围"并在第 3f 前转香槟色锁定 = 预备拍；
//   白闪 = 主动作；切入画面 1.03→1 回落 + 沉降 = 快门余韵；张数 +1、充电灯清零重充 = 跟随。
// - 闪前 30f 是"活"的：背板上不断有别家相机的小闪光、画面缓推；闪后每张都是死的定格（照片），
//   轻微去饱和 + 提对比，活 / 死的反差让三闪读作"被拍下"。
//
// 时间表（30fps，共 140f）：
//   0–30    活素材：缓推 + 背板上 6 次远处小闪光；22f 起对焦框锁卡片
//   30      第一闪 → 全景定格（间隔 22f）；44–52 对焦框收向卡片裁切
//   52      第二闪 → 卡片定格（间隔 18f）；62–70 对焦框收向「Take 1」
//   70      第三闪 → 数字特写定格
//   70–140  hold 70f：极缓 1→1.015 推近；84f 起右下「Saved」淡入，尾帧是一张完整的获奖照
//
// [Agent Edit] o chu: kicker (nhan giai) / title (ten giai) / label + number (con so duoc "dang quang", vd "Top 1") /
// caption (cau ben canh so; dong cuoi to vang) / name + tagline (nguoi / san pham nhan giai; trong -> ten thuong hieu).
// The giai tu bo cuc theo chu that (tieu de tu xuong 2 dong, so dai tu thu nho, chu thich tu chuyen xuong duoi so).
// Ba khung cat (toan canh -> the -> so) tinh tu vi tri that cua the. Khung doc (native): canh cao = height, the phong to
// 1.5x, chu thich xep duoi so -> khung cat cuoi van la can canh so; HUD bam theo 4 goc khung doc.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useShotFonts, measureText, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, Grain, Vignette, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const PAPARAZZI_FLASH_DURATION = 140; // 活素材 30f + 三闪 40f + hold 70f

const L = LOOKS.graphite;
const GOLD = L.accent2;
const F1 = 30;
const F2 = 52;
const F3 = 70;
const FLASHES = [F1, F2, F3];
const SETTLE = 6; // 切入回落
const DECAY = 4; // 白闪衰减
const BLOOM = 7; // 闪后过曝回落
const AF = 8; // 对焦框提前量

const hash = (i: number) => {
  const s = Math.sin(i * 127.3 + 11.7) * 43758.5453;
  return s - Math.floor(s);
};

type Rect = { x: number; y: number; w: number; h: number };

// ───────────── 奖牌卡布局（卡片坐标，宽 700；按真实文字排） ─────────────
type CardLayout = {
  W: number; SH: number; portrait: boolean;
  k: number; x: number; y: number; w: number; h: number; // 卡片在场景中的位置（左上）与缩放 k
  kicker: string; kickerSize: number;
  title: { lines: string[]; size: number; top: number; lh: number };
  div1: number;
  label: string; number: string; numTop: number; labelSize: number; numSize: number; rowW: number; rowH: number;
  cap: { lines: string[]; size: number; left: number; top: number; lh: number };
  div2: number | null;
  brand: { top: number; name: string; nameSize: number; tag: string[]; tagSize: number } | null;
  block: Rect; // 数字 + 说明（卡片坐标）
};

// 均衡折行：保持行数不变，把宽度收到最窄（避免末行只剩一个词）
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

const useCardLayout = (): CardLayout => {
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'GIẢI THƯỞNG · 2026');
  const title = useText('title', 'Sản phẩm của năm');
  const label = useText('label', 'Top');
  const number = useText('number', '1');
  const caption = useText('caption', 'bán chạy nhất toàn thị trường');
  const name = useText('name', '') || BRAND.name;
  const tagline = useText('tagline', 'Do chính khách hàng bình chọn');
  const w = 700;
  const inner = w - 120;
  const kickerSize = fitSize(kicker.toUpperCase(), { family: fonts.sans, size: 22, maxWidth: inner - 104, weight: 700, letterSpacingEm: 0.24, minSize: 16 });
  // 标题：72px 一行（可缩到 58）；仍放不下 → 两行均衡折行
  let tSize = fitSize(title, { family: fonts.sans, size: 72, maxWidth: inner / 0.97, weight: 720, minSize: 40 });
  let tLines = [title];
  if (tSize < 58) {
    tLines = balanced(title, fonts.sans, 64, inner / 0.97, 720, 2);
    tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: 64, maxWidth: inner / 0.97, weight: 720, minSize: 40 })));
  }
  const tLh = tSize * 1.16;
  const titleTop = 128;
  const div1 = titleTop + tLines.length * tLh + 22;
  // 数字行：label 110 + number 280，超宽则一起缩（以下 y 均相对数字行顶）
  const lw0 = label ? measureText(label, fonts.sans, 110, 700) * 0.96 + 14 : 0;
  const nw0 = measureText(number, fonts.sans, 280, 820) * 0.94;
  const rowMax = w - 104;
  const kRow = Math.min(1, rowMax / (lw0 + nw0));
  const labelSize = 110 * kRow;
  const numSize = 280 * kRow;
  const rowW = (lw0 + nw0) * kRow;
  const rowH = numSize * 0.9;
  // 说明：横屏优先放数字右侧（≤3 行），放不下 → 数字下方；竖屏一律放下方（窄列，便于末张特写）
  let cap = { lines: [] as string[], size: 44, left: 60, top: rowH + 22, lh: 44 * 1.14 };
  if (caption) {
    const right = 52 + rowW + 30;
    const avail = w - 56 - right;
    let placed = false;
    if (!portrait && avail >= 150) {
      for (const sz of [44, 38]) {
        const ls = wrapLines(caption, fonts.sans, sz, avail, 580, 9);
        if (ls.length <= 3 && ls.every((l) => measureText(l, fonts.sans, sz, 580) <= avail)) {
          const bl = balanced(caption, fonts.sans, sz, avail, 580, 3);
          const lh = sz * 1.14;
          cap = { lines: bl, size: sz, left: right, lh, top: Math.max(0, (rowH - bl.length * lh) / 2) + 18 * kRow };
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      const cw = portrait ? Math.min(inner, Math.max(rowW, 440)) : inner;
      const maxL = portrait ? 4 : 2;
      let ls = wrapLines(caption, fonts.sans, 44, cw, 580, maxL);
      const sz = Math.min(...ls.map((l) => fitSize(l, { family: fonts.sans, size: 44, maxWidth: cw, weight: 580, minSize: 30 })));
      ls = balanced(caption, fonts.sans, sz, cw, 580, maxL);
      cap = { lines: ls, size: sz, left: 60, top: rowH + 20, lh: sz * 1.14 };
    }
  }
  const capBottom = cap.lines.length ? cap.top + cap.lines.length * cap.lh : 0;
  const blockH = Math.max(rowH, capBottom);
  const blockRight = cap.lines.length ? Math.max(52 + rowW, cap.left + Math.max(...cap.lines.map((l) => measureText(l, fonts.sans, cap.size, 580)))) : 52 + rowW;
  // 品牌行：标志 + 名称 + 一句话
  const tw = inner - 102;
  const nameSize = name ? fitSize(name, { family: fonts.sans, size: 44, maxWidth: tw, weight: 700, minSize: 28 }) : 0;
  let tag = tagline ? wrapLines(tagline, fonts.sans, 30, tw, 450, 2) : [];
  const tagSize = tag.length ? Math.min(...tag.map((l) => fitSize(l, { family: fonts.sans, size: 30, maxWidth: tw, weight: 450, minSize: 22 }))) : 30;
  if (tag.length) tag = balanced(tagline, fonts.sans, tagSize, tw, 450, 2);
  const hasBrand = !!(name || tagline);
  const brandH = hasBrand ? 36 + Math.max(80, (name ? nameSize * 1.3 : 0) + tag.length * tagSize * 1.3 + (name && tag.length ? 4 : 0)) + 44 : 0;
  // 末张特写只该看到「数字 + 说明」：按特写的可见高度给数字块上下留白（竖屏画面高 → 卡片也拉高）
  const bw = blockRight - 44 + 8;
  const bh = blockH + 28;
  const kMax = portrait ? 1.5 : 1;
  let k = kMax;
  let pad = 60;
  let h = 0;
  for (let pass = 0; pass < 3; pass++) {
    const sD = Math.min(2.8, (1920 * 0.9) / (bw * k), (SH * 0.85) / (bh * k));
    const vis = SH / (sD * k); // 特写可见的卡片高度
    pad = Math.max(48, (vis - bh) / 2 + 34);
    h = div1 + pad + blockH + pad + (hasBrand ? 0 : 20) + brandH;
    k = portrait ? Math.min(kMax, (SH * 0.72) / h) : Math.min(1, 860 / h);
  }
  const numTop = div1 + pad;
  const block: Rect = { x: 44, y: numTop - 8, w: bw, h: bh };
  const div2 = hasBrand ? numTop + blockH + pad - 20 : null;
  const brand = hasBrand ? { top: div2! + 36, name, nameSize, tag, tagSize } : null;
  const cy = portrait ? SH / 2 : 556;
  return {
    W: 1920, SH, portrait, k, x: 960 - (w * k) / 2, y: cy - (h * k) / 2, w, h,
    kicker, kickerSize, title: { lines: tLines, size: tSize, top: titleTop, lh: tLh }, div1,
    label, number, numTop, labelSize, numSize, rowW, rowH, cap: { ...cap, top: numTop + cap.top }, div2, brand, block,
  };
};

// 远处别家相机的小闪光（只在活素材段；y 为 1080 高下的位置，竖屏按高度拉开）
const POPS = [
  { f: 3, x: 300, y: 300 }, { f: 9, x: 1620, y: 220 }, { f: 13, x: 420, y: 780 },
  { f: 18, x: 1500, y: 700 }, { f: 23, x: 220, y: 520 }, { f: 27, x: 1760, y: 480 },
];

const Wall: React.FC<{ SH: number }> = ({ SH }) => {
  const rows = Math.ceil(SH / 124) + 1;
  const cols = 6;
  const word = BRAND.name;
  // [Agent Edit] nen anh AI: anh nen lam "phong nen" cua canh (ve ngay trong canh de 3 khung cat van zoom theo),
  // bo nen gradient + gach logo lap lai
  const bd = useBackdrop();
  if (bd) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
        <Img src={bd.src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.06)', filter: 'blur(4px) brightness(0.48) saturate(0.9)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,6,10,0.4) 0%, rgba(4,6,10,0.2) 45%, rgba(4,6,10,0.5) 100%)' }} />
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden',
      background: `radial-gradient(ellipse 60% 70% at 50% 28%, #2a2b2f 0%, #18191c 55%, #0d0d0f 100%)` }}>
      {/* [Agent Edit] khong co ten thuong hieu -> bo hang logo lap lai (nhin nhu luoi cham trang tri); chi giu backdrop ten khi co thuong hieu */}
      {word && Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ position: 'absolute', left: (r % 2) * -170 - 60, top: 20 + r * 124, display: 'flex', gap: 0, whiteSpace: 'nowrap' }}>
          {Array.from({ length: cols + 1 }, (_, c) => {
            // 背板砖：视频品牌标志 / 名称交错（整体压到 9%）；无品牌名 → 全是标志
            const mark = !word || (r + c) % 2 === 0;
            return (
              <div key={c} style={{ width: 340, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mark ? <ShotcraftMark size={52} tone="dark" style={{ opacity: 0.1 }} /> : (
                  <span style={{ fontFamily: BRAND.font, fontSize: 30, fontWeight: 700, letterSpacing: '0.03em', color: alpha('#ffffff', 0.09) }}>{word}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Laurel: React.FC<{ s?: number }> = ({ s = 70 }) => (
  <svg width={s * 1.6} height={s} viewBox="0 0 112 70" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round">
    {[-1, 1].map((side) => (
      <g key={side} transform={side === 1 ? 'translate(112 0) scale(-1 1)' : undefined}>
        <path d="M44 64 C24 58 12 42 12 18" />
        {[0, 1, 2, 3].map((k) => {
          const y = 56 - k * 12;
          const x = 30 - k * 4.5;
          return <path key={k} d={`M${x} ${y} q -12 -2 -14 -12 q 12 0 14 12`} fill={alpha(GOLD, 0.25)} />;
        })}
      </g>
    ))}
    <path d="M56 22 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 z" fill={GOLD} stroke="none" />
  </svg>
);

const Card: React.FC<{ c: CardLayout }> = ({ c }) => (
  <div style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, transform: `scale(${c.k.toFixed(5)})`, transformOrigin: '0 0', borderRadius: 40, overflow: 'hidden',
    background: 'linear-gradient(165deg, #2a2b30 0%, #18191c 45%, #121315 100%)',
    boxShadow: `inset 0 0 0 1.5px ${alpha('#ffffff', 0.12)}, inset 0 1.5px 0 ${alpha('#ffffff', 0.22)}, 0 60px 120px -40px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,0,0,0.6)` }}>
    {/* 卡面受光：顶部一片柔高光 */}
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 40% at 30% 0%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)' }} />
    {/* 数字块背后一团极淡的香槟金余光（竖屏卡片拉高后填住留白） */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: c.block.y - c.block.h * 0.6, height: c.block.h * 2.2, background: `radial-gradient(ellipse 60% 50% at 40% 50%, ${alpha(GOLD, 0.07)} 0%, ${alpha(GOLD, 0)} 70%)` }} />
    <div style={{ position: 'absolute', left: 60, top: 50, display: 'flex', alignItems: 'center', gap: 20 }}>
      <Laurel s={52} />
      {c.kicker ? <div style={{ ...type(c.kickerSize, 700), letterSpacing: '0.24em', color: GOLD, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{c.kicker.toUpperCase()}</div> : null}
    </div>
    {c.title.lines.map((l, i) => (
      <div key={i} style={{ position: 'absolute', left: 58, top: c.title.top + i * c.title.lh, ...type(c.title.size, 720), letterSpacing: '-0.03em', lineHeight: 1.16, whiteSpace: 'nowrap' }}>{l}</div>
    ))}
    <div style={{ position: 'absolute', left: 60, right: 60, top: c.div1, height: 1.5, background: alpha('#ffffff', 0.12) }} />
    <div style={{ position: 'absolute', left: 52, top: c.numTop, display: 'flex', alignItems: 'flex-start', lineHeight: 0.9, whiteSpace: 'nowrap' }}>
      {c.label ? <span style={{ ...type(c.labelSize, 700), letterSpacing: '-0.04em', lineHeight: 1, color: L.ink2, marginTop: c.labelSize * 0.2, marginRight: 14 * (c.labelSize / 110) }}>{c.label}</span> : null}
      <span style={{ ...type(c.numSize, 820), letterSpacing: '-0.06em', lineHeight: 0.9 }}>{c.number}</span>
    </div>
    {c.cap.lines.map((l, i) => (
      <div key={i} style={{ position: 'absolute', left: c.cap.left, top: c.cap.top + i * c.cap.lh, ...type(c.cap.size, 580), letterSpacing: '-0.01em', lineHeight: 1.14, whiteSpace: 'nowrap', color: i === c.cap.lines.length - 1 ? GOLD : L.ink2 }}>{l}</div>
    ))}
    {c.div2 !== null && <div style={{ position: 'absolute', left: 60, right: 60, top: c.div2, height: 1.5, background: alpha('#ffffff', 0.12) }} />}
    {c.brand && (
      <div style={{ position: 'absolute', left: 60, right: 60, top: c.brand.top, display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ flex: 'none', width: 80, height: 80, borderRadius: 22, background: `linear-gradient(150deg, ${BRAND.paper} 0%, #d6d2c8 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 1.5px 0 #fff, 0 10px 24px -10px rgba(0,0,0,0.8)' }}>
          <ShotcraftMark size={54} tone="light" />
        </div>
        <div style={{ minWidth: 0 }}>
          {c.brand.name ? <div style={{ fontFamily: FONT.sans, fontSize: c.brand.nameSize, fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{c.brand.name}</div> : null}
          {c.brand.tag.map((l, i) => (
            <div key={i} style={{ ...type(c.brand!.tagSize, 450), color: c.brand!.name ? L.ink3 : L.ink2, lineHeight: 1.3, whiteSpace: 'nowrap', marginTop: i === 0 && c.brand!.name ? 4 : 0 }}>{l}</div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const Scene: React.FC<{ f: number; live: boolean; c: CardLayout }> = ({ f, live, c }) => {
  const bd = useBackdrop();
  return (
  <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans, color: L.ink }}>
    <Wall SH={c.SH} />
    {/* 舞台顶光 */}
    {!bd && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 34% 60% at 50% 40%, rgba(255,250,240,0.12) 0%, rgba(255,250,240,0) 70%)` }} />}
    {/* 别家相机的远处闪光：4 角星芒 + 柔光，每次 3f */}
    {live && POPS.map((p, i) => {
      const t = f - p.f;
      if (t < 0 || t > 3) return null;
      const a = 1 - t / 3;
      const py = p.y * (c.SH / 1080);
      return (
        <div key={i} style={{ position: 'absolute', left: p.x - 120, top: py - 120, width: 240, height: 240, opacity: a }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(230,240,255,0.35) 18%, rgba(255,255,255,0) 60%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 118, height: 4, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }} />
          <div style={{ position: 'absolute', top: 30, bottom: 30, left: 118, width: 4, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
        </div>
      );
    })}
    <Card c={c} />
  </div>
  );
};

// ───────────── 裁切与 HUD ─────────────
type View = { scale: number; cx: number; cy: number };

// 全景坐标矩形 → 某视图下的屏幕矩形
const project = (r: Rect, v: View, SH: number) => ({
  x: (r.x - v.cx) * v.scale + 960, y: (r.y - v.cy) * v.scale + SH / 2, w: r.w * v.scale, h: r.h * v.scale,
});
const viewRect = (v: View, SH: number) => ({ x: v.cx - 960 / v.scale, y: v.cy - SH / 2 / v.scale, w: 1920 / v.scale, h: SH / v.scale });

const Brackets: React.FC<{ x: number; y: number; w: number; h: number; color: string; arm?: number; width?: number; opacity?: number }> = ({ x, y, w, h, color, arm = 46, width = 3, opacity = 1 }) => {
  const a = Math.min(arm, w / 3, h / 3);
  const d = `M${x} ${y + a}V${y}H${x + a} M${x + w - a} ${y}H${x + w}V${y + a} M${x + w} ${y + h - a}V${y + h}H${x + w - a} M${x + a} ${y + h}H${x}V${y + h - a}`;
  return <path d={d} stroke={color} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="square" />;
};

const Still: React.FC<{ view: View; f: number; live: boolean; c: CardLayout }> = ({ view, f, live, c }) => (
  <div style={{ position: 'absolute', left: 960 / view.scale - view.cx, top: c.SH / 2 / view.scale - view.cy, width: 1920, height: c.SH, zoom: view.scale }}>
    <Scene f={f} live={live} c={c} />
  </div>
);

export const PaparazziFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const c = useCardLayout();
  const { SH, portrait } = c;
  const u = portrait ? 1.5 : 1; // HUD 字号倍率
  // 三张裁切：全景 → 卡片（卡顶到第二条发丝线）→ 数字特写（数字 + 说明）
  const sx = (v: number) => c.x + v * c.k;
  const sy = (v: number) => c.y + v * c.k;
  const VIEW_WIDE: View = { scale: 1.0, cx: 960, cy: SH / 2 };
  // 卡片张：横屏 = 卡顶到第二条发丝线（原版裁切）；竖屏画面够高 → 整张卡（不切到品牌行半行字）
  const cardBottom = portrait ? c.h + 44 : c.div2 ?? c.h;
  const regTop = sy(-44);
  const regBot = sy(cardBottom);
  const VIEW_CARD: View = { scale: Math.min(1.6, (1920 * 0.96) / (c.w * c.k + 120), (SH * (portrait ? 0.86 : 0.93)) / (regBot - regTop)), cx: 960, cy: (regTop + regBot) / 2 };
  const b = c.block;
  const bw = b.w * c.k;
  const bh = b.h * c.k;
  const VIEW_DIGIT: View = { scale: Math.min(2.8, (1920 * 0.9) / bw, (SH * 0.85) / bh), cx: sx(b.x + b.w / 2), cy: sy(b.y + b.h / 2) };
  const STILLS = [VIEW_WIDE, VIEW_CARD, VIEW_DIGIT];
  let seg = -1;
  for (let i = 0; i < FLASHES.length; i++) if (frame >= FLASHES[i]) seg = i;

  // 闪后余韵：1.03→1 回落 + 半格沉降；过曝回落
  let settleScale = 1;
  let settleY = 0;
  let bloom = 0;
  if (seg >= 0) {
    const t = 1 - ramp(frame, FLASHES[seg], SETTLE, EASE.out);
    settleScale = 1 + 0.03 * t;
    settleY = -16 * t;
    bloom = 1 - ramp(frame, FLASHES[seg], BLOOM, EASE.out);
  }
  let flash = 0;
  for (const f of FLASHES) if (frame >= f && frame <= f + DECAY) flash = Math.max(flash, 0.95 * (1 - ramp(frame, f, DECAY, EASE.out)));
  const inFlash = FLASHES.some((f) => frame >= f && frame < f + DECAY);
  const jx = inFlash ? 2 * (hash(frame * 7 + 1) * 2 - 1) : 0;
  const jy = inFlash ? 2 * (hash(frame * 13 + 5) * 2 - 1) : 0;

  // 活素材：全景缓推（in-out）；hold 段极缓推近
  const liveP = ramp(frame, 0, F1, EASE.smooth);
  const liveScale = mix(1.04, 1.1, liveP);
  const holdPush = seg === 2 ? mix(1, 1.015, ramp(frame, F3 + SETTLE, 64, EASE.smooth)) : 1;
  // 背板别家闪光带来的环境亮度起伏
  const popLift = seg === -1 ? POPS.reduce((m, p) => Math.max(m, frame >= p.f && frame <= p.f + 2 ? 0.06 * (1 - (frame - p.f) / 3) : 0), 0) : 0;

  // 对焦框：下一闪前 AF 帧从大收到目标（屏幕坐标），锁定后转金
  const curView: View = seg === -1 ? { scale: liveScale, cx: 960, cy: SH / 2 } : STILLS[seg];
  const nextIdx = seg + 1;
  let af: React.ReactNode = null;
  if (nextIdx < FLASHES.length) {
    const fNext = FLASHES[nextIdx];
    const start = nextIdx === 0 ? F1 - 9 : fNext - AF;
    if (frame >= start && frame < fNext) {
      const target = nextIdx === 0 ? { x: c.x - 30, y: c.y - 30, w: c.w * c.k + 60, h: c.h * c.k + 60 } : viewRect(STILLS[nextIdx], SH);
      const r = project(target, curView, SH);
      const p = ramp(frame, start, 6, EASE.snappy);
      const k = mix(1.3, 1, p);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const locked = frame >= fNext - 3;
      af = <Brackets x={cx - (r.w * k) / 2} y={cy - (r.h * k) / 2} w={r.w * k} h={r.h * k} color={locked ? GOLD : '#ffffff'} width={(locked ? 4 : 3) * u} opacity={locked ? 1 : 0.85} arm={60 * u} />;
    }
  }

  // HUD 数据
  const shots = 23 + Math.max(0, seg + 1);
  const lastFlash = seg >= 0 ? FLASHES[seg] : -40;
  const charge = Math.min(1, (frame - lastFlash) / 16);
  const saved = ramp(frame, 84, 12, EASE.out);
  const hx = portrait ? 120 : 130;
  const hy = portrait ? 150 : 112;
  const bd = useBackdrop();

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#0b0b0c', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, transformOrigin: `960px ${SH / 2}px`,
        transform: `translate(${jx.toFixed(2)}px, ${(jy + settleY).toFixed(2)}px) scale(${(settleScale * holdPush * 1.012).toFixed(5)})`,
        // 定格 = 照片：微去饱和 + 提对比；闪后 7f 过曝回落
        filter: seg >= 0
          ? `brightness(${(1 + 0.22 * bloom).toFixed(3)}) contrast(${(1.06 - 0.14 * bloom).toFixed(3)}) saturate(${(0.82 - 0.2 * bloom).toFixed(3)})`
          : popLift > 0 ? `brightness(${(1 + popLift).toFixed(3)})` : undefined,
      }}>
        {seg === -1 ? (
          <div style={{ position: 'absolute', inset: 0, transformOrigin: `960px ${SH / 2}px`, transform: `scale(${liveScale.toFixed(5)})` }}>
            <Scene f={frame} live c={c} />
          </div>
        ) : (
          <Still view={STILLS[seg]} f={FLASHES[seg]} live={false} c={c} />
        )}
      </div>
      {!bd && <Vignette strength={[0.5, 0.5, 0.56, 0.62][seg + 1]} inner={0.42} color="#000000" />}
      {!bd && <Grain opacity={0.1} blend="soft-light" />}

      {/* 取景器 HUD（屏幕层） */}
      <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
        <Brackets x={96 * (portrait ? 0.8 : 1)} y={84} w={1920 - 192 * (portrait ? 0.8 : 1)} h={SH - 168} color="#ffffff" opacity={0.5} arm={70 * u} width={3 * u} />
        {af}
      </svg>
      <div style={{ position: 'absolute', left: hx, top: hy, display: 'flex', alignItems: 'center', gap: 12 * u, fontFamily: FONT.mono, fontSize: 24 * u, fontWeight: 700, color: alpha('#ffffff', 0.7), letterSpacing: '0.08em' }}>
        <div style={{ width: 12 * u, height: 12 * u, borderRadius: 6 * u, background: '#ff453a' }} />RAW · 45MP
      </div>
      <div style={{ position: 'absolute', right: hx, top: hy - 6, display: 'flex', alignItems: 'center', gap: 14 * u, fontFamily: FONT.sans, fontSize: 24 * u, fontWeight: 700, color: charge >= 1 ? GOLD : alpha('#ffffff', 0.55), letterSpacing: '0.08em' }}>
        <svg width={30 * u} height={30 * u} viewBox="0 0 30 30">
          <circle cx={15} cy={15} r={12} stroke={alpha('#ffffff', 0.2)} strokeWidth={3} fill="none" />
          <circle cx={15} cy={15} r={12} stroke={charge >= 1 ? GOLD : '#ffffff'} strokeWidth={3} fill="none" strokeDasharray={`${(charge * 75.4).toFixed(1)} 76`} transform="rotate(-90 15 15)" strokeLinecap="round" />
        </svg>
        {charge >= 1 ? 'ĐÈN SẴN SÀNG' : 'ĐANG SẠC'}
      </div>
      <div style={{ position: 'absolute', left: hx, bottom: hy - 4, display: 'flex', gap: 40 * (portrait ? 0.9 : 1), fontFamily: FONT.mono, fontSize: 28 * (portrait ? 1.35 : 1), fontWeight: 600, color: alpha('#ffffff', 0.75), letterSpacing: '0.04em' }}>
        <span>1/250</span><span>F2.8</span><span>ISO 1600</span>{portrait ? null : <span style={{ color: alpha('#ffffff', 0.45) }}>±0.0</span>}
      </div>
      <div style={{ position: 'absolute', right: hx, bottom: hy - 10, display: 'flex', alignItems: 'baseline', gap: 22 * u, fontFamily: FONT.mono, color: alpha('#ffffff', 0.8) }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 24 * u, fontWeight: 700, letterSpacing: '0.1em', color: GOLD, opacity: saved }}>✓ ĐÃ LƯU</span>
        <span style={{ fontSize: 40 * u, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(shots).padStart(3, '0')}</span>
      </div>

      {/* 白闪：中心满白、四角留一点画面（闪光灯的径向衰减） */}
      {flash > 0.004 && (
        <AbsoluteFill style={{ opacity: flash, background: 'radial-gradient(ellipse 80% 90% at 50% 45%, #ffffff 0%, #ffffff 45%, rgba(250,250,255,0.86) 100%)' }} />
      )}
    </AbsoluteFill>
  );
};
