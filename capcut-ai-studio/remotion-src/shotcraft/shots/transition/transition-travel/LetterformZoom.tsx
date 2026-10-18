// letterform-zoom〔转场〕：巨型章节标题的字形是一扇扇"窗"，窗里透出下一页；镜头指数推进钻进
// 一个笔画，洞撑满全屏的瞬间新页面接管，残余笔画与盖板甩出画外。
//
// 第二轮重设计（余烬 · 熔炉之门）：
// - look = ember。盖板是暖黑章节字卡（顶光 + 字后余烬光），560px Black 字重的「EDITS」挖空成洞；
//   洞里透出的是一张熔金色的 video-shotcraft 发布页（橙 → 金渐变 + 一枚太阳光斑），所以字形本身就是画面里最亮的东西，
//   "洞里有东西"第一帧就读得出。hold 期页面的文字/卡片层完全隐去，洞里只有暖色渐变与柔光形（读作图像，
//   不和「EDITS」两层字互相抢）；主推中段 64–90f 内容由 18px 失焦淡入合焦，接管时已清晰。
//   字缘一圈熔光外溢到盖板上（模糊描边、只画在盖板区域内）——光从洞里漏出来。
// - 空间：盖板在前、页面在后。推进时盖板 ×30 而页面只 ×1.08，两层视差读作真实纵深；
//   快速段给盖板叠两层更小倍率的半透明残影（径向"变焦拖影"），代替整屏实时模糊。
// - 锚点 = 「I」竖笔中心（洞），竖笔 ≈106px 宽 ×30 ≈ 3200px > 画宽，推到底真正是洞撑满全屏。
// - 着陆后的余波：页面上的渲染卡 0→12 镜头计数、四条镜头时长条错峰填满（先密后疏），
//   "DONE"标签弹出——穿越之后新页面立刻是活的，不是一张死图。
//
// 时间表（30fps，共 150f）：
//   0–26    建立：字卡在场（第 0 帧即有画面），眉题/副标升起，盖板极缓前推 1→1.03（蓄势）
//   26–34   预备：后吸 2%（anticip）
//   34–86   主推：scale = 30^u，u 走 bezier(0.6,0,0.85,0.5) 慢起陡收（52f）；u>0.35 起残影 + 模糊
//   64–90   页面内容失焦淡入 → 合焦（18px→0，EASE.out）
//   76–86   接管：scale 14→26 盖板淡出；页面曝光 +12% 一闪回落
//   86–116  落定：页面继续前推到 1.08，速度与主推末端连续（quint-out）
//   96–132  余波：计数 0→12、时长条错峰填满、DONE 标签弹出
//   132–150 hold：海报定格
//
// [Agent Edit] o chu — BAN CHU (truoc khi xuyen): word (TU khoet lo, 1-2 tu ngan, in hoa; khung doc xep 2 dong) / kicker
// (vd "CHƯƠNG 02") / subtitle. TRANG SAU (poster cuoi): page_kicker / page_title / page_subtitle / items (2-4 dong tien do
// tren the). Thuong hieu cua video -> logo + ten tren thanh dau trang sau. Diem day (origin) = net dac day nhat cua chu
// (bien doi khoang cach tren canvas, uu tien gan giua khung) -> chu nao cung xuyen dung lo; ZOOM_MAX tang khi net mong /
// lech tam de lo luon phu kin khung. Khung doc (portrait.mode = 'native'): trang sau bo cuc doc (the gioi logic 1200
// rong phong 1.6x), chu tren ban xep doc to hon, can giua.
import { useBrand, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React, { useId } from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, Grain, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, alpha, springAt, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const LETTERFORM_ZOOM_DURATION = 150;

const L = LOOKS.ember;
const W = 1920;
const PUSH0 = 34;
const PUSH1 = 86;
const PAGE_ZOOM = 0.08; // 页面（后景）总推进量

const GHOSTS = [
  { lag: 3.2, a: 0.12 },
  { lag: 2.4, a: 0.16 },
  { lag: 1.6, a: 0.22 },
  { lag: 0.8, a: 0.3 },
];

const pushCurve = bezier(0.6, 0, 0.85, 0.5); // 慢起陡收：前段让观众看清洞里的页面

// 盖板 scale（帧的纯函数，残影要在不同帧上取样）；Z = 推到底倍率（原版 30，按笔画厚度配）
const plateScale = (f: number, Z: number) => {
  const creep = 1 + 0.03 * ramp(f, 0, 26, EASE.smooth);
  const inhale = 1 - 0.02 * ramp(f, 26, 8, EASE.smooth) * (1 - ramp(f, PUSH0, 8, EASE.out));
  const u = ramp(f, PUSH0, PUSH1 - PUSH0, pushCurve);
  return creep * inhale * Math.pow(Z, u);
};

// 页面 scale：主推期按 0.7·u 跟进，接管后 quint-out 补完剩下 30%（交接处速度连续）
const pageScale = (f: number) => {
  const u = ramp(f, PUSH0, PUSH1 - PUSH0, pushCurve);
  const P = f <= PUSH1 ? 0.7 * u : 0.7 + 0.3 * ramp(f, PUSH1, 30, EASE.out);
  return 1 + PAGE_ZOOM * P;
};

// ───────────── 字形几何 + 推进锚点（自动实测）─────────────
type Glyphs = { lines: string[]; fs: number; ls: number; baselines: number[] };
type Origin = { x: number; y: number; d: number };
const originCache = new Map<string, Origin>();
// 在 1/4 分辨率 canvas 上画字 → 两遍 chamfer 距离变换 → 取"够厚且靠近画面中心"的实心点（洞）
const findOrigin = (g: Glyphs, family: string, H: number): Origin => {
  const key = `${family}|${H}|${g.fs}|${g.lines.join('/')}|${g.baselines.join(',')}`;
  const hit = originCache.get(key);
  if (hit) return hit;
  const k = 0.25;
  const cw = Math.round(W * k);
  const ch = Math.round(H * k);
  let res: Origin = { x: W / 2, y: g.baselines[0] - g.fs * 0.36, d: g.fs * 0.09 };
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `900 ${g.fs * k}px ${family}`;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(g.ls * k).toFixed(2)}px`;
      g.lines.forEach((l, i) => ctx.fillText(l, cw / 2, g.baselines[i] * k));
      const a = ctx.getImageData(0, 0, cw, ch).data;
      const BIG = 1e9;
      const dist = new Float32Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) dist[i] = a[i * 4 + 3] > 200 ? BIG : 0;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const i = y * cw + x;
          if (!dist[i]) continue;
          let v = dist[i];
          if (x > 0) v = Math.min(v, dist[i - 1] + 3);
          if (y > 0) {
            v = Math.min(v, dist[i - cw] + 3);
            if (x > 0) v = Math.min(v, dist[i - cw - 1] + 4);
            if (x < cw - 1) v = Math.min(v, dist[i - cw + 1] + 4);
          }
          if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) v = Math.min(v, 3);
          dist[i] = v;
        }
      let dmax = 0;
      for (let y = ch - 1; y >= 0; y--)
        for (let x = cw - 1; x >= 0; x--) {
          const i = y * cw + x;
          if (!dist[i]) continue;
          let v = dist[i];
          if (x < cw - 1) v = Math.min(v, dist[i + 1] + 3);
          if (y < ch - 1) {
            v = Math.min(v, dist[i + cw] + 3);
            if (x < cw - 1) v = Math.min(v, dist[i + cw + 1] + 4);
            if (x > 0) v = Math.min(v, dist[i + cw - 1] + 4);
          }
          dist[i] = v;
          if (v > dmax) dmax = v;
        }
      // 评分：厚度为主，偏离画面中心扣分（锚点离中线远 → 洞偏在一侧撑开、另一侧盖板久久不退）
      let best = -1e9;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const v = dist[y * cw + x];
          if (v < dmax * 0.55) continue;
          const score = v - dmax * (0.5 * Math.abs(x - cw / 2) / (cw / 2) + 0.25 * Math.abs(y - ch / 2) / (ch / 2));
          if (score > best) {
            best = score;
            res = { x: x / k, y: y / k, d: v / 3 / k };
          }
        }
    }
  }
  originCache.set(key, res);
  return res;
};

// 均衡折行（不留单词孤行）
const balancedWrap = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

// ───────────── 后景：熔金页面（推进后的海报）─────────────
const INK = '#1c0a02'; // 熔金底上的墨色（带暖色相的近黑）

// 页面内容"失焦 → 合焦"：字卡 hold 期内容层完全隐去，字洞里只透出暖色渐变与光斑（读作图像/质感，
// 不与标题字抢）；主推中段 64–90f 内容由 18px 失焦淡入并合焦，接管时已清晰可读。
const REVEAL0 = 64;
const REVEAL_DUR = 26;

type PageText = { brand: string; kicker: string; title: string; subtitle: string; items: string[]; sans: string };
const NextPage: React.FC<{ frame: number; LW: number; LH: number; portrait: boolean; t: PageText }> = ({ frame, LW, LH, portrait, t }) => {
  const reveal = ramp(frame, REVEAL0, REVEAL_DUR, EASE.out);
  const defocus = 18 * (1 - reveal);
  const N = Math.max(1, t.items.length);
  const count = Math.round(N * ramp(frame, 96, 30, EASE.snappy));
  const live = springAt(frame, 124, { damping: 15, stiffness: 240 });
  // 版式
  const PADL = portrait ? 70 : 200;
  const PADR = portrait ? 70 : 230;
  const navY = portrait ? 110 : 122;
  const titleW = portrait ? LW - PADL - PADR : 860;
  // 标题字号阶梯：取第一档能在 maxLines 行内放下的字号，再均衡折行
  const maxL = portrait ? 4 : 3;
  const steps = portrait ? [120, 108, 96, 86, 76, 68] : [140, 124, 110, 98, 88, 78, 70];
  // 优先：字号不太小（≥ 第 4 档）时尽量两行；否则取能放进 maxL 行的最大字号
  const nAt = (sz: number) => wrapLines(t.title, t.sans, sz, titleW, 820, 99).length;
  let tSize = steps.slice(0, 4).find((sz) => nAt(sz) <= 2) ?? steps.find((sz) => nAt(sz) <= maxL) ?? steps[steps.length - 1];
  const tLines = balancedWrap(t.title, t.sans, tSize, titleW, 820, maxL);
  tSize = Math.min(tSize, ...tLines.map((l) => fitSize(l, { family: t.sans, size: tSize, maxWidth: titleW, weight: 820, minSize: 48 })));
  const subSize = 40;
  const subLines = t.subtitle ? balancedWrap(t.subtitle, t.sans, subSize, portrait ? titleW : 720, 480, 3) : [];
  const titleBlockH = (t.kicker ? 60 : 0) + tLines.length * tSize * 1.1 + (subLines.length ? 40 + subLines.length * subSize * 1.3 : 0);
  // 竖屏：标题块 + 卡片整体在导航下方的可用高度里垂直居中
  const cardH = 640;
  const freeTop = navY + 160;
  const pY = Math.max(freeTop, freeTop + (LH - 100 - freeTop - (titleBlockH + 110 + cardH)) / 2);
  const titleY = portrait ? pY : 312 - (tLines.length > 2 ? 60 : 0);
  const CARD = portrait
    ? { x: PADL, y: titleY + titleBlockH + 110, w: LW - PADL - PADR, h: cardH }
    : { x: 1070, y: 282, w: 640, h: 600 };
  const rows = t.items.slice(0, 4);
  const rowFs = Math.min(30, ...rows.map((r) => fitSize(r, { family: t.sans, size: 30, maxWidth: CARD.w - 96 - 110, weight: 650, minSize: 20 })));
  const sun = portrait ? { x: LW * 0.72, y: CARD.y + 300, r: 460 } : { x: 1450, y: 540, r: 520 };
  const cardGlow = portrait ? { x: LW / 2, y: CARD.y + CARD.h / 2 } : { x: 1390, y: 580 };
  const titleGlow = portrait ? { x: LW * 0.4, y: titleY + 200 } : { x: 560, y: 500 };
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: LW, height: LH, overflow: 'hidden', fontFamily: t.sans }}>
      {/* 熔金渐变：左上金 → 中橙 → 右下深赤，一枚太阳光斑垫在卡片背后 */}
      <AbsoluteFill style={{ background: 'linear-gradient(128deg, #ffcf5a 0%, #ff9a3c 34%, #ff6b2c 62%, #c2370e 100%)' }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle ${sun.r}px at ${sun.x}px ${sun.y}px, rgba(255,236,170,0.75) 0%, rgba(255,200,110,0.25) 45%, rgba(255,160,80,0) 72%)` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 20% 100%, rgba(120,20,0,0.35) 0%, rgba(120,20,0,0) 70%)' }} />
      {/* 失焦期的光形：卡片位置一团奶白柔光、标题区一抹暗赤——字洞里只看得到"有光有形"，看不到字 */}
      <AbsoluteFill style={{
        opacity: 1 - reveal,
        background: `radial-gradient(ellipse 380px 340px at ${cardGlow.x}px ${cardGlow.y}px, rgba(255,246,228,0.55) 0%, rgba(255,240,220,0) 100%), ` +
          `radial-gradient(ellipse 520px 260px at ${titleGlow.x}px ${titleGlow.y}px, rgba(110,25,0,0.22) 0%, rgba(110,25,0,0) 100%)`,
      }} />

      {/* 内容层：hold 期隐去，主推中段失焦淡入 → 合焦 */}
      {reveal > 0 && (
      <AbsoluteFill style={{ opacity: reveal, filter: defocus > 0.05 ? `blur(${defocus.toFixed(2)}px)` : undefined }}>
      {/* 导航 */}
      <div style={{ position: 'absolute', left: PADL, right: PADR, top: navY, display: 'flex', alignItems: 'center', color: INK }}>
        {/* App 图标：墨色圆角底 + 反白品牌标志 */}
        <div style={{ width: 46, height: 46, borderRadius: 13, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <ShotcraftMark size={34} tone="dark" />
        </div>
        {t.brand ? <div style={{ fontSize: fitSize(t.brand, { family: t.sans, size: 34, maxWidth: portrait ? 560 : 640, weight: 700, minSize: 20 }), fontWeight: 700, letterSpacing: '0.02em', marginLeft: 16, whiteSpace: 'nowrap' }}>{t.brand}</div> : null}
        <div style={{ flex: 1 }} />
        {!portrait && ['Giới thiệu', 'Tính năng', 'Bảng giá'].map((s) => (
          <div key={s} style={{ ...type(28, 550), fontFamily: t.sans, marginLeft: 48, opacity: 0.72, whiteSpace: 'nowrap' }}>{s}</div>
        ))}
        <div style={{ ...type(28, 650), fontFamily: t.sans, marginLeft: 48, padding: '14px 28px', borderRadius: 999, background: INK, color: '#ffe7c4', whiteSpace: 'nowrap' }}>Bắt đầu</div>
      </div>

      {/* 主标题区 */}
      <div style={{ position: 'absolute', left: PADL, top: titleY, width: titleW, color: INK }}>
        {t.kicker ? <div style={{ ...type(26, 750), fontFamily: t.sans, letterSpacing: '0.16em', opacity: 0.62, whiteSpace: 'nowrap' }}>{t.kicker.toUpperCase()}</div> : null}
        <div style={{ ...type(tSize, 820), fontFamily: t.sans, letterSpacing: '-0.04em', lineHeight: 1.1, marginTop: t.kicker ? 26 : 0 }}>
          {tLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
        {subLines.length ? (
          <div style={{ ...type(subSize, 480), fontFamily: t.sans, lineHeight: 1.3, marginTop: 40, opacity: 0.78 }}>
            {subLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : null}
      </div>

      {/* 进度卡：奶白磨砂玻璃（亮面，透过字洞时整张卡也是亮的）+ 顶部内高光 + 两层暖影 */}
      <div style={{
        position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 32,
        background: 'linear-gradient(180deg, rgba(255,250,242,0.94) 0%, rgba(255,240,224,0.88) 100%)',
        border: `1px solid ${alpha('#ffffff', 0.7)}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 6px 14px rgba(110,30,0,0.18), 0 50px 100px -24px rgba(120,30,0,0.45)`,
        padding: '40px 48px', boxSizing: 'border-box', color: INK,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ ...type(26, 600), fontFamily: t.sans, color: alpha(INK, 0.55) }}>Tiến độ</div>
          <div style={{ flex: 1 }} />
          <div style={{
            ...type(22, 750), fontFamily: t.sans, letterSpacing: '0.12em', padding: '8px 16px', borderRadius: 999,
            background: INK, color: '#ffd46a', display: 'flex', alignItems: 'center', gap: 10,
            transform: `scale(${mix(0.6, 1, live).toFixed(4)})`, opacity: Math.min(1, live * 1.5),
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: '#ffb02e', boxShadow: '0 0 10px #ffb02e' }} />
            XONG
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
          <div style={{ ...type(132, 820), fontFamily: t.sans, letterSpacing: '-0.05em', width: 120, textAlign: 'right' }}>{count}</div>
          <div style={{ ...type(60, 650), fontFamily: t.sans, color: alpha(INK, 0.32), marginLeft: 14 }}>/{N}</div>
          <div style={{ ...type(32, 520), fontFamily: t.sans, color: alpha(INK, 0.6), marginLeft: 22, whiteSpace: 'nowrap' }}>đã hoàn thành</div>
        </div>
        <div style={{ marginTop: 34 }}>
          {rows.map((r, i) => {
            const fill = ramp(frame, 100 + [0, 4, 10, 18][i], 22, EASE.snappy);
            const on = fill > 0.02;
            return (
              <div key={i} style={{ marginTop: i ? 22 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <div style={{ ...type(rowFs, 650), fontFamily: t.sans, whiteSpace: 'nowrap', lineHeight: 1.25 }}>{r}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ ...type(30, 600), fontFamily: t.sans, color: alpha(INK, on ? 0.9 : 0.3) }}>{on ? `${Math.round(fill * 100)}%` : '—'}</div>
                </div>
                <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: alpha(INK, 0.08), overflow: 'hidden' }}>
                  <div style={{ width: `${(fill * 100).toFixed(2)}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${L.accent}, #ffb02e)` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </AbsoluteFill>
      )}
      <Grain opacity={0.05} />
    </div>
  );
};

// ───────────── 前景：挖了字形洞的暖黑盖板 ─────────────
type PlateText = { g: Glyphs; family: string; kicker: string; kickerTop: number; kickerSize: number; subLines: string[]; subTop: number; subSize: number };
const Plate: React.FC<{ scale: number; id: string; H: number; O: Origin; pt: PlateText; ghost?: boolean; blur?: number; intro?: number }> = ({ scale, id, H, O, pt, ghost, blur = 0, intro = 1 }) => {
  const k = 1 / scale; // 线宽 / 模糊半径按 scale 补偿，推进中视觉恒定
  const { g } = pt;
  const titleFont: React.CSSProperties = { fontFamily: pt.family, fontWeight: 900, fontSize: g.fs, letterSpacing: `${g.ls.toFixed(2)}px` };
  const words = (props: React.SVGProps<SVGTextElement>) =>
    g.lines.map((l, i) => (
      <text key={i} x={W / 2} y={g.baselines[i]} textAnchor="middle" style={titleFont} {...props}>{l}</text>
    ));
  return (
    <div style={{
      position: 'absolute', inset: 0, transform: `scale(${scale.toFixed(5)})`, transformOrigin: `${O.x}px ${O.y}px`,
      filter: blur > 0.05 ? `blur(${(blur * k).toFixed(3)}px)` : undefined,
    }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}g`} cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2a1810" />
            <stop offset="45%" stopColor="#150b07" />
            <stop offset="100%" stopColor="#080403" />
          </radialGradient>
          <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={-200} y={-200} width={W + 400} height={H + 400}>
            <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="#fff" />
            {words({ fill: '#000' })}
          </mask>
          {!ghost && (
            <filter id={`${id}f`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation={(16 * k).toFixed(3)} />
            </filter>
          )}
        </defs>
        <g mask={`url(#${id}m)`}>
          <rect x={-200} y={-200} width={W + 400} height={H + 400} fill={`url(#${id}g)`} />
          {!ghost && (
            <>
              {/* 熔光外溢：模糊的橙色描边只画在盖板上——光从字洞里漏到盖板边缘 */}
              {words({ fill: 'none', stroke: L.accent, strokeWidth: 22 * k, opacity: 0.55, filter: `url(#${id}f)` })}
              {/* 切口受光边：1.5px 暖白，读作盖板有厚度 */}
              {words({ fill: 'none', stroke: '#ffd9b0', strokeWidth: 3 * k, opacity: 0.5 })}
            </>
          )}
        </g>
      </svg>
      {!ghost && (
        <>
          {pt.kicker ? (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: pt.kickerTop, textAlign: 'center', color: L.accent, whiteSpace: 'nowrap',
              ...type(pt.kickerSize, 750), fontFamily: pt.family, letterSpacing: `${mix(0.8, 0.42, intro).toFixed(3)}em`, opacity: intro,
            }}>{pt.kicker}</div>
          ) : null}
          {pt.subLines.map((l, i) => (
            <div key={i} style={{
              position: 'absolute', left: 0, right: 0, top: pt.subTop + i * pt.subSize * 1.3, textAlign: 'center', color: L.ink2, ...type(pt.subSize, 480),
              fontFamily: pt.family, lineHeight: 1.3, whiteSpace: 'nowrap', opacity: intro, transform: `translateY(${((1 - intro) * 24).toFixed(2)}px)`,
            }}>
              {l}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export const LetterformZoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const id = `lfz${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const portrait = H > 1080 * 1.2;
  const FAM = fonts.sans;

  // —— 盖板排字：900 字重、字距 −0.02em（原版「EDITS」560px）；横屏 1 行（宽 ≤ 84%），竖屏按词折 ≤3 行放大 ——
  const word = useText('word', 'BÍ QUYẾT').trim().toUpperCase();
  const kickerRaw = useText('kicker', 'Chương 02').trim();
  const subtitle = useText('subtitle', 'Ba bước đơn giản ai cũng làm được').trim();
  const LSE = -0.02;
  const maxW = W * (portrait ? 0.88 : 0.84);
  const fsMax = portrait ? 820 : 560;
  let lines = portrait ? wrapLines(word, FAM, fsMax, maxW, 900, 3) : [word];
  if (portrait && lines.length === 1 && word.includes(' ')) {
    const ws = word.split(/\s+/);
    const h = Math.ceil(ws.length / 2);
    lines = [ws.slice(0, h).join(' '), ws.slice(h).join(' ')];
  }
  const fs = Math.min(...lines.map((l) => fitSize(l, { family: FAM, size: fsMax, maxWidth: maxW, weight: 900, letterSpacingEm: LSE, minSize: 140 })));
  const ls = LSE * fs;
  const cap = fs * 0.72;
  const acc = fs * 0.3; // 大写字母上的叠加声调（Ữ Ậ Ế）高出 ~0.3em
  const lineGap = cap + acc + fs * 0.1;
  const kicker = kickerRaw.toUpperCase();
  // 眉题入场时字距 0.8em → 按入场最宽状态量宽
  const kickerSize = kicker ? fitSize(kicker, { family: FAM, size: portrait ? 52 : 30, maxWidth: W - 220, weight: 750, letterSpacingEm: 0.8, minSize: portrait ? 30 : 20 }) : 30;
  const kickH = kicker ? kickerSize + (portrait ? 90 : 60) : 0;
  const subSize = portrait ? 70 : 44;
  const subLines = subtitle ? balancedWrap(subtitle, FAM, subSize, portrait ? W - 240 : 1500, 480, 2) : [];
  const subGap = fs * 0.2 + (portrait ? 70 : 40); // 下加声调（ặ ộ 的点）在基线下 ~0.2em
  const wordH = acc + cap + (lines.length - 1) * lineGap;
  const blockH = kickH + wordH + (subLines.length ? subGap + subLines.length * subSize * 1.3 : 0);
  const top0 = Math.round(H / 2 - blockH / 2);
  const baselines = lines.map((_, i) => top0 + kickH + acc + cap + i * lineGap);
  const g: Glyphs = { lines, fs, ls, baselines };
  const O = findOrigin(g, FAM, H);
  // 推到底倍率：洞（笔画内切圆半径 d）放大后要盖住离锚点最远的画角（原版 106px 竖笔 ×30）
  const far = Math.hypot(Math.max(O.x, W - O.x), Math.max(O.y, H - O.y));
  const ZOOM_MAX = Math.min(120, Math.max(30, (1.45 * far) / Math.max(8, O.d)));
  const zk = ZOOM_MAX / 30;
  const pt: PlateText = {
    g, family: FAM, kicker, kickerTop: top0, kickerSize,
    subLines, subTop: baselines[baselines.length - 1] + subGap, subSize,
  };

  // —— 后景页面（竖屏：逻辑 1200 宽，等比放大 1.6）——
  const KP = portrait ? 1.6 : 1;
  const LW = W / KP;
  const LH = H / KP;
  const page: PageText = {
    brand: (brand?.name ?? '').trim(),
    kicker: useText('page_kicker', 'Bước 1 · Chuẩn bị').trim(),
    title: useText('page_title', 'Lên kế hoạch trước khi quay').trim(),
    subtitle: useText('page_subtitle', 'Biết rõ mình muốn nói gì, video sẽ gọn và cuốn hơn.').trim(),
    items: useList('items', ['Chọn chủ đề', 'Viết kịch bản', 'Quay thử', 'Dựng và đăng']),
    sans: FAM,
  };

  const s = plateScale(frame, ZOOM_MAX);
  const u = ramp(frame, PUSH0, PUSH1 - PUSH0, pushCurve);
  const plateOpacity = 1 - ramp(s, 14 * zk, 12 * zk, EASE.linear);
  const blur = 20 * ramp(u, 0.35, 0.65, EASE.swift); // 期望视觉模糊（px），组件内按 scale 补偿
  const ghostK = ramp(u, 0.5, 0.2, EASE.out) * plateOpacity;

  // 眉题字距收拢 / 副标升起（第 0 帧字卡已在，文字 2–18f 入场）
  const intro = ramp(frame, 2, 16, EASE.snappy);
  // 接管瞬间页面曝光一闪：+12% 后回落
  const expo = 1 + 0.12 * ramp(frame, 76, 8, EASE.out) * (1 - ramp(frame, 86, 14, EASE.smooth));
  const ps = pageScale(frame);
  // 后景视差横移：页面比盖板慢半拍地向左漂 28px，洞里的内容在"动"，读作纵深而不是贴图
  const drift = 28 * (1 - ramp(frame, 0, 100, EASE.smooth));

  return (
    <AbsoluteFill style={{ background: L.bg[2], overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, transform: `translateX(${drift.toFixed(2)}px) scale(${ps.toFixed(5)})`, transformOrigin: `${O.x}px ${O.y}px`,
        filter: expo > 1.002 ? `brightness(${expo.toFixed(3)})` : undefined,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: LW, height: LH, transform: KP !== 1 ? `scale(${KP})` : undefined, transformOrigin: '0 0' }}>
          <NextPage frame={frame} LW={LW} LH={LH} portrait={portrait} t={page} />
        </div>
      </div>

      {plateOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, opacity: plateOpacity }}>
          {/* 变焦拖影：四层更早 0.8–3.2 帧的盖板（更小倍率），透明度递减叠成径向拖尾 */}
          {ghostK > 0.01 && GHOSTS.map((gh, i) => (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: gh.a * ghostK }}>
              <Plate scale={plateScale(frame - gh.lag, ZOOM_MAX)} id={`${id}g${i}`} H={H} O={O} pt={pt} ghost blur={blur} />
            </div>
          ))}
          <div style={{ position: 'absolute', inset: 0 }}>
            <Plate scale={s} id={id} H={H} O={O} pt={pt} blur={blur} intro={intro} />
          </div>
        </div>
      )}
      {/* 字卡阶段的舞台颗粒（页面接管后由页面自带颗粒） */}
      {plateOpacity > 0 && <Grain opacity={0.08 * plateOpacity} blend="soft-light" />}
    </AbsoluteFill>
  );
};
